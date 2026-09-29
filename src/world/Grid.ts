import { TILE, Tile, type DungeonData } from './DungeonGen';

export interface Obstacle {
  x: number;
  z: number;
  r: number;
  h: number;
  id?: number;
}

export interface CollideResult {
  x: number;
  z: number;
  nx: number;
  nz: number;
  hit: boolean;
  depth: number;
}

/** Collision, line-of-sight and flow-field navigation on the tile grid. */
export class Grid {
  w: number;
  h: number;
  solid: Uint8Array;
  gate: Uint8Array;
  obstacles: Obstacle[] = [];
  flow: Int32Array;
  private queue: Int32Array;
  flowTarget = -1;
  private res: CollideResult = { x: 0, z: 0, nx: 0, nz: 0, hit: false, depth: 0 };

  constructor(public d: DungeonData) {
    this.w = d.w;
    this.h = d.h;
    this.solid = new Uint8Array(d.w * d.h);
    this.gate = new Uint8Array(d.w * d.h);
    for (let i = 0; i < d.tiles.length; i++) {
      const t = d.tiles[i];
      this.solid[i] = t === Tile.Solid || t === Tile.Pillar ? 1 : 0;
    }
    this.flow = new Int32Array(d.w * d.h).fill(-1);
    this.queue = new Int32Array(d.w * d.h);
  }

  setGate(x0: number, y0: number, x1: number, y1: number, closed: boolean) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      this.gate[y * this.w + x] = closed ? 1 : 0;
    }
    this.flowTarget = -1;
  }

  blocked(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    const i = ty * this.w + tx;
    return this.solid[i] === 1 || this.gate[i] === 1;
  }

  isSolidAt(x: number, z: number) {
    return this.blocked(Math.floor(x / TILE), Math.floor(z / TILE));
  }

  tileAt(x: number, z: number) {
    const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return Tile.Solid;
    return this.d.tiles[ty * this.w + tx];
  }

  isLava(x: number, z: number) {
    return this.tileAt(x, z) === Tile.Lava;
  }

  roomAt(x: number, z: number) {
    const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return -1;
    return this.d.roomOf[ty * this.w + tx];
  }

  /** Push a circle out of walls, gates and static obstacles. */
  collideCircle(x: number, z: number, r: number, withObstacles = true, heightAbove = 0): CollideResult {
    const res = this.res;
    res.hit = false;
    res.nx = 0;
    res.nz = 0;
    res.depth = 0;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE);
      const ty0 = Math.floor((z - r) / TILE), ty1 = Math.floor((z + r) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!this.blocked(tx, ty)) continue;
          const bx0 = tx * TILE, bz0 = ty * TILE;
          const cx = Math.max(bx0, Math.min(x, bx0 + TILE));
          const cz = Math.max(bz0, Math.min(z, bz0 + TILE));
          let dx = x - cx, dz = z - cz;
          let d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-5) {
            // centre inside the block: push along the smallest axis
            const left = x - bx0, right = bx0 + TILE - x, top = z - bz0, bot = bz0 + TILE - z;
            const m = Math.min(left, right, top, bot);
            if (m === left) { dx = -1; dz = 0; d = 0; x = bx0 - r; }
            else if (m === right) { dx = 1; dz = 0; x = bx0 + TILE + r; }
            else if (m === top) { dx = 0; dz = -1; z = bz0 - r; }
            else { dx = 0; dz = 1; z = bz0 + TILE + r; }
            res.nx += dx; res.nz += dz; res.depth = Math.max(res.depth, r);
            res.hit = true;
            moved = true;
            continue;
          }
          const nx = dx / d, nz = dz / d;
          const pen = r - d;
          x += nx * pen;
          z += nz * pen;
          res.nx += nx;
          res.nz += nz;
          res.depth = Math.max(res.depth, pen);
          res.hit = true;
          moved = true;
        }
      }
      if (withObstacles) {
        for (const o of this.obstacles) {
          if (heightAbove > o.h) continue;
          const dx = x - o.x, dz = z - o.z;
          const rr = r + o.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, nz = dz / d;
          const pen = rr - d;
          x += nx * pen;
          z += nz * pen;
          res.nx += nx;
          res.nz += nz;
          res.depth = Math.max(res.depth, pen);
          res.hit = true;
          moved = true;
        }
      }
      if (!moved) break;
    }
    const l = Math.hypot(res.nx, res.nz);
    if (l > 0) {
      res.nx /= l;
      res.nz /= l;
    }
    res.x = x;
    res.z = z;
    return res;
  }

  /** DDA raycast on the tile grid. Returns distance to first blocked tile (or maxDist). */
  raycast(x0: number, z0: number, dx: number, dz: number, maxDist: number, ignoreGates = false): number {
    const l = Math.hypot(dx, dz);
    if (l < 1e-8) return maxDist;
    dx /= l;
    dz /= l;
    let tx = Math.floor(x0 / TILE), tz = Math.floor(z0 / TILE);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : 1e9;
    const tDeltaZ = dz !== 0 ? Math.abs(TILE / dz) : 1e9;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.abs(dx)) : 1e9;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? (tz + 1) * TILE - z0 : z0 - tz * TILE) / Math.abs(dz)) : 1e9;
    let t = 0;
    for (let i = 0; i < 400; i++) {
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        tMaxX += tDeltaX;
        tx += stepX;
      } else {
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        tz += stepZ;
      }
      if (t > maxDist) return maxDist;
      const blocked = ignoreGates
        ? tx < 0 || tz < 0 || tx >= this.w || tz >= this.h || this.solid[tz * this.w + tx] === 1
        : this.blocked(tx, tz);
      if (blocked) return t;
    }
    return maxDist;
  }

  los(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az);
    return this.raycast(ax, az, bx - ax, bz - az, d) >= d - 0.01;
  }

  /** BFS distance field toward (x,z). Lava is avoided. */
  computeFlow(x: number, z: number) {
    const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    const target = ty * this.w + tx;
    if (target === this.flowTarget) return;
    this.flowTarget = target;
    const f = this.flow;
    f.fill(-1);
    const q = this.queue;
    let head = 0, tail = 0;
    f[target] = 0;
    q[tail++] = target;
    const w = this.w;
    const tiles = this.d.tiles;
    while (head < tail) {
      const c = q[head++];
      const cx = c % w, cy = (c / w) | 0;
      const nd = f[c] + 1;
      if (cx + 1 < w) this.visit(c + 1, nd, q, tail) && tail++;
      if (cx - 1 >= 0) this.visit(c - 1, nd, q, tail) && tail++;
      if (cy + 1 < this.h) this.visit(c + w, nd, q, tail) && tail++;
      if (cy - 1 >= 0) this.visit(c - w, nd, q, tail) && tail++;
    }
    void tiles;
  }

  private visit(i: number, nd: number, q: Int32Array, tail: number) {
    if (this.flow[i] !== -1) return false;
    if (this.solid[i] || this.gate[i]) return false;
    if (this.d.tiles[i] === Tile.Lava) return false;
    this.flow[i] = nd;
    q[tail] = i;
    return true;
  }

  /** Direction (unit) to walk from (x,z) toward the flow target, or null. */
  flowDir(x: number, z: number, out: { x: number; z: number }): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    const w = this.w;
    const cur = this.flow[ty * w + tx];
    if (cur < 0) return false;
    let best = cur, bx = 0, bz = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= this.h) continue;
        const v = this.flow[ny * w + nx];
        if (v < 0) continue;
        if (dx && dy) {
          // no corner cutting
          if (this.flow[ty * w + nx] < 0 || this.flow[ny * w + tx] < 0) continue;
        }
        const score = v + (dx && dy ? 0.4 : 0);
        if (score < best) {
          best = score;
          bx = dx;
          bz = dy;
        }
      }
    }
    if (bx === 0 && bz === 0) return false;
    // aim for the neighbour tile centre (smooths motion)
    const cxw = (tx + bx + 0.5) * TILE, czw = (ty + bz + 0.5) * TILE;
    const ddx = cxw - x, ddz = czw - z;
    const l = Math.hypot(ddx, ddz) || 1;
    out.x = ddx / l;
    out.z = ddz / l;
    return true;
  }

  flowDist(x: number, z: number) {
    const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return -1;
    return this.flow[ty * this.w + tx];
  }
}
