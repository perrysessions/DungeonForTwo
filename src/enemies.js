// Enemy archetypes, per-floor scaling, AI, bosses, and floor population.
import { game } from './state.js';
import { rand, randRange, randInt, pick } from './rng.js';
import { enemyShoot, spawnFloater, damageEnemy } from './combat.js';

// behavior: chaser | fast | swarm | ranged | heavy | caster | phasing | tank
const ARCHETYPES = [
  { key: 'slime', name: 'Slime', color: '#5fbf5f', behavior: 'chaser', hp: 30, dmg: 6, speed: 52, radius: 12, minFloor: 1, tier: 1 },
  { key: 'bat', name: 'Bat', color: '#9a6bd8', behavior: 'fast', hp: 18, dmg: 5, speed: 108, radius: 9, minFloor: 1, tier: 1 },
  { key: 'goblin', name: 'Goblin', color: '#93a53a', behavior: 'swarm', hp: 26, dmg: 7, speed: 92, radius: 10, minFloor: 2, tier: 1 },
  { key: 'skeleton', name: 'Skeleton', color: '#dfe3d0', behavior: 'ranged', hp: 32, dmg: 8, speed: 66, radius: 10, minFloor: 3, tier: 2, shootRange: 270, shootSpeed: 210, shootColor: '#e8e8d0' },
  { key: 'orc', name: 'Orc', color: '#3f7f45', behavior: 'heavy', hp: 72, dmg: 14, speed: 72, radius: 13, minFloor: 4, tier: 2 },
  { key: 'cultist', name: 'Cultist', color: '#c0392b', behavior: 'caster', hp: 42, dmg: 11, speed: 62, radius: 11, minFloor: 5, tier: 2, shootRange: 300, shootSpeed: 230, shootColor: '#ff5a7a' },
  { key: 'wraith', name: 'Wraith', color: '#4fd0c0', behavior: 'phasing', hp: 48, dmg: 12, speed: 98, radius: 11, minFloor: 6, tier: 3 },
  { key: 'golem', name: 'Golem', color: '#8a8f98', behavior: 'tank', hp: 150, dmg: 18, speed: 54, radius: 15, minFloor: 7, tier: 3 },
];

const BOSSES = {
  3:  { key: 'trollwarchief', name: 'Troll Warchief', color: '#6aaf3a', behavior: 'heavy', hp: 260, dmg: 14, speed: 68, radius: 20,
        minionDef: 'goblin', minionCount: 2, minionInterval: 9 },
  5:  { key: 'goblinking', name: 'Goblin King', color: '#c8b020', behavior: 'heavy', hp: 420, dmg: 20, speed: 78, radius: 22,
        minionDef: 'goblin', minionCount: 3, minionInterval: 8 },
  10: { key: 'bonelord', name: 'Bone Lord', color: '#e8e8d0', behavior: 'boss_ranged', hp: 820, dmg: 22, speed: 60, radius: 24, shootSpeed: 260, shootColor: '#fff0c0',
        minionDef: 'skeleton', minionCount: 2, minionInterval: 10 },
  15: { key: 'wraithqueen', name: 'Wraith Queen', color: '#5fe0d0', behavior: 'boss_phasing', hp: 1500, dmg: 26, speed: 100, radius: 24, shootSpeed: 300, shootColor: '#a0ffe0',
        minionDef: 'wraith', minionCount: 2, minionInterval: 9 },
  20: { key: 'devourer', name: 'The Devourer', color: '#a02060', behavior: 'boss_ranged', hp: 3200, dmg: 34, speed: 74, radius: 30, shootSpeed: 320, shootColor: '#ff60a0',
        minionDef: 'cultist', minionCount: 3, minionInterval: 7 },
};

export class Enemy {
  constructor(def, floor, x, y, isBoss = false) {
    // Enemies are tankier and hit harder than before.
    const HP_BOOST = 1.45, DMG_BOOST = 1.4;
    const hpMul = (1 + 0.34 * (floor - 1)) * HP_BOOST;
    const dmgMul = (1 + 0.26 * (floor - 1)) * DMG_BOOST;
    this.def = def;
    this.key = def.key;
    this.name = def.name;
    this.color = def.color;
    this.behavior = def.behavior;
    this.isBoss = isBoss;
    this.x = x; this.y = y;
    this.radius = def.radius;
    this.maxHp = Math.round(def.hp * (isBoss ? 1 : hpMul));
    this.hp = this.maxHp;
    this.dmg = Math.round(def.dmg * (isBoss ? (1 + 0.12 * (floor - 1)) * DMG_BOOST : dmgMul));
    this.speed = def.speed;
    this.shootRange = def.shootRange || 300;
    this.shootSpeed = def.shootSpeed || 240;
    this.shootColor = def.shootColor || '#ff5a7a';
    this.tierRank = isBoss ? 3 : def.tier;
    this.contactTimer = 0;
    this.shootTimer = randRange(0.4, 1.4);
    this.hitFlash = 0;
    this.wobble = rand() * Math.PI * 2;
    this.dead = false;
    // Bosses and phasing enemies are always alert; others must gain LOS first.
    this.alert = isBoss || def.behavior === 'phasing' || def.behavior === 'boss_phasing';
    this.alertTimer = 0; // keeps alert briefly after losing LOS
    // Boss-only fields
    this.phase2 = false;
    this.minionTimer = (def.minionInterval || 10) * 0.5; // first wave comes sooner
    // rewards — scaled down since there are ~3x as many enemies now, so the
    // per-floor totals of xp/gold/loot stay about the same (just harder).
    const REWARD_SCALE = 1 / 3;
    const power = def.hp * 0.5 + def.dmg;
    this.xpValue = Math.max(1, Math.round(power * (1 + 0.25 * (floor - 1)) * (isBoss ? 6 : def.tier) * (isBoss ? 1 : REWARD_SCALE)));
    this.goldValue = Math.max(1, Math.round((5 + def.dmg) * (1 + 0.20 * (floor - 1)) * (isBoss ? 12 : 1) * (isBoss ? 1 : REWARD_SCALE)));
    this.burn = null;
    this.slow = null;
  }

  update(dt) {
    if (this.dead) return;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.contactTimer > 0) this.contactTimer -= dt;
    if (this.shootTimer > 0) this.shootTimer -= dt;
    if (this.alertTimer > 0) this.alertTimer -= dt;

    // status effects
    let speedFactor = 1;
    if (this.burn) {
      this.hp -= this.burn.dps * dt;
      this.burn.time -= dt;
      if (this.burn.time <= 0) this.burn = null;
      if (this.hp <= 0) { damageEnemy(this, 0, {}); return; }
    }
    if (this.slow) {
      speedFactor = 1 - this.slow.factor;
      this.slow.time -= dt;
      if (this.slow.time <= 0) this.slow = null;
    }

    // Boss phase 2 enrage and minion spawning
    if (this.isBoss && this.def.minionDef) {
      this.minionTimer -= dt;
      const interval = this.phase2
        ? (this.def.minionInterval || 10) * 0.55
        : (this.def.minionInterval || 10);
      if (this.minionTimer <= 0) {
        this.minionTimer = interval;
        this._spawnMinions();
      }
      if (!this.phase2 && this.hp <= this.maxHp * 0.5) {
        this.phase2 = true;
        this.speed = Math.round(this.speed * 1.4);
        this.dmg = Math.round(this.dmg * 1.35);
        this.shootSpeed = Math.round((this.shootSpeed || 240) * 1.25);
        this.minionTimer = 0; // immediate minion wave on enrage
        game._bossEnrage = true; // picked up by main.js for the message
      }
    }

    const target = this._nearestPlayer();
    if (!target) return;
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist, ny = dy / dist;
    const phasing = this.behavior === 'phasing' || this.behavior === 'boss_phasing';

    // LOS aggro: become alert when a player is visible; stay alert briefly after losing sight.
    if (!this.alert) {
      const LOS_RANGE = 320;
      if (dist <= LOS_RANGE && game.map.lineClear(this.x, this.y, target.x, target.y)) {
        this.alert = true;
      }
    } else if (this.alertTimer <= 0) {
      // lose sight check — remain alert for 3s after last clear LOS
      if (game.map.lineClear(this.x, this.y, target.x, target.y)) {
        this.alertTimer = 3;
      } else if (this.alertTimer <= 0) {
        // lost sight and grace period expired — go idle
        this.alert = false;
      }
    }

    if (!this.alert) return; // idle: stand still until spotted

    const ranged = ['ranged', 'caster', 'boss_ranged'].includes(this.behavior);
    let move = { x: 0, y: 0 };
    if (ranged) {
      const desired = this.shootRange * 0.65;
      if (dist > this.shootRange) { move = { x: nx, y: ny }; }
      else if (dist < desired * 0.6) { move = { x: -nx, y: -ny }; }
      else { move = { x: -ny * 0.4, y: nx * 0.4 }; } // strafe
      if (dist <= this.shootRange && this.shootTimer <= 0) {
        this.shootTimer = this.behavior === 'boss_ranged' ? randRange(1.2, 1.8) : randRange(1.0, 1.8);
        this._shoot(target);
      }
    } else {
      move = { x: nx, y: ny };
      if (this.behavior === 'fast') {
        this.wobble += dt * 6;
        move.x += Math.cos(this.wobble) * 0.5;
        move.y += Math.sin(this.wobble) * 0.5;
      }
    }

    // Separation: nudge away from nearby enemies to prevent clumping.
    let sepX = 0, sepY = 0;
    for (const other of game.enemies) {
      if (other === this || other.dead) continue;
      const ox = this.x - other.x, oy = this.y - other.y;
      const od = Math.hypot(ox, oy) || 1;
      const minDist = this.radius + other.radius + 4;
      if (od < minDist) {
        const push = (minDist - od) / minDist;
        sepX += (ox / od) * push;
        sepY += (oy / od) * push;
      }
    }
    move.x += sepX * 1.2;
    move.y += sepY * 1.2;

    const spd = this.speed * speedFactor;
    let mvx = move.x * spd * dt, mvy = move.y * spd * dt;
    if (phasing) { this.x += mvx; this.y += mvy; }
    else {
      const canX = !game.map.worldSolid(this.x + mvx, this.y);
      const canY = !game.map.worldSolid(this.x, this.y + mvy);
      if (canX) this.x += mvx; else {
        // slide along wall by trying a perpendicular nudge
        this.wobble += dt * 4;
        const slide = Math.sign(mvy || Math.cos(this.wobble)) * spd * dt * 0.6;
        if (!game.map.worldSolid(this.x, this.y + slide)) this.y += slide;
      }
      if (canY) this.y += mvy; else {
        this.wobble += dt * 4;
        const slide = Math.sign(mvx || Math.sin(this.wobble)) * spd * dt * 0.6;
        if (!game.map.worldSolid(this.x + slide, this.y)) this.x += slide;
      }
    }

    // contact damage
    if (dist <= this.radius + target.radius + 2 && this.contactTimer <= 0) {
      this.contactTimer = 0.8;
      const dealt = target.takeDamage(this.dmg);
      if (dealt) spawnFloater(target.x, target.y - 18, String(dealt), '#ff6060');
    }
  }

  _shoot(target) {
    if (this.behavior === 'boss_ranged') {
      // volley of 5
      const base = Math.atan2(target.y - this.y, target.x - this.x);
      for (let i = -2; i <= 2; i++) {
        const ang = base + i * 0.22;
        game.projectiles.push({
          x: this.x, y: this.y, vx: Math.cos(ang) * this.shootSpeed, vy: Math.sin(ang) * this.shootSpeed,
          dmg: this.dmg, team: 'enemy', owner: this, radius: 7, life: 3.5, color: this.shootColor, hit: new Set(),
        });
      }
    } else {
      enemyShoot(this, target, this.shootSpeed, this.dmg, this.shootColor);
    }
  }

  _spawnMinions() {
    const minionKey = this.def.minionDef;
    const archetype = ARCHETYPES.find(a => a.key === minionKey) || ARCHETYPES[0];
    const count = this.phase2
      ? Math.ceil((this.def.minionCount || 2) * 1.5)
      : (this.def.minionCount || 2);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i / count) + rand() * 0.5;
      // Walk outward from boss until we find an open tile, up to 160px out.
      let mx = this.x, my = this.y;
      for (let r = this.radius + 16; r <= 160; r += 8) {
        const cx = this.x + Math.cos(angle) * r;
        const cy = this.y + Math.sin(angle) * r;
        if (!game.map.worldSolid(cx, cy)) { mx = cx; my = cy; break; }
      }
      // If still solid (fully walled in), skip this minion.
      if (game.map.worldSolid(mx, my)) continue;
      const e = new Enemy(archetype, game.floor, mx, my, false);
      e.alert = true; // summoned enemies are immediately aggressive
      game.enemies.push(e);
    }
    // visual burst
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2, s = 50 + rand() * 100;
      game.particles.push({
        x: this.x, y: this.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + rand() * 0.3, color: this.color, r: 3 + rand() * 3,
        block: true, drag: 0.88,
      });
    }
  }

  _nearestPlayer() {
    let best = null, bd = 1e9;
    for (const p of game.players) {
      if (p.downed) continue;
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}

export function isBossFloor(floor) {
  return !!BOSSES[floor];
}

// Populate a floor. On boss floors this spawns ONLY the smaller adds — the boss
// itself is held back and summoned later via spawnBoss() once the adds die.
export function spawnFloorEnemies(floor, dungeon) {
  const list = [];
  const available = ARCHETYPES.filter(a => a.minFloor <= floor);
  const rooms = dungeon.rooms.slice(1); // not the start room

  if (isBossFloor(floor)) {
    const adds = (3 + Math.floor(floor / 5)) * 3;
    for (let i = 0; i < adds; i++) {
      const room = pick(rooms.length ? rooms : dungeon.rooms);
      const p = dungeon.randomFloorPointInRoom(room);
      list.push(new Enemy(pick(available), floor, p.x, p.y));
    }
  } else {
    const count = Math.min(72, Math.round((4 + floor * 1.3) * 3));
    for (let i = 0; i < count; i++) {
      const room = pick(rooms.length ? rooms : dungeon.rooms);
      const p = dungeon.randomFloorPointInRoom(room);
      list.push(new Enemy(pick(available), floor, p.x, p.y));
    }
  }
  return list;
}

// Summon the floor boss at the room farthest from the players (dramatic entrance).
export function spawnBoss(floor, dungeon, players) {
  let far = dungeon.rooms[0], best = -1;
  const mx = players.reduce((s, p) => s + p.x, 0) / players.length;
  const my = players.reduce((s, p) => s + p.y, 0) / players.length;
  for (const r of dungeon.rooms) {
    const c = dungeon.roomCenterWorld(r);
    const d = Math.hypot(c.x - mx, c.y - my);
    if (d > best) { best = d; far = r; }
  }
  const c = dungeon.roomCenterWorld(far);
  return new Enemy(BOSSES[floor], floor, c.x, c.y, true);
}
