import * as THREE from 'three';
import type { EnemyVisual } from './Enemy';
import { rimToon, glow } from '../render/Toon';
import { woodTexture } from '../render/Textures';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { V3, boneTexture, membraneTexture, taperTube, boneGeo, skull, jawGeo, jawArc, membraneGeo, spikes } from './BossKit';

/** Sculpted, rim-lit models for the regular enemy roster (part names match the AI/anim code). */

function pv(x: number, y: number, z: number, parent: THREE.Object3D) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
/** Bone hanging down from a pivot (−Y). */
function hangBone(parent: THREE.Object3D, len: number, r: number, mat: THREE.Material) {
  const m = new THREE.Mesh(boneGeo(len, r), mat);
  m.rotation.x = Math.PI;
  m.castShadow = true;
  parent.add(m);
  return m;
}
const lathe = (pts: [number, number][], seg = 14) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

const geoCache = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
  let v = geoCache.get(key) as T | undefined;
  if (!v) geoCache.set(key, (v = make()));
  return v;
}


/** Human-ish skull: round cranium, flat face, deep sockets, nasal cavity and cheekbones (~s wide). */
export function humanSkull(s: number) {
  const g = new THREE.SphereGeometry(1, 32, 24);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const bump = (n: THREE.Vector3, d: THREE.Vector3, ang: number, amt: number) => {
    const a = Math.acos(THREE.MathUtils.clamp(n.dot(d), -1, 1));
    if (a >= ang) return 0;
    const k = 1 - a / ang;
    return amt * k * k;
  };
  const D = (x: number, y: number, z: number) => V3(x, y, z).normalize();
  const eyeDirs = [D(-0.42, 0.02, 0.9), D(0.42, 0.02, 0.9)];
  const feats = (n: THREE.Vector3) => {
    let r = 1;
    for (const sx of [-1, 1]) {
      r += bump(n, eyeDirs[sx < 0 ? 0 : 1], 0.36, -0.36);
      r += bump(n, D(sx * 0.78, -0.3, 0.55), 0.35, 0.1);
      r += bump(n, D(sx, 0.2, 0), 0.5, -0.07);
      r += bump(n, D(sx * 0.36, 0.34, 0.86), 0.24, 0.08);
    }
    r += bump(n, D(0, -0.34, 1), 0.17, -0.3);
    return r;
  };
  const deform = (n: THREE.Vector3, r: number) => {
    let x = n.x * r, y = n.y * r, z = n.z * r;
    if (y < -0.1) {
      const f = Math.min(1, (-0.1 - y) / 0.9);
      x *= 1 - 0.34 * f;
      z = z > 0 ? z * (1 - 0.08 * f) : z * (1 - 0.5 * f);
    }
    if (z > 0.8) z = 0.8 + (z - 0.8) * 0.35;
    if (y < -0.72) y = -0.72 + (y + 0.72) * 0.25;
    return V3(x * 0.46 * s, y * 0.52 * s, z * 0.54 * s);
  };
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const p = deform(n, feats(n));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  const eyes = eyeDirs.map((d) => deform(d, 1 - 0.36 * 0.7));
  const teeth: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = -0.75 + (i / 7) * 1.5;
    teeth.push(deform(D(Math.sin(a) * 0.62, -0.74, Math.cos(a) * 0.62), 1));
  }
  return { geo: g, eyes, teeth };
}

const M = {
  bone: () => rimToon(0xffffff, 0xffe0b0, { map: boneTexture('#c9bb98', '#7d6f52', 'boneGrime'), detail: { kind: 'hide', scale: 2.2, strength: 0.6 } }),
  boneD: () => rimToon(0xa89670, 0xffd8a0, { detail: { kind: 'hide', scale: 2.2, strength: 0.6 } }),
  rust: () => rimToon(0x6a5a4e, 0xffc090, { detail: { kind: 'plate', scale: 0.9, strength: 1.0 } }),
  steel: () => rimToon(0x6e7688, 0xc0d8ff, { detail: { kind: 'plate', scale: 0.9, strength: 0.9 } }),
  red: () => rimToon(0x8e1420, 0xff8080, { detail: { kind: 'hide', scale: 1.6, strength: 0.7 } }),
  leather: () => rimToon(0x5a3a22, 0xffb080, { detail: { kind: 'hide', scale: 2.0, strength: 0.9 } }),
  eye: () => glow(0xff2a1a, 4),
};

// ------------------------------------------------------------------ skeleton
function skeletonModelRaw(kind: 'sword' | 'bow' | 'knight'): EnemyVisual {
  const root = new THREE.Group();
  const B = M.bone(), D = M.boneD();
  const hips = pv(0, 1.62, 0, root);
  // pelvis
  mesh(cached('pelRing', () => new THREE.TorusGeometry(0.19, 0.07, 6, 14)), B, hips, 0, -0.04, 0.02, Math.PI / 2, 0, 0);
  for (const s of [-1, 1]) {
    const wing = mesh(cached('pelWing', () => new THREE.SphereGeometry(0.24, 12, 8)), B, hips, s * 0.23, 0.1, -0.03, 0, s * 0.65, 0);
    wing.scale.set(1, 0.85, 0.32);
    mesh(cached('hipBall', () => new THREE.SphereGeometry(0.09, 8, 6)), D, hips, s * 0.27, -0.06, 0);
  }
  mesh(cached('sacrum', () => new THREE.ConeGeometry(0.12, 0.3, 5)), D, hips, 0, 0, -0.16, Math.PI, 0, 0);
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = pv(s * 0.27, -0.05, 0, hips);
    hangBone(leg, 0.82, 0.075, B);
    const knee = pv(0, -0.82, 0, leg);
    hangBone(knee, 0.74, 0.065, B);
    mesh(cached('foot', () => new THREE.BoxGeometry(0.22, 0.1, 0.42)), D, knee, 0, -0.76, 0.1);
    legs.push(leg);
    knees.push(knee);
  }
  const torso = pv(0, 0.12, 0, hips);
  // spine + ribcage
  mesh(cached('spine', () => taperTube([V3(0, 0, -0.08), V3(0, 0.5, -0.14), V3(0, 1.05, -0.06)], 0.07, 0.06, 10, 6)), D, torso);
  for (let i = 0; i < 4; i++) {
    const y = 0.42 + i * 0.16, w = 0.36 - Math.abs(i - 1.2) * 0.04;
    for (const s of [-1, 1]) {
      mesh(cached(`rib${i}${s}`, () => taperTube([V3(0, y, -0.12), V3(s * w * 0.8, y + 0.02, -0.08), V3(s * w, y - 0.06, 0.1), V3(s * w * 0.55, y - 0.1, 0.26), V3(s * 0.05, y - 0.08, 0.28)], 0.045, 0.035, 10, 5)), B, torso);
    }
  }
  mesh(cached('sternum', () => new THREE.BoxGeometry(0.1, 0.55, 0.06)), D, torso, 0, 0.62, 0.28);
  mesh(cached('clav', () => taperTube([V3(-0.55, 1.08, 0), V3(0, 1.12, 0.12), V3(0.55, 1.08, 0)], 0.06, 0.06, 8, 5)), B, torso);
  // arms
  const arms: THREE.Group[] = [], elbows: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pv(s * 0.56, 1.06, 0, torso);
    mesh(cached('shoulderball', () => new THREE.SphereGeometry(0.1, 8, 6)), D, a);
    hangBone(a, 0.7, 0.065, B);
    const el = pv(0, -0.7, 0, a);
    hangBone(el, 0.62, 0.055, B);
    mesh(cached('hand', () => new THREE.BoxGeometry(0.14, 0.2, 0.12)), D, el, 0, -0.68, 0);
    arms.push(a);
    elbows.push(el);
  }
  if (kind !== 'knight') {
    // scavenged kit: rusted pauldron, harness straps, tattered loincloth
    const rustM = rimToon(0x6a3a26, 0xffb080, { detail: { kind: 'plate', scale: 1.1, strength: 1.1 } });
    const clothM = rimToon(0x3a2418, 0xffa060, { side: THREE.DoubleSide, detail: { kind: 'cloth', scale: 2.4, strength: 1.0 } });
    const pd = mesh(cached('sPaul', () => new THREE.SphereGeometry(0.26, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2)), rustM, torso, 0.58, 1.14, 0);
    pd.scale.set(1.15, 0.85, 1.1);
    for (let i = 0; i < 3; i++) mesh(cached('sPaulSp', () => new THREE.ConeGeometry(0.04, 0.16, 5)), M.steel(), torso, 0.58 + (i - 1) * 0.1, 1.3 - Math.abs(i - 1) * 0.02, (i - 1) * 0.1, 0, 0, -0.2);
    for (const s of [-1, 1]) mesh(cached('sStrap', () => taperTube([V3(s * 0.4, 1.02, 0.2), V3(0, 0.72, 0.3), V3(-s * 0.36, 0.42, 0.24)], 0.035, 0.035, 10, 4)), M.leather(), torso);
    mesh(cached('sBelt', () => new THREE.TorusGeometry(0.28, 0.045, 5, 14)), M.leather(), torso, 0, 0.16, 0.02, Math.PI / 2, 0, 0);
    mesh(cached('sBuckle', () => new THREE.BoxGeometry(0.1, 0.08, 0.04)), rimToon(0xc89a3a, 0xfff0b0), torso, 0, 0.16, 0.3);
    for (let i = 0; i < 3; i++) {
      const strip = mesh(cached('sTatter', () => new THREE.PlaneGeometry(0.13, 0.5)), clothM, hips, (i - 1) * 0.15, -0.34, 0.22 - Math.abs(i - 1) * 0.02, 0.06 * (i - 1), 0, 0);
      strip.position.y = -0.34 - (i === 1 ? 0.06 : 0);
    }
  }
  // sculpted skull with a separate jaw
  const head = pv(0, 1.2, 0.02, torso);
  mesh(cached('neck', () => taperTube([V3(0, -0.1, -0.06), V3(0, 0.2, -0.02)], 0.06, 0.05, 4, 6)), D, head);
  const sk = cached('humanSkull', () => humanSkull(0.78));
  const skM = mesh(sk.geo, B, head, 0, 0.38, 0.02);
  const eye = M.eye();
  for (const e of sk.eyes) mesh(cached('sEye', () => new THREE.SphereGeometry(0.07, 8, 6)), eye, skM, e.x, e.y, e.z);
  for (const t of sk.teeth) mesh(cached('sTooth', () => new THREE.BoxGeometry(0.05, 0.08, 0.05)), B, skM, t.x, t.y - 0.02, t.z - 0.02);
  const jaw = pv(0, 0.05, -0.1, head);
  mesh(cached('sJaw', () => jawGeo(0.44, 0.46, 0.08, 0.08)), D, jaw);
  for (const t of cached('sJawArc', () => jawArc(0.44, 0.46, 8, 0.05))) mesh(cached('sTooth', () => new THREE.BoxGeometry(0.05, 0.08, 0.05)), B, jaw, t.x, 0.03, t.z);
  let weapon: THREE.Object3D | null = null;
  let glowTip: THREE.Object3D | null = null;
  const handR = pv(0, -0.7, 0, elbows[1]);
  const handL = pv(0, -0.7, 0, elbows[0]);
  if (kind === 'sword' || kind === 'knight') {
    const w = new THREE.Group();
    const blade = cached('blade', () => {
      const s = new THREE.Shape([new THREE.Vector2(-0.09, 0), new THREE.Vector2(0.09, 0), new THREE.Vector2(0.08, 1.3), new THREE.Vector2(0, 1.52), new THREE.Vector2(-0.08, 1.3)]);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
      g.translate(0, 0, -0.02);
      return g;
    });
    mesh(blade, M.steel(), w, 0, 0.18, 0);
    mesh(cached('guard', () => new THREE.BoxGeometry(0.46, 0.08, 0.12)), M.rust(), w, 0, 0.16, 0);
    mesh(cached('grip', () => new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6)), M.leather(), w, 0, 0, 0);
    mesh(cached('pommel', () => new THREE.SphereGeometry(0.06, 6, 5)), M.rust(), w, 0, -0.16, 0);
    w.rotation.x = Math.PI / 2;
    handR.add(w);
    weapon = w;
  }
  if (kind === 'knight') {
    const helm = rimToon(0x5a6272, 0xb0c8ff);
    mesh(cached('kHelm', () => lathe([[0.42, 0], [0.46, 0.2], [0.44, 0.45], [0.3, 0.62], [0, 0.66]], 14)), helm, head, 0, 0.22, 0.02);
    mesh(cached('kVisor', () => new THREE.BoxGeometry(0.5, 0.05, 0.1)), glow(0xff3010, 3), head, 0, 0.42, 0.44);
    mesh(cached('kCrest', () => new THREE.BoxGeometry(0.08, 0.3, 0.6)), M.red(), head, 0, 0.9, 0);
    const chest = mesh(cached('kChest', () => lathe([[0.4, 0], [0.5, 0.3], [0.48, 0.6], [0.3, 0.72], [0, 0.74]], 14)), helm, torso, 0, 0.42, 0.05);
    chest.scale.set(1, 1, 0.8);
    for (const s of [-1, 1]) {
      const pd = mesh(cached('kPaul', () => new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), helm, torso, s * 0.58, 1.12, 0);
      pd.scale.set(1.2, 0.8, 1.1);
    }
    const sh = pv(0, -0.35, 0.12, elbows[0]);
    const shield = mesh(cached('kShield', () => lathe([[0, 0], [0.4, 0.02], [0.46, 0.06], [0.44, 0.1]], 16)), M.red(), sh, 0, 0, 0.1, Math.PI / 2, 0, 0);
    shield.scale.set(1, 1, 1.25);
    mesh(cached('kBoss', () => new THREE.SphereGeometry(0.1, 8, 6)), rimToon(0xe0aa2a, 0xfff0b0), sh, 0, 0, 0.2);
  }
  if (kind === 'bow') {
    const bow = new THREE.Group();
    mesh(cached('bowArc', () => taperTube([V3(0, -0.8, 0), V3(0, -0.4, 0.22), V3(0, 0, 0.26), V3(0, 0.4, 0.22), V3(0, 0.8, 0)], 0.04, 0.04, 16, 5)), M.leather(), bow);
    mesh(cached('bowString', () => new THREE.CylinderGeometry(0.008, 0.008, 1.6, 3)), rimToon(0xe8e0d0, 0xffffff), bow);
    const tip = mesh(cached('arrowTip', () => new THREE.ConeGeometry(0.06, 0.25, 4)), glow(0xff5a2a, 5), bow, 0, 0, 0.5, Math.PI / 2, 0, 0);
    tip.visible = false;
    glowTip = tip;
    mesh(cached('arrowShaft', () => new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4)), M.leather(), tip, 0, -0.5, 0);
    // long axis up, arc bulging forward when the arm is raised to draw
    bow.rotation.set(Math.PI / 2, 0, 0);
    handL.add(bow);
    weapon = bow;
    // quiver
    mesh(cached('quiver', () => new THREE.CylinderGeometry(0.1, 0.08, 0.6, 8)), M.leather(), torso, 0.15, 0.8, -0.3, 0.3, 0, -0.3);
  }
  return { root, parts: { hips, torso, head, jaw, legL: legs[0], legR: legs[1], kneeL: knees[0], kneeR: knees[1], armL: arms[0], armR: arms[1], elL: elbows[0], elR: elbows[1], ...(weapon ? { weapon } : {}), ...(glowTip ? { glowTip } : {}) } };
}

// ------------------------------------------------------------------ hellhound
function houndModelRaw(): EnemyVisual {
  const root = new THREE.Group();
  const skin = rimToon(0x3a1a1c, 0xff6040, { emissive: 0x100000, emissiveIntensity: 1, detail: { kind: 'rock', scale: 1.3, strength: 1.1, glow: 0xff4a10, glowIntensity: 1.7 } });
  const dark = rimToon(0x1c0e10, 0xff5030, { detail: { kind: 'fur', scale: 2.4, strength: 0.9 } });
  const crack = glow(0xff4a10, 1.8);
  const hornM = rimToon(0x2a2020, 0xffb080);
  const fang = rimToon(0xf4f0e0, 0xffffff);
  const body = pv(0, 1.35, 0, root);
  // deep chest, tucked waist, muscular haunch
  mesh(cached('hChest', () => new THREE.SphereGeometry(1, 16, 12)), skin, body, 0, 0.02, 0.5).scale.set(0.52, 0.62, 0.72);
  mesh(cached('hWaist', () => taperTube([V3(0, 0.05, 0.4), V3(0, 0.12, -0.2), V3(0, 0.16, -0.62)], 0.46, 0.34, 8, 10)), skin, body);
  mesh(cached('hHaunch', () => new THREE.SphereGeometry(1, 14, 10)), skin, body, 0, 0.12, -0.72).scale.set(0.42, 0.44, 0.46);
  mesh(cached('hNeck', () => taperTube([V3(0, 0.2, 0.75), V3(0, 0.5, 1.05), V3(0, 0.62, 1.25)], 0.4, 0.26, 8, 10)), skin, body);
  // glowing rib cracks
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) mesh(cached('hCrack', () => new THREE.BoxGeometry(0.05, 0.42, 0.05)), crack, body, s * 0.47, -0.02, 0.28 + i * 0.2, 0.25, 0, s * 0.18);
  // spiky mane down the spine
  const mane: THREE.Vector3[] = [], dirs: THREE.Vector3[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    mane.push(V3(0, 0.78 - t * 0.28 + Math.sin(t * 3) * 0.08, 1.05 - t * 1.75));
    dirs.push(V3(0, 1, -0.7 - t * 0.4));
  }
  spikes(body, mane, dirs, 0.1, 0.55, hornM);
  // head
  const head = pv(0, 0.72, 1.4, body);
  const sk = cached('houndSkull', () => skull({ len: 1.05, w: 0.62, h: 0.5, snout: 2.2, socket: 0.22 }));
  mesh(sk.geo, skin, head, 0, 0, 0.2);
  for (const e of sk.eyes) mesh(cached('hEye', () => new THREE.SphereGeometry(0.06, 8, 6)), glow(0xffc020, 1.8), head, e.x, e.y, e.z + 0.2);
  for (const s of [-1, 1]) {
    mesh(cached(`hHorn${s}`, () => taperTube([V3(s * 0.18, 0.18, 0), V3(s * 0.32, 0.36, -0.32), V3(s * 0.3, 0.46, -0.7)], 0.09, 0.01, 10, 6)), hornM, head);
    const ear = mesh(cached('hEar', () => new THREE.ConeGeometry(0.12, 0.4, 4)), dark, head, s * 0.25, 0.18, -0.12, -0.9, 0, s * -0.5);
    ear.scale.set(1, 1, 0.4);
    mesh(cached('hFang', () => new THREE.ConeGeometry(0.035, 0.2, 4)), fang, head, s * 0.1, -0.2, 0.62, Math.PI, 0, 0);
  }
  const jaw = pv(0, -0.17, 0.02, head);
  mesh(cached('hJaw', () => jawGeo(0.62, 0.38, 0.09, 0.09)), dark, jaw);
  for (const t of cached('hJawArc', () => jawArc(0.62, 0.38, 8, 0.05))) mesh(cached('hTooth', () => new THREE.ConeGeometry(0.03, 0.11, 4)), fang, jaw, t.x, 0.05, t.z);
  mesh(cached('hTongue', () => taperTube([V3(0, -0.02, 0.1), V3(0, 0, 0.45), V3(0.05, -0.12, 0.7)], 0.07, 0.04, 8, 5)), rimToon(0xc03040, 0xff90a0), jaw);
  // legs: straight front legs, dog-leg (hocked) hind legs
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.3, 0.55], [0.3, 0.55], [-0.3, -0.72], [0.3, -0.72]]) {
    const front = z > 0;
    const leg = pv(x, -0.12, z, body);
    if (front) {
      mesh(cached('hFU', () => taperTube([V3(0, 0.15, 0), V3(0, -0.3, -0.04), V3(0, -0.6, 0.03)], 0.19, 0.1, 8, 7)), skin, leg);
      mesh(cached('hFL', () => taperTube([V3(0, -0.6, 0.03), V3(0, -0.9, 0.06), V3(0, -1.12, 0.1)], 0.09, 0.07, 6, 6)), dark, leg);
    } else {
      mesh(cached('hHU', () => taperTube([V3(0, 0.2, 0), V3(0, -0.2, 0.18), V3(0, -0.46, 0.22)], 0.24, 0.11, 8, 7)), skin, leg);
      mesh(cached('hHL', () => taperTube([V3(0, -0.46, 0.22), V3(0, -0.72, -0.12), V3(0, -1.12, -0.04)], 0.09, 0.06, 8, 6)), dark, leg);
    }
    mesh(cached('hPaw', () => new THREE.SphereGeometry(0.13, 8, 6)), dark, leg, 0, -1.16, front ? 0.16 : 0.04).scale.set(1, 0.55, 1.4);
    for (const k of [-1, 0, 1]) mesh(cached('hClaw', () => new THREE.ConeGeometry(0.025, 0.12, 4)), fang, leg, k * 0.06, -1.18, front ? 0.34 : 0.22, Math.PI / 2, 0, 0);
    legs.push(leg);
  }
  const tail = pv(0, 0.24, -1.05, body);
  mesh(cached('hTail', () => taperTube([V3(0, 0, 0), V3(0, 0.1, -0.45), V3(0, 0.42, -0.85), V3(0, 0.8, -1.0)], 0.1, 0.03, 12, 6)), skin, tail);
  mesh(cached('hTailFire', () => new THREE.ConeGeometry(0.13, 0.45, 6)), glow(0xff6a20, 2.4), tail, 0, 1.02, -1.02);
  return { root, parts: { body, head, jaw, tail, l0: legs[0], l1: legs[1], l2: legs[2], l3: legs[3] } };
}

// ------------------------------------------------------------------ goblin
function goblinModelRaw(bomb: boolean): EnemyVisual {
  const root = new THREE.Group();
  const skin = rimToon(0x4f9a2c, 0xb0ff70, { rimStrength: 0.6, detail: { kind: 'hide', scale: 2.4, strength: 0.9 } });
  const cloth = rimToon(0x6a3a1a, 0xffb070, { detail: { kind: 'cloth', scale: 2.6, strength: 0.9 } });
  const hips = pv(0, 0.9, 0, root);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const l = pv(s * 0.2, 0, 0, hips);
    mesh(cached('gLeg', () => taperTube([V3(0, 0, 0), V3(0, -0.4, 0.05), V3(0, -0.78, 0)], 0.11, 0.08, 6, 6)), skin, l);
    mesh(cached('gFoot', () => new THREE.SphereGeometry(0.14, 8, 6)), cloth, l, 0, -0.82, 0.1).scale.set(1, 0.6, 1.6);
    legs.push(l);
  }
  const torso = pv(0, 0, 0, hips);
  mesh(cached('gBody', () => lathe([[0.3, -0.05], [0.44, 0.15], [0.48, 0.4], [0.4, 0.62], [0.2, 0.72], [0, 0.74]], 12)), cloth, torso);
  mesh(cached('gBelt', () => new THREE.TorusGeometry(0.45, 0.05, 5, 14)), rimToon(0x2a1a10, 0xffb070), torso, 0, 0.2, 0, Math.PI / 2, 0, 0);
  const head = pv(0, 0.98, 0.06, torso);
  mesh(cached('gHead', () => new THREE.SphereGeometry(0.42, 14, 10)), skin, head).scale.set(1.1, 0.95, 1);
  mesh(cached('gNose', () => new THREE.ConeGeometry(0.1, 0.42, 6)), skin, head, 0, -0.02, 0.5, Math.PI / 2 - 0.35, 0, 0);
  for (const s of [-1, 1]) {
    const ear = mesh(cached('gEar', () => new THREE.ConeGeometry(0.16, 0.85, 4)), skin, head, s * 0.55, 0.12, -0.05, 0, 0, s * (Math.PI / 2 + 0.25));
    ear.scale.set(1, 1, 0.35);
    mesh(cached('gEye', () => new THREE.SphereGeometry(0.085, 8, 6)), glow(0xffe040, 1.7), head, s * 0.16, 0.1, 0.36);
  }
  mesh(cached('gGrin', () => new THREE.TorusGeometry(0.2, 0.035, 4, 12, Math.PI)), rimToon(0x2a0a0a, 0xff8080), head, 0, -0.14, 0.36, 0, 0, Math.PI);
  for (let i = -2; i <= 2; i++) mesh(cached('gTooth', () => new THREE.BoxGeometry(0.05, 0.07, 0.04)), rimToon(0xfff8e0, 0xffffff), head, i * 0.07, -0.22, 0.38);
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pv(s * 0.44, 0.55, 0, torso);
    mesh(cached('gArm', () => taperTube([V3(0, 0, 0), V3(0, -0.35, 0.04), V3(0, -0.66, 0)], 0.08, 0.06, 6, 6)), skin, a);
    arms.push(a);
  }
  let bombObj: THREE.Object3D | null = null;
  let spark: THREE.Object3D | null = null;
  if (bomb) {
    const b = pv(0, 1.8, 0.1, torso);
    mesh(cached('gBomb', () => new THREE.SphereGeometry(0.52, 14, 12)), rimToon(0x1e1e24, 0x9090ff), b);
    mesh(cached('gBombCap', () => new THREE.CylinderGeometry(0.16, 0.18, 0.18, 8)), rimToon(0x6a6a72, 0xffffff), b, 0, 0.52, 0);
    mesh(cached('gFuse', () => taperTube([V3(0, 0.6, 0), V3(0.08, 0.75, 0), V3(0.02, 0.9, 0.05)], 0.03, 0.03, 6, 4)), rimToon(0x8a6a3a, 0xffd090), b);
    const mark = cached('gSkullMark', () => humanSkull(0.34));
    mesh(mark.geo, M.bone(), b, 0, 0.02, 0.44);
    spark = mesh(cached('gSpark', () => new THREE.SphereGeometry(0.12, 6, 5)), glow(0xffa020, 3), b, 0.02, 0.93, 0.05);
    bombObj = b;
    arms.forEach((a) => (a.rotation.x = -2.8));
  }
  return { root, parts: { hips, torso, head, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], ...(bombObj ? { bomb: bombObj } : {}), ...(spark ? { spark } : {}) } };
}

// ------------------------------------------------------------------ brute
function bruteModelRaw(): EnemyVisual {
  const root = new THREE.Group();
  const skin = rimToon(0x5a2620, 0xff7050, { emissive: 0x160202, emissiveIntensity: 1, detail: { kind: 'rock', scale: 0.85, strength: 1.15, glow: 0xff4a10, glowIntensity: 2.0 } });
  const dark = rimToon(0x261010, 0xff6040, { detail: { kind: 'rock', scale: 1.1, strength: 1.0 } });
  const crack = glow(0xff4a10, 2.4);
  const stone = rimToon(0x686872, 0xd0d0ff, { detail: { kind: 'rock', scale: 0.7, strength: 1.2, glow: 0xff5a20, glowIntensity: 1.2 } });
  const hornM = rimToon(0x2a2222, 0xffb090, { detail: { kind: 'rock', scale: 1.5, strength: 0.9 } });
  const hips = pv(0, 1.9, 0, root);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const l = pv(s * 0.75, 0, 0, hips);
    mesh(cached('bLeg', () => taperTube([V3(0, 0, 0), V3(0, -0.9, 0.15), V3(0, -1.75, 0)], 0.48, 0.36, 8, 10)), skin, l);
    mesh(cached('bFoot', () => new THREE.SphereGeometry(0.5, 10, 8)), dark, l, 0, -1.8, 0.2).scale.set(1, 0.5, 1.4);
    legs.push(l);
  }
  const torso = pv(0, 0.1, 0, hips);
  const tb = mesh(cached('bTorso', () => lathe([[0.9, -0.2], [1.3, 0.3], [1.55, 1.0], [1.6, 1.7], [1.3, 2.3], [0.7, 2.6], [0, 2.65]], 16)), skin, torso);
  tb.scale.set(1.15, 1, 0.9);
  mesh(cached('bBelly', () => new THREE.SphereGeometry(1.0, 12, 10)), dark, torso, 0, 0.35, 0.3).scale.set(1.2, 0.8, 1);
  mesh(cached('bLoin', () => new THREE.CylinderGeometry(1.05, 1.2, 0.5, 14)), rimToon(0x4a3020, 0xffb070), torso, 0, -0.15, 0);
  for (let i = 0; i < 6; i++) mesh(cached('bCrack', () => new THREE.BoxGeometry(0.1, 0.9, 0.08)), crack, torso, [-0.9, -0.4, 0.2, 0.7, -0.6, 0.5][i], [1.1, 1.6, 1.3, 1.8, 2.0, 0.9][i], 1.3 - Math.abs([-0.9, -0.4, 0.2, 0.7, -0.6, 0.5][i]) * 0.25, 0, 0, [0.4, -0.3, 0.2, -0.5, 0.6, -0.2][i]);
  spikes(torso, [V3(0.6, 2.4, -0.5), V3(-0.6, 2.4, -0.5), V3(0, 2.5, -0.7), V3(0.9, 2.1, -0.8), V3(-0.9, 2.1, -0.8)], [V3(0.3, 1, -0.6), V3(-0.3, 1, -0.6), V3(0, 1, -0.7), V3(0.6, 0.6, -0.6), V3(-0.6, 0.6, -0.6)], 0.18, 0.8, hornM);
  // head (sunk between the shoulders)
  const head = pv(0, 2.35, 0.75, torso);
  const sk = cached('bruteSkull', () => skull({ len: 1.35, w: 1.25, h: 1.05, snout: 1.35, socket: 0.3 }));
  mesh(sk.geo, skin, head, 0, 0, 0.1);
  for (const e of sk.eyes) mesh(cached('bEye', () => new THREE.SphereGeometry(0.13, 8, 6)), glow(0xff2a1a, 4), head, e.x, e.y, e.z + 0.08);
  for (const s of [-1, 1]) {
    mesh(cached(`bHorn${s}`, () => taperTube([V3(s * 0.45, 0.35, -0.1), V3(s * 0.95, 0.55, -0.2), V3(s * 1.25, 1.05, -0.1), V3(s * 1.2, 1.5, 0.15)], 0.22, 0.02, 14, 7)), hornM, head);
    mesh(cached('bTusk', () => new THREE.ConeGeometry(0.08, 0.42, 5)), rimToon(0xf2ead0, 0xffffff), head, s * 0.3, -0.35, 0.62);
  }
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pv(s * 1.75, 1.95, 0, torso);
    mesh(cached('bShoulder', () => new THREE.SphereGeometry(0.62, 12, 8)), dark, a);
    mesh(cached('bArm', () => taperTube([V3(0, 0, 0), V3(s * 0.1, -0.9, 0.1), V3(0, -1.75, 0.05)], 0.46, 0.38, 8, 9)), skin, a);
    mesh(cached('bFist', () => new THREE.SphereGeometry(0.48, 10, 8)), skin, a, 0, -1.9, 0.05);
    mesh(cached('bBracer', () => new THREE.CylinderGeometry(0.44, 0.48, 0.5, 10)), rimToon(0x3a3a42, 0xc0c0ff), a, 0, -1.4, 0.05);
    arms.push(a);
  }
  const block = pv(0, 3.4, 0.3, torso);
  mesh(cached('bBlock', () => new THREE.BoxGeometry(2.4, 1.3, 1.4)), stone, block);
  mesh(cached('bRune', () => new THREE.BoxGeometry(1.8, 0.14, 0.05)), crack, block, 0, 0.1, 0.72, 0, 0, 0.1);
  mesh(cached('bRune2', () => new THREE.BoxGeometry(0.14, 0.9, 0.05)), crack, block, -0.5, 0, 0.72, 0, 0, 0.3);
  return { root, parts: { hips, torso, head, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], block } };
}

// ------------------------------------------------------------------ necromancer
function necroModelRaw(): EnemyVisual {
  const root = new THREE.Group();
  const robe = rimToon(0x321a52, 0xd080ff, { detail: { kind: 'cloth', scale: 2.2, strength: 1.0 } });
  const trim = rimToon(0xc89a3a, 0xfff0b0, { detail: { kind: 'plate', scale: 1.4, strength: 0.7 } });
  const B = M.bone();
  const float = pv(0, 0.6, 0, root);
  mesh(cached('nRobe', () => lathe([[1.05, 0], [0.95, 0.4], [0.72, 1.2], [0.55, 1.9], [0.48, 2.4], [0.3, 2.6], [0, 2.62]], 16)), robe, float);
  mesh(cached('nHem', () => new THREE.TorusGeometry(1.03, 0.08, 5, 20)), trim, float, 0, 0.06, 0, Math.PI / 2, 0, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    mesh(cached('nTatter', () => new THREE.ConeGeometry(0.16, 0.6, 4)), robe, float, Math.cos(a) * 0.95, -0.2, Math.sin(a) * 0.95, Math.PI, 0, 0);
  }
  mesh(cached('nSash', () => new THREE.BoxGeometry(0.3, 1.6, 0.05)), trim, float, 0, 1.4, 0.62, -0.18, 0, 0);
  // floating rune ring
  const ring = mesh(cached('nRing', () => new THREE.TorusGeometry(1.4, 0.04, 4, 32)), glow(0xb040ff, 2.5), float, 0, -0.35, 0, Math.PI / 2, 0, 0);
  ring.castShadow = false;
  const head = pv(0, 2.75, 0.05, float);
  mesh(cached('nHood', () => new THREE.SphereGeometry(0.55, 16, 10, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.66)), rimToon(0x3a1e5a, 0xd080ff, { side: THREE.DoubleSide }), head, 0, -0.02, -0.08);
  mesh(cached('nHoodTip', () => taperTube([V3(0, 0.3, -0.35), V3(0, 0.35, -0.7), V3(0, 0.05, -0.95)], 0.2, 0.02, 8, 6)), robe, head);
  const sk = cached('necroSkull', () => humanSkull(0.62));
  const nsk = mesh(sk.geo, B, head, 0, 0.02, 0.1);
  for (const e of sk.eyes) mesh(cached('nEye', () => new THREE.SphereGeometry(0.06, 6, 5)), glow(0xd050ff, 4), nsk, e.x, e.y, e.z);
  for (const t of sk.teeth) mesh(cached('sTooth', () => new THREE.BoxGeometry(0.05, 0.08, 0.05)), B, nsk, t.x, t.y - 0.02, t.z - 0.02);
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pv(s * 0.55, 2.3, 0, float);
    mesh(cached('nSleeve', () => lathe([[0.12, 0], [0.18, -0.4], [0.3, -0.95], [0.32, -1.05], [0, -1.05]], 10)), robe, a);
    mesh(cached('nHand', () => new THREE.BoxGeometry(0.12, 0.25, 0.08)), B, a, 0, -1.15, 0);
    arms.push(a);
  }
  const staff = pv(0, -1.1, 0.15, arms[1]);
  mesh(cached('nStaff', () => taperTube([V3(0, -1.0, 0), V3(0.05, 0.6, 0), V3(-0.05, 1.8, 0), V3(0, 2.2, 0)], 0.06, 0.05, 10, 6)), rimToon(0x3a2a1a, 0xffc080), staff);
  mesh(cached('nClaw', () => taperTube([V3(0, 2.2, 0), V3(0.25, 2.5, 0), V3(0.12, 2.85, 0)], 0.05, 0.02, 8, 5)), rimToon(0x3a2a1a, 0xffc080), staff);
  mesh(cached('nClaw2', () => taperTube([V3(0, 2.2, 0), V3(-0.25, 2.5, 0), V3(-0.12, 2.85, 0)], 0.05, 0.02, 8, 5)), rimToon(0x3a2a1a, 0xffc080), staff);
  const orb = mesh(cached('nOrb', () => new THREE.SphereGeometry(0.24, 12, 10)), glow(0xb040ff, 3.5), staff, 0, 2.55, 0);
  return { root, parts: { float, head, armL: arms[0], armR: arms[1], staff, orb } };
}

// ------------------------------------------------------------------ buggies
function buggyModelRaw(big: boolean): EnemyVisual {
  const root = new THREE.Group();
  const s = big ? 1.35 : 1;
  const body = pv(0, 0, 0, root);
  const rust = big ? rimToon(0x3a3a44, 0xc0c0ff, { detail: { kind: 'plate', scale: 0.8, strength: 1.1 } }) : rimToon(0xffffff, 0xffc080, { map: woodTexture(6, '#8a4a22'), detail: { kind: 'hide', scale: 1.2, strength: 0.6 } });
  const metal = rimToon(0x4a4a52, 0xd0d0ff, { detail: { kind: 'plate', scale: 0.9, strength: 1.0 } });
  const dark = rimToon(0x1a1a1e, 0x9090c0);
  const prof = new THREE.Shape([new THREE.Vector2(-1.6, 0.55), new THREE.Vector2(1.4, 0.55), new THREE.Vector2(1.85, 0.95), new THREE.Vector2(1.2, 1.3), new THREE.Vector2(-1.3, 1.35), new THREE.Vector2(-1.75, 1.0)]);
  const pg = cached(`bugBody${big}`, () => {
    const g = new THREE.ExtrudeGeometry(prof, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 });
    g.translate(0, 0, -0.85);
    g.rotateY(-Math.PI / 2);
    g.scale(s, s, s);
    return g;
  });
  mesh(pg, rust, body);
  // roll cage
  for (const x of [-0.75, 0.75]) mesh(cached(`bugCage${big}${x}`, () => taperTube([V3(x * s, 1.3 * s, 0.6 * s), V3(x * 0.8 * s, 2.1 * s, 0.1 * s), V3(x * 0.8 * s, 2.1 * s, -0.8 * s), V3(x * s, 1.3 * s, -1.2 * s)], 0.06 * s, 0.06 * s, 12, 5)), dark, body);
  mesh(cached(`bugBar${big}`, () => new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 1.3 * s, 5)), dark, body, 0, 2.1 * s, -0.35 * s, 0, 0, Math.PI / 2);
  // ram spikes & skull
  for (let i = 0; i < 5; i++) mesh(cached(`bugSpike${big}`, () => new THREE.ConeGeometry(0.13 * s, 0.75 * s, 5)), rimToon(0xc8ccd6, 0xffffff), body, (i / 4 - 0.5) * 1.6 * s, 0.85 * s, 1.95 * s, Math.PI / 2, 0, 0);
  const plate = cached('bugSkull', () => humanSkull(0.6));
  const pm = mesh(plate.geo, M.bone(), body, 0, 1.12 * s, 1.72 * s);
  pm.scale.setScalar(s);
  for (const e of plate.eyes) mesh(cached('sEye2', () => new THREE.SphereGeometry(0.06, 6, 5)), M.eye(), pm, e.x, e.y, e.z);
  // driver
  const drv = pv(0, 1.55 * s, -0.25 * s, body);
  if (big) {
    const sk = cached('truckerSkull', () => humanSkull(0.78));
    const tsk = mesh(sk.geo, M.bone(), drv, 0, 0.42, 0);
    for (const e of sk.eyes) mesh(cached('sEye2', () => new THREE.SphereGeometry(0.06, 6, 5)), M.eye(), tsk, e.x, e.y, e.z);
    for (const t of sk.teeth) mesh(cached('sTooth', () => new THREE.BoxGeometry(0.05, 0.08, 0.05)), M.bone(), tsk, t.x, t.y - 0.02, t.z - 0.02);
    mesh(cached('truckerHat', () => new THREE.CylinderGeometry(0.42, 0.45, 0.2, 12)), M.red(), drv, 0, 0.82, 0);
    mesh(cached('truckerBrim', () => new THREE.BoxGeometry(0.6, 0.05, 0.4)), M.red(), drv, 0, 0.72, 0.35);
    for (const x of [-0.75, 0.75]) {
      mesh(cached('stack', () => new THREE.CylinderGeometry(0.14, 0.14, 1.6, 8)), rimToon(0xc8ccd6, 0xffffff), drv, x, 1.0, -1.6);
    }
  } else {
    mesh(cached('bugGob', () => new THREE.SphereGeometry(0.36, 12, 10)), rimToon(0x4f9a2c, 0xb0ff70, { rimStrength: 0.6 }), drv, 0, 0.35, 0);
    for (const x of [-1, 1]) {
      const ear = mesh(cached('gEar', () => new THREE.ConeGeometry(0.16, 0.85, 4)), rimToon(0x4f9a2c, 0xb0ff70, { rimStrength: 0.6 }), drv, x * 0.46, 0.42, -0.05, 0, 0, x * (Math.PI / 2 + 0.25));
      ear.scale.set(0.8, 0.8, 0.3);
      mesh(cached('gEye', () => new THREE.SphereGeometry(0.085, 8, 6)), glow(0xffe040, 1.7), drv, x * 0.14, 0.42, 0.3);
    }
    mesh(cached('goggles', () => new THREE.TorusGeometry(0.33, 0.05, 5, 14)), metal, drv, 0, 0.45, 0.06, 0, 0, 0);
  }
  const gun = pv(0, 1.9 * s, 0.55 * s, body);
  mesh(cached('bugGun', () => new THREE.BoxGeometry(0.34, 0.3, 0.6)), metal, gun);
  mesh(cached('bugBarrel', () => new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6)), dark, gun, 0, 0, 0.6, Math.PI / 2, 0, 0);
  if (big) mesh(cached('bugBarrel', () => new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6)), dark, gun, 0.16, 0, 0.6, Math.PI / 2, 0, 0);
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-1, 1.1], [1, 1.1], [-1, -1.1], [1, -1.1]]) {
    const w = pv(x * 1.08 * s, 0.58 * s, z * s, root);
    mesh(cached(`bugTire${big}`, () => new THREE.CylinderGeometry(0.58 * s, 0.58 * s, 0.46 * s, 14)), rimToon(0x19191c, 0x8080a0), w, 0, 0, 0, 0, 0, Math.PI / 2);
    mesh(cached(`bugRim${big}`, () => new THREE.CylinderGeometry(0.3 * s, 0.3 * s, 0.5 * s, 8)), rimToon(0xa08a4a, 0xfff0b0), w, 0, 0, 0, 0, 0, Math.PI / 2);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      mesh(cached(`bugKnob${big}`, () => new THREE.BoxGeometry(0.5 * s, 0.14 * s, 0.14 * s)), rimToon(0x19191c, 0x8080a0), w, 0, Math.cos(a) * 0.58 * s, Math.sin(a) * 0.58 * s, a, 0, 0);
    }
    wheels.push(w);
  }
  const lights = [-0.6, 0.6].map((x) => mesh(cached('bugLight', () => new THREE.SphereGeometry(0.14, 6, 5)), glow(0xffd24a, 3), body, x * s, 1.05 * s, 1.72 * s));
  return { root, parts: { body, gun, w0: wheels[0], w1: wheels[1], w2: wheels[2], w3: wheels[3], l0: lights[0], l1: lights[1] } };
}

// ------------------------------------------------------------------ wraith
function wraithModelRaw(): EnemyVisual {
  const root = new THREE.Group();
  const cloth = rimToon(0x283a52, 0x60ffd8, { emissive: 0x0a2430, emissiveIntensity: 1, side: THREE.DoubleSide, detail: { kind: 'cloth', scale: 1.6, strength: 0.9 } });
  const float = pv(0, 1.4, 0, root);
  mesh(cached('wCloak', () => lathe([[0.3, 2.2], [0.6, 1.9], [0.9, 1.2], [1.1, 0.2], [1.2, -0.8], [1.3, -1.2]], 16)), cloth, float);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const t = mesh(cached('wTatter', () => taperTube([V3(0, 0, 0), V3(0.05, -0.5, 0.1), V3(-0.05, -1.1, 0.25)], 0.18, 0.01, 8, 5)), cloth, float, Math.cos(a) * 1.25, -1.15, Math.sin(a) * 1.25);
    t.rotation.y = -a;
  }
  const head = pv(0, 1.92, 0.08, float);
  mesh(cached('wHood', () => new THREE.SphereGeometry(0.62, 16, 10, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.64)), cloth, head, 0, 0.05, -0.1);
  const sk = cached('wraithSkull', () => humanSkull(0.7));
  const wsk = mesh(sk.geo, M.bone(), head, 0, 0.04, 0.1);
  for (const e of sk.eyes) mesh(cached('wEye', () => new THREE.SphereGeometry(0.075, 8, 6)), glow(0x40ffd0, 4), wsk, e.x, e.y, e.z);
  for (const t of sk.teeth) mesh(cached('sTooth', () => new THREE.BoxGeometry(0.05, 0.08, 0.05)), M.bone(), wsk, t.x, t.y - 0.02, t.z - 0.02);
  const wjaw = pv(0, -0.22, 0.0, head);
  mesh(cached('wJaw', () => jawGeo(0.4, 0.42, 0.07, 0.07)), M.boneD(), wjaw);
  wjaw.rotation.x = 0.35;
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pv(s * 0.72, 1.4, 0.15, float);
    mesh(cached('wArm', () => taperTube([V3(0, 0, 0), V3(0, -0.8, 0.2), V3(0, -1.5, 0.3)], 0.14, 0.05, 10, 6)), cloth, a);
    for (let k = -1; k <= 1; k++) mesh(cached(`wClaw${k}`, () => taperTube([V3(0, -1.5, 0.3), V3(k * 0.12, -1.8, 0.45), V3(k * 0.16, -2.05, 0.35)], 0.04, 0.01, 6, 4)), M.bone(), a);
    arms.push(a);
  }
  return { root, parts: { float, head, armL: arms[0], armR: arms[1] } };
}

// ------------------------------------------------------------------ magma imp
function impModelRaw(): EnemyVisual {
  const root = new THREE.Group();
  const skin = rimToon(0xb03c18, 0xffd080, { emissive: 0x300a00, emissiveIntensity: 1, detail: { kind: 'scale', scale: 2.6, strength: 0.9 } });
  const dark = rimToon(0x2a0a06, 0xff8040, { detail: { kind: 'rock', scale: 2, strength: 0.9 } });
  const hips = pv(0, 1.0, 0, root);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const l = pv(s * 0.22, 0, 0, hips);
    mesh(cached('iLeg', () => taperTube([V3(0, 0, 0), V3(0, -0.45, 0.15), V3(0, -0.9, -0.05)], 0.13, 0.07, 8, 6)), skin, l);
    mesh(cached('iHoof', () => new THREE.ConeGeometry(0.1, 0.2, 5)), dark, l, 0, -0.95, 0, Math.PI, 0, 0);
    legs.push(l);
  }
  const torso = pv(0, 0.1, 0, hips);
  mesh(cached('iBody', () => lathe([[0.25, -0.1], [0.42, 0.2], [0.5, 0.5], [0.42, 0.8], [0.2, 0.95], [0, 0.97]], 12)), skin, torso);
  for (let i = 0; i < 3; i++) mesh(cached('iCrack', () => new THREE.BoxGeometry(0.06, 0.4, 0.04)), glow(0xffb020, 1.8), torso, -0.2 + i * 0.2, 0.5, 0.44, 0, 0, (i - 1) * 0.4);
  const head = pv(0, 1.15, 0.05, torso);
  mesh(cached('iHead', () => new THREE.SphereGeometry(0.4, 12, 10)), skin, head).scale.set(1, 0.95, 1.05);
  for (const s of [-1, 1]) {
    mesh(cached(`iHorn${s}`, () => taperTube([V3(s * 0.2, 0.25, 0), V3(s * 0.45, 0.5, -0.1), V3(s * 0.5, 0.8, 0.1)], 0.09, 0.01, 10, 5)), dark, head);
    mesh(cached('iEye', () => new THREE.SphereGeometry(0.075, 8, 6)), glow(0xffe040, 1.7), head, s * 0.15, 0.06, 0.34);
  }
  mesh(cached('iGrin', () => new THREE.TorusGeometry(0.16, 0.03, 4, 12, Math.PI)), dark, head, 0, -0.1, 0.33, 0, 0, Math.PI);
  const wingMat = rimToon(0xffffff, 0xff8040, { map: membraneTexture('#7a1a0a', '#ff7a2a', '#ff4a1a', 'impWing'), side: THREE.DoubleSide });
  wingMat.alphaTest = 0.5;
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const wp = pv(s * 0.28, 0.72, -0.32, torso);
    const wg = pv(0, 0, 0, wp);
    wg.scale.x = s;
    wg.rotation.y = s * 0.3;
    const tips = [new THREE.Vector2(0.9, 0.9), new THREE.Vector2(1.25, 0.25), new THREE.Vector2(1.0, -0.35)];
    mesh(cached('iWingM', () => membraneGeo(tips, new THREE.Vector2(0.3, -0.45))), wingMat, wg);
    for (const t of tips) mesh(cached(`iWB${t.x}`, () => taperTube([V3(0, 0, 0), V3(t.x * 0.5, t.y * 0.5 + 0.15, 0), V3(t.x, t.y, 0)], 0.04, 0.015, 6, 4)), dark, wg);
    wings.push(wp);
  }
  mesh(cached('iTail', () => taperTube([V3(0, 0.1, -0.35), V3(0, -0.2, -0.8), V3(0, 0.1, -1.2), V3(0, 0.4, -1.3)], 0.06, 0.03, 12, 5)), skin, torso);
  mesh(cached('iSpade', () => new THREE.ConeGeometry(0.12, 0.3, 4)), dark, torso, 0, 0.5, -1.32);
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pv(s * 0.5, 0.78, 0, torso);
    mesh(cached('iArm', () => taperTube([V3(0, 0, 0), V3(0, -0.35, 0.08), V3(0, -0.68, 0)], 0.09, 0.06, 6, 6)), skin, a);
    arms.push(a);
  }
  const ball = mesh(cached('iBall', () => new THREE.SphereGeometry(0.32, 10, 8)), glow(0xff7020, 2.0), arms[1], 0, -0.82, 0.1);
  return { root, parts: { hips, torso, head, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], wingL: wings[0], wingR: wings[1], ball } };
}

// ------------------------------------------------------------------ mimic
function mimicModelRaw(): EnemyVisual {
  const root = new THREE.Group();
  const wood = rimToon(0xffffff, 0xffc080, { map: woodTexture(7, '#7a4a22') });
  const gold = rimToon(0xe0aa2a, 0xfff0b0, { emissive: 0x3a2400, emissiveIntensity: 0.6 });
  const iron = rimToon(0x3a3a44, 0xc0c0ff);
  const teeth = rimToon(0xf4f0e0, 0xffffff);
  const maw = rimToon(0x3a0610, 0xff6080, { emissive: 0x500014, emissiveIntensity: 1 });
  const body = pv(0, 0, 0, root);
  mesh(cached('mBox', () => new THREE.BoxGeometry(2.2, 1.2, 1.5)), wood, body, 0, 0.6, 0);
  mesh(cached('mBand', () => new THREE.BoxGeometry(2.3, 0.14, 1.6)), gold, body, 0, 1.16, 0);
  mesh(cached('mBand2', () => new THREE.BoxGeometry(2.3, 0.14, 1.6)), iron, body, 0, 0.1, 0);
  for (const x of [-0.8, 0.8]) mesh(cached('mStrap', () => new THREE.BoxGeometry(0.16, 1.24, 1.58)), gold, body, x, 0.6, 0);
  for (const x of [-1.1, 1.1]) for (const z of [-0.75, 0.75]) mesh(cached('mStud', () => new THREE.SphereGeometry(0.1, 6, 5)), gold, body, x, 1.1, z);
  // gaping maw
  mesh(cached('mMaw', () => new THREE.BoxGeometry(2.0, 0.08, 1.3)), maw, body, 0, 1.2, 0);
  for (let i = 0; i < 8; i++) {
    const x = -0.95 + i * 0.27;
    mesh(cached('mToothL', () => new THREE.ConeGeometry(0.1, 0.4, 5)), teeth, body, x, 1.4, 0.66);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) mesh(cached('mToothS', () => new THREE.ConeGeometry(0.08, 0.3, 5)), teeth, body, s * 1.0, 1.35, -0.45 + i * 0.3);
  // rounded lid
  const lidP = pv(0, 1.22, -0.75, body);
  const dome = mesh(cached('mLid', () => {
    const g = new THREE.CylinderGeometry(0.75, 0.75, 2.2, 16, 1, false, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    return g;
  }), wood, lidP, 0, 0, 0.75);
  dome.scale.set(1, 0.6, 1);
  for (const x of [-0.8, 0.8]) {
    const band = mesh(cached('mLidBand', () => {
      const g = new THREE.CylinderGeometry(0.78, 0.78, 0.18, 16, 1, true, 0, Math.PI);
      g.rotateZ(Math.PI / 2);
      return g;
    }), gold, lidP, x, 0, 0.75);
    band.scale.set(1, 0.62, 1.04);
  }
  mesh(cached('mLock', () => new THREE.BoxGeometry(0.42, 0.5, 0.12)), gold, lidP, 0, -0.05, 1.55);
  mesh(cached('mKey', () => new THREE.BoxGeometry(0.08, 0.2, 0.04)), rimToon(0x140a04, 0x000000), lidP, 0, -0.08, 1.62);
  for (let i = 0; i < 8; i++) {
    const x = -0.95 + i * 0.27;
    mesh(cached('mToothU', () => new THREE.ConeGeometry(0.1, 0.4, 5)), teeth, lidP, x, -0.16, 1.44, Math.PI, 0, 0);
  }
  const tongue = pv(0, 1.25, 0.1, body);
  mesh(cached('mTongue', () => taperTube([V3(0, 0, -0.4), V3(0, 0.15, 0.3), V3(0, -0.05, 0.95), V3(0, -0.45, 1.35)], 0.26, 0.12, 16, 8)), rimToon(0xd0304a, 0xffa0b0), tongue).scale.set(1.5, 0.5, 1);
  const eyes = [-0.45, 0.45].map((x) => mesh(cached('mEye', () => new THREE.SphereGeometry(0.15, 10, 8)), glow(0xffe040, 2.2), body, x, 1.32, -0.3));
  return { root, parts: { body, lid: lidP, tongue, e0: eyes[0], e1: eyes[1] } };
}

// ------------------------------------------------------------------ crystal sentry
function sentryModelRaw(): EnemyVisual {
  const root = new THREE.Group();
  const stone = rimToon(0x4a4058, 0xc0a0ff, { detail: { kind: 'rock', scale: 1.0, strength: 1.2, glow: 0xb44cff, glowIntensity: 1.6 } });
  const runeGlow = glow(0xb44cff, 2.6);
  mesh(cached('sBase', () => lathe([[1.9, 0], [1.9, 0.3], [1.5, 0.5], [1.2, 1.2], [1.45, 1.45], [1.3, 1.6], [0, 1.6]], 8)), stone, root);
  mesh(cached('sRune', () => new THREE.CylinderGeometry(1.36, 1.28, 0.16, 8, 1, true)), runeGlow, root, 0, 0.9, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const c = mesh(cached('sClaw', () => taperTube([V3(0, 0, 0), V3(0.35, 0.8, 0), V3(0.2, 1.6, 0)], 0.22, 0.04, 10, 6)), stone, root, Math.cos(a) * 1.3, 1.4, Math.sin(a) * 1.3);
    c.rotation.y = -a + Math.PI;
  }
  const spin = pv(0, 2.8, 0, root);
  const crystal = mesh(cached('sCrystal', () => new THREE.OctahedronGeometry(1, 0)), rimToon(0x9a4cff, 0xffd0ff, { emissive: 0x7a2cff, emissiveIntensity: 1.3 }), spin);
  crystal.scale.set(0.8, 1.7, 0.8);
  const shardM = rimToon(0xc080ff, 0xffffff, { emissive: 0xb44cff, emissiveIntensity: 1.1 });
  for (let i = 0; i < 3; i++) {
    const s = mesh(cached('sShard', () => new THREE.OctahedronGeometry(0.35, 0)), shardM, spin, Math.cos((i / 3) * 6.28) * 1.7, Math.sin(i * 2.1) * 0.4, Math.sin((i / 3) * 6.28) * 1.7);
    s.scale.set(0.6, 1.5, 0.6);
  }
  const ring = mesh(cached('sRing', () => new THREE.TorusGeometry(1.7, 0.03, 4, 36)), runeGlow, spin, 0, 0, 0, Math.PI / 2, 0, 0);
  ring.castShadow = false;
  // small crystal cluster on the base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const c = mesh(cached('sCl', () => new THREE.OctahedronGeometry(0.3, 0)), shardM, root, Math.cos(a) * 0.7, 1.75, Math.sin(a) * 0.7, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
    c.scale.set(0.6, 1.4 + (i % 2) * 0.6, 0.6);
  }
  return { root, parts: { spin, crystal } };
}

// ------------------------------------------------------------------ draw-call optimisation
const mergedCache = new Map<string, THREE.BufferGeometry | null>();
/**
 * Bake the rigid meshes under each pivot into one mesh per material. Animated pivots and
 * named parts stay separate, so the rig still works — roughly 4–6× fewer draw calls per enemy.
 */
function optimize(key: string, v: EnemyVisual): EnemyVisual {
  const keep = new Set<THREE.Object3D>(Object.values(v.parts));
  const visit = (node: THREE.Object3D, path: string) => {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const c of node.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || keep.has(m) || m.children.length || !m.visible) continue;
      const k = (m.material as THREE.Material).uuid + (m.geometry.index ? 'i' : 'n');
      let list = groups.get(k);
      if (!list) groups.set(k, (list = []));
      list.push(m);
    }
    let gi = 0;
    for (const [k, list] of groups) {
      gi++;
      if (list.length < 2) continue;
      const ck = `${key}|${path}|${gi}|${k}`;
      let geo = mergedCache.get(ck);
      if (geo === undefined) {
        const geos = list.map((m) => {
          m.updateMatrix();
          const g = m.geometry.clone().applyMatrix4(m.matrix);
          for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
          if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
          g.morphAttributes = {};
          g.clearGroups();
          return g;
        });
        geo = mergeGeometries(geos, false);
        geos.forEach((g) => g.dispose());
        mergedCache.set(ck, geo);
      }
      if (!geo) continue;
      const merged = new THREE.Mesh(geo, list[0].material);
      merged.castShadow = true;
      for (const m of list) node.remove(m);
      node.add(merged);
    }
    node.children.forEach((c, i) => {
      if (c.children.length) visit(c, `${path}/${i}`);
    });
  };
  visit(v.root, 'r');
  return v;
}

export const skeletonModel = (kind: 'sword' | 'bow' | 'knight') => optimize('skel' + kind, skeletonModelRaw(kind));
export const houndModel = () => optimize('hound', houndModelRaw());
export const goblinModel = (bomb: boolean) => optimize('gob' + bomb, goblinModelRaw(bomb));
export const bruteModel = () => optimize('brute', bruteModelRaw());
export const necroModel = () => optimize('necro', necroModelRaw());
export const buggyModel = (big: boolean) => optimize('bug' + big, buggyModelRaw(big));
export const wraithModel = () => optimize('wraith', wraithModelRaw());
export const impModel = () => optimize('imp', impModelRaw());
export const mimicModel = () => optimize('mimic', mimicModelRaw());
export const sentryModel = () => optimize('sentry', sentryModelRaw());
