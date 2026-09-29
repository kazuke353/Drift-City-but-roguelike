import * as THREE from 'three';
import type { Enemy, EnemyVisual } from './Enemy';
import type { World } from '../game/World';
import { rimToon, glow } from '../render/Toon';
import { woodTexture } from '../render/Textures';
import { damp } from '../core/MathUtil';
import { SHAPE_CORE, SHAPE_DOT } from '../fx/Particles';
import {
  V3, boneTexture, membraneTexture, clothTexture, taperTube, bone, limb, skull, jawGeo, jawArc, membraneGeo, chain, clothMesh, waveCloth, mound, spikes,
} from './BossKit';

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
const lathe = (pts: [number, number][], seg = 18) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const tmp = new THREE.Vector3();

// ======================================================================= IRON BISHOP
export function bishopModel(): EnemyVisual {
  const root = new THREE.Group();
  const iron = rimToon(0x6a7284, 0x9ec0ff, { rimStrength: 1.1 });
  const ironD = rimToon(0x30333e, 0x7a90d0);
  const gold = rimToon(0xe8b43a, 0xfff2b0, { emissive: 0x5a3400, emissiveIntensity: 0.8 });
  const red = rimToon(0x9e1624, 0xff7070, { side: THREE.DoubleSide });
  const white = rimToon(0xefe7d2, 0xffffff);
  const tabard = rimToon(0xffffff, 0xffb0b0, { map: clothTexture('#9e1624', '#e8b43a', 'cross', 'bishopTabard'), side: THREE.DoubleSide });
  const holy = glow(0xffd680, 2.4);
  const visor = glow(0xff6a20, 4.5);

  const hips = pv(0, 6.4, 0, root);
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [];
  const sabShape = new THREE.Shape([new THREE.Vector2(-0.6, 0), new THREE.Vector2(1.9, 0), new THREE.Vector2(2.1, 0.3), new THREE.Vector2(0.9, 0.95), new THREE.Vector2(-0.6, 0.95)]);
  const sabGeo = new THREE.ExtrudeGeometry(sabShape, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 });
  sabGeo.translate(0, 0, -0.6);
  sabGeo.rotateY(-Math.PI / 2);
  for (const s of [-1, 1]) {
    const leg = pv(s * 1.25, 0, 0, hips);
    mesh(new THREE.CylinderGeometry(0.95, 0.78, 3.0, 14), ironD, leg, 0, -1.5, 0);
    const knee = pv(0, -3.0, 0.05, leg);
    mesh(new THREE.SphereGeometry(0.88, 14, 10), iron, knee, 0, 0, 0.2);
    mesh(new THREE.ConeGeometry(0.22, 0.9, 6), gold, knee, 0, 0, 1.05, Math.PI / 2, 0, 0);
    mesh(lathe([[0.62, -2.5], [0.7, -1.6], [0.84, -0.5], [0.8, 0]], 14), iron, knee);
    mesh(new THREE.BoxGeometry(1.0, 1.9, 0.3), iron, knee, 0, -1.25, 0.72, -0.08, 0, 0);
    mesh(new THREE.TorusGeometry(0.72, 0.1, 6, 16), gold, knee, 0, -2.3, 0, Math.PI / 2, 0, 0);
    mesh(sabGeo, iron, knee, 0, -3.35, 0);
    mesh(new THREE.BoxGeometry(1.25, 0.5, 0.6), gold, knee, 0, -3.1, 1.55);
    legs.push(leg);
    knees.push(knee);
  }
  // robe skirt, belt & tabards
  const skirt = mesh(new THREE.CylinderGeometry(2.25, 3.6, 4.5, 24, 3, true), red, hips, 0, -2.2, 0);
  mesh(new THREE.TorusGeometry(3.6, 0.2, 8, 32), gold, skirt, 0, -2.25, 0, Math.PI / 2, 0, 0);
  mesh(new THREE.TorusGeometry(2.3, 0.3, 8, 28), gold, hips, 0, 0.05, 0, Math.PI / 2, 0, 0);
  const tabF = clothMesh(2.0, 5.4, tabard, 4, 10);
  tabF.position.set(0, 0.1, 2.45);
  tabF.rotation.x = -0.12;
  hips.add(tabF);

  // torso
  const torso = pv(0, 0.3, 0, hips);
  const chest = mesh(lathe([[1.9, 0], [2.45, 0.8], [2.78, 2.0], [2.62, 3.2], [1.95, 4.1], [1.0, 4.5], [0, 4.6]], 24), iron, torso);
  chest.scale.set(1, 1, 0.8);
  const tr = mesh(new THREE.TorusGeometry(2.76, 0.14, 6, 32), gold, torso, 0, 2.0, 0, Math.PI / 2, 0, 0);
  tr.scale.set(1, 0.8, 1);
  const tr2 = mesh(new THREE.TorusGeometry(2.0, 0.12, 6, 28), gold, torso, 0, 4.05, 0, Math.PI / 2, 0, 0);
  tr2.scale.set(1, 0.8, 1);
  mesh(new THREE.TorusGeometry(1.15, 0.38, 8, 20), ironD, torso, 0, 4.35, 0, Math.PI / 2, 0, 0);
  // sacred core sunburst (weak point)
  const coreG = pv(0, 2.3, 2.12, torso);
  mesh(new THREE.TorusGeometry(1.05, 0.18, 8, 24), gold, coreG);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const ray = mesh(new THREE.ConeGeometry(0.16, i % 2 ? 0.7 : 1.1, 5), gold, coreG, Math.cos(a) * 1.45, Math.sin(a) * 1.45, -0.1);
    ray.rotation.z = a - Math.PI / 2;
  }
  const core = mesh(new THREE.SphereGeometry(0.72, 18, 14), holy, coreG, 0, 0, 0.05);
  // pauldrons
  for (const s of [-1, 1]) {
    const p = pv(s * 2.75, 3.95, 0, torso);
    for (let i = 0; i < 3; i++) {
      const r = 1.8 - i * 0.28;
      const dome = mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), i === 0 ? iron : ironD, p, s * i * 0.38, -i * 0.5, 0);
      dome.scale.set(1.15, 0.72, 1.05);
      const rim = mesh(new THREE.TorusGeometry(r * 1.15, 0.09, 5, 24), gold, p, s * i * 0.38, -i * 0.5 + 0.02, 0, Math.PI / 2, 0, 0);
      rim.scale.set(1, 0.92, 1);
    }
    spikes(p, [V3(s * 0.2, 1.2, 0), V3(s * 0.9, 1.0, 0.5), V3(s * 0.9, 1.0, -0.5)], [V3(s * 0.2, 1, 0), V3(s * 0.8, 1, 0.3), V3(s * 0.8, 1, -0.3)], 0.22, 1.2, gold);
  }
  // head: great helm, visor, mitre, halo
  const head = pv(0, 4.55, 0.15, torso);
  mesh(lathe([[0.98, 0], [1.1, 0.35], [1.12, 1.2], [1.02, 1.75], [0.62, 2.05], [0, 2.12]], 20), iron, head);
  mesh(new THREE.BoxGeometry(1.4, 0.16, 0.2), visor, head, 0, 1.08, 1.05);
  mesh(new THREE.BoxGeometry(0.16, 0.95, 0.2), visor, head, 0, 0.78, 1.07);
  mesh(new THREE.TorusGeometry(1.1, 0.1, 5, 22), gold, head, 0, 0.35, 0, Math.PI / 2, 0, 0);
  const mShape = new THREE.Shape([new THREE.Vector2(-0.88, 0), new THREE.Vector2(0.88, 0), new THREE.Vector2(0.64, 1.75), new THREE.Vector2(0, 3.0), new THREE.Vector2(-0.64, 1.75)]);
  const mitre = new THREE.ExtrudeGeometry(mShape, { depth: 1.05, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2 });
  mitre.translate(0, 0, -0.52);
  mesh(mitre, white, head, 0, 1.85, 0);
  mesh(new THREE.BoxGeometry(1.95, 0.3, 1.3), gold, head, 0, 2.0, 0);
  mesh(new THREE.BoxGeometry(0.22, 1.1, 0.12), gold, head, 0, 3.2, 0.62);
  mesh(new THREE.BoxGeometry(0.75, 0.22, 0.12), gold, head, 0, 3.35, 0.62);
  mesh(new THREE.BoxGeometry(0.2, 2.2, 0.08), gold, head, 0, 2.9, 0.58, 0, 0, 0);
  const halo = pv(0, 1.9, -1.15, head);
  mesh(new THREE.TorusGeometry(2.4, 0.13, 8, 40), holy, halo);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const c = mesh(new THREE.ConeGeometry(0.14, i % 2 ? 0.6 : 1.0, 5), gold, halo, Math.cos(a) * 2.75, Math.sin(a) * 2.75, 0);
    c.rotation.z = a - Math.PI / 2;
  }
  // arms
  const arms: THREE.Group[] = [], elbows: THREE.Group[] = [], hands: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pv(s * 3.05, 3.4, 0, torso);
    mesh(new THREE.CylinderGeometry(0.72, 0.62, 2.6, 12), ironD, a, 0, -1.3, 0);
    const el = pv(0, -2.6, 0, a);
    mesh(new THREE.SphereGeometry(0.72, 12, 8), gold, el);
    const vb = mesh(lathe([[0.62, 0], [0.72, 0.5], [0.9, 1.9], [1.0, 2.25], [0, 2.3]], 14), iron, el);
    vb.rotation.x = Math.PI;
    mesh(new THREE.TorusGeometry(0.9, 0.1, 5, 16), gold, el, 0, -1.9, 0, Math.PI / 2, 0, 0);
    const h = pv(0, -2.55, 0.1, el);
    mesh(new THREE.BoxGeometry(1.0, 0.9, 1.15), iron, h);
    for (let f = 0; f < 4; f++) mesh(new THREE.BoxGeometry(0.2, 0.55, 0.26), ironD, h, -0.36 + f * 0.24, -0.62, 0.35, 0.5, 0, 0);
    arms.push(a);
    elbows.push(el);
    hands.push(h);
  }
  // crozier in the right hand
  const staff = pv(0, -0.1, 0.4, hands[1]);
  mesh(new THREE.CylinderGeometry(0.17, 0.17, 14, 8), gold, staff, 0, 1.5, 0);
  for (const y of [-2.5, 2.8, 6.4]) mesh(new THREE.SphereGeometry(0.34, 10, 8), gold, staff, 0, y, 0);
  mesh(taperTube([V3(0, 8.3, 0), V3(0, 9.4, 0), V3(0, 10.5, 0.35), V3(0, 11.0, 1.3), V3(0, 10.6, 2.2), V3(0, 9.7, 2.3), V3(0, 9.25, 1.7), V3(0, 9.5, 1.15)], 0.22, 0.1, 40, 8), gold, staff);
  const staffOrb = mesh(new THREE.SphereGeometry(0.46, 14, 10), holy, staff, 0, 9.95, 1.3);
  spikes(staff, [V3(0, 10.2, -0.1), V3(0, 11.05, 0.8), V3(0, 10.9, 1.9)], [V3(0, 0.3, -1), V3(0, 1, -0.2), V3(0, 1, 0.6)], 0.12, 0.6, gold);
  // censer on a chain in the left hand
  const chainG = pv(0, -0.5, 0.1, hands[0]);
  chainG.add(chain(10, 0.42, gold));
  const censer = pv(0, -3.7, 0, chainG);
  mesh(lathe([[0, 1.05], [0.35, 0.95], [0.62, 0.7], [0.95, 0.3], [1.0, 0], [0.9, -0.45], [0.55, -0.85], [0, -0.95]], 18), gold, censer);
  mesh(new THREE.ConeGeometry(0.22, 0.7, 6), gold, censer, 0, 1.3, 0);
  mesh(new THREE.SphereGeometry(0.62, 12, 10), glow(0xff8a30, 3.4), censer, 0, 0, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    mesh(new THREE.BoxGeometry(0.2, 0.42, 0.12), glow(0xffb040, 4), censer, Math.cos(a) * 0.98, 0.05, Math.sin(a) * 0.98, 0, -a, 0);
  }
  // cape
  const cape = clothMesh(5.8, 9.6, red, 8, 14);
  cape.position.set(0, 4.15, -1.95);
  cape.rotation.x = 0.1;
  torso.add(cape);
  return {
    root,
    parts: { hips, torso, head, legL: legs[0], legR: legs[1], kneeL: knees[0], kneeR: knees[1], armL: arms[0], armR: arms[1], elL: elbows[0], elR: elbows[1], staff, staffOrb, chain: chainG, censer, core, halo, cape, skirt, tabard: tabF },
  };
}

export function bishopAnim(e: Enemy, dt: number, w?: World) {
  const p = e.visual.parts;
  const sp = Math.hypot(e.vel.x, e.vel.z);
  e.walkPhase += sp * dt * 0.22;
  const k = Math.min(1, sp / 3);
  const s = Math.sin(e.walkPhase * 2) * 0.45 * k;
  p.legL.rotation.x = s;
  p.legR.rotation.x = -s;
  p.kneeL.rotation.x = Math.max(0, -s) * 0.9;
  p.kneeR.rotation.x = Math.max(0, s) * 0.9;
  p.hips.position.y = 6.4 + Math.abs(Math.cos(e.walkPhase * 2)) * 0.25 * k + Math.sin(e.st * 1.6) * 0.06;
  p.skirt.rotation.z = Math.sin(e.walkPhase * 2) * 0.05 * k;
  const t = e.walkPhase + e.st;
  const cast = e.state === 'ring' || e.state === 'summon';
  const slam = e.state === 'slam';
  // arms: right holds the crozier high when casting; both raise on slam
  p.armR.rotation.x = damp(p.armR.rotation.x, cast ? -2.5 : slam ? -2.9 : -0.35 + Math.sin(t * 1.3) * 0.05, 4, dt);
  p.armR.rotation.z = damp(p.armR.rotation.z, cast ? 0.25 : 0.1, 4, dt);
  p.elR.rotation.x = damp(p.elR.rotation.x, cast ? -0.2 : -0.7, 4, dt);
  p.staff.rotation.x = -(p.armR.rotation.x + p.elR.rotation.x) * 0.92;
  p.armL.rotation.x = damp(p.armL.rotation.x, slam ? -2.9 : -0.25 + Math.sin(e.walkPhase * 2) * 0.25 * k, 4, dt);
  p.elL.rotation.x = damp(p.elL.rotation.x, -0.5, 4, dt);
  p.chain.rotation.x = Math.sin(e.st * 2.2) * 0.5 + p.armL.rotation.x * -0.6;
  p.chain.rotation.z = Math.cos(e.st * 1.7) * 0.25;
  p.torso.rotation.x = damp(p.torso.rotation.x, e.state === 'lance' ? 0.18 : slam && e.st > 1.4 ? 0.35 : 0, 4, dt);
  p.torso.scale.y = 1 + Math.sin(e.st * 1.6) * 0.012;
  p.head.rotation.x = damp(p.head.rotation.x, e.state === 'lance' ? 0.15 : -0.05, 3, dt);
  p.halo.rotation.z += dt * (cast || e.state === 'lance' ? 3 : 0.4);
  p.halo.scale.setScalar(cast ? 1.12 + Math.sin(e.st * 12) * 0.05 : 1);
  const pulse = 1 + Math.sin(e.st * (e.state === 'lance' ? 22 : 4)) * 0.12;
  p.core.scale.setScalar(pulse * (e.state === 'lance' ? 1.5 : 1));
  p.staffOrb.scale.setScalar(cast ? 1.6 + Math.sin(e.st * 18) * 0.2 : 1);
  if ((e.id + Math.floor(e.st * 60)) % 2 === 0) {
    waveCloth(p.cape as THREE.Mesh, e.st, 0.35 + k * 0.4, 0.9, k * 0.8);
    waveCloth(p.tabard as THREE.Mesh, e.st + 1, 0.12 + k * 0.2, 1.3);
  }
  if (w && e.alive) {
    const fx = w.fx;
    p.censer.getWorldPosition(tmp);
    if (Math.random() < dt * 14) fx.smokePuff(tmp.x, tmp.y + 1.2, tmp.z, (Math.random() - 0.5) * 1.5, 2.5, (Math.random() - 0.5) * 1.5, 0.7, 0.75, 1.4);
    if (Math.random() < dt * 20) fx.add.emit(tmp.x, tmp.y, tmp.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3, 0.8, 0.18, 0.04, 4, 2, 0.5, 1, { shape: SHAPE_CORE });
    p.halo.getWorldPosition(tmp);
    if (Math.random() < dt * 16) {
      const a = Math.random() * Math.PI * 2;
      fx.add.emit(tmp.x + Math.cos(a) * 2.6, tmp.y + Math.sin(a) * 2.6, tmp.z, 0, 0.5, 0, 0.9, 0.3, 0.05, 3, 2.4, 1, 1, { shape: SHAPE_DOT });
    }
    p.core.getWorldPosition(tmp);
    w.lightFlash(tmp.x + Math.sin(e.heading) * 3, tmp.y, tmp.z + Math.cos(e.heading) * 3, 0xffd080, e.state === 'lance' ? 7 : 2.5, 22);
  }
}

// ======================================================================= HOARDLORD
function bannerTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a1a4a';
  g.fillRect(0, 0, 256, 384);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, 0, 40, 384);
  g.fillRect(216, 0, 40, 384);
  g.strokeStyle = '#e0aa2a';
  g.lineWidth = 10;
  g.strokeRect(6, 6, 244, 372);
  g.fillStyle = '#f2e6c8';
  g.font = '40px "Permanent Marker", sans-serif';
  g.textAlign = 'center';
  ['ALL', 'TREASURE', 'EVENTUALLY', 'DRIVES', 'TO ME'].forEach((t, i) => g.fillText(t, 128, 70 + i * 62));
  g.fillStyle = '#e0aa2a';
  g.beginPath();
  g.moveTo(88, 360);
  g.lineTo(84, 330);
  g.lineTo(106, 344);
  g.lineTo(128, 322);
  g.lineTo(150, 344);
  g.lineTo(172, 330);
  g.lineTo(168, 360);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function hoardModel(): EnemyVisual {
  const root = new THREE.Group();
  const boneM = rimToon(0xffffff, 0xd8b0ff, { map: boneTexture() });
  const boneD = rimToon(0xc8b690, 0xb080ff);
  const gold = rimToon(0xf2b632, 0xfff2b0, { emissive: 0x6a4000, emissiveIntensity: 0.8 });
  const wood = rimToon(0xffffff, 0xffc080, { map: woodTexture(9, '#6a3a1a') });
  const iron = rimToon(0x3a3a44, 0x9a8ac0);
  const purple = glow(0xb448ff, 4);
  const hwTex = membraneTexture('#6a2e8e', '#c47aff', '#a040e0', 'hoardWing');
  const memb = rimToon(0xffffff, 0xd080ff, { map: hwTex, side: THREE.DoubleSide });
  memb.alphaTest = 0.5;
  memb.emissiveMap = hwTex;
  memb.emissive.set(0x40205a);
  const body = pv(0, 0, 0, root);
  // --- war cart hull
  const hs = new THREE.Shape([new THREE.Vector2(-5.2, 1.3), new THREE.Vector2(4.9, 1.3), new THREE.Vector2(6.0, 2.5), new THREE.Vector2(5.7, 3.7), new THREE.Vector2(-4.9, 3.7), new THREE.Vector2(-5.7, 2.5)]);
  const hull = new THREE.ExtrudeGeometry(hs, { depth: 5.8, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2 });
  hull.translate(0, 0, -2.9);
  hull.rotateY(-Math.PI / 2);
  mesh(hull, wood, body);
  for (const s of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.34, 0.4, 10.8), gold, body, s * 3.25, 3.85, 0.2);
    for (let i = 0; i < 3; i++) {
      const sh = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.2, 16), gold, body, s * 3.3, 2.55, -2.5 + i * 2.6, 0, 0, Math.PI / 2);
      mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.24, 16), i === 1 ? rimToon(0x8e1420, 0xff8080) : rimToon(0x2a4aa0, 0x80a0ff), sh, 0, 0, 0);
    }
  }
  mesh(new THREE.BoxGeometry(6.9, 0.4, 0.34), gold, body, 0, 3.85, 5.55);
  mesh(new THREE.BoxGeometry(6.9, 0.4, 0.34), gold, body, 0, 3.85, -5.15);
  // figurehead skull
  const fh = skull({ len: 1.8, w: 1.3, h: 1.1, snout: 1.6 });
  const fig = mesh(fh.geo, boneM, body, 0, 2.6, 6.3);
  for (const ep of fh.eyes) mesh(new THREE.SphereGeometry(0.14, 8, 6), purple, fig, ep.x, ep.y, ep.z);
  // wheels with spiked golden hubs
  const wheels: THREE.Group[] = [];
  for (const [x, z] of [[-3.7, 3.4], [3.7, 3.4], [-3.7, -3.2], [3.7, -3.2]]) {
    const wp = pv(x, 2.0, z, root);
    const spin = pv(0, 0, 0, wp);
    mesh(new THREE.TorusGeometry(1.75, 0.38, 8, 24), iron, spin, 0, 0, 0, 0, Math.PI / 2, 0);
    for (let k = 0; k < 6; k++) mesh(new THREE.BoxGeometry(0.3, 3.4, 0.22), wood, spin, 0, 0, 0, (k / 6) * Math.PI, 0, 0);
    mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.9, 12), gold, spin, 0, 0, 0, 0, 0, Math.PI / 2);
    const sgn = x < 0 ? -1 : 1;
    mesh(new THREE.ConeGeometry(0.28, 1.4, 6), gold, spin, sgn * 1.05, 0, 0, 0, 0, -sgn * Math.PI / 2);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const c = mesh(new THREE.ConeGeometry(0.16, 0.6, 5), gold, spin, 0, Math.cos(a) * 2.2, Math.sin(a) * 2.2);
      c.rotation.x = a;
    }
    wheels.push(spin);
  }
  // hoard mound + coins + gems + chests
  mesh(mound(3.3, 2.2, 5.0, 7, 0.14), gold, body, 0, 3.7, -0.4);
  const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 10);
  const coins = new THREE.InstancedMesh(coinGeo, gold, 90);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
    const x = Math.cos(a) * r * 3.2, z = Math.sin(a) * r * 4.8 - 0.4;
    const y = 3.7 + 2.2 * Math.sqrt(Math.max(0, 1 - r * r)) + 0.05;
    mm.compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3)), V3(1, 1, 1));
    coins.setMatrixAt(i, mm);
  }
  coins.castShadow = true;
  body.add(coins);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const gem = mesh(new THREE.OctahedronGeometry(0.4), glow(i % 3 === 0 ? 0xff2a60 : i % 3 === 1 ? 0x30ff90 : 0x40a0ff, 2.6), body, Math.cos(a) * 2.2, 5.0 + (i % 2) * 0.4, Math.sin(a) * 3.3 - 0.4);
    gem.scale.set(0.8, 1.3, 0.8);
  }
  for (const [x, z, r] of [[-1.9, -3.4, 0.4], [2.1, 2.6, -0.5]]) {
    const ch = pv(x, 4.7, z, body);
    ch.rotation.set(0.2, r, 0.1);
    mesh(new THREE.BoxGeometry(1.5, 0.9, 1.0), wood, ch);
    mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 10, 1, false, 0, Math.PI), gold, ch, 0, 0.45, 0, 0, 0, Math.PI / 2);
  }
  // --- dragon skeleton rising out of the hoard
  const spinePts = [V3(0, 4.3, -4.2), V3(0, 5.8, -2.4), V3(0, 7.3, -0.2), V3(0, 8.1, 1.7)];
  mesh(taperTube(spinePts, 0.62, 0.46, 30, 10), boneM, body);
  const spineCurve = new THREE.CatmullRomCurve3(spinePts);
  const sp: THREE.Vector3[] = [], sd: THREE.Vector3[] = [];
  for (let i = 0; i < 9; i++) {
    const t = 0.08 + (i / 8) * 0.88;
    sp.push(spineCurve.getPointAt(t).add(V3(0, 0.4, 0)));
    sd.push(V3(0, 1, -0.45));
  }
  spikes(body, sp, sd, 0.2, 1.0, boneD);
  for (let i = 0; i < 6; i++) {
    const t = 0.18 + i * 0.13;
    const c = spineCurve.getPointAt(t);
    for (const s of [-1, 1]) {
      mesh(taperTube([c.clone().add(V3(s * 0.3, 0, 0)), c.clone().add(V3(s * 2.1, -0.5, 0.3)), c.clone().add(V3(s * 2.8, -2.2, 0.6)), V3(s * 2.4, 4.2, c.z + 0.8)], 0.24, 0.12, 16, 7), boneM, body);
    }
  }
  // clawed forearms gripping the front rail
  for (const s of [-1, 1]) {
    const sh = V3(s * 1.7, 7.7, 1.6), el = V3(s * 3.3, 5.5, 3.6), wr = V3(s * 2.8, 4.2, 5.3);
    body.add(bone(sh, el, 0.34, boneM), bone(el, wr, 0.28, boneM));
    mesh(new THREE.SphereGeometry(0.5, 10, 8), boneD, body, el.x, el.y, el.z);
    for (let f = -1; f <= 1; f++) {
      const a = wr.clone(), b = V3(wr.x + f * 0.45, 3.9, 5.9);
      mesh(taperTube([a, b, V3(b.x, 3.1, 6.1)], 0.16, 0.05, 8, 6), boneD, body);
    }
  }
  // neck (3 articulated segments)
  const neck = pv(0, 8.1, 1.9, body);
  const segs: THREE.Group[] = [];
  let par: THREE.Object3D = neck;
  for (let i = 0; i < 3; i++) {
    const seg = pv(0, 0, 0, par);
    if (i > 0) seg.position.set(0, 1.05, 0.75);
    mesh(new THREE.SphereGeometry(0.62 - i * 0.05, 12, 10), boneM, seg);
    mesh(new THREE.TorusGeometry(0.62 - i * 0.05, 0.1, 6, 16), gold, seg, 0, 0, 0, 0.6, 0, 0);
    mesh(new THREE.ConeGeometry(0.15, 0.8, 5), boneD, seg, 0, 0.6, -0.25, -0.5, 0, 0);
    mesh(taperTube([V3(0, 0, 0), V3(0, 0.55, 0.35), V3(0, 1.05, 0.75)], 0.42, 0.38, 6, 8), boneM, seg);
    segs.push(seg);
    par = seg;
  }
  const skullP = pv(0, 1.35, 1.0, par);
  const sk = skull({ len: 4.4, w: 2.5, h: 2.1, snout: 2.15 });
  const skM = mesh(sk.geo, boneM, skullP, 0, 0, 0.9);
  const eyes = sk.eyes.map((ep) => mesh(new THREE.SphereGeometry(0.34, 12, 10), purple, skM, ep.x, ep.y, ep.z));
  for (const tp of sk.teeth) {
    const c = mesh(new THREE.ConeGeometry(0.11, 0.5, 5), rimToon(0xfaf6ea, 0xffffff), skM, tp.x, tp.y - 0.15, tp.z);
    c.rotation.x = Math.PI;
  }
  for (const s of [-1, 1]) {
    mesh(taperTube([V3(s * 0.75, 0.55, 0.2), V3(s * 1.2, 1.25, -0.8), V3(s * 1.35, 1.55, -2.1), V3(s * 1.05, 1.25, -3.3)], 0.38, 0.03, 20, 8), boneD, skullP);
    mesh(taperTube([V3(s * 1.1, -0.1, 0.6), V3(s * 1.7, 0.1, 0.1), V3(s * 2.1, 0.5, -0.5)], 0.18, 0.02, 10, 6), boneD, skullP);
  }
  const crown = pv(0, 1.05, -0.1, skullP);
  mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.6, 16, 1, true), gold, crown).material = rimToon(0xf2b632, 0xfff2b0, { emissive: 0x6a4000, emissiveIntensity: 0.8, side: THREE.DoubleSide });
  mesh(new THREE.TorusGeometry(1.15, 0.12, 6, 20), gold, crown, 0, -0.3, 0, Math.PI / 2, 0, 0);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    mesh(new THREE.ConeGeometry(0.2, k % 2 ? 0.7 : 1.1, 5), gold, crown, Math.cos(a) * 1.02, 0.6 + (k % 2 ? 0 : 0.2), Math.sin(a) * 1.02);
    mesh(new THREE.OctahedronGeometry(0.13), glow(k % 2 ? 0x30ff90 : 0xff2a60, 3), crown, Math.cos(a) * 1.12, 0.05, Math.sin(a) * 1.12);
  }
  const jaw = pv(0, -0.55, -0.3, skullP);
  mesh(jawGeo(3.9, 1.95, 0.5, 0.36), boneD, jaw);
  for (const tp of jawArc(3.9, 1.95, 16, 0.22)) mesh(new THREE.ConeGeometry(0.1, 0.42, 5), rimToon(0xfaf6ea, 0xffffff), jaw, tp.x, 0.18, tp.z);
  const throat = mesh(new THREE.SphereGeometry(0.62, 12, 10), purple, jaw, 0, 0.15, 1.4);
  // bone wings with tattered membranes
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const wp = pv(s * 1.9, 7.7, 0.5, body);
    const wg = pv(0, 0, 0, wp);
    wg.scale.x = s;
    wg.rotation.y = s * 0.45;
    const tips = [new THREE.Vector2(7.0, 5.0), new THREE.Vector2(8.8, 2.0), new THREE.Vector2(8.0, -1.2), new THREE.Vector2(5.2, -3.3)];
    const elbow = V3(3.0, 1.8, 0);
    wg.add(bone(V3(0, 0, 0), elbow, 0.3, boneM));
    for (const t of tips) wg.add(bone(elbow, V3(t.x, t.y, 0), 0.16, boneM));
    mesh(new THREE.SphereGeometry(0.42, 10, 8), boneD, wg, elbow.x, elbow.y, 0);
    mesh(new THREE.ConeGeometry(0.2, 0.9, 5), boneD, wg, elbow.x + 0.3, elbow.y + 0.6, 0, 0, 0, -0.5);
    const mem = mesh(membraneGeo(tips, new THREE.Vector2(1.0, -3.0)), memb, wg, 0, 0, -0.05);
    mem.castShadow = true;
    wings.push(wp);
  }
  // banner
  mesh(new THREE.CylinderGeometry(0.12, 0.12, 8.5, 6), iron, body, 1.8, 7.5, -4.9);
  mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 6), gold, body, 1.8, 11.2, -4.9, 0, 0, Math.PI / 2);
  const banner = clothMesh(2.8, 4.2, rimToon(0xffffff, 0xd8a0ff, { map: bannerTexture(), side: THREE.DoubleSide }), 5, 8);
  banner.position.set(1.8, 11.2, -4.95);
  banner.rotation.y = Math.PI;
  body.add(banner);
  // lanterns
  for (const s of [-1, 1]) {
    const l = pv(s * 3.0, 5.5, 5.6, body);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), iron, l, 0, 0.6, 0);
    mesh(new THREE.SphereGeometry(0.42, 10, 8), glow(0xffb040, 3.5), l, 0, -0.2, 0);
    mesh(new THREE.ConeGeometry(0.5, 0.5, 6), gold, l, 0, 0.3, 0);
  }
  return { root, parts: { body, neck, s0: segs[0], s1: segs[1], s2: segs[2], skull: skullP, jaw, throat, crown, wingL: wings[0], wingR: wings[1], w0: wheels[0], w1: wheels[1], w2: wheels[2], w3: wheels[3], banner, eyeL: eyes[0], eyeR: eyes[1] } };
}

export function hoardAnim(e: Enemy, dt: number, w?: World) {
  const p = e.visual.parts;
  e.walkPhase += e.aux2 * dt;
  for (const k of ['w0', 'w1', 'w2', 'w3']) p[k].rotation.x = e.walkPhase / 2;
  const breath = e.state === 'breath', coins = e.state === 'coins', stun = e.state === 'stunned';
  const open = breath ? 0.75 : coins ? 0.55 + Math.sin(e.st * 20) * 0.1 : e.state === 'chargeWind' ? 0.45 : 0.12 + Math.sin(e.st * 2) * 0.06;
  p.jaw.rotation.x = damp(p.jaw.rotation.x, open, 8, dt);
  p.throat.scale.setScalar(breath ? 1.5 + Math.sin(e.st * 30) * 0.2 : 1);
  const neckX = e.state === 'charge' ? 0.55 : stun ? 1.0 : coins ? -0.25 : breath ? 0.2 : Math.sin(e.st * 1.1) * 0.08;
  p.neck.rotation.x = damp(p.neck.rotation.x, neckX, 4, dt);
  p.s1.rotation.x = damp(p.s1.rotation.x, stun ? 0.4 : -0.1 + Math.sin(e.st * 1.3) * 0.06, 4, dt);
  p.s2.rotation.x = damp(p.s2.rotation.x, breath ? 0.25 : -0.15, 4, dt);
  p.s0.rotation.y = Math.sin(e.st * 0.9) * 0.12;
  p.skull.rotation.z = stun ? Math.sin(e.st * 6) * 0.2 : 0;
  const flap = e.state === 'charge' ? 0.5 + Math.sin(e.st * 14) * 0.25 : Math.sin(e.st * 2.2) * 0.22;
  p.wingL.rotation.z = flap;
  p.wingR.rotation.z = -flap;
  p.body.position.y = Math.abs(Math.sin(e.walkPhase * 0.6)) * 0.18;
  p.body.rotation.z = Math.sin(e.walkPhase * 0.3) * 0.02;
  if ((e.id + Math.floor(e.st * 60)) % 2 === 0) waveCloth(p.banner as THREE.Mesh, e.st, 0.25 + Math.min(1, Math.abs(e.aux2) / 30) * 0.3, 1.1, Math.min(1, Math.abs(e.aux2) / 30) * 0.8);
  if (w && e.alive) {
    const fx = w.fx;
    for (const k of ['eyeL', 'eyeR']) {
      p[k].getWorldPosition(tmp);
      if (Math.random() < dt * 22) fx.add.emit(tmp.x, tmp.y, tmp.z, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.5, 0.45, 0.45, 0.05, 1.8, 0.6, 3.5, 1, { shape: SHAPE_DOT });
    }
    if (Math.random() < dt * 6) {
      p.body.getWorldPosition(tmp);
      fx.add.emit(tmp.x + (Math.random() - 0.5) * 6, tmp.y + 6, tmp.z + (Math.random() - 0.5) * 8, 0, 1.5, 0, 0.8, 0.35, 0.05, 3, 2.4, 0.8, 1, { shape: 2 });
    }
    if (breath || coins) {
      p.throat.getWorldPosition(tmp);
      w.lightFlash(tmp.x, tmp.y, tmp.z, breath ? 0xb040ff : 0xffc040, 5, 22);
    }
    if (e.state === 'charge' && Math.random() < 0.6) {
      p.w0.getWorldPosition(tmp);
      fx.sparks(tmp.x, 0.3, tmp.z, 0, 1, 0, 3, [1, 0.8, 0.3], 12);
      p.w1.getWorldPosition(tmp);
      fx.sparks(tmp.x, 0.3, tmp.z, 0, 1, 0, 3, [1, 0.8, 0.3], 12);
    }
  }
}

// ======================================================================= BONE SOVEREIGN
export function sovereignModel(): EnemyVisual {
  const root = new THREE.Group();
  const boneM = rimToon(0xffffff, 0xffa050, { map: boneTexture('#e6d6b4', '#a88a5a', 'boneWarm') });
  const charred = rimToon(0x4a3a30, 0xff7a30);
  const gold = rimToon(0xf2b632, 0xfff2b0, { emissive: 0x6a3000, emissiveIntensity: 0.8 });
  const goldD = rimToon(0xf2b632, 0xfff2b0, { emissive: 0x6a3000, emissiveIntensity: 0.8, side: THREE.DoubleSide });
  const fire = glow(0xff6a20, 2.6);
  const hot = glow(0xffe0a0, 3.2);
  const swTex = membraneTexture('#8a2014', '#ff9a3a', '#ff4a1a', 'sovWing');
  const memb = rimToon(0xffffff, 0xff8040, { map: swTex, side: THREE.DoubleSide });
  memb.alphaTest = 0.5;
  memb.emissiveMap = swTex;
  memb.emissive.set(0x6a2410);
  const teethM = rimToon(0xfaf2e0, 0xffffff);
  const body = pv(0, 0, 0, root);

  // pelvis & hind legs
  const hips = pv(0, 7.0, -4.6, body);
  const pel = mesh(new THREE.SphereGeometry(1.6, 16, 12), boneM, hips);
  pel.scale.set(1.5, 0.8, 1.1);
  for (const s of [-1, 1]) {
    const il = mesh(new THREE.SphereGeometry(1.3, 14, 10, 0, Math.PI), boneM, hips, s * 1.4, 0.5, 0, 0, s * 1.2, 0.3 * s);
    il.scale.set(1, 1.2, 0.35);
  }
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = pv(s * 2.3, 0, 0, hips);
    leg.add(bone(V3(0, 0, 0), V3(s * 0.5, -3.6, 2.3), 0.52, boneM));
    const knee = pv(s * 0.5, -3.6, 2.3, leg);
    mesh(new THREE.SphereGeometry(0.62, 12, 10), charred, knee);
    knee.add(bone(V3(0, 0, 0), V3(0, -2.3, -2.2), 0.4, boneM));
    const ankle = pv(0, -2.3, -2.2, knee);
    mesh(new THREE.SphereGeometry(0.45, 10, 8), gold, ankle);
    ankle.add(bone(V3(0, 0, 0), V3(0, -0.8, 1.3), 0.32, boneM));
    for (let f = -1; f <= 1; f++) {
      mesh(taperTube([V3(0, -0.8, 1.3), V3(f * 0.6, -1.0, 2.3), V3(f * 0.8, -1.05, 3.1)], 0.2, 0.08, 8, 6), boneM, ankle);
      mesh(new THREE.ConeGeometry(0.13, 0.8, 5), charred, ankle, f * 0.85, -1.05, 3.45, Math.PI / 2, 0, 0);
    }
    legs.push(leg);
    knees.push(knee);
  }
  // spine with vertebra spikes
  const spinePts = [V3(0, 7.3, -6.4), V3(0, 7.6, -4.6), V3(0, 8.9, -2.2), V3(0, 9.9, 0.6), V3(0, 10.3, 2.9), V3(0, 10.6, 4.4)];
  mesh(taperTube(spinePts, 0.78, 0.62, 36, 10), boneM, body);
  const spc = new THREE.CatmullRomCurve3(spinePts);
  const vp: THREE.Vector3[] = [], vd: THREE.Vector3[] = [];
  for (let i = 0; i < 12; i++) {
    const t = 0.05 + (i / 11) * 0.9;
    vp.push(spc.getPointAt(t).add(V3(0, 0.55, 0)));
    vd.push(V3(0, 1, -0.5));
  }
  spikes(body, vp, vd, 0.26, 1.4, charred);
  for (let i = 0; i < 12; i += 3) {
    const t = 0.05 + (i / 11) * 0.9;
    const c = spc.getPointAt(t);
    const tan = spc.getTangentAt(t);
    const ring = mesh(new THREE.TorusGeometry(0.82, 0.13, 6, 18), gold, body, c.x, c.y, c.z);
    ring.quaternion.setFromUnitVectors(V3(0, 0, 1), tan);
  }
  // ribcage + sternum
  for (let i = 0; i < 7; i++) {
    const t = 0.32 + i * 0.075;
    const c = spc.getPointAt(t);
    const r = 1 - Math.abs(i - 3) * 0.08;
    for (const s of [-1, 1]) {
      mesh(taperTube([c.clone().add(V3(s * 0.4, 0, 0)), c.clone().add(V3(s * 2.7 * r, -0.4, 0.2)), c.clone().add(V3(s * 3.4 * r, -2.6, 0.5)), c.clone().add(V3(s * 2.7 * r, -4.7, 0.8)), V3(s * 0.7, 4.6 + i * 0.12, c.z + 0.9)], 0.3, 0.17, 20, 7), boneM, body);
    }
  }
  mesh(taperTube([V3(0, 4.3, -2.0), V3(0, 4.6, 0.8), V3(0, 5.3, 3.8)], 0.4, 0.3, 12, 8), boneM, body);
  // burning heart inside the ribcage
  const heart = pv(0, 7.3, 0.6, body);
  mesh(new THREE.SphereGeometry(1.1, 18, 14), fire, heart);
  mesh(new THREE.SphereGeometry(0.55, 14, 10), hot, heart);
  // forelimbs planted on the ground
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pv(s * 2.9, 9.5, 3.3, body);
    a.add(bone(V3(0, 0, 0), V3(s * 1.0, -3.8, 1.3), 0.5, boneM));
    const el = pv(s * 1.0, -3.8, 1.3, a);
    mesh(new THREE.SphereGeometry(0.6, 12, 10), charred, el);
    mesh(new THREE.ConeGeometry(0.22, 1.2, 5), charred, el, s * 0.3, 0.3, -0.7, -1.9, 0, 0);
    el.add(bone(V3(0, 0, 0), V3(-s * 0.2, -3.6, 1.6), 0.42, boneM));
    const hand = pv(-s * 0.2, -3.6, 1.6, el);
    mesh(new THREE.SphereGeometry(0.45, 10, 8), gold, hand);
    for (let f = 0; f < 4; f++) {
      const ang = -0.6 + f * 0.4;
      const tip = V3(Math.sin(ang) * 1.9, -1.2, Math.cos(ang) * 1.9);
      mesh(taperTube([V3(0, 0, 0), V3(tip.x * 0.55, -0.45, tip.z * 0.55), tip], 0.18, 0.07, 10, 6), boneM, hand);
      const cl = mesh(new THREE.ConeGeometry(0.14, 0.9, 5), goldD, hand, tip.x * 1.12, tip.y - 0.1, tip.z * 1.12);
      cl.rotation.set(Math.PI / 2 + 0.4, ang, 0);
    }
    arms.push(a);
  }
  // neck
  const neck = pv(0, 10.5, 4.6, body);
  const nsegs: THREE.Group[] = [];
  let par: THREE.Object3D = neck;
  for (let i = 0; i < 6; i++) {
    const seg = pv(0, 0, 0, par);
    if (i > 0) seg.position.set(0, 1.0, 0.45);
    seg.rotation.x = -0.05;
    const r = 0.78 - i * 0.05;
    mesh(new THREE.SphereGeometry(r, 12, 10), boneM, seg);
    mesh(new THREE.ConeGeometry(0.2, 1.0, 5), charred, seg, 0, 0.6, -0.4, -0.7, 0, 0);
    mesh(taperTube([V3(0, 0, 0), V3(0, 0.5, 0.22), V3(0, 1.0, 0.45)], r * 0.7, r * 0.66, 6, 8), boneM, seg);
    if (i % 2 === 0) mesh(new THREE.TorusGeometry(r * 0.95, 0.1, 6, 16), gold, seg, 0, 0.5, 0.22, 1.1, 0, 0);
    nsegs.push(seg);
    par = seg;
  }
  // skull
  const skullP = pv(0, 1.3, 0.8, par);
  skullP.rotation.x = 0.28;
  const sk = skull({ len: 5.6, w: 3.3, h: 2.8, snout: 2.0, socket: 0.45 });
  const skM = mesh(sk.geo, boneM, skullP, 0, 0, 1.2);
  const eyes = sk.eyes.map((ep) => mesh(new THREE.SphereGeometry(0.3, 12, 10), glow(0xff3010, 3), skM, ep.x, ep.y, ep.z));
  for (const tp of sk.teeth) {
    const c = mesh(new THREE.ConeGeometry(0.15, 0.75, 5), teethM, skM, tp.x, tp.y - 0.2, tp.z);
    c.rotation.x = Math.PI;
  }
  for (const s of [-1, 1]) {
    mesh(taperTube([V3(s * 1.0, 0.8, 0.2), V3(s * 1.7, 1.9, -1.2), V3(s * 1.9, 2.3, -3.0), V3(s * 1.4, 1.6, -4.6), V3(s * 0.9, 0.8, -5.2)], 0.4, 0.03, 30, 8), charred, skullP);
    mesh(taperTube([V3(s * 1.4, 0.2, 0.6), V3(s * 2.4, 0.7, -0.2), V3(s * 3.0, 1.5, -0.8)], 0.3, 0.03, 12, 6), charred, skullP);
    mesh(new THREE.TorusGeometry(0.5, 0.1, 6, 14), gold, skullP, s * 1.75, 2.05, -1.9, 0.8, s * 0.6, 0);
  }
  const crown = pv(0, 1.35, 0.2, skullP);
  mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.8, 18, 1, true), goldD, crown);
  mesh(new THREE.TorusGeometry(1.7, 0.16, 6, 24), gold, crown, 0, -0.4, 0, Math.PI / 2, 0, 0);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    mesh(new THREE.ConeGeometry(0.3, k % 2 ? 1.1 : 1.8, 5), gold, crown, Math.cos(a) * 1.5, 0.9 + (k % 2 ? 0 : 0.35), Math.sin(a) * 1.5);
    mesh(new THREE.OctahedronGeometry(0.2), glow(0xff2020, 3), crown, Math.cos(a) * 1.62, 0.05, Math.sin(a) * 1.62);
  }
  const jaw = pv(0, -0.95, 0.0, skullP);
  mesh(jawGeo(5.3, 2.6, 0.62, 0.5), boneM, jaw);
  for (const tp of jawArc(5.3, 2.6, 18, 0.3)) mesh(new THREE.ConeGeometry(0.14, 0.65, 5), teethM, jaw, tp.x, 0.26, tp.z);
  const mouthGlow = mesh(new THREE.SphereGeometry(0.5, 12, 10), fire, jaw, 0, 0.35, 1.7);
  // great wings
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const wp = pv(s * 2.5, 10.3, 1.5, body);
    const wg = pv(0, 0, 0, wp);
    wg.scale.x = s;
    wg.rotation.set(0, s * 0.55, 0);
    const tips = [new THREE.Vector2(12.5, 11.5), new THREE.Vector2(16.0, 6.0), new THREE.Vector2(15.5, 0.2), new THREE.Vector2(11.0, -4.5)];
    const el = V3(5.2, 5.4, 0);
    wg.add(bone(V3(0, 0, 0), el, 0.5, boneM));
    mesh(new THREE.SphereGeometry(0.7, 12, 10), charred, wg, el.x, el.y, 0);
    mesh(new THREE.ConeGeometry(0.3, 2.0, 6), goldD, wg, el.x + 0.6, el.y + 1.2, 0, 0, 0, -0.5);
    for (const t of tips) {
      wg.add(bone(el, V3(t.x, t.y, 0), 0.24, boneM));
      mesh(new THREE.ConeGeometry(0.18, 1.0, 5), charred, wg, t.x, t.y, 0, 0, 0, -Math.atan2(t.x - el.x, t.y - el.y));
    }
    const mem = mesh(membraneGeo(tips, new THREE.Vector2(2.0, -4.0)), memb, wg, 0, 0, -0.08);
    mem.castShadow = true;
    wings.push(wp);
  }
  // tail
  const tail = pv(0, 7.3, -6.6, body);
  const tsegs: THREE.Group[] = [];
  let tp: THREE.Object3D = tail;
  for (let i = 0; i < 9; i++) {
    const seg = pv(0, 0, 0, tp);
    if (i > 0) seg.position.set(0, -0.28, -1.15);
    const r = 0.7 - i * 0.06;
    mesh(new THREE.SphereGeometry(r, 10, 8), boneM, seg);
    mesh(new THREE.ConeGeometry(r * 0.35, r * 1.6, 5), charred, seg, 0, r * 0.9, 0, -0.4, 0, 0);
    if (i % 3 === 1) mesh(new THREE.TorusGeometry(r * 0.95, 0.08, 6, 14), gold, seg, 0, 0, 0, 0, 0, 0);
    tsegs.push(seg);
    tp = seg;
  }
  const tipFlame = mesh(new THREE.ConeGeometry(0.55, 2.2, 7), fire, tp, 0, 0, -1.3, -Math.PI / 2, 0, 0);
  return {
    root,
    parts: {
      body, hips, heart, neck, s0: nsegs[0], s2: nsegs[2], s4: nsegs[4], skull: skullP, jaw, mouthGlow, crown, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1], kneeL: knees[0], kneeR: knees[1],
      wingL: wings[0], wingR: wings[1], tail, t0: tsegs[0], t3: tsegs[3], t6: tsegs[6], tipFlame, eyeL: eyes[0], eyeR: eyes[1],
    },
  };
}

export function sovereignAnim(e: Enemy, dt: number, w?: World) {
  const p = e.visual.parts;
  const sp = Math.hypot(e.vel.x, e.vel.z);
  e.walkPhase += sp * dt * 0.28;
  const k = Math.min(1, sp / 3);
  const s = Math.sin(e.walkPhase * 2) * 0.3 * k;
  p.legL.rotation.x = s;
  p.legR.rotation.x = -s;
  p.armL.rotation.x = -s * 0.8;
  p.armR.rotation.x = s * 0.8;
  p.body.position.y = Math.sin(e.st * 1.4) * 0.12 + Math.abs(Math.cos(e.walkPhase * 2)) * 0.25 * k;
  const breath = e.state === 'breath', met = e.state === 'meteors', tailSw = e.state === 'tail';
  p.jaw.rotation.x = damp(p.jaw.rotation.x, breath && e.st > 0.7 ? 0.8 : met && e.st < 1.1 ? 0.65 : 0.08 + Math.sin(e.st * 2) * 0.04, 6, dt);
  p.mouthGlow.scale.setScalar(breath && e.st > 0.5 ? 1.4 + Math.sin(e.st * 25) * 0.2 : 0.35);
  const flap = met ? Math.sin(e.st * 7) * 0.45 : Math.sin(e.st * 1.1) * 0.12;
  p.wingL.rotation.z = flap;
  p.wingR.rotation.z = -flap;
  p.neck.rotation.x = damp(p.neck.rotation.x, breath ? 0.45 : met ? -0.45 : Math.sin(e.st * 0.7) * 0.05, 3, dt);
  p.s2.rotation.x = damp(p.s2.rotation.x, breath ? 0.2 : met ? -0.2 : 0, 3, dt);
  p.s0.rotation.y = Math.sin(e.st * 0.8) * 0.15;
  p.s4.rotation.y = Math.sin(e.st * 0.8 + 1) * 0.1;
  p.tail.rotation.y = tailSw ? Math.sin(e.st * 9) * 1.1 : Math.sin(e.st * 1.1) * 0.25;
  p.t0.rotation.x = Math.sin(e.st * 1.3) * 0.12;
  p.t3.rotation.y = Math.sin(e.st * 1.6 + 1) * 0.2;
  p.t6.rotation.y = Math.sin(e.st * 2.1 + 2) * 0.3;
  p.heart.scale.setScalar(1 + Math.sin(e.st * 5) * 0.12);
  p.tipFlame.scale.set(1 + Math.sin(e.st * 17) * 0.15, 1 + Math.sin(e.st * 13) * 0.25, 1);
  if (w && e.alive) {
    const fx = w.fx;
    for (const kk of ['eyeL', 'eyeR']) {
      p[kk].getWorldPosition(tmp);
      if (Math.random() < dt * 12) fx.fire.emit(tmp.x, tmp.y + 0.3, tmp.z, (Math.random() - 0.5) * 1.2, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 1.2, 0.3, 0.3, [3, 1.2, 0.25], [0.8, 0.1, 0], 2, 4);
    }
    p.heart.getWorldPosition(tmp);
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2;
      fx.add.emit(tmp.x + Math.cos(a) * 1.2, tmp.y, tmp.z + Math.sin(a) * 1.2, 0, 2 + Math.random() * 3, 0, 0.8, 0.3, 0.05, 4, 1.8, 0.4, 1, { shape: SHAPE_CORE });
    }
    w.lightFlash(tmp.x, tmp.y, tmp.z, 0xff6020, 5, 26);
    p.tipFlame.getWorldPosition(tmp);
    if (Math.random() < dt * 18) fx.fire.emit(tmp.x, tmp.y, tmp.z, 0, 2, 0, 0.4, 0.6, [4, 1.6, 0.3], [1, 0.1, 0], 2, 3);
    p.body.getWorldPosition(tmp);
    if (Math.random() < dt * 20) fx.add.emit(tmp.x + (Math.random() - 0.5) * 14, Math.random() * 4, tmp.z + (Math.random() - 0.5) * 14, 0, 2 + Math.random() * 3, 0, 1.6, 0.18, 0.04, 4, 1.4, 0.3, 1, { shape: SHAPE_CORE });
    if (breath && e.st < 1) {
      p.mouthGlow.getWorldPosition(tmp);
      fx.add.emit(tmp.x, tmp.y, tmp.z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.4, 0.5, 0.1, 4, 1.6, 0.3, 1, { shape: SHAPE_DOT });
    }
  }
}
