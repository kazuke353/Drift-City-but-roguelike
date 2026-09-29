import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE, WALL_H, Tile, type DungeonData, type Door, type Room } from './DungeonGen';
import type { Biome } from './Biomes';
import { Grid } from './Grid';
import { Batcher } from './Batcher';
import { Rng } from '../core/Rng';
import { bakedToon, glow, toon, FX_LAYER } from '../render/Toon';
import { bannerTexture, graffitiTexture, runeTexture } from '../render/Textures';
import { art } from '../render/Art';
import { dressLevel, chandelierFlames } from './Dressing';
import type { LightPool } from '../render/LightPool';
import type { FX } from '../fx/FX';
import { SHAPE_DOT, SHAPE_CORE } from '../fx/Particles';
import { FlameField } from '../fx/Flames';
import { LightBaker, buildLightMap, type BakeLight, type LightMapData } from './LightBake';
import { setLightMap } from '../render/LightMap';

export interface Gate {
  door: Door;
  mesh: THREE.Mesh;
  open: number; // 0 closed .. 1 open
  target: number;
  kind: 'iron' | 'gold' | 'boss';
  x: number;
  z: number;
}

export interface Flame {
  x: number;
  y: number;
  z: number;
  size: number;
  color: [number, number, number];
  phase: number;
}

interface LevelTex { wall: THREE.Texture; floor: THREE.Texture; pillar: THREE.Texture; wallBump: THREE.Texture; floorBump: THREE.Texture; pillarBump: THREE.Texture }

function biomeTextures(_b: Biome): LevelTex {
  return { wall: art('tex_wall'), floor: art('tex_floor'), pillar: art('tex_wall'), wallBump: art('tex_wall_h'), floorBump: art('tex_floor_h'), pillarBump: art('tex_wall_h') };
}

/** Per-biome tint multiplied over the neutral slate stone textures. */
const TINTS: Record<string, { floor: number; wall: number; pillar: number }> = {
  crypt: { floor: 0x8798cf, wall: 0x8598d6, pillar: 0xb0bcf0 },
  vaults: { floor: 0x9a82c8, wall: 0x9a80d0, pillar: 0xc8b0ec },
  ashen: { floor: 0xc48a78, wall: 0xba7e6e, pillar: 0xe0a892 },
};

const lavaVert = /* glsl */ `
varying vec2 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const lavaFrag = /* glsl */ `
uniform float time;
uniform sampler2D map;
varying vec2 vW;
void main() {
  vec2 uv = vW * 0.085;
  vec3 a = texture2D(map, uv + vec2(time * 0.010, time * 0.006)).rgb;
  vec3 b = texture2D(map, uv * 1.63 + vec2(0.37, 0.11) - vec2(time * 0.008, -time * 0.012)).rgb;
  vec3 c = a * 0.62 + b * 0.5;
  float heat = clamp(max(c.r - c.b, 0.0) * 2.2, 0.0, 1.0);
  vec3 col = c * vec3(1.5, 0.95, 0.6) + vec3(1.6, 0.55, 0.1) * pow(heat, 2.4) * (1.1 + 0.25 * sin(time * 1.9 + vW.x * 0.11 + vW.y * 0.07));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Level {
  group = new THREE.Group();
  gates: Gate[] = [];
  flames: Flame[] = [];
  lavaMat: THREE.ShaderMaterial | null = null;
  flameField: FlameField | null = null;
  sigils: THREE.Mesh[] = [];
  extraFlames: Flame[] = [];
  lightMap: LightMapData | null = null;
  runeMats: THREE.MeshBasicMaterial[] = [];
  chandeliers: THREE.Object3D[] = [];
  bakeLights: BakeLight[] = [];
  time = 0;

  constructor(public d: DungeonData, public biome: Biome, public grid: Grid) {}

  update(dt: number, fx: FX, cam: THREE.Vector3) {
    this.time += dt;
    const t = this.time;
    if (this.lavaMat) this.lavaMat.uniforms.time.value = t;
    this.flameField?.update(t);
    // flames: flickering glow billboards + embers, only near the camera
    for (const f of this.flames) {
      const dx = f.x - cam.x, dz = f.z - cam.z;
      if (dx * dx + dz * dz > 120 * 120) continue;
      const fl = 0.85 + 0.15 * Math.sin(t * 13 + f.phase) * Math.sin(t * 7.1 + f.phase * 2);
      const [r, g, b] = f.color;
      fx.add.draw(f.x, f.y + f.size * 0.35, f.z, 0, 0, 0, f.size * 2.6 * fl, 0, r * 0.9, g * 0.9, b * 0.9, 0.55, SHAPE_DOT);
      fx.add.draw(f.x, f.y + f.size * 0.2, f.z, 0, 0, 0, f.size * 1.1 * fl, 0, r * 2.5, g * 2.2, b * 1.6, 0.9, SHAPE_CORE);
      if (Math.random() < dt * 3 * f.size) {
        fx.add.emit(f.x + (Math.random() - 0.5) * f.size * 0.5, f.y + f.size * 0.5, f.z + (Math.random() - 0.5) * f.size * 0.5, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 0.8, 0.12, 0.02, r * 3, g * 2, b, 1, { drag: 0.5, shape: SHAPE_CORE });
      }
    }
    for (const m of this.runeMats) {
      const k = 0.75 + 0.25 * Math.sin(t * 2 + (m as any).id);
      m.opacity = k;
    }
    for (const c of this.chandeliers) {
      const sw = (c.userData.sway as number | undefined) ?? c.id;
      c.rotation.z = Math.sin(t * 0.7 + sw) * (c.userData.sway !== undefined ? 0.06 : 0.03);
      if (c.userData.sway !== undefined) c.rotation.x = Math.sin(t * 0.55 + sw * 1.7) * 0.05;
    }
    for (const sg of this.sigils) sg.rotation.z += (sg.userData.spin as number) * dt;
    // gates
    for (const g of this.gates) {
      if (Math.abs(g.open - g.target) > 0.001) {
        const sp = g.target > g.open ? 0.9 : 3.2;
        g.open += Math.sign(g.target - g.open) * Math.min(Math.abs(g.target - g.open), sp * dt);
        g.mesh.position.y = g.open * (WALL_H - 1.5);
        if (g.target === 0 && g.open === 0) {
          fx.dust(g.x, g.z, 8, [0.4, 0.38, 0.35], 1.2);
          fx.shake(0.25);
        }
      }
    }
  }

  setGate(g: Gate, open: boolean) {
    g.target = open ? 1 : 0;
    this.grid.setGate(g.door.x0, g.door.y0, g.door.x1, g.door.y1, !open);
  }

  gatesOfRoom(roomId: number) {
    return this.gates.filter((g) => g.door.room === roomId);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (m as any).isInstancedMesh) {
        m.geometry?.dispose();
      }
    });
  }
}

// ---------------------------------------------------------------- prop templates

interface PropKit {
  iron: THREE.Material;
  stone: THREE.Material;
  stoneDark: THREE.Material;
  wood: THREE.Material;
  gold: THREE.Material;
  bone: THREE.Material;
  wax: THREE.Material;
  flame: THREE.Material;
  crystal: THREE.Material;
  torch: THREE.Group;
  brazier: THREE.Group;
  statue: THREE.Group;
  column: THREE.Group;
  chandelierGeo: { iron: THREE.BufferGeometry; wax: THREE.BufferGeometry; flame: THREE.BufferGeometry };
  bannerGeo: THREE.BufferGeometry;
  boneGeo: THREE.BufferGeometry;
  skullGeo: THREE.BufferGeometry;
  coinPileGeo: THREE.BufferGeometry;
  coinGeo: THREE.BufferGeometry;
  crystalGeo: THREE.BufferGeometry;
  candleGeo: THREE.BufferGeometry;
  rubbleGeo: THREE.BufferGeometry;
}

function makeKit(b: Biome): PropKit {
  const iron = toon(0x2b2b33);
  const stone = toon(new THREE.Color(b.wall.light).multiplyScalar(0.95));
  const stoneDark = toon(new THREE.Color(b.wall.base));
  const wood = toon(0x6b4226);
  const gold = toon(0xf2b632, { emissive: 0x5a3a00, emissiveIntensity: 0.4 });
  const bone = toon(0xe6dcc0);
  const wax = toon(0xf0e6c8);
  const tc = new THREE.Color(b.torchColor);
  const flame = glow(tc.clone().lerp(new THREE.Color(0xffe0a0), 0.35), 3.2);
  const crystal = toon(b.runeColor, { emissive: b.runeColor, emissiveIntensity: 1.6 });

  const torch = new THREE.Group();
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 1.3), iron);
  bracket.position.set(0, -0.3, 0.5);
  bracket.rotation.x = -0.5;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.6, 8), iron);
  cup.position.set(0, 0.1, 1.0);
  torch.add(bracket, cup);

  const brazier = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 3.2, 8), stoneDark);
  ped.position.y = 1.6;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.0, 1.1, 10), iron);
  bowl.position.y = 3.6;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.22, 6, 14), iron);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 4.15;
  const coals = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.3, 10), glow(0xff5010, 2.2));
  coals.position.y = 4.05;
  brazier.add(ped, bowl, rim, coals);

  const statue = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2, 4.2), stoneDark);
  base.position.y = 1;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.2, 1.2), stone);
  legs.position.y = 3.6;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.8, 1.6), stone);
  torso.position.y = 6.6;
  const pauld1 = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), stone);
  pauld1.position.set(-1.5, 7.6, 0);
  const pauld2 = pauld1.clone();
  pauld2.position.x = 1.5;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.6, 8), stone);
  head.position.y = 8.9;
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 1.4), stone);
  crest.position.y = 10;
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.5, 0.9), stone);
  sword.position.set(0, 4.8, 1.3);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.5), stone);
  guard.position.set(0, 7.4, 1.3);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 2.2), stone);
  shield.position.set(-1.7, 5.8, 0.3);
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.2), glow(b.runeColor, 3));
  eyes.position.set(0, 9.0, 0.78);
  statue.add(base, legs, torso, pauld1, pauld2, head, crest, sword, guard, shield, eyes);

  const column = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, WALL_H, 10), stone);
  shaft.position.y = WALL_H / 2;
  const cb = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.1, 1.2, 10), stoneDark);
  cb.position.y = 0.6;
  const cc = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.6, 1.2, 10), stoneDark);
  cc.position.y = WALL_H - 1.6;
  column.add(shaft, cb, cc);

  // chandelier: ring + candles + flames
  const ringG = new THREE.TorusGeometry(3.2, 0.2, 6, 20);
  ringG.rotateX(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.4, 0.4, 1, 6);
  const chainG = new THREE.CylinderGeometry(0.08, 0.08, 22, 4);
  chainG.translate(0, 11, 0);
  const spokes: THREE.BufferGeometry[] = [ringG, hub, chainG];
  const waxG: THREE.BufferGeometry[] = [];
  const flameG: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sp = new THREE.BoxGeometry(3.2, 0.12, 0.12);
    sp.translate(1.6, 0, 0);
    sp.rotateY(a);
    spokes.push(sp);
    const cndl = new THREE.CylinderGeometry(0.16, 0.16, 0.8, 6);
    cndl.translate(Math.cos(a) * 3.2, 0.5, -Math.sin(a) * 3.2);
    waxG.push(cndl);
    const f = new THREE.ConeGeometry(0.14, 0.45, 5);
    f.translate(Math.cos(a) * 3.2, 1.15, -Math.sin(a) * 3.2);
    flameG.push(f);
  }
  const chandelierGeo = { iron: mergeGeometries(spokes)!, wax: mergeGeometries(waxG)!, flame: mergeGeometries(flameG)! };

  // banner with a notched tail; UVs normalized
  const bs = new THREE.Shape();
  bs.moveTo(0, 0.12);
  bs.lineTo(0.5, 0);
  bs.lineTo(1, 0.12);
  bs.lineTo(1, 1);
  bs.lineTo(0, 1);
  bs.closePath();
  const bannerGeo = new THREE.ShapeGeometry(bs);
  bannerGeo.translate(-0.5, -1, 0);

  const boneGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 5);
  boneGeo.rotateZ(Math.PI / 2);
  const skullGeo = new THREE.SphereGeometry(0.42, 7, 6);
  const coinPileGeo = new THREE.ConeGeometry(1.6, 1.1, 9);
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10);
  const crystalGeo = new THREE.OctahedronGeometry(1, 0);
  crystalGeo.scale(0.5, 1.6, 0.5);
  const candleGeo = new THREE.CylinderGeometry(0.15, 0.17, 0.8, 6);
  const rubbleGeo = new THREE.DodecahedronGeometry(0.6, 0);

  return {
    iron, stone, stoneDark, wood, gold, bone, wax, flame, crystal,
    torch, brazier, statue, column, chandelierGeo, bannerGeo, boneGeo, skullGeo, coinPileGeo, coinGeo, crystalGeo, candleGeo, rubbleGeo,
  };
}

// ---------------------------------------------------------------- builder

export function buildLevel(d: DungeonData, biome: Biome, lights: LightPool, seed: number): Level {
  const grid = new Grid(d);
  const level = new Level(d, biome, grid);
  const rng = new Rng(seed ^ 0x5bd1e995);
  const tex = biomeTextures(biome);
  const kit = makeKit(biome);
  const batch = new Batcher();
  const T = TILE;
  const torchCol = new THREE.Color(biome.torchColor);
  const bake = level.bakeLights;
  const addBake = (x: number, y: number, z: number, c: THREE.Color, intensity: number, range: number) => {
    bake.push({ x, y, z, r: c.r * intensity, g: c.g * intensity, b: c.b * intensity, range });
  };
  const walk = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return false;
    const t = d.tiles[ty * d.w + tx];
    return t === Tile.Floor || t === Tile.Lava;
  };
  const isDoorTile = (tx: number, ty: number) => {
    for (const r of d.rooms) for (const dr of r.doors) {
      if (tx >= dr.x0 - 1 && tx < dr.x1 + 1 && ty >= dr.y0 - 1 && ty < dr.y1 + 1) return true;
    }
    return false;
  };

  // ------------------------------------------------ decorations along walls
  const wallFaces: { tx: number; ty: number; dir: number }[] = [];
  for (let ty = 0; ty < d.h; ty++) {
    for (let tx = 0; tx < d.w; tx++) {
      if (!walk(tx, ty)) continue;
      if (!walk(tx + 1, ty)) wallFaces.push({ tx, ty, dir: 0 });
      if (!walk(tx - 1, ty)) wallFaces.push({ tx, ty, dir: 1 });
      if (!walk(tx, ty + 1)) wallFaces.push({ tx, ty, dir: 2 });
      if (!walk(tx, ty - 1)) wallFaces.push({ tx, ty, dir: 3 });
    }
  }
  // world position on a wall face, `off` units in front of it
  const facePos = (f: { tx: number; ty: number; dir: number }, off: number) => {
    const cx = (f.tx + 0.5) * T, cz = (f.ty + 0.5) * T;
    switch (f.dir) {
      case 0: return { x: (f.tx + 1) * T - off, z: cz, ry: -Math.PI / 2 };
      case 1: return { x: f.tx * T + off, z: cz, ry: Math.PI / 2 };
      case 2: return { x: cx, z: (f.ty + 1) * T - off, ry: Math.PI };
      default: return { x: cx, z: f.ty * T + off, ry: 0 };
    }
  };
  const bannerTex = bannerTexture(biome.bannerColor, biome.bannerEmblem);
  const bannerMat = toon(0xffffff, { map: bannerTex, side: THREE.DoubleSide });
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTexture(seed), color: new THREE.Color(biome.runeColor).multiplyScalar(2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  level.runeMats.push(runeMat);
  const runeGeo = new THREE.PlaneGeometry(2.6, 3.6);
  let torchCount = 0;
  const torchFaces = new Set<{ tx: number; ty: number; dir: number }>();
  for (const f of wallFaces) {
    if (isDoorTile(f.tx, f.ty)) continue;
    const along = f.dir <= 1 ? f.ty : f.tx;
    const inRoom = d.roomOf[f.ty * d.w + f.tx] >= 0;
    // pillars (solid block inside rooms) don't get torches
    const nx = f.tx + (f.dir === 0 ? 1 : f.dir === 1 ? -1 : 0), ny = f.ty + (f.dir === 2 ? 1 : f.dir === 3 ? -1 : 0);
    const isPillar = nx >= 0 && ny >= 0 && nx < d.w && ny < d.h && d.tiles[ny * d.w + nx] === Tile.Pillar;
    if (isPillar) {
      if ((along + f.dir) % 2 === 0 && inRoom) {
        const p = facePos(f, -0.05);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 11.5, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry, 0)), new THREE.Vector3(1, 1, 1));
        batch.add(runeGeo, runeMat, m, false);
      }
      continue;
    }
    const mod = inRoom ? 4 : 5;
    if (along % mod === 2 && torchCount < 170) {
      const p = facePos(f, 0);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 6.5, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry, 0)), new THREE.Vector3(1, 1, 1));
      batch.addGroup(kit.torch, m, false);
      torchFaces.add(f);
      const fp = facePos(f, 1.0);
      level.flames.push({ x: fp.x, y: 7.2, z: fp.z, size: 1, color: [torchCol.r, torchCol.g * 0.9, torchCol.b * 0.8], phase: rng.float(0, 100) });
      addBake(fp.x, 7.5, fp.z, torchCol, 2.3, 30);
      lights.addStatic(fp.x, 7.5, fp.z, torchCol, 7, 28, 0.2);
      torchCount++;
    } else if (inRoom && along % 4 === 0 && rng.chance(0.55)) {
      const p = facePos(f, 0.12);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 13.5, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry, 0)), new THREE.Vector3(3.4, 8, 1));
      batch.add(kit.bannerGeo, bannerMat, m, false);
    } else if (!inRoom && along % 5 === 0) {
      const p = facePos(f, 0.06);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 8, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry, 0)), new THREE.Vector3(1, 1, 1));
      batch.add(runeGeo, runeMat, m, false);
      addBake(p.x, 8, p.z, new THREE.Color(biome.runeColor), 0.5, 10);
    }
  }

  // graffiti near room entrances
  const graffitiMats: THREE.MeshBasicMaterial[] = [];
  for (const lines of biome.graffiti) {
    const col = rng.pick(['#f2efe6', '#ff3b4a', '#ffd23a', '#7cf2ff']);
    graffitiMats.push(new THREE.MeshBasicMaterial({ map: graffitiTexture(lines, col), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  }
  const graffGeo = new THREE.PlaneGeometry(10, 5);
  for (const r of d.rooms) {
    if (r.type === 'boss' || !rng.chance(0.55)) continue;
    const candidates = wallFaces.filter((f) => d.roomOf[f.ty * d.w + f.tx] === r.id && !isDoorTile(f.tx, f.ty) && ((f.dir <= 1 ? f.ty : f.tx) % 4 === 0));
    if (!candidates.length) continue;
    const f = rng.pick(candidates);
    const p = facePos(f, 0.08);
    const g = new THREE.Mesh(graffGeo, rng.pick(graffitiMats));
    g.position.set(p.x, 4.2, p.z);
    g.rotation.y = p.ry;
    g.layers.set(FX_LAYER);
    level.group.add(g);
  }

  // ------------------------------------------------ rooms: columns, chandeliers, scatter
  const decoRoom = (r: Room) => {
    const x0 = r.x0 * T, x1 = r.x1 * T, z0 = r.y0 * T, z1 = r.y1 * T;
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      const m = new THREE.Matrix4().makeTranslation(cx, 0, cz);
      batch.addGroup(kit.column, m, true);
      grid.obstacles.push({ x: cx, z: cz, r: 2.0, h: WALL_H });
    }
    const rw = r.x1 - r.x0, rh = r.y1 - r.y0;
    const spots: [number, number][] = r.type === 'boss' ? [[r.wx - rw * T * 0.22, r.wz - rh * T * 0.22], [r.wx + rw * T * 0.22, r.wz - rh * T * 0.22], [r.wx - rw * T * 0.22, r.wz + rh * T * 0.22], [r.wx + rw * T * 0.22, r.wz + rh * T * 0.22]] : rw >= 13 && rh >= 13 ? [[r.wx, r.wz]] : [];
    for (const [chx, chz] of spots) {
      const ch = new THREE.Group();
      const iron = new THREE.Mesh(kit.chandelierGeo.iron, kit.iron);
      const wax = new THREE.Mesh(kit.chandelierGeo.wax, kit.wax);
      ch.add(iron, wax);
      ch.position.set(chx, 13, chz);
      ch.scale.setScalar(r.type === 'boss' ? 1.8 : 1.3);
      level.group.add(ch);
      level.chandeliers.push(ch);
      chandelierFlames(chx, chz, r.type === 'boss' ? 1.8 : 1.3, [torchCol.r, torchCol.g * 0.9, torchCol.b * 0.8], level.extraFlames, rng);
      addBake(chx, 11, chz, torchCol, r.type === 'boss' ? 2.6 : 1.9, r.type === 'boss' ? 56 : 40);
      lights.addStatic(chx, 11, chz, torchCol, 6, 34, 0.08);
    }
    // scatter props along the edges
    const n = Math.floor((rw + rh) * 0.5);
    for (let i = 0; i < n; i++) {
      const side = rng.int(0, 3);
      const along = rng.float(0.1, 0.9);
      const inset = rng.float(1.2, 3.2);
      const px = side === 0 ? x0 + inset : side === 1 ? x1 - inset : x0 + (x1 - x0) * along;
      const pz = side === 2 ? z0 + inset : side === 3 ? z1 - inset : z0 + (z1 - z0) * along;
      const ptx = Math.floor(px / T), ptz = Math.floor(pz / T);
      if (isDoorTile(ptx, ptz) || !walk(ptx, ptz) || d.tiles[ptz * d.w + ptx] === Tile.Lava) continue;
      const kind = rng.next();
      if (biome.accentProp === 'crystals' && kind < 0.35) {
        const cnt = rng.int(2, 4);
        for (let k = 0; k < cnt; k++) {
          const s = rng.float(0.8, 2.0);
          batch.put(kit.crystalGeo, kit.crystal, px + rng.float(-1, 1), s * 1.2, pz + rng.float(-1, 1), rng.float(-0.4, 0.4), rng.float(0, 3), rng.float(-0.4, 0.4), s, s, s, false);
        }
        addBake(px, 2, pz, new THREE.Color(biome.runeColor), 0.7, 12);
      } else if ((biome.accentProp === 'gold' || biome.id === 'vaults') && kind < 0.55) {
        const s = rng.float(0.7, 1.4);
        batch.put(kit.coinPileGeo, kit.gold, px, 0.5 * s, pz, 0, rng.float(0, 3), 0, s, s, s, true);
        for (let k = 0; k < 5; k++) batch.put(kit.coinGeo, kit.gold, px + rng.float(-2, 2), 0.05, pz + rng.float(-2, 2), rng.float(-0.2, 0.2), 0, rng.float(-0.2, 0.2), 1, 1, 1, false);
      } else if (kind < 0.7) {
        // bone pile
        for (let k = 0; k < 4; k++) batch.put(kit.boneGeo, kit.bone, px + rng.float(-1, 1), 0.14, pz + rng.float(-1, 1), 0, rng.float(0, 3), 0, 1, 1, 1, false);
        if (rng.chance(0.6)) batch.put(kit.skullGeo, kit.bone, px + rng.float(-0.5, 0.5), 0.38, pz + rng.float(-0.5, 0.5), rng.float(-0.3, 0.3), rng.float(0, 6), 0, 1, 0.9, 1.1, false);
      } else if (kind < 0.85) {
        // candles
        for (let k = 0; k < 3; k++) {
          const cx = px + rng.float(-0.8, 0.8), cz = pz + rng.float(-0.8, 0.8), h = rng.float(0.6, 1.5);
          batch.put(kit.candleGeo, kit.wax, cx, h * 0.4, cz, 0, 0, 0, 1, h, 1, false);
          level.flames.push({ x: cx, y: h * 0.8 + 0.1, z: cz, size: 0.25, color: [1, 0.7, 0.35], phase: rng.float(0, 50) });
        }
        addBake(px, 1.2, pz, torchCol, 0.5, 8);
      } else {
        for (let k = 0; k < 3; k++) {
          const s = rng.float(0.5, 1.2);
          batch.put(kit.rubbleGeo, kit.stoneDark, px + rng.float(-1, 1), s * 0.4, pz + rng.float(-1, 1), rng.float(0, 3), rng.float(0, 3), 0, s, s * 0.7, s, true);
        }
      }
    }
  };
  for (const r of d.rooms) decoRoom(r);

  // markers: braziers & statues
  for (const mk of d.markers) {
    const x = (mk.x + 0.5) * T, z = (mk.y + 0.5) * T;
    if (mk.kind === 'brazier') {
      batch.addGroup(kit.brazier, new THREE.Matrix4().makeTranslation(x, 0, z), true);
      grid.obstacles.push({ x, z, r: 1.9, h: 5 });
      level.flames.push({ x, y: 4.8, z, size: 2.2, color: [torchCol.r, torchCol.g * 0.85, torchCol.b * 0.7], phase: rng.float(0, 100) });
      addBake(x, 6, z, torchCol, 3.0, 40);
      lights.addStatic(x, 6, z, torchCol, 11, 38, 0.25);
    } else if (mk.kind === 'statue') {
      batch.addGroup(kit.statue, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.float(0, 6.28), 0)), new THREE.Vector3(1.2, 1.2, 1.2)), true);
      grid.obstacles.push({ x, z, r: 3.0, h: 12 });
    }
  }

  // ------------------------------------------------ arches + gates at doors
  const archShape = new THREE.Shape();
  const hw = 8.8, th = 1.8;
  archShape.absarc(0, 0, hw + th, 0, Math.PI, false);
  archShape.lineTo(-hw, 0);
  archShape.absarc(0, 0, hw, Math.PI, 0, true);
  archShape.lineTo(hw + th, 0);
  const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: 2.2, bevelEnabled: false, curveSegments: 14 });
  archGeo.translate(0, 0, -1.1);
  const postGeo = new THREE.BoxGeometry(2.2, 9, 2.6);
  postGeo.translate(0, 4.5, 0);
  const keyGeo = new THREE.BoxGeometry(2.0, 2.4, 2.8);
  const gateKinds = new Set(['combat', 'elite', 'boss']);
  const doneDoors = new Set<string>();
  for (const r of d.rooms) {
    for (const dr of r.doors) {
      // world centre of the boundary line & orientation
      const horizontal = dr.dir <= 1; // corridor runs along x
      const bx = dr.dir === 0 ? dr.x0 * T : dr.dir === 1 ? dr.x1 * T : ((dr.x0 + dr.x1) / 2) * T;
      const bz = dr.dir === 2 ? dr.y0 * T : dr.dir === 3 ? dr.y1 * T : ((dr.y0 + dr.y1) / 2) * T;
      const ry = horizontal ? Math.PI / 2 : 0;
      const key = `${Math.round(bx)}|${Math.round(bz)}`;
      if (!doneDoors.has(key)) {
        doneDoors.add(key);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(bx, 9, bz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
        batch.add(archGeo, kit.stone, m, true);
        for (const s of [-1, 1]) {
          const px = horizontal ? bx : bx + s * (hw + th / 2);
          const pz = horizontal ? bz + s * (hw + th / 2) : bz;
          batch.put(postGeo, kit.stoneDark, px, 0, pz, 0, ry, 0);
          grid.obstacles.push({ x: px, z: pz, r: 1.3, h: 9 });
        }
        // keystone colour hints at the room type beyond
        const other = d.rooms[dr.other];
        const hint = other.type === 'treasure' || other.type === 'vault' ? 0xffc02a : other.type === 'shop' ? 0x3aff7a : other.type === 'boss' ? 0xff2020 : other.type === 'exit' ? 0x40a0ff : other.type === 'elite' ? 0xff40ff : other.type === 'shrine' ? 0xb080ff : null;
        const km = hint !== null ? toon(0x222222, { emissive: hint, emissiveIntensity: 2.2 }) : kit.stoneDark;
        batch.put(keyGeo, km, bx, 9 + hw + th * 0.5, bz, 0, ry, 0);
        if (hint !== null) addBake(bx, 16, bz, new THREE.Color(hint), 0.8, 12);
      }
      if (gateKinds.has(r.type) || (r.type === 'vault')) {
        const kind: Gate['kind'] = r.type === 'vault' ? 'gold' : r.type === 'boss' ? 'boss' : 'iron';
        const mesh = makeGateMesh(kind, dr.x1 - dr.x0 > dr.y1 - dr.y0 ? (dr.x1 - dr.x0) * T : (dr.y1 - dr.y0) * T);
        // place gate at the corridor side of the boundary
        const gx = dr.dir === 0 ? dr.x0 * T + 1.2 : dr.dir === 1 ? dr.x1 * T - 1.2 : bx;
        const gz = dr.dir === 2 ? dr.y0 * T + 1.2 : dr.dir === 3 ? dr.y1 * T - 1.2 : bz;
        mesh.position.set(gx, WALL_H - 1.5, gz);
        mesh.rotation.y = ry;
        mesh.castShadow = true;
        level.group.add(mesh);
        level.gates.push({ door: dr, mesh, open: 1, target: 1, kind, x: gx, z: gz });
      }
    }
  }

  // ------------------------------------------------ lava bake lights (sparse)
  for (let ty = 0; ty < d.h; ty += 1) for (let tx = 0; tx < d.w; tx += 1) {
    if (d.tiles[ty * d.w + tx] === Tile.Lava && (tx + ty) % 2 === 0) addBake((tx + 0.5) * T, 1, (ty + 0.5) * T, new THREE.Color(0xff5010), 0.9, 12);
  }

  // ------------------------------------------------ static geometry with baked light
  dressLevel({ level, d, biome, batch, grid, rng, wallFaces, facePos, isDoorTile, addBake, torchCol, torchFaces });
  buildStaticGeometry(level, tex, biome);
  batch.build(level.group, 0);
  level.flameField = new FlameField([...level.flames, ...level.extraFlames]);
  level.group.add(level.flameField.mesh);
  return level;
}

function makeGateMesh(kind: 'iron' | 'gold' | 'boss', width: number) {
  const geos: THREE.BufferGeometry[] = [];
  const H = WALL_H - 1;
  const n = Math.floor(width / 1.4);
  for (let i = 0; i <= n; i++) {
    const x = -width / 2 + (i / n) * width;
    const bar = new THREE.CylinderGeometry(0.18, 0.18, H, 5);
    bar.translate(x, H / 2 - 0.5, 0);
    geos.push(bar);
    const spike = new THREE.ConeGeometry(0.3, 1.0, 5);
    spike.rotateX(Math.PI);
    spike.translate(x, -0.9, 0);
    geos.push(spike);
  }
  for (const y of [1.6, H * 0.45, H - 1.5]) {
    const hb = new THREE.BoxGeometry(width, 0.45, 0.45);
    hb.translate(0, y, 0);
    geos.push(hb);
  }
  const g = mergeGeometries(geos)!;
  const color = kind === 'gold' ? 0xd4a020 : kind === 'boss' ? 0x401010 : 0x2a2a32;
  const emissive = kind === 'gold' ? 0x4a3000 : kind === 'boss' ? 0x800808 : 0x000000;
  const mat = toon(color, { emissive, emissiveIntensity: kind === 'iron' ? 0 : 1 });
  const mesh = new THREE.Mesh(g, mat);
  return mesh;
}

/** Floors, walls, wall tops and skirting, with baked point lighting + AO. */
function buildStaticGeometry(level: Level, tex: LevelTex, biome: Biome) {
  const d = level.d;
  const grid = level.grid;
  const T = TILE;
  const H = WALL_H;
  const lights = level.bakeLights;
  const baker = new LightBaker(lights, grid, d.w * T, d.h * T);
  level.lightMap = buildLightMap(baker, d.w * T, d.h * T, 2);
  const bakeAt = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, out: number[]) => baker.at(px, py, pz, nx, ny, nz, out);
  const walk = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return false;
    const t = d.tiles[ty * d.w + tx];
    return t === Tile.Floor || t === Tile.Lava;
  };
  const solidAt = (tx: number, ty: number) => !walk(tx, ty);

  // --- floor (2x2 subdivided per tile)
  {
    const pos: number[] = [], uv: number[] = [], col: number[] = [], bk: number[] = [], nor: number[] = [];
    const lavaPos: number[] = [];
    const cache = new Map<number, [number, number, number, number]>();
    const tmp = [0, 0, 0];
    const cornerData = (gx: number, gz: number) => {
      // gx,gz in half-tile units
      const key = gz * 100000 + gx;
      let c = cache.get(key);
      if (!c) {
        const x = gx * T * 0.5, z = gz * T * 0.5;
        bakeAt(x, 0.2, z, 0, 1, 0, tmp);
        // AO: count solid tiles around this point
        let ao = 1;
        const ftx = Math.floor((x - 0.01) / T), ftz = Math.floor((z - 0.01) / T);
        const ctx = Math.floor((x + 0.01) / T), ctz = Math.floor((z + 0.01) / T);
        let solids = 0;
        for (const [ax, az] of [[ftx, ftz], [ctx, ftz], [ftx, ctz], [ctx, ctz]]) if (solidAt(ax, az)) solids++;
        // soft falloff near walls using neighbours one tile away
        let near = 0;
        const mx = Math.round(x / T), mz = Math.round(z / T);
        for (let oz = -1; oz <= 0; oz++) for (let ox = -1; ox <= 0; ox++) {
          for (const [ex, ez] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (solidAt(mx + ox + ex, mz + oz + ez)) near++;
        }
        ao = 1 - solids * 0.14 - Math.min(near, 6) * 0.03;
        c = [tmp[0], tmp[1], tmp[2], Math.max(0.35, ao)];
        cache.set(key, c);
      }
      return c;
    };
    for (let ty = 0; ty < d.h; ty++) {
      for (let tx = 0; tx < d.w; tx++) {
        const t = d.tiles[ty * d.w + tx];
        if (t === Tile.Lava) {
          const x0 = tx * T, z0 = ty * T, x1 = x0 + T, z1 = z0 + T;
          lavaPos.push(x0, 0.06, z0, x0, 0.06, z1, x1, 0.06, z1, x0, 0.06, z0, x1, 0.06, z1, x1, 0.06, z0);
          continue;
        }
        if (t !== Tile.Floor) continue;
        for (let sz = 0; sz < 2; sz++) for (let sx = 0; sx < 2; sx++) {
          const gx = tx * 2 + sx, gz = ty * 2 + sz;
          const x0 = gx * T * 0.5, z0 = gz * T * 0.5, x1 = x0 + T * 0.5, z1 = z0 + T * 0.5;
          const A = cornerData(gx, gz), B = cornerData(gx, gz + 1), C = cornerData(gx + 1, gz + 1), D = cornerData(gx + 1, gz);
          const quad: [number, number, typeof A][] = [[x0, z0, A], [x0, z1, B], [x1, z1, C], [x0, z0, A], [x1, z1, C], [x1, z0, D]];
          for (const [x, z, c] of quad) {
            pos.push(x, 0, z);
            nor.push(0, 1, 0);
            uv.push(x / 13, z / 13);
            col.push(c[3], c[3], c[3]);
            bk.push(c[0], c[1], c[2]);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('baked', new THREE.Float32BufferAttribute(bk, 3));
    const mat = bakedToon(tex.floor, (TINTS[biome.id] ?? TINTS.crypt).floor, undefined, { bump: tex.floorBump, bumpScale: 2.6, mottle: 0.2, sheen: 0.7 });
    mat.vertexColors = true;
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    level.group.add(mesh);

    if (lavaPos.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lavaPos, 3));
      const lm = new THREE.ShaderMaterial({
        vertexShader: lavaVert,
        fragmentShader: lavaFrag,
        uniforms: { time: { value: 0 }, map: { value: art('tex_lava') } },
      });
      level.lavaMat = lm;
      const lmesh = new THREE.Mesh(lg, lm);
      level.group.add(lmesh);
    }
  }

  // --- ceiling (dark vaulted stone, lit by torch light pooling upward)
  {
    const pos: number[] = [], uv: number[] = [], col: number[] = [], bk: number[] = [], nor: number[] = [];
    const cache = new Map<number, [number, number, number]>();
    const tmp = [0, 0, 0];
    const corner = (gx: number, gz: number) => {
      const key = gz * 100000 + gx;
      let c = cache.get(key);
      if (!c) {
        bakeAt(gx * T, H - 1.5, gz * T, 0, -1, 0, tmp);
        c = [tmp[0], tmp[1], tmp[2]];
        cache.set(key, c);
      }
      return c;
    };
    for (let ty = 0; ty < d.h; ty++) {
      for (let tx = 0; tx < d.w; tx++) {
        if (!walk(tx, ty)) continue;
        const x0 = tx * T, z0 = ty * T, x1 = x0 + T, z1 = z0 + T;
        const A = corner(tx, ty), B = corner(tx + 1, ty), C = corner(tx + 1, ty + 1), D = corner(tx, ty + 1);
        const quad: [number, number, [number, number, number]][] = [[x0, z0, A], [x1, z0, B], [x1, z1, C], [x0, z0, A], [x1, z1, C], [x0, z1, D]];
        for (const [x, z, c] of quad) {
          pos.push(x, H, z);
          nor.push(0, -1, 0);
          uv.push(x / 15, z / 15);
          col.push(0.55, 0.55, 0.55);
          bk.push(c[0], c[1], c[2]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('baked', new THREE.Float32BufferAttribute(bk, 3));
    const m = bakedToon(tex.wall, new THREE.Color((TINTS[biome.id] ?? TINTS.crypt).wall).multiplyScalar(0.55), undefined, { bump: tex.wallBump, bumpScale: 2.2, mottle: 0.25 });
    m.vertexColors = true;
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    level.group.add(mesh);
  }

  // --- walls (+ skirting, + caps)
  {
    const wallPos: number[] = [], wallUv: number[] = [], wallCol: number[] = [], wallBk: number[] = [], wallNor: number[] = [];
    const pilPos: number[] = [], pilUv: number[] = [], pilCol: number[] = [], pilBk: number[] = [], pilNor: number[] = [];
    const levels = [0, 1.6, 5, 10, H];
    const aoAt = (y: number) => (y <= 0 ? 0.5 : y <= 1.6 ? 0.85 : y <= 5 ? 1.0 : y <= 10 ? 0.85 : 0.3);
    const tmp = [0, 0, 0];
    const pushV = (P: number[], U: number[], C: number[], B: number[], N: number[], x: number, y: number, z: number, u: number, v: number, nx: number, nz: number, ao: number) => {
      P.push(x, y, z);
      U.push(u, v);
      C.push(ao, ao, ao);
      N.push(nx, 0, nz);
      bakeAt(x + nx * 0.5, Math.max(0.3, y), z + nz * 0.5, nx, 0, nz, tmp);
      B.push(tmp[0], tmp[1], tmp[2]);
    };
    for (let ty = 0; ty < d.h; ty++) {
      for (let tx = 0; tx < d.w; tx++) {
        if (!walk(tx, ty)) continue;
        for (let dir = 0; dir < 4; dir++) {
          const ntx = tx + (dir === 0 ? 1 : dir === 1 ? -1 : 0), nty = ty + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
          if (walk(ntx, nty)) continue;
          const isPil = ntx >= 0 && nty >= 0 && ntx < d.w && nty < d.h && d.tiles[nty * d.w + ntx] === Tile.Pillar;
          const P = isPil ? pilPos : wallPos, U = isPil ? pilUv : wallUv, C = isPil ? pilCol : wallCol, Bk = isPil ? pilBk : wallBk, N = isPil ? pilNor : wallNor;
          let ax: number, az: number, bx: number, bz: number, nx: number, nz: number;
          const x0 = tx * T, z0 = ty * T, x1 = x0 + T, z1 = z0 + T;
          if (dir === 0) { ax = x1; az = z0; bx = x1; bz = z1; nx = -1; nz = 0; }
          else if (dir === 1) { ax = x0; az = z1; bx = x0; bz = z0; nx = 1; nz = 0; }
          else if (dir === 2) { ax = x1; az = z1; bx = x0; bz = z1; nx = 0; nz = -1; }
          else { ax = x0; az = z0; bx = x1; bz = z0; nx = 0; nz = 1; }
          const ua = (dir <= 1 ? az : ax) / 15, ub = (dir <= 1 ? bz : bx) / 15;
          for (let li = 0; li < levels.length - 1; li++) {
            const y0 = levels[li], y1 = levels[li + 1];
            const a0 = aoAt(y0), a1 = aoAt(y1);
            // two triangles: (a,y0) (b,y0) (b,y1) / (a,y0) (b,y1) (a,y1)
            pushV(P, U, C, Bk, N, ax, y0, az, ua, y0 / 15, nx, nz, a0);
            pushV(P, U, C, Bk, N, bx, y0, bz, ub, y0 / 15, nx, nz, a0);
            pushV(P, U, C, Bk, N, bx, y1, bz, ub, y1 / 15, nx, nz, a1);
            pushV(P, U, C, Bk, N, ax, y0, az, ua, y0 / 15, nx, nz, a0);
            pushV(P, U, C, Bk, N, bx, y1, bz, ub, y1 / 15, nx, nz, a1);
            pushV(P, U, C, Bk, N, ax, y1, az, ua, y1 / 15, nx, nz, a1);
          }
          if (!isPil) {
            // skirting ledge: front face + top face
            const inset = 0.35, sh = 1.3;
            const fax = ax + nx * inset, faz = az + nz * inset, fbx = bx + nx * inset, fbz = bz + nz * inset;
            pushV(P, U, C, Bk, N, fax, 0, faz, ua, 0, nx, nz, 0.55);
            pushV(P, U, C, Bk, N, fbx, 0, fbz, ub, 0, nx, nz, 0.55);
            pushV(P, U, C, Bk, N, fbx, sh, fbz, ub, sh / 15, nx, nz, 0.8);
            pushV(P, U, C, Bk, N, fax, 0, faz, ua, 0, nx, nz, 0.55);
            pushV(P, U, C, Bk, N, fbx, sh, fbz, ub, sh / 15, nx, nz, 0.8);
            pushV(P, U, C, Bk, N, fax, sh, faz, ua, sh / 15, nx, nz, 0.8);
            // top of ledge (normal up)
            const tpush = (x: number, z: number) => {
              P.push(x, sh, z);
              U.push(x / 15, z / 15);
              C.push(0.9, 0.9, 0.9);
              N.push(0, 1, 0);
              bakeAt(x, sh + 0.3, z, 0, 1, 0, tmp);
              Bk.push(tmp[0], tmp[1], tmp[2]);
            };
            tpush(ax, az); tpush(fbx, fbz); tpush(bx, bz);
            tpush(ax, az); tpush(fax, faz); tpush(fbx, fbz);
          }
        }
      }
    }
    // caps on solid tiles bordering walkable space
    const capPos: number[] = [];
    for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) {
      if (walk(tx, ty)) continue;
      let border = false;
      for (let oy = -1; oy <= 1 && !border; oy++) for (let ox = -1; ox <= 1; ox++) if (walk(tx + ox, ty + oy)) { border = true; break; }
      if (!border) continue;
      const x0 = tx * T, z0 = ty * T, x1 = x0 + T, z1 = z0 + T;
      capPos.push(x0, H, z0, x0, H, z1, x1, H, z1, x0, H, z0, x1, H, z1, x1, H, z0);
    }
    const mk = (P: number[], U: number[], C: number[], B: number[], N: number[], map: THREE.Texture, bump: THREE.Texture, tint: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      g.setAttribute('baked', new THREE.Float32BufferAttribute(B, 3));
      const m = bakedToon(map, tint, undefined, { bump, bumpScale: 2.8, mottle: 0.18 });
      m.vertexColors = true;
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      return mesh;
    };
    level.group.add(mk(wallPos, wallUv, wallCol, wallBk, wallNor, tex.wall, tex.wallBump, (TINTS[biome.id] ?? TINTS.crypt).wall));
    if (pilPos.length) {
      const pm = mk(pilPos, pilUv, pilCol, pilBk, pilNor, tex.pillar, tex.pillarBump, (TINTS[biome.id] ?? TINTS.crypt).pillar);
      pm.castShadow = true;
      level.group.add(pm);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
    cg.computeVertexNormals();
    const capMesh = new THREE.Mesh(cg, toon(new THREE.Color(biome.wall.dark).multiplyScalar(1.4)));
    level.group.add(capMesh);
  }
}
