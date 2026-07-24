// Mobile touch controls: virtual joystick (left) + action buttons (right).
// Writes into input.touch; no game logic lives here.
import { touch } from './input.js';
import { mobilePickClass, mobileConfirmClass, mobileBackFromClass, mobileToggleClassDetail, setMobileInvTab, mobileTapInvRow, mobileBuyShopItem, mobileConfirmBuyShopItem, mobileShopReady, invalidatePanelCache, titleToggleHowTo } from './ui.js';
import { isMobile } from './detect.js';
import { setViewW, setViewH, game } from './state.js';
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
    // Render at 360px tall to keep the player zoomed in.
    // Width fills the full screen (shows more map horizontally).
    const TARGET_H = 360;
    const mobileW = Math.round(window.innerWidth * TARGET_H / window.innerHeight);
    canvas.width = mobileW;
    canvas.height = TARGET_H;
    setViewW(mobileW);
    setViewH(TARGET_H);
  }
  const rotateMsg = document.getElementById('rotate-msg');

  let orientationTimer = null;
  function checkOrientation(immediate = false) {
    const isPortrait = window.innerHeight > window.innerWidth;
    if (isPortrait) {
      game.paused = true;
      if (rotateMsg) rotateMsg.style.display = 'flex';
    } else {
      const apply = () => {
        game.paused = false;
        if (rotateMsg) rotateMsg.style.display = 'none';
        applyMobileW();
      };
      if (immediate) {
        apply();
      } else {
        // Debounce on rotation so browser finishes settling before we read dimensions
        clearTimeout(orientationTimer);
        orientationTimer = setTimeout(apply, 150);
      }
    }
  }

  requestAnimationFrame(() => requestAnimationFrame(() => checkOrientation(true)));
  window.addEventListener('resize', () => checkOrientation(false), { passive: true });

  // Try to lock orientation to landscape on first touch (requires user gesture).
  // Works on Android Chrome; iOS Safari silently rejects — rotate-msg CSS handles that fallback.
  document.addEventListener('touchstart', () => {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('landscape').catch(() => {});
    }
  }, { once: true, passive: true });

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
    if (e.cancelable) e.preventDefault();
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

// ---- Panel open/close with backdrop ----
export function toggleMobilePanel() {
  const panel = document.getElementById('panel-left');
  const open = !panel.classList.contains('mobile-panel-open');
  panel.classList.toggle('mobile-panel-open', open);
  let backdrop = document.getElementById('mobile-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'mobile-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', () => toggleMobilePanel());
  }
  backdrop.style.display = open ? '' : 'none';
  // Hide the shop overlay entirely while the bag panel is open — keeps the overlay
  // from fighting the panel for touch events (renderOverlay runs every frame).
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.style.visibility = open ? 'hidden' : '';
    overlay.style.pointerEvents = open ? 'none' : '';
  }
  // force panel re-render so close button appears/disappears immediately
  invalidatePanelCache();
}

// ---- Action buttons ----
function setupButtons() {
  const map = {
    'mb-attack':  'attack',
    'mb-ability': 'ability',
  };
  // BAG toggles the panel as a floating overlay
  const bagBtn = document.getElementById('mb-inventory');
  if (bagBtn) {
    bagBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      touch.inventory = true;
      setTimeout(() => { touch.inventory = false; }, 80);
      toggleMobilePanel();
    }, { passive: false });
  }

  // Tap on panel: switch tabs or activate rows.
  // Use 'click' instead of touchend — iOS scroll containers suppress touchend on scroll,
  // but click is only fired on genuine taps (never on scroll), no threshold needed.
  // touch-action: manipulation (set in CSS on .mobile-panel-open) removes the 300ms delay.
  const panel = document.getElementById('panel-left');
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-panel-close]')) { toggleMobilePanel(); return; }

    const span = e.target.closest('.tabs span');
    if (span) {
      const label = span.textContent.trim().toLowerCase();
      setMobileInvTab(label.startsWith('item') ? 'items' : 'skills');
      return;
    }

    // Buttons nested inside rows must be checked before the row itself
    const equipBtn = e.target.closest('[data-equip-idx]');
    if (equipBtn) { mobileTapInvRow(parseInt(equipBtn.dataset.equipIdx, 10), 'items', 'equip'); return; }

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
    btn.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); touch[action] = true; },  { passive: false });
    btn.addEventListener('touchend',   e => { if (e.cancelable) e.preventDefault(); touch[action] = false; }, { passive: false });
    btn.addEventListener('touchcancel',e => { if (e.cancelable) e.preventDefault(); touch[action] = false; }, { passive: false });
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
    // Let settings button and modal handle their own events
    if (e.target.closest('#settings-btn') || e.target.closest('#settings-modal')) return;

    // How to play open / back
    if (e.target.closest('[data-htp-open]')) { titleToggleHowTo(); return; }
    if (e.target.closest('[data-htp-back]')) { titleToggleHowTo(); return; }

    // Class select: back / confirm / detail buttons
    if (e.target.closest('[data-cls-back]')) { mobileBackFromClass(); return; }
    if (e.target.closest('[data-confirm-class]')) { mobileConfirmClass(); return; }
    if (e.target.closest('[data-detail-class]')) { mobileToggleClassDetail(); return; }
    // Class select card: tap to highlight
    const clsCard = e.target.closest('[data-cls-idx]');
    if (clsCard) { mobilePickClass(parseInt(clsCard.dataset.clsIdx, 10)); return; }

    // Shop: confirm buy button
    const buyShopBtn = e.target.closest('[data-buy-shop-idx]');
    if (buyShopBtn) { mobileConfirmBuyShopItem(parseInt(buyShopBtn.dataset.buyShopIdx, 10)); return; }

    // Shop: tap row to select
    const shopRow = e.target.closest('[data-shop-idx]');
    if (shopRow) { mobileBuyShopItem(parseInt(shopRow.dataset.shopIdx, 10)); return; }

    // Shop: ready button
    if (e.target.closest('#mobile-ready-btn')) { mobileShopReady(); return; }

    // Shop: bag button
    if (e.target.closest('#mobile-bag-btn')) { toggleMobilePanel(); return; }

    // Shop: settings button
    if (e.target.closest('#mobile-settings-btn')) { document.getElementById('settings-btn').click(); return; }

    // Inventory sell button
    const sellBtn = e.target.closest('[data-sell-idx]');
    if (sellBtn) { mobileTapInvRow(parseInt(sellBtn.dataset.sellIdx, 10), 'items', 'sell'); return; }

    // Generic confirm: title, game over, win — not during class/mode select or how-to screen
    if (document.getElementById('overlay')?.querySelector('.clsgrid, [data-confirm-class], [data-htp-back]')) return;
    touch.attack = true;
    setTimeout(() => { touch.attack = false; }, 80);
  }, { passive: true });
}
