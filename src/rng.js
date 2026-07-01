// Small seeded PRNG (mulberry32) + helpers.
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return rng;
}

// Global convenience rng (reseeded per run).
let _rng = makeRng((Math.random() * 1e9) | 0);
export function reseed(seed) {
  _rng = makeRng(seed >>> 0);
}
export const rand = () => _rng();
export const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
export const randRange = (min, max) => rand() * (max - min) + min;
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];
export const chance = (p) => rand() < p;
export function weightedPick(entries) {
  // entries: [{ item, weight }]
  let total = 0;
  for (const e of entries) total += e.weight;
  let r = rand() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.item;
  }
  return entries[entries.length - 1].item;
}
