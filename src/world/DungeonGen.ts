import { Rng } from '../core/Rng';

export const TILE = 4;
export const WALL_H = 16;

export const enum Tile {
  Solid = 0,
  Floor = 1,
  Lava = 2,
  Pillar = 3, // solid block inside a room (rendered as a column)
}

export type RoomType = 'start' | 'combat' | 'treasure' | 'shop' | 'shrine' | 'elite' | 'exit' | 'boss' | 'pitstop' | 'vault';

export type RoomLayout = 'open' | 'pillars' | 'center' | 'lava' | 'ramps' | 'maces' | 'spikes' | 'ring' | 'crossroads';

export interface Door {
  /** tile rect (inclusive-exclusive) of the gate line */
  x0: number; y0: number; x1: number; y1: number;
  /** direction from room to corridor: 0=+x,1=-x,2=+y,3=-y */
  dir: number;
  room: number;
  other: number;
}

export interface Room {
  id: number;
  type: RoomType;
  cx: number;
  cy: number;
  x0: number; y0: number; x1: number; y1: number;
  depth: number;
  neighbors: number[];
  doors: Door[];
  layout: RoomLayout;
  /** world-space centre */
  wx: number;
  wz: number;
}

export interface Corridor {
  x0: number; y0: number; x1: number; y1: number;
  a: number; b: number;
  horizontal: boolean;
}

export interface DungeonData {
  w: number;
  h: number;
  tiles: Uint8Array;
  /** room id per tile (-1 = corridor/void) */
  roomOf: Int16Array;
  rooms: Room[];
  corridors: Corridor[];
  startRoom: number;
  exitRoom: number;
  bossRoom: number;
  eliteRoom: number;
  isBoss: boolean;
  /** Extra hazard / prop markers produced by layouts, in tile coords. */
  markers: { kind: 'ramp' | 'mace' | 'spikes' | 'brazier' | 'statue' | 'pit'; x: number; y: number; dir?: number; room: number }[];
}

const CELL = 26;

export interface GenOptions {
  seed: number;
  roomCount: number;
  isBoss: boolean;
  act: number;
  lavaAllowed: boolean;
  extraTreasure: number;
  extraShops: number;
  eliteRooms: number;
}

export function generateDungeon(opts: GenOptions): DungeonData {
  return opts.isBoss ? genBoss(opts) : genFloor(opts);
}

function newData(w: number, h: number, isBoss: boolean): DungeonData {
  return {
    w, h,
    tiles: new Uint8Array(w * h),
    roomOf: new Int16Array(w * h).fill(-1),
    rooms: [],
    corridors: [],
    startRoom: 0,
    exitRoom: -1,
    bossRoom: -1,
    eliteRoom: -1,
    isBoss,
    markers: [],
  };
}

function genFloor(opts: GenOptions): DungeonData {
  const rng = new Rng(opts.seed);
  const G = 7;
  const cells = new Int16Array(G * G).fill(-1);
  type Cell = { cx: number; cy: number };
  const list: Cell[] = [];
  const add = (cx: number, cy: number) => {
    cells[cy * G + cx] = list.length;
    list.push({ cx, cy });
  };
  const start = { cx: 3, cy: 3 };
  add(start.cx, start.cy);
  const edges: [number, number][] = [];
  const nbCount = (cx: number, cy: number) => {
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < G && y < G && cells[y * G + x] >= 0) n++;
    }
    return n;
  };
  let guard = 0;
  while (list.length < opts.roomCount && guard++ < 5000) {
    const from = list[rng.int(0, list.length - 1)];
    const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]] as const);
    const nx = from.cx + dx, ny = from.cy + dy;
    if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
    if (cells[ny * G + nx] >= 0) continue;
    // keep the map branchy: avoid creating big blobs
    if (nbCount(nx, ny) > 1 && rng.chance(0.85)) continue;
    const fromIdx = cells[from.cy * G + from.cx];
    add(nx, ny);
    edges.push([fromIdx, list.length - 1]);
  }
  // a few loops
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const j = cells[(c.cy + dy) * G + (c.cx + dx)];
      if (c.cx + dx >= G || c.cy + dy >= G || j === undefined || j < 0) continue;
      if (edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue;
      if (rng.chance(0.22)) edges.push([i, j]);
    }
  }

  // compact bounding box of used cells
  let minCx = G, minCy = G, maxCx = 0, maxCy = 0;
  for (const c of list) {
    minCx = Math.min(minCx, c.cx); minCy = Math.min(minCy, c.cy);
    maxCx = Math.max(maxCx, c.cx); maxCy = Math.max(maxCy, c.cy);
  }
  const W = (maxCx - minCx + 1) * CELL + 4;
  const H = (maxCy - minCy + 1) * CELL + 4;
  const d = newData(W, H, false);

  // BFS depth
  const adj: number[][] = list.map(() => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const depth = new Array(list.length).fill(-1);
  depth[0] = 0;
  const q = [0];
  while (q.length) {
    const c = q.shift()!;
    for (const n of adj[c]) if (depth[n] < 0) {
      depth[n] = depth[c] + 1;
      q.push(n);
    }
  }

  // room types
  const types: RoomType[] = new Array(list.length).fill('combat');
  types[0] = 'start';
  const deadEnds = list.map((_, i) => i).filter((i) => i !== 0 && adj[i].length === 1).sort((a, b) => depth[b] - depth[a]);
  const others = list.map((_, i) => i).filter((i) => i !== 0).sort((a, b) => depth[b] - depth[a]);
  const takeFrom = (arr: number[], pred: (i: number) => boolean = () => true) => {
    const idx = arr.findIndex((i) => types[i] === 'combat' && pred(i));
    if (idx < 0) return -1;
    return arr.splice(idx, 1)[0];
  };
  let exit = takeFrom(deadEnds);
  if (exit < 0) exit = takeFrom(others);
  types[exit] = 'exit';
  let elite = takeFrom(deadEnds, (i) => depth[i] >= 2);
  if (elite < 0) elite = takeFrom(others, (i) => depth[i] >= 2);
  if (elite < 0) elite = takeFrom(others);
  if (elite >= 0) types[elite] = 'elite';
  for (let k = 1; k < opts.eliteRooms; k++) {
    const e2 = takeFrom(others, (i) => depth[i] >= 2);
    if (e2 >= 0) types[e2] = 'elite';
  }
  const tCount = 1 + opts.extraTreasure;
  for (let k = 0; k < tCount; k++) {
    let t = takeFrom(deadEnds);
    if (t < 0) t = takeFrom(others, (i) => depth[i] >= 1);
    if (t >= 0) types[t] = 'treasure';
  }
  const sCount = 1 + opts.extraShops;
  for (let k = 0; k < sCount; k++) {
    const s = takeFrom(rng.shuffle([...others]), (i) => depth[i] >= 1 && depth[i] <= 4);
    if (s >= 0) types[s] = 'shop';
  }
  if (rng.chance(0.75)) {
    const sh = takeFrom(rng.shuffle([...others]));
    if (sh >= 0) types[sh] = 'shrine';
  }
  if (list.length >= 9 && rng.chance(0.4)) {
    const v = takeFrom(deadEnds);
    if (v >= 0) types[v] = 'vault';
  }

  // room rectangles
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const t = types[i];
    let rw: number, rh: number;
    switch (t) {
      case 'start': rw = rng.int(12, 14); rh = rng.int(12, 14); break;
      case 'treasure': case 'shrine': case 'vault': rw = rng.int(11, 13); rh = rng.int(11, 13); break;
      case 'shop': rw = rng.int(13, 15); rh = rng.int(12, 14); break;
      case 'exit': rw = rng.int(15, 17); rh = rng.int(15, 17); break;
      case 'elite': rw = rng.int(18, 21); rh = rng.int(18, 21); break;
      default: rw = rng.int(15, 21); rh = rng.int(15, 21);
    }
    const baseX = (c.cx - minCx) * CELL + 2, baseY = (c.cy - minCy) * CELL + 2;
    const jx = rng.int(-1, 1), jy = rng.int(-1, 1);
    const x0 = baseX + Math.floor((CELL - rw) / 2) + jx;
    const y0 = baseY + Math.floor((CELL - rh) / 2) + jy;
    const room: Room = {
      id: i, type: t, cx: c.cx, cy: c.cy,
      x0, y0, x1: x0 + rw, y1: y0 + rh,
      depth: depth[i], neighbors: adj[i].slice(), doors: [], layout: 'open',
      wx: ((x0 + x0 + rw) / 2) * TILE, wz: ((y0 + y0 + rh) / 2) * TILE,
    };
    d.rooms.push(room);
    carve(d, x0, y0, x0 + rw, y0 + rh, Tile.Floor, i);
  }

  // corridors
  const CW = 4;
  for (const [a, b] of edges) {
    const A = d.rooms[a], B = d.rooms[b];
    const horizontal = A.cy === B.cy;
    if (horizontal) {
      const [L, R] = A.cx < B.cx ? [A, B] : [B, A];
      const lo = Math.max(L.y0, R.y0) + 1, hi = Math.min(L.y1, R.y1) - 1;
      const mid = Math.floor((lo + hi) / 2);
      const y0 = Math.max(lo, Math.min(mid - CW / 2, hi - CW));
      const cor: Corridor = { x0: L.x1, y0, x1: R.x0, y1: y0 + CW, a: L.id, b: R.id, horizontal: true };
      d.corridors.push(cor);
      carve(d, cor.x0, cor.y0, cor.x1, cor.y1, Tile.Floor, -1);
      L.doors.push({ x0: L.x1, y0, x1: L.x1 + 1, y1: y0 + CW, dir: 0, room: L.id, other: R.id });
      R.doors.push({ x0: R.x0 - 1, y0, x1: R.x0, y1: y0 + CW, dir: 1, room: R.id, other: L.id });
    } else {
      const [T, Bm] = A.cy < B.cy ? [A, B] : [B, A];
      const lo = Math.max(T.x0, Bm.x0) + 1, hi = Math.min(T.x1, Bm.x1) - 1;
      const mid = Math.floor((lo + hi) / 2);
      const x0 = Math.max(lo, Math.min(mid - CW / 2, hi - CW));
      const cor: Corridor = { x0, y0: T.y1, x1: x0 + CW, y1: Bm.y0, a: T.id, b: Bm.id, horizontal: false };
      d.corridors.push(cor);
      carve(d, cor.x0, cor.y0, cor.x1, cor.y1, Tile.Floor, -1);
      T.doors.push({ x0, y0: T.y1, x1: x0 + CW, y1: T.y1 + 1, dir: 2, room: T.id, other: Bm.id });
      Bm.doors.push({ x0, y0: Bm.y0 - 1, x1: x0 + CW, y1: Bm.y0, dir: 3, room: Bm.id, other: T.id });
    }
  }

  d.startRoom = 0;
  d.exitRoom = exit;
  d.eliteRoom = elite;

  // layouts
  for (const r of d.rooms) {
    if (r.type === 'combat' || r.type === 'elite') {
      const choices: [RoomLayout, number][] = [
        ['open', 1], ['pillars', 3], ['center', 2], ['ramps', 2], ['maces', 1.5], ['spikes', 1.5], ['ring', 1.5], ['crossroads', 1.2],
      ];
      if (opts.lavaAllowed) choices.push(['lava', 3]);
      r.layout = rng.weighted(choices);
      applyLayout(d, r, rng);
    } else if (r.type === 'start' || r.type === 'exit') {
      r.layout = 'open';
      d.markers.push({ kind: 'brazier', x: r.x0 + 2, y: r.y0 + 2, room: r.id });
      d.markers.push({ kind: 'brazier', x: r.x1 - 3, y: r.y0 + 2, room: r.id });
      d.markers.push({ kind: 'brazier', x: r.x0 + 2, y: r.y1 - 3, room: r.id });
      d.markers.push({ kind: 'brazier', x: r.x1 - 3, y: r.y1 - 3, room: r.id });
    }
  }
  return d;
}

function carve(d: DungeonData, x0: number, y0: number, x1: number, y1: number, t: Tile, room: number) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (x < 0 || y < 0 || x >= d.w || y >= d.h) continue;
      d.tiles[y * d.w + x] = t;
      if (room >= 0) d.roomOf[y * d.w + x] = room;
    }
  }
}

function block(d: DungeonData, x: number, y: number, w: number, h: number, t: Tile = Tile.Pillar) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) d.tiles[yy * d.w + xx] = t;
}

function applyLayout(d: DungeonData, r: Room, rng: Rng) {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const cx = r.x0 + Math.floor(w / 2), cy = r.y0 + Math.floor(h / 2);
  switch (r.layout) {
    case 'pillars': {
      const ox = Math.floor(w * 0.27), oy = Math.floor(h * 0.27);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = cx + sx * ox - (sx < 0 ? 1 : 0), py = cy + sy * oy - (sy < 0 ? 1 : 0);
        block(d, px - 1, py - 1, 2, 2);
      }
      if (rng.chance(0.5)) d.markers.push({ kind: 'brazier', x: cx, y: cy, room: r.id });
      break;
    }
    case 'center': {
      d.markers.push({ kind: 'statue', x: cx, y: cy, room: r.id });
      const ox = Math.floor(w * 0.3), oy = Math.floor(h * 0.3);
      d.markers.push({ kind: 'brazier', x: cx - ox, y: cy - oy, room: r.id });
      d.markers.push({ kind: 'brazier', x: cx + ox, y: cy + oy, room: r.id });
      break;
    }
    case 'lava': {
      const n = rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const lw = rng.int(3, 5), lh = rng.int(3, 5);
        const lx = n === 1 ? cx - Math.floor(lw / 2) : i === 0 ? r.x0 + 3 + rng.int(0, 2) : r.x1 - 3 - lw - rng.int(0, 2);
        const ly = n === 1 ? cy - Math.floor(lh / 2) : i === 0 ? r.y0 + 3 + rng.int(0, 2) : r.y1 - 3 - lh - rng.int(0, 2);
        for (let y = ly; y < ly + lh; y++) for (let x = lx; x < lx + lw; x++) {
          // rounded corners
          if ((x === lx || x === lx + lw - 1) && (y === ly || y === ly + lh - 1)) continue;
          d.tiles[y * d.w + x] = Tile.Lava;
        }
      }
      break;
    }
    case 'ramps': {
      const horizontal = w >= h;
      d.markers.push({ kind: 'ramp', x: cx, y: cy, dir: horizontal ? 0 : 2, room: r.id });
      if (w > 17 && h > 17) {
        d.markers.push({ kind: 'ramp', x: cx, y: cy, dir: horizontal ? 1 : 3, room: r.id });
      }
      break;
    }
    case 'maces': {
      d.markers.push({ kind: 'mace', x: cx - Math.floor(w / 5), y: cy, room: r.id });
      d.markers.push({ kind: 'mace', x: cx + Math.floor(w / 5), y: cy, room: r.id });
      break;
    }
    case 'spikes': {
      const horiz = rng.chance(0.5);
      for (let k = -1; k <= 1; k += 2) {
        if (horiz) for (let x = r.x0 + 3; x < r.x1 - 3; x += 2) d.markers.push({ kind: 'spikes', x, y: cy + k * 3, room: r.id });
        else for (let y = r.y0 + 3; y < r.y1 - 3; y += 2) d.markers.push({ kind: 'spikes', x: cx + k * 3, y, room: r.id });
      }
      break;
    }
    case 'ring': {
      // ring of pillars
      const rad = Math.min(w, h) * 0.3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const px = Math.round(cx + Math.cos(a) * rad), py = Math.round(cy + Math.sin(a) * rad);
        block(d, px, py, 1, 1);
      }
      d.markers.push({ kind: 'brazier', x: cx, y: cy, room: r.id });
      break;
    }
    case 'crossroads': {
      const ox = Math.floor(w * 0.3), oy = Math.floor(h * 0.3);
      block(d, cx - ox - 1, cy - oy - 1, 3, 1);
      block(d, cx + ox - 1, cy + oy, 3, 1);
      block(d, cx - ox - 1, cy + oy, 1, 1);
      block(d, cx + ox + 1, cy - oy - 1, 1, 1);
      d.markers.push({ kind: 'statue', x: cx, y: cy, room: r.id });
      break;
    }
    default:
      break;
  }
}

function genBoss(opts: GenOptions): DungeonData {
  const rng = new Rng(opts.seed);
  const W = 108, H = 60;
  const d = newData(W, H, true);
  const mk = (id: number, type: RoomType, x0: number, y0: number, w: number, h: number): Room => {
    const r: Room = {
      id, type, cx: id, cy: 0, x0, y0, x1: x0 + w, y1: y0 + h, depth: id, neighbors: [], doors: [], layout: 'open',
      wx: ((x0 + x0 + w) / 2) * TILE, wz: ((y0 + y0 + h) / 2) * TILE,
    };
    d.rooms.push(r);
    carve(d, r.x0, r.y0, r.x1, r.y1, Tile.Floor, id);
    return r;
  };
  const midY = 30;
  const start = mk(0, 'start', 3, midY - 6, 12, 12);
  const pit = mk(1, 'pitstop', 26, midY - 7, 14, 14);
  const arenaSize = 44;
  const arena = mk(2, 'boss', 56, midY - arenaSize / 2, arenaSize, arenaSize);
  const link = (A: Room, B: Room) => {
    const y0 = midY - 2;
    const cor: Corridor = { x0: A.x1, y0, x1: B.x0, y1: y0 + 4, a: A.id, b: B.id, horizontal: true };
    d.corridors.push(cor);
    carve(d, cor.x0, cor.y0, cor.x1, cor.y1, Tile.Floor, -1);
    A.doors.push({ x0: A.x1, y0, x1: A.x1 + 1, y1: y0 + 4, dir: 0, room: A.id, other: B.id });
    B.doors.push({ x0: B.x0 - 1, y0, x1: B.x0, y1: y0 + 4, dir: 1, room: B.id, other: A.id });
    A.neighbors.push(B.id);
    B.neighbors.push(A.id);
  };
  link(start, pit);
  link(pit, arena);
  // arena decoration: pillars around the edge, lava moat corners in act 3
  const ax = arena.x0, ay = arena.y0;
  for (const [px, py] of [[5, 5], [arenaSize - 7, 5], [5, arenaSize - 7], [arenaSize - 7, arenaSize - 7]]) block(d, ax + px, ay + py, 2, 2);
  if (opts.lavaAllowed) {
    for (const [lx, ly] of [[1, 1], [arenaSize - 4, 1], [1, arenaSize - 4], [arenaSize - 4, arenaSize - 4]]) {
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) d.tiles[(ay + ly + y) * W + ax + lx + x] = Tile.Lava;
    }
  }
  // ring of braziers lights the arena
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.31;
    const rr = arenaSize * 0.36;
    d.markers.push({ kind: 'brazier', x: Math.round(ax + arenaSize / 2 + Math.cos(a) * rr), y: Math.round(ay + arenaSize / 2 + Math.sin(a) * rr), room: arena.id });
  }
  d.markers.push({ kind: 'brazier', x: start.x0 + 2, y: start.y0 + 2, room: 0 });
  d.markers.push({ kind: 'brazier', x: start.x1 - 3, y: start.y1 - 3, room: 0 });
  void rng;
  d.startRoom = 0;
  d.bossRoom = 2;
  d.exitRoom = 2;
  return d;
}

export function tileAt(d: DungeonData, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return Tile.Solid;
  return d.tiles[ty * d.w + tx];
}
