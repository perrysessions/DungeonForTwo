// Canvas rendering: camera, tiles, pixel-art entities, projectiles, fx, floaters.
import { game, TILE, VIEW_W, VIEW_H, calcScore } from './state.js';
import { isMobile } from './detect.js';

const FLOOR_THEMES = [
  { floor: '#4a3a28', floor2: '#3e3020', wall: '#2a2220', wallTop: '#3e3430', wallHi: '#5a4e44', wallMoss: '#3a5228', accent: '#6b5344' },
  { floor: '#2e3a28', floor2: '#263020', wall: '#1e2a1c', wallTop: '#2a3824', wallHi: '#3e5238', wallMoss: '#2a4430', accent: '#3b5b46' },
  { floor: '#3a2e28', floor2: '#302420', wall: '#221a18', wallTop: '#382e28', wallHi: '#504440', wallMoss: '#3a4028', accent: '#5b4038' },
  { floor: '#2c3440', floor2: '#242c38', wall: '#181e28', wallTop: '#28303e', wallHi: '#3a4454', wallMoss: '#283848', accent: '#3b566b' },
];
function theme() { return FLOOR_THEMES[(game.floor - 1) % FLOOR_THEMES.length]; }

// Fast integer hash for deterministic per-tile detail
function tileHash(x, y) {
  let h = (x * 2246822519 ^ y * 3266489917) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return h / 0xffffffff;
}

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
      const h = tileHash(tx, ty);
      const h2 = tileHash(tx + 99, ty + 7);
      const h3 = tileHash(tx * 3, ty + 13);

      if (map.tileAt(tx, ty) === 1) {
        // --- FLOOR ---
        // Two-tone checkerboard base
        ctx.fillStyle = (tx + ty) % 2 === 0 ? th.floor : th.floor2;
        ctx.fillRect(px, py, TILE, TILE);

        // Tile border grout lines
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(px, py, TILE, 1);
        ctx.fillRect(px, py, 1, TILE);

        // Random crack on ~20% of tiles
        if (h < 0.2) {
          ctx.strokeStyle = 'rgba(0,0,0,0.28)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const cx = px + 6 + Math.floor(h2 * 20);
          const cy = py + 6 + Math.floor(h3 * 20);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (h2 > 0.5 ? 7 : -5), cy + (h3 > 0.5 ? 6 : -4));
          ctx.stroke();
        }

        // Small pebble on ~12% of tiles
        if (h > 0.85) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          const px2 = px + 4 + Math.floor(h2 * 24);
          const py2 = py + 4 + Math.floor(h3 * 24);
          ctx.beginPath(); ctx.ellipse(px2, py2, 3, 2, h * 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath(); ctx.ellipse(px2 - 1, py2 - 1, 1.5, 1, h * 3, 0, Math.PI * 2); ctx.fill();
        }

        // Shadow cast from wall above
        if (map.tileAt(tx, ty - 1) !== 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(px, py, TILE, 7);
        }
        // Shadow from wall on left
        if (map.tileAt(tx - 1, ty) !== 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(px, py, 5, TILE);
        }
        // Shadow from wall on right
        if (map.tileAt(tx + 1, ty) !== 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(px + TILE - 4, py, 4, TILE);
        }

      } else {
        // --- WALL ---
        ctx.fillStyle = th.wall;
        ctx.fillRect(px, py, TILE, TILE);

        // Stone block grid — divide each tile into 2×1 brick pattern
        const brickRow = ty % 2;
        const brickX = brickRow === 0 ? 0 : TILE / 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        // Horizontal mortar
        ctx.beginPath();
        ctx.moveTo(px, py + TILE / 2); ctx.lineTo(px + TILE, py + TILE / 2);
        ctx.stroke();
        // Vertical mortar (offset per row)
        ctx.beginPath();
        ctx.moveTo(px + brickX, py); ctx.lineTo(px + brickX, py + TILE / 2);
        ctx.stroke();
        const brickX2 = brickRow === 0 ? TILE / 2 : 0;
        ctx.beginPath();
        ctx.moveTo(px + brickX2, py + TILE / 2); ctx.lineTo(px + brickX2, py + TILE);
        ctx.stroke();

        // Highlight top edge of each stone
        ctx.fillStyle = th.wallHi;
        ctx.fillRect(px + 1, py + 1, TILE - 2, 2);
        ctx.fillRect(px + 1, py + TILE / 2 + 1, TILE - 2, 2);

        // Shadow bottom edge
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px, py + TILE / 2 - 2, TILE, 2);
        ctx.fillRect(px, py + TILE - 2, TILE, 2);

        // Random crack on ~18% of wall tiles
        if (h < 0.18) {
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const cx = px + 4 + Math.floor(h2 * 24);
          const cy = py + 4 + Math.floor(h3 * 24);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (h2 > 0.5 ? 8 : -6), cy + 5);
          ctx.lineTo(cx + (h2 > 0.5 ? 11 : -9), cy + 10);
          ctx.stroke();
        }

        // Moss on walls that are above a floor tile (~30% of eligible)
        if (map.tileAt(tx, ty + 1) === 1 && h > 0.65) {
          ctx.fillStyle = th.wallMoss;
          const mw = 4 + Math.floor(h2 * 8);
          const mx = px + 2 + Math.floor(h3 * (TILE - mw - 4));
          ctx.fillRect(mx, py + TILE - 6, mw, 4);
          // Moss highlight
          ctx.fillStyle = 'rgba(100,180,80,0.15)';
          ctx.fillRect(mx, py + TILE - 6, mw, 2);
        }

        // Facing-wall highlight strip (the "wall top" — bottom edge of wall facing player)
        if (map.tileAt(tx, ty + 1) === 1) {
          ctx.fillStyle = th.wallTop;
          ctx.fillRect(px, py + TILE - 9, TILE, 9);
          // Highlight rim
          ctx.fillStyle = th.wallHi;
          ctx.fillRect(px, py + TILE - 9, TILE, 2);
        }

        // Crumble: paint void chunks on exposed wall edges using hashes
        // Each edge gets 1-2 notches if that side is open (adjacent to floor or map boundary)
        const voidColor = '#000000';
        const h4 = tileHash(tx + 41, ty + 5);
        const h5 = tileHash(tx + 17, ty + 83);
        const h6 = tileHash(tx * 7, ty + 29);
        const h7 = tileHash(tx + 3, ty * 11);

        // Bottom edge (visible facing edge — most important for depth)
        if (map.tileAt(tx, ty + 1) === 1) {
          ctx.fillStyle = voidColor;
          // notch 1
          const nw1 = 2 + Math.floor(h4 * 4);
          const nx1 = px + 2 + Math.floor(h5 * (TILE - nw1 - 4));
          ctx.fillRect(nx1, py + TILE - 3, nw1, 3);
          // notch 2 (~60% chance)
          if (h6 > 0.4) {
            const nw2 = 2 + Math.floor(h6 * 3);
            const nx2 = px + 2 + Math.floor(h7 * (TILE - nw2 - 4));
            ctx.fillRect(nx2, py + TILE - 2, nw2, 2);
          }
          // occasional corner chip
          if (h > 0.7) ctx.fillRect(px, py + TILE - 4, 2, 4);
          if (h2 > 0.7) ctx.fillRect(px + TILE - 2, py + TILE - 4, 2, 4);
        }

        // Top edge exposed to floor
        if (map.tileAt(tx, ty - 1) === 1) {
          ctx.fillStyle = voidColor;
          const nw = 2 + Math.floor(h4 * 4);
          const nx = px + 3 + Math.floor(h5 * (TILE - nw - 6));
          ctx.fillRect(nx, py, nw, 2);
          if (h3 > 0.5) ctx.fillRect(px + TILE - 2, py, 2, 3);
        }

        // Left edge exposed to floor
        if (map.tileAt(tx - 1, ty) === 1) {
          ctx.fillStyle = voidColor;
          const nh = 2 + Math.floor(h6 * 4);
          const ny = py + 3 + Math.floor(h7 * (TILE - nh - 6));
          ctx.fillRect(px, ny, 2, nh);
          if (h4 > 0.6) ctx.fillRect(px, py, 2, 2);
        }

        // Right edge exposed to floor
        if (map.tileAt(tx + 1, ty) === 1) {
          ctx.fillStyle = voidColor;
          const nh = 2 + Math.floor(h5 * 4);
          const ny = py + 3 + Math.floor(h4 * (TILE - nh - 6));
          ctx.fillRect(px + TILE - 2, ny, 2, nh);
          if (h7 > 0.6) ctx.fillRect(px + TILE - 2, py + TILE - 2, 2, 2);
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
      // drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + 11, 10, 4, 0, 0, Math.PI * 2); ctx.fill();

      // --- legs ---
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(x - 6, y + 4, 4, 7);
      ctx.fillRect(x + 2, y + 4, 4, 7);
      // leg highlight left edge
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x - 6, y + 4, 1, 7);
      ctx.fillRect(x + 2, y + 4, 1, 7);
      // leg shadow right/bottom
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x - 3, y + 4, 1, 7);
      ctx.fillRect(x + 5, y + 4, 1, 7);
      ctx.fillRect(x - 6, y + 10, 4, 1);
      ctx.fillRect(x + 2, y + 10, 4, 1);

      // --- body ---
      ctx.fillStyle = a.body;
      ctx.fillRect(x - 7, y - 6, 14, 12);
      // body left highlight column
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x - 7, y - 6, 2, 12);
      ctx.fillRect(x - 5, y - 6, 1, 3); // top-left corner extra
      // body right shadow column
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + 5, y - 6, 2, 12);
      // body bottom shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x - 7, y + 4, 14, 2);

      // --- trim ---
      ctx.fillStyle = a.trim;
      ctx.fillRect(x - 7, y - 6, 14, 3);
      // trim highlight
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x - 7, y - 6, 14, 1);

      // --- head (skin) ---
      ctx.fillStyle = '#e8c9a0';
      ctx.fillRect(x - 5, y - 14, 10, 9);
      // head left highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x - 5, y - 14, 2, 9);
      ctx.fillRect(x - 5, y - 14, 8, 1);
      // head right shadow
      ctx.fillStyle = 'rgba(120,80,40,0.4)';
      ctx.fillRect(x + 3, y - 14, 2, 9);
      // head bottom shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x - 5, y - 6, 10, 1);
      // eyes (dark dots)
      ctx.fillStyle = '#3a2010';
      ctx.fillRect(x - 3, y - 11, 2, 2);
      ctx.fillRect(x + 1, y - 11, 2, 2);

      // headgear
      drawHead(ctx, x, y, a);
      // facing weapon indicator
      const f = p.facing;
      ctx.fillStyle = a.accent;
      ctx.fillRect(Math.round(x + f.x * 12 - 2), Math.round(y + f.y * 12 - 2), 5, 5);
      // weapon highlight
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(Math.round(x + f.x * 12 - 2), Math.round(y + f.y * 12 - 2), 2, 2);
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
    // helm highlight top
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x - 6, y - 15, 12, 1);
    ctx.fillRect(x - 6, y - 15, 1, 5);
    // helm shadow right
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 4, y - 15, 2, 5);
  } else if (a.head === 'hat') {
    ctx.fillStyle = a.body;
    ctx.fillRect(x - 7, y - 16, 14, 3);  // brim
    ctx.fillRect(x - 3, y - 22, 6, 7);   // crown
    // brim highlight top
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x - 7, y - 16, 14, 1);
    // crown highlight left
    ctx.fillRect(x - 3, y - 22, 1, 7);
    ctx.fillRect(x - 3, y - 22, 6, 1);
    // crown shadow right
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 2, y - 22, 1, 7);
    ctx.fillRect(x - 3, y - 16, 6, 1);
  } else if (a.head === 'hood') {
    ctx.fillStyle = a.body;
    ctx.fillRect(x - 6, y - 16, 12, 6);
    // hood highlight left edge + top
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x - 6, y - 16, 1, 6);
    ctx.fillRect(x - 6, y - 16, 12, 1);
    // hood shadow right
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 4, y - 16, 2, 6);
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
    // drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + r, r * 0.85, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
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
    case 'slime': {
      // base blob
      ctx.beginPath(); ctx.ellipse(x, y + 2, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      // top highlight sheen
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.ellipse(x - r * 0.2, y - r * 0.15, r * 0.45, r * 0.28, -0.4, 0, Math.PI * 2); ctx.fill();
      // right shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + 4, r * 0.4, r * 0.5, 0.3, 0, Math.PI * 2); ctx.fill();
      // eyes
      ctx.fillStyle = '#0a2a0a'; ctx.fillRect(x - 5, y - 1, 3, 3); ctx.fillRect(x + 2, y - 1, 3, 3);
      // eye shine
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(x - 5, y - 1, 1, 1); ctx.fillRect(x + 2, y - 1, 1, 1);
      break;
    }
    case 'bat': {
      // body
      ctx.fillRect(x - 3, y - 3, 6, 8);
      // wings
      ctx.beginPath();
      ctx.moveTo(x - 3, y); ctx.lineTo(x - r - 3, y - 4); ctx.lineTo(x - 3, y + 3); ctx.fill();
      ctx.moveTo(x + 3, y); ctx.lineTo(x + r + 3, y - 4); ctx.lineTo(x + 3, y + 3); ctx.fill();
      // wing top highlight
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 1); ctx.lineTo(x - r, y - 4); ctx.lineTo(x - r + 3, y - 2); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 3, y - 1); ctx.lineTo(x + r, y - 4); ctx.lineTo(x + r - 3, y - 2); ctx.closePath(); ctx.fill();
      // body highlight
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x - 3, y - 3, 2, 5);
      // body shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + 1, y - 3, 2, 8);
      break;
    }
    case 'wraith':
    case 'wraithqueen': {
      ctx.globalAlpha = 0.72;
      ctx.fillRect(x - r + 2, y - r, (r - 2) * 2, r);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) ctx.rect(x - r + 2 + i * (r / 2), y, r / 2 - 1, r * 0.7);
      ctx.fill();
      // highlight left
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x - r + 2, y - r, 2, r);
      // shadow right
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + r - 4, y - r, 2, r);
      ctx.globalAlpha = 1;
      // eyes
      ctx.fillStyle = '#e0fff8'; ctx.fillRect(x - 4, y - r + 4, 3, 3); ctx.fillRect(x + 2, y - r + 4, 3, 3);
      // eye glow
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x - 4, y - r + 4, 1, 1); ctx.fillRect(x + 2, y - r + 4, 1, 1);
      break;
    }
    default: {
      // humanoid (goblin, orc, skeleton, cultist, golem, bosses)
      // legs
      ctx.fillStyle = '#26221c';
      ctx.fillRect(x - r + 2, y + r - 4, 3, 4);
      ctx.fillRect(x + r - 5, y + r - 4, 3, 4);
      // leg highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x - r + 2, y + r - 4, 1, 4);
      ctx.fillRect(x + r - 5, y + r - 4, 1, 4);

      // body
      const bx = x - r + 1, bw = (r - 1) * 2, by = y - r + 3, bh = Math.round(r * 1.4);
      ctx.fillStyle = e.color;
      ctx.fillRect(bx, by, bw, bh);
      // body left highlight
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(bx, by, 2, bh);
      ctx.fillRect(bx, by, bw, 1);
      // body right shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(bx + bw - 2, by, 2, bh);
      // body bottom shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(bx, by + bh - 2, bw, 2);

      // head
      const hx = x - r + 3, hw = (r - 3) * 2, hy = y - r - 2;
      ctx.fillStyle = e.color;
      ctx.fillRect(hx, hy, hw, 7);
      // head top/left highlight
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(hx, hy, hw, 1);
      ctx.fillRect(hx, hy, 2, 7);
      // head right shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(hx + hw - 2, hy, 2, 7);

      // eyes
      ctx.fillStyle = '#100808';
      ctx.fillRect(x - 4, y - r + 1, 2, 2); ctx.fillRect(x + 2, y - r + 1, 2, 2);
      // eye shine
      ctx.fillStyle = 'rgba(255,100,100,0.7)';
      ctx.fillRect(x - 4, y - r + 1, 1, 1); ctx.fillRect(x + 2, y - r + 1, 1, 1);

      if (e.isBoss) {
        ctx.fillStyle = '#ffd060';
        ctx.fillRect(x - r + 3, y - r - 6, (r - 3) * 2, 3);
        // crown highlight
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(x - r + 3, y - r - 6, (r - 3) * 2, 1);
      }
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
