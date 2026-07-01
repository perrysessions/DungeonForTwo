// Procedural dungeon: rectangular rooms + corridors on a tile grid, with collision.
import { TILE } from './state.js';
import { randInt, rand, pick } from './rng.js';

const WALL = 0, FLOOR = 1;

export class Dungeon {
  constructor(floor) {
    this.floor = floor;
    // Grid grows slightly with depth.
    this.w = 34 + Math.min(16, Math.floor(floor * 0.8));
    this.h = 26 + Math.min(12, Math.floor(floor * 0.5));
    this.tiles = new Array(this.w * this.h).fill(WALL);
    this.rooms = [];
    this._generate();
    this.stairs = null;      // { tx, ty } set after clear (revealed) but positioned now
    this._placeStairs();
  }

  idx(tx, ty) { return ty * this.w + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  tileAt(tx, ty) { return this.inBounds(tx, ty) ? this.tiles[this.idx(tx, ty)] : WALL; }
  isSolidTile(tx, ty) { return this.tileAt(tx, ty) === WALL; }

  _carveRoom(r) {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        if (this.inBounds(x, y)) this.tiles[this.idx(x, y)] = FLOOR;
  }
  _carveH(x1, x2, y) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      this.tiles[this.idx(x, y)] = FLOOR;
      this.tiles[this.idx(x, y + 1)] = FLOOR; // 2-wide corridors so co-op fits
    }
  }
  _carveV(y1, y2, x) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      this.tiles[this.idx(x, y)] = FLOOR;
      this.tiles[this.idx(x + 1, y)] = FLOOR;
    }
  }

  _generate() {
    const roomCount = 5 + Math.min(6, Math.floor(this.floor / 3)) + randInt(0, 2);
    let tries = 0;
    while (this.rooms.length < roomCount && tries < 200) {
      tries++;
      const rw = randInt(6, 10), rh = randInt(5, 8);
      const rx = randInt(1, this.w - rw - 2), ry = randInt(1, this.h - rh - 2);
      const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) };
      // reject heavy overlap
      const overlap = this.rooms.some(o =>
        rx < o.x + o.w + 1 && rx + rw + 1 > o.x && ry < o.y + o.h + 1 && ry + rh + 1 > o.y);
      if (overlap) continue;
      this._carveRoom(room);
      if (this.rooms.length > 0) {
        const prev = this.rooms[this.rooms.length - 1];
        if (rand() < 0.5) { this._carveH(prev.cx, room.cx, prev.cy); this._carveV(prev.cy, room.cy, room.cx); }
        else { this._carveV(prev.cy, room.cy, prev.cx); this._carveH(prev.cx, room.cx, room.cy); }
      }
      this.rooms.push(room);
    }
  }

  _placeStairs() {
    const last = this.rooms[this.rooms.length - 1];
    this.stairs = { tx: last.cx, ty: last.cy };
  }

  // World-space spawn helpers.
  roomCenterWorld(room) {
    return { x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE };
  }
  get startRoom() { return this.rooms[0]; }
  get lastRoom() { return this.rooms[this.rooms.length - 1]; }

  randomFloorPointInRoom(room, margin = 1) {
    const tx = randInt(room.x + margin, room.x + room.w - 1 - margin);
    const ty = randInt(room.y + margin, room.y + room.h - 1 - margin);
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }

  worldSolid(wx, wy) {
    return this.isSolidTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
  }

  // True if a straight line from (x1,y1) to (x2,y2) crosses no wall tiles.
  lineClear(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (TILE * 0.4)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.worldSolid(x1 + dx * t, y1 + dy * t)) return false;
    }
    return true;
  }

  // Axis-separated circle-vs-tiles movement. Returns resolved {x, y}.
  moveCircle(x, y, r, dx, dy) {
    let nx = x + dx;
    if (this._circleHitsWall(nx, y, r)) {
      // step back to tile edge
      nx = x;
    }
    let ny = y + dy;
    if (this._circleHitsWall(nx, ny, r)) {
      ny = y;
    }
    return { x: nx, y: ny };
  }

  _circleHitsWall(x, y, r) {
    // sample the 4 corners of the bounding box
    const pts = [
      [x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r],
    ];
    for (const [px, py] of pts) if (this.worldSolid(px, py)) return true;
    return false;
  }

  get pixelWidth() { return this.w * TILE; }
  get pixelHeight() { return this.h * TILE; }
}
