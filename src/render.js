// Canvas rendering: camera, tiles, pixel-art entities, projectiles, fx, floaters.
import { game, TILE, VIEW_W, VIEW_H, calcScore } from './state.js';
import { isMobile } from './detect.js';

const FLOOR_THEMES = [
  { floor: '#2a2438', wall: '#191426', wallTop: '#3a3050', accent: '#4a3b6b' },
  { floor: '#243028', wall: '#141c16', wallTop: '#2f4034', accent: '#3b5b46' },
  { floor: '#302826', wall: '#1a1512', wallTop: '#443832', accent: '#6b5344' },
  { floor: '#26303a', wall: '#141c24', wallTop: '#324450', accent: '#3b566b' },
];
function theme() { return FLOOR_THEMES[(game.floor - 1) % FLOOR_THEMES.length]; }

export function updateCamera() {
  const ps = game.players;
  let mx = 0, my = 0;
  for (const p of ps) { mx += p.x; my += p.y; }
  mx /= ps.length; my /= ps.length;
  const pw = game.map.pixelWidth, ph = game.map.pixelHeight;
  let cx = mx - VIEW_W / 2, cy = my - VIEW_H / 2;
  cx = pw <= VIEW_W ? (pw - VIEW_W) / 2 : Math.max(0, Math.min(pw - VIEW_W, cx));
  cy = ph <= VIEW_H ? (ph - VIEW_H) / 2 : Math.max(0, Math.min(ph - VIEW_H, cy));
  game.camera.x = cx; game.camera.y = cy;
}

// Constrain a player to stay inside the current camera view (soft tether).
export function clampToView(p) {
  const m = p.radius + 4;
  const cx = game.camera.x, cy = game.camera.y;
  p.x = Math.max(cx + m, Math.min(cx + VIEW_W - m, p.x));
  p.y = Math.max(cy + m, Math.min(cy + VIEW_H - m, p.y));
}

export function render(ctx) {
  const th = theme();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = th.wall;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  const sh = game.shake;
  const shx = sh > 0.2 ? (Math.random() - 0.5) * sh * 2 : 0;
  const shy = sh > 0.2 ? (Math.random() - 0.5) * sh * 2 : 0;
  ctx.translate(-Math.round(game.camera.x - shx), -Math.round(game.camera.y - shy));

  drawTiles(ctx, th);
  drawStairs(ctx);
  drawPickups(ctx);
  drawMinions(ctx);
  drawEnemies(ctx);
  drawPlayers(ctx);
  drawProjectiles(ctx);
  drawParticles(ctx);
  drawFloaters(ctx);

  ctx.restore();
  drawMobileStats(ctx);
  drawHUD(ctx);
  drawBossBar(ctx);
  drawBanner(ctx);
  drawComboText(ctx);
  drawFloorTransition(ctx);
}

function drawBossBar(ctx) {
  const boss = game.enemies.find(e => e.isBoss && !e.dead);
  if (!boss) return;

  const barW = Math.round(VIEW_W * 0.55);
  const barH = 14;
  const x = Math.round((VIEW_W - barW) / 2);
  const y = VIEW_H - 28;
  const pct = Math.max(0, boss.hp / boss.maxHp);
  const isPhase2 = boss.phase2;

  // Background
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);

  // Empty bar
  ctx.fillStyle = '#2a1a1a';
  ctx.fillRect(x, y, barW, barH);

  // Fill — red, pulses orange in phase 2
  const pulse = isPhase2 ? 0.15 * Math.sin(game.time * 8) : 0;
  const r = Math.round(220 + pulse * 35);
  ctx.fillStyle = `rgb(${r},${Math.round(40 + pulse * 20)},${Math.round(40 + pulse * 20)})`;
  ctx.fillRect(x, y, Math.round(barW * pct), barH);

  // Phase 2 marker at 50%
  ctx.fillStyle = '#ffffff44';
  ctx.fillRect(x + Math.round(barW * 0.5) - 1, y, 2, barH);

  // Boss name above bar
  ctx.save();
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.fillText((isPhase2 ? '⚡ ' : '') + boss.name + (isPhase2 ? ' ⚡' : ''), VIEW_W / 2 + 1, y - 5);
  ctx.fillStyle = isPhase2 ? '#ffaa30' : '#ffd060';
  ctx.fillText((isPhase2 ? '⚡ ' : '') + boss.name + (isPhase2 ? ' ⚡' : ''), VIEW_W / 2, y - 6);
  ctx.restore();
}

function drawFloorTransition(ctx) {
  const ft = game.floorTransition;
  if (!ft || ft.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = ft.alpha;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
}

function drawTiles(ctx, th) {
  const map = game.map;
  const x0 = Math.max(0, Math.floor(game.camera.x / TILE));
  const y0 = Math.max(0, Math.floor(game.camera.y / TILE));
  const x1 = Math.min(map.w, Math.ceil((game.camera.x + VIEW_W) / TILE));
  const y1 = Math.min(map.h, Math.ceil((game.camera.y + VIEW_H) / TILE));
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const px = tx * TILE, py = ty * TILE;
      if (map.tileAt(tx, ty) === 1) {
        ctx.fillStyle = th.floor;
        ctx.fillRect(px, py, TILE, TILE);
        // subtle checker
        if ((tx + ty) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
          ctx.fillRect(px, py, TILE, TILE);
        }
      } else {
        // wall: draw only if adjacent to a floor (border) for depth
        ctx.fillStyle = th.wall;
        ctx.fillRect(px, py, TILE, TILE);
        if (map.tileAt(tx, ty + 1) === 1) {
          ctx.fillStyle = th.wallTop;
          ctx.fillRect(px, py + TILE - 8, TILE, 8);
        }
      }
    }
  }
}

function drawStairs(ctx) {
  const s = game.map.stairs;
  const px = s.tx * TILE, py = s.ty * TILE;
  ctx.fillStyle = game.stairsActive ? '#000000' : '#181818';
  ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = game.stairsActive ? `rgba(120,220,255,${0.5 - i * 0.1})` : '#333';
    ctx.fillRect(px + 5, py + 6 + i * 5, TILE - 10, 3);
  }
  if (game.stairsActive) {
    const g = 0.4 + Math.sin(game.time * 4) * 0.25;
    ctx.strokeStyle = `rgba(120,220,255,${g})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
  }
}

function drawPickups(ctx) {
  for (const p of game.pickups) {
    const x = Math.round(p.x), y = Math.round(p.y);
    if (p.kind === 'gold') {
      ctx.fillStyle = '#ffcf3a';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff8c0'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 2, 0, Math.PI * 2); ctx.fill();
    } else {
      const item = p.item;
      const slot = item.slot;
      if (slot === 'consumable') {
        _drawVial(ctx, x, y, item.id.startsWith('mana') ? '#5080ff' : '#e03050');
      } else if (slot === 'weapon') {
        _drawSword(ctx, x, y, item.color || '#b8b8c4');
      } else if (slot === 'armor') {
        _drawShield(ctx, x, y, item.color || '#b8b8c4');
      } else {
        _drawGem(ctx, x, y, item.color || '#b8b8c4');
      }
    }
  }
}

function _drawVial(ctx, x, y, liquidColor) {
  // body
  ctx.fillStyle = 'rgba(200,230,255,0.35)';
  ctx.strokeStyle = 'rgba(200,230,255,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 4, 6, 8, 1);
  ctx.fill(); ctx.stroke();
  // liquid fill
  ctx.fillStyle = liquidColor;
  ctx.beginPath(); ctx.roundRect(x - 2, y, 4, 3, 1); ctx.fill();
  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(x - 2, y - 3, 1, 3);
  // neck
  ctx.strokeStyle = 'rgba(200,230,255,0.85)';
  ctx.beginPath(); ctx.moveTo(x - 2, y - 4); ctx.lineTo(x - 1, y - 6);
  ctx.moveTo(x + 2, y - 4); ctx.lineTo(x + 1, y - 6); ctx.stroke();
  // cork
  ctx.fillStyle = '#c89050';
  ctx.fillRect(x - 1, y - 8, 2, 2);
}

function _drawSword(ctx, x, y, rarityColor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4); // diagonal
  // blade
  ctx.fillStyle = '#dde8f0';
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(2, -2); ctx.lineTo(-2, -2); ctx.closePath();
  ctx.fill();
  // edge shine
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0.6, -3); ctx.lineTo(0, -3); ctx.closePath(); ctx.fill();
  // crossguard
  ctx.fillStyle = rarityColor;
  ctx.fillRect(-4, -2, 8, 2);
  // handle
  ctx.fillStyle = '#8b6040';
  ctx.fillRect(-1, 0, 2, 5);
  // pommel
  ctx.fillStyle = rarityColor;
  ctx.beginPath(); ctx.arc(0, 6, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function _drawShield(ctx, x, y, rarityColor) {
  ctx.save();
  ctx.translate(x, y);
  // shield body
  ctx.fillStyle = rarityColor;
  ctx.beginPath();
  ctx.moveTo(0, 8); ctx.lineTo(-6, 2); ctx.lineTo(-6, -5); ctx.lineTo(0, -7); ctx.lineTo(6, -5); ctx.lineTo(6, 2); ctx.closePath();
  ctx.fill();
  // rim
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // metal face
  ctx.fillStyle = 'rgba(200,220,240,0.3)';
  ctx.beginPath();
  ctx.moveTo(0, 5); ctx.lineTo(-4, 1); ctx.lineTo(-4, -3); ctx.lineTo(0, -5); ctx.lineTo(4, -3); ctx.lineTo(4, 1); ctx.closePath();
  ctx.fill();
  // boss
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function _drawGem(ctx, x, y, rarityColor) {
  ctx.save();
  ctx.translate(x, y);
  // chain arc
  ctx.strokeStyle = '#c8a860';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, -3, 5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  // gem body
  ctx.fillStyle = rarityColor;
  ctx.beginPath();
  ctx.moveTo(0, 7); ctx.lineTo(-5, 1); ctx.lineTo(-3, -3); ctx.lineTo(3, -3); ctx.lineTo(5, 1); ctx.closePath();
  ctx.fill();
  // facet shine
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.moveTo(0, 5); ctx.lineTo(-3, 1); ctx.lineTo(-1, -1); ctx.lineTo(1, -1); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// --- entity pixel art ---
function flash(ctx, x, y, w, h, amt) {
  if (amt > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, amt * 5)})`; ctx.fillRect(x, y, w, h); }
}

function drawPlayers(ctx) {
  for (const p of game.players) {
    const a = p.cls.art;
    const x = Math.round(p.x), y = Math.round(p.y);
    if (p.downed) {
      ctx.fillStyle = '#553333';
      ctx.fillRect(x - 12, y - 4, 24, 8);
      ctx.fillStyle = '#884444';
      ctx.fillRect(x - 12, y - 4, 6, 8);
      // revive ring
      if (p.reviveProgress > 0) {
        ctx.strokeStyle = '#7bff9b'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.reviveProgress);
        ctx.stroke();
      }
      drawTag(ctx, x, y - 26, p.name, p.index === 0 ? '#6cc0ff' : '#ff9c6c');
      continue;
    }
    // invuln blink
    if (p.invuln > 0 && Math.floor(game.time * 20) % 2 === 0) { /* skip draw frame */ }
    else {
      const r = 11;
      // legs
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(x - 6, y + 4, 4, 7);
      ctx.fillRect(x + 2, y + 4, 4, 7);
      // body
      ctx.fillStyle = a.body;
      ctx.fillRect(x - 7, y - 6, 14, 12);
      // trim
      ctx.fillStyle = a.trim;
      ctx.fillRect(x - 7, y - 6, 14, 3);
      // head
      ctx.fillStyle = '#e8c9a0';
      ctx.fillRect(x - 5, y - 14, 10, 9);
      // headgear
      drawHead(ctx, x, y, a);
      // facing weapon indicator
      const f = p.facing;
      ctx.fillStyle = a.accent;
      ctx.fillRect(Math.round(x + f.x * 12 - 2), Math.round(y + f.y * 12 - 2), 5, 5);
      flash(ctx, x - 7, y - 14, 14, 20, p.hitFlash);
    }
    // swing arc
    if (p.swing && p.swing.t > 0) drawSwing(ctx, p);
    if (p.novaFx && p.novaFx.t > 0) {
      const k = 1 - p.novaFx.t / p.novaFx.max;
      ctx.strokeStyle = `rgba(160,224,255,${1 - k})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, p.novaFx.radius * k, 0, Math.PI * 2); ctx.stroke();
    }
    // name tag + tiny hp
    drawTag(ctx, x, y - 26, p.name, p.index === 0 ? '#6cc0ff' : '#ff9c6c');
    drawMiniBar(ctx, x, y - 20, p.hp / p.stats.maxHp, '#e04040');
  }
}

function drawHead(ctx, x, y, a) {
  if (a.head === 'helm') {
    ctx.fillStyle = a.accent;
    ctx.fillRect(x - 6, y - 15, 12, 5);
    ctx.fillRect(x - 6, y - 10, 2, 4);
  } else if (a.head === 'hat') {
    ctx.fillStyle = a.body;
    ctx.fillRect(x - 7, y - 16, 14, 3);
    ctx.fillRect(x - 3, y - 22, 6, 7);
  } else if (a.head === 'hood') {
    ctx.fillStyle = a.body;
    ctx.fillRect(x - 6, y - 16, 12, 6);
  }
}

function drawSwing(ctx, p) {
  const s = p.swing;
  const alpha = s.t / s.max;
  const ang = Math.atan2(s.dir.y, s.dir.x);
  const spread = s.big ? Math.PI * 1.1 : Math.PI * 0.6;
  const rad = (s.big ? 42 : 26);
  ctx.fillStyle = `rgba(255,255,255,${alpha * 0.5})`;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, rad, ang - spread / 2, ang + spread / 2);
  ctx.closePath();
  ctx.fill();
}

function drawTag(ctx, x, y, text, color) {
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
function drawMiniBar(ctx, x, y, frac, color) {
  frac = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 12, y, 24, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x - 12, y, 24 * frac, 3);
}

function drawMinions(ctx) {
  for (const m of game.minions) {
    const x = Math.round(m.x), y = Math.round(m.y);
    ctx.fillStyle = m.color || '#cfeccb';
    ctx.fillRect(x - 5, y - 8, 10, 12);
    if (m.free) { // ghostly free minion: little aura
      ctx.fillStyle = 'rgba(192,96,255,0.25)';
      ctx.fillRect(x - 7, y - 10, 14, 16);
      ctx.fillStyle = m.color;
      ctx.fillRect(x - 5, y - 8, 10, 12);
    }
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(x - 3, y - 5, 2, 2);
    ctx.fillRect(x + 1, y - 5, 2, 2);
    drawMiniBar(ctx, x, y - 12, m.hp / m.maxHp, m.free ? '#d69cff' : '#7bff9b');
  }
}

function drawEnemies(ctx) {
  for (const e of game.enemies) {
    if (e.dead) continue;
    // Subtle idle fidget: slow figure-8 using two offset sine waves
    const ft = game.time * 1.4 + e.wobble;
    const fx = Math.round(Math.sin(ft) * 1.2);
    const fy = Math.round(Math.sin(ft * 1.7 + 1.2) * 1.2);
    const x = Math.round(e.x) + fx, y = Math.round(e.y) + fy, r = e.radius;
    drawCreature(ctx, e, x, y, r);
    flash(ctx, x - r, y - r, r * 2, r * 2, e.hitFlash);
    if (e.slow) { ctx.fillStyle = 'rgba(120,200,255,0.35)'; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    if (e.burn) { ctx.fillStyle = 'rgba(255,120,20,0.30)'; ctx.fillRect(x - r, y - r - 2, r * 2, 4); }
    // hp bar
    if (e.hp < e.maxHp || e.isBoss) {
      const w = e.isBoss ? r * 2.5 : r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - w / 2, y - r - 8, w, e.isBoss ? 5 : 3);
      ctx.fillStyle = e.isBoss ? '#ff6060' : '#e05050';
      ctx.fillRect(x - w / 2, y - r - 8, w * Math.max(0, e.hp / e.maxHp), e.isBoss ? 5 : 3);
    }
    if (e.isBoss) drawTag(ctx, x, y - r - 12, e.name, '#ffd060');
  }
}

function drawCreature(ctx, e, x, y, r) {
  ctx.fillStyle = e.color;
  switch (e.key) {
    case 'slime':
      ctx.beginPath(); ctx.ellipse(x, y + 2, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a2a0a'; ctx.fillRect(x - 5, y - 1, 3, 3); ctx.fillRect(x + 2, y - 1, 3, 3);
      break;
    case 'bat':
      ctx.fillRect(x - 3, y - 3, 6, 8);
      ctx.beginPath();
      ctx.moveTo(x - 3, y); ctx.lineTo(x - r - 3, y - 4); ctx.lineTo(x - 3, y + 3); ctx.fill();
      ctx.moveTo(x + 3, y); ctx.lineTo(x + r + 3, y - 4); ctx.lineTo(x + 3, y + 3); ctx.fill();
      break;
    case 'wraith':
    case 'wraithqueen':
      ctx.globalAlpha = 0.72;
      ctx.fillRect(x - r + 2, y - r, (r - 2) * 2, r);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) ctx.rect(x - r + 2 + i * (r / 2), y, r / 2 - 1, r * 0.7);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e0fff8'; ctx.fillRect(x - 4, y - r + 4, 3, 3); ctx.fillRect(x + 2, y - r + 4, 3, 3);
      break;
    default: {
      // humanoid (goblin, orc, skeleton, cultist, golem, bosses)
      ctx.fillStyle = '#26221c';
      ctx.fillRect(x - r + 2, y + r - 4, 3, 4);
      ctx.fillRect(x + r - 5, y + r - 4, 3, 4);
      ctx.fillStyle = e.color;
      ctx.fillRect(x - r + 1, y - r + 3, (r - 1) * 2, r * 1.4);
      ctx.fillRect(x - r + 3, y - r - 2, (r - 3) * 2, 7); // head
      ctx.fillStyle = '#100808';
      ctx.fillRect(x - 4, y - r + 1, 2, 2); ctx.fillRect(x + 2, y - r + 1, 2, 2);
      if (e.isBoss) { ctx.fillStyle = '#ffd060'; ctx.fillRect(x - r + 3, y - r - 6, (r - 3) * 2, 3); }
    }
  }
}

function drawProjectiles(ctx) {
  for (const p of game.projectiles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x - p.radius), Math.round(p.y - p.radius), p.radius * 2, p.radius * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 2), 3, 3);
  }
}

function drawParticles(ctx) {
  for (const pt of game.particles) {
    if (pt.ring) {
      const total = pt.ringLife || 0.3;
      const k = Math.max(0, pt.life / total);
      ctx.strokeStyle = withAlpha(pt.color, k); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r * (1 - k) + pt.r * 0.4, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 2.4));
      ctx.fillStyle = pt.color;
      const s = Math.round(pt.r);
      // blocky pixel shards keep hard edges
      ctx.fillRect(Math.round(pt.x) - s, Math.round(pt.y) - s, s * 2, s * 2);
      ctx.globalAlpha = 1;
    }
  }
}

function withAlpha(color, a) {
  // supports #rgb / #rrggbb
  if (color[0] !== '#') return color;
  let r, g, b;
  if (color.length === 4) { r = parseInt(color[1] + color[1], 16); g = parseInt(color[2] + color[2], 16); b = parseInt(color[3] + color[3], 16); }
  else { r = parseInt(color.slice(1, 3), 16); g = parseInt(color.slice(3, 5), 16); b = parseInt(color.slice(5, 7), 16); }
  return `rgba(${r},${g},${b},${a})`;
}

function drawFloaters(ctx) {
  ctx.textAlign = 'center';
  for (const f of game.floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.4));
    ctx.font = `${f.big ? 'bold 14px' : '11px'} monospace`;
    ctx.fillStyle = '#000';
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawMobileStats(ctx) {
  if (!isMobile || !game.players.length) return;
  const p = game.players[0];
  if (!p) return;
  const x = 8, barW = 120, barH = 10;
  ctx.save();
  ctx.globalAlpha = 0.85;
  // HP bar
  let y = 8;
  ctx.fillStyle = '#111';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = '#e0463c';
  ctx.fillRect(x, y, barW * Math.max(0, p.hp / p.stats.maxHp), barH);
  ctx.fillStyle = '#fff';
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${Math.ceil(p.hp)}/${Math.round(p.stats.maxHp)}`, x + 2, y + 8);
  // MP bar
  y += barH + 3;
  ctx.fillStyle = '#111';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = '#3c7be0';
  ctx.fillRect(x, y, barW * Math.max(0, p.mana / p.stats.maxMana), barH);
  ctx.fillStyle = '#fff';
  ctx.fillText(`MP ${Math.ceil(p.mana)}/${Math.round(p.stats.maxMana)}`, x + 2, y + 8);
  ctx.restore();
}

function drawHUD(ctx) {
  if (game.phase !== 'PLAYING' && game.phase !== 'SHOP') return;
  const t = game.runTime || 0;
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
  const scoreStr = calcScore().toLocaleString();

  ctx.save();
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  // subtle dark pill background
  const text = `⏱ ${timeStr}   ★ ${scoreStr}`;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(VIEW_W / 2 - tw / 2 - 10, 6, tw + 20, 20, 5);
  ctx.fill();
  ctx.fillStyle = '#c8c0d8';
  ctx.fillText(text, VIEW_W / 2, 20);
  ctx.restore();
}

function drawBanner(ctx) {
  if (game.messageTimer <= 0 || !game.message) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, game.messageTimer);
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.fillText(game.message, VIEW_W / 2 + 2, 62);
  ctx.fillStyle = '#ffd060';
  ctx.fillText(game.message, VIEW_W / 2, 60);
  ctx.restore();
}

function drawComboText(ctx) {
  if (!game.comboText || game.comboText.alpha <= 0) return;
  const ct = game.comboText;
  ctx.save();
  ctx.globalAlpha = Math.min(1, ct.alpha);
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  // Shadow
  ctx.fillStyle = '#000';
  ctx.fillText(ct.label, VIEW_W / 2 + 2, VIEW_H / 2 - 58);
  // Text: orange-red for flair
  ctx.fillStyle = '#ff9020';
  ctx.fillText(ct.label, VIEW_W / 2, VIEW_H / 2 - 60);
  ctx.restore();
}
