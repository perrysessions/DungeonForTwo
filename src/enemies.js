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
  5: { key: 'goblinking', name: 'Goblin King', color: '#c8b020', behavior: 'heavy', hp: 420, dmg: 20, speed: 78, radius: 22 },
  10: { key: 'bonelord', name: 'Bone Lord', color: '#e8e8d0', behavior: 'boss_ranged', hp: 820, dmg: 22, speed: 60, radius: 24, shootSpeed: 260, shootColor: '#fff0c0' },
  15: { key: 'wraithqueen', name: 'Wraith Queen', color: '#5fe0d0', behavior: 'boss_phasing', hp: 1500, dmg: 26, speed: 100, radius: 24, shootSpeed: 300, shootColor: '#a0ffe0' },
  20: { key: 'devourer', name: 'The Devourer', color: '#a02060', behavior: 'boss_ranged', hp: 3200, dmg: 34, speed: 74, radius: 30, shootSpeed: 320, shootColor: '#ff60a0' },
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

    const target = this._nearestPlayer();
    if (!target) return;
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist, ny = dy / dist;
    const phasing = this.behavior === 'phasing' || this.behavior === 'boss_phasing';

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
        // erratic wobble
        this.wobble += dt * 6;
        move.x += Math.cos(this.wobble) * 0.5;
        move.y += Math.sin(this.wobble) * 0.5;
      }
    }

    const spd = this.speed * speedFactor;
    let mvx = move.x * spd * dt, mvy = move.y * spd * dt;
    if (phasing) { this.x += mvx; this.y += mvy; }
    else {
      if (!game.map.worldSolid(this.x + mvx, this.y)) this.x += mvx;
      if (!game.map.worldSolid(this.x, this.y + mvy)) this.y += mvy;
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
  return floor % 5 === 0 && !!BOSSES[floor];
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
