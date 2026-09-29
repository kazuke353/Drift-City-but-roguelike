import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ChassisDef, ChassisKind } from '../game/Cars';
import { toon, glow } from '../render/Toon';
import { liveryTexture } from '../render/Textures';
import type { Item } from '../loot/Items';
import { RARITY } from '../loot/Items';

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

const M = {
  glass: () => toon(0x1a2436, { emissive: 0x0a1830, emissiveIntensity: 0.6 }),
  chrome: () => toon(0xc8ccd6),
  trim: () => toon(0x16161a),
  tire: () => toon(0x19191c),
  gold: () => toon(0xe0aa2a, { emissive: 0x3a2400, emissiveIntensity: 0.5 }),
  head: () => glow(0xfff0c0, 3.5),
};

/** Planar livery projection: top faces use the upper half of the atlas, sides the lower half. */
function liveryUV(g: THREE.BufferGeometry, L: number, W: number, H: number, z0: number, y0: number) {
  g.computeVertexNormals();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = n.getY(i);
    const u = (z - z0) / L;
    let v: number;
    if (ny > 0.55) v = 0.5 + ((x + W / 2) / W) * 0.5;
    else v = Math.max(0, Math.min(0.5, ((y - y0) / H) * 0.5));
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Extrude a side profile (x=length, y=height) across the width; result: length on +Z. */
function profile(points: [number, number][], width: number, bevel = 0.08) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true;
  return m;
}

function plateTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8d890';
  g.fillRect(0, 0, 128, 48);
  g.strokeStyle = '#111';
  g.lineWidth = 5;
  g.strokeRect(2, 2, 124, 44);
  g.fillStyle = '#111';
  g.font = 'bold 30px "Anton", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWheel(radius: number, width: number, variant: number, rarity: number): THREE.Group {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), M.tire());
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  g.add(tire);
  // tread blocks (chunky offroad look)
  const treadGeo: THREE.BufferGeometry[] = [];
  const nT = variant === 1 ? 0 : 12;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * Math.PI * 2;
    const b = new THREE.BoxGeometry(width * 1.02, 0.12, radius * 0.28);
    b.translate(0, radius, 0);
    b.rotateX(a);
    treadGeo.push(b);
  }
  if (treadGeo.length) {
    const tr = new THREE.Mesh(mergeGeometries(treadGeo)!, M.tire());
    g.add(tr);
  }
  const rimMat = variant === 3 || variant === 4 ? toon(0x2a1a40, { emissive: RARITY[Math.max(3, rarity)].color, emissiveIntensity: 1.5 }) : rarity >= 3 ? M.gold() : M.chrome();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.04, 12), rimMat);
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  // spokes
  const sg: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.BoxGeometry(width + 0.08, radius * 0.95, 0.09);
    s.rotateX((i / 5) * Math.PI);
    sg.push(s);
  }
  const spokes = new THREE.Mesh(mergeGeometries(sg)!, M.trim());
  g.add(spokes);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, width + 0.14, 8), rimMat);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  if (variant === 2 || variant === 4) {
    for (const s of [-1, 1]) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 6), M.chrome());
      sp.rotation.z = -s * Math.PI / 2;
      sp.position.x = s * (width / 2 + 0.3);
      g.add(sp);
    }
  }
  return g;
}

export function buildPlow(variant: number, rarity: number, width: number): THREE.Group {
  const g = new THREE.Group();
  const iron = toon(0x3a3a42);
  const accent = rarity >= 2 ? toon(0x222222, { emissive: RARITY[rarity].color, emissiveIntensity: 1.8 }) : toon(0x6a4a2a);
  switch (variant) {
    case 0: {
      const b = box(width * 1.05, 0.6, 0.5, iron, 0, 0.62, 0.25);
      g.add(b);
      for (const x of [-0.7, 0, 0.7]) g.add(box(0.12, 0.64, 0.54, accent, x * width * 0.5, 0.62, 0.25));
      const tip = cyl(0.25, 0.3, 0.6, iron);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(0, 0.62, 0.7);
      g.add(tip);
      break;
    }
    case 1: {
      const wedge = profile([[0, 0.2], [0.95, 0.2], [0, 1.25]], width * 1.12, 0.03);
      const m = new THREE.Mesh(wedge, iron);
      m.castShadow = true;
      g.add(m);
      g.add(box(width * 1.1, 0.1, 0.1, accent, 0, 0.24, 0.92));
      break;
    }
    case 2: {
      g.add(box(width, 0.5, 0.25, iron, 0, 0.62, 0.1));
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.9, 6), rarity >= 2 ? accent : toon(0xc8ccd6));
        sp.rotation.x = Math.PI / 2;
        sp.position.set((i / 4 - 0.5) * width * 0.85, 0.62 + (i % 2) * 0.12, 0.6);
        sp.castShadow = true;
        g.add(sp);
      }
      break;
    }
    case 3: {
      const plate = profile([[0, 0.25], [0.35, 0.3], [0.45, 0.85], [0.2, 1.2], [0, 1.2]], width * 1.02, 0.05);
      g.add(new THREE.Mesh(plate, toon(0xc8b070)));
      const cross = box(0.14, 0.7, 0.06, M.gold(), 0, 0.72, 0.47);
      const cross2 = box(0.5, 0.14, 0.06, M.gold(), 0, 0.85, 0.47);
      g.add(cross, cross2);
      break;
    }
    default: {
      // legendary: rusted drill of faith
      g.add(box(width, 0.55, 0.3, toon(0x6a3a1a), 0, 0.62, 0.1));
      const drill = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.6, 10), toon(0x8a5a2a, { emissive: 0xffa51f, emissiveIntensity: 0.6 }));
      drill.rotation.x = Math.PI / 2;
      drill.position.set(0, 0.65, 0.95);
      drill.name = 'drill';
      g.add(drill);
      for (const s of [-1, 1]) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 6), toon(0xc8ccd6));
        sp.rotation.x = Math.PI / 2;
        sp.position.set(s * width * 0.4, 0.62, 0.5);
        g.add(sp);
      }
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
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

export function buildCar(def: ChassisDef): CarModel {
  const lay = LAYOUTS[def.kind];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const c = def.colors;
  const livery = liveryTexture(c.primary, c.secondary, c.accent, c.style, def.id.length * 13, c.emblem);
  const paint = toon(0xffffff, { map: livery });
  const plain = toon(c.primary);
  const second = toon(c.secondary);
  const glass = M.glass();
  const chrome = M.chrome();
  const trim = M.trim();
  const add = (m: THREE.Object3D) => {
    m.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
    body.add(m);
    return m;
  };
  const brake = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1020).multiplyScalar(2.2), toneMapped: false });

  if (def.kind === 'muscle') {
    const g = liveryUV(profile([[-2.35, 0.3], [2.3, 0.3], [2.44, 0.55], [2.4, 0.8], [2.1, 0.92], [0.9, 1.0], [-1.3, 1.03], [-2.2, 1.0], [-2.44, 0.82], [-2.46, 0.5]], 2.2, 0.1), 4.9, 2.3, 1.1, -2.45, 0.3);
    add(new THREE.Mesh(g, paint));
    const cab = profile([[0.85, 0.98], [0.1, 1.5], [-0.85, 1.53], [-1.45, 1.0]], 1.78, 0.07);
    add(new THREE.Mesh(cab, glass));
    // roof plate as body colour
    const roof = box(1.74, 0.08, 0.98, plain, 0, 1.56, -0.38);
    add(roof);
    // blower
    add(box(0.62, 0.34, 0.8, chrome, 0, 1.12, 1.25));
    add(box(0.7, 0.14, 0.9, trim, 0, 1.33, 1.25));
    for (const s of [-0.16, 0.16]) {
      const st = cyl(0.1, 0.12, 0.35, chrome, 8);
      st.position.set(s, 1.5, 1.35);
      add(st);
    }
    // spoiler
    add(box(2.3, 0.07, 0.42, second, 0, 1.45, -2.18));
    for (const s of [-0.75, 0.75]) add(box(0.07, 0.42, 0.14, trim, s, 1.22, -2.12));
    for (const s of [-1, 1]) add(box(0.06, 0.3, 0.5, second, s * 1.15, 1.5, -2.18));
    // wheel arch flares
    for (const [z, r] of [[lay.wheelsF, lay.rF], [lay.wheelsR, lay.rR]] as const) {
      for (const s of [-1, 1]) {
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.14, r + 0.14, 0.34, 12, 1, true, 0, Math.PI), toon(c.primary, { side: THREE.DoubleSide }));
        fl.rotation.z = Math.PI / 2;
        fl.position.set(s * 1.05, r + 0.02, z);
        add(fl);
      }
    }
    // grille + lights
    add(box(1.3, 0.3, 0.08, trim, 0, 0.62, 2.45));
    for (const s of [-0.72, 0.72]) {
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), M.head());
      hl.position.set(s, 0.66, 2.47);
      add(hl);
    }
    for (const s of [-0.68, 0.68]) add(box(0.6, 0.14, 0.05, brake, s, 0.83, -2.47));
    add(box(2.0, 0.08, 0.06, trim, 0, 0.35, 2.45));
  } else if (def.kind === 'hearse') {
    const g = liveryUV(profile([[-2.7, 0.3], [2.55, 0.3], [2.68, 0.55], [2.64, 0.8], [2.35, 0.92], [1.15, 1.0], [-2.55, 1.02], [-2.74, 0.84], [-2.76, 0.5]], 2.2, 0.1), 5.5, 2.3, 1.1, -2.75, 0.3);
    add(new THREE.Mesh(g, paint));
    const cab = profile([[1.1, 0.98], [0.4, 1.58], [-0.1, 1.6], [-0.1, 1.0]], 1.8, 0.06);
    add(new THREE.Mesh(cab, glass));
    const coffin = profile([[-0.12, 0.98], [-0.12, 1.66], [-2.5, 1.66], [-2.7, 1.0]], 2.0, 0.08);
    add(new THREE.Mesh(coffin, plain));
    // side windows with purple curtains
    const curtain = toon(0x4a1a6a, { emissive: 0x2a0a40, emissiveIntensity: 0.6 });
    for (const s of [-1, 1]) add(box(0.04, 0.42, 1.5, curtain, s * 1.04, 1.32, -1.2));
    // gold trim + landau bars
    const gold = M.gold();
    for (const s of [-1, 1]) {
      add(box(0.05, 0.06, 5.2, gold, s * 1.12, 1.0, -0.1));
      const lb = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 6, 12, Math.PI), gold);
      lb.rotation.y = Math.PI / 2;
      lb.position.set(s * 1.05, 1.3, -2.2);
      add(lb);
    }
    add(box(2.0, 0.08, 2.5, gold, 0, 1.7, -1.3));
    // roof coffin ornaments
    for (const z of [-0.3, -2.4]) for (const s of [-0.9, 0.9]) {
      const orn = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), gold);
      orn.position.set(s, 1.82, z);
      add(orn);
    }
    add(box(1.4, 0.32, 0.08, trim, 0, 0.62, 2.7));
    for (const s of [-0.75, 0.75]) {
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), M.head());
      hl.position.set(s, 0.68, 2.72);
      add(hl);
    }
    for (const s of [-0.75, 0.75]) add(box(0.3, 0.3, 0.05, brake, s, 0.8, -2.78));
  } else if (def.kind === 'buggy') {
    const g = liveryUV(profile([[-1.9, 0.5], [1.7, 0.5], [2.02, 0.78], [1.25, 0.98], [-1.35, 0.98], [-1.95, 0.82]], 1.55, 0.08), 4.0, 1.7, 0.6, -2.0, 0.5);
    add(new THREE.Mesh(g, paint));
    // roll cage
    const bar = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
      const len = a.distanceTo(b);
      const m = cyl(0.06, 0.06, len, trim, 6);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      add(m);
    };
    for (const s of [-1, 1]) {
      bar(s * 0.7, 0.98, 0.9, s * 0.6, 1.75, 0.2);
      bar(s * 0.6, 1.75, 0.2, s * 0.6, 1.75, -0.9);
      bar(s * 0.6, 1.75, -0.9, s * 0.7, 0.98, -1.35);
    }
    bar(-0.6, 1.75, 0.2, 0.6, 1.75, 0.2);
    bar(-0.6, 1.75, -0.9, 0.6, 1.75, -0.9);
    bar(-0.6, 1.75, -0.35, 0.6, 1.75, -0.35);
    // front bumper tube
    bar(-0.9, 0.6, 2.05, 0.9, 0.6, 2.05);
    bar(-0.9, 0.6, 2.05, -0.6, 0.8, 1.7);
    bar(0.9, 0.6, 2.05, 0.6, 0.8, 1.7);
    // seat & driver helmet
    add(box(0.6, 0.5, 0.2, trim, 0, 1.2, -0.55));
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), toon(c.secondary));
    helmet.position.set(0, 1.45, -0.3);
    add(helmet);
    const visor = box(0.42, 0.14, 0.1, glass, 0, 1.45, -0.02);
    add(visor);
    // exposed engine
    add(box(0.9, 0.5, 0.7, chrome, 0, 1.1, -1.45));
    for (const s of [-0.28, 0.28]) {
      const st = cyl(0.07, 0.07, 0.6, trim, 6);
      st.rotation.x = -0.6;
      st.position.set(s, 1.2, -1.95);
      add(st);
    }
    // suspension arms
    for (const [z] of [[lay.wheelsF], [lay.wheelsR]] as const) for (const s of [-1, 1]) add(box(0.5, 0.08, 0.12, trim, s * 0.9, 0.62, z));
    for (const s of [-0.45, 0.45]) {
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), M.head());
      hl.position.set(s, 0.82, 1.96);
      hl.rotation.x = -0.3;
      add(hl);
    }
    for (const s of [-0.5, 0.5]) add(box(0.25, 0.12, 0.05, brake, s, 0.8, -1.97));
  } else {
    // truck
    const g = liveryUV(profile([[-2.6, 0.95], [2.5, 0.95], [2.68, 1.3], [2.62, 1.65], [1.15, 1.78], [-2.62, 1.78]], 2.4, 0.1), 5.3, 2.5, 0.9, -2.65, 0.95);
    add(new THREE.Mesh(g, paint));
    const cab = profile([[1.12, 1.72], [0.92, 2.55], [-0.35, 2.6], [-0.45, 1.72]], 2.1, 0.08);
    add(new THREE.Mesh(cab, plain));
    for (const s of [-1, 1]) add(box(0.04, 0.5, 1.0, glass, s * 1.06, 2.2, 0.35));
    add(box(1.8, 0.55, 0.05, glass, 0, 2.22, 1.02)).rotation.x = -0.22;
    // chassis frame
    add(box(1.6, 0.3, 5.0, trim, 0, 0.9, 0));
    // bed armor plates
    for (const s of [-1, 1]) add(box(0.12, 0.6, 2.2, toon(0x4a4a52), s * 1.18, 2.05, -1.4));
    add(box(2.3, 0.6, 0.12, toon(0x4a4a52), 0, 2.05, -2.55));
    // exhaust stacks
    for (const s of [-0.75, 0.75]) {
      const st = cyl(0.13, 0.13, 1.6, chrome, 8);
      st.position.set(s, 2.2, 0.05);
      add(st);
    }
    // roof lights
    add(box(1.6, 0.14, 0.2, trim, 0, 2.7, 0.3));
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), glow(0xffd24a, 3));
      l.position.set(-0.6 + i * 0.4, 2.7, 0.41);
      add(l);
    }
    for (const s of [-0.85, 0.85]) {
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), M.head());
      hl.position.set(s, 1.45, 2.66);
      add(hl);
    }
    add(box(1.2, 0.35, 0.08, trim, 0, 1.4, 2.66));
    for (const s of [-0.9, 0.9]) add(box(0.4, 0.2, 0.05, brake, s, 1.5, -2.66));
  }

  // license plate
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), new THREE.MeshBasicMaterial({ map: plateTexture(def.kind === 'hearse' ? 'R.I.P.' : def.kind === 'truck' ? 'SIEGE' : def.kind === 'buggy' ? 'WHEE' : 'LOOT-4U') }));
  plate.position.set(0, def.kind === 'truck' ? 1.2 : 0.55, -(lay.L / 2) - 0.03);
  plate.rotation.y = Math.PI;
  body.add(plate);

  // exhaust pipes
  for (const [x, y, z] of lay.exhaust) {
    if (def.kind === 'truck') continue;
    const e = cyl(0.1, 0.12, 0.4, chrome, 8);
    e.rotation.x = Math.PI / 2;
    e.position.set(x, y, z + 0.1);
    add(e);
  }

  // wheels
  const wheels: WheelRef[] = [];
  const wheelSlot: THREE.Group[] = [];
  for (const [z, r, front] of [[lay.wheelsF, lay.rF, true], [lay.wheelsR, lay.rR, false]] as const) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * lay.wx, r, z);
      const spin = new THREE.Group();
      const slot = new THREE.Group();
      slot.add(buildWheel(r, lay.wWidth, 0, 0));
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
    const m = new THREE.Group();
    m.position.set(s * lay.side[0], lay.side[1], lay.side[2]);
    body.add(m);
    return m;
  });
  const plowMount = new THREE.Group();
  plowMount.position.set(0, def.kind === 'truck' ? 0.55 : 0, lay.plowZ);
  body.add(plowMount);

  // a tiny ground shadow blob helps readability when airborne
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
    slot.add(buildWheel(w.radius * mult, lay.wWidth * mult, variant, item?.rarity ?? 0));
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
