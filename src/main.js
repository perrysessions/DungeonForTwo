// Bootstrap: game loop, phase transitions, player control, floor flow.
import { game, Phase, TILE, MAX_FLOORS, setMessage, resetRunState } from './state.js';
import { input } from './input.js';
import * as ui from './ui.js';
import { Dungeon } from './dungeon.js';
import { spawnFloorEnemies, spawnBoss, isBossFloor } from './enemies.js';
import { addShake } from './state.js';
import { Player } from './player.js';
import { CLASSES } from './classes.js';
import {
  basicAttack, useAbility, updateProjectiles, updateMinions, updateParticles,
} from './combat.js';
import { render, updateCamera, clampToView } from './render.js';
import { openShop, closeShop } from './shop.js';
import { preloadAudio, playMusic, stopMusic, resumeAudio, playSfx, fadeOutThenIn } from './audio.js';

let ctx;

const controller = {
  onStart() { game.phase = Phase.MODE_SELECT; },
  onModeChosen(n) {
    game.numPlayers = n;
    document.getElementById('panel-right').classList.toggle('hidden-panel', n === 1);
    ui.resetClassSelect(); game.phase = Phase.CLASS_SELECT;
  },
  onClassChosen(keys) { startRun(keys); },
  onDescend() { descend(); },
  onRestart() { restart(); },
};

function startRun(keys) {
  game.players = keys.slice(0, game.numPlayers).map((k, i) => new Player(i, CLASSES[k]));
  game.floor = 1;
  game.runTime = 0;
  game.comboBonusTotal = 0;
  game.comboTimer = 0;
  game.comboCount = 0;
  game.comboText = null;
  ui.closeInventories();
  generateFloor();
  game.phase = Phase.PLAYING;
  fadeOutThenIn('dungeon', 1.0, 2.0);
}

function generateFloor() {
  resetRunState();
  game.map = new Dungeon(game.floor);
  const c = game.map.roomCenterWorld(game.map.startRoom);
  const offs = game.players.length === 1 ? [[0, 0]] : [[-18, 0], [18, 0]];
  game.players.forEach((p, i) => {
    p.x = c.x + offs[i][0]; p.y = c.y + offs[i][1];
    p.attackTimer = 0; p.abilityTimer = 0; p.dashTimer = 0; p.swing = null; p.novaFx = null;
    p.facing = { x: 0, y: 1 };
    // small breather heal between floors (not floor 1)
    if (game.floor > 1) {
      p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.25);
      p.mana = p.stats.maxMana;
    }
  });
  game.enemies = spawnFloorEnemies(game.floor, game.map);
  game.awaitingBoss = isBossFloor(game.floor);
  game.stairsActive = false;
  updateCamera();
  setMessage(`Floor ${game.floor}${game.awaitingBoss ? ' — BOSS LAIR' : ''}`, 2.4);
}

function descend() {
  closeShop();
  game.floor++;
  if (game.floor > MAX_FLOORS) { game.phase = Phase.WIN; return; }
  ui.closeInventories();
  generateFloor();
  game.phase = Phase.PLAYING;
}

function restart() {
  resetRunState();
  game.players = [];
  game.floor = 1;
  closeShop();
  ui.closeInventories();
  ui.resetClassSelect();
  document.getElementById('panel-right').classList.remove('hidden-panel');
  game.phase = Phase.TITLE;
  stopMusic();
}

// ---- per-player control ----
function controlPlayer(p, pi, dt) {
  let vx, vy;
  if (p.dashTimer > 0) {
    vx = p.dashDir.x * 520; vy = p.dashDir.y * 520;
  } else {
    const mv = input.moveVector(pi);
    // Momentum/Killing-Spree passives grant a brief move-speed burst after a kill.
    const spd = p.stats.moveSpeed * (p.momentumT > 0 ? 1 + 0.08 * p.passiveRank : 1);
    vx = mv.x * spd; vy = mv.y * spd;
    if (mv.x || mv.y) {
      const m = Math.hypot(mv.x, mv.y) || 1;
      p.facing = { x: mv.x / m, y: mv.y / m };
    }
  }
  const res = game.map.moveCircle(p.x, p.y, p.radius, vx * dt, vy * dt);
  p.x = res.x; p.y = res.y;
  clampToView(p);

  if (input.actionDown(pi, 'attack') && p.attackTimer <= 0) basicAttack(p);
  if (input.actionDown(pi, 'ability') && p.abilityTimer <= 0 && p.mana >= p.cls.abilityCost) useAbility(p);
}

function updateRevives(dt) {
  for (const p of game.players) {
    if (!p.downed) continue;
    let reviver = null;
    for (const q of game.players) {
      if (q === p || q.downed || ui.isCapturing(q.index)) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) < 40 && input.actionDown(q.index, 'interact')) reviver = q;
    }
    if (reviver) {
      p.reviveProgress += dt * 0.55 * (1 + reviver.mods.reviveSpeed);
      if (p.reviveProgress >= 1) { p.reviveTo(0.5); setMessage(`P${p.index + 1} revived!`, 1.6); }
    } else {
      p.reviveProgress = Math.max(0, p.reviveProgress - dt * 0.6);
    }
  }
}

function safePickupPos(x, y) {
  if (!game.map.worldSolid(x, y)) return { x, y };
  for (let r = 16; r <= 96; r += 16) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
      if (!game.map.worldSolid(cx, cy)) return { x: cx, y: cy };
    }
  }
  return { x, y };
}

function updatePickups(dt) {
  for (const pk of game.pickups) {
    pk.vx *= 0.86; pk.vy *= 0.86;
    const nx = pk.x + pk.vx * dt, ny = pk.y + pk.vy * dt;
    if (!game.map.worldSolid(nx, pk.y)) pk.x = nx; else pk.vx = 0;
    if (!game.map.worldSolid(pk.x, ny)) pk.y = ny; else pk.vy = 0;
    pk.life -= dt;
    let best = null, bd = 1e9;
    for (const p of game.players) {
      if (p.downed) continue;
      const d = Math.hypot(p.x - pk.x, p.y - pk.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best && bd < best.radius + pk.r + 6) {
      if (pk.kind === 'gold') { best.gold += pk.amount; pk.dead = true; playSfx('pickup_gold', 0.5); }
      else if (best.addItem(pk.item)) { pk.dead = true; playSfx('pickup_item', 0.6); }
    }
  }
  game.pickups = game.pickups.filter(p => !p.dead && p.life > 0);
}

function checkFloorProgress() {
  game.enemies = game.enemies.filter(e => !e.dead);
  if (game._bossEnrage) {
    game._bossEnrage = false;
    const boss = game.enemies.find(e => e.isBoss);
    setMessage(boss ? `${boss.name} ENRAGES!` : 'ENRAGE!', 3.0);
    addShake(18);
  }
  if (game.enemies.length === 0 && game.awaitingBoss) {
    // Adds are dead — summon the boss with a dramatic entrance far from players.
    const boss = spawnBoss(game.floor, game.map, game.players);
    game.enemies.push(boss);
    game.awaitingBoss = false;
    setMessage(`${boss.name} awakens!`, 3.5);
    playMusic('boss', { loop: false });
    addShake(14);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 140;
      game.particles.push({
        x: boss.x, y: boss.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.5, color: boss.color, r: 2 + Math.random() * 4,
        block: true, drag: 0.9,
      });
    }
    return;
  }
  if (game.enemies.length === 0 && !game.awaitingBoss && !game.stairsActive) {
    game.stairsActive = true;
    playSfx('floor_clear');
    setMessage('Floor cleared! Reach the stairs ▼ together', 3.5);
  }
  if (game.stairsActive) {
    const s = game.map.stairs;
    const sx = (s.tx + 0.5) * TILE, sy = (s.ty + 0.5) * TILE;
    const bothAlive = game.players.every(p => !p.downed);
    const bothAtStairs = game.players.every(p => Math.hypot(p.x - sx, p.y - sy) < TILE * 1.15);
    if (bothAlive && bothAtStairs) {
      if (game.floor >= MAX_FLOORS) { game.phase = Phase.WIN; stopMusic(); }
      else { openShop(); game.phase = Phase.SHOP; playMusic('dungeon'); }
    }
  }
  if (game.players.length && game.players.every(p => p.downed)) {
    game.phase = Phase.GAME_OVER;
    playMusic('death', { loop: false });
  }
}

function simulate(dt) {
  game.runTime += dt;
  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) game.comboCount = 0;
  }
  if (game.comboText) {
    game.comboText.alpha -= dt * 1.2;
    if (game.comboText.alpha <= 0) game.comboText = null;
  }
  for (const p of game.players) p.updateTimers(dt);
  for (let pi = 0; pi < game.players.length; pi++) {
    const p = game.players[pi];
    if (!p.downed && !ui.isCapturing(pi)) controlPlayer(p, pi, dt);
  }
  for (const e of game.enemies) e.update(dt);
  updateProjectiles(dt);
  updateMinions(dt);
  updateRevives(dt);
  updatePickups(dt);
  updateParticles(dt);
  updateCamera();
  checkFloorProgress();
}


// ---- main loop (variable dt, clamped) ----
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 1 / 30) dt = 1 / 30; // clamp long stalls

  input.beginFrame();
  ui.update(dt);
  if (game.phase === Phase.PLAYING && !game.paused) simulate(dt);

  if (game.map) render(ctx);
  game.time += dt;
  if (game.messageTimer > 0) game.messageTimer -= dt;
  game.shake *= 0.86;
  if (game.shake < 0.2) game.shake = 0;

  requestAnimationFrame(frame);
}

function init() {
  const canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  ui.initUI(controller);
  game.phase = Phase.TITLE;
  // Start music as soon as audio buffers are loaded. Browsers that enforce
  // autoplay policy will suspend the AudioContext until the first user gesture;
  // the unlock listener below resumes it so music begins immediately on touch.
  preloadAudio().then(() => {
    playMusic('dungeon', { fadeIn: 2.5 });
  });
  const unlockAudio = () => { resumeAudio(); };
  document.addEventListener('click', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
