// 8 class definitions: base stats, ability id, passive, skill tree, art palette.
// Ability behaviors + passive effects live in combat.js (keyed by `ability` / `passiveId`).

export const BASE_STATS = {
  maxHp: 100, maxMana: 50, moveSpeed: 150, damageMult: 1,
  attackRange: 320, attackCooldown: 0.45, attackDamage: 10,
  critChance: 0.05, critMult: 2, armor: 0, hpRegen: 0,
  projectileSpeed: 400, projectileCount: 1, pierce: 0,
  weaponType: 'ranged',
};

export const POINTS_PER_LEVEL = 1;

// Default ability modifiers every player carries; skill nodes add to these.
export function defaultMods() {
  return {
    burn: 0, blastRadius: 0, minions: 1, minionDmg: 0, minionHp: 0,
    slowPower: 0, slowRadius: 0, cleaveSize: 0, knockback: 0,
    healPower: 0, auraRadius: 0, dashCd: 0, holy: 0, lifesteal: 0,
    reviveSpeed: 0, castSpeed: 0,
  };
}

// Helper to shorten node authoring.
const node = (id, name, desc, opts) => ({
  id, name, desc, cost: 1, maxRank: 1, stats: {}, mods: {}, passive: false, ...opts,
});

export const CLASSES = {
  warrior: {
    key: 'warrior', name: 'Warrior', ability: 'cleave', abilityName: 'Cleave',
    abilityCost: 12, passiveId: 'w_pass',
    blurb: 'Tanky melee bruiser. Cleaves crowds and shrugs off hits.',
    art: { body: '#8a6d3b', accent: '#c0c0c8', trim: '#e8c34a', head: 'helm' },
    stats: {
      maxHp: 170, maxMana: 40, moveSpeed: 140, armor: 7, weaponType: 'melee',
      attackRange: 58, attackCooldown: 0.5, attackDamage: 17,
    },
    tree: [
      node('w_pass', 'Bloodlust', 'PASSIVE — On kill: heal 2% max HP per rank', { passive: true, maxRank: 4 }),
      node('w_hp', 'Iron Body', '+15 Max HP', { maxRank: 4, stats: { maxHp: 15 } }),
      node('w_arm', 'Plating', '+1.5 Armor', { maxRank: 4, stats: { armor: 1.5 } }),
      node('w_dmg', 'Brutality', '+7% Damage', { maxRank: 4, stats: { damageMult: 0.07 } }),
      node('w_cleave', 'Wide Swing', '+15% Cleave size', { maxRank: 3, mods: { cleaveSize: 0.15 } }),
      node('w_knock', 'Bull Rush', 'Attacks knock back enemies', { maxRank: 2, mods: { knockback: 45 } }),
      node('w_speed', 'War March', '+6 Move speed', { maxRank: 3, stats: { moveSpeed: 6 } }),
    ],
  },
  ranger: {
    key: 'ranger', name: 'Ranger', ability: 'multishot', abilityName: 'Multishot',
    abilityCost: 14, passiveId: 'r_pass',
    blurb: 'Fast, long-range archer. Pin enemies from afar.',
    art: { body: '#2f6b3a', accent: '#c8a06a', trim: '#e0e0d0', head: 'hood' },
    stats: {
      maxHp: 95, moveSpeed: 190, attackRange: 380, attackCooldown: 0.34,
      attackDamage: 9, projectileSpeed: 480,
    },
    tree: [
      node('r_pass', 'Momentum', 'PASSIVE — On kill: brief burst of move speed (per rank)', { passive: true, maxRank: 4 }),
      node('r_spd', 'Fleet Foot', '+7 Move speed', { maxRank: 4, stats: { moveSpeed: 7 } }),
      node('r_rng', 'Eagle Eye', '+30 Range & faster arrows', { maxRank: 3, stats: { attackRange: 30, projectileSpeed: 30 } }),
      node('r_dmg', 'Sharpshooter', '+7% Damage', { maxRank: 4, stats: { damageMult: 0.07 } }),
      node('r_pierce', 'Piercing Shot', 'Arrows pierce +1 enemy', { maxRank: 2, stats: { pierce: 1 } }),
      node('r_multi', 'Extra Arrow', 'Basic attack fires +1 arrow', { maxRank: 1, stats: { projectileCount: 1 } }),
      node('r_crit', 'Deadeye', '+4% Crit chance', { maxRank: 3, stats: { critChance: 0.04 } }),
    ],
  },
  firemage: {
    key: 'firemage', name: 'Fire Mage', ability: 'fireball', abilityName: 'Fireball',
    abilityCost: 18, passiveId: 'f_pass',
    blurb: 'Lobs explosive fireballs that leave enemies burning.',
    art: { body: '#a02020', accent: '#ff8020', trim: '#ffd060', head: 'hat' },
    stats: {
      maxHp: 82, maxMana: 95, attackDamage: 8, attackCooldown: 0.5,
      projectileSpeed: 360,
    },
    tree: [
      node('f_pass', 'Conflagration', 'PASSIVE — On kill: a fiery blast burns nearby foes (per rank)', { passive: true, maxRank: 4 }),
      node('f_burn', 'Cinders', '+25% Burn damage', { maxRank: 4, mods: { burn: 0.25 } }),
      node('f_blast', 'Big Bang', '+15% Blast radius', { maxRank: 3, mods: { blastRadius: 0.15 } }),
      node('f_mana', 'Deep Well', '+15 Max Mana', { maxRank: 3, stats: { maxMana: 15 } }),
      node('f_dmg', 'Pyromancy', '+9% Damage', { maxRank: 4, stats: { damageMult: 0.09 } }),
      node('f_cast', 'Quick Cast', '-7% Attack cooldown', { maxRank: 2, mods: { castSpeed: 0.075 } }),
      node('f_hp', 'Ward', '+10 Max HP', { maxRank: 3, stats: { maxHp: 10 } }),
    ],
  },
  necromancer: {
    key: 'necromancer', name: 'Necromancer', ability: 'raiseMinion', abilityName: 'Raise Dead',
    abilityCost: 20, passiveId: 'n_pass',
    blurb: 'Summons skeletal minions to fight and drains life.',
    art: { body: '#3a2b55', accent: '#7ad0a0', trim: '#c8f0d8', head: 'hood' },
    stats: {
      maxHp: 95, maxMana: 85, attackDamage: 8, attackCooldown: 0.48, projectileSpeed: 360,
    },
    tree: [
      node('n_pass', 'Undying Legion', 'PASSIVE — Every few kills, raise a free wraith minion that ignores your cap (higher rank: more often & stronger)', { passive: true, maxRank: 4 }),
      node('n_num', 'Grave Horde', '+1 Max minions', { cost: 2, maxRank: 3, mods: { minions: 1 } }),
      node('n_mdmg', 'Bone Blades', '+20% Minion damage', { maxRank: 4, mods: { minionDmg: 0.2 } }),
      node('n_mhp', 'Undying', '+20% Minion HP', { maxRank: 3, mods: { minionHp: 0.2 } }),
      node('n_leech', 'Life Siphon', 'Attacks heal you 6%', { maxRank: 3, mods: { lifesteal: 0.06 } }),
      node('n_dmg', 'Dark Power', '+7% Damage', { maxRank: 4, stats: { damageMult: 0.07 } }),
      node('n_mana', 'Soul Reserve', '+12 Max Mana', { maxRank: 3, stats: { maxMana: 12 } }),
    ],
  },
  cleric: {
    key: 'cleric', name: 'Cleric', ability: 'healAura', abilityName: 'Heal Aura',
    abilityCost: 16, passiveId: 'c_pass',
    blurb: 'Support caster. Heals both heroes and revives faster.',
    art: { body: '#d8d0c0', accent: '#f0d060', trim: '#ffffff', head: 'hood' },
    stats: {
      maxHp: 115, maxMana: 95, attackDamage: 7, attackCooldown: 0.46,
      projectileSpeed: 380,
    },
    tree: [
      node('c_pass', 'Renewal', 'PASSIVE — On kill: heal both heroes a little (per rank)', { passive: true, maxRank: 4 }),
      node('c_heal', 'Blessing', '+25% Heal power', { maxRank: 4, mods: { healPower: 0.25 } }),
      node('c_aura', 'Wide Grace', '+15% Aura radius', { maxRank: 3, mods: { auraRadius: 0.15 } }),
      node('c_rev', 'Guardian Angel', 'Revive allies 20% faster', { maxRank: 2, mods: { reviveSpeed: 0.2 } }),
      node('c_mana', 'Faith', '+15 Max Mana', { maxRank: 3, stats: { maxMana: 15 } }),
      node('c_hp', 'Sanctuary', '+12 Max HP', { maxRank: 3, stats: { maxHp: 12 } }),
      node('c_dmg', 'Smiting Light', '+6% Damage', { maxRank: 3, stats: { damageMult: 0.06 } }),
    ],
  },
  rogue: {
    key: 'rogue', name: 'Rogue', ability: 'dash', abilityName: 'Shadow Dash',
    abilityCost: 10, passiveId: 'g_pass',
    blurb: 'Blinding speed and lethal crits. Dashes through foes.',
    art: { body: '#2a2a33', accent: '#6a6a78', trim: '#c04040', head: 'hood' },
    stats: {
      maxHp: 95, moveSpeed: 200, weaponType: 'melee', attackRange: 54,
      attackCooldown: 0.3, attackDamage: 11, critChance: 0.15, critMult: 2.4,
    },
    tree: [
      node('g_pass', 'Killing Spree', 'PASSIVE — On kill: chance to reset Dash + brief speed (per rank)', { passive: true, maxRank: 4 }),
      node('g_crit', 'Assassinate', '+4.5% Crit chance', { maxRank: 4, stats: { critChance: 0.045 } }),
      node('g_critd', 'Lethality', '+20% Crit damage', { maxRank: 3, stats: { critMult: 0.2 } }),
      node('g_spd', 'Blur', '+8 Move speed', { maxRank: 4, stats: { moveSpeed: 8 } }),
      node('g_dash', 'Quick Reflexes', '-12% Dash cooldown', { maxRank: 2, mods: { dashCd: 0.12 } }),
      node('g_dmg', 'Backstab', '+7% Damage', { maxRank: 4, stats: { damageMult: 0.07 } }),
      node('g_hp', 'Evasion', '+7 Max HP', { maxRank: 3, stats: { maxHp: 7 } }),
    ],
  },
  paladin: {
    key: 'paladin', name: 'Paladin', ability: 'smite', abilityName: 'Smite',
    abilityCost: 14, passiveId: 'p_pass',
    blurb: 'Holy knight: heavy melee that also mends wounds.',
    art: { body: '#c0c0cc', accent: '#e8c34a', trim: '#ffffff', head: 'helm' },
    stats: {
      maxHp: 150, maxMana: 65, armor: 5, weaponType: 'melee', attackRange: 60,
      attackCooldown: 0.5, attackDamage: 15,
    },
    tree: [
      node('p_pass', 'Retribution', 'PASSIVE — On kill: holy heal to both heroes (per rank)', { passive: true, maxRank: 4 }),
      node('p_holy', 'Righteous Fury', '+20% Smite damage & heal', { maxRank: 4, mods: { holy: 0.2, healPower: 0.1 } }),
      node('p_arm', 'Aegis', '+1.5 Armor', { maxRank: 4, stats: { armor: 1.5 } }),
      node('p_hp', 'Devotion', '+15 Max HP', { maxRank: 4, stats: { maxHp: 15 } }),
      node('p_dmg', 'Zeal', '+7% Damage', { maxRank: 4, stats: { damageMult: 0.07 } }),
      node('p_leech', 'Lay on Hands', 'Attacks heal you 4%', { maxRank: 2, mods: { lifesteal: 0.04 } }),
      node('p_spd', 'Crusade', '+6 Move speed', { maxRank: 2, stats: { moveSpeed: 6 } }),
    ],
  },
  frostmage: {
    key: 'frostmage', name: 'Frost Mage', ability: 'frostNova', abilityName: 'Frost Nova',
    abilityCost: 16, passiveId: 'i_pass',
    blurb: 'Controls the battlefield, freezing enemies in place.',
    art: { body: '#204a80', accent: '#80c0ff', trim: '#e0f4ff', head: 'hat' },
    stats: {
      maxHp: 90, maxMana: 90, attackDamage: 8, attackCooldown: 0.5,
      projectileSpeed: 380,
    },
    tree: [
      node('i_pass', 'Frostbite', 'PASSIVE — On kill: a chilling burst slows nearby foes (per rank)', { passive: true, maxRank: 4 }),
      node('i_slow', 'Deep Freeze', '+12% Slow power', { maxRank: 4, mods: { slowPower: 0.12 } }),
      node('i_rad', 'Blizzard', '+15% Nova radius', { maxRank: 3, mods: { slowRadius: 0.15 } }),
      node('i_dmg', 'Frost Power', '+9% Damage', { maxRank: 4, stats: { damageMult: 0.09 } }),
      node('i_mana', 'Glacial Mind', '+15 Max Mana', { maxRank: 3, stats: { maxMana: 15 } }),
      node('i_pierce', 'Icicle', 'Bolts pierce +1 enemy', { maxRank: 1, stats: { pierce: 1 } }),
      node('i_hp', 'Frost Armor', '+10 Max HP & +1 armor', { maxRank: 3, stats: { maxHp: 10, armor: 1 } }),
    ],
  },
};

// Generic stat nodes every class shares — halved values, lots to invest in.
export const GENERIC_NODES = [
  node('core_hp', 'Vitality', '+12 Max HP', { maxRank: 6, stats: { maxHp: 12 } }),
  node('core_atk', 'Strength', '+1.5 Attack', { maxRank: 6, stats: { attackDamage: 1.5 } }),
  node('core_dmg', 'Power', '+4% Damage', { maxRank: 6, stats: { damageMult: 0.04 } }),
  node('core_haste', 'Haste', '+3.5% Attack Speed', { maxRank: 5, stats: { attackCooldown: -0.015 } }),
  node('core_spd', 'Swiftness', '+4 Move Speed', { maxRank: 5, stats: { moveSpeed: 4 } }),
  node('core_crit', 'Precision', '+2% Crit Chance', { maxRank: 5, stats: { critChance: 0.02 } }),
  node('core_critd', 'Ferocity', '+10% Crit Damage', { maxRank: 5, stats: { critMult: 0.1 } }),
  node('core_regen', 'Regeneration', '+0.75 HP / sec', { maxRank: 5, stats: { hpRegen: 0.75 } }),
];

export const CLASS_LIST = Object.values(CLASSES);

// Each class keeps its passive + unique nodes first, then the shared generic pool.
for (const c of CLASS_LIST) c.tree = [...c.tree, ...GENERIC_NODES];
