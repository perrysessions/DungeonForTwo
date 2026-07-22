// Combat: basic attacks, projectiles, class abilities, status effects, minions, damage.
import { game, addShake } from './state.js';
import { playSfx } from './audio.js';
import { rand, randRange, chance } from './rng.js';
import { rollLoot, generateEquipment, makePotion, tierForFloor, RARITIES } from './items.js';

function safePos(x, y) {
  if (!game.map.worldSolid(x, y)) return { x, y };
  for (let r = 16; r <= 96; r += 16) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
      if (!game.map.worldSolid(cx, cy)) return { x: cx, y: cy };
    }
  }
  return { x, y };
}

// Direction toward the nearest living enemy with a CLEAR line of sight (no
// walls in the way), so shots don't just splat into barriers. Falls back to the
// nearest enemy overall, then to the player's facing.
export function nearestEnemyDir(player) {
  let bestClear = null, bdClear = 1e9;
  let bestAny = null, bdAny = 1e9;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < bdAny) { bdAny = d; bestAny = e; }
    if (d < bdClear && game.map.lineClear(player.x, player.y, e.x, e.y)) {
      bdClear = d; bestClear = e;
    }
  }
  const target = bestClear || bestAny;
  if (!target) return { ...player.facing };
  return normalize(target.x - player.x, target.y - player.y);
}

// ---- helpers ------------------------------------------------------------
export function spawnFloater(x, y, text, color = '#fff', big = false) {
  game.floaters.push({ x, y, text, color, life: 0.9, vy: -34, big });
}
function spawnParticles(x, y, color, n = 6, spd = 90) {
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    game.particles.push({
      x, y, vx: Math.cos(a) * spd * randRange(0.3, 1), vy: Math.sin(a) * spd * randRange(0.3, 1),
      life: randRange(0.25, 0.5), color, r: randRange(1.5, 3.5),
    });
  }
}

// Chunky pixel "explosion" when an enemy dies — blocky shards of its own color.
function deathBurst(enemy) {
  const n = enemy.isBoss ? 30 : 14;
  const spd = enemy.isBoss ? 220 : 150;
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const s = randRange(0.4, 1);
    game.particles.push({
      x: enemy.x + randRange(-enemy.radius, enemy.radius),
      y: enemy.y + randRange(-enemy.radius, enemy.radius),
      vx: Math.cos(a) * spd * s, vy: Math.sin(a) * spd * s,
      life: randRange(0.35, 0.7), color: rand() < 0.25 ? '#ffffff' : enemy.color,
      r: randRange(2, 5), block: true, drag: 0.9,
    });
  }
  // brief flash ring
  game.particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.22, color: enemy.color, r: enemy.radius * 1.6, ring: true, ringLife: 0.22 });
}

function normalize(x, y) {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}

function rollDamage(player, mult = 1) {
  let dmg = player.stats.attackDamage * mult * player.stats.damageMult;
  const crit = rand() < player.stats.critChance;
  if (crit) dmg *= player.stats.critMult;
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}

function createProjectile(opts) {
  game.projectiles.push({
    x: opts.x, y: opts.y, vx: opts.vx, vy: opts.vy,
    dmg: opts.dmg, crit: !!opts.crit, team: opts.team, owner: opts.owner || null,
    radius: opts.radius || 5, pierce: opts.pierce || 0, life: opts.life || 1.5,
    color: opts.color || '#ffd060', hit: new Set(),
    explode: opts.explode || null, status: opts.status || null,
  });
}

// ---- damage application -------------------------------------------------
export function damageEnemy(enemy, amount, opts = {}) {
  if (enemy.dead) return;
  enemy.hp -= amount;
  enemy.hitFlash = 0.12;
  enemy.alert = true;
  if (amount > 0) playSfx('hit', 0.4);
  if (amount > 0)
    spawnFloater(enemy.x, enemy.y - enemy.radius, String(amount), opts.crit ? '#ffe23a' : '#ffffff', opts.crit);
  if (opts.knockback && opts.dir) {
    const kx = enemy.x + opts.dir.x * opts.knockback * 0.3;
    const ky = enemy.y + opts.dir.y * opts.knockback * 0.3;
    if (!game.map.worldSolid(kx, enemy.y)) enemy.x = kx;
    if (!game.map.worldSolid(enemy.x, ky)) enemy.y = ky;
  }
  if (opts.burn) enemy.burn = { dps: opts.burn, time: 3 };
  if (opts.slow) enemy.slow = { factor: opts.slow, time: opts.slowTime || 2.5 };
  if (opts.source && opts.source.mods && opts.source.mods.lifesteal > 0) {
    const heal = Math.round(amount * opts.source.mods.lifesteal);
    if (heal > 0 && !opts.source.downed) {
      opts.source.hp = Math.min(opts.source.stats.maxHp, opts.source.hp + heal);
    }
  }
  if (enemy.hp <= 0) killEnemy(enemy, opts.source);
}

function killEnemy(enemy, source) {
  if (enemy.dead) return;
  enemy.dead = true;
  deathBurst(enemy);
  addShake(enemy.isBoss ? 12 : 3.2);
  playSfx(enemy.isBoss ? 'floor_clear' : 'hit', enemy.isBoss ? 1.0 : 0.5);
  // Combo tracking
  if (!enemy.isBoss) {
    game.comboTimer = 1.8; // window resets on each kill
    game.comboCount = (game.comboCount || 0) + 1;
    if (game.comboCount >= 2) {
      let bonus = 0, label = '';
      if (game.comboCount === 2) { bonus = 200; label = 'DOUBLE KILL'; }
      else if (game.comboCount === 3) { bonus = 500; label = 'TRIPLE KILL'; }
      else { bonus = 1000; label = `RAMPAGE ×${game.comboCount}`; }
      game.comboBonusTotal = (game.comboBonusTotal || 0) + bonus;
      game.comboText = { label: `+${bonus} ${label}`, alpha: 1.0 };
    }
  }
  // Gold drop -> pickup.
  const gpos = safePos(enemy.x, enemy.y);
  game.pickups.push({
    kind: 'gold', x: gpos.x, y: gpos.y, amount: enemy.goldValue,
    vx: randRange(-40, 40), vy: randRange(-40, 40), life: 30, r: 6,
  });
  // Loot.
  if (enemy.isBoss) {
    // Guaranteed: 2 equipment drops (rarity boosted by floor) + 1 potion.
    const floor = game.floor;
    const tier = tierForFloor(floor);
    // Pick a forced rarity skewed toward higher tiers based on floor depth.
    const bossRarityKey = () => {
      const r = rand();
      if (floor >= 14 && r < 0.35) return 'mythic';
      if (floor >= 9  && r < 0.50) return 'legendary';
      if (floor >= 5  && r < 0.65) return 'rare';
      if (r < 0.55) return 'uncommon';
      return 'common';
    };
    for (let i = 0; i < 2; i++) {
      const item = generateEquipment(tier, floor, bossRarityKey());
      const ipos = safePos(enemy.x + randRange(-20, 20), enemy.y + randRange(-20, 20));
      game.pickups.push({ kind: 'item', item, x: ipos.x, y: ipos.y, vx: randRange(-40, 40), vy: randRange(-40, 40), life: 60, r: 8 });
    }
    const potion = makePotion(rand() < 0.6 ? 'health' : 'mana');
    const ppos = safePos(enemy.x + randRange(-20, 20), enemy.y + randRange(-20, 20));
    game.pickups.push({ kind: 'item', item: potion, x: ppos.x, y: ppos.y, vx: randRange(-40, 40), vy: randRange(-40, 40), life: 60, r: 8 });
  } else {
    for (const d of rollLoot(game.floor, enemy.tierRank || 1)) {
      const ipos = safePos(enemy.x + randRange(-8, 8), enemy.y + randRange(-8, 8));
      game.pickups.push({ kind: 'item', item: d.item, x: ipos.x, y: ipos.y, vx: randRange(-30, 30), vy: randRange(-30, 30), life: 40, r: 8 });
    }
  }
  // XP: full to killer, small share to the other living player.
  if (source && source.gainXp) {
    source.gainXp(enemy.xpValue);
    const other = game.players.find(p => p !== source && !p.downed);
    if (other) other.gainXp(Math.round(enemy.xpValue * 0.5));
    passiveOnKill(source, enemy);
  } else {
    for (const p of game.players) if (!p.downed) p.gainXp(Math.round(enemy.xpValue * 0.5));
  }
}

// ---- class passives (triggered on kill; rank comes from the class passive node) ----
export function passiveOnKill(player, enemy) {
  const rank = player.passiveRank || 0;
  const passiveId = player.cls.passiveId;
  if (!rank || !passiveId) return;
  switch (passiveId) {
    case 'w_pass': { // Bloodlust — heal on kill
      const h = Math.round(player.stats.maxHp * 0.02 * rank);
      if (!player.downed) player.hp = Math.min(player.stats.maxHp, player.hp + h);
      break;
    }
    case 'r_pass': player.momentumT = 3; break; // Momentum — speed burst
    case 'g_pass': // Killing Spree — chance to reset dash + speed burst
      if (rand() < 0.12 * rank) player.abilityTimer = 0;
      player.momentumT = 2;
      break;
    case 'f_pass': { // Conflagration — fiery blast at the corpse
      const radius = 42 + 16 * rank;
      const dmg = Math.max(1, Math.round(player.stats.attackDamage * 0.4 * rank * player.stats.damageMult));
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - enemy.x, e.y - enemy.y) <= radius + e.radius &&
            game.map.lineClear(enemy.x, enemy.y, e.x, e.y))
          damageEnemy(e, dmg, { source: player, burn: player.stats.attackDamage * 0.25 * rank });
      }
      spawnParticles(enemy.x, enemy.y, '#ff7020', 10, 130);
      break;
    }
    case 'i_pass': { // Frostbite — chilling burst
      const radius = 48 + 15 * rank;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - enemy.x, e.y - enemy.y) <= radius + e.radius &&
            game.map.lineClear(enemy.x, enemy.y, e.x, e.y))
          e.slow = { factor: 0.3 + 0.05 * rank, time: 2 };
      }
      spawnParticles(enemy.x, enemy.y, '#a0e0ff', 8, 90);
      break;
    }
    case 'c_pass':
    case 'p_pass': { // Renewal / Retribution — heal both heroes
      const h = Math.round(player.stats.maxHp * 0.015 * rank);
      for (const p of game.players) if (!p.downed) p.hp = Math.min(p.stats.maxHp, p.hp + h);
      if (passiveId === 'p_pass') spawnParticles(player.x, player.y, '#ffe680', 6, 80);
      break;
    }
    case 'n_pass': { // Undying Legion — free wraith minion every few kills
      player._passiveKills = (player._passiveKills || 0) + 1;
      const need = Math.max(2, 6 - rank);
      if (player._passiveKills >= need) { player._passiveKills = 0; spawnFreeMinion(player); }
      break;
    }
  }
}

// Melee arc: hit enemies within range and (optionally) within facing cone.
function meleeHit(player, range, mult, { full = false, knockback = 0, source, aim } = {}) {
  const f = aim || player.facing;
  let hitAny = false;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const dx = e.x - player.x, dy = e.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range + e.radius) continue;
    if (!full) {
      const nd = normalize(dx, dy);
      if (nd.x * f.x + nd.y * f.y < 0.35) continue; // ~110° cone
    }
    if (!game.map.lineClear(player.x, player.y, e.x, e.y)) continue;
    const { dmg, crit } = rollDamage(player, mult);
    damageEnemy(e, dmg, { crit, source: source || player, knockback, dir: normalize(dx, dy) });
    hitAny = true;
  }
  return hitAny;
}

// ---- basic attack -------------------------------------------------------
export function basicAttack(player) {
  player.attackTimer = player.stats.attackCooldown;
  // Auto-aim at the nearest enemy; fall back to facing when none in sight.
  const f = nearestEnemyDir(player);
  if (player.stats.weaponType === 'melee') {
    player.swing = { t: 0.18, max: 0.18, dir: { ...f } };
    meleeHit(player, player.stats.attackRange, 1, {
      knockback: player.mods.knockback, source: player, aim: f,
    });
  } else {
    const count = player.stats.projectileCount;
    const spread = (count - 1) * 0.12;
    for (let i = 0; i < count; i++) {
      const ang = Math.atan2(f.y, f.x) + (-spread / 2 + (count > 1 ? spread * i / (count - 1) : 0));
      const { dmg, crit } = rollDamage(player, 1);
      createProjectile({
        x: player.x, y: player.y,
        vx: Math.cos(ang) * player.stats.projectileSpeed,
        vy: Math.sin(ang) * player.stats.projectileSpeed,
        dmg, crit, team: 'player', owner: player, pierce: player.stats.pierce,
        radius: 5, life: player.stats.attackRange / player.stats.projectileSpeed + 0.1,
        color: projColor(player),
      });
    }
  }
}

function projColor(player) {
  const key = player.cls.key;
  if (key === 'firemage') return '#ff7020';
  if (key === 'frostmage') return '#80d0ff';
  if (key === 'necromancer') return '#8ce0a0';
  if (key === 'cleric') return '#ffe680';
  return '#ffd060';
}

// ---- abilities ----------------------------------------------------------
// Abilities are now mana-gated, not cooldown-gated.
// The tiny lock just prevents firing 60x/frame while the button is held.
const ABILITY_CD = {
  cleave: 0.15, multishot: 0.15, fireball: 0.15, raiseMinion: 0.15,
  healAura: 0.15, dash: 0.15, smite: 0.15, frostNova: 0.15,
};

export function useAbility(player) {
  const cost = player.cls.abilityCost;
  if (player.abilityTimer > 0 || player.mana < cost || player.downed) return false;
  const id = player.cls.ability;
  player.mana -= cost;
  let cd = ABILITY_CD[id] || 1.5;
  if (id === 'dash') cd *= (1 - player.mods.dashCd);
  cd *= (1 - (player.mods.castSpeed || 0));
  player.abilityTimer = cd;
  playSfx(['cleave','dash','smite'].includes(id) ? 'sword_ability' : 'ability');
  ABILITIES[id](player);
  return true;
}

const ABILITIES = {
  cleave(player) {
    const range = player.stats.attackRange * (1.7 + player.mods.cleaveSize);
    player.swing = { t: 0.24, max: 0.24, dir: { ...player.facing }, big: true };
    spawnParticles(player.x, player.y, '#ffd060', 12, 140);
    meleeHit(player, range, 2.2, { full: true, knockback: 60 + player.mods.knockback, source: player });
  },
  multishot(player) {
    const f = nearestEnemyDir(player);
    const count = 3 + Math.floor((player.stats.projectileCount - 1));
    const spread = 0.55;
    for (let i = 0; i < count; i++) {
      const ang = Math.atan2(f.y, f.x) + (-spread / 2 + spread * i / (count - 1));
      const { dmg, crit } = rollDamage(player, 1.4);
      createProjectile({
        x: player.x, y: player.y,
        vx: Math.cos(ang) * player.stats.projectileSpeed,
        vy: Math.sin(ang) * player.stats.projectileSpeed,
        dmg, crit, team: 'player', owner: player, pierce: player.stats.pierce + 1,
        radius: 5, life: 1.2, color: '#c8ff90',
      });
    }
  },
  fireball(player) {
    const f = nearestEnemyDir(player);
    const { dmg, crit } = rollDamage(player, 1.6);
    createProjectile({
      x: player.x, y: player.y, vx: f.x * 300, vy: f.y * 300,
      dmg, crit, team: 'player', owner: player, radius: 9, life: 1.6, color: '#ff6020',
      explode: {
        radius: 70 * (1 + player.mods.blastRadius),
        burn: player.stats.attackDamage * (0.4 + player.mods.burn),
        source: player,
      },
    });
  },
  raiseMinion(player) {
    const max = player.mods.minions;
    const mine = game.minions.filter(m => m.owner === player && !m.free); // free minions ignore the cap
    if (mine.length >= max) {
      game.minions.splice(game.minions.indexOf(mine[0]), 1);
    }
    game.minions.push(makeMinion(player));
    spawnParticles(player.x, player.y, '#8ce0a0', 12, 90);
  },
  healAura(player) {
    const radius = 150 * (1 + player.mods.auraRadius);
    const amount = Math.round(player.stats.maxHp * (0.18 + player.mods.healPower * 0.18) + 12);
    for (const p of game.players) {
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d <= radius && !p.downed) {
        p.hp = Math.min(p.stats.maxHp, p.hp + amount);
        spawnFloater(p.x, p.y - 20, `+${amount}`, '#7bff9b');
      }
    }
    spawnParticles(player.x, player.y, '#fff0a0', 18, 110);
  },
  dash(player) {
    const f = player.facing;
    player.dashTimer = 0.22;
    player.dashDir = { ...f };
    player.invuln = Math.max(player.invuln, 0.24);
    // damage enemies along the dash next few frames handled by dash movement in main;
    // apply an immediate burst hit around path start:
    meleeHit(player, player.stats.attackRange * 1.4, 1.6, { full: true, source: player });
  },
  smite(player) {
    player.swing = { t: 0.22, max: 0.22, dir: { ...player.facing }, big: true };
    const heal = Math.round(player.stats.maxHp * (0.06 + player.mods.healPower * 0.1) + 6);
    player.hp = Math.min(player.stats.maxHp, player.hp + heal);
    spawnFloater(player.x, player.y - 20, `+${heal}`, '#7bff9b');
    meleeHit(player, player.stats.attackRange * 1.3, 2.0 + player.mods.holy, { full: true, source: player });
    spawnParticles(player.x, player.y, '#ffe680', 12, 120);
  },
  frostNova(player) {
    const radius = 130 * (1 + player.mods.slowRadius);
    const { dmg } = rollDamage(player, 1.0);
    for (const e of game.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= radius && game.map.lineClear(player.x, player.y, e.x, e.y)) {
        damageEnemy(e, dmg, { source: player, slow: 0.45 + player.mods.slowPower, slowTime: 3 });
      }
    }
    spawnParticles(player.x, player.y, '#a0e0ff', 20, 130);
    player.novaFx = { t: 0.3, max: 0.3, radius };
  },
};

// ---- minions ------------------------------------------------------------
function makeMinion(owner) {
  const dmg = Math.round(owner.stats.attackDamage * (0.6 + owner.mods.minionDmg) * owner.stats.damageMult);
  const hp = Math.round(40 * (1 + owner.mods.minionHp) + owner.level * 4);
  const ox = randRange(-16, 16), oy = randRange(-16, 16);
  return {
    owner, x: owner.x + ox, y: owner.y + oy,
    hp, maxHp: hp, dmg, radius: 9, attackTimer: 0, life: 20, color: '#bfeccb', free: false,
    orbitAngle: Math.atan2(oy, ox),
  };
}

// Necromancer "Undying Legion" passive minion: same stats as skill minions, distinct color, ignores cap.
function spawnFreeMinion(owner) {
  const dmg = Math.round(owner.stats.attackDamage * (0.6 + owner.mods.minionDmg) * owner.stats.damageMult);
  const hp = Math.round(40 * (1 + owner.mods.minionHp) + owner.level * 4);
  const ox = randRange(-18, 18), oy = randRange(-18, 18);
  game.minions.push({
    owner, x: owner.x + ox, y: owner.y + oy,
    hp, maxHp: hp, dmg, radius: 9, attackTimer: 0, life: 24, color: '#c060ff', free: true,
    orbitAngle: Math.atan2(oy, ox),
  });
  spawnParticles(owner.x, owner.y, '#c060ff', 12, 100);
}

const MINION_ORBIT_RADIUS = 75;
const MINION_DETECT_RANGE = 210;

export function updateMinions(dt) {
  for (const m of game.minions) {
    m.life -= dt;
    if (m.attackTimer > 0) m.attackTimer -= dt;

    // find nearest enemy with LOS within detection range
    let target = null, best = MINION_DETECT_RANGE;
    for (const e of game.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - m.x, e.y - m.y);
      if (d < best && game.map.lineClear(m.x, m.y, e.x, e.y)) { best = d; target = e; }
    }

    if (target) {
      // attack mode: charge the enemy
      const n = normalize(target.x - m.x, target.y - m.y);
      if (best > m.radius + target.radius + 2) {
        const nx = m.x + n.x * 120 * dt, ny = m.y + n.y * 120 * dt;
        if (!game.map.worldSolid(nx, ny)) { m.x = nx; m.y = ny; }
      } else if (m.attackTimer <= 0) {
        m.attackTimer = 0.7;
        damageEnemy(target, m.dmg, { source: m.owner });
      }
    } else {
      // orbit mode: circle the owner at MINION_ORBIT_RADIUS
      m.orbitAngle = (m.orbitAngle || 0) + 0.5 * dt;
      const tx = m.owner.x + Math.cos(m.orbitAngle) * MINION_ORBIT_RADIUS;
      const ty = m.owner.y + Math.sin(m.orbitAngle) * MINION_ORBIT_RADIUS;
      const dx = tx - m.x, dy = ty - m.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 8) {
        const spd = Math.min(dist * 3, 110);
        const nx = m.x + (dx / dist) * spd * dt;
        const ny = m.y + (dy / dist) * spd * dt;
        if (!game.map.worldSolid(nx, ny)) { m.x = nx; m.y = ny; }
        else if (!game.map.worldSolid(nx, m.y)) { m.x = nx; }
        else if (!game.map.worldSolid(m.x, ny)) { m.y = ny; }
        else { m.orbitAngle += 0.8 * dt; } // unstick by advancing angle
      }
    }
  }
  game.minions = game.minions.filter(m => m.life > 0 && m.hp > 0);
}

// ---- projectiles --------------------------------------------------------
export function enemyShoot(enemy, target, speed, dmg, color = '#ff5050') {
  const n = normalize(target.x - enemy.x, target.y - enemy.y);
  createProjectile({
    x: enemy.x, y: enemy.y, vx: n.x * speed, vy: n.y * speed,
    dmg, team: 'enemy', owner: enemy, radius: 6, life: 3, color,
  });
}

function explodeAt(x, y, ex) {
  spawnParticles(x, y, '#ff8020', 20, 160);
  game.particles.push({ x, y, vx: 0, vy: 0, life: 0.3, color: '#ff6020', r: ex.radius, ring: true });
  for (const e of game.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= ex.radius + e.radius && game.map.lineClear(x, y, e.x, e.y)) {
      const { dmg, crit } = rollDamage(ex.source, 1.2);
      damageEnemy(e, dmg, { crit, source: ex.source, burn: ex.burn });
    }
  }
}

export function updateProjectiles(dt) {
  for (const p of game.projectiles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    if (game.map.worldSolid(p.x, p.y)) {
      if (p.explode) explodeAt(p.x, p.y, p.explode);
      p.dead = true; continue;
    }
    if (p.team === 'player') {
      for (const e of game.enemies) {
        if (e.dead || p.hit.has(e)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= e.radius + p.radius) {
          if (p.explode) { explodeAt(p.x, p.y, p.explode); p.dead = true; break; }
          damageEnemy(e, p.dmg, { crit: p.crit, source: p.owner });
          p.hit.add(e);
          if (p.pierce > 0) p.pierce--; else { p.dead = true; break; }
        }
      }
    } else {
      for (const pl of game.players) {
        if (pl.downed) continue;
        if (Math.hypot(pl.x - p.x, pl.y - p.y) <= pl.radius + p.radius) {
          const dealt = pl.takeDamage(p.dmg);
          if (dealt) spawnFloater(pl.x, pl.y - 18, String(dealt), '#ff6060');
          p.dead = true; break;
        }
      }
    }
  }
  game.projectiles = game.projectiles.filter(p => !p.dead);
}

export function updateParticles(dt) {
  for (const pt of game.particles) {
    pt.x += (pt.vx || 0) * dt; pt.y += (pt.vy || 0) * dt; pt.life -= dt;
    if (pt.drag) { pt.vx *= pt.drag; pt.vy *= pt.drag; }
  }
  game.particles = game.particles.filter(p => p.life > 0);
  for (const f of game.floaters) { f.y += f.vy * dt; f.life -= dt; }
  game.floaters = game.floaters.filter(f => f.life > 0);
}
