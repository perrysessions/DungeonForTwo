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
        const base = (tx + ty) % 2 === 0 ? th.floor : th.floor2;
        ctx.fillStyle = base;
        ctx.fillRect(px, py, TILE, TILE);

        // Inner corner shadows — darkens each tile's edges for sunken-tile depth
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(px, py, TILE, 2);          // top edge
        ctx.fillRect(px, py, 2, TILE);          // left edge
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(px, py + TILE - 2, TILE, 2); // bottom edge
        ctx.fillRect(px + TILE - 2, py, 2, TILE); // right edge

        // Corner vignette (darker squares in corners)
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(px, py, 4, 4);
        ctx.fillRect(px + TILE - 4, py, 4, 4);
        ctx.fillRect(px, py + TILE - 4, 4, 4);
        ctx.fillRect(px + TILE - 4, py + TILE - 4, 4, 4);

        // Crack on ~22% of tiles
        if (h < 0.22) {
          ctx.strokeStyle = 'rgba(0,0,0,0.38)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const cx = px + 6 + Math.floor(h2 * 18);
          const cy = py + 6 + Math.floor(h3 * 18);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (h2 > 0.5 ? 8 : -6), cy + (h3 > 0.5 ? 7 : -5));
          ctx.lineTo(cx + (h2 > 0.5 ? 11 : -9), cy + (h3 > 0.5 ? 10 : -8));
          ctx.stroke();
        }

        // Small pebble on ~10% of tiles
        if (h > 0.88) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          const px2 = px + 5 + Math.floor(h2 * 20);
          const py2 = py + 5 + Math.floor(h3 * 20);
          ctx.beginPath(); ctx.ellipse(px2, py2, 3, 2, h * 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.09)';
          ctx.beginPath(); ctx.ellipse(px2 - 1, py2 - 1, 1.5, 1, h * 3, 0, Math.PI * 2); ctx.fill();
        }

        // Deep shadow from wall above
        if (map.tileAt(tx, ty - 1) !== 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(px, py, TILE, 8);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(px, py + 8, TILE, 5);
        }
        if (map.tileAt(tx - 1, ty) !== 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(px, py, 5, TILE);
        }
        if (map.tileAt(tx + 1, ty) !== 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.14)';
          ctx.fillRect(px + TILE - 4, py, 4, TILE);
        }

      } else {
        // --- WALL ---
        // Staggered masonry: 2 rows of bricks per tile, offset every other row
        ctx.fillStyle = th.wall;
        ctx.fillRect(px, py, TILE, TILE);

        const h4 = tileHash(tx + 41, ty + 5);
        const h5 = tileHash(tx + 17, ty + 83);
        const h6 = tileHash(tx * 7, ty + 29);
        const h7 = tileHash(tx + 3, ty * 11);

        // Two brick rows, each 14px tall with 2px mortar gap between and on edges
        // Stagger: even rows align to tile left, odd rows offset by TILE/2
        const mortar = 2;
        const rowH = (TILE - mortar * 3) / 2; // ~13px each
        const rowOffset = (ty % 2 === 0) ? 0 : TILE / 2;

        for (let row = 0; row < 2; row++) {
          const by = py + mortar + row * (rowH + mortar);
          // Each row has 1 or 2 brick columns depending on the stagger offset
          // Draw bricks spanning the full tile width starting from the row offset
          // (a brick may be cut at tile edge — that's fine, masonry wraps)
          const brickW = TILE; // one wide brick per row per tile, stagger gives the offset look
          const startX = px - rowOffset + (tx % 2 === 0 ? 0 : TILE / 2);

          // We draw up to 2 potential brick segments clipped to this tile
          const offsets = [-rowOffset, TILE - rowOffset];
          for (const ox of offsets) {
            const bx = px + ox;
            const bw = TILE / 2 - mortar; // half-width brick minus mortar
            // Clamp to tile
            const clipL = Math.max(bx + mortar, px + mortar);
            const clipR = Math.min(bx + TILE / 2 - mortar, px + TILE - mortar);
            if (clipR <= clipL) continue;
            const cw = clipR - clipL;

            // Brick color: slight per-brick variation via hash
            const bHash = tileHash(Math.round((bx - px) * 10 + tx), ty * 2 + row);
            ctx.fillStyle = bHash < 0.35 ? th.wallHi : th.wall;
            ctx.fillRect(clipL, by, cw, rowH);

            // Top-left highlight
            ctx.fillStyle = 'rgba(255,255,255,0.13)';
            ctx.fillRect(clipL, by, cw, 2);
            if (clipL === px + mortar || clipL === bx + mortar) {
              ctx.fillRect(clipL, by, 2, rowH);
            }

            // Bottom-right shadow
            ctx.fillStyle = 'rgba(0,0,0,0.38)';
            ctx.fillRect(clipL, by + rowH - 2, cw, 2);
            ctx.fillRect(clipR - 2, by, 2, rowH);
          }
        }

        // Dark mortar lines (horizontal)
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(px, py, TILE, mortar);
        ctx.fillRect(px, py + mortar + rowH, TILE, mortar);
        ctx.fillRect(px, py + TILE - mortar, TILE, mortar);

        // Vertical mortar (staggered per row)
        ctx.fillRect(px + rowOffset, py + mortar, mortar, rowH);
        const col2X = rowOffset + TILE / 2;
        if (col2X < TILE) ctx.fillRect(px + col2X, py + mortar, mortar, rowH);
        const row2Off = (TILE / 2 - rowOffset + TILE) % TILE;
        ctx.fillRect(px + row2Off, py + mortar + rowH + mortar, mortar, rowH);
        const col2R2 = row2Off + TILE / 2;
        if (col2R2 < TILE) ctx.fillRect(px + col2R2, py + mortar + rowH + mortar, mortar, rowH);

        // Random crack on ~18% of wall tiles
        if (h < 0.18) {
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const cx = px + 5 + Math.floor(h2 * 22);
          const cy = py + 5 + Math.floor(h3 * 20);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (h2 > 0.5 ? 8 : -6), cy + 6);
          ctx.lineTo(cx + (h2 > 0.5 ? 11 : -9), cy + 11);
          ctx.stroke();
        }

        // Moss near bottom on tiles above floor
        if (map.tileAt(tx, ty + 1) === 1 && h > 0.65) {
          ctx.fillStyle = th.wallMoss;
          const mw = 4 + Math.floor(h2 * 9);
          const mx = px + 3 + Math.floor(h3 * (TILE - mw - 6));
          ctx.fillRect(mx, py + TILE - 7, mw, 5);
          ctx.fillStyle = 'rgba(100,180,80,0.15)';
          ctx.fillRect(mx, py + TILE - 7, mw, 2);
        }

        // Facing-wall top strip
        if (map.tileAt(tx, ty + 1) === 1) {
          ctx.fillStyle = th.wallTop;
          ctx.fillRect(px, py + TILE - 9, TILE, 9);
          ctx.fillStyle = th.wallHi;
          ctx.fillRect(px, py + TILE - 9, TILE, 2);
          // Crumble notches
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          const nw1 = 2 + Math.floor(h4 * 4); const nx1 = px + 2 + Math.floor(h5 * (TILE - nw1 - 4));
          ctx.fillRect(nx1, py + TILE - 3, nw1, 3);
          if (h6 > 0.4) {
            const nw2 = 2 + Math.floor(h6 * 3); const nx2 = px + 2 + Math.floor(h7 * (TILE - nw2 - 4));
            ctx.fillRect(nx2, py + TILE - 2, nw2, 2);
          }
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
    else if (p.cls.key === 'druid' && p.beastForm > 0) {
      drawBeastDruid(ctx, p, x, y);
    } else {
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
      // facing weapon
      drawWeapon(ctx, p.cls.key, x, y, p.facing, a);
      flash(ctx, x - 7, y - 14, 14, 20, p.hitFlash);
    }
    // swing arc
    if (p.swing && p.swing.t > 0) drawSwing(ctx, p);
    if (p.novaFx && p.novaFx.t > 0) {
      const k = 1 - p.novaFx.t / p.novaFx.max;
      const novaCol = p.cls.key === 'druid' ? `rgba(140,224,80,${1 - k})` : `rgba(160,224,255,${1 - k})`;
      ctx.strokeStyle = novaCol; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, p.novaFx.radius * k, 0, Math.PI * 2); ctx.stroke();
    }
    // name tag + tiny hp (beast druid draws its own, skip here)
    if (!(p.cls.key === 'druid' && p.beastForm > 0)) {
      drawTag(ctx, x, y - 26, p.name, p.index === 0 ? '#6cc0ff' : '#ff9c6c');
      drawMiniBar(ctx, x, y - 20, p.hp / p.stats.maxHp, '#e04040');
    }
  }
}

function drawBeastDruid(ctx, p, x, y) {
  const fur = '#5a3822';
  const furDark = '#3a2010';
  const furLight = '#7a5030';

  // drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(x, y + 13, 13, 5, 0, 0, Math.PI * 2); ctx.fill();

  // thick legs
  ctx.fillStyle = fur;
  ctx.fillRect(x - 8, y + 6, 6, 8);
  ctx.fillRect(x + 2, y + 6, 6, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(x - 3, y + 6, 1, 8);
  ctx.fillRect(x + 6, y + 6, 1, 8);

  // bulky torso
  ctx.fillStyle = fur;
  ctx.fillRect(x - 9, y - 6, 18, 13);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x - 9, y - 6, 2, 13);
  ctx.fillRect(x - 9, y - 6, 18, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x + 7, y - 6, 2, 13);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - 9, y + 9, 18, 2);

  // claws (extended in facing direction)
  const cf = p.facing;
  const cx = Math.round(x + cf.x * 16), cy = Math.round(y + cf.y * 16);
  ctx.fillStyle = furLight;
  ctx.fillRect(cx - 4, cy - 4, 8, 8);
  ctx.fillStyle = '#e8e4d0';
  ctx.fillRect(cx + Math.round(cf.x * 3), cy - 4, 2, 2);
  ctx.fillRect(cx + Math.round(cf.x * 3), cy - 1, 2, 2);
  ctx.fillRect(cx + Math.round(cf.x * 3), cy + 2, 2, 2);

  // beast head
  ctx.fillStyle = fur;
  ctx.fillRect(x - 8, y - 17, 16, 12);
  // muzzle
  ctx.fillStyle = furLight;
  ctx.fillRect(x - 5, y - 11, 10, 5);
  // head highlight / shadow
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x - 8, y - 17, 16, 1);
  ctx.fillRect(x - 8, y - 17, 2, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(x + 6, y - 17, 2, 12);
  // ears
  ctx.fillStyle = furDark;
  ctx.fillRect(x - 8, y - 20, 4, 4);
  ctx.fillRect(x + 4, y - 20, 4, 4);
  ctx.fillStyle = '#c07060';
  ctx.fillRect(x - 7, y - 19, 2, 2);
  ctx.fillRect(x + 5, y - 19, 2, 2);

  // glowing green eyes
  ctx.fillStyle = 'rgba(60,255,80,0.4)';
  ctx.fillRect(x - 6, y - 15, 5, 5);
  ctx.fillRect(x + 1, y - 15, 5, 5);
  ctx.fillStyle = '#30ff60';
  ctx.fillRect(x - 5, y - 14, 3, 3);
  ctx.fillRect(x + 2, y - 14, 3, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(x - 5, y - 14, 1, 1);
  ctx.fillRect(x + 2, y - 14, 1, 1);

  flash(ctx, x - 9, y - 17, 18, 30, p.hitFlash);

  // name tag
  drawTag(ctx, x, y - 42, p.name, p.index === 0 ? '#6cc0ff' : '#ff9c6c');
  // beast timer bar (green/orange) — clearly separated from HP bar
  const pct = Math.max(0, p.beastForm / (p.beastFormMax || 7));
  const bw = 30;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x - bw / 2, y - 37, bw, 4);
  ctx.fillStyle = pct > 0.4 ? '#8bc34a' : '#ff7020';
  ctx.fillRect(x - bw / 2, y - 37, Math.round(bw * pct), 4);
  // HP bar — separated below timer
  drawMiniBar(ctx, x, y - 30, p.hp / p.stats.maxHp, '#e04040');
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
  } else if (a.head === 'antlers') {
    // leaf crown band
    ctx.fillStyle = a.body;
    ctx.fillRect(x - 6, y - 16, 12, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x - 6, y - 16, 12, 1);
    ctx.fillRect(x - 6, y - 16, 1, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 4, y - 16, 2, 5);
    // left antler branch
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x - 5, y - 20, 2, 5);  // main left stalk
    ctx.fillRect(x - 7, y - 22, 2, 3);  // left fork
    ctx.fillRect(x - 4, y - 22, 2, 2);  // inner fork
    // right antler branch
    ctx.fillRect(x + 3, y - 20, 2, 5);  // main right stalk
    ctx.fillRect(x + 5, y - 22, 2, 3);  // right fork
    ctx.fillRect(x + 2, y - 22, 2, 2);  // inner fork
    // leaf accent on crown
    ctx.fillStyle = a.accent;
    ctx.fillRect(x - 2, y - 17, 4, 2);
  }
}

function drawWeapon(ctx, clsKey, x, y, facing, a) {
  // Translate to the weapon anchor point, rotate to face direction
  const ang = Math.atan2(facing.y, facing.x);
  const wx = Math.round(x + facing.x * 11);
  const wy = Math.round(y + facing.y * 11);
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(ang);

  switch (clsKey) {
    case 'warrior': {
      // Axe: handle + curved blade
      ctx.fillStyle = '#7a5530'; // handle
      ctx.fillRect(0, -1, 10, 2);
      ctx.fillStyle = a.accent;  // blade
      ctx.fillRect(7, -5, 5, 9);
      ctx.fillRect(9, -7, 3, 3);
      ctx.fillRect(9, 5, 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(7, -5, 1, 5);
      break;
    }
    case 'ranger': {
      // Bow: vertical arc + string + arrow nock
      ctx.fillStyle = a.accent;
      ctx.fillRect(3, -7, 2, 14);   // bow limb
      ctx.fillRect(2, -7, 1, 3);    // top curve
      ctx.fillRect(2, 4, 1, 3);     // bottom curve
      ctx.strokeStyle = '#c8c8b0';  // string
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(3, -7); ctx.lineTo(1, 0); ctx.lineTo(3, 7); ctx.stroke();
      ctx.fillStyle = '#c8a060';    // arrow shaft
      ctx.fillRect(-4, -1, 8, 1);
      ctx.fillStyle = '#aaaaaa';    // arrowhead
      ctx.fillRect(3, -1, 3, 1);
      break;
    }
    case 'firemage': {
      // Staff: brown handle, orange-red glowing orb tip
      ctx.fillStyle = '#7a5022';
      ctx.fillRect(0, -1, 11, 2);
      ctx.fillStyle = '#ff6010';    // orb outer
      ctx.beginPath(); ctx.arc(12, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffdd40';    // orb inner shine
      ctx.beginPath(); ctx.arc(11, -1, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,80,0,0.3)';
      ctx.beginPath(); ctx.arc(12, 0, 6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'necromancer': {
      // Bone staff: dark handle, purple glowing skull-orb
      ctx.fillStyle = '#2a1a3a';
      ctx.fillRect(0, -1, 11, 2);
      ctx.fillStyle = '#c080ff';    // orb
      ctx.beginPath(); ctx.arc(12, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0c0ff';    // shine
      ctx.beginPath(); ctx.arc(11, -1, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(140,60,255,0.25)';
      ctx.beginPath(); ctx.arc(12, 0, 7, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'druid': {
      // Gnarled staff: dark wood handle + glowing green gem tip
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(0, -1, 12, 2);
      ctx.fillStyle = '#3a2010';
      ctx.fillRect(3, -2, 2, 4);   // bark knot
      ctx.fillStyle = '#8bc34a';   // gem
      ctx.fillRect(12, -3, 5, 5);
      ctx.fillRect(14, -5, 3, 2);
      ctx.fillRect(14, 4, 3, 2);
      ctx.fillStyle = 'rgba(200,230,120,0.7)';
      ctx.fillRect(12, -3, 1, 3);  // gem highlight
      ctx.fillRect(12, -3, 3, 1);
      break;
    }
    case 'rogue': {
      // Dagger: short slim blade + dark handle
      ctx.fillStyle = '#3a3040';
      ctx.fillRect(0, -1, 5, 2);   // handle
      ctx.fillStyle = '#d0d4e0';   // blade
      ctx.fillRect(5, -1, 8, 2);
      ctx.fillRect(11, 0, 3, 1);   // tip taper
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(5, -1, 6, 1);   // edge shine
      break;
    }
    case 'paladin': {
      // Sword: longer blade with gold crossguard
      ctx.fillStyle = '#7a5022';
      ctx.fillRect(0, -1, 5, 2);   // grip
      ctx.fillStyle = a.accent;    // crossguard
      ctx.fillRect(4, -4, 3, 8);
      ctx.fillStyle = '#d8dce8';   // blade
      ctx.fillRect(7, -1, 10, 2);
      ctx.fillRect(15, -1, 3, 1);  // taper
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(7, -1, 8, 1);   // blade shine
      break;
    }
    case 'frostmage': {
      // Ice staff: pale handle, blue crystal tip
      ctx.fillStyle = '#3060a0';
      ctx.fillRect(0, -1, 10, 2);
      ctx.fillStyle = '#80d0ff';   // crystal
      ctx.fillRect(10, -4, 4, 8);
      ctx.fillRect(12, -6, 2, 3);
      ctx.fillRect(12, 3, 2, 3);
      ctx.fillStyle = 'rgba(200,240,255,0.5)';
      ctx.fillRect(10, -4, 1, 4);
      ctx.fillStyle = 'rgba(100,180,255,0.2)';
      ctx.beginPath(); ctx.arc(12, 0, 7, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default: {
      // Fallback: simple sword
      ctx.fillStyle = '#888';
      ctx.fillRect(0, -1, 12, 2);
    }
  }
  ctx.restore();
}

function drawSwing(ctx, p) {
  const s = p.swing;
  const alpha = s.t / s.max;
  const ang = Math.atan2(s.dir.y, s.dir.x);
  const spread = s.big ? Math.PI * 1.1 : Math.PI * 0.6;
  // +6 to account for average enemy radius so arc tip matches true hit distance
  const rad = (s.rad ?? (s.big ? 42 : 26)) + 6;
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

    if (m.free) {
      // Ghostly wraith: ethereal aura + semi-transparent body
      ctx.fillStyle = 'rgba(192,96,255,0.18)';
      ctx.beginPath(); ctx.ellipse(x, y, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = m.color;
      ctx.fillRect(x - 5, y - 8, 10, 12);
      ctx.fillRect(x - 4, y - 14, 8, 7);
      ctx.globalAlpha = 1;
      // glowing purple eye sockets
      ctx.fillStyle = 'rgba(255,180,255,0.85)';
      ctx.fillRect(x - 3, y - 12, 2, 2); ctx.fillRect(x + 1, y - 12, 2, 2);
    } else {
      // Skeleton minion — bone white with pixel-art shading
      const c = '#dfe3d0';

      // drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(x, y + 9, 7, 3, 0, 0, Math.PI * 2); ctx.fill();

      // stick legs
      ctx.fillStyle = c;
      ctx.fillRect(x - 4, y + 3, 2, 7);
      ctx.fillRect(x + 2, y + 3, 2, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(x - 3, y + 3, 1, 7);
      ctx.fillRect(x + 3, y + 3, 1, 7);

      // torso
      ctx.fillStyle = c;
      ctx.fillRect(x - 4, y - 5, 8, 9);
      // ribcage lines
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x - 3, y - 3, 6, 1);
      ctx.fillRect(x - 3, y,     6, 1);
      ctx.fillRect(x - 3, y + 3, 6, 1);
      // torso highlight / shadow
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x - 4, y - 5, 1, 9);
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(x + 3, y - 5, 1, 9);

      // skull
      ctx.fillStyle = c;
      ctx.fillRect(x - 4, y - 12, 8, 8);
      // skull highlight
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - 4, y - 12, 8, 1);
      ctx.fillRect(x - 4, y - 12, 1, 8);
      // skull shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x + 3, y - 12, 1, 8);
      // jaw gap
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x - 3, y - 5, 6, 1);

      // hollow eye sockets
      ctx.fillStyle = '#120808';
      ctx.fillRect(x - 3, y - 10, 3, 3);
      ctx.fillRect(x,     y - 10, 3, 3);
      // green soul-glow in eyes
      ctx.fillStyle = 'rgba(60,255,100,0.9)';
      ctx.fillRect(x - 3, y - 10, 1, 1);
      ctx.fillRect(x,     y - 10, 1, 1);
    }

    drawMiniBar(ctx, x, y - 16, m.hp / m.maxHp, m.free ? '#d69cff' : '#7bff9b');
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
      const t = game.time;
      const pulse = Math.sin(t * 2.8) * 0.06;
      const yOff = Math.sin(t * 2.8) * 1.5; // whole blob bobs up/down
      ctx.beginPath(); ctx.ellipse(x, y + 2 + yOff, r * (1 + pulse), r * (0.8 - pulse), 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.ellipse(x - r * 0.2, y - r * 0.15 + yOff, r * 0.45, r * 0.28, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + 4 + yOff, r * 0.4, r * 0.5, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a2a0a'; ctx.fillRect(x - 5, y - 1 + yOff, 3, 3); ctx.fillRect(x + 2, y - 1 + yOff, 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(x - 5, y - 1 + yOff, 1, 1); ctx.fillRect(x + 2, y - 1 + yOff, 1, 1);
      break;
    }
    case 'bat': {
      const t = game.time;
      const flap = Math.sin(t * 10) * 5; // fast wing flap
      ctx.fillRect(x - 3, y - 3, 6, 8);
      ctx.beginPath();
      ctx.moveTo(x - 3, y); ctx.lineTo(x - r - 3, y - 4 + flap); ctx.lineTo(x - 3, y + 3); ctx.fill();
      ctx.moveTo(x + 3, y); ctx.lineTo(x + r + 3, y - 4 + flap); ctx.lineTo(x + 3, y + 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 1); ctx.lineTo(x - r, y - 4 + flap); ctx.lineTo(x - r + 3, y - 2 + flap * 0.5); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 3, y - 1); ctx.lineTo(x + r, y - 4 + flap); ctx.lineTo(x + r - 3, y - 2 + flap * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 3, y - 3, 2, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 1, y - 3, 2, 8);
      break;
    }
    case 'trollwarchief': {
      const c = e.color;
      const t = game.time;
      const cOff = Math.round(Math.sin(t * 1.5) * 4); // club sway
      // legs / boots
      ctx.fillStyle = '#4a3010';
      ctx.fillRect(x - 10, y + 8, 8, 12); ctx.fillRect(x + 2, y + 8, 8, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x - 10, y + 8, 2, 12); ctx.fillRect(x + 2, y + 8, 2, 12);
      // chainmail torso
      ctx.fillStyle = '#808090';
      ctx.fillRect(x - 14, y - 8, 28, 18);
      ctx.fillStyle = '#5c5c68';
      for (let row = 0; row < 5; row++) {
        const off = (row % 2) * 3;
        for (let col = 0; col < 5; col++) ctx.fillRect(x - 13 + col * 6 + off, y - 7 + row * 4, 5, 3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x - 14, y - 8, 3, 18);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 11, y - 8, 3, 18);
      // shoulder strap & belt
      ctx.fillStyle = '#7a4818';
      ctx.fillRect(x - 13, y - 8, 4, 18); // diagonal strap
      ctx.fillRect(x - 14, y + 2, 28, 4); // belt
      ctx.fillStyle = '#c8962a'; ctx.fillRect(x - 3, y + 1, 6, 5); // buckle
      ctx.fillStyle = '#7a4818'; ctx.fillRect(x - 2, y + 2, 4, 3); // buckle hole
      // green shoulders
      ctx.fillStyle = c;
      ctx.fillRect(x - 17, y - 14, 9, 10); ctx.fillRect(x + 8, y - 14, 9, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x - 17, y - 14, 2, 10); ctx.fillRect(x + 8, y - 14, 2, 10);
      // club (left side, sways)
      ctx.fillStyle = '#4a2808'; ctx.fillRect(x - 23, y - 2 + cOff, 4, 14);
      ctx.fillStyle = '#6a4010'; ctx.fillRect(x - 26, y - 12 + cOff, 8, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 26, y - 12 + cOff, 2, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 19, y - 12 + cOff, 2, 12);
      // head
      ctx.fillStyle = c; ctx.fillRect(x - 12, y - 24, 24, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x - 12, y - 24, 24, 1); ctx.fillRect(x - 12, y - 24, 2, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + 10, y - 24, 2, 16);
      // horns
      ctx.fillStyle = '#c8b878';
      ctx.fillRect(x - 12, y - 33, 5, 10); ctx.fillRect(x + 7, y - 33, 5, 10);
      ctx.fillStyle = '#a89060';
      ctx.fillRect(x - 11, y - 36, 3, 5); ctx.fillRect(x + 8, y - 36, 3, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x - 12, y - 33, 1, 10); ctx.fillRect(x + 7, y - 33, 1, 10);
      // brow
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 10, y - 20, 20, 3);
      // eyes
      ctx.fillStyle = '#0a0606'; ctx.fillRect(x - 8, y - 19, 5, 3); ctx.fillRect(x + 3, y - 19, 5, 3);
      ctx.fillStyle = 'rgba(255,80,30,0.85)'; ctx.fillRect(x - 8, y - 19, 2, 1); ctx.fillRect(x + 3, y - 19, 2, 1);
      break;
    }
    case 'goblinking': {
      const gc = '#4a8a28'; // green body
      const t = game.time;
      const gemAlpha = 0.5 + Math.sin(t * 4) * 0.4; // crown gem sparkle
      // legs + shoes
      ctx.fillStyle = '#3a2010';
      ctx.fillRect(x - 11, y + 10, 9, 10); ctx.fillRect(x + 2, y + 10, 9, 10);
      ctx.fillStyle = '#7a3820'; // reddish boots
      ctx.fillRect(x - 12, y + 16, 10, 4); ctx.fillRect(x + 2, y + 16, 10, 4);
      // robe body - tri-color panels
      ctx.fillStyle = '#2858a0'; ctx.fillRect(x - 14, y - 8, 10, 20); // blue left
      ctx.fillStyle = '#c02828'; ctx.fillRect(x - 4, y - 8, 8, 20);  // red center
      ctx.fillStyle = '#d0d0d0'; ctx.fillRect(x + 4, y - 8, 10, 20); // white right
      // robe shading
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x - 14, y - 8, 2, 20);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 12, y - 8, 2, 20);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 14, y + 16, 28, 2);
      // wristbands
      ctx.fillStyle = '#c8962a';
      ctx.fillRect(x - 16, y + 2, 4, 4); ctx.fillRect(x + 12, y + 2, 4, 4);
      // green arms
      ctx.fillStyle = gc;
      ctx.fillRect(x - 17, y - 8, 5, 12); ctx.fillRect(x + 12, y - 8, 5, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x - 17, y - 8, 1, 12); ctx.fillRect(x + 12, y - 8, 1, 12);
      // head
      ctx.fillStyle = gc; ctx.fillRect(x - 13, y - 24, 26, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x - 13, y - 24, 26, 1); ctx.fillRect(x - 13, y - 24, 2, 18);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 11, y - 24, 2, 18);
      // crown base
      ctx.fillStyle = '#ffd060';
      ctx.fillRect(x - 11, y - 28, 22, 6);
      // crown points (3 points)
      ctx.fillRect(x - 11, y - 33, 5, 7); ctx.fillRect(x - 3, y - 32, 6, 6); ctx.fillRect(x + 6, y - 33, 5, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(x - 11, y - 33, 1, 33 - 28 + 6); ctx.fillRect(x - 11, y - 28, 22, 1);
      // gem in crown (sparkles)
      ctx.fillStyle = '#e03030'; ctx.fillRect(x - 2, y - 30, 4, 4);
      ctx.fillStyle = `rgba(255,255,255,${gemAlpha})`; ctx.fillRect(x - 2, y - 30, 2, 2);
      // brow ridge
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 11, y - 18, 22, 2);
      // eyes
      ctx.fillStyle = '#0a1808'; ctx.fillRect(x - 8, y - 17, 5, 4); ctx.fillRect(x + 3, y - 17, 5, 4);
      ctx.fillStyle = 'rgba(255,200,30,0.85)'; ctx.fillRect(x - 8, y - 17, 2, 1); ctx.fillRect(x + 3, y - 17, 2, 1);
      break;
    }
    case 'bonelord': {
      const robe = '#702090'; const skull = '#d8d8c0';
      const t = game.time;
      // robe body
      ctx.fillStyle = robe; ctx.fillRect(x - 14, y - 12, 28, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x - 14, y - 12, 3, 24);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 11, y - 12, 3, 24);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 14, y + 10, 28, 2);
      // robe bottom scallops
      ctx.fillStyle = '#4a1060';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 14 + i * 7, y + 10, 6, 4);
      // skull staff (right side)
      ctx.fillStyle = '#4a3010'; ctx.fillRect(x + 15, y - 20, 4, 32); // staff pole
      ctx.fillStyle = skull; ctx.fillRect(x + 13, y - 28, 8, 8);      // skull head
      ctx.fillStyle = '#201818'; ctx.fillRect(x + 14, y - 26, 2, 2); ctx.fillRect(x + 18, y - 26, 2, 2); // eyes
      ctx.fillStyle = '#201818';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 14 + i * 2, y - 22, 1, 2); // teeth
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 13, y - 28, 8, 1);
      // hood
      ctx.fillStyle = robe; ctx.fillRect(x - 13, y - 28, 26, 18);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 9, y - 26, 18, 14); // hood shadow
      // skull face
      ctx.fillStyle = skull; ctx.fillRect(x - 7, y - 25, 14, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x - 7, y - 25, 14, 1);
      // eye sockets (dark hollow)
      ctx.fillStyle = '#0c0808'; ctx.fillRect(x - 6, y - 22, 5, 5); ctx.fillRect(x + 1, y - 22, 5, 5);
      ctx.fillStyle = 'rgba(180,40,255,0.7)'; ctx.fillRect(x - 5, y - 22, 2, 2); ctx.fillRect(x + 2, y - 22, 2, 2); // purple glow in sockets
      // nose cavity
      ctx.fillStyle = '#201010'; ctx.fillRect(x - 1, y - 18, 2, 2);
      // jaw/teeth
      ctx.fillStyle = skull; ctx.fillRect(x - 5, y - 14, 10, 3);
      ctx.fillStyle = '#201010';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 4 + i * 3, y - 13, 2, 3); // teeth gaps
      // purple wisps (animated)
      const wispAlpha = 0.45 + Math.sin(t * 2.0) * 0.2;
      ctx.globalAlpha = wispAlpha;
      ctx.fillStyle = '#b040ff';
      const w1 = Math.round(Math.sin(t * 1.8) * 2);
      const w2 = Math.round(Math.sin(t * 2.3 + 1) * 2);
      ctx.fillRect(x - 22 + w1, y - 22, 4, 8); ctx.fillRect(x - 20 + w2, y - 28, 3, 8);
      ctx.fillRect(x + 18 - w1, y - 22, 4, 8); ctx.fillRect(x + 17 - w2, y - 28, 3, 8);
      ctx.fillRect(x - 22 + w2, y - 16, 3, 5); ctx.fillRect(x + 19 - w2, y - 16, 3, 5);
      ctx.globalAlpha = 1;
      break;
    }
    case 'wraith': {
      const wc = e.color;
      // outer glow
      ctx.globalAlpha = 0.15 + Math.sin(game.time * 1.8) * 0.05;
      ctx.fillStyle = wc;
      ctx.beginPath(); ctx.ellipse(x, y, r + 5, r + 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // wispy trailing tendrils
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = wc;
      const wtrails = [-7, -3, 1, 5, 9];
      for (let i = 0; i < wtrails.length; i++) {
        const wh = 6 + (i % 3) * 4 + Math.sin(game.time * 2 + i) * 2;
        ctx.fillRect(x + wtrails[i], y + 6, 3, wh);
      }
      ctx.globalAlpha = 1;
      // main body — elongated ghost form
      ctx.fillStyle = wc;
      ctx.fillRect(x - r + 2, y - r, (r - 2) * 2, r * 1.3);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - r + 2, y - r, 3, r * 1.3);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + r - 5, y - r, 3, r * 1.3);
      // top wisp points
      ctx.fillStyle = wc;
      ctx.fillRect(x - r + 2, y - r - 4, 4, 6); ctx.fillRect(x - 2, y - r - 6, 4, 8); ctx.fillRect(x + r - 6, y - r - 4, 4, 6);
      // hollow eyes
      ctx.fillStyle = '#0a2828'; ctx.fillRect(x - 5, y - r + 4, 4, 4); ctx.fillRect(x + 1, y - r + 4, 4, 4);
      ctx.fillStyle = wc; ctx.fillRect(x - 4, y - r + 5, 2, 2); ctx.fillRect(x + 2, y - r + 5, 2, 2);
      // mouth (O shape)
      ctx.fillStyle = '#0a2828'; ctx.fillRect(x - 2, y - r + 9, 5, 4);
      ctx.fillStyle = wc; ctx.fillRect(x - 1, y - r + 10, 3, 2);
      break;
    }
    case 'wraithqueen': {
      const t = game.time;
      // outer ethereal glow
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#a8f8f0';
      ctx.beginPath(); ctx.ellipse(x, y, r + 6, r + 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // wispy tendrils at bottom (animated)
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#c8f8f8';
      const tendrilOffsets = [-14, -9, -4, 1, 6, 11, 16];
      for (let i = 0; i < tendrilOffsets.length; i++) {
        const wave = Math.sin(t * 2.2 + i * 0.9) * 3;
        const th = 8 + (i % 3) * 5;
        ctx.fillRect(x + tendrilOffsets[i], y + 14 + wave, 3, th);
      }
      // side wispy arms
      ctx.fillRect(x - 28, y - 10, 4, 16); ctx.fillRect(x - 24, y - 18, 3, 10);
      ctx.fillRect(x + 24, y - 10, 4, 16); ctx.fillRect(x + 21, y - 18, 3, 10);
      ctx.globalAlpha = 1;
      // main body
      ctx.fillStyle = '#d8f8f8';
      ctx.fillRect(x - 16, y - 14, 32, 30);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 16, y - 14, 4, 30);
      ctx.fillStyle = 'rgba(80,180,200,0.3)'; ctx.fillRect(x + 12, y - 14, 4, 30);
      // crown of spikes
      ctx.fillStyle = '#b8f0f0';
      const spikes = [-14, -9, -4, 1, 6, 11];
      for (let i = 0; i < spikes.length; i++) {
        const sh = 6 + (i % 2) * 5;
        ctx.fillRect(x + spikes[i], y - 14 - sh, 3, sh + 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < spikes.length; i++) {
        const sh = 6 + (i % 2) * 5;
        ctx.fillRect(x + spikes[i], y - 14 - sh, 1, sh);
      }
      // face shadow
      ctx.fillStyle = 'rgba(40,120,140,0.35)'; ctx.fillRect(x - 12, y - 12, 24, 10);
      // glowing eyes
      ctx.fillStyle = '#00f8e8'; ctx.fillRect(x - 8, y - 10, 6, 5); ctx.fillRect(x + 2, y - 10, 6, 5);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 7, y - 9, 2, 2); ctx.fillRect(x + 3, y - 9, 2, 2);
      ctx.fillStyle = 'rgba(0,240,200,0.5)'; // eye glow halo
      ctx.fillRect(x - 10, y - 12, 10, 9); ctx.fillRect(x, y - 12, 10, 9);
      // mouth (sorrowful)
      ctx.fillStyle = 'rgba(40,120,140,0.7)';
      ctx.fillRect(x - 5, y - 2, 10, 2);
      ctx.fillRect(x - 6, y - 1, 2, 2); ctx.fillRect(x + 4, y - 1, 2, 2);
      break;
    }
    case 'devourer': {
      // tentacles (behind body)
      const tentacleAngles = [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9];
      ctx.fillStyle = '#6a2888';
      for (const ang of tentacleAngles) {
        const tx2 = Math.cos(ang), ty2 = Math.sin(ang);
        const len = r + 10 + Math.sin(game.time * 1.8 + ang) * 4;
        // tentacle as thick tapered rects
        ctx.fillRect(x + tx2 * (r - 4) - 3, y + ty2 * (r - 4) - 3, 6, 6);
        ctx.fillRect(x + tx2 * (r + 2) - 2, y + ty2 * (r + 2) - 2, 5, 5);
        ctx.fillRect(x + tx2 * (r + 7) - 2, y + ty2 * (r + 7) - 2, 4, 4);
        ctx.fillRect(x + tx2 * len - 1, y + ty2 * len - 1, 3, 3);
      }
      // main body
      ctx.fillStyle = '#2a5a20';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      // body highlight top-left
      ctx.fillStyle = '#3a7a2c';
      ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.75, 0, Math.PI * 2); ctx.fill();
      // body shadow bottom-right
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.3, r * 0.6, 0, Math.PI * 2); ctx.fill();
      // central maw
      ctx.fillStyle = '#0a0505';
      ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, Math.PI * 2); ctx.fill();
      // teeth ring
      ctx.fillStyle = '#e8e4d0';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const tr = r * 0.42;
        ctx.fillRect(x + Math.cos(a) * tr - 2, y + Math.sin(a) * tr - 2, 4, 4);
      }
      // inner maw darkness
      ctx.fillStyle = '#050202';
      ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, Math.PI * 2); ctx.fill();
      // tongue
      ctx.fillStyle = '#c03040';
      ctx.beginPath(); ctx.ellipse(x, y + 3, r * 0.18, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      // ring of eyes
      const eyeAngles = [0, 1.05, 2.09, 3.14, 4.19, 5.24];
      const eyeDist = r * 0.7;
      for (const ea of eyeAngles) {
        const ex = x + Math.cos(ea) * eyeDist, ey = y + Math.sin(ea) * eyeDist;
        ctx.fillStyle = '#e8d040';
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#100808';
        ctx.beginPath(); ctx.arc(ex + 0.5, ey + 0.5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(ex - 3, ey - 3, 1, 1);
      }
      // body surface texture
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x - 4, y - r + 4, 3, 3); ctx.fillRect(x + 6, y - r + 8, 2, 2);
      ctx.fillRect(x - 12, y - 6, 2, 2); ctx.fillRect(x + 10, y + 8, 2, 2);
      break;
    }
    case 'kingslime': {
      const t = game.time;
      const pulse = Math.sin(t * 2.2) * 0.07;
      const yOff = Math.sin(t * 2.2) * 2;
      // outer glow
      ctx.globalAlpha = 0.22 + Math.sin(t * 1.8) * 0.07;
      ctx.fillStyle = '#90ff60';
      ctx.beginPath(); ctx.ellipse(x, y + 4 + yOff, r * 1.35, r * 1.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // main body
      ctx.fillStyle = '#3ab828';
      ctx.beginPath(); ctx.ellipse(x, y + 4 + yOff, r * (1.18 + pulse), r * (0.96 - pulse), 0, 0, Math.PI * 2); ctx.fill();
      // highlight dome
      ctx.fillStyle = '#60e040';
      ctx.beginPath(); ctx.ellipse(x - r * 0.18, y - r * 0.1 + yOff, r * 0.72, r * 0.5, -0.3, 0, Math.PI * 2); ctx.fill();
      // specular
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.25 + yOff, r * 0.28, r * 0.18, -0.4, 0, Math.PI * 2); ctx.fill();
      // shadow underside
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath(); ctx.ellipse(x + r * 0.2, y + r * 0.5 + yOff, r * 0.65, r * 0.45, 0.3, 0, Math.PI * 2); ctx.fill();
      // eyes
      ctx.fillStyle = '#081a04'; ctx.fillRect(x - 8, y + yOff, 6, 6); ctx.fillRect(x + 3, y + yOff, 6, 6);
      ctx.fillStyle = '#50ff20'; ctx.fillRect(x - 7, y + 1 + yOff, 3, 3); ctx.fillRect(x + 4, y + 1 + yOff, 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 7, y + 1 + yOff, 1, 1); ctx.fillRect(x + 4, y + 1 + yOff, 1, 1);
      // mouth
      ctx.fillStyle = '#0a1a06'; ctx.fillRect(x - 7, y + 8 + yOff, 14, 4);
      ctx.fillStyle = '#50ff20';
      ctx.fillRect(x - 6, y + 8 + yOff, 2, 3); ctx.fillRect(x - 2, y + 8 + yOff, 2, 3); ctx.fillRect(x + 2, y + 8 + yOff, 2, 3);
      // crown
      ctx.fillStyle = '#ffd060'; ctx.fillRect(x - 12, y - r - 2 + yOff, 24, 7);
      ctx.fillStyle = '#ffd060';
      ctx.fillRect(x - 12, y - r - 9 + yOff, 5, 9); // left point
      ctx.fillRect(x - 3,  y - r - 7 + yOff, 6, 7); // center point
      ctx.fillRect(x + 7,  y - r - 9 + yOff, 5, 9); // right point
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x - 12, y - r - 9 + yOff, 1, 16); ctx.fillRect(x - 12, y - r - 2 + yOff, 24, 1);
      // crown gem
      const gA = 0.55 + Math.sin(t * 4.5) * 0.35;
      ctx.fillStyle = '#e03030'; ctx.fillRect(x - 2, y - r - 5 + yOff, 5, 5);
      ctx.fillStyle = `rgba(255,255,255,${gA})`; ctx.fillRect(x - 2, y - r - 5 + yOff, 2, 2);
      break;
    }
    case 'batzilla': {
      const t = game.time;
      const flap = Math.sin(t * 5) * 8;
      const glide = Math.sin(t * 1.2) * 3;
      // wing membranes (left)
      ctx.fillStyle = '#5a2888';
      ctx.beginPath();
      ctx.moveTo(x - 4, y + glide);
      ctx.lineTo(x - r * 2.4, y - 14 + flap + glide);
      ctx.lineTo(x - r * 2.8, y + 4 + flap * 0.5 + glide);
      ctx.lineTo(x - r * 1.8, y + 12 + glide);
      ctx.lineTo(x - 4, y + 8 + glide);
      ctx.fill();
      // wing membranes (right)
      ctx.beginPath();
      ctx.moveTo(x + 4, y + glide);
      ctx.lineTo(x + r * 2.4, y - 14 + flap + glide);
      ctx.lineTo(x + r * 2.8, y + 4 + flap * 0.5 + glide);
      ctx.lineTo(x + r * 1.8, y + 12 + glide);
      ctx.lineTo(x + 4, y + 8 + glide);
      ctx.fill();
      // wing highlight
      ctx.fillStyle = 'rgba(160,80,255,0.28)';
      ctx.beginPath();
      ctx.moveTo(x - 4, y + glide);
      ctx.lineTo(x - r * 2.0, y - 10 + flap + glide);
      ctx.lineTo(x - r * 1.4, y + 6 + glide);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 4, y + glide);
      ctx.lineTo(x + r * 2.0, y - 10 + flap + glide);
      ctx.lineTo(x + r * 1.4, y + 6 + glide);
      ctx.fill();
      // wing fingers
      ctx.fillStyle = '#3a1660';
      ctx.fillRect(x - r * 2.8 - 1, y + 4 + flap * 0.5 + glide, 3, 3);
      ctx.fillRect(x - r * 2.0, y - 16 + flap + glide, 3, 5);
      ctx.fillRect(x + r * 2.8 - 2, y + 4 + flap * 0.5 + glide, 3, 3);
      ctx.fillRect(x + r * 2.0 - 2, y - 16 + flap + glide, 3, 5);
      // body
      ctx.fillStyle = '#5a2090';
      ctx.beginPath(); ctx.ellipse(x, y + 2 + glide, r * 0.72, r * 0.88, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7830b8';
      ctx.beginPath(); ctx.ellipse(x - r * 0.15, y - r * 0.1 + glide, r * 0.5, r * 0.55, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x + r * 0.2, y + r * 0.3 + glide, r * 0.45, r * 0.5, 0.2, 0, Math.PI * 2); ctx.fill();
      // ears
      ctx.fillStyle = '#3a1660';
      ctx.fillRect(x - 8, y - r * 0.8 + glide, 5, 10); ctx.fillRect(x + 3, y - r * 0.8 + glide, 5, 10);
      ctx.fillStyle = '#7030a8'; ctx.fillRect(x - 7, y - r * 0.8 + 2 + glide, 3, 6); ctx.fillRect(x + 4, y - r * 0.8 + 2 + glide, 3, 6);
      // eyes
      ctx.fillStyle = '#ff2020';
      ctx.beginPath(); ctx.arc(x - 5, y - 2 + glide, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 5, y - 2 + glide, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8040'; ctx.fillRect(x - 6, y - 3 + glide, 2, 2); ctx.fillRect(x + 4, y - 3 + glide, 2, 2);
      const eyeGlow = 0.3 + Math.sin(t * 3) * 0.15;
      ctx.fillStyle = `rgba(255,30,30,${eyeGlow})`;
      ctx.beginPath(); ctx.arc(x - 5, y - 2 + glide, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 5, y - 2 + glide, 6, 0, Math.PI * 2); ctx.fill();
      // fangs
      ctx.fillStyle = '#f0e8d0'; ctx.fillRect(x - 5, y + 5 + glide, 3, 5); ctx.fillRect(x + 2, y + 5 + glide, 3, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x - 5, y + 5 + glide, 1, 5); ctx.fillRect(x + 2, y + 5 + glide, 1, 5);
      break;
    }
    case 'sentinelgolem': {
      const t = game.time;
      const eyePulse = 0.6 + Math.sin(t * 1.4) * 0.3;
      const gc = '#a0a8b8';
      // stone legs
      ctx.fillStyle = '#707888'; ctx.fillRect(x - 13, y + 10, 11, 14); ctx.fillRect(x + 2, y + 10, 11, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x - 13, y + 10, 2, 14); ctx.fillRect(x + 2, y + 10, 2, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x - 2, y + 10, 4, 14);
      // rust armor bands on shins
      ctx.fillStyle = '#8a5030'; ctx.fillRect(x - 13, y + 16, 11, 3); ctx.fillRect(x + 2, y + 16, 11, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 13, y + 16, 2, 3); ctx.fillRect(x + 2, y + 16, 2, 3);
      // massive stone torso
      ctx.fillStyle = gc; ctx.fillRect(x - 16, y - 12, 32, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(x - 16, y - 12, 3, 24); ctx.fillRect(x - 16, y - 12, 32, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x + 13, y - 12, 3, 24);
      // crack texture
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x - 10, y - 8, 1, 10); ctx.fillRect(x - 5, y - 2, 1, 8);
      ctx.fillRect(x + 5, y - 9, 1, 6); ctx.fillRect(x + 10, y - 4, 1, 9);
      ctx.fillRect(x - 13, y + 4, 5, 1); ctx.fillRect(x + 4, y, 6, 1);
      // rust armor bands on torso
      ctx.fillStyle = '#8a5030'; ctx.fillRect(x - 16, y - 4, 32, 4); ctx.fillRect(x - 16, y + 6, 32, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x - 16, y - 4, 3, 4); ctx.fillRect(x - 16, y + 6, 3, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + 13, y - 4, 3, 4); ctx.fillRect(x + 13, y + 6, 3, 3);
      // massive stone fists/arms
      ctx.fillStyle = '#808898'; ctx.fillRect(x - 24, y - 8, 10, 10); ctx.fillRect(x + 14, y - 8, 10, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x - 24, y - 8, 2, 10); ctx.fillRect(x + 14, y - 8, 2, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 15, y - 8, 1, 10); ctx.fillRect(x + 23, y - 8, 1, 10);
      // rust bands on arms
      ctx.fillStyle = '#8a5030'; ctx.fillRect(x - 24, y - 3, 10, 3); ctx.fillRect(x + 14, y - 3, 10, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 24, y - 3, 2, 3); ctx.fillRect(x + 14, y - 3, 2, 3);
      // stone head (square)
      ctx.fillStyle = gc; ctx.fillRect(x - 14, y - 28, 28, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 14, y - 28, 28, 1); ctx.fillRect(x - 14, y - 28, 3, 18);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 11, y - 28, 3, 18);
      // crack on head
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x - 3, y - 27, 1, 8); ctx.fillRect(x + 5, y - 24, 1, 5);
      // single large red eye (center)
      ctx.fillStyle = '#cc1010'; ctx.beginPath(); ctx.arc(x, y - 18, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff3020'; ctx.beginPath(); ctx.arc(x - 1, y - 19, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8060'; ctx.fillRect(x - 2, y - 21, 3, 3);
      ctx.fillStyle = `rgba(220,20,10,${eyePulse})`;
      ctx.beginPath(); ctx.arc(x, y - 18, 12, 0, Math.PI * 2); ctx.fill();
      // rust crown band on head
      ctx.fillStyle = '#8a5030'; ctx.fillRect(x - 14, y - 12, 28, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 14, y - 12, 3, 4);
      break;
    }
    case 'golem_shard': {
      const t = game.time;
      const eyeP = 0.4 + Math.sin(t * 2) * 0.2;
      // stone body (smaller golem chunk)
      ctx.fillStyle = '#808898'; ctx.fillRect(x - 8, y - 8, 16, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x - 8, y - 8, 2, 16); ctx.fillRect(x - 8, y - 8, 16, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 6, y - 8, 2, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 5, y - 4, 1, 6); ctx.fillRect(x + 2, y - 2, 1, 5);
      // rust band
      ctx.fillStyle = '#7a4828'; ctx.fillRect(x - 8, y - 2, 16, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 8, y - 2, 2, 3);
      // arms
      ctx.fillStyle = '#909898'; ctx.fillRect(x - 12, y - 4, 6, 6); ctx.fillRect(x + 6, y - 4, 6, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x - 12, y - 4, 1, 6); ctx.fillRect(x + 6, y - 4, 1, 6);
      // single red eye
      ctx.fillStyle = '#cc1010'; ctx.beginPath(); ctx.arc(x, y - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff4020'; ctx.beginPath(); ctx.arc(x - 1, y - 5, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(220,20,10,${eyeP})`; ctx.beginPath(); ctx.arc(x, y - 4, 6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'troll_grunt': {
      const t = game.time;
      const aOff = Math.round(Math.sin(t * 2.2) * 2); // axe sway
      // legs
      ctx.fillStyle = '#4a3010';
      ctx.fillRect(x - 5, y + 5, 4, 6); ctx.fillRect(x + 1, y + 5, 4, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x - 5, y + 5, 1, 6); ctx.fillRect(x + 1, y + 5, 1, 6);
      // chainmail chest
      ctx.fillStyle = '#707880'; ctx.fillRect(x - 7, y - 5, 14, 11);
      ctx.fillStyle = '#505860';
      ctx.fillRect(x - 7, y - 4, 14, 2); ctx.fillRect(x - 7, y - 1, 14, 2); ctx.fillRect(x - 7, y + 2, 14, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x - 7, y - 5, 2, 11);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 5, y - 5, 2, 11);
      // green shoulders
      ctx.fillStyle = '#5a9a28';
      ctx.fillRect(x - 9, y - 8, 4, 5); ctx.fillRect(x + 5, y - 8, 4, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 9, y - 8, 1, 5); ctx.fillRect(x + 5, y - 8, 1, 5);
      // axe (right side, sways)
      ctx.fillStyle = '#3a2808'; ctx.fillRect(x + 9, y - 6 + aOff, 3, 10);
      ctx.fillStyle = '#909898'; ctx.fillRect(x + 10, y - 10 + aOff, 5, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 10, y - 10 + aOff, 1, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 14, y - 10 + aOff, 1, 7);
      // head
      ctx.fillStyle = '#5a9a28'; ctx.fillRect(x - 5, y - 14, 10, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 5, y - 14, 10, 1);
      // helmet
      ctx.fillStyle = '#606870'; ctx.fillRect(x - 5, y - 15, 10, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 5, y - 15, 10, 1); ctx.fillRect(x - 5, y - 15, 1, 4);
      // eyes
      ctx.fillStyle = '#0a0604'; ctx.fillRect(x - 3, y - 10, 2, 2); ctx.fillRect(x + 1, y - 10, 2, 2);
      ctx.fillStyle = 'rgba(255,80,30,0.75)'; ctx.fillRect(x - 3, y - 10, 1, 1); ctx.fillRect(x + 1, y - 10, 1, 1);
      break;
    }
    case 'goblin_skirmisher': {
      const gc2 = '#7ab030';
      const t = game.time;
      const sOff = Math.round(Math.sin(t * 3.5) * 2); // sword bob
      // legs
      ctx.fillStyle = '#3a2a10'; ctx.fillRect(x - 4, y + 5, 3, 6); ctx.fillRect(x + 1, y + 5, 3, 6);
      // tunic (purple stripe accent)
      ctx.fillStyle = '#5a3080'; ctx.fillRect(x - 5, y - 4, 10, 10);
      ctx.fillStyle = '#7840a0'; ctx.fillRect(x - 5, y - 4, 3, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x - 5, y - 4, 1, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + 3, y - 4, 2, 10);
      // green arms
      ctx.fillStyle = gc2; ctx.fillRect(x - 7, y - 4, 3, 7); ctx.fillRect(x + 4, y - 4, 3, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x - 7, y - 4, 1, 7); ctx.fillRect(x + 4, y - 4, 1, 7);
      // sword (right side, bobs)
      ctx.fillStyle = '#b0b8c0'; ctx.fillRect(x + 6, y - 8 + sOff, 2, 12);
      ctx.fillStyle = '#7a4010'; ctx.fillRect(x + 5, y + sOff, 4, 2);
      ctx.fillStyle = '#3a1808'; ctx.fillRect(x + 6, y + 2 + sOff, 2, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x + 6, y - 8 + sOff, 1, 12);
      // head
      ctx.fillStyle = gc2; ctx.fillRect(x - 4, y - 13, 8, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 4, y - 13, 8, 1);
      // big ears
      ctx.fillStyle = gc2; ctx.fillRect(x - 7, y - 12, 3, 5); ctx.fillRect(x + 4, y - 12, 3, 5);
      ctx.fillStyle = 'rgba(255,150,150,0.4)'; ctx.fillRect(x - 6, y - 11, 2, 3); ctx.fillRect(x + 5, y - 11, 2, 3);
      // eyes
      ctx.fillStyle = '#0a0a04'; ctx.fillRect(x - 3, y - 10, 2, 2); ctx.fillRect(x + 1, y - 10, 2, 2);
      ctx.fillStyle = 'rgba(255,200,30,0.85)'; ctx.fillRect(x - 3, y - 10, 1, 1); ctx.fillRect(x + 1, y - 10, 1, 1);
      break;
    }
    case 'skeletal_servant': {
      const bone = '#d8d8b8';
      const t = game.time;
      const rattle = Math.round(Math.sin(t * 6) * 1); // subtle bone rattle
      // leg bones
      ctx.fillStyle = bone; ctx.fillRect(x - 4, y + 4, 2, 7); ctx.fillRect(x + 2, y + 4, 2, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 2, y + 4, 1, 7); ctx.fillRect(x + 4, y + 4, 1, 7);
      ctx.fillStyle = bone; ctx.fillRect(x - 5, y + 6, 4, 2); ctx.fillRect(x + 1, y + 6, 4, 2); // knee
      // ribcage
      ctx.fillStyle = bone; ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x - 5, y - 3, 10, 1); ctx.fillRect(x - 5, y, 10, 1); ctx.fillRect(x - 5, y + 2, 10, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x - 5, y - 5, 2, 10);
      // arm bones
      ctx.fillStyle = bone; ctx.fillRect(x - 7, y - 4, 2, 8); ctx.fillRect(x + 5, y - 4, 2, 8);
      // sword (left side, rattles)
      ctx.fillStyle = '#b0b0c0'; ctx.fillRect(x - 11 + rattle, y - 8, 2, 13);
      ctx.fillStyle = bone; ctx.fillRect(x - 13 + rattle, y - 3, 6, 2);
      ctx.fillStyle = '#4a3010'; ctx.fillRect(x - 11 + rattle, y + 5, 2, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x - 11 + rattle, y - 8, 1, 13);
      // skull
      ctx.fillStyle = bone; ctx.fillRect(x - 4, y - 14, 8, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 4, y - 14, 8, 1); ctx.fillRect(x - 4, y - 14, 1, 9);
      // eye sockets
      ctx.fillStyle = '#0c0808'; ctx.fillRect(x - 3, y - 12, 3, 3); ctx.fillRect(x, y - 12, 3, 3);
      // nose + teeth
      ctx.fillStyle = '#1a0a0a'; ctx.fillRect(x - 1, y - 9, 2, 2);
      ctx.fillStyle = bone; ctx.fillRect(x - 2, y - 7, 5, 2);
      ctx.fillStyle = '#201010'; ctx.fillRect(x - 1, y - 6, 1, 1); ctx.fillRect(x + 1, y - 6, 1, 1); ctx.fillRect(x + 2, y - 6, 1, 1);
      break;
    }
    case 'spectral_echo': {
      // Glowing ghost orb with haunted face
      ctx.globalAlpha = 0.18 + Math.sin(game.time * 2.2) * 0.06;
      ctx.fillStyle = '#80d8f0';
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // orb body
      ctx.fillStyle = '#b8e8f8';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.beginPath(); ctx.arc(x - r * 0.28, y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(40,80,120,0.32)';
      ctx.beginPath(); ctx.arc(x + r * 0.25, y + r * 0.28, r * 0.58, 0, Math.PI * 2); ctx.fill();
      // haunted eyes (hollow)
      ctx.fillStyle = '#082830'; ctx.fillRect(x - 5, y - 3, 4, 4); ctx.fillRect(x + 1, y - 3, 4, 4);
      ctx.fillStyle = '#40c8e8'; ctx.fillRect(x - 4, y - 2, 2, 2); ctx.fillRect(x + 2, y - 2, 2, 2);
      // sad open mouth
      ctx.fillStyle = '#082830'; ctx.fillRect(x - 3, y + 2, 7, 4);
      ctx.fillStyle = 'rgba(200,240,255,0.6)';
      ctx.fillRect(x - 2, y + 2, 1, 2); ctx.fillRect(x, y + 2, 1, 2); ctx.fillRect(x + 2, y + 2, 1, 2);
      break;
    }
    case 'devourer_larva': {
      const t = game.time;
      const lPulse = Math.sin(t * 3) * 0.08; // body scale pulse
      // Mini eye-creature with animated tentacle nubs
      ctx.fillStyle = '#3a5a20';
      const nubs2 = [[-1.2, 0], [1.2, 0], [0, -1], [0, 1], [-0.85, -0.85], [0.85, 0.85]];
      for (let ni = 0; ni < nubs2.length; ni++) {
        const [nx, ny] = nubs2[ni];
        const nWave = Math.sin(t * 3 + ni * 1.05) * 1.5;
        ctx.fillRect(x + nx * (r + 1 + nWave) - 2, y + ny * (r + 1 + nWave) - 2, 4, 4);
        ctx.fillRect(x + nx * (r + 4 + nWave) - 1, y + ny * (r + 4 + nWave) - 1, 3, 3);
      }
      // body (pulsing scale)
      const rp = r * (1 + lPulse);
      ctx.fillStyle = '#4a8028';
      ctx.beginPath(); ctx.arc(x, y, rp, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a9a30';
      ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.3, r * 0.55, 0, Math.PI * 2); ctx.fill();
      // large eye
      ctx.fillStyle = '#d8c030';
      ctx.beginPath(); ctx.arc(x, y - 1, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a0606';
      ctx.beginPath(); ctx.arc(x + 1, y, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x - Math.round(r * 0.38), y - Math.round(r * 0.48), 2, 2);
      // tiny mouth
      ctx.fillStyle = '#0a0404'; ctx.fillRect(x - 3, y + Math.round(r * 0.32), 7, 3);
      ctx.fillStyle = '#d8c8b0';
      ctx.fillRect(x - 2, y + Math.round(r * 0.32), 1, 2);
      ctx.fillRect(x, y + Math.round(r * 0.32), 1, 2);
      ctx.fillRect(x + 2, y + Math.round(r * 0.32), 1, 2);
      break;
    }
    case 'goblin': {
      const gc = e.color;
      const t = game.time;
      const dOff = Math.round(Math.sin(t * 3.2) * 2); // dagger bob
      // legs — scrappy brown rags
      ctx.fillStyle = '#3a2a10'; ctx.fillRect(x - 4, y + 5, 3, 6); ctx.fillRect(x + 1, y + 5, 3, 6);
      // body — crude leather vest
      ctx.fillStyle = '#6a4218'; ctx.fillRect(x - 5, y - 4, 10, 10);
      ctx.fillStyle = '#4a2c0e'; ctx.fillRect(x - 5, y - 4, 3, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x - 5, y - 4, 1, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + 3, y - 4, 2, 10);
      // green arms
      ctx.fillStyle = gc; ctx.fillRect(x - 7, y - 3, 3, 6); ctx.fillRect(x + 4, y - 3, 3, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x - 7, y - 3, 1, 6); ctx.fillRect(x + 4, y - 3, 1, 6);
      // dagger (right side, bobs up/down)
      ctx.fillStyle = '#909898'; ctx.fillRect(x + 6, y - 5 + dOff, 2, 9);
      ctx.fillStyle = '#5a3010'; ctx.fillRect(x + 5, y + dOff, 4, 2); ctx.fillRect(x + 6, y + 2 + dOff, 2, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + 6, y - 5 + dOff, 1, 9);
      // head + big ears
      ctx.fillStyle = gc; ctx.fillRect(x - 4, y - 13, 8, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 4, y - 13, 8, 1);
      ctx.fillStyle = gc; ctx.fillRect(x - 7, y - 12, 3, 5); ctx.fillRect(x + 4, y - 12, 3, 5);
      ctx.fillStyle = 'rgba(255,140,140,0.35)'; ctx.fillRect(x - 6, y - 11, 2, 3); ctx.fillRect(x + 5, y - 11, 2, 3);
      // eyes
      ctx.fillStyle = '#0a0a04'; ctx.fillRect(x - 3, y - 10, 2, 2); ctx.fillRect(x + 1, y - 10, 2, 2);
      ctx.fillStyle = 'rgba(220,180,20,0.8)'; ctx.fillRect(x - 3, y - 10, 1, 1); ctx.fillRect(x + 1, y - 10, 1, 1);
      break;
    }
    case 'orc': {
      const oc = e.color;
      const t = game.time;
      const aOff = Math.round(Math.sin(t * 1.8) * 3); // axe sway
      // legs
      ctx.fillStyle = '#2e1e0c'; ctx.fillRect(x - 6, y + 7, 5, 7); ctx.fillRect(x + 1, y + 7, 5, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x - 6, y + 7, 1, 7); ctx.fillRect(x + 1, y + 7, 1, 7);
      // heavy hide body
      ctx.fillStyle = oc; ctx.fillRect(x - 9, y - 6, 18, 15);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 9, y - 6, 2, 15); ctx.fillRect(x - 9, y - 6, 18, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x + 7, y - 6, 2, 15); ctx.fillRect(x - 9, y + 7, 18, 2);
      // shoulder pads (dark leather)
      ctx.fillStyle = '#3a2808'; ctx.fillRect(x - 11, y - 9, 6, 5); ctx.fillRect(x + 5, y - 9, 6, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x - 11, y - 9, 1, 5); ctx.fillRect(x + 5, y - 9, 1, 5);
      // two-handed axe (left side, big, sways)
      ctx.fillStyle = '#4a2808'; ctx.fillRect(x - 16, y - 8 + aOff, 4, 16);
      ctx.fillStyle = '#808888'; ctx.fillRect(x - 19, y - 13 + aOff, 7, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x - 19, y - 13 + aOff, 1, 9);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 13, y - 13 + aOff, 1, 9);
      // head (wider, brutish)
      ctx.fillStyle = oc; ctx.fillRect(x - 8, y - 17, 16, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 8, y - 17, 16, 1); ctx.fillRect(x - 8, y - 17, 2, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 6, y - 17, 2, 12);
      // brow ridge
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 7, y - 12, 14, 3);
      // tusks
      ctx.fillStyle = '#d8c890'; ctx.fillRect(x - 4, y - 7, 2, 4); ctx.fillRect(x + 2, y - 7, 2, 4);
      // eyes
      ctx.fillStyle = '#080404'; ctx.fillRect(x - 5, y - 11, 4, 3); ctx.fillRect(x + 1, y - 11, 4, 3);
      ctx.fillStyle = 'rgba(255,60,20,0.9)'; ctx.fillRect(x - 4, y - 11, 2, 1); ctx.fillRect(x + 2, y - 11, 2, 1);
      break;
    }
    case 'skeleton': {
      const bone = e.color;
      const t = game.time;
      const bStr = Math.sin(t * 5) * 1.5; // bowstring vibration
      // leg bones
      ctx.fillStyle = bone; ctx.fillRect(x - 4, y + 4, 2, 7); ctx.fillRect(x + 2, y + 4, 2, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 2, y + 4, 1, 7); ctx.fillRect(x + 4, y + 4, 1, 7);
      ctx.fillStyle = bone; ctx.fillRect(x - 5, y + 6, 4, 2); ctx.fillRect(x + 1, y + 6, 4, 2);
      // ribcage
      ctx.fillStyle = bone; ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(x - 5, y - 3, 10, 1); ctx.fillRect(x - 5, y, 10, 1); ctx.fillRect(x - 5, y + 2, 10, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 5, y - 5, 2, 10);
      // arm bones
      ctx.fillStyle = bone; ctx.fillRect(x - 7, y - 4, 2, 8); ctx.fillRect(x + 5, y - 4, 2, 8);
      // bow (right side, since it's ranged)
      ctx.fillStyle = '#7a5022';
      ctx.beginPath(); ctx.moveTo(x + 8, y - 10); ctx.quadraticCurveTo(x + 14, y, x + 8, y + 10); ctx.stroke();
      ctx.fillStyle = '#7a5022'; ctx.fillRect(x + 8, y - 10, 3, 2); ctx.fillRect(x + 8, y + 8, 3, 2); ctx.fillRect(x + 8, y - 1, 3, 2);
      ctx.strokeStyle = '#c8b070'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 9, y - 9); ctx.quadraticCurveTo(x + 9 + bStr, y, x + 9, y + 9); ctx.stroke();
      // arrow nocked
      ctx.strokeStyle = '#c89050'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 3, y); ctx.lineTo(x + 9 + bStr, y); ctx.stroke();
      ctx.fillStyle = '#c0d0d8'; ctx.beginPath(); ctx.moveTo(x + 3, y); ctx.lineTo(x + 6, y - 2); ctx.lineTo(x + 6, y + 2); ctx.fill();
      ctx.lineWidth = 1;
      // skull
      ctx.fillStyle = bone; ctx.fillRect(x - 4, y - 14, 8, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x - 4, y - 14, 8, 1); ctx.fillRect(x - 4, y - 14, 1, 9);
      ctx.fillStyle = '#0c0808'; ctx.fillRect(x - 3, y - 12, 3, 3); ctx.fillRect(x, y - 12, 3, 3);
      ctx.fillStyle = '#1a0a0a'; ctx.fillRect(x - 1, y - 9, 2, 2);
      ctx.fillStyle = bone; ctx.fillRect(x - 2, y - 7, 5, 2);
      ctx.fillStyle = '#201010'; ctx.fillRect(x - 1, y - 6, 1, 1); ctx.fillRect(x + 1, y - 6, 1, 1); ctx.fillRect(x + 2, y - 6, 1, 1);
      break;
    }
    case 'cultist': {
      const rc = e.color;
      const t = game.time;
      const orbGlow = 0.35 + Math.sin(t * 2.5) * 0.2; // orb glow pulses
      // robe body
      ctx.fillStyle = rc; ctx.fillRect(x - 7, y - 8, 14, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x - 7, y - 8, 2, 20);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 5, y - 8, 2, 20);
      // robe bottom flare
      ctx.fillStyle = rc; ctx.fillRect(x - 8, y + 8, 16, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x - 8, y + 10, 16, 2);
      // dark inner robe panel
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 2, y - 8, 4, 20);
      // orb / magic ball (left hand) — pulsing glow
      ctx.fillStyle = '#ff5a7a';
      ctx.beginPath(); ctx.arc(x - 10, y - 2, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(x - 11, y - 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,60,100,${orbGlow})`;
      ctx.beginPath(); ctx.arc(x - 10, y - 2, 7, 0, Math.PI * 2); ctx.fill();
      // hood
      ctx.fillStyle = rc; ctx.fillRect(x - 6, y - 20, 12, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - 4, y - 19, 8, 11);
      // face in shadow
      ctx.fillStyle = '#1a0808'; ctx.fillRect(x - 3, y - 17, 6, 7);
      // glowing eyes
      ctx.fillStyle = '#ff3060'; ctx.fillRect(x - 2, y - 15, 2, 2); ctx.fillRect(x + 1, y - 15, 2, 2);
      ctx.fillStyle = 'rgba(255,50,80,0.4)'; ctx.fillRect(x - 3, y - 16, 4, 4); ctx.fillRect(x, y - 16, 4, 4);
      break;
    }
    case 'golem': {
      const gc3 = e.color;
      const t = game.time;
      const eyePulse = 0.28 + Math.sin(t * 1.6) * 0.15; // eye glow throb
      // stone legs — thick blocks
      ctx.fillStyle = '#50545c'; ctx.fillRect(x - 9, y + 6, 8, 10); ctx.fillRect(x + 1, y + 6, 8, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x - 9, y + 6, 2, 10); ctx.fillRect(x + 1, y + 6, 2, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 1, y + 6, 2, 10);
      // stone body — massive
      ctx.fillStyle = gc3; ctx.fillRect(x - 12, y - 10, 24, 18);
      // stone texture cracks
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x - 8, y - 6, 1, 8); ctx.fillRect(x - 4, y - 2, 1, 6);
      ctx.fillRect(x + 3, y - 8, 1, 5); ctx.fillRect(x + 7, y - 3, 1, 7);
      ctx.fillRect(x - 10, y + 2, 4, 1); ctx.fillRect(x + 2, y - 1, 5, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 12, y - 10, 2, 18); ctx.fillRect(x - 12, y - 10, 24, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 10, y - 10, 2, 18);
      // stone fists (arms extended)
      ctx.fillStyle = '#60646c'; ctx.fillRect(x - 17, y - 6, 7, 7); ctx.fillRect(x + 10, y - 6, 7, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x - 17, y - 6, 1, 7); ctx.fillRect(x + 10, y - 6, 1, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x - 11, y - 6, 1, 7); ctx.fillRect(x + 16, y - 6, 1, 7);
      // stone head (square, brutish)
      ctx.fillStyle = gc3; ctx.fillRect(x - 9, y - 22, 18, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 9, y - 22, 18, 1); ctx.fillRect(x - 9, y - 22, 2, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x + 7, y - 22, 2, 14);
      // crack on head
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 2, y - 21, 1, 6); ctx.fillRect(x + 4, y - 18, 1, 4);
      // glowing eyes (orange, magical, pulsing)
      ctx.fillStyle = '#ff8020'; ctx.fillRect(x - 5, y - 17, 4, 4); ctx.fillRect(x + 1, y - 17, 4, 4);
      ctx.fillStyle = '#ffb060'; ctx.fillRect(x - 4, y - 16, 2, 2); ctx.fillRect(x + 2, y - 16, 2, 2);
      ctx.fillStyle = `rgba(255,120,20,${eyePulse})`; ctx.fillRect(x - 6, y - 18, 6, 6); ctx.fillRect(x, y - 18, 6, 6);
      break;
    }
    default: {
      // fallback humanoid (any future enemy type)
      const bx = x - r + 1, bw = (r - 1) * 2, by = y - r + 3, bh = Math.round(r * 1.4);
      ctx.fillStyle = '#26221c'; ctx.fillRect(x - r + 2, y + r - 4, 3, 4); ctx.fillRect(x + r - 5, y + r - 4, 3, 4);
      ctx.fillStyle = e.color; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(bx, by, 2, bh); ctx.fillRect(bx, by, bw, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bx + bw - 2, by, 2, bh);
      const hx = x - r + 3, hw = (r - 3) * 2, hy = y - r - 2;
      ctx.fillStyle = e.color; ctx.fillRect(hx, hy, hw, 7);
      ctx.fillStyle = '#100808'; ctx.fillRect(x - 4, y - r + 1, 2, 2); ctx.fillRect(x + 2, y - r + 1, 2, 2);
    }
  }
}

function drawProjectiles(ctx) {
  for (const p of game.projectiles) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(p.x - p.radius * 0.25, p.y - p.radius * 0.25, p.radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
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
  const iconW = 14, barX = 8 + iconW + 3, barW = 110, barH = 10;
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';

  // HP bar + red potion icon
  let y = 8;
  _drawVial(ctx, 8 + iconW / 2, y + barH / 2 + 2, '#e03050');
  ctx.fillStyle = '#111';
  ctx.fillRect(barX, y, barW, barH);
  ctx.fillStyle = '#e0463c';
  ctx.fillRect(barX, y, barW * Math.max(0, p.hp / p.stats.maxHp), barH);
  ctx.fillStyle = '#fff';
  ctx.fillText(`${Math.ceil(p.hp)}/${Math.round(p.stats.maxHp)}`, barX + 2, y + 8);

  // MP bar + blue potion icon
  y += barH + 4;
  _drawVial(ctx, 8 + iconW / 2, y + barH / 2 + 2, '#5080ff');
  ctx.fillStyle = '#111';
  ctx.fillRect(barX, y, barW, barH);
  ctx.fillStyle = '#3c7be0';
  ctx.fillRect(barX, y, barW * Math.max(0, p.mana / p.stats.maxMana), barH);
  ctx.fillStyle = '#fff';
  ctx.fillText(`${Math.ceil(p.mana)}/${Math.round(p.stats.maxMana)}`, barX + 2, y + 8);

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
  ctx.textAlign = 'center';
  // Scale font down on narrow canvases so text doesn't overflow
  let fontSize = 22;
  ctx.font = `bold ${fontSize}px monospace`;
  while (ctx.measureText(game.message).width > VIEW_W - 16 && fontSize > 11) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px monospace`;
  }
  const y = Math.round(fontSize * 2.8);
  ctx.fillStyle = '#000';
  ctx.fillText(game.message, VIEW_W / 2 + 2, y + 2);
  ctx.fillStyle = '#ffd060';
  ctx.fillText(game.message, VIEW_W / 2, y);
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

export function drawEnemyCanvases() {
  const defs = [
    { key: 'slime',    color: '#5fbf5f', r: 14 },
    { key: 'bat',      color: '#9a6bd8', r: 11 },
    { key: 'goblin',   color: '#93a53a', r: 12 },
    { key: 'skeleton', color: '#dfe3d0', r: 12 },
    { key: 'orc',      color: '#3f7f45', r: 16 },
    { key: 'cultist',  color: '#c0392b', r: 14 },
    { key: 'wraith',   color: '#4fd0c0', r: 14 },
    { key: 'golem',    color: '#8a8f98', r: 18 },
  ];
  for (const b of defs) {
    const cvs = document.getElementById(`epv-${b.key}`);
    if (!cvs) continue;
    const c2 = cvs.getContext('2d');
    c2.clearRect(0, 0, cvs.width, cvs.height);
    const cx = cvs.width / 2, cy = Math.round(cvs.height * 0.62);
    drawCreature(c2, { key: b.key, color: b.color, isBoss: false }, cx, cy, b.r);
  }
}

export function drawMinionCanvases() {
  const defs = [
    { key: 'troll_grunt',       color: '#5a9a28', r: 18 },
    { key: 'goblin_skirmisher', color: '#7ab030', r: 16 },
    { key: 'skeletal_servant',  color: '#d8d8b8', r: 16 },
    { key: 'spectral_echo',     color: '#80c8e0', r: 17 },
    { key: 'devourer_larva',    color: '#50a030', r: 15 },
    { key: 'golem_shard',       color: '#8a8f98', r: 16 },
  ];
  for (const b of defs) {
    const cvs = document.getElementById(`mpv-${b.key}`);
    if (!cvs) continue;
    const c2 = cvs.getContext('2d');
    c2.clearRect(0, 0, cvs.width, cvs.height);
    const cx = cvs.width / 2, cy = Math.round(cvs.height * 0.58);
    drawCreature(c2, { key: b.key, color: b.color, isBoss: false }, cx, cy, b.r);
  }
}

export function drawTitleScene() {
  const defs = [
    { id: 'ts-left',  key: 'kingslime', color: '#50c840', r: 32, isBoss: true },
    { id: 'ts-right', key: 'bonelord',  color: '#e8e8d0', r: 36, isBoss: true },
  ];
  for (const b of defs) {
    const cvs = document.getElementById(b.id);
    if (!cvs) continue;
    const c2 = cvs.getContext('2d');
    c2.clearRect(0, 0, cvs.width, cvs.height);
    drawCreature(c2, { key: b.key, color: b.color, isBoss: b.isBoss }, cvs.width / 2, Math.round(cvs.height * 0.62), b.r);
  }
}

export function drawBossCanvases() {
  const defs = [
    { key: 'kingslime',     color: '#50c840', r: 28 },
    { key: 'batzilla',      color: '#7a40c0', r: 26 },
    { key: 'goblinking',    color: '#c8b020', r: 30 },
    { key: 'trollwarchief', color: '#6aaf3a', r: 28 },
    { key: 'bonelord',      color: '#e8e8d0', r: 32 },
    { key: 'wraithqueen',   color: '#5fe0d0', r: 32 },
    { key: 'sentinelgolem', color: '#a0a8b8', r: 34 },
    { key: 'devourer',      color: '#a02060', r: 36 },
  ];
  for (const b of defs) {
    const cvs = document.getElementById(`bpv-${b.key}`);
    if (!cvs) continue;
    const c2 = cvs.getContext('2d');
    c2.clearRect(0, 0, cvs.width, cvs.height);
    const cx = cvs.width / 2, cy = Math.round(cvs.height * 0.62);
    drawCreature(c2, { key: b.key, color: b.color, isBoss: true }, cx, cy, b.r);
  }
}
