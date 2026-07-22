// DOM UI: side panels (P1 left / P2 right), inventory+skill overlays,
// mode-select / class-select / shop / title / game-over screens + input handling.
import { game, Phase, MAX_FLOORS, calcScore } from './state.js';
import { input, KEYMAPS } from './input.js';
import { isMobile } from './detect.js';
import { CLASS_LIST } from './classes.js';
import { buy } from './shop.js';
import { sellValue } from './items.js';
import { setMusicVolume, setSfxVolume } from './audio.js';

// ---------- Local High Score Board ----------
const HS_KEY = 'dungeon2_scores';
const MAX_SCORES = 5;

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

export function resetClassSelect() { cs = { cursor: [0, 0], confirmed: [false, false] }; }

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
  cs.cursor[0] = idx;
  cs.confirmed[0] = true;
  ctrl.onClassChosen([CLASS_LIST[idx].key]);
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
    if (n > 0 && input.actionPressed(pi, 'up')) { shop.cursor[pi] = (shop.cursor[pi] - 1 + n) % n; shop._scroll = shop.cursor[pi]; }
    if (n > 0 && input.actionPressed(pi, 'down')) { shop.cursor[pi] = (shop.cursor[pi] + 1) % n; shop._scroll = shop.cursor[pi]; }
    if (n > 0 && input.actionPressed(pi, 'attack')) {
      const idx = shop.cursor[pi];
      const res = buy(p, shop.stock[idx]);
      if (res.ok) {
        // Purchased item is gone for both players.
        shop.stock.splice(idx, 1);
        for (let k = 0; k < 2; k++) {
          if (shop.cursor[k] > idx) shop.cursor[k]--;
          shop.cursor[k] = Math.max(0, Math.min(shop.cursor[k], shop.stock.length - 1));
        }
      } else flashPanel(pi, res.reason);
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
function bar(label, cur, max, color) {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return `<div class="bar"><div class="fill" style="width:${pct}%;background:${color}"></div>` +
    `<span>${label} ${Math.ceil(cur)}/${Math.round(max)}</span></div>`;
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
  if (!st.open) return `<div class="hint">[${keyName(pi, 'inventory')}] Inventory / Skills` +
    (p.skillPoints > 0 ? ` — <b class="blink">${p.skillPoints} SP!</b>` : '') + `</div>`;
  const tabs = `<div class="tabs"><span class="${st.tab === 'items' ? 'on' : ''}">Items</span>` +
    `<span class="${st.tab === 'skills' ? 'on' : ''}">Skills</span></div>`;
  let body = '';
  if (st.tab === 'items') {
    if (!p.inventory.length) body = `<div class="empty">empty — grab loot or buy gear in the shop</div>`;
    else body = p.inventory.map((it, i) => {
      const sel = i === Math.min(st.itemCur, p.inventory.length - 1);
      const action = it.slot === 'consumable' ? 'use' : 'equip';
      const actionLabel = it.slot === 'consumable' ? 'USE' : 'EQUIP';
      const btns = sel && isMobile
        ? `<div style="display:flex;gap:6px;margin-top:5px">` +
          `<button data-equip-idx="${i}" style="font-size:11px;padding:3px 10px;background:#1c2238;border:2px solid #5580cc;color:#aac4ff;border-radius:4px;font-family:monospace;cursor:pointer">${actionLabel}</button>` +
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
  return `<div class="inv-open">${tabs}<div class="rows">${body}</div>` +
    `<div class="hint">↕ move · ↔ tab · [${keyName(pi, 'attack')}] use/buy · [${keyName(pi, 'interact')}] sell · [${keyName(pi, 'inventory')}] close</div></div>`;
}

function keyName(pi, action) {
  const code = KEYMAPS[pi][action];
  return code.replace('Key', '').replace('Arrow', '').replace('Space', 'Space')
    .replace('Slash', '/').replace('Quote', "'").replace('Semicolon', ';');
}

const _panelCache = ['', ''];
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
  if (game.phase === Phase.PLAYING) {
    o.classList.add('hidden'); o.innerHTML = '';
    lastOverlayPhase = null;
    return;
  }
  o.classList.remove('hidden');
  // End screens have interactive elements (name input) — only render once per phase entry.
  const isEnd = game.phase === Phase.GAME_OVER || game.phase === Phase.WIN;
  if (isEnd && lastOverlayPhase === game.phase) return;
  lastOverlayPhase = game.phase;

  if (game.phase === Phase.TITLE) o.innerHTML = titleHTML();
  else if (game.phase === Phase.MODE_SELECT) o.innerHTML = modeSelectHTML();
  else if (game.phase === Phase.CLASS_SELECT) o.innerHTML = classSelectHTML();
  else if (game.phase === Phase.SHOP) { o.innerHTML = shopHTML(); scrollShop(); }
  else if (game.phase === Phase.GAME_OVER) { o.innerHTML = endHTML(false); bindEndScreenButtons(); }
  else if (game.phase === Phase.WIN) { o.innerHTML = endHTML(true); bindEndScreenButtons(); }
}

function scrollShop() {
  const shop = game.shop;
  if (!shop || shop._scroll == null) return;
  const row = els.overlay.querySelector(`.shoprow[data-i="${shop._scroll}"]`);
  if (row) row.scrollIntoView({ block: 'nearest' });
  shop._scroll = null;
}

function titleHTML() {
  const controls = isMobile
    ? `<p style="font-size:13px;margin:10px 0">Joystick to move · ATK · SKL · USE · BAG</p>`
    : `<div class="controls two">
      <div><h3 style="color:${P_COLOR[0]}">Player 1</h3>
        <div>Move: <b>W A S D</b></div><div>Attack: <b>Space</b></div>
        <div>Ability: <b>E</b></div><div>Interact/Revive: <b>Q</b></div><div>Inventory: <b>R</b></div></div>
      <div><h3 style="color:${P_COLOR[1]}">Player 2</h3>
        <div>Move: <b>Arrow Keys</b></div><div>Attack: <b>/</b></div>
        <div>Ability: <b>'</b></div><div>Interact/Revive: <b>;</b></div><div>Inventory: <b>P</b></div></div>
    </div>`;
  const prompt = isMobile ? 'Tap to begin' : 'Press an Attack key to begin';
  return `<div class="card title">
    <h1>DUNGEON&nbsp;FOR&nbsp;TWO</h1>
    <p class="sub">A local co-op pixel roguelike · descend ${MAX_FLOORS} floors</p>
    ${controls}
    <p class="hint">Attacks auto-aim at the nearest enemy.</p>
    <p class="blink big">${prompt}</p>
    <p class="credit">Music: "Make Believe" by Giulio Fazio · <a href="https://uppbeat.io/t/giulio-fazio/make-believe" target="_blank">uppbeat.io</a> · License: BJKRXJSISMJN0J4T</p>
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

function classSelectHTML() {
  const active = game.numPlayers;
  const cards = CLASS_LIST.map((c, i) => {
    const marks = [];
    for (let pi = 0; pi < active; pi++) if (cs.cursor[pi] === i) {
      marks.push(`<span class="pmark ${cs.confirmed[pi] ? 'lock' : ''}" style="background:${P_COLOR[pi]}">P${pi + 1}${cs.confirmed[pi] ? '✓' : ''}</span>`);
    }
    const a = c.art;
    return `<div class="clscard" data-cls-idx="${i}">
      <div class="swatch" style="background:${a.body};border-color:${a.trim}"></div>
      <div class="cname">${c.name}</div>
      <div class="cability">${c.abilityName}</div>
      <div class="cblurb">${c.blurb}</div>
      <div class="marks">${marks.join('')}</div>
    </div>`;
  }).join('');
  const status = [];
  for (let pi = 0; pi < active; pi++)
    status.push(`<span style="color:${P_COLOR[pi]}">P${pi + 1}: ${cs.confirmed[pi] ? 'READY ✓' : 'choosing…'}</span>`);
  return `<div class="card wide">
    <h2>Choose Your Class</h2>
    <p class="sub">Move to browse · Attack to lock in · Interact to unlock</p>
    <div class="clsgrid">${cards}</div>
    <p class="statusline">${status.join(' &nbsp; ')}</p>
  </div>`;
}

function shopHTML() {
  const shop = game.shop;
  const active = game.numPlayers;
  const rows = shop.stock.map((it, i) => {
    const marks = [];
    for (let pi = 0; pi < active; pi++) if (!inv[pi].open && shop.cursor[pi] === i)
      marks.push(`<span class="pmark" style="background:${P_COLOR[pi]}">P${pi + 1}</span>`);
    const sel = marks.length > 0;
    const canAfford = (game.players[0]?.gold ?? 0) >= it.price;
    const buyBtn = sel && isMobile
      ? canAfford
        ? `<button data-buy-shop-idx="${i}" style="grid-column:1/-1;font-size:12px;padding:5px 16px;margin-top:2px;background:#1c2a1c;border:2px solid #3baa60;color:#7bff9b;border-radius:4px;font-family:monospace;cursor:pointer;width:fit-content">BUY ${it.price}g</button>`
        : `<small style="grid-column:1/-1;color:#ff6060;margin-top:2px">Need ${it.price - game.players[0].gold}g more</small>`
      : '';
    return `<div class="shoprow ${sel ? 'sel' : ''}" data-shop-idx="${i}">
      <span class="ico">${it.icon || '❔'}</span>
      <span class="iname" style="color:${it.color || '#fff'}">${it.name}</span>
      <span class="idesc">${rarityTag(it)}${it.desc || ''}</span>
      <span class="iprice">💰${it.price}</span>
      <span class="imk">${marks.join('')}</span>${buyBtn}</div>`;
  }).join('');
  const status = [];
  for (let pi = 0; pi < active; pi++) {
    const p = game.players[pi];
    status.push(`<span style="color:${P_COLOR[pi]}">P${pi + 1} 💰${p.gold} · ${shop.ready[pi] ? 'READY ✓' : 'shopping'}</span>`);
  }
  const mobileReadyBtn = isMobile ? `<button id="mobile-ready-btn" style="margin-top:10px;width:100%;padding:10px;font-size:15px;font-family:monospace;background:#1c3020;border:2px solid #3baa60;color:#7bff9b;border-radius:6px;cursor:pointer">${game.shop?.ready[0] ? '✓ READY — tap to unready' : 'READY TO DESCEND'}</button>` : '';
  return `<div class="card wide shop">
    <h2>Shop — Floor ${game.floor} cleared!</h2>
    <p class="sub">${isMobile ? 'Tap to select · tap BUY to purchase · ' : '↕ browse · Attack to buy · Interact to ready up · '}open Inventory to equip/sell</p>
    <div class="shoplist">${rows}</div>
    <p class="statusline">${status.join(' &nbsp;|&nbsp; ')}</p>
    ${mobileReadyBtn}
    <p class="hint">${active === 1 ? 'Ready up' : 'Both players Ready'} to descend to floor ${game.floor + 1}.</p>
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
      <tr style="color:var(--ink-dim)"><th style="text-align:left;padding:2px 6px">#</th><th style="text-align:left;padding:2px 6px">Name</th><th style="text-align:right;padding:2px 6px">Score</th><th style="text-align:right;padding:2px 6px">Floor</th><th style="text-align:right;padding:2px 6px">Time</th></tr>
      ${scores.map((s, i) => `<tr style="${s._new ? 'color:#ffd060' : ''}"><td style="padding:2px 6px">${i + 1}</td><td style="padding:2px 6px">${s.name}</td><td style="text-align:right;padding:2px 6px">${s.score.toLocaleString()}</td><td style="text-align:right;padding:2px 6px">${s.floor}</td><td style="text-align:right;padding:2px 6px">${fmtTime(s.time)}</td></tr>`).join('')}
    </table>`;

  return `<div class="card">
    <h1 style="color:${win ? '#7bff9b' : '#ff6060'}">${win ? 'VICTORY!' : 'YOU FELL'}</h1>
    <p class="sub">${win ? `All ${MAX_FLOORS} floors cleared!` : `${game.numPlayers === 1 ? 'Your hero fell' : 'Both heroes fell'} on floor ${game.floor}.`}</p>
    <p style="font-size:22px;margin:6px 0">Score: <b style="color:#ffd060">${score.toLocaleString()}</b></p>
    <p style="font-size:12px;color:var(--ink-dim)">Floor ${game.floor} · ${fmtTime(game.runTime)} · Lv ${best} · Combo bonus: ${game.comboBonusTotal.toLocaleString()}</p>
    ${isTopScore ? `<div style="margin:12px 0 8px">
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
    let name = nameInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (!name) name = '????';
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
