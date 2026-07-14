// DOM UI: side panels (P1 left / P2 right), inventory+skill overlays,
// mode-select / class-select / shop / title / game-over screens + input handling.
import { game, Phase, MAX_FLOORS } from './state.js';
import { input, KEYMAPS } from './input.js';
import { CLASS_LIST } from './classes.js';
import { buy } from './shop.js';
import { sellValue } from './items.js';
import { setMusicVolume, setSfxVolume } from './audio.js';

const P_COLOR = ['#5aa9ff', '#ff8a4a'];
let els = {};
let ctrl = {};

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

  const open  = () => { modal.classList.remove('hidden'); restartArea.classList.add('hidden'); };
  const close = () => modal.classList.add('hidden');

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

  // Hide restart button when not in an active run
  const _origOpen = open;
  els._settingsOpen = () => {
    const inRun = game.phase === Phase.PLAYING || game.phase === Phase.SHOP;
    restartBtn.style.display = inRun ? '' : 'none';
    restartArea.classList.add('hidden');
    _origOpen();
  };
  btn.removeEventListener('click', open);
  btn.addEventListener('click', els._settingsOpen);
  document.removeEventListener('keydown', open);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { modal.classList.contains('hidden') ? els._settingsOpen() : close(); }
  });
}

export function resetClassSelect() { cs = { cursor: [0, 0], confirmed: [false, false] }; }
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
      return `<div class="row ${sel ? 'sel' : ''}"><div class="rowmain">` +
        `<span class="ico">${it.icon || '❔'}</span>` +
        `<span style="color:${it.color || '#fff'}">${it.name}</span></div>` +
        `<small>${rarityTag(it)}${it.desc || ''}${sel ? ` · ${keyName(pi, 'attack')}:${action} · ${keyName(pi, 'interact')}:sell ${sellValue(it)}g` : ''}</small></div>`;
    }).join('');
  } else {
    body = p.cls.tree.map((node, i) => {
      const rank = p.skills[node.id] || 0;
      const sel = i === st.skillCur;
      const can = p.canBuy(node);
      const cost = node.cost > 1 ? ` <span class="cost">(${node.cost} SP)</span>` : '';
      const badge = node.passive ? `<span class="pbadge">PASSIVE</span> ` : '';
      return `<div class="row ${sel ? 'sel' : ''} ${can ? 'buyable' : ''} ${node.passive ? 'passive' : ''}"><div class="rowmain">` +
        `<span class="ico">${node.passive ? '★' : '✦'}</span><span>${badge}${node.name} <b>${rank}/${node.maxRank}</b>${cost}</span></div>` +
        `<small>${node.desc}${sel && can ? ' · buy' : (rank >= node.maxRank ? ' · maxed' : '')}</small></div>`;
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

function renderPanels() {
  for (let pi = 0; pi < 2; pi++) {
    const p = game.players[pi];
    const el = els.panels[pi];
    if (!p) {
      const inactive = game.numPlayers === 1 && pi === 1 && game.phase !== Phase.TITLE && game.phase !== Phase.MODE_SELECT;
      el.innerHTML = `<div class="pnl-head" style="color:${P_COLOR[pi]}">Player ${pi + 1}</div>` +
        (inactive ? `<div class="empty">Not in game — 1-player mode</div>` : '');
      continue;
    }
    if (panelFlashT[pi] > 0) panelFlashT[pi] -= 1 / 60;
    const status = p.downed ? `<span class="downed">DOWNED</span>` : '';
    el.innerHTML =
      `<div class="pnl-head" style="color:${P_COLOR[pi]}">P${pi + 1} · ${p.cls.name} <b>Lv ${p.level}</b> ${status}</div>` +
      bar('HP', p.hp, p.stats.maxHp, '#e0463c') +
      bar('MP', p.mana, p.stats.maxMana, '#3c7be0') +
      bar('XP', p.xp, p.xpNext, '#e0c23c') +
      `<div class="stat"><span>💰 ${p.gold}</span>` +
      (p.skillPoints > 0 ? `<span class="blink">★ ${p.skillPoints} SP</span>` : '<span></span>') + `</div>` +
      eqLine(p) +
      statsSummary(p) +
      (panelFlashT[pi] > 0 ? `<div class="flashmsg">${panelFlash[pi]}</div>` : '') +
      invSection(pi);
    if (inv[pi].open) {
      const sel = el.querySelector('.row.sel');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
  }
}

function renderOverlay() {
  const o = els.overlay;
  if (game.phase === Phase.PLAYING) { o.classList.add('hidden'); o.innerHTML = ''; return; }
  o.classList.remove('hidden');
  if (game.phase === Phase.TITLE) o.innerHTML = titleHTML();
  else if (game.phase === Phase.MODE_SELECT) o.innerHTML = modeSelectHTML();
  else if (game.phase === Phase.CLASS_SELECT) o.innerHTML = classSelectHTML();
  else if (game.phase === Phase.SHOP) { o.innerHTML = shopHTML(); scrollShop(); }
  else if (game.phase === Phase.GAME_OVER) o.innerHTML = endHTML(false);
  else if (game.phase === Phase.WIN) o.innerHTML = endHTML(true);
}

function scrollShop() {
  const shop = game.shop;
  if (!shop || shop._scroll == null) return;
  const row = els.overlay.querySelector(`.shoprow[data-i="${shop._scroll}"]`);
  if (row) row.scrollIntoView({ block: 'nearest' });
  shop._scroll = null;
}

function titleHTML() {
  return `<div class="card title">
    <h1>DUNGEON&nbsp;FOR&nbsp;TWO</h1>
    <p class="sub">A local co-op pixel roguelike · descend ${MAX_FLOORS} floors</p>
    <div class="controls two">
      <div><h3 style="color:${P_COLOR[0]}">Player 1</h3>
        <div>Move: <b>W A S D</b></div><div>Attack: <b>Space</b></div>
        <div>Ability: <b>E</b></div><div>Interact/Revive: <b>Q</b></div><div>Inventory: <b>R</b></div></div>
      <div><h3 style="color:${P_COLOR[1]}">Player 2</h3>
        <div>Move: <b>Arrow Keys</b></div><div>Attack: <b>/</b></div>
        <div>Ability: <b>'</b></div><div>Interact/Revive: <b>;</b></div><div>Inventory: <b>P</b></div></div>
    </div>
    <p class="hint">Attacks auto-aim at the nearest enemy.</p>
    <p class="blink big">Press an Attack key to begin</p>
    <p class="credit">Music: "Make Believe" by Giulio Fazio · <a href="https://uppbeat.io/t/giulio-fazio/make-believe" target="_blank">uppbeat.io</a> · License: BJKRXJSISMJN0J4T</p>
  </div>`;
}

function modeSelectHTML() {
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
    return `<div class="clscard">
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
    return `<div class="shoprow ${marks.length ? 'sel' : ''}" data-i="${i}">
      <span class="ico">${it.icon || '❔'}</span>
      <span class="iname" style="color:${it.color || '#fff'}">${it.name}</span>
      <span class="idesc">${rarityTag(it)}${it.desc || ''}</span>
      <span class="iprice">💰${it.price}</span>
      <span class="imk">${marks.join('')}</span></div>`;
  }).join('');
  const status = [];
  for (let pi = 0; pi < active; pi++) {
    const p = game.players[pi];
    status.push(`<span style="color:${P_COLOR[pi]}">P${pi + 1} 💰${p.gold} · ${shop.ready[pi] ? 'READY ✓' : 'shopping'}</span>`);
  }
  return `<div class="card wide shop">
    <h2>Shop — Floor ${game.floor} cleared!</h2>
    <p class="sub">↕ browse · Attack to buy · Interact to ready up · open Inventory to equip/sell</p>
    <div class="shoplist">${rows}</div>
    <p class="statusline">${status.join(' &nbsp;|&nbsp; ')}</p>
    <p class="hint">${active === 1 ? 'Ready up' : 'Both players Ready'} to descend to floor ${game.floor + 1}.</p>
  </div>`;
}

function endHTML(win) {
  const best = Math.max(...game.players.map(p => p.level), 1);
  return `<div class="card">
    <h1 style="color:${win ? '#7bff9b' : '#ff6060'}">${win ? 'VICTORY!' : 'YOU FELL'}</h1>
    <p class="sub">${win ? `You cleared all ${MAX_FLOORS} floors of the dungeon!` : `${game.numPlayers === 1 ? 'Your hero fell' : 'Both heroes fell'} on floor ${game.floor}.`}</p>
    <p>Highest hero level reached: <b>${best}</b></p>
    <p class="blink big">Press an Attack key to play again</p>
  </div>`;
}
