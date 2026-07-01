// Item / equipment / consumable definitions + rarity, drop & shop generation.
import { rand, randInt, pick, chance, weightedPick } from './rng.js';

let _uid = 1;
const uid = () => _uid++;

// Material tier (base power, scales with floor).
export const TIER_NAMES = ['', 'Worn', 'Iron', 'Steel', 'Silver', 'Runed', 'Dragon'];

export function tierForFloor(floor) {
  return Math.min(6, Math.floor((floor - 1) / 3) + 1);
}

// Rarity multiplies stats AND price. Higher rarity is rarer + far pricier,
// so players save up for the good stuff. `minFloor` gates a rarity so you
// don't see Legendaries/Mythics on the first floors.
export const RARITIES = [
  { key: 'common',    name: 'Common',    mult: 1.00, price: 1.0,  weight: 100, color: '#b8b8c4', minFloor: 1 },
  { key: 'uncommon',  name: 'Uncommon',  mult: 1.40, price: 2.4,  weight: 42,  color: '#5fd06a', minFloor: 2 },
  { key: 'rare',      name: 'Rare',      mult: 1.95, price: 5.0,  weight: 15,  color: '#5a9cff', minFloor: 5 },
  { key: 'legendary', name: 'Legendary', mult: 2.75, price: 11.0, weight: 4.5, color: '#ffb040', minFloor: 9 },
  { key: 'mythic',    name: 'Mythic',    mult: 3.90, price: 24.0, weight: 1.0, color: '#ff6ac0', minFloor: 14 },
];
const RARITY_BY_KEY = Object.fromEntries(RARITIES.map(r => [r.key, r]));

// Roll a rarity available on this floor, biased toward better tiers with depth.
function rollRarity(floor, forceKey = null) {
  if (forceKey) return RARITY_BY_KEY[forceKey];
  const entries = RARITIES
    .filter(r => floor >= r.minFloor)
    .map((r, i) => ({ item: r, weight: r.weight * (1 + floor * 0.04 * i) }));
  return weightedPick(entries);
}

// The best rarity actually allowed on a floor (for capping forced picks).
function cappedRarity(floor, desiredKey) {
  const desired = RARITY_BY_KEY[desiredKey];
  if (floor >= desired.minFloor) return desiredKey;
  // step down to the highest rarity permitted on this floor
  const allowed = RARITIES.filter(r => floor >= r.minFloor);
  return allowed[allowed.length - 1].key;
}

// Deterministic per-tier baselines (common rarity). Stats = baseline * rarity.mult,
// so the same tier+rarity always yields the same power and higher rarity is
// strictly stronger. Weapon "type" only shifts the damage/crit split slightly.
const WEAPON_DMG = [0, 8, 14, 21, 29, 38, 48];      // by tier, common
const ARMOR_ARMOR = [0, 3, 5, 8, 11, 15, 19];
const ARMOR_HP = [0, 18, 28, 40, 54, 70, 88];

const WEAPON_BASES = [
  { name: 'Sword', dmgMul: 1.00, crit: 0, icon: '⚔️' },
  { name: 'Axe', dmgMul: 1.12, crit: 0, icon: '🪓' },
  { name: 'Mace', dmgMul: 1.06, crit: 0, icon: '🔨' },
  { name: 'Bow', dmgMul: 0.92, crit: 0.05, icon: '🏹' },
  { name: 'Dagger', dmgMul: 0.86, crit: 0.09, icon: '🗡️' },
  { name: 'Staff', dmgMul: 0.96, crit: 0.03, icon: '🪄' },
];
const ARMOR_BASES = [
  { name: 'Tunic', armorMul: 1.0, hpMul: 1.0, icon: '🧥' },
  { name: 'Mail', armorMul: 1.35, hpMul: 0.75, icon: '🛡️' },
  { name: 'Plate', armorMul: 1.7, hpMul: 0.5, icon: '🛡️' },
  { name: 'Robe', armorMul: 0.5, hpMul: 1.5, icon: '🥋' },
];
const TRINKET_BASES = [
  { name: 'Ring of Might', stat: 'damageMult', base: 0.05, icon: '💍' },
  { name: 'Boots of Speed', stat: 'moveSpeed', base: 9, icon: '🥾' },
  { name: 'Amulet of Focus', stat: 'critChance', base: 0.03, icon: '📿' },
  { name: 'Charm of Vigor', stat: 'maxHp', base: 14, icon: '🔮' },
  { name: 'Sigil of Power', stat: 'maxMana', base: 11, icon: '✨' },
  { name: 'Band of Fury', stat: 'attackCooldown', base: -0.025, icon: '💫' },
];

function equipDesc(stats) {
  const parts = [];
  for (const [k, v] of Object.entries(stats)) {
    if (v === 0) continue;
    if (k === 'damageMult') parts.push(`+${Math.round(v * 100)}% dmg`);
    else if (k === 'critChance') parts.push(`+${Math.round(v * 100)}% crit`);
    else if (k === 'attackCooldown') parts.push(`+${Math.round(-v * 100)}% atk spd`);
    else if (k === 'attackDamage') parts.push(`+${v} atk`);
    else if (k === 'armor') parts.push(`+${v} armor`);
    else if (k === 'maxHp') parts.push(`+${v} hp`);
    else if (k === 'maxMana') parts.push(`+${v} mana`);
    else if (k === 'moveSpeed') parts.push(`+${v} spd`);
  }
  return parts.join(', ');
}

export function generateEquipment(tier, floor = 1, forcedRarity = null) {
  const roll = weightedPick([
    { item: 'weapon', weight: 4 },
    { item: 'armor', weight: 3 },
    { item: 'trinket', weight: 3 },
  ]);
  const t = tier;
  const rarity = rollRarity(floor, forcedRarity ? cappedRarity(floor, forcedRarity) : null);
  const m = rarity.mult;
  let stats = {}, name = '', icon = '❔';

  if (roll === 'weapon') {
    const b = pick(WEAPON_BASES);
    stats.attackDamage = Math.max(1, Math.round(WEAPON_DMG[t] * b.dmgMul * m));
    if (b.crit) stats.critChance = +(b.crit * m).toFixed(3);
    name = `${TIER_NAMES[t]} ${b.name}`; icon = b.icon;
  } else if (roll === 'armor') {
    const b = pick(ARMOR_BASES);
    stats.armor = Math.max(1, Math.round(ARMOR_ARMOR[t] * b.armorMul * m));
    stats.maxHp = Math.max(1, Math.round(ARMOR_HP[t] * b.hpMul * m));
    name = `${TIER_NAMES[t]} ${b.name}`; icon = b.icon;
  } else {
    const b = pick(TRINKET_BASES);
    const raw = b.base * t * m;
    stats[b.stat] = Number.isInteger(b.base) ? Math.max(1, Math.round(raw)) : +raw.toFixed(3);
    name = b.name; icon = b.icon;
  }

  const basePrice = 16 + t * t * 9;
  const price = Math.round(basePrice * rarity.price);
  return {
    uid: uid(), id: `${roll}_${t}`, name, slot: roll, tier: t,
    rarity: rarity.key, rarityName: rarity.name, stats,
    price, desc: equipDesc(stats), color: rarity.color, icon,
  };
}

export const POTIONS = {
  health: {
    id: 'health', name: 'Health Potion', slot: 'consumable', heal: 0.55,
    price: 25, desc: 'Restore 55% HP', color: '#e05050', icon: '❤️', rarityName: '',
  },
  greaterHealth: {
    id: 'greaterHealth', name: 'Greater Health Potion', slot: 'consumable', heal: 1.0,
    price: 60, desc: 'Fully restore HP', color: '#ff3060', icon: '💖', rarityName: '',
  },
  mana: {
    id: 'mana', name: 'Mana Potion', slot: 'consumable', mana: 0.6,
    price: 25, desc: 'Restore 60% Mana', color: '#4060ff', icon: '💙', rarityName: '',
  },
};

export function makePotion(id) {
  return { uid: uid(), ...POTIONS[id] };
}

// Resale value of an item held in inventory.
export function sellValue(item) {
  return Math.max(1, Math.floor(item.price * 0.45));
}

// Drop from a slain enemy: gold always, low chance of potion/equipment.
// Rates are ~1/3 of before because there are now ~3x as many enemies.
export function rollLoot(floor, enemyTier) {
  const drops = [];
  const t = tierForFloor(floor);
  if (chance(0.04 + enemyTier * 0.008)) {
    drops.push({ kind: 'item', item: generateEquipment(t, floor) });
  } else if (chance(0.06)) {
    drops.push({ kind: 'item', item: makePotion(chance(0.5) ? 'health' : 'mana') });
  }
  return drops;
}

// Build a varied shop stock for the current floor (mixed rarities). Includes an
// aspirational item at the best rarity the NEXT floor allows — floor-gated, so
// no Legendaries in the shop until deep enough.
export function generateShopStock(floor) {
  const t = tierForFloor(floor + 1); // stock hints at what's ahead
  const stock = [];
  for (let i = 0; i < 5; i++) stock.push(generateEquipment(t, floor));
  stock.push(generateEquipment(t, floor + 1, chance(0.4) ? 'legendary' : 'rare'));
  stock.push(makePotion('health'));
  stock.push(makePotion('greaterHealth'));
  stock.push(makePotion('mana'));
  return stock;
}
