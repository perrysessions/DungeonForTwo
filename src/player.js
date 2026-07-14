// Player entity: stats, XP/level, gold, inventory/equipment, downed/revive.
import { BASE_STATS, defaultMods, POINTS_PER_LEVEL } from './classes.js';
import { addShake } from './state.js';
import { playSfx } from './audio.js';

const INV_CAP = 16;

// Steeper than before (~2.5x) so leveling takes meaningfully longer.
export function xpToNext(level) {
  return Math.round(45 * Math.pow(level, 1.6));
}

export class Player {
  constructor(index, classDef) {
    this.index = index;
    this.cls = classDef;
    this.name = `P${index + 1}`;
    this.x = 0; this.y = 0;
    this.radius = 11;
    this.facing = { x: 0, y: 1 };

    this.level = 1;
    this.xp = 0;
    this.xpNext = xpToNext(1);
    this.skillPoints = 0;
    this.skills = {};        // nodeId -> rank
    this.mods = defaultMods();

    this.gold = 0;
    this.inventory = [];
    this.equipment = { weapon: null, armor: null, trinket: null };

    // cooldown timers
    this.attackTimer = 0;
    this.abilityTimer = 0;
    this.hitFlash = 0;
    this.dashTimer = 0;      // >0 means currently dashing (rogue)
    this.invuln = 0;

    // passive state
    this.passiveRank = 0;
    this.momentumT = 0;      // ranger/rogue on-kill speed buff timer
    this._passiveKills = 0;  // necro free-minion counter

    // downed / revive
    this.downed = false;
    this.bleed = 0;          // seconds until dead-dead (both down -> game over)
    this.reviveProgress = 0;

    this.stats = {};
    this.recompute(true);
    this.hp = this.stats.maxHp;
    this.mana = this.stats.maxMana;
  }

  get alive() { return !this.downed; }

  recompute(keepFull = false) {
    const hpRatio = this.stats.maxHp ? this.hp / this.stats.maxHp : 1;
    const manaRatio = this.stats.maxMana ? this.mana / this.stats.maxMana : 1;

    // Base + class.
    const s = { ...BASE_STATS, ...this.cls.stats };
    // Level bonuses.
    const lvUp = this.level - 1;
    s.maxHp += lvUp * 6;
    s.maxMana += lvUp * 2;
    s.attackDamage += lvUp * 1;
    s.damageMult += lvUp * 0.02;

    // Skill nodes.
    const mods = defaultMods();
    for (const n of this.cls.tree) {
      const rank = this.skills[n.id] || 0;
      if (!rank) continue;
      for (const [k, v] of Object.entries(n.stats)) s[k] = (s[k] || 0) + v * rank;
      for (const [k, v] of Object.entries(n.mods)) mods[k] = (mods[k] || 0) + v * rank;
    }
    this.mods = mods;

    // Equipment.
    for (const item of Object.values(this.equipment)) {
      if (!item) continue;
      for (const [k, v] of Object.entries(item.stats)) s[k] = (s[k] || 0) + v;
    }

    // Clamp sane minimums.
    s.attackCooldown = Math.max(0.12, s.attackCooldown);
    s.moveSpeed = Math.max(60, s.moveSpeed);

    this.stats = s;
    this.passiveRank = this.skills[this.cls.passiveId] || 0;

    if (keepFull) {
      this.hp = s.maxHp; this.mana = s.maxMana;
    } else {
      this.hp = Math.min(s.maxHp, Math.max(1, Math.round(hpRatio * s.maxHp)));
      this.mana = Math.min(s.maxMana, Math.round(manaRatio * s.maxMana));
    }
  }

  gainXp(amount) {
    if (this.downed) return;
    this.xp += amount;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.skillPoints += POINTS_PER_LEVEL;
      this.xpNext = xpToNext(this.level);
      this.recompute();
      this.hp = this.stats.maxHp; // full heal on level up
      this.mana = this.stats.maxMana;
      this._leveledUp = true;
      playSfx('level_up');
    }
  }

  canBuy(node) {
    const rank = this.skills[node.id] || 0;
    return this.skillPoints >= node.cost && rank < node.maxRank;
  }
  buySkill(node) {
    if (!this.canBuy(node)) return false;
    this.skills[node.id] = (this.skills[node.id] || 0) + 1;
    this.skillPoints -= node.cost;
    this.recompute();
    return true;
  }

  addItem(item) {
    if (this.inventory.length >= INV_CAP) return false;
    this.inventory.push(item);
    return true;
  }

  equip(item) {
    if (!['weapon', 'armor', 'trinket'].includes(item.slot)) return;
    const idx = this.inventory.indexOf(item);
    if (idx >= 0) this.inventory.splice(idx, 1);
    const prev = this.equipment[item.slot];
    this.equipment[item.slot] = item;
    if (prev) this.inventory.push(prev);
    this.recompute();
  }

  useConsumable(item) {
    if (item.slot !== 'consumable') return false;
    if (item.heal) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * item.heal);
    if (item.mana) this.mana = Math.min(this.stats.maxMana, this.mana + this.stats.maxMana * item.mana);
    const idx = this.inventory.indexOf(item);
    if (idx >= 0) this.inventory.splice(idx, 1);
    return true;
  }

  useItem(item) {
    if (item.slot === 'consumable') return this.useConsumable(item);
    this.equip(item);
    return true;
  }

  takeDamage(raw) {
    if (this.downed || this.invuln > 0 || this.dashTimer > 0) return 0;
    const dmg = Math.max(1, Math.round(raw - this.stats.armor * 0.6));
    this.hp -= dmg;
    this.hitFlash = 0.15;
    this.invuln = 0.4;
    addShake(this.hp <= 0 ? 9 : 5);
    playSfx('player_hit', 0.6);
    if (this.hp <= 0) {
      this.hp = 0;
      this.downed = true;
      this.bleed = 15; // seconds before this hero is lost (only matters if partner also down)
      this.reviveProgress = 0;
    }
    return dmg;
  }

  reviveTo(fraction = 0.5) {
    this.downed = false;
    this.hp = Math.max(1, Math.round(this.stats.maxHp * fraction));
    this.invuln = 1.2;
    this.reviveProgress = 0;
  }

  updateTimers(dt) {
    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.abilityTimer > 0) this.abilityTimer -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.dashTimer > 0) this.dashTimer -= dt;
    if (this.momentumT > 0) this.momentumT -= dt;
    if (this.swing && this.swing.t > 0) { this.swing.t -= dt; if (this.swing.t <= 0) this.swing = null; }
    if (this.novaFx && this.novaFx.t > 0) { this.novaFx.t -= dt; if (this.novaFx.t <= 0) this.novaFx = null; }
    if (!this.downed) {
      if (this.stats.hpRegen > 0)
        this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.hpRegen * dt);
    }
  }
}
