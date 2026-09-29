import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ChassisDef, ChassisKind } from '../game/Cars';
import { glow, paintToon, metalToon } from '../render/Toon';
import { camoTexture } from '../render/CarTex';
import type { Item } from '../loot/Items';
import { RARITY } from '../loot/Items';
import { bodyRing, trapRing, loft, smoothStations, bevBox, plate, cone, rivets, tubeBetween, pathTube, bakeStatic, type Pt, type Station } from './CarKit';
import { taperTube } from './BossKit';

export interface WheelRef {
  pivot: THREE.Object3D; // steering pivot
  spin: THREE.Object3D; // rolls around x
  front: boolean;
  side: number;
  radius: number;
  x: number;
  z: number;
}

export interface CarModel {
  root: THREE.Group;
  body: THREE.Group;
  wheels: WheelRef[];
  turretMount: THREE.Object3D;
  sideMounts: THREE.Object3D[];
  plowMount: THREE.Object3D;
  exhausts: THREE.Vector3[];
  rearWheelZ: number;
  halfWidth: number;
  length: number;
  kind: ChassisKind;
  wheelSlot: THREE.Group[];
  plowGroup: THREE.Group | null;
  brakeLights: THREE.MeshBasicMaterial;
}

// ------------------------------------------------------------------------------------------ materials
const camoCache = new Map<string, THREE.Texture>();

function mats(def: ChassisDef) {
  const c = def.colors;
  let camo = camoCache.get(def.id);
  if (!camo) {
    camo = camoTexture(c.primary, c.secondary, c.accent, c.style, def.id.length * 13 + 7);
    camoCache.set(def.id, camo);
  }
  return {
    paint: paintToon(0xffffff, { map: camo, tile: 3.4, refl: 0.5, spec: 0.982, specStrength: 0.9, rim: 0xff9a80, rimStrength: 0.3 }),
    paintDS: paintToon(0xffffff, { map: camo, tile: 3.4, refl: 0.5, spec: 0.982, specStrength: 0.9, rim: 0xff9a80, rimStrength: 0.3, side: THREE.DoubleSide }),
    body: paintToon(c.primary, { refl: 0.5, spec: 0.982, specStrength: 0.9, rim: 0xff9a80, rimStrength: 0.26 }),
    dark: metalToon(0x15161b),
    armor: metalToon(0x2c2f3a),
    steel: metalToon(0x9aa1b2),
    chrome: metalToon(0xe4ebfa, { refl: 1, spec: 0.958, specStrength: 1 }),
    gold: metalToon(0xe8b030, { refl: 0.75, emissive: 0x4a3000, emissiveIntensity: 0.35 }),
    second: metalToon(c.secondary),
    accent: paintToon(c.accent, { refl: 0.3, spec: 0.98, rim: 0xffffff, rimStrength: 0.15 }),
    rubber: paintToon(0x0f1014, { refl: 0.08, spec: 0.994, specStrength: 0.5, rim: 0x7080a8, rimStrength: 0.32 }),
    rust: paintToon(0x6a3a22, { refl: 0.1, spec: 0 }),
    glass: paintToon(0x080d18, { refl: 0.95, spec: 0.955, specStrength: 1, emissive: 0x0a1c3c, emissiveIntensity: 0.9, rim: 0x6aa0ff, rimStrength: 0.4 }),
    head: glow(0xfff0c0, 3.6),
    lampAmber: glow(0xffc040, 3),
  };
}
type Mats = ReturnType<typeof mats>;

// ------------------------------------------------------------------------------------------ plate texture
function plateTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8d890';
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#111';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 88);
  g.fillStyle = '#111';
  g.font = 'bold 62px "Anton", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 52);
  g.fillStyle = '#7a1018';
  g.fillRect(14, 12, 228, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------------------------------ wheels
export function buildWheel(radius: number, width: number, variant: number, rarity: number, side = 1): THREE.Group {
  const g = new THREE.Group();
  const M = wheelMats(variant, rarity);
  const R = radius, w = width;
  const rimR = R * 0.62;
  // tire: lathe with rounded shoulders (axis -> X)
  const prof: [number, number][] = [[rimR * 0.98, -w * 0.46], [R * 0.86, -w * 0.5], [R * 0.955, -w * 0.45], [R * 0.995, -w * 0.31], [R, -w * 0.17], [R, w * 0.17], [R * 0.995, w * 0.31], [R * 0.955, w * 0.45], [R * 0.86, w * 0.5], [rimR * 0.98, w * 0.46]];
  const tg = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 30);
  tg.rotateZ(-Math.PI / 2);
  const tire = new THREE.Mesh(tg, M.rubber);
  tire.castShadow = true;
  g.add(tire);
  // tread lugs
  const lugs: THREE.BufferGeometry[] = [];
  const nT = variant === 1 ? 0 : 16;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * Math.PI * 2;
    for (const sx of [-1, 1]) {
      const b = new THREE.BoxGeometry(w * 0.4, 0.085, R * 0.3);
      b.translate(sx * w * 0.235, R + 0.005, 0);
      b.rotateX(a + (sx > 0 ? 0.08 : -0.08));
      lugs.push(b);
    }
  }
  // shoulder lugs on the sidewall
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    for (const sx of [-1, 1]) {
      const b = new THREE.BoxGeometry(0.07, R * 0.17, R * 0.22);
      b.translate(sx * w * 0.49, R * 0.9, 0);
      b.rotateX(a);
      lugs.push(b);
    }
  }
  if (lugs.length) g.add(new THREE.Mesh(mergeGeometries(lugs)!, M.rubber));
  // rim barrel + dish + spokes (outer face on +X)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.94, w * 0.86, 20).rotateZ(Math.PI / 2), M.rim);
  g.add(barrel);
  const face: THREE.BufferGeometry[] = [];
  const dish = new THREE.CylinderGeometry(rimR * 0.98, rimR * 0.98, 0.06, 20);
  dish.rotateZ(Math.PI / 2);
  dish.translate(w * 0.36, 0, 0);
  face.push(dish);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    for (const off of [-0.09, 0.09]) {
      const sp = new THREE.BoxGeometry(0.075, rimR * 0.82, 0.075);
      sp.translate(w * 0.4, rimR * 0.5, off * rimR * 0.5);
      sp.rotateX(a);
      face.push(sp);
    }
  }
  const hub = new THREE.CylinderGeometry(rimR * 0.3, rimR * 0.3, 0.1, 10);
  hub.rotateZ(Math.PI / 2);
  hub.translate(w * 0.42, 0, 0);
  face.push(hub);
  g.add(new THREE.Mesh(mergeGeometries(face)!, M.rimFace));
  const lug: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const n = new THREE.CylinderGeometry(0.035, 0.035, 0.07, 6);
    n.rotateZ(Math.PI / 2);
    n.translate(w * 0.49, rimR * 0.2, 0);
    n.rotateX(a);
    lug.push(n);
  }
  g.add(new THREE.Mesh(mergeGeometries(lug)!, M.chrome));
  // brake disc + caliper visible through the spokes
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.78, rimR * 0.78, 0.04, 18).rotateZ(Math.PI / 2), M.brake);
  disc.position.x = w * 0.18;
  g.add(disc);
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.1, rimR * 0.34, rimR * 0.5), M.caliper);
  cal.position.set(w * 0.28, rimR * 0.62, 0);
  g.add(cal);
  if (variant === 3 || variant === 4) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rimR * 1.02, 0.035, 6, 32).rotateY(Math.PI / 2), M.glow);
    ring.position.x = w * 0.505;
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.93, 0.03, 6, 32).rotateY(Math.PI / 2), M.glow);
    ring2.position.x = w * 0.5;
    g.add(ring2);
  }
  if (variant === 2 || variant === 4) {
    const sp: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      for (const sx of [-1, 1]) {
        const c = cone(0.075, 0.42, 5);
        c.rotateZ(sx * 0.35);
        c.translate(0, 0, 0);
        c.applyMatrix4(new THREE.Matrix4().makeTranslation(sx * w * 0.32, R * 0.98, 0));
        c.rotateX(a + (sx > 0 ? 0 : 0.22));
        sp.push(c);
      }
    }
    g.add(new THREE.Mesh(mergeGeometries(sp)!, M.chrome));
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
  g.scale.x = side;
  return g;
}

function wheelMats(variant: number, rarity: number) {
  const accent = RARITY[Math.max(3, rarity)].color;
  const voidy = variant === 3 || variant === 4;
  return {
    rubber: paintToon(0x0e0f13, { refl: 0.08, spec: 0.994, specStrength: 0.45, rim: voidy ? 0xa050ff : 0x7080a8, rimStrength: voidy ? 0.6 : 0.34 }),
    rim: metalToon(voidy ? 0x1d1230 : rarity >= 3 ? 0xd8a22a : 0x2b2e38),
    rimFace: metalToon(voidy ? 0x2a1a48 : rarity >= 3 ? 0xf0c040 : variant === 1 ? 0xd8b060 : 0x565b6a),
    chrome: metalToon(0xe4ebfa, { refl: 1, spec: 0.958 }),
    brake: metalToon(0x50535e),
    caliper: paintToon(0xd02020, { refl: 0.3, spec: 0.985 }),
    glow: glow(accent, 2.6),
  };
}

// ------------------------------------------------------------------------------------------ plows
export function buildPlow(variant: number, rarity: number, width: number): THREE.Group {
  const g = new THREE.Group();
  const iron = metalToon(0x3a3d48);
  const dark = metalToon(0x1a1b21);
  const chrome = metalToon(0xe4ebfa, { refl: 1, spec: 0.958 });
  const rustm = paintToon(0x7a4a26, { refl: 0.1, spec: 0 });
  const rc = RARITY[rarity].color;
  const accent = rarity >= 2 ? paintToon(0x222222, { emissive: rc, emissiveIntensity: 1.8, refl: 0.2 }) : rustm;
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (variant) {
    case 0: {
      put(bevBox(width * 1.05, 0.62, 0.5, 0.06), iron, 0, 0.62, 0.25);
      for (const x of [-0.7, 0, 0.7]) put(bevBox(0.14, 0.66, 0.56, 0.03), accent, x * width * 0.5, 0.62, 0.25);
      put(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 10).rotateX(Math.PI / 2), dark, 0, 0.62, 0.7);
      put(rivets(Array.from({ length: 10 }, (_, i) => [(i / 9 - 0.5) * width * 0.95, 0.85, 0.52] as [number, number, number]), 0.035), chrome);
      break;
    }
    case 1: {
      const wedge = plate([[0, 0.2], [0.95, 0.2], [0, 1.25]], width * 1.12, 0.03);
      wedge.rotateY(Math.PI / 2);
      put(wedge, iron);
      put(bevBox(width * 1.1, 0.1, 0.1, 0.02), accent, 0, 0.24, 0.92);
      for (let i = 0; i < 6; i++) put(cone(0.06, 0.3, 5), chrome, (i / 5 - 0.5) * width, 0.24, 0.94, Math.PI / 2);
      break;
    }
    case 2: {
      put(bevBox(width, 0.5, 0.25, 0.04), iron, 0, 0.62, 0.1);
      for (let i = 0; i < 5; i++) put(cone(0.13, 0.9, 6), rarity >= 2 ? accent : chrome, (i / 4 - 0.5) * width * 0.85, 0.62 + (i % 2) * 0.12, 0.2, Math.PI / 2);
      break;
    }
    case 3: {
      const pl = plate([[0, 0.25], [0.35, 0.3], [0.45, 0.85], [0.2, 1.2], [0, 1.2]], width * 1.02, 0.05);
      pl.rotateY(Math.PI / 2);
      put(pl, metalToon(0xc8b070));
      put(new THREE.BoxGeometry(0.14, 0.7, 0.06), metalToon(0xe8b030), 0, 0.72, 0.47);
      put(new THREE.BoxGeometry(0.5, 0.14, 0.06), metalToon(0xe8b030), 0, 0.85, 0.47);
      break;
    }
    default: {
      put(bevBox(width, 0.55, 0.3, 0.05), rustm, 0, 0.62, 0.1);
      const drill = put(new THREE.ConeGeometry(0.42, 1.6, 10), paintToon(0x8a5a2a, { emissive: 0xffa51f, emissiveIntensity: 0.6, refl: 0.4 }), 0, 0.65, 0.95, Math.PI / 2);
      drill.name = 'drill';
      for (const s of [-1, 1]) put(cone(0.14, 0.7, 6), chrome, s * width * 0.4, 0.62, 0.3, Math.PI / 2);
    }
  }
  return g;
}

interface Layout {
  L: number;
  W: number;
  wheelsF: number;
  wheelsR: number;
  rF: number;
  rR: number;
  wx: number;
  wWidth: number;
  turret: [number, number, number];
  side: [number, number, number];
  plowZ: number;
  exhaust: [number, number, number][];
}

const LAYOUTS: Record<ChassisKind, Layout> = {
  muscle: { L: 4.9, W: 2.25, wheelsF: 1.5, wheelsR: -1.45, rF: 0.52, rR: 0.58, wx: 1.12, wWidth: 0.46, turret: [0, 1.58, -0.4], side: [0.98, 1.02, 1.0], plowZ: 2.42, exhaust: [[0.55, 0.38, -2.5], [-0.55, 0.38, -2.5]] },
  hearse: { L: 5.5, W: 2.25, wheelsF: 1.75, wheelsR: -1.75, rF: 0.52, rR: 0.55, wx: 1.12, wWidth: 0.44, turret: [0, 1.78, -1.35], side: [1.02, 1.18, 0.7], plowZ: 2.66, exhaust: [[0.6, 0.38, -2.78], [-0.6, 0.38, -2.78]] },
  buggy: { L: 4.0, W: 1.7, wheelsF: 1.35, wheelsR: -1.25, rF: 0.6, rR: 0.68, wx: 1.18, wWidth: 0.52, turret: [0, 1.9, -0.35], side: [0.92, 0.98, 0.55], plowZ: 2.05, exhaust: [[0.35, 1.05, -2.05], [-0.35, 1.05, -2.05]] },
  truck: { L: 5.4, W: 2.5, wheelsF: 1.65, wheelsR: -1.65, rF: 0.88, rR: 0.88, wx: 1.35, wWidth: 0.62, turret: [0, 1.95, -1.35], side: [1.28, 1.72, 1.3], plowZ: 2.7, exhaust: [[0.75, 2.9, 0.05], [-0.75, 2.9, 0.05]] },
};


// ------------------------------------------------------------------------------------------ build kit
interface Ctx {
  body: THREE.Group;
  m: Mats;
  lay: Layout;
  brake: THREE.MeshBasicMaterial;
  def: ChassisDef;
  add: (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number) => THREE.Mesh;
  both: (fn: (s: number) => void) => void;
}

const st = (z: number, hw: number, yb: number, ys: number, yc: number, tw: number): Station => ({ z, ring: bodyRing(hw, yb, ys, yc, tw) });
const cabSt = (z: number, hwb: number, yb: number, hwt: number, yt: number): Station => ({ z, ring: trapRing(hwb, yb, hwt, yt) });
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Plate whose profile is given in (z, y) and which sits on the car side at x. */
function sidePlate(pts: Pt[], thick: number, bevel = 0.015) {
  const g = plate(pts, thick, bevel);
  g.rotateY(-Math.PI / 2);
  return g;
}

function flareGeo(R: number, w: number, lip = false) {
  const r = R + (lip ? 0.15 : 0.12);
  const g = new THREE.CylinderGeometry(r, r, lip ? 0.09 : w + 0.18, 24, 1, true, -0.3, Math.PI + 0.6);
  g.rotateZ(Math.PI / 2);
  return g;
}

function fenders(K: Ctx, paintMat: THREE.Material, lipMat: THREE.Material) {
  const { lay, add, both } = K;
  for (const [z, R] of [[lay.wheelsF, lay.rF], [lay.wheelsR, lay.rR]] as const) {
    both((s) => {
      const x = s * (lay.wx + 0.02);
      add(flareGeo(R, lay.wWidth), paintMat, x, R, z);
      add(flareGeo(R, lay.wWidth, true), lipMat, s * (lay.wx + lay.wWidth / 2 + 0.07), R, z);
      // bolts along the lip
      const pts: [number, number, number][] = [];
      for (let i = 0; i < 9; i++) {
        const a = -0.2 + (i / 8) * (Math.PI + 0.4);
        pts.push([s * (lay.wx + lay.wWidth / 2 + 0.11), R + Math.sin(a) * (R + 0.15), z + Math.cos(a) * (R + 0.15)]);
      }
      add(rivets(pts, 0.032), K.m.chrome);
    });
  }
}

function spikeRow(K: Ctx, pts: [number, number, number][], dir: (p: [number, number, number]) => [number, number, number], r = 0.07, h = 0.5) {
  for (const p of pts) {
    const [rx, ry, rz] = dir(p);
    K.add(cone(r, h, 6), K.m.chrome, p[0], p[1], p[2], rx, ry, rz);
  }
}

function licensePlate(K: Ctx, text: string, y: number, z: number, w = 0.7, rot = Math.PI) {
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), new THREE.MeshBasicMaterial({ map: plateTexture(text) }));
  pm.position.set(0, y, z);
  pm.rotation.y = rot;
  K.body.add(pm);
  pm.userData.keep = true;
}

function headlights(K: Ctx, y: number, z: number, xs: number, round = false) {
  const { m, add, both } = K;
  both((s) => {
    if (round) {
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 14).rotateX(Math.PI / 2), m.chrome, s * xs, y, z);
      add(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 14).rotateX(Math.PI / 2), m.head, s * xs, y, z + 0.04);
    } else {
      add(bevBox(0.48, 0.24, 0.1, 0.04), m.chrome, s * xs, y, z);
      add(new THREE.BoxGeometry(0.38, 0.15, 0.04), m.head, s * xs, y, z + 0.05);
    }
  });
}

// ------------------------------------------------------------------------------------------ muscle car
function buildMuscle(K: Ctx) {
  const { m, lay, add, both, brake } = K;
  const hull = loft(smoothStations([
    st(-2.47, 0.90, 0.46, 0.86, 0.92, 0.55), st(-2.36, 1.00, 0.36, 0.95, 1.03, 0.68), st(-2.0, 1.07, 0.32, 1.0, 1.10, 0.80),
    st(-1.2, 1.10, 0.30, 1.02, 1.08, 0.85), st(0.3, 1.10, 0.30, 1.0, 1.05, 0.9), st(1.0, 1.08, 0.30, 0.96, 1.08, 0.72),
    st(1.7, 1.05, 0.32, 0.90, 1.05, 0.62), st(2.2, 0.98, 0.36, 0.78, 0.92, 0.55), st(2.47, 0.86, 0.46, 0.66, 0.78, 0.45),
  ], 30));
  add(hull, m.paint);
  const cabin = loft(smoothStations([
    cabSt(-1.6, 0.90, 1.0, 0.80, 1.06), cabSt(-1.35, 0.92, 1.02, 0.76, 1.30), cabSt(-0.9, 0.93, 1.02, 0.74, 1.54),
    cabSt(-0.1, 0.93, 1.02, 0.74, 1.57), cabSt(0.45, 0.93, 1.02, 0.76, 1.50), cabSt(0.75, 0.93, 1.02, 0.84, 1.28), cabSt(0.98, 0.93, 1.02, 0.90, 1.08),
  ], 22), 0.93);
  add(cabin, [m.glass, m.paint]);
  add(new THREE.BoxGeometry(1.9, 0.14, 4.7), m.dark, 0, 0.3, 0);
  // roll hoop behind the cab + roof rails
  add(pathTube([V(-0.78, 1.0, -1.55), V(-0.74, 1.46, -1.42), V(0.74, 1.46, -1.42), V(0.78, 1.0, -1.55)], 0.05, 20), m.armor);
  both((s) => add(tubeBetween(V(s * 0.72, 1.58, -1.2), V(s * 0.72, 1.6, 0.4), 0.045), m.armor));
  spikeRow(K, [[-0.72, 1.6, -1.1], [-0.72, 1.6, -0.5], [-0.72, 1.6, 0.1], [0.72, 1.6, -1.1], [0.72, 1.6, -0.5], [0.72, 1.6, 0.1]], (p) => [0, 0, -Math.sign(p[0]) * 0.55], 0.06, 0.42);
  // hood: blower + scoop + stacks
  add(bevBox(0.66, 0.26, 1.0, 0.05), m.dark, 0, 1.16, 1.4);
  add(bevBox(0.5, 0.24, 0.72, 0.05), m.chrome, 0, 1.36, 1.35);
  for (const x of [-0.14, 0.14]) add(new THREE.CylinderGeometry(0.13, 0.08, 0.34, 10), m.chrome, x, 1.58, 1.4);
  add(rivets(Array.from({ length: 8 }, (_, i) => [(i % 2 ? 0.27 : -0.27), 1.2, 1.0 + Math.floor(i / 2) * 0.28] as [number, number, number]), 0.028), m.chrome);
  // hood spikes
  spikeRow(K, [[-0.5, 1.06, 1.05], [0.5, 1.06, 1.05], [-0.62, 1.03, 1.75], [0.62, 1.03, 1.75]], (p) => [0, 0, -Math.sign(p[0]) * 0.25], 0.06, 0.4);
  // front end
  add(bevBox(1.15, 0.32, 0.1, 0.04), m.dark, 0, 0.6, 2.44);
  for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(0.035, 0.24, 0.03), i % 2 ? m.head : brake, -0.42 + i * 0.14, 0.6, 2.5).castShadow = false;
  headlights(K, 0.76, 2.42, 0.74);
  both((s) => add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10).rotateX(Math.PI / 2), m.lampAmber, s * 0.42, 0.42, 2.5));
  add(bevBox(2.02, 0.26, 0.24, 0.06), m.armor, 0, 0.45, 2.52);
  add(bevBox(2.1, 0.06, 0.6, 0.02), m.dark, 0, 0.29, 2.62);
  add(rivets(Array.from({ length: 12 }, (_, i) => [-0.9 + i * 0.164, 0.5, 2.66] as [number, number, number]), 0.03), m.chrome);
  // bull bar hoops and spikes
  for (const x of [-0.62, 0, 0.62]) add(pathTube([V(x, 0.36, 2.55), V(x, 0.44, 2.93), V(x, 0.92, 2.95), V(x, 1.02, 2.5)], 0.05, 16), m.steel);
  spikeRow(K, [[-0.9, 0.52, 2.7], [-0.45, 0.52, 2.72], [0, 0.52, 2.74], [0.45, 0.52, 2.72], [0.9, 0.52, 2.7]], () => [Math.PI / 2, 0, 0], 0.07, 0.6);
  both((s) => add(cone(0.08, 0.7, 6), m.chrome, s * 1.02, 0.62, 2.45, Math.PI / 2, 0, -s * 0.5));
  // fenders + flare spikes
  fenders(K, m.paintDS, m.armor);
  spikeRow(K, [[-1.1, 1.14, lay.wheelsF + 0.3], [1.1, 1.14, lay.wheelsF + 0.3], [-1.1, 1.18, lay.wheelsR - 0.3], [1.1, 1.18, lay.wheelsR - 0.3]], (p) => [0, 0, -Math.sign(p[0]) * 0.55], 0.075, 0.5);
  // doors, skirts and armour plates
  both((s) => {
    add(new THREE.BoxGeometry(0.06, 0.24, 2.3), m.dark, s * 1.1, 0.36, 0.05);
    add(new THREE.BoxGeometry(0.03, 0.62, 0.03), m.dark, s * 1.104, 0.74, 0.86);
    add(new THREE.BoxGeometry(0.03, 0.62, 0.03), m.dark, s * 1.104, 0.74, -0.7);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.16), m.chrome, s * 1.115, 0.93, -0.22);
    add(sidePlate([[-0.6, 0.48], [0.78, 0.5], [0.7, 0.98], [-0.45, 1.02]], 0.05), m.armor, s * 1.12, 0);
    add(rivets([[-0.5, 0.55], [0.68, 0.56], [0.6, 0.92], [-0.36, 0.95]].map(([z, y]) => [s * 1.16, y, z] as [number, number, number]), 0.032), m.chrome);
    add(new THREE.CylinderGeometry(0.085, 0.085, 1.55, 8).rotateX(Math.PI / 2), m.chrome, s * 1.14, 0.3, 0.1);
    add(new THREE.CylinderGeometry(0.11, 0.09, 0.14, 8).rotateX(Math.PI / 2), m.dark, s * 1.14, 0.3, 0.92);
    // mirrors
    add(bevBox(0.16, 0.12, 0.08, 0.03), m.dark, s * 1.02, 1.28, 0.62);
  });
  // rear: wing, taillights, exhausts, plate
  both((s) => {
    add(bevBox(0.09, 0.42, 0.18, 0.02), m.dark, s * 0.72, 1.27, -2.14);
    add(bevBox(0.07, 0.36, 0.66, 0.02), m.second, s * 1.16, 1.5, -2.22);
  });
  add(bevBox(2.3, 0.07, 0.56, 0.03), m.second, 0, 1.5, -2.22, 0.13);
  add(bevBox(2.3, 0.03, 0.14, 0.01), m.accent, 0, 1.53, -2.4, 0.13);
  add(new THREE.BoxGeometry(1.5, 0.09, 0.05), brake, 0, 0.93, -2.45).castShadow = false;
  both((s) => add(bevBox(0.42, 0.18, 0.06, 0.03), brake, s * 0.78, 0.8, -2.44).castShadow = false);
  add(bevBox(1.6, 0.26, 0.1, 0.04), m.dark, 0, 0.88, -2.43);
  both((s) => {
    add(new THREE.CylinderGeometry(0.16, 0.18, 0.55, 12).rotateX(Math.PI / 2), m.chrome, s * 0.58, 0.44, -2.55);
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12).rotateX(Math.PI / 2), m.dark, s * 0.58, 0.44, -2.86);
  });
  add(bevBox(1.9, 0.2, 0.2, 0.05), m.armor, 0, 0.42, -2.5);
  licensePlate(K, 'LOOT-4U', 0.62, -2.62, 0.72);
  // turret ring + weapon pads
  add(new THREE.CylinderGeometry(0.62, 0.7, 0.2, 16), m.armor, lay.turret[0], lay.turret[1] - 0.06, lay.turret[2]);
  add(rivets(Array.from({ length: 10 }, (_, i) => [Math.cos((i / 10) * 6.28) * 0.56, lay.turret[1] + 0.06, lay.turret[2] + Math.sin((i / 10) * 6.28) * 0.56] as [number, number, number]), 0.03), m.chrome);
  both((s) => add(bevBox(0.46, 0.12, 1.0, 0.03), m.armor, s * lay.side[0], lay.side[1] - 0.1, lay.side[2]));
  // hood ornament: golden crown
  const crown = plate([[-0.22, 0], [-0.26, 0.3], [-0.1, 0.16], [0, 0.4], [0.1, 0.16], [0.26, 0.3], [0.22, 0]], 0.05, 0.01);
  add(crown, m.gold, 0, 1.06, 2.15, -0.35);
}

// ------------------------------------------------------------------------------------------ hearse
function buildHearse(K: Ctx) {
  const { m, lay, add, both, brake } = K;
  const hull = loft(smoothStations([
    st(-2.76, 0.94, 0.46, 0.9, 0.96, 0.7), st(-2.6, 1.04, 0.34, 0.98, 1.04, 0.8), st(-1.5, 1.1, 0.3, 1.02, 1.06, 0.92), st(0.4, 1.1, 0.3, 1.0, 1.04, 0.92),
    st(1.2, 1.08, 0.3, 0.96, 1.06, 0.74), st(2.0, 1.02, 0.34, 0.86, 1.0, 0.6), st(2.68, 0.9, 0.46, 0.66, 0.78, 0.48),
  ], 26));
  add(hull, m.paint);
  add(new THREE.BoxGeometry(1.9, 0.14, 5.2), m.dark, 0, 0.3, 0);
  // cab
  const cab = loft(smoothStations([cabSt(1.15, 0.94, 1.0, 0.9, 1.06), cabSt(0.8, 0.95, 1.02, 0.8, 1.44), cabSt(0.4, 0.96, 1.02, 0.76, 1.6), cabSt(-0.2, 0.96, 1.02, 0.76, 1.62)], 12), 0.93);
  add(cab, [m.glass, m.paint]);
  // coffin compartment
  const coffin = loft(smoothStations([cabSt(-0.15, 0.98, 1.0, 0.92, 1.6), cabSt(-0.25, 1.0, 1.0, 0.94, 1.78), cabSt(-2.5, 1.0, 1.0, 0.94, 1.78), cabSt(-2.7, 0.94, 1.0, 0.86, 1.4)], 14), 0.9);
  add(coffin, [m.glass, m.body]);
  const curtain = paintToon(0x4a1a6a, { emissive: 0x2a0a40, emissiveIntensity: 0.8, refl: 0.05, spec: 0 });
  both((s) => {
    add(new THREE.BoxGeometry(0.03, 0.46, 1.9), curtain, s * 1.01, 1.36, -1.4);
    add(bevBox(0.05, 0.06, 5.1, 0.02), m.gold, s * 1.12, 1.0, -0.05);
    add(pathTube([V(s * 1.04, 1.0, -2.55), V(s * 1.12, 1.3, -2.35), V(s * 1.04, 1.7, -2.15)], 0.045, 14), m.gold);
    add(pathTube([V(s * 1.02, 1.05, -0.3), V(s * 1.12, 1.35, -0.55), V(s * 1.02, 1.72, -0.75)], 0.045, 14), m.gold);
    add(bevBox(0.16, 0.12, 0.08, 0.03), m.dark, s * 1.02, 1.28, 0.9);
  });
  add(bevBox(1.9, 0.08, 2.4, 0.03), m.dark, 0, 1.79, -1.4);
  for (const s of [-1, 1]) add(bevBox(0.09, 0.1, 2.46, 0.02), m.gold, s * 0.98, 1.8, -1.4);
  for (const z of [-0.18, -2.62]) add(bevBox(2.0, 0.1, 0.09, 0.02), m.gold, 0, 1.8, z);
  add(bevBox(0.08, 0.1, 2.0, 0.02), m.gold, 0, 1.81, -1.4);
  add(bevBox(1.0, 0.1, 0.08, 0.02), m.gold, 0, 1.81, -1.2);
  for (const z of [-0.4, -2.4]) for (const s of [-0.92, 0.92]) add(new THREE.OctahedronGeometry(0.13), m.gold, s, 1.92, z);
  add(new THREE.BoxGeometry(0.1, 0.5, 0.1), m.gold, 0, 2.05, -1.4);
  add(new THREE.BoxGeometry(0.4, 0.1, 0.1), m.gold, 0, 2.15, -1.4);
  // front: chrome grille, round lamps, bumper
  add(bevBox(1.2, 0.5, 0.1, 0.05), m.chrome, 0, 0.66, 2.66);
  for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.03, 0.42, 0.04), m.dark, -0.48 + i * 0.12, 0.66, 2.72);
  headlights(K, 0.72, 2.6, 0.82, true);
  add(bevBox(2.02, 0.2, 0.22, 0.05), m.chrome, 0, 0.36, 2.72);
  both((s) => add(new THREE.SphereGeometry(0.1, 8, 6), m.chrome, s * 0.5, 0.4, 2.85));
  spikeRow(K, [[-0.9, 0.5, 2.8], [-0.45, 0.5, 2.85], [0, 0.5, 2.88], [0.45, 0.5, 2.85], [0.9, 0.5, 2.8]], () => [Math.PI / 2, 0, 0], 0.06, 0.5);
  fenders(K, m.paintDS, m.gold);
  both((s) => {
    add(new THREE.BoxGeometry(0.06, 0.2, 2.6), m.dark, s * 1.1, 0.36, 0.0);
    add(rivets(Array.from({ length: 8 }, (_, i) => [s * 1.13, 0.75, -1.8 + i * 0.5] as [number, number, number]), 0.03), m.gold);
  });
  // rear
  add(bevBox(1.8, 0.14, 0.06, 0.02), brake, 0, 0.9, -2.76).castShadow = false;
  both((s) => {
    add(bevBox(0.28, 0.36, 0.08, 0.03), brake, s * 0.75, 0.82, -2.76).castShadow = false;
    add(new THREE.CylinderGeometry(0.16, 0.18, 0.55, 12).rotateX(Math.PI / 2), m.chrome, s * 0.6, 0.44, -2.85);
  });
  add(bevBox(2.0, 0.2, 0.2, 0.05), m.chrome, 0, 0.42, -2.82);
  licensePlate(K, 'R.I.P.', 0.62, -2.9, 0.7);
  add(new THREE.CylinderGeometry(0.62, 0.7, 0.2, 16), m.armor, lay.turret[0], lay.turret[1] - 0.06, lay.turret[2]);
  both((s) => add(bevBox(0.46, 0.12, 1.0, 0.03), m.armor, s * lay.side[0], lay.side[1] - 0.1, lay.side[2]));
}

// ------------------------------------------------------------------------------------------ buggy
function buildBuggy(K: Ctx) {
  const { m, lay, add, both, brake } = K;
  const tub = loft(smoothStations([
    st(-1.95, 0.62, 0.5, 0.8, 0.9, 0.4), st(-1.5, 0.74, 0.44, 0.82, 0.9, 0.5), st(0.2, 0.78, 0.42, 0.8, 0.86, 0.55), st(1.2, 0.72, 0.44, 0.78, 0.84, 0.5), st(2.0, 0.6, 0.5, 0.7, 0.76, 0.4),
  ], 18));
  add(tub, m.paint);
  add(new THREE.BoxGeometry(1.3, 0.1, 4.2), m.dark, 0, 0.4, 0);
  // roll cage
  const bar = (a: THREE.Vector3, b: THREE.Vector3, r = 0.055) => add(tubeBetween(a, b, r, 8), m.steel);
  both((s) => {
    add(pathTube([V(s * 0.72, 0.9, 0.95), V(s * 0.68, 1.5, 0.45), V(s * 0.62, 1.86, -0.15), V(s * 0.66, 1.5, -0.9), V(s * 0.74, 0.9, -1.35)], 0.06, 24, 8), m.steel);
    bar(V(s * 0.66, 1.5, 0.45), V(s * 0.66, 1.5, -0.9), 0.045);
    add(pathTube([V(s * 0.85, 0.5, 0.95), V(s * 0.95, 0.55, 0.0), V(s * 0.85, 0.5, -1.0)], 0.06, 14), m.steel); // nerf bar
  });
  bar(V(-0.62, 1.86, -0.15), V(0.62, 1.86, -0.15));
  bar(V(-0.68, 1.5, 0.45), V(0.68, 1.5, 0.45), 0.045);
  bar(V(-0.66, 1.5, -0.9), V(0.66, 1.5, -0.9), 0.045);
  // seat + driver
  add(bevBox(0.62, 0.55, 0.16, 0.05), m.dark, 0, 1.2, -0.55, -0.15);
  add(bevBox(0.62, 0.14, 0.55, 0.05), m.dark, 0, 0.88, -0.25);
  const helmet = add(new THREE.SphereGeometry(0.28, 12, 9), m.second, 0, 1.55, -0.3);
  helmet.scale.set(1, 1.05, 1.1);
  add(new THREE.BoxGeometry(0.42, 0.13, 0.12), m.glass, 0, 1.55, -0.03);
  // engine
  add(bevBox(0.95, 0.5, 0.75, 0.06), m.chrome, 0, 1.05, -1.5);
  for (const x of [-0.3, -0.1, 0.1, 0.3]) add(new THREE.CylinderGeometry(0.07, 0.11, 0.55, 8), m.chrome, x, 1.5, -1.62, -0.35);
  both((s) => add(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 10).rotateX(Math.PI / 2), m.dark, s * 0.38, 1.05, -2.05));
  // shocks & arms
  for (const z of [lay.wheelsF, lay.wheelsR]) both((s) => {
    add(tubeBetween(V(s * 0.55, 0.55, z), V(s * 1.0, 0.7, z), 0.045, 6), m.steel);
    add(tubeBetween(V(s * 0.85, 0.72, z), V(s * 0.85, 1.35, z + (z > 0 ? -0.1 : 0.1)), 0.06, 8), m.accent);
    add(new THREE.TorusGeometry(0.075, 0.02, 5, 10).rotateY(Math.PI / 2), m.gold, s * 0.85, 1.05, z);
  });
  // front nose + bumper + lights
  add(bevBox(1.5, 0.22, 0.2, 0.05), m.armor, 0, 0.6, 2.05);
  headlights(K, 0.82, 1.98, 0.42, true);
  spikeRow(K, [[-0.6, 0.62, 2.14], [-0.2, 0.62, 2.16], [0.2, 0.62, 2.16], [0.6, 0.62, 2.14]], () => [Math.PI / 2, 0, 0], 0.06, 0.5);
  // light bar on the cage
  add(bevBox(1.3, 0.14, 0.16, 0.03), m.dark, 0, 1.96, 0.05);
  for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8).rotateX(Math.PI / 2), m.lampAmber, -0.5 + i * 0.25, 1.96, 0.16);
  fenders(K, m.paintDS, m.armor);
  // rear
  both((s) => add(bevBox(0.28, 0.14, 0.06, 0.02), brake, s * 0.5, 0.82, -2.0).castShadow = false);
  licensePlate(K, 'WHEE', 0.66, -2.02, 0.6);
  add(new THREE.CylinderGeometry(0.5, 0.56, 0.16, 14), m.armor, lay.turret[0], 1.68, lay.turret[2]);
  add(new THREE.BoxGeometry(0.9, 0.06, 0.06), m.steel, 0, 1.8, -0.35);
  both((s) => add(bevBox(0.44, 0.1, 0.8, 0.03), m.armor, s * lay.side[0], lay.side[1] - 0.1, lay.side[2]));
}

// ------------------------------------------------------------------------------------------ truck
function buildTruck(K: Ctx) {
  const { m, lay, add, both, brake } = K;
  add(bevBox(1.7, 0.36, 5.4, 0.06), m.dark, 0, 0.92, 0);
  both((s) => add(bevBox(0.16, 0.3, 5.5, 0.03), m.armor, s * 0.9, 0.96, 0));
  const hull = loft(smoothStations([
    st(-2.68, 1.12, 1.0, 1.55, 1.62, 0.9), st(-2.5, 1.2, 0.92, 1.6, 1.68, 1.0), st(-0.2, 1.22, 0.92, 1.66, 1.72, 1.05), st(1.2, 1.2, 0.92, 1.64, 1.78, 0.98),
    st(2.2, 1.14, 0.98, 1.5, 1.66, 0.82), st(2.68, 1.05, 1.06, 1.36, 1.5, 0.7),
  ], 22));
  add(hull, m.paint);
  const cab = loft(smoothStations([cabSt(1.15, 1.0, 1.7, 0.96, 1.78), cabSt(0.9, 1.02, 1.72, 0.92, 2.5), cabSt(0.4, 1.02, 1.72, 0.92, 2.62), cabSt(-0.4, 1.02, 1.72, 0.9, 2.62), cabSt(-0.5, 1.0, 1.72, 0.88, 2.2)], 14), 0.93);
  add(cab, [m.glass, m.paint]);
  add(cabin_roof(), m.armor, 0, 2.66, 0.35);
  // bed armour
  both((s) => {
    add(bevBox(0.14, 0.7, 2.3, 0.03), m.armor, s * 1.2, 2.0, -1.5);
    add(rivets(Array.from({ length: 9 }, (_, i) => [s * 1.28, 2.18, -2.4 + i * 0.28] as [number, number, number]), 0.035), m.chrome);
  });
  add(bevBox(2.4, 0.7, 0.14, 0.03), m.armor, 0, 2.0, -2.7);
  // exhaust stacks
  both((s) => {
    add(new THREE.CylinderGeometry(0.15, 0.15, 1.9, 10), m.chrome, s * 0.85, 2.7, -0.55);
    add(new THREE.CylinderGeometry(0.2, 0.14, 0.18, 10), m.dark, s * 0.85, 3.7, -0.55);
  });
  // light bar
  add(bevBox(1.8, 0.16, 0.2, 0.03), m.dark, 0, 2.82, 0.55);
  for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8).rotateX(Math.PI / 2), m.lampAmber, -0.72 + i * 0.29, 2.82, 0.67);
  // front: grille, lamps, bull bar
  add(bevBox(1.5, 0.7, 0.12, 0.05), m.dark, 0, 1.5, 2.66);
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(1.4, 0.05, 0.05), m.steel, 0, 1.3 + i * 0.13, 2.74);
  headlights(K, 1.74, 2.6, 0.82, true);
  add(bevBox(2.5, 0.42, 0.3, 0.06), m.armor, 0, 1.08, 2.85);
  for (const x of [-1, -0.5, 0, 0.5, 1]) add(pathTube([V(x, 1.0, 2.9), V(x, 1.1, 3.25), V(x, 1.75, 3.25), V(x, 1.9, 2.75)], 0.07, 14), m.steel);
  spikeRow(K, [[-1.05, 1.1, 3.05], [-0.55, 1.1, 3.1], [0, 1.1, 3.12], [0.55, 1.1, 3.1], [1.05, 1.1, 3.05]], () => [Math.PI / 2, 0, 0], 0.09, 0.8);
  fenders(K, m.paintDS, m.armor);
  // steps + skirts
  both((s) => add(bevBox(0.3, 0.1, 2.6, 0.02), m.armor, s * 1.3, 1.02, 0.1));
  // rear
  both((s) => add(bevBox(0.38, 0.22, 0.08, 0.03), brake, s * 0.9, 1.55, -2.72).castShadow = false);
  licensePlate(K, 'SIEGE', 1.24, -2.8, 0.8);
  add(new THREE.CylinderGeometry(0.66, 0.74, 0.2, 16), m.armor, lay.turret[0], lay.turret[1] - 0.06, lay.turret[2]);
  both((s) => add(bevBox(0.5, 0.14, 1.1, 0.03), m.armor, s * lay.side[0], lay.side[1] - 0.1, lay.side[2]));
}

function cabin_roof() {
  return bevBox(1.6, 0.1, 1.5, 0.04);
}

// ------------------------------------------------------------------------------------------ assemble
export function buildCar(def: ChassisDef): CarModel {
  const lay = LAYOUTS[def.kind];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const m = mats(def);
  const brake = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1020).multiplyScalar(2.2), toneMapped: false });
  const add: Ctx['add'] = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  };
  const both = (fn: (s: number) => void) => {
    fn(1);
    fn(-1);
  };
  const K: Ctx = { body, m, lay, brake, def, add, both };
  if (def.kind === 'muscle') buildMuscle(K);
  else if (def.kind === 'hearse') buildHearse(K);
  else if (def.kind === 'buggy') buildBuggy(K);
  else buildTruck(K);
  bakeStatic(body);

  // wheels
  const wheels: WheelRef[] = [];
  const wheelSlot: THREE.Group[] = [];
  for (const [z, r, front] of [[lay.wheelsF, lay.rF, true], [lay.wheelsR, lay.rR, false]] as const) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * lay.wx, r, z);
      const spin = new THREE.Group();
      const slot = new THREE.Group();
      slot.add(buildWheel(r, lay.wWidth, 0, 0, s));
      spin.add(slot);
      pivot.add(spin);
      root.add(pivot);
      wheels.push({ pivot, spin, front, side: s, radius: r, x: s * lay.wx, z });
      wheelSlot.push(slot);
    }
  }

  const turretMount = new THREE.Group();
  turretMount.position.set(...lay.turret);
  body.add(turretMount);
  const sideMounts = [-1, 1].map((s) => {
    const mnt = new THREE.Group();
    mnt.position.set(s * lay.side[0], lay.side[1], lay.side[2]);
    body.add(mnt);
    return mnt;
  });
  const plowMount = new THREE.Group();
  plowMount.position.set(0, def.kind === 'truck' ? 0.55 : 0, lay.plowZ);
  body.add(plowMount);

  return {
    root,
    body,
    wheels,
    turretMount,
    sideMounts,
    plowMount,
    exhausts: lay.exhaust.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    rearWheelZ: lay.wheelsR,
    halfWidth: lay.W / 2,
    length: lay.L,
    kind: def.kind,
    wheelSlot,
    plowGroup: null,
    brakeLights: brake,
  };
}

export function setCarWheels(model: CarModel, item: Item | null) {
  const lay = LAYOUTS[model.kind];
  model.wheels.forEach((w, i) => {
    const slot = model.wheelSlot[i];
    slot.clear();
    const variant = item ? item.variant : 0;
    const mult = item?.special === 'titanWheels' ? 1.2 : 1;
    slot.add(buildWheel(w.radius * mult, lay.wWidth * mult, variant, item?.rarity ?? 0, w.side));
  });
}

export function setCarPlow(model: CarModel, item: Item | null) {
  if (model.plowGroup) model.plowMount.remove(model.plowGroup);
  model.plowGroup = null;
  if (!item) return;
  const g = buildPlow(item.rarity === 4 ? 4 : item.variant, item.rarity, LAYOUTS[model.kind].W);
  model.plowMount.add(g);
  model.plowGroup = g;
}
