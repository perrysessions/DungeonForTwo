// Keyboard input with two per-player keymaps and edge-triggered "just pressed".

export const KEYMAPS = [
  // Player 1 (left hand)
  {
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    attack: 'Space', ability: 'KeyE', interact: 'KeyQ', inventory: 'KeyR',
  },
  // Player 2 (right hand)
  {
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    attack: 'Slash', ability: 'Quote', interact: 'Semicolon', inventory: 'KeyP',
  },
];

const down = new Set();
let justBuffer = new Set();   // keys pressed since last frame
let justPressed = new Set();  // snapshot for current frame

// Codes we consume so the page doesn't scroll / lose focus.
const PREVENT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'Semicolon',
]);

window.addEventListener('keydown', (e) => {
  if (PREVENT.has(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (!down.has(e.code)) justBuffer.add(e.code);
    down.add(e.code);
  }
});
window.addEventListener('keyup', (e) => {
  down.delete(e.code);
});
window.addEventListener('blur', () => { down.clear(); });

// Touch state written by mobile.js; read here for P1 (pi=0).
export const touch = {
  move: { x: 0, y: 0 },   // normalized joystick vector
  attack: false,
  ability: false,
  interact: false,
  inventory: false,
  // edge-trigger tracking
  _prev: { attack: false, ability: false, interact: false, inventory: false },
  _just: { attack: false, ability: false, interact: false, inventory: false },
};

export const input = {
  beginFrame() {
    justPressed = justBuffer;
    justBuffer = new Set();
    // Compute touch edge triggers
    for (const k of ['attack', 'ability', 'interact', 'inventory']) {
      touch._just[k] = touch[k] && !touch._prev[k];
      touch._prev[k] = touch[k];
    }
  },
  isDown: (code) => down.has(code),
  justPressed: (code) => justPressed.has(code),

  actionDown(pi, action) {
    if (pi === 0 && touch[action]) return true;
    return down.has(KEYMAPS[pi][action]);
  },
  actionPressed(pi, action) {
    if (pi === 0 && touch._just[action]) return true;
    return justPressed.has(KEYMAPS[pi][action]);
  },
  moveVector(pi) {
    if (pi === 0 && (touch.move.x !== 0 || touch.move.y !== 0)) return touch.move;
    const m = KEYMAPS[pi];
    let x = 0, y = 0;
    if (down.has(m.left)) x -= 1;
    if (down.has(m.right)) x += 1;
    if (down.has(m.up)) y -= 1;
    if (down.has(m.down)) y += 1;
    if (x !== 0 && y !== 0) { x *= 0.7071; y *= 0.7071; }
    return { x, y };
  },
};
