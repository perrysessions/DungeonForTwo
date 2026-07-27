// DOM UI: side panels (P1 left / P2 right), inventory+skill overlays,
// mode-select / class-select / shop / title / game-over screens + input handling.
import { game, Phase, MAX_FLOORS, calcScore } from './state.js';
import { input, KEYMAPS } from './input.js';
import { isMobile } from './detect.js';
import { CLASS_LIST } from './classes.js';
import { buy } from './shop.js';
import { sellValue } from './items.js';
import { setMusicVolume, setSfxVolume, toggleMute, isMuted } from './audio.js';

// ---------- Local High Score Board ----------
const HS_KEY = 'dungeon2_scores';
const MAX_SCORES = 5;
let _scoreSaved = false;

function loadScores() {
  try { return JSON.parse(localStorage.getItem(HS_KEY)) || []; } catch { return []; }
}
function saveScore(entry) {
  const scores = loadScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  scores.splice(MAX_SCORES);
  localStorage.setItem(HS_KEY, JSON.stringify(scores));
  return scores;
}
function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const P_COLOR = ['#5aa9ff', '#ff8a4a'];
let els = {};
let ctrl = {};
let lastOverlayPhase = null;
let lastShopKey = null;

// per-player inventory overlay state
const inv = [
  { open: false, tab: 'items', itemCur: 0, skillCur: 0 },
  { open: false, tab: 'items', itemCur: 0, skillCur: 0 },
];
// class-select state
let cs = { cursor: [0, 0], confirmed: [false, false] };
// mode-select state
let ms = { sel: 2 };

export function initUI(controller) {
  ctrl = controller;
  els.left = document.getElementById('panel-left');
  els.right = document.getElementById('panel-right');
  els.overlay = document.getElementById('overlay');
  els.panels = [els.left, els.right];
  initSettings();
  // Desktop click handler for how-to-play buttons (mobile uses setupMenuTap)
  els.overlay.addEventListener('click', e => {
    if (e.target.closest('[data-htp-open]') || e.target.closest('[data-htp-back]')) {
      titleToggleHowTo();
    }
    if (e.target.closest('[data-artpreview-open]')) titleToggleArtPreview(true);
    if (e.target.closest('[data-artpreview-back]')) titleToggleArtPreview(false);
    if (e.target.closest('[data-cls-back]')) ctrl.onBackToTitle();
  });
}

function initSettings() {
  const modal     = document.getElementById('settings-modal');
  const btn       = document.getElementById('settings-btn');
  const closeBtn  = document.getElementById('settings-close');
  const volMusic  = document.getElementById('vol-music');
  const volMusicV = document.getElementById('vol-music-val');
  const volSfx    = document.getElementById('vol-sfx');
  const volSfxV   = document.getElementById('vol-sfx-val');
  const restartBtn    = document.getElementById('restart-btn');
  const restartArea   = document.getElementById('restart-confirm');
  const restartYes    = document.getElementById('restart-yes');
  const restartNo     = document.getElementById('restart-no');

  const open = () => {
    const inRun = game.phase === Phase.PLAYING || game.phase === Phase.SHOP;
    restartBtn.style.display = inRun ? '' : 'none';
    restartArea.classList.add('hidden');
    modal.classList.remove('hidden');
    if (inRun) game.paused = true;
    // Populate scores every time settings opens
    const hsTable = document.getElementById('hs-view-table');
    const scores = loadScores();
    hsTable.innerHTML = scores.length === 0
      ? '<p style="font-size:12px;color:#666;text-align:center">No scores yet</p>'
      : `<table style="width:100%;font-size:11px;border-collapse:collapse">
          <tr style="color:#888"><th style="text-align:left;padding:2px 4px">#</th><th style="text-align:left;padding:2px 4px">Name</th><th style="text-align:left;padding:2px 4px">Class</th><th style="text-align:right;padding:2px 4px">Score</th><th style="text-align:right;padding:2px 4px">Flr</th><th style="text-align:right;padding:2px 4px">Time</th></tr>
          ${scores.map((s, i) => `<tr><td style="padding:2px 4px">${i+1}</td><td style="padding:2px 4px">${s.name}</td><td style="padding:2px 4px;color:#aaaaff">${s.classes||'—'}</td><td style="text-align:right;padding:2px 4px">${s.score.toLocaleString()}</td><td style="text-align:right;padding:2px 4px">${s.floor}</td><td style="text-align:right;padding:2px 4px">${fmtTime(s.time)}</td></tr>`).join('')}
        </table>`;
  };
  const close = () => {
    modal.classList.add('hidden');
    game.paused = false;
  };

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { modal.classList.contains('hidden') ? open() : close(); }
    if ((e.key === 'm' || e.key === 'M') && modal.classList.contains('hidden')) muteBtn.click();
  });

  const muteBtn = document.getElementById('mute-btn');
  muteBtn.addEventListener('click', () => {
    const muted = toggleMute();
    muteBtn.textContent = muted ? '🔇' : '🔊';
  });

  volMusic.addEventListener('input', () => {
    const v = Number(volMusic.value);
    volMusicV.textContent = v + '%';
    setMusicVolume(v / 100);
  });
  volSfx.addEventListener('input', () => {
    const v = Number(volSfx.value);
    volSfxV.textContent = v + '%';
    setSfxVolume(v / 100);
  });

  restartBtn.addEventListener('click', () => restartArea.classList.remove('hidden'));
  restartNo.addEventListener('click',  () => restartArea.classList.add('hidden'));
  restartYes.addEventListener('click', () => { close(); ctrl.onRestart(); });

}

export function resetClassSelect() { cs = { cursor: [0, 0], confirmed: [false, false], _detail: false }; _scoreSaved = false; _showHowTo = false; }

// Mobile: tap a class card to instantly pick and confirm it for P1.
export function setMobileInvTab(tab) { inv[0].tab = tab; }

let _toastTimer = null;
function mobileToast(msg) {
  let el = document.getElementById('mobile-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mobile-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
}

export function mobileBuyShopItem(idx) {
  // Tap to select only — BUY button confirms the purchase
  const shop = game.shop;
  if (!shop) return;
  shop.cursor[0] = (shop.cursor[0] === idx) ? -1 : idx;
}

export function mobileConfirmBuyShopItem(idx) {
  const shop = game.shop;
  const p = game.players[0];
  if (!shop || !p) return;
  shop.cursor[0] = idx;
  const item = shop.stock[idx];
  const res = buy(p, item);
  if (res.ok) {
    const name = item.name;
    shop.stock.splice(idx, 1);
    for (let k = 0; k < 2; k++) {
      if (shop.cursor[k] > idx) shop.cursor[k]--;
      shop.cursor[k] = Math.max(0, Math.min(shop.cursor[k], Math.max(0, shop.stock.length - 1)));
    }
    mobileToast(`Bought ${name}!`);
  } else {
    mobileToast(res.reason);
  }
}

export function mobileShopReady() {
  const shop = game.shop;
  if (!shop) return;
  shop.ready[0] = !shop.ready[0];
  let allReady = true;
  for (let pi = 0; pi < game.numPlayers; pi++) if (!shop.ready[pi]) allReady = false;
  if (allReady) ctrl.onDescend();
}

export function mobileTapInvRow(idx, tab, action) {
  const st = inv[0];
  const p = game.players[0];
  if (!p) return;
  if (tab === 'items') {
    const n = p.inventory.length;
    if (n === 0 || idx >= n) return;
    if (action === 'sell') {
      const name = p.inventory[idx].name;
      p.gold += sellValue(p.inventory[idx]);
      p.inventory.splice(idx, 1);
      st.itemCur = Math.min(st.itemCur, Math.max(0, p.inventory.length - 1));
      mobileToast(`Sold ${name}`);
    } else if (action === 'equip') {
      const item = p.inventory[idx];
      st.itemCur = idx;
      p.useItem(item);
      st.itemCur = Math.min(st.itemCur, Math.max(0, p.inventory.length - 1));
      const label = item.slot === 'consumable' ? 'Used' : 'Equipped';
      mobileToast(`${label} ${item.name}`);
    } else {
      // Tap selects only — EQUIP/USE and SELL buttons appear on selected row
      st.itemCur = (st.itemCur === idx) ? -1 : idx;
    }
  } else {
    if (action === 'buy') {
      const node = p.cls.tree[idx];
      if (node && p.canBuy(node)) {
        p.buySkill(node);
        mobileToast(`Learned ${node.name}`);
      }
    } else {
      // Tap selects only — BUY button appears on selected row to confirm
      st.skillCur = (st.skillCur === idx) ? -1 : idx;
    }
  }
}

export function mobilePickClass(idx) {
  if (cs.cursor[0] !== idx) cs._detail = false;
  cs.cursor[0] = idx;
  cs.confirmed[0] = false;
}
export function mobileBackFromClass() { ctrl.onBackToTitle(); }
export function mobileConfirmClass() {
  if (cs.confirmed[0]) return;
  cs.confirmed[0] = true;
  ctrl.onClassChosen([CLASS_LIST[cs.cursor[0]].key]);
}
export function mobileToggleClassDetail() {
  cs._detail = !cs._detail;
}
export function closeInventories() { inv[0].open = inv[1].open = false; }
export function isCapturing(pi) { return inv[pi].open; }

export function update(dt) {
  if (game.phase === Phase.PLAYING || game.phase === Phase.SHOP) {
    for (let pi = 0; pi < game.numPlayers; pi++) handleInventory(pi);
  } else {
    inv[0].open = inv[1].open = false;
  }

  switch (game.phase) {
    case Phase.TITLE: handleTitle(); break;
    case Phase.MODE_SELECT: handleModeSelect(); break;
    case Phase.CLASS_SELECT: handleClassSelect(); break;
    case Phase.SHOP: handleShop(); break;
    case Phase.GAME_OVER:
    case Phase.WIN: handleEndScreen(); break;
  }

  renderPanels();
  renderOverlay();
}

// ---------------- inventory / skills ----------------
function handleInventory(pi) {
  const st = inv[pi];
  const p = game.players[pi];
  if (!p) return;
  // On mobile the panel floats as an overlay; sync open state with panel visibility.
  if (isMobile) {
    const panel = document.getElementById('panel-left');
    st.open = panel?.classList.contains('mobile-panel-open') || false;
    if (!st.open) return;
  }
  if (input.actionPressed(pi, 'inventory')) {
    st.open = !st.open;
    if (st.open) { st.tab = p.skillPoints > 0 ? 'skills' : 'items'; st.itemCur = 0; st.skillCur = 0; }
  }
  if (!st.open) return;
  if (input.actionPressed(pi, 'left') || input.actionPressed(pi, 'right')) {
    st.tab = st.tab === 'items' ? 'skills' : 'items';
  }
  if (st.tab === 'items') {
    const n = p.inventory.length;
    if (input.actionPressed(pi, 'up')) st.itemCur = (st.itemCur - 1 + Math.max(1, n)) % Math.max(1, n);
    if (input.actionPressed(pi, 'down')) st.itemCur = (st.itemCur + 1) % Math.max(1, n);
    if (n > 0) {
      const idx = Math.min(st.itemCur, n - 1);
      if (input.actionPressed(pi, 'attack')) {              // use / equip
        p.useItem(p.inventory[idx]);
        st.itemCur = Math.min(st.itemCur, Math.max(0, p.inventory.length - 1));
      } else if (input.actionPressed(pi, 'interact')) {     // sell
        const item = p.inventory[idx];
        const v = sellValue(item);
        p.gold += v; p.inventory.splice(idx, 1);
        flashPanel(pi, `Sold ${item.name} · +${v}g`);
        st.itemCur = Math.min(st.itemCur, Math.max(0, p.inventory.length - 1));
      }
    }
  } else {
    const tree = p.cls.tree;
    if (input.actionPressed(pi, 'up')) st.skillCur = (st.skillCur - 1 + tree.length) % tree.length;
    if (input.actionPressed(pi, 'down')) st.skillCur = (st.skillCur + 1) % tree.length;
    if (input.actionPressed(pi, 'attack')) p.buySkill(tree[st.skillCur]);
  }
}

// ---------------- phase input handlers ----------------
function handleTitle() {
  if (input.actionPressed(0, 'attack') || input.actionPressed(1, 'attack')) ctrl.onStart();
}

function handleModeSelect() {
  for (let pi = 0; pi < 2; pi++) {
    if (input.actionPressed(pi, 'left') || input.actionPressed(pi, 'up')) ms.sel = 1;
    if (input.actionPressed(pi, 'right') || input.actionPressed(pi, 'down')) ms.sel = 2;
  }
  if (input.actionPressed(0, 'attack') || input.actionPressed(1, 'attack')) ctrl.onModeChosen(ms.sel);
  if (input.actionPressed(0, 'interact') || input.actionPressed(1, 'interact')) game.phase = Phase.TITLE;
}

function handleClassSelect() {
  const active = game.numPlayers;
  for (let pi = 0; pi < active; pi++) {
    if (input.actionPressed(pi, 'interact')) { cs.confirmed[pi] = false; continue; }
    if (cs.confirmed[pi]) continue;
    const cols = 4;
    let c = cs.cursor[pi];
    if (input.actionPressed(pi, 'left')) c = (c - 1 + CLASS_LIST.length) % CLASS_LIST.length;
    if (input.actionPressed(pi, 'right')) c = (c + 1) % CLASS_LIST.length;
    if (input.actionPressed(pi, 'up')) c = (c - cols + CLASS_LIST.length) % CLASS_LIST.length;
    if (input.actionPressed(pi, 'down')) c = (c + cols) % CLASS_LIST.length;
    cs.cursor[pi] = c;
    if (input.actionPressed(pi, 'attack')) cs.confirmed[pi] = true;
  }
  let all = true;
  for (let pi = 0; pi < active; pi++) if (!cs.confirmed[pi]) all = false;
  if (all) {
    const keys = [];
    for (let pi = 0; pi < active; pi++) keys.push(CLASS_LIST[cs.cursor[pi]].key);
    ctrl.onClassChosen(keys);
  }
}

function handleShop() {
  const shop = game.shop;
  if (!shop) return;
  const active = game.numPlayers;
  for (let pi = 0; pi < active; pi++) {
    if (inv[pi].open) continue;
    const p = game.players[pi];
    const n = shop.stock.length;
    const COLS = 4;
    const lastRow = Math.floor((n - 1) / COLS) * COLS; // index of first item in last row
    const cur = shop.cursor[pi];
    const onDescend = cur >= n;
    if (input.actionPressed(pi, 'up')) {
      if (onDescend) shop.cursor[pi] = lastRow + Math.min(cur - n, n - lastRow - 1);
      else shop.cursor[pi] = cur - COLS >= 0 ? cur - COLS : n; // up from row 0 goes to descend
      shop._scroll = shop.cursor[pi];
    }
    if (input.actionPressed(pi, 'down')) {
      if (onDescend) shop.cursor[pi] = cur - n; // col position back to top
      else if (cur + COLS >= n) shop.cursor[pi] = n; // any bottom-row item → descend
      else shop.cursor[pi] = cur + COLS;
      shop._scroll = shop.cursor[pi];
    }
    if (input.actionPressed(pi, 'left'))  { if (!onDescend) { shop.cursor[pi] = cur - 1 >= 0 ? cur - 1 : n - 1; shop._scroll = shop.cursor[pi]; } }
    if (input.actionPressed(pi, 'right')) { if (!onDescend) { shop.cursor[pi] = cur + 1 < n ? cur + 1 : 0;       shop._scroll = shop.cursor[pi]; } }
    if (input.actionPressed(pi, 'attack')) {
      const idx = shop.cursor[pi];
      if (idx >= n) {
        shop.ready[pi] = true; // descend button
      } else {
        const res = buy(p, shop.stock[idx]);
        if (res.ok) {
          shop.stock.splice(idx, 1);
          for (let k = 0; k < 2; k++) {
            if (shop.cursor[k] > idx) shop.cursor[k]--;
            shop.cursor[k] = Math.max(0, Math.min(shop.cursor[k], shop.stock.length));
          }
        } else flashPanel(pi, res.reason);
      }
    }
    if (input.actionPressed(pi, 'interact')) shop.ready[pi] = !shop.ready[pi];
  }
  let allReady = true;
  for (let pi = 0; pi < active; pi++) if (!shop.ready[pi]) allReady = false;
  if (allReady) ctrl.onDescend();
}

function handleEndScreen() {
  // Only restart when name input is not focused
  const nameInput = document.getElementById('hs-name');
  if (nameInput && document.activeElement === nameInput) return;
  if (input.actionPressed(0, 'attack') || input.actionPressed(1, 'attack')) ctrl.onRestart();
}

let panelFlash = ['', ''];
let panelFlashT = [0, 0];
function flashPanel(pi, msg) { panelFlash[pi] = msg; panelFlashT[pi] = 1.6; }

// ---------------- rendering ----------------
function potionSVG(liq) {
  const glass = liq === '#bb1828' ? 'rgba(255,180,180,0.8)' : 'rgba(140,180,255,0.8)';
  return `<svg viewBox="0 0 20 28" width="12" height="17" style="display:inline-block;vertical-align:middle;margin-right:3px;image-rendering:pixelated">` +
    `<ellipse cx="10" cy="19" rx="8" ry="7" fill="${liq}"/>` +
    `<ellipse cx="10" cy="19" rx="8" ry="7" fill="none" stroke="${glass}" stroke-width="1.2"/>` +
    `<ellipse cx="6" cy="15" rx="2" ry="3.5" fill="rgba(255,255,255,0.3)"/>` +
    `<rect x="7" y="8" width="6" height="8" fill="${liq}"/>` +
    `<rect x="7" y="8" width="6" height="8" fill="none" stroke="${glass}" stroke-width="1"/>` +
    `<rect x="6" y="3" width="8" height="6" rx="2" fill="#c08030"/>` +
    `</svg>`;
}

function bar(label, cur, max, color) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  const icon = label === 'HP' ? potionSVG('#bb1828') : label === 'MP' ? potionSVG('#3050ee') : '';
  return `<div class="bar"><div class="fill" style="width:${pct}%;background:${color}"></div>` +
    `<span>${icon}${Math.ceil(cur)}/${Math.round(max)}</span></div>`;
}

function eqLine(p) {
  const slot = (icon, it) => {
    if (!it) return `<div class="eqrow"><span class="ico">${icon}</span><i>—</i></div>`;
    return `<div class="eqrow"><span class="ico">${icon}</span>` +
      `<span class="eqname" style="color:${it.color || '#fff'}">${it.name}</span>` +
      `<small class="eqstats">${it.desc || ''}</small></div>`;
  };
  return `<div class="equip">` +
    slot('⚔️', p.equipment.weapon) + slot('🛡️', p.equipment.armor) + slot('💍', p.equipment.trinket) + `</div>`;
}

// Computed character stats (base + level + skills + equipment).
function statsSummary(p) {
  const s = p.stats;
  const cells = [
    ['ATK', Math.round(s.attackDamage)],
    ['DMG', `+${Math.round((s.damageMult - 1) * 100)}%`],
    ['Crit', `${Math.round(s.critChance * 100)}%`],
    ['CritX', `${s.critMult.toFixed(1)}×`],
    ['Armor', Math.round(s.armor)],
    ['Speed', Math.round(s.moveSpeed)],
    ['Atk/s', (1 / s.attackCooldown).toFixed(1)],
    ['Regen', `${(s.hpRegen || 0).toFixed(1)}/s`],
  ];
  return `<div class="statgrid">` +
    cells.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('') + `</div>`;
}

function rarityTag(it) {
  return it.rarityName ? `<b class="rar" style="color:${it.color}">${it.rarityName}</b> ` : '';
}

function invSection(pi) {
  const st = inv[pi], p = game.players[pi];
  const moveKeys = pi === 0 ? 'WASD' : '↑↓←→';
  const atkKey = keyName(pi, 'attack');
  const ablKey = keyName(pi, 'ability');
  const invKey = keyName(pi, 'inventory');
  const intKey = keyName(pi, 'interact');
  if (!st.open) return `<div class="hint" style="line-height:1.7">
    <b style="color:#c090ff">P${pi+1} Controls</b><br>
    ${moveKeys} move &nbsp;·&nbsp; [${atkKey}] attack<br>
    [${ablKey}] ability &nbsp;·&nbsp; [${intKey}] use/sell<br>
    [${invKey}] inventory/skills${p.skillPoints > 0 ? ` &nbsp;<b class="blink">${p.skillPoints} SP!</b>` : ''}
  </div>`;
  const tabs = `<div class="tabs"><span class="${st.tab === 'items' ? 'on' : ''}">Items</span>` +
    `<span class="${st.tab === 'skills' ? 'on' : ''}">Skills</span></div>`;
  let body = '';
  if (st.tab === 'items') {
    if (!p.inventory.length) body = `<div class="empty">empty — grab loot or buy gear in the shop</div>`;
    else body = p.inventory.map((it, i) => {
      const sel = i === Math.min(st.itemCur, p.inventory.length - 1);
      const action = it.slot === 'consumable' ? 'use' : 'equip';
      const btns = sel && isMobile
        ? `<div style="display:flex;gap:6px;margin-top:5px">` +
          `<button data-equip-idx="${i}" style="font-size:11px;padding:3px 10px;background:#1c2238;border:2px solid #5580cc;color:#aac4ff;border-radius:4px;font-family:monospace;cursor:pointer">EQUIP</button>` +
          `<button data-sell-idx="${i}" style="font-size:11px;padding:3px 10px;background:#2a1010;border:2px solid #c03030;color:#ff8080;border-radius:4px;font-family:monospace;cursor:pointer">SELL ${sellValue(it)}g</button>` +
          `</div>`
        : '';
      return `<div class="row ${sel ? 'sel' : ''}" data-row-idx="${i}" data-row-tab="items"><div class="rowmain">` +
        `<span class="ico">${it.icon || '❔'}</span>` +
        `<span style="color:${it.color || '#fff'}">${it.name}</span></div>` +
        `<small>${rarityTag(it)}${it.desc || ''}${sel && !isMobile ? ` · ${keyName(pi, 'attack')}:${action}` : ''}</small>${btns}</div>`;
    }).join('');
  } else {
    body = p.cls.tree.map((node, i) => {
      const rank = p.skills[node.id] || 0;
      const sel = i === st.skillCur;
      const can = p.canBuy(node);
      const cost = node.cost > 1 ? ` <span class="cost">(${node.cost} SP)</span>` : '';
      const badge = node.passive ? `<span class="pbadge">PASSIVE</span> ` : '';
      const buyBtn = sel && can && isMobile
        ? `<button data-buy-skill="${i}" style="font-size:11px;padding:3px 10px;margin-top:5px;background:#1c2a1c;border:2px solid #3baa60;color:#7bff9b;border-radius:4px;font-family:monospace;cursor:pointer">BUY (${node.cost} SP)</button>`
        : '';
      return `<div class="row ${sel ? 'sel' : ''} ${can ? 'buyable' : ''} ${node.passive ? 'passive' : ''}" data-row-idx="${i}" data-row-tab="skills"><div class="rowmain">` +
        `<span class="ico">${node.passive ? '★' : '✦'}</span><span>${badge}${node.name} <b>${rank}/${node.maxRank}</b>${cost}</span></div>` +
        `<small>${node.desc}${sel && !isMobile && can ? ' · buy' : (rank >= node.maxRank ? ' · maxed' : '')}</small>${buyBtn}</div>`;
    }).join('');
  }
  const closeBtn = isMobile && game.phase === Phase.SHOP
    ? `<button data-panel-close style="width:100%;margin-bottom:8px;padding:6px;background:#1a0d0d;border:2px solid #c03030;color:#ff8080;border-radius:4px;font-family:monospace;font-size:12px;cursor:pointer">✕ CLOSE BAG</button>`
    : '';
  return `<div class="inv-open">${closeBtn}${tabs}<div class="rows">${body}</div>` +
    `<div class="hint">${pi === 0 ? 'WASD' : '↑↓←→'} browse · [${keyName(pi, 'attack')}] use/buy · [${keyName(pi, 'interact')}] sell · [${keyName(pi, 'inventory')}] close</div></div>`;
}

function keyName(pi, action) {
  const code = KEYMAPS[pi][action];
  return code.replace('Key', '').replace('Arrow', '').replace('Space', 'Space')
    .replace('Slash', '/').replace('Quote', "'").replace('Semicolon', ';');
}

const _panelCache = ['', ''];
export function invalidatePanelCache() { _panelCache[0] = _panelCache[1] = ''; }
function renderPanels() {
  for (let pi = 0; pi < 2; pi++) {
    const p = game.players[pi];
    const el = els.panels[pi];
    let html;
    if (!p) {
      const inactive = game.numPlayers === 1 && pi === 1 && game.phase !== Phase.TITLE && game.phase !== Phase.MODE_SELECT;
      html = `<div class="pnl-head" style="color:${P_COLOR[pi]}">Player ${pi + 1}</div>` +
        (inactive ? `<div class="empty">Not in game — 1-player mode</div>` : '');
    } else {
      if (panelFlashT[pi] > 0) panelFlashT[pi] -= 1 / 60;
      const status = p.downed ? `<span class="downed">DOWNED</span>` : '';
      html =
        `<div class="pnl-head" style="color:${P_COLOR[pi]}">P${pi + 1} · ${p.cls.name} <b>Lv ${p.level}</b> ${status}</div>` +
        bar('HP', Math.round(p.hp), p.stats.maxHp, '#e0463c') +
        bar('MP', Math.round(p.mana), p.stats.maxMana, '#3c7be0') +
        bar('XP', p.xp, p.xpNext, '#e0c23c') +
        `<div class="stat"><span>💰 ${p.gold}</span>` +
        (p.skillPoints > 0 ? `<span class="blink">★ ${p.skillPoints} SP</span>` : '<span></span>') + `</div>` +
        eqLine(p) +
        statsSummary(p) +
        (panelFlashT[pi] > 0 ? `<div class="flashmsg">${panelFlash[pi]}</div>` : '') +
        invSection(pi);
    }
    // Only replace DOM when HTML actually changed — constant thrashing breaks tap events on iOS
    if (html !== _panelCache[pi]) {
      el.innerHTML = html;
      _panelCache[pi] = html;
      if (p && inv[pi].open) {
        const sel = el.querySelector('.row.sel');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
      }
    }
  }
}

function renderOverlay() {
  const o = els.overlay;
  const hideSettings = game.phase === Phase.TITLE || game.phase === Phase.CLASS_SELECT || game.phase === Phase.MODE_SELECT;
  document.getElementById('settings-btn').style.display = hideSettings ? 'none' : '';

  if (game.phase === Phase.PLAYING) {
    o.classList.add('hidden'); o.innerHTML = '';
    lastOverlayPhase = null;
    lastShopKey = null;
    return;
  }
  o.classList.remove('hidden');
  // Title/end screens: cache by compound key so sub-state changes (howTo, artPreview) still re-render,
  // but 60fps DOM stomping is avoided (which breaks click events on the buttons).
  const titleKey = `title_${_showHowTo}_${_showArtPreview}`;
  if (game.phase === Phase.TITLE) {
    if (lastOverlayPhase === titleKey) return;
    lastOverlayPhase = titleKey;
    o.innerHTML = titleHTML();
    return;
  }
  const isEnd = game.phase === Phase.GAME_OVER || game.phase === Phase.WIN;
  if (isEnd && lastOverlayPhase === game.phase) return;
  lastOverlayPhase = game.phase;

  if (game.phase === Phase.MODE_SELECT) o.innerHTML = modeSelectHTML();
  else if (game.phase === Phase.CLASS_SELECT) o.innerHTML = classSelectHTML();
  else if (game.phase === Phase.SHOP) {
    // Don't stomp the overlay while settings modal is open
    if (!document.getElementById('settings-modal').classList.contains('hidden')) return;
    // Only re-render when shop state actually changes (prevents settings-btn flash)
    const shop = game.shop;
    const shopKey = shop
      ? `${shop.stock.length}|${shop.cursor.join()}|${shop.ready.join()}|${game.players.map(p=>p.gold).join()}`
      : '';
    if (shopKey === lastShopKey) return;
    lastShopKey = shopKey;
    o.innerHTML = shopHTML(); scrollShop();
  }
  else if (game.phase === Phase.GAME_OVER) { o.innerHTML = endHTML(false); bindEndScreenButtons(); }
  else if (game.phase === Phase.WIN) { o.innerHTML = endHTML(true); bindEndScreenButtons(); }
}

function scrollShop() {
  const shop = game.shop;
  if (!shop || shop._scroll == null) return;
  const row = els.overlay.querySelector(`.shopcard[data-shop-idx="${shop._scroll}"]`);
  if (row) row.scrollIntoView({ block: 'nearest' });
  shop._scroll = null;
}

let _showHowTo = false;
export function titleToggleHowTo() { _showHowTo = !_showHowTo; lastOverlayPhase = null; }

let _showArtPreview = false;
export function titleToggleArtPreview(show) {
  _showArtPreview = show;
  lastOverlayPhase = null;
}
function artPreviewHTML() {
  const vial = (liq) => `<svg viewBox="0 0 28 28" width="48" height="48" style="image-rendering:pixelated">
    <rect x="7" y="8" width="14" height="14" rx="2" fill="rgba(200,230,255,0.35)" stroke="rgba(200,230,255,0.85)" stroke-width="1"/>
    <rect x="8.5" y="15" width="11" height="7" rx="1.5" fill="${liq}"/>
    <rect x="8.5" y="9" width="3" height="8" rx="1" fill="rgba(255,255,255,0.5)"/>
    <line x1="9" y1="8" x2="7" y2="5" stroke="rgba(200,230,255,0.85)" stroke-width="1"/>
    <line x1="19" y1="8" x2="21" y2="5" stroke="rgba(200,230,255,0.85)" stroke-width="1"/>
    <rect x="9" y="2" width="10" height="4" rx="1.5" fill="#c89050"/>
  </svg>`;
  const staff = (orb, wood='#7a5022') => `<svg viewBox="0 0 28 28" width="48" height="48" style="image-rendering:pixelated">
    <rect x="12" y="6" width="4" height="20" rx="1.5" fill="${wood}"/>
    <rect x="12" y="6" width="1.5" height="20" fill="rgba(255,255,255,0.2)" rx="1"/>
    <rect x="11" y="13" width="6" height="4" rx="1" fill="#3a2010"/>
    <circle cx="14" cy="5" r="7" fill="${orb}" opacity="0.2"/>
    <circle cx="14" cy="5" r="5" fill="${orb}" opacity="0.95"/>
    <circle cx="12" cy="3" r="2.5" fill="rgba(255,255,255,0.45)"/>
  </svg>`;
  const row = (icon, label) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
    ${icon}<span style="font-size:11px;color:#9080b0;text-align:center">${label}</span></div>`;
  return `<div class="card wide" style="text-align:left">
    <button data-artpreview-back style="background:none;border:1px solid #5a4a7a;color:#9070c0;font-family:monospace;font-size:12px;padding:5px 12px;border-radius:5px;cursor:pointer;margin-bottom:16px">← Back</button>
    <h2 style="color:#c080ff;margin:0 0 14px">Art Preview</h2>
    <div style="color:#9080b0;font-size:12px;margin-bottom:8px;letter-spacing:1px;text-transform:uppercase">Potions</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px">
      ${row(vial('#e03050'), 'Health')}
      ${row(vial('#5080ff'), 'Mana')}
    </div>
    <div style="color:#9080b0;font-size:12px;margin-bottom:8px;letter-spacing:1px;text-transform:uppercase">Staves</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px">
      ${row(staff('#ff6010'), 'Fire')}
      ${row(staff('#c080ff'), 'Bone')}
      ${row(staff('#80d0ff'), 'Ice')}
      ${row(staff('#8bc34a','#5a3a1a'), 'Druid')}
      ${row(staff('#e8c34a'), 'Rare')}
    </div>
    <div style="color:#9080b0;font-size:12px;margin-bottom:8px;letter-spacing:1px;text-transform:uppercase">Blades</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      ${['Sword','Axe','Dagger'].map(name => {
        const svg = itemIconSVG({slot:'weapon',name,color:'#b0b8c8'}).replace('width="28" height="28"','width="64" height="64"');
        return row(svg, name);
      }).join('')}
    </div>
  </div>`;
}

function howToPlayHTML() {
  const sec = (title, color, body) =>
    `<div style="margin-bottom:14px;text-align:left">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${color};margin-bottom:5px">${title}</div>
      ${body}
    </div>`;
  const row = (label, val) =>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      <span style="color:#aaa">${label}</span><span style="color:#e0d8f0">${val}</span>
    </div>`;

  const controls = isMobile
    ? `${row('Move', 'Left joystick')}${row('Attack', 'ATK button')}${row('Ability', 'SKL button')}${row('Revive ally', 'Walk over them')}${row('Inventory / Shop', 'BAG button')}`
    : `${row('P1 Move', 'W A S D')}${row('P1 Attack', 'Space')}${row('P1 Ability', 'E')}${row('P1 Revive / Interact', 'Q')}${row('P1 Inventory', 'R')}
       <div style="height:6px"></div>
       ${row('P2 Move', 'Arrow Keys')}${row('P2 Attack', '/')}${row('P2 Ability', "'")}${row('P2 Revive / Interact', ';')}${row('P2 Inventory', 'P')}`;

  return `<div class="card" style="text-align:center;padding:22px 20px;max-width:520px">
    <button data-htp-back style="float:left;background:none;border:1px solid #5a4a7a;color:#c080ff;font-family:monospace;font-size:12px;padding:4px 10px;border-radius:4px;cursor:pointer">← Back</button>
    <h2 style="color:#c080ff;letter-spacing:2px;margin:0 0 16px">HOW TO PLAY</h2>

    ${sec('The Goal', '#ffd060',
      `<p style="font-size:12px;color:#ccc;margin:0">Descend all <b style="color:#ffd060">${MAX_FLOORS} floors</b> of the dungeon. Every few floors you face a boss — defeat it to continue. Both players must survive to win.</p>`
    )}

    ${sec('Controls', '#80c8ff', `<div>${controls}</div>`)}

    ${sec('Classes', '#7bff9b',
      `<p style="font-size:12px;color:#ccc;margin:0 0 4px">Choose from <b>8 unique classes</b>. Each has a special <b style="color:#a0e0ff">ability</b> that costs mana, a <b style="color:#ffb060">passive</b> skill you can upgrade, and a full <b style="color:#c080ff">skill tree</b> to unlock.</p>
       <p style="font-size:12px;color:#ccc;margin:0">Use your ability until you run out of mana — auto-attacks refill it slowly.</p>`
    )}

    ${sec('Leveling Up', '#c080ff',
      `<p style="font-size:12px;color:#ccc;margin:0">Kill enemies to gain XP. Each level earns <b>1 Skill Point</b>. Spend points in your inventory to unlock class skills and stat upgrades.</p>`
    )}

    ${sec('The Shop', '#ff9060',
      `<p style="font-size:12px;color:#ccc;margin:0">Between floors a shop appears. Find <b>weapons, armor, and trinkets</b> — from Common all the way to <b style="color:#ff4040">Mythical</b>. Buy gear with gold or sell items you don't need. When both players are ready, descend.</p>`
    )}

    ${sec('Reviving', '#ff6090',
      `<p style="font-size:12px;color:#ccc;margin:0">If your ally falls, <b>walk over them</b> and hold to revive. If both players are down at the same time, it's game over.</p>`
    )}

    <button data-htp-back style="margin-top:14px;background:#1c1730;border:2px solid #c080ff;color:#c080ff;font-family:monospace;font-size:13px;padding:8px 24px;border-radius:6px;cursor:pointer">← Back to Title</button>
  </div>`;
}

function titleHTML() {
  if (_showHowTo) return howToPlayHTML();
  if (_showArtPreview) return artPreviewHTML();

  const controls = isMobile
    ? `<p style="font-size:13px;margin:4px 0;color:#b0a0cc">Unlock unique class skills. Find epic, legendary and mythical items.</p>`
    : `<div class="controls two">
      <div><h3 style="color:${P_COLOR[0]}">Player 1</h3>
        <div>Move: <b>W A S D</b></div><div>Attack: <b>Space</b></div>
        <div>Ability: <b>E</b></div><div>Interact/Revive: <b>Q</b></div><div>Inventory: <b>R</b></div></div>
      <div><h3 style="color:${P_COLOR[1]}">Player 2</h3>
        <div>Move: <b>Arrow Keys</b></div><div>Attack: <b>/</b></div>
        <div>Ability: <b>'</b></div><div>Interact/Revive: <b>;</b></div><div>Inventory: <b>P</b></div></div>
    </div>`;
  const subtitle = isMobile
    ? `A dungeon adventure game · two player co-op available on desktop`
    : `A local co-op pixel roguelike · descend ${MAX_FLOORS} floors`;
  const prompt = isMobile ? '▶ Tap to begin' : 'Press an Attack key to begin';
  return `<div class="card title" style="text-align:center;padding:28px 22px;max-width:520px">
    <h1 style="font-size:clamp(28px,6vw,52px);margin:0 0 4px;letter-spacing:3px;color:#c080ff;text-shadow:0 0 28px #c080ffaa,0 0 8px #c080ff55;text-transform:uppercase">⚔ Dungeon For Two ⚔</h1>
    <p class="sub" style="margin:6px 0 10px;font-size:13px;opacity:0.7">${subtitle}</p>
    <div style="border-top:1px solid rgba(255,255,255,0.1);margin:10px 0"></div>
    ${controls}
    <div style="border-top:1px solid rgba(255,255,255,0.1);margin:10px 0 8px"></div>
    <div style="display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap">
      <p class="blink big" style="font-size:18px;margin:0;color:#e8d87a;letter-spacing:1px">${prompt}</p>
      <button data-htp-open style="background:none;border:1px solid #5a4a7a;color:#9070c0;font-family:monospace;font-size:12px;padding:5px 12px;border-radius:5px;cursor:pointer">How to Play</button>
      <button data-artpreview-open style="background:none;border:1px solid #3a6a3a;color:#70b070;font-family:monospace;font-size:12px;padding:5px 12px;border-radius:5px;cursor:pointer">Art</button>
    </div>
    <p class="credit" style="margin-top:14px">Music: "Make Believe" by Giulio Fazio · <a href="https://uppbeat.io/t/giulio-fazio/make-believe" target="_blank">uppbeat.io</a></p>
  </div>`;
}

function modeSelectHTML() {
  if (isMobile) {
    // On mobile: skip the selection screen, auto-select 1P
    setTimeout(() => ctrl.onModeChosen(1), 0);
    return '<div class="card"><p>Loading…</p></div>';
  }
  const opt = (n, label, desc) => `<div class="modecard ${ms.sel === n ? 'sel' : ''}">
    <div class="modenum">${n}P</div><div class="modelabel">${label}</div><div class="modedesc">${desc}</div></div>`;
  return `<div class="card">
    <h2>How many players?</h2>
    <p class="sub">Move to choose · Attack to confirm</p>
    <div class="modegrid">
      ${opt(1, 'Solo', 'Play alone. One hero, one class.')}
      ${opt(2, 'Co-op', 'Two heroes on one keyboard.')}
    </div>
    <p class="statusline blink">${ms.sel === 1 ? 'Solo' : 'Co-op (2 players)'} selected</p>
  </div>`;
}

function weaponSVG(key, a) {
  // Drawn pointing right (facing x=1) from anchor 0,0; caller positions via translate
  switch (key) {
    case 'warrior':
      return `<rect x="0" y="-1" width="10" height="2" fill="#7a5530"/>
              <rect x="7" y="-5" width="5" height="9" fill="${a.accent}"/>
              <rect x="9" y="-7" width="3" height="3" fill="${a.accent}"/>
              <rect x="9" y="5" width="3" height="3" fill="${a.accent}"/>
              <rect x="7" y="-5" width="1" height="5" fill="rgba(255,255,255,0.4)"/>`;
    case 'ranger':
      return `<rect x="3" y="-7" width="2" height="14" fill="${a.accent}"/>
              <rect x="2" y="-7" width="1" height="3" fill="${a.accent}"/>
              <rect x="2" y="4" width="1" height="3" fill="${a.accent}"/>
              <line x1="3" y1="-7" x2="1" y2="0" stroke="#c8c8b0" stroke-width="1"/>
              <line x1="1" y1="0" x2="3" y2="7" stroke="#c8c8b0" stroke-width="1"/>
              <rect x="-4" y="-1" width="8" height="1" fill="#c8a060"/>
              <rect x="3" y="-1" width="3" height="1" fill="#aaaaaa"/>`;
    case 'firemage':
      return `<rect x="0" y="-1" width="11" height="2" fill="#7a5022"/>
              <circle cx="12" cy="0" r="4" fill="#ff6010"/>
              <circle cx="11" cy="-1" r="2" fill="#ffdd40"/>
              <circle cx="12" cy="0" r="6" fill="rgba(255,80,0,0.25)"/>`;
    case 'necromancer':
      return `<rect x="0" y="-1" width="11" height="2" fill="#2a1a3a"/>
              <circle cx="12" cy="0" r="4" fill="#c080ff"/>
              <circle cx="11" cy="-1" r="2" fill="#e0c0ff"/>
              <circle cx="12" cy="0" r="7" fill="rgba(140,60,255,0.2)"/>`;
    case 'cleric':
      return `<rect x="0" y="-1" width="9" height="2" fill="#9a8050"/>
              <rect x="9" y="-4" width="4" height="8" fill="${a.accent}"/>
              <rect x="7" y="-2" width="8" height="4" fill="${a.accent}"/>
              <rect x="9" y="-4" width="1" height="4" fill="rgba(255,255,255,0.45)"/>
              <rect x="7" y="-2" width="4" height="1" fill="rgba(255,255,255,0.45)"/>`;
    case 'rogue':
      return `<rect x="0" y="-1" width="5" height="2" fill="#3a3040"/>
              <rect x="5" y="-1" width="8" height="2" fill="#d0d4e0"/>
              <rect x="11" y="0" width="3" height="1" fill="#d0d4e0"/>
              <rect x="5" y="-1" width="6" height="1" fill="rgba(255,255,255,0.5)"/>`;
    case 'paladin':
      return `<rect x="0" y="-1" width="5" height="2" fill="#7a5022"/>
              <rect x="4" y="-4" width="3" height="8" fill="${a.accent}"/>
              <rect x="7" y="-1" width="10" height="2" fill="#d8dce8"/>
              <rect x="15" y="-1" width="3" height="1" fill="#d8dce8"/>
              <rect x="7" y="-1" width="8" height="1" fill="rgba(255,255,255,0.5)"/>`;
    case 'frostmage':
      return `<rect x="0" y="-1" width="10" height="2" fill="#3060a0"/>
              <rect x="10" y="-4" width="4" height="8" fill="#80d0ff"/>
              <rect x="12" y="-6" width="2" height="3" fill="#80d0ff"/>
              <rect x="12" y="3" width="2" height="3" fill="#80d0ff"/>
              <rect x="10" y="-4" width="1" height="4" fill="rgba(200,240,255,0.5)"/>
              <circle cx="12" cy="0" r="7" fill="rgba(100,180,255,0.15)"/>`;
    default:
      return `<rect x="0" y="-1" width="12" height="2" fill="#888"/>`;
  }
}

function classSpriteSVG(a, key) {
  const skin = '#e8c9a0';
  let headgear = '';
  if (a.head === 'helm') {
    headgear = `
      <rect x="7" y="6" width="12" height="5" fill="${a.accent}"/>
      <rect x="7" y="11" width="2" height="4" fill="${a.accent}"/>
      <rect x="7" y="6" width="12" height="1" fill="rgba(255,255,255,0.32)"/>
      <rect x="7" y="6" width="1" height="5" fill="rgba(255,255,255,0.25)"/>
      <rect x="17" y="6" width="2" height="5" fill="rgba(0,0,0,0.35)"/>`;
  } else if (a.head === 'hat') {
    headgear = `
      <rect x="6" y="9" width="14" height="3" fill="${a.body}"/>
      <rect x="10" y="2" width="6" height="8" fill="${a.body}"/>
      <rect x="6" y="9" width="14" height="1" fill="rgba(255,255,255,0.24)"/>
      <rect x="10" y="2" width="1" height="8" fill="rgba(255,255,255,0.22)"/>
      <rect x="10" y="2" width="6" height="1" fill="rgba(255,255,255,0.22)"/>
      <rect x="14" y="2" width="2" height="8" fill="rgba(0,0,0,0.32)"/>
      <rect x="10" y="9" width="6" height="1" fill="rgba(0,0,0,0.28)"/>`;
  } else if (a.head === 'hood') {
    headgear = `
      <rect x="7" y="5" width="12" height="6" fill="${a.body}"/>
      <rect x="7" y="5" width="12" height="1" fill="rgba(255,255,255,0.22)"/>
      <rect x="7" y="5" width="1" height="6" fill="rgba(255,255,255,0.2)"/>
      <rect x="17" y="5" width="2" height="6" fill="rgba(0,0,0,0.3)"/>`;
  }
  return `<svg viewBox="0 0 26 36" width="36" height="46" style="display:block;margin:0 auto 4px;image-rendering:pixelated">
    <!-- drop shadow -->
    <ellipse cx="13" cy="35" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
    <!-- legs -->
    <rect x="7" y="27" width="4" height="7" fill="#2a2a30"/>
    <rect x="15" y="27" width="4" height="7" fill="#2a2a30"/>
    <rect x="7" y="27" width="1" height="7" fill="rgba(255,255,255,0.18)"/>
    <rect x="15" y="27" width="1" height="7" fill="rgba(255,255,255,0.18)"/>
    <rect x="10" y="27" width="1" height="7" fill="rgba(0,0,0,0.4)"/>
    <rect x="18" y="27" width="1" height="7" fill="rgba(0,0,0,0.4)"/>
    <!-- body -->
    <rect x="6" y="15" width="14" height="12" fill="${a.body}"/>
    <rect x="6" y="15" width="2" height="12" fill="rgba(255,255,255,0.22)"/>
    <rect x="6" y="15" width="14" height="1" fill="rgba(255,255,255,0.18)"/>
    <rect x="18" y="15" width="2" height="12" fill="rgba(0,0,0,0.35)"/>
    <rect x="6" y="25" width="14" height="2" fill="rgba(0,0,0,0.28)"/>
    <!-- trim -->
    <rect x="6" y="15" width="14" height="3" fill="${a.trim}"/>
    <rect x="6" y="15" width="14" height="1" fill="rgba(255,255,255,0.25)"/>
    <!-- head -->
    <rect x="8" y="7" width="10" height="9" fill="${skin}"/>
    <rect x="8" y="7" width="2" height="9" fill="rgba(255,255,255,0.26)"/>
    <rect x="8" y="7" width="10" height="1" fill="rgba(255,255,255,0.3)"/>
    <rect x="16" y="7" width="2" height="9" fill="rgba(120,80,40,0.38)"/>
    <rect x="8" y="15" width="10" height="1" fill="rgba(0,0,0,0.2)"/>
    <!-- eyes -->
    <rect x="10" y="11" width="2" height="2" fill="#3a2010"/>
    <rect x="14" y="11" width="2" height="2" fill="#3a2010"/>
    <rect x="10" y="11" width="1" height="1" fill="rgba(255,255,255,0.5)"/>
    <rect x="14" y="11" width="1" height="1" fill="rgba(255,255,255,0.5)"/>
    <!-- headgear -->
    ${headgear}
    <!-- weapon (pointing right, anchored at body side) -->
    <g transform="translate(20,21)">${weaponSVG(key, a)}</g>
  </svg>`;
}

function classSelectHTML() {
  const active = game.numPlayers;
  const hint = isMobile ? 'Tap to select · tap again to confirm' : 'Move to browse · Attack to lock in · Interact to unlock';
  const cards = CLASS_LIST.map((c, i) => {
    const marks = [];
    for (let pi = 0; pi < active; pi++) if (cs.cursor[pi] === i) {
      marks.push(`<span class="pmark ${cs.confirmed[pi] ? 'lock' : ''}" style="background:${P_COLOR[pi]}">P${pi + 1}${cs.confirmed[pi] ? '✓' : ''}</span>`);
    }
    const isSel = cs.cursor[0] === i && marks.length > 0;
    const actionBtns = isSel && isMobile && !cs.confirmed[0]
      ? `<div style="display:flex;gap:5px;margin-top:6px">
           <button data-confirm-class style="flex:1;padding:5px 2px;background:#1c2a1c;border:2px solid #3baa60;color:#7bff9b;border-radius:4px;font-family:monospace;font-size:11px;cursor:pointer">✔ PLAY</button>
           <button data-detail-class style="flex:1;padding:5px 2px;background:#1a1a2e;border:2px solid #6060aa;color:#aaaaff;border-radius:4px;font-family:monospace;font-size:11px;cursor:pointer">${cs._detail ? '▲ LESS' : '▼ INFO'}</button>
         </div>`
      : '';
    return `<div class="clscard${isSel ? ' sel' : ''}" data-cls-idx="${i}">
      ${classSpriteSVG(c.art, c.key)}
      <div class="cname">${c.name}</div>
      <div class="cability">${c.abilityName}</div>
      <div class="cblurb">${c.blurb}</div>
      <div class="marks">${marks.join('')}</div>
      ${actionBtns}
    </div>`;
  }).join('');
  const status = [];
  for (let pi = 0; pi < active; pi++)
    status.push(`<span style="color:${P_COLOR[pi]}">P${pi + 1}: ${cs.confirmed[pi] ? 'READY ✓' : 'choosing…'}</span>`);
  // Detail view: replaces grid when INFO is open on mobile
  if (isMobile && cs._detail) {
    const dc = CLASS_LIST[cs.cursor[0]];
    const ds = dc.stats;
    const passive = dc.tree[0];
    const classNodes = dc.tree.slice(1, 4);
    const statChips = [
      ds.maxHp ? `❤️ ${ds.maxHp} HP` : '',
      ds.maxMana ? `💧 ${ds.maxMana} MP` : '',
      ds.moveSpeed ? `👟 ${ds.moveSpeed} spd` : '',
      ds.armor ? `🛡️ ${ds.armor} armor` : '',
      ds.critChance ? `⚡ ${Math.round(ds.critChance * 100)}% crit` : '',
      ds.weaponType === 'melee' ? '⚔️ Melee' : '🏹 Ranged',
    ].filter(Boolean);
    return `<div class="card wide">
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button data-detail-class style="flex:1;padding:7px;background:#1a1a2e;border:2px solid #6060aa;color:#aaaaff;border-radius:4px;font-family:monospace;font-size:13px;cursor:pointer">← BACK</button>
        <button data-confirm-class style="flex:1;padding:7px;background:#1c2a1c;border:2px solid #3baa60;color:#7bff9b;border-radius:4px;font-family:monospace;font-size:13px;cursor:pointer">✔ PLAY ${dc.name}</button>
      </div>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
        ${classSpriteSVG(dc.art, dc.key)}
        <div>
          <div style="font-size:18px;font-weight:bold;color:#e8d87a">${dc.name}</div>
          <div style="color:#aaaaff;font-size:12px">${dc.abilityName} · ${dc.blurb}</div>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px">
        ${statChips.map(s => `<span style="background:rgba(255,255,255,0.07);border:1px solid #444;border-radius:4px;padding:3px 8px;color:#ccc;font-size:12px">${s}</span>`).join('')}
      </div>
      <div style="background:#0e0c1a;border:1px solid #2a2040;border-radius:5px;padding:10px;margin-bottom:8px">
        <div style="color:#aaaaff;font-weight:bold;font-size:13px;margin-bottom:3px">✨ ${dc.abilityName} <span style="color:#666;font-size:11px">${dc.abilityCost} MP</span></div>
        <div style="color:#999;font-size:12px">${dc.blurb}</div>
      </div>
      <div style="background:#0e0c1a;border:1px solid #2a2040;border-radius:5px;padding:10px;margin-bottom:8px">
        <div style="color:#c8f0d8;font-weight:bold;font-size:13px;margin-bottom:3px">★ ${passive.name} <span style="color:#666;font-size:11px">passive</span></div>
        <div style="color:#999;font-size:12px">${passive.desc.replace('PASSIVE — ', '')}</div>
      </div>
      <div style="color:#e8d87a;font-size:12px;font-weight:bold;margin-bottom:5px">Skill tree</div>
      ${classNodes.map(n => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1e1c2e;font-size:12px">
        <span style="color:#ddd">${n.name}</span><span style="color:#666;flex:1;margin-left:8px">${n.desc}</span>
      </div>`).join('')}
    </div>`;
  }

  return `<div class="card wide">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <button data-cls-back style="background:none;border:1px solid #5a4a7a;color:#9070c0;font-family:monospace;font-size:12px;padding:4px 10px;border-radius:4px;cursor:pointer">← Back</button>
      <h2 style="margin:0">Choose Your Class</h2>
    </div>
    <p class="sub" style="margin-bottom:8px">${hint}</p>
    <div class="clsgrid">${cards}</div>
    <p class="statusline">${status.join(' &nbsp; ')}</p>
  </div>`;
}

function itemIconSVG(it) {
  const c = it.color || '#b8b8c4';
  const dim = 'width="28" height="28"';
  const wrap = (vb, content) =>
    `<svg viewBox="${vb}" ${dim} style="display:block;image-rendering:pixelated">${content}</svg>`;

  if (it.slot === 'consumable') {
    const liq = it.id.startsWith('mana') ? '#5080ff' : '#e03050';
    // Pixel-art vial matching the canvas _drawVial style, scaled 3.5x into a 28x28 viewBox
    // Origin maps to center of vial body; vial body is 6px wide, 8px tall
    return wrap('0 0 28 28',
      `<!-- body: glass -->
       <rect x="7" y="8" width="14" height="14" rx="2" fill="rgba(200,230,255,0.35)" stroke="rgba(200,230,255,0.85)" stroke-width="1"/>
       <!-- liquid fill bottom half -->
       <rect x="8.5" y="15" width="11" height="7" rx="1.5" fill="${liq}"/>
       <!-- shine strip -->
       <rect x="8.5" y="9" width="3" height="8" rx="1" fill="rgba(255,255,255,0.5)"/>
       <!-- neck left line -->
       <line x1="9" y1="8" x2="7" y2="5" stroke="rgba(200,230,255,0.85)" stroke-width="1"/>
       <!-- neck right line -->
       <line x1="19" y1="8" x2="21" y2="5" stroke="rgba(200,230,255,0.85)" stroke-width="1"/>
       <!-- cork -->
       <rect x="9" y="2" width="10" height="4" rx="1.5" fill="#c89050"/>`
    );
  }

  const n = it.name || '';
  if (it.slot === 'weapon') {
    if (n.includes('Sword')) return wrap('0 0 28 28',
      `<g transform="rotate(-45,14,14)">
       <polygon points="14,1 16,13 12,13" fill="#c8d8e8"/>
       <polygon points="14,1 15,8 14,8" fill="rgba(255,255,255,0.7)"/>
       <polygon points="16,13 12,13 12.5,14" fill="rgba(0,0,0,0.25)"/>
       <rect x="8" y="13" width="12" height="2.5" rx="1" fill="${c}"/>
       <rect x="8" y="13" width="12" height="1" rx="0.5" fill="rgba(255,255,255,0.3)"/>
       <rect x="12" y="15.5" width="4" height="7" rx="1" fill="#7a4820"/>
       <rect x="12" y="15.5" width="1.5" height="7" rx="0.5" fill="rgba(255,255,255,0.25)"/>
       <circle cx="14" cy="24" r="2.5" fill="${c}"/>
       <circle cx="13.5" cy="23.5" r="1" fill="rgba(255,255,255,0.45)"/>
       </g>`);
    if (n.includes('Axe')) return wrap('0 0 28 28',
      `<g transform="rotate(-45,14,14)">
       <rect x="12" y="10" width="4" height="17" rx="1.5" fill="#7a4820"/>
       <rect x="12" y="10" width="1.5" height="17" rx="1" fill="rgba(255,255,255,0.22)"/>
       <polygon points="16,10 24,8 24,18 16,18" fill="${c}"/>
       <polygon points="16,10 23,9 23,13 18,11" fill="rgba(255,255,255,0.45)"/>
       <polygon points="24,8 26,13 24,18" fill="rgba(255,255,255,0.6)"/>
       <polygon points="24,8 24,18 23,18" fill="rgba(0,0,0,0.2)"/>
       </g>`);
    if (n.includes('Mace')) return wrap('-10 -10 20 20',
      `<g transform="rotate(40)">
        <rect x="-1.5" y="-4" width="3" height="12" fill="#7a5030"/>
        <rect x="-4" y="-8" width="8" height="6" rx="1" fill="${c}"/>
        <rect x="-4" y="-8" width="2" height="6" fill="rgba(255,255,255,0.25)" rx="0.5"/>
        <rect x="2" y="-8" width="2" height="6" fill="rgba(0,0,0,0.35)" rx="0.5"/>
        <rect x="-5" y="-5" width="2" height="3" fill="${c}"/>
        <rect x="3" y="-5" width="2" height="3" fill="${c}"/>
      </g>`);
    if (n.includes('Bow')) return wrap('0 0 20 28',
      `<!-- bow limb - D-curve shape -->
       <path d="M 14,2 Q 2,14 14,26" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>
       <!-- highlight on limb -->
       <path d="M 14,2 Q 4,14 14,26" stroke="rgba(255,255,255,0.25)" stroke-width="1" fill="none"/>
       <!-- string -->
       <line x1="14" y1="2" x2="14" y2="26" stroke="#d0d0a0" stroke-width="1"/>
       <!-- grip wrap -->
       <rect x="10" y="11" width="4" height="6" rx="1" fill="#8b5820"/>
       <rect x="10" y="11" width="1.5" height="6" fill="rgba(255,255,255,0.2)" rx="0.5"/>`);
    if (n.includes('Dagger')) return wrap('0 0 28 28',
      `<g transform="rotate(-45,14,14)">
       <polygon points="14,4 16,14 12,14" fill="#c8d8e8"/>
       <polygon points="14,4 15,10 14,10" fill="rgba(255,255,255,0.7)"/>
       <polygon points="16,14 12,14 12.5,15" fill="rgba(0,0,0,0.25)"/>
       <rect x="9" y="14" width="10" height="2.5" rx="1" fill="${c}"/>
       <rect x="9" y="14" width="10" height="1" rx="0.5" fill="rgba(255,255,255,0.3)"/>
       <rect x="12" y="16.5" width="4" height="5" rx="1" fill="#7a4820"/>
       <rect x="12" y="16.5" width="1.5" height="5" rx="0.5" fill="rgba(255,255,255,0.25)"/>
       <circle cx="14" cy="23" r="2" fill="${c}"/>
       <circle cx="13.5" cy="22.5" r="0.8" fill="rgba(255,255,255,0.45)"/>
       </g>`);
    if (n.includes('Staff')) return wrap('0 0 28 28',
      `<!-- handle -->
       <rect x="12" y="6" width="4" height="20" rx="1.5" fill="#7a5022"/>
       <rect x="12" y="6" width="1.5" height="20" fill="rgba(255,255,255,0.2)" rx="1"/>
       <!-- bark knot -->
       <rect x="11" y="13" width="6" height="4" rx="1" fill="#3a2010"/>
       <!-- orb glow halo -->
       <circle cx="14" cy="5" r="7" fill="${c}" opacity="0.2"/>
       <!-- orb body -->
       <circle cx="14" cy="5" r="5" fill="${c}" opacity="0.95"/>
       <!-- orb inner shine -->
       <circle cx="12" cy="3" r="2.5" fill="rgba(255,255,255,0.45)"/>`);

  }

  if (it.slot === 'armor') {
    if (n.includes('Robe')) return wrap('0 0 24 30',
      `<!-- hood/shoulders -->
       <ellipse cx="12" cy="5" rx="8" ry="5" fill="${c}"/>
       <!-- hood center peak -->
       <polygon points="12,0 8,4 16,4" fill="rgba(255,255,255,0.15)"/>
       <!-- robe body — wide and flowing -->
       <polygon points="4,8 20,8 22,28 2,28" fill="${c}"/>
       <!-- front opening / dark seam -->
       <polygon points="12,8 10,28 14,28" fill="rgba(0,0,0,0.35)"/>
       <!-- left highlight -->
       <polygon points="4,8 8,8 7,28 2,28" fill="rgba(255,255,255,0.12)"/>
       <!-- right shadow -->
       <polygon points="20,8 16,8 17,28 22,28" fill="rgba(0,0,0,0.2)"/>
       <!-- collar/neck area -->
       <ellipse cx="12" cy="8" rx="4" ry="2" fill="rgba(0,0,0,0.3)"/>
       <!-- hem detail -->
       <rect x="2" y="26" width="20" height="2" fill="rgba(255,255,255,0.12)"/>`);
    if (n.includes('Plate')) return wrap('-10 -10 20 20',
      `<polygon points="0,-9 7,-4 8,5 0,9 -8,5 -7,-4" fill="${c}"/>
       <polygon points="0,-9 7,-4 8,5 0,9 -8,5 -7,-4" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
       <polygon points="-7,-4 0,-9 7,-4 5,-3 0,-7 -5,-3" fill="rgba(255,255,255,0.3)"/>
       <rect x="-2" y="-3" width="4" height="10" fill="rgba(0,0,0,0.2)"/>`);
    if (n.includes('Mail')) return wrap('-10 -10 20 20',
      `<polygon points="0,-9 7,-3 7,6 0,9 -7,6 -7,-3" fill="${c}"/>
       <rect x="-7" y="-1" width="14" height="1" fill="rgba(255,255,255,0.2)"/>
       <rect x="-7" y="2" width="14" height="1" fill="rgba(255,255,255,0.2)"/>
       <rect x="-7" y="5" width="14" height="1" fill="rgba(255,255,255,0.2)"/>
       <polygon points="0,-9 7,-3 5,-3 0,-7 -5,-3 -7,-3" fill="rgba(255,255,255,0.28)"/>`);
    // Tunic — leather vest, front-facing
    return wrap('0 0 24 28',
      `<!-- body -->
       <polygon points="3,8 21,8 20,26 4,26" fill="${c}"/>
       <!-- left lapel/front panel -->
       <polygon points="12,8 3,8 3,4 8,2 12,8" fill="${c}"/>
       <!-- right lapel/front panel -->
       <polygon points="12,8 21,8 21,4 16,2 12,8" fill="${c}"/>
       <!-- front seam line -->
       <line x1="12" y1="8" x2="12" y2="26" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
       <!-- collar -->
       <polygon points="8,2 16,2 14,0 10,0" fill="rgba(0,0,0,0.3)"/>
       <!-- left shoulder highlight -->
       <polygon points="3,4 8,2 8,4 3,6" fill="rgba(255,255,255,0.22)"/>
       <!-- right shadow -->
       <polygon points="21,4 16,2 16,4 21,6" fill="rgba(0,0,0,0.25)"/>
       <!-- bottom shadow -->
       <rect x="4" y="24" width="16" height="2" fill="rgba(0,0,0,0.25)"/>
       <!-- button/clasp row -->
       <circle cx="12" cy="12" r="1" fill="rgba(0,0,0,0.4)"/>
       <circle cx="12" cy="17" r="1" fill="rgba(0,0,0,0.4)"/>
       <circle cx="12" cy="22" r="1" fill="rgba(0,0,0,0.4)"/>`);
  }

  if (it.slot === 'trinket') {
    if (n.includes('Boot')) return wrap('0 0 26 28',
      `<!-- shaft (leg part, centered) -->
       <rect x="7" y="1" width="9" height="15" rx="2" fill="${c}"/>
       <!-- cuff rim at top -->
       <rect x="6" y="1" width="11" height="3" rx="1" fill="rgba(255,255,255,0.2)"/>
       <!-- heel — square block behind foot -->
       <rect x="4" y="14" width="7" height="8" rx="1" fill="${c}"/>
       <!-- foot/sole extending right -->
       <rect x="4" y="19" width="18" height="6" rx="3" fill="${c}"/>
       <!-- toe bump -->
       <ellipse cx="20" cy="22" rx="3" ry="4" fill="${c}"/>
       <!-- sole underline -->
       <rect x="4" y="24" width="20" height="2" rx="1" fill="rgba(0,0,0,0.55)"/>
       <!-- shaft highlight left -->
       <rect x="8" y="2" width="2" height="13" fill="rgba(255,255,255,0.25)" rx="1"/>
       <!-- shaft shadow right -->
       <rect x="13" y="2" width="2" height="13" fill="rgba(0,0,0,0.22)" rx="1"/>
       <!-- ankle crease -->
       <line x1="7" y1="18" x2="16" y2="18" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>`);
    if (n.includes('Ring') || n.includes('Band')) return wrap('0 0 24 24',
      `<!-- ring band - clean circle -->
       <circle cx="12" cy="14" r="8" fill="none" stroke="${c}" stroke-width="4"/>
       <!-- inner shadow on band -->
       <circle cx="12" cy="14" r="8" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5" stroke-dasharray="0" transform="translate(1,1)"/>
       <!-- band highlight -->
       <path d="M 6,9 A 8,8 0 0,1 18,9" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" fill="none"/>
       <!-- gem on top -->
       <polygon points="12,1 16,5 12,7 8,5" fill="${c}"/>
       <polygon points="12,1 16,5 12,5" fill="rgba(255,255,255,0.5)"/>
       <polygon points="12,1 8,5 12,5" fill="rgba(255,255,255,0.25)"/>
       <!-- gem shine -->
       <polygon points="11,2 13,2 12,4" fill="rgba(255,255,255,0.8)"/>
       <!-- gem base connects to band -->
       <rect x="9" y="6" width="6" height="3" fill="${c}"/>`);
    if (n.includes('Amulet') || n.includes('Charm') || n.includes('Sigil')) return wrap('-10 -12 20 22',
      `<line x1="-5" y1="-10" x2="0" y2="-6" stroke="#c8a860" stroke-width="1"/>
       <line x1="5" y1="-10" x2="0" y2="-6" stroke="#c8a860" stroke-width="1"/>
       <polygon points="0,-6 7,2 0,8 -7,2" fill="${c}"/>
       <polygon points="0,-6 -7,2 -4,2 0,-3" fill="rgba(255,255,255,0.35)"/>
       <polygon points="7,2 0,8 -7,2 -4,2 0,5 4,2" fill="rgba(0,0,0,0.3)"/>
       <circle cx="0" cy="1" r="2" fill="rgba(255,255,255,0.6)"/>`);
    // Fallback trinket — gem on chain
    return wrap('-10 -12 20 22',
      `<path d="M-5,-10 Q0,-8 5,-10" stroke="#c8a860" stroke-width="1" fill="none"/>
       <polygon points="0,8 -5,1 -3,-3 3,-3 5,1" fill="${c}"/>
       <polygon points="0,6 -3,1 -1,-1 1,-1" fill="rgba(255,255,255,0.5)"/>`);
  }

  // fallback
  return `<span style="font-size:18px">${it.icon || '❔'}</span>`;
}

function shopCornerSVG(pos) {
  const transforms = { tl:'', tr:'scale(-1,1)', bl:'scale(1,-1)', br:'scale(-1,-1)' };
  const origins   = { tl:'top left', tr:'top right', bl:'bottom left', br:'bottom right' };
  const posStyle  = { tl:'top:-2px;left:-2px', tr:'top:-2px;right:-2px', bl:'bottom:-2px;left:-2px', br:'bottom:-2px;right:-2px' };
  return `<div style="position:absolute;${posStyle[pos]};z-index:4;line-height:0;transform:${transforms[pos]};transform-origin:${origins[pos]}">
    <svg viewBox="0 0 32 32" width="32" height="32" style="image-rendering:pixelated;display:block">
      <!-- outer fill -->
      <rect x="0" y="0" width="32" height="32" fill="#0c0a18"/>
      <!-- vertical pillar -->
      <rect x="0" y="0" width="12" height="32" fill="#28203c"/>
      <rect x="0" y="0" width="2" height="32" fill="#3c3058"/>
      <rect x="10" y="0" width="2" height="32" fill="#14102a"/>
      <!-- horizontal pillar -->
      <rect x="0" y="0" width="32" height="12" fill="#28203c"/>
      <rect x="0" y="0" width="32" height="2" fill="#3c3058"/>
      <rect x="0" y="10" width="32" height="2" fill="#14102a"/>
      <!-- corner cap -->
      <rect x="0" y="0" width="12" height="12" fill="#342850"/>
      <rect x="0" y="0" width="12" height="2" fill="#4e3c6e"/>
      <rect x="0" y="0" width="2" height="12" fill="#4e3c6e"/>
      <rect x="10" y="10" width="2" height="2" fill="#0c0a18"/>
      <!-- rune glyph on vertical pillar -->
      <rect x="4" y="17" width="4" height="1" fill="#7060a8"/>
      <rect x="5" y="15" width="2" height="5" fill="#7060a8"/>
      <rect x="4" y="19" width="2" height="1" fill="#7060a8"/>
      <!-- rune glyph on horizontal pillar -->
      <rect x="17" y="4" width="1" height="4" fill="#7060a8"/>
      <rect x="15" y="5" width="5" height="2" fill="#7060a8"/>
      <rect x="19" y="4" width="1" height="2" fill="#7060a8"/>
    </svg>
  </div>`;
}

function chestSVG() {
  return `<svg viewBox="0 0 28 22" width="28" height="22" style="image-rendering:pixelated;display:block;flex-shrink:0">
    <!-- body -->
    <rect x="1" y="10" width="26" height="11" fill="#7a4e18"/>
    <rect x="1" y="10" width="2" height="11" fill="#9a6428"/>
    <rect x="25" y="10" width="2" height="11" fill="#4a2e0a"/>
    <rect x="1" y="19" width="26" height="2" fill="#4a2e0a"/>
    <!-- lid -->
    <rect x="1" y="2" width="26" height="9" fill="#9a6420"/>
    <rect x="1" y="2" width="26" height="2" fill="#c48030"/>
    <rect x="1" y="2" width="2" height="9" fill="#b07428"/>
    <rect x="25" y="2" width="2" height="9" fill="#5a3810"/>
    <!-- band -->
    <rect x="0" y="9" width="28" height="3" fill="#c89030"/>
    <rect x="0" y="9" width="28" height="1" fill="#f0c040"/>
    <!-- lock -->
    <rect x="11" y="8" width="6" height="5" fill="#d4a030"/>
    <rect x="12" y="9" width="4" height="2" fill="#f0c040"/>
    <rect x="13" y="10" width="2" height="4" fill="#7a4e18"/>
    <!-- lid shine -->
    <rect x="3" y="3" width="12" height="1" fill="rgba(255,255,255,0.15)"/>
  </svg>`;
}

function satchelSVG() {
  return `<svg viewBox="0 0 24 24" width="26" height="26" style="display:block;image-rendering:pixelated">
    <!-- strap loop -->
    <rect x="8" y="2" width="8" height="3" fill="#7a5a2a"/>
    <rect x="8" y="2" width="8" height="1" fill="#9a7a3a"/>
    <rect x="8" y="4" width="2" height="2" fill="#7a5a2a"/>
    <rect x="14" y="4" width="2" height="2" fill="#7a5a2a"/>
    <!-- bag body -->
    <rect x="3" y="6" width="18" height="14" fill="#9a6a30" rx="1"/>
    <!-- body highlight top -->
    <rect x="3" y="6" width="18" height="2" fill="#b88040"/>
    <!-- body left highlight -->
    <rect x="3" y="6" width="2" height="14" fill="#aa7438"/>
    <!-- body shadow right -->
    <rect x="19" y="6" width="2" height="14" fill="#6a4818"/>
    <!-- body shadow bottom -->
    <rect x="3" y="18" width="18" height="2" fill="#6a4818"/>
    <!-- flap -->
    <rect x="3" y="6" width="18" height="7" fill="#b87830"/>
    <rect x="3" y="6" width="18" height="1" fill="#d09840"/>
    <rect x="3" y="6" width="1" height="7" fill="#c88838"/>
    <rect x="20" y="6" width="1" height="7" fill="#7a5020"/>
    <rect x="3" y="12" width="18" height="1" fill="#7a5020"/>
    <!-- clasp -->
    <rect x="10" y="11" width="4" height="3" fill="#d4a030"/>
    <rect x="11" y="12" width="2" height="1" fill="#fff8c0"/>
    <!-- gold coins peek -->
    <rect x="6" y="15" width="4" height="3" fill="#d4a030"/>
    <rect x="6" y="15" width="4" height="1" fill="#f0c040"/>
    <rect x="14" y="15" width="4" height="3" fill="#d4a030"/>
    <rect x="14" y="15" width="4" height="1" fill="#f0c040"/>
  </svg>`;
}

function shopHTML() {
  const shop = game.shop;
  const active = game.numPlayers;

  let cards = shop.stock.map((it, i) => {
    const marks = [];
    for (let pi = 0; pi < active; pi++) if (!inv[pi].open && shop.cursor[pi] === i)
      marks.push(`<span class="pmark" style="background:${P_COLOR[pi]}">P${pi + 1}</span>`);
    const sel = marks.length > 0;
    const rarColor = it.color || '#aaaaaa';
    const canAfford = (game.players[0]?.gold ?? 0) >= it.price;
    const buyLabel = isMobile
      ? (canAfford ? `BUY 💰${it.price}` : `💰${it.price}`)
      : `BUY 💰${it.price}`;
    return `<div class="shopcard${sel ? ' sel' : ''}" data-shop-idx="${i}"
        style="border-color:${rarColor}40;${sel ? `border-color:${rarColor};box-shadow:0 0 8px ${rarColor}55;` : ''}">
      <div class="sc-icon">${it.slot === 'consumable' ? itemIconSVG(it) : (it.icon || '❔')}</div>
      <div class="sc-name" style="color:${rarColor}">${it.name}</div>
      <div class="sc-rar" style="color:${rarColor}">${it.rarityName || ''}</div>
      <div class="sc-desc">${it.desc || ''}</div>
      <div class="sc-marks">${marks.join('')}</div>
      <button class="sc-buy" data-buy-shop-idx="${i}"${!canAfford ? ' disabled' : ''}>${buyLabel}</button>
    </div>`;
  }).join('');

  // Descend button card (desktop only — mobile has its own button)
  if (!isMobile) {
    const n = shop.stock.length;
    const descendSel = shop.cursor.slice(0, active).some(c => c >= n);
    const selMarks = [];
    for (let pi = 0; pi < active; pi++) {
      if (shop.cursor[pi] >= n) selMarks.push('<span class="pmark" style="background:' + P_COLOR[pi] + '">P' + (pi + 1) + '</span>');
    }
    const allReady = shop.ready.slice(0, active).every(Boolean);
    const hint = allReady ? 'All ready!' : (active > 1 ? 'Both players must select' : '[Space] to confirm');
    const borderStyle = descendSel ? 'border-color:#3baa60;box-shadow:0 0 10px #3baa6055' : 'border-color:#2a4030';
    cards += '<div class="shopcard' + (descendSel ? ' sel' : '') + '" style="' + borderStyle + ';grid-column:1/-1;flex-direction:row;justify-content:center;align-items:center;gap:16px;padding:12px 20px;min-height:unset">'
      + '<span style="font-size:20px">⬇</span>'
      + '<div><div style="color:#7bff9b;font-weight:bold;font-size:14px">DESCEND TO FLOOR ' + (game.floor + 1) + '</div>'
      + '<div style="font-size:11px;color:#8b84a0">' + selMarks.join(' ') + ' ' + hint + '</div></div>'
      + '</div>';
  }

  const status = [];
  for (let pi = 0; pi < active; pi++) {
    const p = game.players[pi];
    status.push(`<span style="color:${P_COLOR[pi]}">P${pi + 1} 💰${p.gold}${shop.ready[pi] ? ' ✓' : ''}</span>`);
  }

  const totalGold = game.players[0]?.gold ?? 0;

  const readyBtn = isMobile
    ? `<div class="shop-ready-row">
        <button id="mobile-bag-btn" style="padding:7px 10px;background:#1c1c30;border:2px solid #5580cc;border-radius:6px;cursor:pointer;line-height:0">${satchelSVG()}</button>
        <button id="mobile-ready-btn" style="flex:1;padding:10px 18px;font-size:14px;font-family:monospace;background:#1c3020;border:2px solid #3baa60;color:#7bff9b;border-radius:6px;cursor:pointer">${shop.ready[0] ? '✓ READY' : '⬇ DESCEND'}</button>
        <button id="mobile-settings-btn" style="padding:10px 14px;font-size:15px;font-family:monospace;background:#1c1c1c;border:2px solid #4a4060;color:#aaa;border-radius:6px;cursor:pointer">⚙</button>
      </div>`
    : '';

  return `<div class="shop-frame">
    <div class="shop-header">
      <div class="shop-title">Floor ${game.floor} — Shop</div>
      <div class="shop-gold">${chestSVG()}<span>${totalGold}</span></div>
    </div>
    <div class="shop-hint">${isMobile ? 'Tap a card · BUY · 📦 bag' : 'P1: WASD browse · P2: arrows browse · [attack] buy/descend · [R] inventory'}</div>
    <div class="shopgrid">${cards}</div>
    <div class="shop-footer">
      <div class="shop-status">${status.join(' &nbsp;·&nbsp; ')}</div>
      ${readyBtn}
    </div>
  </div>`;
}

function endHTML(win) {
  const best = Math.max(...game.players.map(p => p.level), 1);
  const score = calcScore();
  const scores = loadScores();
  const rank = scores.filter(s => s.score > score).length + 1;
  const isTopScore = rank <= MAX_SCORES;

  const scoresHTML = scores.length === 0 ? '<p style="color:var(--ink-dim);font-size:12px">No scores yet</p>' :
    `<table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:6px">
      <tr style="color:var(--ink-dim)"><th style="text-align:left;padding:2px 6px">#</th><th style="text-align:left;padding:2px 6px">Name</th><th style="text-align:left;padding:2px 6px">Class</th><th style="text-align:right;padding:2px 6px">Score</th><th style="text-align:right;padding:2px 6px">Flr</th><th style="text-align:right;padding:2px 6px">Time</th></tr>
      ${scores.map((s, i) => `<tr style="${s._new ? 'color:#ffd060' : ''}"><td style="padding:2px 6px">${i + 1}</td><td style="padding:2px 6px">${s.name}</td><td style="padding:2px 6px;color:#aaaaff">${s.classes || '—'}</td><td style="text-align:right;padding:2px 6px">${s.score.toLocaleString()}</td><td style="text-align:right;padding:2px 6px">${s.floor}</td><td style="text-align:right;padding:2px 6px">${fmtTime(s.time)}</td></tr>`).join('')}
    </table>`;

  return `<div class="card">
    <h1 style="color:${win ? '#7bff9b' : '#ff6060'}">${win ? 'VICTORY!' : 'YOU FELL'}</h1>
    <p class="sub">${win ? `All ${MAX_FLOORS} floors cleared!` : `${game.numPlayers === 1 ? 'Your hero fell' : 'Both heroes fell'} on floor ${game.floor}.`}</p>
    <p style="font-size:22px;margin:6px 0">Score: <b style="color:#ffd060">${score.toLocaleString()}</b></p>
    <p style="font-size:12px;color:var(--ink-dim)">Floor ${game.floor} · ${fmtTime(game.runTime)} · Lv ${best} · Combo bonus: ${game.comboBonusTotal.toLocaleString()}</p>
    ${isTopScore && !_scoreSaved ? `<div style="margin:12px 0 8px">
      <p style="font-size:13px;margin:0 0 6px;color:#7bff9b">Top ${MAX_SCORES} score! Enter your name:</p>
      <div style="display:flex;gap:8px;justify-content:center;align-items:center">
        <input id="hs-name" maxlength="5" style="width:80px;font-size:18px;text-align:center;text-transform:uppercase;font-family:monospace;background:#1c1730;border:2px solid var(--panel-border);color:#fff;padding:4px;border-radius:4px" placeholder="NAME" />
        <button id="hs-save" style="font-family:monospace;font-size:13px;background:#1c1730;border:2px solid var(--gold);color:var(--gold);padding:6px 14px;border-radius:4px;cursor:pointer">Save</button>
      </div>
    </div>` : ''}
    <div style="margin:14px 0 10px;border-top:1px solid var(--panel-border);padding-top:10px">
      <p style="font-size:12px;color:var(--ink-dim);margin:0 0 4px">— Hall of Records —</p>
      ${scoresHTML}
    </div>
    <p class="blink big" style="margin-top:10px">Press Attack to play again</p>
  </div>`;
}

export function bindEndScreenButtons() {
  const saveBtn = document.getElementById('hs-save');
  const nameInput = document.getElementById('hs-name');
  if (!saveBtn || !nameInput) return;
  const doSave = () => {
    if (_scoreSaved) return;
    let name = nameInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (!name) name = '????';
    _scoreSaved = true;
    const score = calcScore();
    const classes = game.players.map(p => p.cls?.name || '?').join('/');
    const entry = { name, score, floor: game.floor, time: Math.round(game.runTime), classes, _new: true };
    const updated = saveScore(entry);
    // Re-render end screen with updated scores marked
    const o = document.getElementById('overlay');
    if (o) {
      const win = game.phase === Phase.WIN;
      o.innerHTML = endHTML(win);
      bindEndScreenButtons();
    }
  };
  saveBtn.addEventListener('click', doSave);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
  nameInput.focus();
}
