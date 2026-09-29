import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE, WALL_H, Tile, type DungeonData, type Room } from './DungeonGen';
import type { Biome } from './Biomes';
import type { Grid } from './Grid';
import type { Batcher } from './Batcher';
import type { Rng } from '../core/Rng';
import type { Level } from './LevelBuilder';
import { glow, metalToon, stoneToon, FX_LAYER } from '../render/Toon';
import { art } from '../render/Art';
import { bevBox, cone, tubeBetween } from '../entities/CarKit';
import type { FlameSpec } from '../fx/Flames';

type Face = { tx: number; ty: number; dir: number };
type FacePos = { x: number; z: number; ry: number };

export interface DressCtx {
  level: Level;
  d: DungeonData;
  biome: Biome;
  batch: Batcher;
  grid: Grid;
  rng: Rng;
  wallFaces: Face[];
  facePos: (f: Face, off: number) => FacePos;
  isDoorTile: (tx: number, ty: number) => boolean;
  addBake: (x: number, y: number, z: number, c: THREE.Color, intensity: number, range: number) => void;
  torchCol: THREE.Color;
  torchFaces: Set<Face>;
}

const H = WALL_H;
const T = TILE;

/** A hero knight statue, ~12 units tall, built from primitives and merged per material. */
function knightStatue(stone: THREE.Material, dark: THREE.Material, eye: THREE.Material) {
  const parts: { g: THREE.BufferGeometry; m: THREE.Material }[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    g.rotateX(rx);
    g.rotateY(ry);
    g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push({ g, m });
  };
  // plinth
  add(bevBox(4.6, 1.0, 4.6, 0.12), dark, 0, 0.5, 0);
  add(bevBox(3.8, 1.2, 3.8, 0.1), stone, 0, 1.6, 0);
  // legs + greaves
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.55, 0.7, 2.6, 8), stone, s * 0.8, 3.5, 0);
    add(bevBox(1.2, 0.5, 1.7, 0.1), stone, s * 0.8, 2.4, 0.3);
  }
  // tasset / skirt
  add(new THREE.CylinderGeometry(1.7, 1.2, 1.2, 10), stone, 0, 5.2, 0);
  // torso: breastplate
  add(new THREE.CylinderGeometry(1.7, 1.35, 2.7, 10), stone, 0, 6.9, 0);
  add(new THREE.CylinderGeometry(1.95, 1.7, 0.7, 10), dark, 0, 8.05, 0);
  add(bevBox(0.35, 1.9, 0.16, 0.05), dark, 0, 6.9, 1.35);
  // pauldrons
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(1.0, 10, 8), stone, s * 2.1, 8.0, 0);
    add(new THREE.CylinderGeometry(0.42, 0.36, 2.4, 8), stone, s * 2.4, 6.6, 0.2);
    for (let i = 0; i < 3; i++) add(cone(0.16, 0.6, 5), dark, s * 2.3, 8.6 + i * 0.0, (i - 1) * 0.4, 0, 0, -s * 0.3);
  }
  // helmet
  add(new THREE.SphereGeometry(0.95, 12, 10), stone, 0, 9.3, 0);
  add(new THREE.CylinderGeometry(0.85, 0.95, 0.9, 10), stone, 0, 8.7, 0);
  add(bevBox(0.22, 1.0, 1.4, 0.05), dark, 0, 10.1, -0.1);
  add(new THREE.BoxGeometry(1.35, 0.16, 0.2), eye, 0, 9.3, 0.9);
  // greatsword held point-down in front
  add(bevBox(0.42, 6.6, 0.16, 0.04), stone, 0, 4.6, 1.7);
  add(bevBox(2.3, 0.35, 0.4, 0.06), dark, 0, 7.9, 1.7);
  add(new THREE.CylinderGeometry(0.16, 0.16, 1.3, 6), dark, 0, 8.7, 1.7);
  // forearms gripping the hilt
  for (const s of [-1, 1]) add(tubeBetween(new THREE.Vector3(s * 2.3, 6.4, 0.3), new THREE.Vector3(s * 0.4, 7.9, 1.6), 0.36, 6), stone);
  // cape slab behind
  add(bevBox(3.2, 5.4, 0.3, 0.08), dark, 0, 6.6, -1.5, 0.12);
  // group by material
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const { g, m } of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    if (!ng.getAttribute('uv')) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.getAttribute('position').count * 2), 2));
    (byMat.get(m) ?? byMat.set(m, []).get(m)!).push(ng);
  }
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  for (const [mat, gs] of byMat) out.push({ geo: mergeGeometries(gs)!, mat });
  return out;
}

function spikedBall(mat: THREE.Material, r = 1.3) {
  const gs: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(r, 1)];
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const pos = ico.getAttribute('position');
  const seen = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    const k = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const c = cone(r * 0.26, r * 0.95, 6);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v));
    c.translate(v.x * r * 0.85, v.y * r * 0.85, v.z * r * 0.85);
    gs.push(c);
  }
  const ring = new THREE.TorusGeometry(r * 0.3, r * 0.1, 6, 10);
  ring.translate(0, r + 0.15, 0);
  gs.push(ring);
  const nn = gs.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    return ng;
  });
  return new THREE.Mesh(mergeGeometries(nn)!, mat);
}

function chain(len: number, mat: THREE.Material) {
  const gs: THREE.BufferGeometry[] = [];
  const n = Math.floor(len / 0.7);
  for (let i = 0; i < n; i++) {
    const g = new THREE.TorusGeometry(0.22, 0.07, 5, 8);
    if (i % 2) g.rotateY(Math.PI / 2);
    g.translate(0, -i * 0.62, 0);
    gs.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(gs.map((g) => g.toNonIndexed()))!, mat);
  return m;
}

export function dressLevel(c: DressCtx) {
  const { level, d, biome, batch, grid, rng, wallFaces, facePos, isDoorTile, addBake, torchCol } = c;
  const wallTex = art('tex_wall');
  const tintWall = { crypt: 0x6f7fb4, vaults: 0x9a7ad0, ashen: 0xb87c68 }[biome.id] ?? 0x8090b0;
  const stone = stoneToon(wallTex, new THREE.Color(tintWall).multiplyScalar(1.05));
  const stoneL = stoneToon(wallTex, new THREE.Color(tintWall).multiplyScalar(1.45));
  const stoneD = stoneToon(wallTex, new THREE.Color(tintWall).multiplyScalar(0.62));
  const iron = metalToon(0x23252d);
  const runeGlow = glow(biome.runeColor, 3.1);
  const walk = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return false;
    const t = d.tiles[ty * d.w + tx];
    return t === Tile.Floor || t === Tile.Lava;
  };

  // ---------------------------------------------------------------- pilasters + capitals along walls
  const pilGeo = bevBox(2.4, H - 2.6, 1.3, 0.12);
  pilGeo.translate(0, (H - 2.6) / 2 + 1.3, 0.65);
  const capGeo = bevBox(3.4, 1.3, 2.0, 0.14);
  capGeo.translate(0, H - 1.5, 1.0);
  const baseGeo = bevBox(3.2, 1.6, 1.9, 0.14);
  baseGeo.translate(0, 0.8, 0.95);
  const ribCap = bevBox(2.0, 0.9, 3.4, 0.1);
  let pilCount = 0;
  for (const f of wallFaces) {
    if (pilCount > 260) break;
    if (isDoorTile(f.tx, f.ty) || c.torchFaces.has(f)) continue;
    const nx = f.tx + (f.dir === 0 ? 1 : f.dir === 1 ? -1 : 0), ny = f.ty + (f.dir === 2 ? 1 : f.dir === 3 ? -1 : 0);
    if (nx >= 0 && ny >= 0 && nx < d.w && ny < d.h && d.tiles[ny * d.w + nx] === Tile.Pillar) continue;
    const along = f.dir <= 1 ? f.ty : f.tx;
    if (along % 6 !== 0) continue;
    const p = facePos(f, 0);
    const rot = new THREE.Euler(0, p.ry, 0);
    const q = new THREE.Quaternion().setFromEuler(rot);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1));
    batch.add(pilGeo, stoneL, m, false);
    batch.add(capGeo, stone, m, false);
    batch.add(baseGeo, stone, m, false);
    const rp = facePos(f, 1.0);
    grid.obstacles.push({ x: rp.x, z: rp.z, r: 1.1, h: H });
    pilCount++;
  }

  // ---------------------------------------------------------------- statues flanking rooms
  const statueParts = knightStatue(stoneL, stoneD, runeGlow);
  let statueCount = 0;
  for (const r of d.rooms) {
    if (r.type === 'boss' || r.type === 'shop') continue;
    const faces = wallFaces.filter((f) => d.roomOf[f.ty * d.w + f.tx] === r.id && !isDoorTile(f.tx, f.ty) && !c.torchFaces.has(f) && (f.dir <= 1 ? f.ty : f.tx) % 6 === 3);
    const want = Math.min(faces.length, r.type === 'elite' || r.type === 'treasure' ? 3 : 2);
    for (let i = 0; i < want && statueCount < 46; i++) {
      const f = faces.splice(rng.int(0, faces.length - 1), 1)[0];
      const p = facePos(f, 2.6);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry + Math.PI, 0));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1.05, 1.05, 1.05));
      for (const part of statueParts) batch.add(part.geo, part.mat, m, true);
      grid.obstacles.push({ x: p.x, z: p.z, r: 2.4, h: 12 });
      addBake(p.x, 9.3, p.z, new THREE.Color(biome.runeColor), 0.45, 9);
      statueCount++;
    }
  }

  // ---------------------------------------------------------------- vaulted ceiling ribs
  const ribGeo = bevBox(1.5, 1.4, 1, 0.1);
  const rib = (cx: number, cz: number, len: number, alongX: boolean) => {
    const g = new THREE.Matrix4().compose(new THREE.Vector3(cx, H - 0.75, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, alongX ? 0 : Math.PI / 2, 0)), new THREE.Vector3(len, 1, 1));
    batch.add(ribGeo, stone, g, false);
  };
  const ribBrace = new THREE.BoxGeometry(0.6, 3.2, 0.6);
  for (const r of d.rooms) {
    const x0 = r.x0 * T, x1 = r.x1 * T, z0 = r.y0 * T, z1 = r.y1 * T;
    const rw = x1 - x0, rh = z1 - z0;
    const nx = Math.max(1, Math.round(rw / 22)), nz = Math.max(1, Math.round(rh / 22));
    for (let i = 0; i <= nx; i++) rib(x0 + (rw * i) / nx, (z0 + z1) / 2, rh, false);
    for (let j = 0; j <= nz; j++) rib((x0 + x1) / 2, z0 + (rh * j) / nz, rw, true);
  }
  for (const cor of d.corridors) {
    const x0 = cor.x0 * T, x1 = cor.x1 * T, z0 = cor.y0 * T, z1 = cor.y1 * T;
    if (cor.horizontal) for (let x = x0 + 8; x < x1 - 4; x += 16) rib(x, (z0 + z1) / 2, z1 - z0, false);
    else for (let z = z0 + 8; z < z1 - 4; z += 16) rib((x0 + x1) / 2, z, x1 - x0, true);
  }
  void ribBrace;
  void ribCap;

  // ---------------------------------------------------------------- hanging chains with spiked balls (swaying)
  const ballMat = metalToon(0x30323c);
  const ball = spikedBall(ballMat, 1.4);
  const chainMat = metalToon(0x1b1c22);
  const chainMesh = chain(6.5, chainMat);
  for (const r of d.rooms) {
    if (r.type === 'shop') continue;
    const rw = r.x1 - r.x0, rh = r.y1 - r.y0;
    if (rw < 11 || rh < 11) continue;
    const n = r.type === 'boss' ? 4 : rw >= 15 && rh >= 15 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const px = (r.x0 + 3 + rng.next() * (rw - 6)) * T, pz = (r.y0 + 3 + rng.next() * (rh - 6)) * T;
      const g = new THREE.Group();
      g.position.set(px, H - 0.2, pz);
      const c1 = chainMesh.clone();
      c1.position.y = 0;
      const b1 = ball.clone();
      b1.position.y = -6.9;
      c1.castShadow = false;
      b1.castShadow = false;
      g.add(c1, b1);
      g.userData.sway = rng.float(0, 10);
      level.group.add(g);
      level.chandeliers.push(g);
    }
  }

  // ---------------------------------------------------------------- large glowing sigils on the floor
  const sigTex = art('pk_sigil');
  const sigTypes: Record<string, number> = { boss: 0xff3040, elite: 0xff40ff, treasure: 0xffc02a, shrine: 0xb080ff, exit: 0x40b0ff, vault: 0xffc02a, start: 0x33d8ff };
  for (const r of d.rooms) {
    const col = sigTypes[r.type];
    if (col === undefined) continue;
    const size = r.type === 'boss' ? 30 : 15;
    const mat = new THREE.MeshBasicMaterial({ map: sigTex, color: new THREE.Color(col).multiplyScalar(r.type === 'start' ? 0.7 : 1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.9 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(r.wx, 0.09, r.wz);
    mesh.layers.set(FX_LAYER);
    mesh.userData.spin = r.type === 'boss' ? 0.12 : 0.25;
    level.group.add(mesh);
    level.sigils.push(mesh);
  }

  // ---------------------------------------------------------------- chandelier flames (no per-frame emitters)
  void torchCol;
}

export function chandelierFlames(chx: number, chz: number, scale: number, color: [number, number, number], out: FlameSpec[], rng: Rng) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.push({ x: chx + Math.cos(a) * 3.2 * scale, y: 13 + 1.1 * scale, z: chz - Math.sin(a) * 3.2 * scale, size: 0.55 * scale, color, phase: rng.float(0, 100) });
  }
}

export type { Room };
