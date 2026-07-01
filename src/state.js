// Global game state + shared constants/enums.

export const TILE = 32;
export const VIEW_W = 768; // canvas logical width (world px shown)
export const VIEW_H = 576; // canvas logical height
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
  awaitingBoss: false, // boss floor: boss held back until adds are dead
  time: 0,           // seconds elapsed (accumulated fixed steps)
  message: '',       // transient banner (e.g. "Floor cleared!")
  messageTimer: 0,
};

export function setMessage(text, seconds = 2.5) {
  game.message = text;
  game.messageTimer = seconds;
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
}
