// Mobile touch controls: virtual joystick (left) + action buttons (right).
// Writes into input.touch; no game logic lives here.
import { touch } from './input.js';
import { mobilePickClass } from './ui.js';
import { isMobile } from './detect.js';
export { isMobile } from './detect.js';

// ---- Build the overlay DOM ----
export function initMobileControls() {
  if (!isMobile) return;

  const overlay = document.createElement('div');
  overlay.id = 'mobile-controls';
  overlay.innerHTML = `
    <div id="joy-zone">
      <div id="joy-base"><div id="joy-knob"></div></div>
    </div>
    <div id="btn-zone">
      <div class="m-row top-row">
        <button class="mbtn" id="mb-inventory">BAG</button>
      </div>
      <div class="m-row mid-row">
        <button class="mbtn" id="mb-interact">USE</button>
        <button class="mbtn ability" id="mb-ability">SKL</button>
      </div>
      <div class="m-row bot-row">
        <button class="mbtn attack" id="mb-attack">ATK</button>
      </div>
    </div>
  `;
  document.getElementById('stage').appendChild(overlay);

  setupJoystick();
  setupButtons();
  setupMenuTap();
}

// ---- Joystick ----
const JOY_RADIUS = 52;
let joyActive = false;
let joyId = null;
let joyOrigin = { x: 0, y: 0 };

function setupJoystick() {
  const zone = document.getElementById('joy-zone');
  const base = document.getElementById('joy-base');
  const knob = document.getElementById('joy-knob');

  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyId = t.identifier;
    joyActive = true;
    const r = zone.getBoundingClientRect();
    joyOrigin = { x: t.clientX - r.left, y: t.clientY - r.top };
    base.style.left = joyOrigin.x + 'px';
    base.style.top  = joyOrigin.y + 'px';
    base.style.opacity = '1';
  }, { passive: false });

  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!joyActive) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      const r = zone.getBoundingClientRect();
      const dx = t.clientX - r.left - joyOrigin.x;
      const dy = t.clientY - r.top  - joyOrigin.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, JOY_RADIUS);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      const norm = Math.min(dist / JOY_RADIUS, 1);
      touch.move = { x: Math.cos(angle) * norm, y: Math.sin(angle) * norm };
    }
  }, { passive: false });

  const endJoy = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      joyActive = false;
      joyId = null;
      touch.move = { x: 0, y: 0 };
      knob.style.transform = 'translate(0,0)';
      base.style.opacity = '0.35';
    }
  };
  zone.addEventListener('touchend', endJoy, { passive: false });
  zone.addEventListener('touchcancel', endJoy, { passive: false });
}

// ---- Action buttons ----
function setupButtons() {
  const map = {
    'mb-attack':   'attack',
    'mb-ability':  'ability',
    'mb-interact': 'interact',
  };
  // BAG toggles the panel as a floating overlay
  const bagBtn = document.getElementById('mb-inventory');
  if (bagBtn) {
    bagBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      touch.inventory = true;
      setTimeout(() => { touch.inventory = false; }, 80);
      const panel = document.getElementById('panel-left');
      panel.classList.toggle('mobile-panel-open');
    }, { passive: false });
  }
  for (const [id, action] of Object.entries(map)) {
    const btn = document.getElementById(id);
    btn.addEventListener('touchstart', e => { e.preventDefault(); touch[action] = true; },  { passive: false });
    btn.addEventListener('touchend',   e => { e.preventDefault(); touch[action] = false; }, { passive: false });
    btn.addEventListener('touchcancel',e => { e.preventDefault(); touch[action] = false; }, { passive: false });
  }
}

// Show/hide the controls depending on game phase.
export function updateMobileControls(phase) {
  if (!isMobile) return;
  const el = document.getElementById('mobile-controls');
  if (!el) return;
  const inGame = phase === 'PLAYING';
  // Show joystick+buttons only while actually playing
  document.getElementById('joy-zone').style.display = inGame ? '' : 'none';
  document.getElementById('btn-zone').style.display  = inGame ? '' : 'none';
  el.style.display = 'flex';
}

// Tapping the overlay card during menus acts as "attack / confirm".
// Tapping a class card specifically picks that class.
function setupMenuTap() {
  const overlay = document.getElementById('overlay');
  overlay.addEventListener('touchstart', e => {
    if (overlay.classList.contains('hidden')) return;
    // Check if a class card was tapped
    const card = e.target.closest('[data-cls-idx]');
    if (card) {
      const idx = parseInt(card.dataset.clsIdx, 10);
      mobilePickClass(idx);
      return;
    }
    // Generic confirm (title, game over, etc.)
    touch.attack = true;
    setTimeout(() => { touch.attack = false; }, 80);
  }, { passive: true });
}
