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

export const input = {
  // Call once at the start of each fixed update.
  beginFrame() {
    justPressed = justBuffer;
    justBuffer = new Set();
  },
  isDown: (code) => down.has(code),
  justPressed: (code) => justPressed.has(code),

  // Per-player helpers keyed by action name.
  actionDown(pi, action) {
    return down.has(KEYMAPS[pi][action]);
  },
  actionPressed(pi, action) {
    return justPressed.has(KEYMAPS[pi][action]);
  },
  // Normalized movement vector for a player.
  moveVector(pi) {
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
