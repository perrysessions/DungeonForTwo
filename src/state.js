// Global game state + shared constants/enums.

export const TILE = 32;
export let VIEW_W = 768; // canvas logical width (world px shown)
export let VIEW_H = 576; // canvas logical height
export function setViewW(w) { VIEW_W = w; }
export function setViewH(h) { VIEW_H = h; }
export const MAX_FLOORS = 20;

export const Phase = {
  TITLE: 'TITLE',
  MODE_SELECT: 'MODE_SELECT',
  CLASS_SELECT: 'CLASS_SELECT',
  PLAYING: 'PLAYING',
  SHOP: 'SHOP',
  GAME_OVER: 'GAME_OVER',
  WIN: 'WIN',
};

// Central mutable game state. Modules import `game` and read/write fields.
export const game = {
  phase: Phase.TITLE,
  floor: 1,
  numPlayers: 2,     // 1 or 2 (chosen at mode select)
  shake: 0,          // screen-shake magnitude (decays each frame)
  players: [],       // Player[]
  enemies: [],       // Enemy[]
  minions: [],       // allied summons
  projectiles: [],   // Projectile[]
  pickups: [],       // gold / item drops on the ground
  floaters: [],      // floating combat text
  particles: [],
  map: null,         // current Dungeon
  camera: { x: 0, y: 0 },
  stairsActive: false,
  awaitingBoss: false,
  paused: false,
  time: 0,           // seconds elapsed (accumulated fixed steps)
  runTime: 0,        // seconds elapsed during active play (for scoring)
  message: '',       // transient banner (e.g. "Floor cleared!")
  messageTimer: 0,
  // Scoring
  comboTimer: 0,     // seconds remaining in current kill combo window
  comboCount: 0,     // kills in current combo streak
  comboBonusTotal: 0,// accumulated combo bonus for the run
  comboText: null,   // { label, alpha } for canvas combo display
  floorTransition: null, // { alpha, dir, onMid } — fade-to-black between floors
};

export function setMessage(text, seconds = 2.5) {
  game.message = text;
  game.messageTimer = seconds;
}

export function calcScore() {
  // Only award points for floors actually cleared (not the one you died on).
  const floorsCleared = Math.max(0, game.floor - 1);
  const base = floorsCleared * 1000;
  // Speed bonus only kicks in if you cleared at least one floor.
  // Capped at 1.5× so a slow clear still beats a fast death.
  const BASE_TIME = 30 * 60;
  const speedBonus = floorsCleared > 0
    ? Math.round(base * Math.min(1.5, BASE_TIME / Math.max(game.runTime, 1)) * 0.5)
    : 0;
  return base + speedBonus + (game.comboBonusTotal || 0);
}

export function addShake(amount) {
  game.shake = Math.min(16, game.shake + amount);
}

export function resetRunState() {
  game.enemies = [];
  game.minions = [];
  game.projectiles = [];
  game.pickups = [];
  game.floaters = [];
  game.particles = [];
  game.stairsActive = false;
  game.paused = false;
  game.comboTimer = 0;
  game.comboCount = 0;
  // comboBonusTotal and runTime persist across floors — reset only at full restart
}
