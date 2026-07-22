// Mobile touch controls: virtual joystick (left) + action buttons (right).
// Writes into input.touch; no game logic lives here.
import { touch } from './input.js';
import { mobilePickClass, setMobileInvTab, mobileTapInvRow, mobileBuyShopItem, mobileShopReady } from './ui.js';
import { isMobile } from './detect.js';
import { setViewW } from './state.js';
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

  // Expand canvas to fill the screen width without stretching.
  // Defer so the browser has finished laying out the viewport (avoids stretch on cold load).
  const canvas = document.getElementById('canvas');
  function applyMobileW() {
    const mobileW = Math.round(576 * (window.innerWidth / window.innerHeight));
    canvas.width = mobileW;
    setViewW(mobileW);
  }
  requestAnimationFrame(() => requestAnimationFrame(applyMobileW));
  window.addEventListener('resize', applyMobileW, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(applyMobileW, 100), { passive: true });

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

  // Tap on panel: switch tabs or activate rows.
  // Use 'click' instead of touchend — iOS scroll containers suppress touchend on scroll,
  // but click is only fired on genuine taps (never on scroll), no threshold needed.
  // touch-action: manipulation (set in CSS on .mobile-panel-open) removes the 300ms delay.
  const panel = document.getElementById('panel-left');
  panel.addEventListener('click', e => {
    const span = e.target.closest('.tabs span');
    if (span) {
      const label = span.textContent.trim().toLowerCase();
      setMobileInvTab(label.startsWith('item') ? 'items' : 'skills');
      return;
    }

    // Buttons nested inside rows must be checked before the row itself
    const sellBtn = e.target.closest('[data-sell-idx]');
    if (sellBtn) { mobileTapInvRow(parseInt(sellBtn.dataset.sellIdx, 10), 'items', 'sell'); return; }

    const buySkillBtn = e.target.closest('[data-buy-skill]');
    if (buySkillBtn) { mobileTapInvRow(parseInt(buySkillBtn.dataset.buySkill, 10), 'skills', 'buy'); return; }

    const row = e.target.closest('[data-row-idx]');
    if (row) {
      mobileTapInvRow(parseInt(row.dataset.rowIdx, 10), row.dataset.rowTab);
    }
  });
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

// Tap delegation on the overlay covers all menu screens.
function setupMenuTap() {
  const overlay = document.getElementById('overlay');
  overlay.addEventListener('touchstart', e => {
    if (overlay.classList.contains('hidden')) return;

    // Class select card
    const clsCard = e.target.closest('[data-cls-idx]');
    if (clsCard) { mobilePickClass(parseInt(clsCard.dataset.clsIdx, 10)); return; }

    // Shop: buy row
    const shopRow = e.target.closest('[data-shop-idx]');
    if (shopRow) { mobileBuyShopItem(parseInt(shopRow.dataset.shopIdx, 10)); return; }

    // Shop: ready button
    if (e.target.id === 'mobile-ready-btn') { mobileShopReady(); return; }

    // Inventory sell button
    const sellBtn = e.target.closest('[data-sell-idx]');
    if (sellBtn) { mobileTapInvRow(parseInt(sellBtn.dataset.sellIdx, 10), 'items', 'sell'); return; }

    // Generic confirm: title, game over, win
    touch.attack = true;
    setTimeout(() => { touch.attack = false; }, 80);
  }, { passive: true });
}
