import * as THREE from 'three';
import { Enemy, type EnemyDef, type EnemyVisual } from './Enemy';
import type { World } from '../game/World';
import { toon, glow } from '../render/Toon';
import { angleDiff, headingOf, clamp, damp } from '../core/MathUtil';
import { audio } from '../audio/Audio';
import { rand } from '../core/Rng';

// ------------------------------------------------------------------ model helpers
const G = {
  box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt: number, rb: number, h: number, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s),
  sph: (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h),
  cone: (r: number, h: number, s = 7) => new THREE.ConeGeometry(r, h, s),
};
function m(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent?: THREE.Object3D) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  if (parent) parent.add(mesh);
  return mesh;
}
function pivot(x: number, y: number, z: number, parent: THREE.Object3D) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const bone = () => toon(0xe8dfc6);
const boneDark = () => toon(0xb8ab88);
const eyeRed = () => glow(0xff2a1a, 4);

function skeleton(kind: 'sword' | 'bow' | 'knight'): EnemyVisual {
  const root = new THREE.Group();
  const B = bone(), D = boneDark();
  const hips = pivot(0, 1.55, 0, root);
  m(G.box(0.7, 0.22, 0.35), D, 0, 0, 0, 0, 0, 0, hips);
  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const leg = pivot(s * 0.26, 0, 0, hips);
    m(G.cyl(0.08, 0.07, 0.8), B, 0, -0.4, 0, 0, 0, 0, leg);
    m(G.sph(0.1, 6, 5), D, 0, -0.8, 0, 0, 0, 0, leg);
    const knee = pivot(0, -0.8, 0, leg);
    m(G.cyl(0.07, 0.06, 0.72), B, 0, -0.36, 0, 0, 0, 0, knee);
    m(G.box(0.18, 0.08, 0.34), D, 0, -0.72, 0.08, 0, 0, 0, knee);
    legs.push(leg);
    knees.push(knee);
  }
  const torso = pivot(0, 0.1, 0, hips);
  m(G.cyl(0.07, 0.07, 1.0), D, 0, 0.5, -0.05, 0, 0, 0, torso);
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.TorusGeometry(0.34 - i * 0.03, 0.05, 5, 12, Math.PI * 1.3);
    m(rib, B, 0, 0.35 + i * 0.17, 0.02, Math.PI / 2, 0, Math.PI * 0.85 + Math.PI, torso);
  }
  m(G.box(1.0, 0.14, 0.24), B, 0, 1.08, 0, 0, 0, 0, torso);
  const arms: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = pivot(s * 0.52, 1.05, 0, torso);
    m(G.cyl(0.065, 0.06, 0.7), B, 0, -0.35, 0, 0, 0, 0, arm);
    const el = pivot(0, -0.7, 0, arm);
    m(G.cyl(0.06, 0.05, 0.62), B, 0, -0.31, 0, 0, 0, 0, el);
    arms.push(arm);
    elbows.push(el);
  }
  const head = pivot(0, 1.32, 0.02, torso);
  m(G.sph(0.34, 10, 8), B, 0, 0.18, 0, 0, 0, 0, head).scale.set(1, 1.05, 1.1);
  m(G.box(0.36, 0.14, 0.3), B, 0, -0.08, 0.1, 0, 0, 0, head);
  const eyes = eyeRed();
  for (const s of [-1, 1]) m(G.sph(0.075, 6, 5), eyes, s * 0.12, 0.2, 0.3, 0, 0, 0, head);
  let weapon: THREE.Object3D | null = null;
  let glowTip: THREE.Object3D | null = null;
  if (kind === 'sword' || kind === 'knight') {
    const hand = pivot(0, -0.62, 0, elbows[1]);
    const w = new THREE.Group();
    m(G.box(0.1, 1.5, 0.24), toon(0xa8adb8), 0, 0.85, 0, 0, 0, 0, w);
    m(G.box(0.5, 0.08, 0.14), toon(0x5a3a1a), 0, 0.1, 0, 0, 0, 0, w);
    w.rotation.x = Math.PI / 2;
    hand.add(w);
    weapon = w;
  }
  if (kind === 'knight') {
    const helm = toon(0x5a5f6e);
    m(G.cyl(0.38, 0.4, 0.42, 10), helm, 0, 0.3, 0, 0, 0, 0, head);
    m(G.box(0.1, 0.35, 0.5), toon(0x8e1420), 0, 0.62, -0.02, 0, 0, 0, head);
    m(G.box(0.85, 0.7, 0.5), helm, 0, 0.72, 0.02, 0, 0, 0, torso);
    const sh = pivot(0, -0.5, 0.1, elbows[0]);
    m(G.box(0.12, 0.9, 0.7), toon(0x8e1420), 0, 0, 0.1, 0, 0, 0, sh);
  }
  if (kind === 'bow') {
    const hand = pivot(0, -0.62, 0, elbows[0]);
    const bow = new THREE.Group();
    m(new THREE.TorusGeometry(0.75, 0.05, 5, 14, Math.PI * 0.9), toon(0x5a3a1a), 0, 0, 0, 0, Math.PI / 2, Math.PI * 0.55, bow);
    m(G.cyl(0.015, 0.015, 1.4, 3), toon(0xe8e0d0), -0.1, 0, 0, 0, 0, 0, bow);
    const tip = m(G.cone(0.08, 0.3, 5), glow(0xff5a2a, 5), 0.1, 0, 0.35, Math.PI / 2, 0, 0, bow);
    tip.visible = false;
    glowTip = tip;
    hand.add(bow);
    weapon = bow;
  }
  return { root, parts: { hips, torso, head, legL: legs[0], legR: legs[1], kneeL: knees[0], kneeR: knees[1], armL: arms[0], armR: arms[1], elL: elbows[0], elR: elbows[1], ...(weapon ? { weapon } : {}), ...(glowTip ? { glowTip } : {}) } };
}

function bipedWalk(e: Enemy, dt: number, stride = 1.3, amp = 0.65) {
  const p = e.visual.parts;
  const sp = Math.hypot(e.vel.x, e.vel.z);
  e.walkPhase += sp * dt * stride * 0.5;
  const s = Math.sin(e.walkPhase * 2) * Math.min(1, sp / 4) * amp;
  if (p.legL) p.legL.rotation.x = s;
  if (p.legR) p.legR.rotation.x = -s;
  if (p.kneeL) p.kneeL.rotation.x = Math.max(0, -s) * 0.9;
  if (p.kneeR) p.kneeR.rotation.x = Math.max(0, s) * 0.9;
  if (p.hips) p.hips.position.y = (p.hips.userData.baseY ??= p.hips.position.y) + Math.abs(Math.cos(e.walkPhase * 2)) * 0.08 * Math.min(1, sp / 4);
  return s;
}

// ------------------------------------------------------------------ shared AI bits
function playerTargetable(w: World) {
  return w.player.alive;
}
function inFront(e: Enemy, x: number, z: number, arc: number) {
  return Math.abs(angleDiff(e.heading, headingOf(x - e.pos.x, z - e.pos.z))) < arc;
}
function lead(w: World, e: Enemy, speed: number, k = 0.7) {
  const p = w.player;
  const d = e.distTo(p.pos.x, p.pos.z);
  const t = (d / speed) * k;
  return { x: p.pos.x + p.vel.x * t, z: p.pos.z + p.vel.z * t };
}
function setState(e: Enemy, s: string) {
  e.state = s;
  e.st = 0;
}

// ------------------------------------------------------------------ definitions
const bonewalker: EnemyDef = {
  id: 'bonewalker', name: 'Bonewalker', hp: 60, speed: 11, radius: 0.9, height: 3.1, mass: 0.8, damage: 28, xp: 10, gold: 3,
  body: 'bone', cost: 1, minFloor: 0, acts: [1, 2, 3], weight: 10,
  spheres: [{ y: 1.4, r: 0.8, crit: false }, { y: 2.95, r: 0.42, crit: true }],
  build: () => skeleton('sword'),
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    switch (e.state) {
      case 'idle':
      case 'chase': {
        const dir = e.pathTo(w, p.pos.x, p.pos.z);
        e.move(w, dir.x, dir.z, e.def.speed, dt);
        if (d < 4.4 && playerTargetable(w)) setState(e, 'windup');
        break;
      }
      case 'windup':
        e.move(w, 0, 0, 0, dt);
        e.faceTo(p.pos.x, p.pos.z, dt, 12);
        if (e.st > 0.42 / e.speedMult) {
          setState(e, 'swing');
          audio.play('swing', { x: e.pos.x, z: e.pos.z });
        }
        break;
      case 'swing':
        if (e.aux === 0 && e.st > 0.06) {
          e.aux = 1;
          if (d < 5.2 && inFront(e, p.pos.x, p.pos.z, 1.3)) w.damagePlayer(e.damage, { melee: true, enemy: e, x: e.pos.x, z: e.pos.z });
        }
        if (e.st > 0.3) setState(e, 'recover');
        break;
      case 'recover':
        e.aux = 0;
        e.move(w, 0, 0, 0, dt);
        if (e.st > 0.55) setState(e, 'chase');
        break;
    }
  },
  anim: (e, dt) => {
    bipedWalk(e, dt);
    const p = e.visual.parts;
    const armTarget = e.state === 'windup' ? -2.6 : e.state === 'swing' ? 0.9 : Math.sin(e.walkPhase * 2) * 0.4 - 0.3;
    p.armR.rotation.x = damp(p.armR.rotation.x, armTarget, e.state === 'swing' ? 30 : 12, dt);
    p.armL.rotation.x = damp(p.armL.rotation.x, -Math.sin(e.walkPhase * 2) * 0.5, 10, dt);
    p.elR.rotation.x = -0.5;
    p.torso.rotation.y = e.state === 'windup' ? -0.4 : e.state === 'swing' ? 0.5 : 0;
  },
  onDeath: (e, w) => {
    w.fx.boneBurst(e.pos.x, e.y, e.pos.z, e.vel.x * 0.1 + e.knockX * 0.05, e.vel.z * 0.1 + e.knockZ * 0.05, 8);
    audio.play('bone', { x: e.pos.x, z: e.pos.z });
  },
};

const boneknight: EnemyDef = {
  ...bonewalker,
  id: 'boneknight', name: 'Bone Knight', hp: 150, speed: 9.5, radius: 1.05, mass: 1.6, damage: 42, xp: 22, gold: 6, body: 'armor', cost: 2.2, minFloor: 1, weight: 5,
  build: () => skeleton('knight'),
};

const bonearcher: EnemyDef = {
  id: 'bonearcher', name: 'Bone Archer', hp: 45, speed: 9, radius: 0.9, height: 3.1, mass: 0.7, damage: 20, xp: 12, gold: 4,
  body: 'bone', cost: 1.3, minFloor: 0, acts: [1, 3], weight: 6,
  spheres: [{ y: 1.4, r: 0.8, crit: false }, { y: 2.95, r: 0.42, crit: true }],
  build: () => skeleton('bow'),
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    const los = w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
    if (e.state === 'draw') {
      e.move(w, 0, 0, 0, dt);
      const L = lead(w, e, 60);
      e.faceTo(L.x, L.z, dt, 14);
      e.visual.parts.glowTip.visible = true;
      if (e.st > 0.75 / e.speedMult) {
        e.visual.parts.glowTip.visible = false;
        const dx = L.x - e.pos.x, dz = L.z - e.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        w.projectiles.enemyShot('arrow', e.pos.x + (dx / dl) * 1.2, 2.3, e.pos.z + (dz / dl) * 1.2, (dx / dl) * 60, -0.5, (dz / dl) * 60, e.damage, e);
        audio.play('arrow', { x: e.pos.x, z: e.pos.z });
        e.cd = rand(1.8, 2.8);
        setState(e, 'move');
      }
      return;
    }
    // reposition / strafe
    let dx = 0, dz = 0;
    if (d > 34 || !los) {
      const dir = e.pathTo(w, p.pos.x, p.pos.z);
      dx = dir.x;
      dz = dir.z;
    } else if (d < 15) {
      dx = (e.pos.x - p.pos.x) / d;
      dz = (e.pos.z - p.pos.z) / d;
    } else {
      if (e.st > e.aux2) {
        e.aux = Math.random() < 0.5 ? -1 : 1;
        e.aux2 = e.st + rand(1, 2.5);
      }
      dx = (-(p.pos.z - e.pos.z) / d) * e.aux;
      dz = ((p.pos.x - e.pos.x) / d) * e.aux;
    }
    e.move(w, dx, dz, e.def.speed, dt);
    if (e.cd <= 0 && los && d < 48 && playerTargetable(w)) setState(e, 'draw');
  },
  anim: (e, dt) => {
    bipedWalk(e, dt);
    const p = e.visual.parts;
    p.armL.rotation.x = damp(p.armL.rotation.x, e.state === 'draw' ? -1.5 : -0.3, 10, dt);
    p.armR.rotation.x = damp(p.armR.rotation.x, e.state === 'draw' ? -1.4 : Math.sin(e.walkPhase * 2) * 0.4, 10, dt);
    p.elR.rotation.x = e.state === 'draw' ? -1.2 : -0.2;
  },
  onDeath: bonewalker.onDeath,
};

function houndModel(): EnemyVisual {
  const root = new THREE.Group();
  const skin = toon(0x4a1414, { emissive: 0x200000, emissiveIntensity: 1 });
  const dark = toon(0x1e0a0a);
  const crack = glow(0xff3010, 2.2);
  const body = pivot(0, 1.35, 0, root);
  m(G.box(1.0, 0.85, 1.9), skin, 0, 0, 0, 0, 0, 0, body);
  m(G.sph(0.7, 10, 8), skin, 0, 0.15, 0.7, 0, 0, 0, body).scale.set(1.1, 1, 1);
  for (let i = 0; i < 4; i++) m(G.cone(0.14, 0.5, 5), dark, 0, 0.6, 0.6 - i * 0.45, -0.3, 0, 0, body);
  m(G.box(0.1, 0.05, 1.3), crack, 0.51, 0.1, 0, 0, 0, 0.3, body);
  m(G.box(0.1, 0.05, 1.3), crack, -0.51, 0.1, 0, 0, 0, -0.3, body);
  const head = pivot(0, 0.3, 1.25, body);
  m(G.box(0.7, 0.6, 0.7), skin, 0, 0, 0.1, 0, 0, 0, head);
  m(G.box(0.5, 0.35, 0.6), skin, 0, -0.12, 0.6, 0, 0, 0, head);
  const jaw = pivot(0, -0.3, 0.3, head);
  m(G.box(0.45, 0.12, 0.6), dark, 0, 0, 0.3, 0, 0, 0, jaw);
  for (const s of [-1, 1]) {
    m(G.cone(0.1, 0.6, 5), toon(0xd8d0b8), s * 0.28, 0.45, -0.05, -0.6, 0, s * 0.35, head);
    m(G.sph(0.08, 6, 5), eyeRed(), s * 0.2, 0.1, 0.46, 0, 0, 0, head);
    for (let k = 0; k < 2; k++) m(G.cone(0.04, 0.16, 4), toon(0xf0f0e0), s * 0.12 + k * s * 0.08, -0.3, 0.85, Math.PI, 0, 0, head);
  }
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.42, 0.65], [0.42, 0.65], [-0.42, -0.7], [0.42, -0.7]]) {
    const leg = pivot(x, -0.2, z, body);
    m(G.cyl(0.15, 0.1, 1.1, 6), skin, 0, -0.55, 0, 0, 0, 0, leg);
    m(G.box(0.22, 0.12, 0.34), dark, 0, -1.12, 0.08, 0, 0, 0, leg);
    legs.push(leg);
  }
  const tail = pivot(0, 0.2, -0.95, body);
  m(G.cone(0.14, 1.1, 5), skin, 0, 0, -0.5, -Math.PI / 2 - 0.4, 0, 0, tail);
  return { root, parts: { body, head, jaw, tail, l0: legs[0], l1: legs[1], l2: legs[2], l3: legs[3] } };
}

const hellhound: EnemyDef = {
  id: 'hellhound', name: 'Hellhound', hp: 70, speed: 21, radius: 1.1, height: 2.2, mass: 1.0, damage: 24, xp: 13, gold: 4,
  body: 'flesh', cost: 1.4, minFloor: 0, acts: [1, 2, 3], weight: 7,
  spheres: [{ y: 1.3, r: 1.1, crit: false }, { y: 1.8, r: 0.5, crit: true, fwd: 1.4 }],
  build: houndModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    switch (e.state) {
      case 'idle':
      case 'chase': {
        const dir = e.pathTo(w, p.pos.x, p.pos.z);
        // zig-zag approach
        const zig = Math.sin(e.st * 3 + e.id) * 0.5;
        e.move(w, dir.x + -dir.z * zig, dir.z + dir.x * zig, e.def.speed, dt, 6);
        if (d < 15 && e.cd <= 0 && w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z) && playerTargetable(w)) {
          setState(e, 'crouch');
          audio.play('growl', { x: e.pos.x, z: e.pos.z, pitch: 1.2 });
        }
        break;
      }
      case 'crouch': {
        e.move(w, 0, 0, 0, dt, 12);
        const L = lead(w, e, 40, 0.8);
        e.faceTo(L.x, L.z, dt, 14);
        e.tx = L.x;
        e.tz = L.z;
        if (e.st > 0.42 / e.speedMult) {
          setState(e, 'leap');
          const dx = e.tx - e.pos.x, dz = e.tz - e.pos.z;
          const dl = Math.hypot(dx, dz) || 1;
          e.vel.set((dx / dl) * 42, 0, (dz / dl) * 42);
          e.aux = 0;
        }
        break;
      }
      case 'leap': {
        if (e.aux === 0 && e.distTo(p.pos.x, p.pos.z) < 3.4) {
          e.aux = 1;
          w.damagePlayer(e.damage, { melee: true, enemy: e, x: e.pos.x, z: e.pos.z });
          audio.play('chomp', { x: e.pos.x, z: e.pos.z });
        }
        if (e.st > 0.45) setState(e, 'recover');
        break;
      }
      case 'recover':
        e.move(w, 0, 0, 0, dt, 5);
        if (e.st > 0.6) {
          setState(e, 'chase');
          e.cd = rand(1.2, 2.2);
        }
        break;
    }
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    const sp = Math.hypot(e.vel.x, e.vel.z);
    e.walkPhase += sp * dt * 0.35;
    const g = Math.sin(e.walkPhase * 2) * Math.min(1, sp / 6) * 0.8;
    p.l0.rotation.x = g;
    p.l1.rotation.x = g * 0.8;
    p.l2.rotation.x = -g;
    p.l3.rotation.x = -g * 0.8;
    const crouch = e.state === 'crouch' ? 1 : 0;
    p.body.position.y = damp(p.body.position.y, 1.35 - crouch * 0.45 + Math.abs(Math.cos(e.walkPhase * 2)) * 0.12, 14, dt);
    p.body.rotation.x = e.state === 'leap' ? -0.3 : 0;
    p.jaw.rotation.x = e.state === 'leap' || e.state === 'crouch' ? 0.6 : 0.1;
    p.tail.rotation.y = Math.sin(e.walkPhase * 3) * 0.4;
  },
  onDeath: (e, w) => {
    w.fx.gooBurst(e.pos.x, 1.2, e.pos.z, [0.8, 0.08, 0.05], 12);
    w.fx.chunkBurst(e.pos.x, 1.2, e.pos.z, 0x4a1414, 6, 0.45, 8);
    audio.play('splat', { x: e.pos.x, z: e.pos.z });
  },
};

function goblinModel(bomb: boolean): EnemyVisual {
  const root = new THREE.Group();
  const skin = toon(0x5aa83a);
  const cloth = toon(0x6a3a1a);
  const hips = pivot(0, 0.9, 0, root);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const l = pivot(s * 0.2, 0, 0, hips);
    m(G.cyl(0.1, 0.09, 0.8, 6), skin, 0, -0.4, 0, 0, 0, 0, l);
    m(G.box(0.22, 0.1, 0.36), cloth, 0, -0.82, 0.08, 0, 0, 0, l);
    legs.push(l);
  }
  const torso = pivot(0, 0, 0, hips);
  m(G.sph(0.45, 10, 8), cloth, 0, 0.35, 0, 0, 0, 0, torso).scale.set(1, 1.1, 0.9);
  const head = pivot(0, 0.95, 0.05, torso);
  m(G.sph(0.42, 10, 8), skin, 0, 0, 0, 0, 0, 0, head);
  for (const s of [-1, 1]) {
    m(G.cone(0.14, 0.75, 5), skin, s * 0.5, 0.1, -0.05, 0, 0, s * (Math.PI / 2 + 0.3), head);
    m(G.sph(0.08, 6, 5), glow(0xffe040, 3), s * 0.15, 0.08, 0.36, 0, 0, 0, head);
  }
  m(G.cone(0.08, 0.3, 5), skin, 0, -0.05, 0.45, Math.PI / 2, 0, 0, head);
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pivot(s * 0.42, 0.55, 0, torso);
    m(G.cyl(0.08, 0.07, 0.7, 6), skin, 0, -0.35, 0, 0, 0, 0, a);
    arms.push(a);
  }
  let bombObj: THREE.Object3D | null = null;
  let spark: THREE.Object3D | null = null;
  if (bomb) {
    const b = pivot(0, 1.75, 0.1, torso);
    m(G.sph(0.5, 12, 10), toon(0x1a1a1e), 0, 0, 0, 0, 0, 0, b);
    m(G.cyl(0.04, 0.04, 0.35, 4), toon(0x8a6a3a), 0, 0.55, 0, 0, 0, 0, b);
    spark = m(G.sph(0.12, 6, 5), glow(0xffa020, 5), 0, 0.76, 0, 0, 0, 0, b);
    bombObj = b;
    arms.forEach((a) => (a.rotation.x = -2.8));
  }
  return { root, parts: { hips, torso, head, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], ...(bombObj ? { bomb: bombObj } : {}), ...(spark ? { spark } : {}) } };
}

const goblinBomber: EnemyDef = {
  id: 'bomber', name: 'Goblin Bomber', hp: 32, speed: 17, radius: 0.8, height: 2.6, mass: 0.5, damage: 55, xp: 9, gold: 5,
  body: 'flesh', cost: 1.1, minFloor: 0, acts: [1, 2], weight: 5,
  spheres: [{ y: 1.0, r: 0.7, crit: false }, { y: 1.9, r: 0.45, crit: true }, { y: 2.65, r: 0.5, crit: true }],
  build: () => goblinModel(true),
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    if (e.state === 'fuse') {
      const dir = e.pathTo(w, p.pos.x, p.pos.z);
      e.move(w, dir.x, dir.z, e.def.speed * 0.4, dt);
      if (Math.random() < 0.5) w.fx.sparks(e.pos.x, 3.3, e.pos.z, 0, 1, 0, 1, [1, 0.6, 0.1], 6);
      if (e.st > 0.75) {
        w.explode(e.pos.x, 1, e.pos.z, 6.5, e.damage, { team: 'enemy', element: 'fire', source: e });
        e.hp = 0;
        w.killEnemy(e, { amount: 0, element: 'fire', source: 'status' }, true);
      }
      return;
    }
    const dir = e.pathTo(w, p.pos.x, p.pos.z);
    e.move(w, dir.x, dir.z, e.def.speed, dt);
    if (d < 5 && playerTargetable(w)) {
      setState(e, 'fuse');
      audio.play('ignite', { x: e.pos.x, z: e.pos.z });
      w.fx.tele.circle(e.pos.x, e.pos.z, 6.5, 0.75);
    }
  },
  anim: (e, dt) => {
    bipedWalk(e, dt, 2.2, 0.8);
    const s = e.visual.parts.spark;
    if (s) s.scale.setScalar(e.state === 'fuse' ? 1.5 + Math.sin(e.st * 40) * 0.8 : 1 + Math.sin(e.st * 20) * 0.3);
  },
  onDeath: (e, w) => {
    if (e.state !== 'fuse') w.explode(e.pos.x, 1, e.pos.z, 5.5, e.damage * 0.8, { team: 'both', element: 'fire', source: e });
    w.fx.gooBurst(e.pos.x, 1.2, e.pos.z, [0.3, 0.8, 0.2], 8);
  },
};

function bruteModel(): EnemyVisual {
  const root = new THREE.Group();
  const skin = toon(0x6a2020, { emissive: 0x200404, emissiveIntensity: 1 });
  const dark = toon(0x2a0e0e);
  const crack = glow(0xff4010, 2.4);
  const stone = toon(0x6a6a72);
  const hips = pivot(0, 1.8, 0, root);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const l = pivot(s * 0.7, 0, 0, hips);
    m(G.cyl(0.42, 0.34, 1.8, 8), skin, 0, -0.9, 0, 0, 0, 0, l);
    m(G.box(0.8, 0.3, 1.0), dark, 0, -1.75, 0.15, 0, 0, 0, l);
    legs.push(l);
  }
  const torso = pivot(0, 0.2, 0, hips);
  m(G.sph(1.35, 12, 10), skin, 0, 1.2, 0, 0, 0, 0, torso).scale.set(1.2, 1.05, 0.9);
  m(G.sph(1.0, 10, 8), dark, 0, 0.1, 0.1, 0, 0, 0, torso).scale.set(1.2, 0.7, 1);
  for (let i = 0; i < 5; i++) m(G.box(0.1, 0.9, 0.08), crack, rand(-0.9, 0.9), 1.2 + rand(-0.4, 0.5), 1.15, 0, 0, rand(-0.6, 0.6), torso);
  const head = pivot(0, 2.35, 0.55, torso);
  m(G.box(1.0, 0.85, 0.9), skin, 0, 0, 0, 0, 0, 0, head);
  for (const s of [-1, 1]) {
    const horn = m(G.cone(0.22, 1.1, 6), toon(0x2a2020), s * 0.6, 0.55, -0.1, -0.4, 0, s * -0.7, head);
    horn.castShadow = true;
    m(G.sph(0.12, 6, 5), eyeRed(), s * 0.24, 0.12, 0.46, 0, 0, 0, head);
    m(G.cone(0.08, 0.35, 5), toon(0xf0e8d0), s * 0.3, -0.42, 0.42, 0, 0, 0, head);
  }
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pivot(s * 1.6, 1.8, 0, torso);
    m(G.sph(0.5, 8, 6), dark, 0, 0, 0, 0, 0, 0, a);
    m(G.cyl(0.36, 0.3, 1.5, 8), skin, 0, -0.8, 0, 0, 0, 0, a);
    m(G.sph(0.42, 8, 6), skin, 0, -1.65, 0, 0, 0, 0, a);
    arms.push(a);
  }
  const block = pivot(0, 3.4, 0.3, torso);
  m(G.box(2.4, 1.3, 1.4), stone, 0, 0, 0, 0, 0, 0, block);
  m(G.box(2.5, 0.14, 1.5), crack, 0, 0.1, 0, 0, 0, 0.1, block);
  return { root, parts: { hips, torso, head, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], block } };
}

const brute: EnemyDef = {
  id: 'brute', name: 'Stoneback Brute', hp: 620, speed: 7.5, radius: 2.2, height: 6.2, mass: 6, damage: 70, xp: 60, gold: 18,
  body: 'armor', cost: 5, minFloor: 1, acts: [1, 2, 3], weight: 3,
  spheres: [{ y: 2.4, r: 2.0, crit: false }, { y: 4.3, r: 1.6, crit: false }, { y: 5.1, r: 0.7, crit: true, fwd: 0.6 }],
  build: bruteModel,
  noRam: true,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    e.cd2 -= dt;
    switch (e.state) {
      case 'idle':
      case 'chase': {
        const dir = e.pathTo(w, p.pos.x, p.pos.z);
        e.move(w, dir.x, dir.z, e.def.speed, dt, 3);
        if (d < 10 && e.cd <= 0 && playerTargetable(w)) {
          setState(e, 'slamWind');
          w.fx.tele.circle(e.pos.x + Math.sin(e.heading) * 3, e.pos.z + Math.cos(e.heading) * 3, 9, 1.0 / e.speedMult);
          audio.play('growl', { x: e.pos.x, z: e.pos.z, pitch: 0.6 });
        } else if (d > 16 && d < 55 && e.cd2 <= 0 && w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z) && playerTargetable(w)) {
          setState(e, 'throwWind');
          const L = lead(w, e, 30, 1.0);
          e.tx = L.x;
          e.tz = L.z;
        }
        break;
      }
      case 'slamWind':
        e.move(w, 0, 0, 0, dt, 8);
        if (e.st > 1.0 / e.speedMult) {
          const sx = e.pos.x + Math.sin(e.heading) * 3, sz = e.pos.z + Math.cos(e.heading) * 3;
          audio.play('slam', { x: sx, z: sz });
          w.fx.explosion(sx, 0.5, sz, 5, 'none');
          w.fx.rings.spawn(sx, 0.2, sz, 1, 10, 0.4, 0xffa060);
          w.fx.shake(0.8);
          if (Math.hypot(p.pos.x - sx, p.pos.z - sz) < 9.5 && p.pos.y < 1.5) w.damagePlayer(e.damage, { enemy: e, x: sx, z: sz, knock: 26 });
          w.damageEnemiesInRadius(sx, sz, 9, e.damage * 0.5, e);
          setState(e, 'recover');
          e.cd = 3.2;
        }
        break;
      case 'throwWind':
        e.move(w, 0, 0, 0, dt, 8);
        e.faceTo(e.tx, e.tz, dt, 8);
        if (e.st > 0.85 / e.speedMult) {
          w.projectiles.lob('boulder', e.pos.x, 5.5, e.pos.z, e.tx, e.tz, 1.1, e.damage * 0.8, e, 4.5);
          w.fx.tele.circle(e.tx, e.tz, 4.5, 1.1);
          e.cd2 = rand(3.5, 5);
          setState(e, 'recover');
        }
        break;
      case 'recover':
        e.move(w, 0, 0, 0, dt, 5);
        if (e.st > 0.8) setState(e, 'chase');
        break;
    }
  },
  anim: (e, dt) => {
    bipedWalk(e, dt, 0.8, 0.45);
    const p = e.visual.parts;
    const raise = e.state === 'slamWind' || e.state === 'throwWind' ? 1 : 0;
    const slam = e.state === 'recover' && e.st < 0.3 ? 1 : 0;
    const armX = raise ? -2.9 : slam ? -0.6 : -2.2;
    p.armL.rotation.x = damp(p.armL.rotation.x, armX, raise ? 6 : 25, dt);
    p.armR.rotation.x = damp(p.armR.rotation.x, armX, raise ? 6 : 25, dt);
    p.block.position.y = damp(p.block.position.y, raise ? 4.6 : slam ? 1.6 : 3.4, raise ? 6 : 25, dt);
    p.block.position.z = damp(p.block.position.z, slam ? 2.2 : 0.3, 12, dt);
    p.block.visible = !(e.state === 'recover' && e.aux2 === 1);
    p.torso.rotation.x = damp(p.torso.rotation.x, slam ? 0.4 : raise ? -0.2 : 0, 10, dt);
  },
  onDeath: (e, w) => {
    w.fx.chunkBurst(e.pos.x, 2, e.pos.z, 0x6a6a72, 14, 0.9, 12);
    w.fx.chunkBurst(e.pos.x, 3, e.pos.z, 0x6a2020, 8, 0.7, 10);
    w.fx.gooBurst(e.pos.x, 3, e.pos.z, [1, 0.3, 0.05], 16);
    w.fx.shake(0.6);
    audio.play('explosion', { x: e.pos.x, z: e.pos.z });
  },
};

function necroModel(): EnemyVisual {
  const root = new THREE.Group();
  const robe = toon(0x2a1840);
  const trim = toon(0x8a6a2a);
  const float = pivot(0, 0.6, 0, root);
  m(G.cone(1.0, 2.6, 10), robe, 0, 1.3, 0, 0, 0, 0, float);
  m(G.cyl(1.02, 1.02, 0.15, 10), trim, 0, 0.1, 0, 0, 0, 0, float);
  const head = pivot(0, 2.7, 0, float);
  m(G.sph(0.46, 10, 8), robe, 0, 0, 0, 0, 0, 0, head);
  m(G.cone(0.3, 0.7, 6), robe, 0, 0.3, -0.35, -1.2, 0, 0, head);
  m(G.sph(0.32, 8, 6), toon(0x0a0610), 0, -0.05, 0.2, 0, 0, 0, head);
  for (const s of [-1, 1]) m(G.sph(0.07, 6, 5), glow(0xc040ff, 5), s * 0.12, 0, 0.45, 0, 0, 0, head);
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pivot(s * 0.55, 2.2, 0, float);
    m(G.cone(0.25, 1.1, 6), robe, 0, -0.5, 0, Math.PI, 0, 0, a);
    arms.push(a);
  }
  const staff = pivot(0, -1.0, 0.2, arms[1]);
  m(G.cyl(0.06, 0.06, 3.2, 5), toon(0x3a2a1a), 0, 0.6, 0, 0, 0, 0, staff);
  m(G.sph(0.22, 8, 6), toon(0xe8dfc6), 0, 2.2, 0, 0, 0, 0, staff);
  const orb = m(G.sph(0.28, 10, 8), glow(0xb040ff, 3.5), 0, 2.55, 0, 0, 0, 0, staff);
  return { root, parts: { float, head, armL: arms[0], armR: arms[1], staff, orb } };
}

const necro: EnemyDef = {
  id: 'necro', name: 'Crypt Cultist', hp: 170, speed: 8, radius: 1.1, height: 3.8, mass: 1.2, damage: 18, xp: 28, gold: 10,
  body: 'flesh', cost: 3, minFloor: 1, acts: [1, 2, 3], weight: 3,
  spheres: [{ y: 1.9, r: 1.1, crit: false }, { y: 3.3, r: 0.5, crit: true }],
  build: necroModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    e.cd2 -= dt;
    const los = w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
    if (e.state === 'cast') {
      e.move(w, 0, 0, 0, dt, 6);
      e.faceTo(p.pos.x, p.pos.z, dt, 10);
      if (Math.random() < 0.6) w.fx.add.emit(e.pos.x + Math.sin(e.heading) * 0.6, 3.8, e.pos.z + Math.cos(e.heading) * 0.6, rand(-2, 2), rand(0, 3), rand(-2, 2), 0.4, 0.4, 0.1, 2, 0.6, 3, 1);
      if (e.st > 0.65 / e.speedMult) {
        const base = headingOf(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        if (e.aux === 0) {
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.22;
            w.projectiles.enemyShot('orb', e.pos.x + Math.sin(a) * 1.2, 3.2, e.pos.z + Math.cos(a) * 1.2, Math.sin(a) * 22, 0, Math.cos(a) * 22, e.damage, e);
          }
        } else {
          for (let i = 0; i < 12; i++) {
            const a = base + (i / 12) * Math.PI * 2;
            w.projectiles.enemyShot('orb', e.pos.x + Math.sin(a) * 1.2, 2.2, e.pos.z + Math.cos(a) * 1.2, Math.sin(a) * 17, 0, Math.cos(a) * 17, e.damage, e);
          }
        }
        audio.play('orb', { x: e.pos.x, z: e.pos.z });
        e.cd = rand(2.6, 3.6);
        setState(e, 'hover');
      }
      return;
    }
    if (e.state === 'summon') {
      e.move(w, 0, 0, 0, dt, 6);
      if (Math.random() < 0.8) w.fx.add.emit(e.pos.x + rand(-4, 4), 0.2, e.pos.z + rand(-4, 4), 0, rand(3, 6), 0, 0.6, 0.4, 0.1, 1.8, 0.4, 3, 1, { stretch: 0.05 });
      if (e.st > 1.1) {
        for (let i = 0; i < 2; i++) {
          const a = rand(0, Math.PI * 2);
          const sx = e.pos.x + Math.cos(a) * 4, sz = e.pos.z + Math.sin(a) * 4;
          if (!w.grid.isSolidAt(sx, sz)) {
            const s = w.spawnEnemy('bonewalker', sx, sz, e.room, { summoned: true });
            if (s) s.summoned = true;
          }
        }
        e.cd2 = rand(9, 12);
        setState(e, 'hover');
      }
      return;
    }
    let dx = 0, dz = 0;
    if (!los || d > 36) {
      const dir = e.pathTo(w, p.pos.x, p.pos.z);
      dx = dir.x;
      dz = dir.z;
    } else if (d < 20) {
      dx = (e.pos.x - p.pos.x) / d;
      dz = (e.pos.z - p.pos.z) / d;
    } else {
      dx = (-(p.pos.z - e.pos.z) / d) * (e.id % 2 ? 1 : -1);
      dz = ((p.pos.x - e.pos.x) / d) * (e.id % 2 ? 1 : -1);
    }
    e.move(w, dx, dz, e.def.speed, dt, 3);
    if (e.cd <= 0 && los && d < 50 && playerTargetable(w)) {
      setState(e, 'cast');
      e.aux = Math.random() < 0.35 ? 1 : 0;
    } else if (e.cd2 <= 0 && w.countSummons(e.room) < 5) setState(e, 'summon');
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    e.walkPhase += dt;
    p.float.position.y = 0.6 + Math.sin(e.walkPhase * 2 + e.id) * 0.3;
    const casting = e.state === 'cast' || e.state === 'summon';
    p.armR.rotation.x = damp(p.armR.rotation.x, casting ? -2.4 : -0.2, 8, dt);
    p.armL.rotation.x = damp(p.armL.rotation.x, casting ? -1.2 : 0, 8, dt);
    p.orb.scale.setScalar(casting ? 1.4 + Math.sin(e.st * 20) * 0.3 : 1);
  },
  onDeath: (e, w) => {
    w.fx.magicBurst(e.pos.x, 2, e.pos.z, [0.7, 0.25, 1], 30, 12);
    w.fx.chunkBurst(e.pos.x, 2, e.pos.z, 0x2a1840, 6, 0.6, 8);
    w.fx.boneBurst(e.pos.x, 1, e.pos.z, 0, 0, 4);
    audio.play('bone', { x: e.pos.x, z: e.pos.z });
  },
};

function buggyModel(big: boolean): EnemyVisual {
  const root = new THREE.Group();
  const s = big ? 1.35 : 1;
  const body = pivot(0, 0, 0, root);
  const rust = toon(big ? 0x3a3a40 : 0x7a4a22);
  const dark = toon(0x1a1a1e);
  m(G.box(1.9 * s, 0.7 * s, 3.2 * s), rust, 0, 0.95 * s, 0, 0, 0, 0, body);
  m(G.box(1.6 * s, 0.4 * s, 1.2 * s), dark, 0, 1.45 * s, -0.4 * s, 0, 0, 0, body);
  for (let i = 0; i < 5; i++) m(G.cone(0.13 * s, 0.7 * s, 5), toon(0xc8ccd6), (i / 4 - 0.5) * 1.6 * s, 0.9 * s, 1.85 * s, Math.PI / 2, 0, 0, body);
  // driver
  const drv = pivot(0, 1.7 * s, -0.3 * s, body);
  if (big) {
    m(G.sph(0.42, 10, 8), toon(0xe8dfc6), 0, 0.35, 0, 0, 0, 0, drv);
    for (const x of [-0.13, 0.13]) m(G.sph(0.08, 6, 5), eyeRed(), x, 0.4, 0.34, 0, 0, 0, drv);
    for (const x of [-0.7, 0.7]) m(G.cyl(0.14, 0.14, 1.6, 8), toon(0xc8ccd6), x, 1.1, -1.6, 0, 0, 0, drv);
  } else {
    m(G.sph(0.35, 10, 8), toon(0x5aa83a), 0, 0.35, 0, 0, 0, 0, drv);
    for (const x of [-1, 1]) {
      m(G.cone(0.1, 0.55, 5), toon(0x5aa83a), x * 0.38, 0.4, 0, 0, 0, x * (Math.PI / 2 + 0.3), drv);
      m(G.sph(0.06, 6, 5), glow(0xffe040, 3), x * 0.13, 0.4, 0.3, 0, 0, 0, drv);
    }
  }
  const gun = pivot(0, 1.8 * s, 0.6 * s, body);
  m(G.box(0.3, 0.3, 0.6), dark, 0, 0, 0, 0, 0, 0, gun);
  m(G.cyl(0.06, 0.06, 0.9, 6), dark, 0, 0, 0.6, Math.PI / 2, 0, 0, gun);
  if (big) m(G.cyl(0.06, 0.06, 0.9, 6), dark, 0.15, 0, 0.6, Math.PI / 2, 0, 0, gun);
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-1, 1.1], [1, 1.1], [-1, -1.1], [1, -1.1]]) {
    const w = pivot(x * 1.05 * s, 0.55 * s, z * s, root);
    const t = m(G.cyl(0.55 * s, 0.55 * s, 0.45 * s, 12), toon(0x19191c), 0, 0, 0, 0, 0, Math.PI / 2, w);
    m(G.cyl(0.3 * s, 0.3 * s, 0.48 * s, 8), toon(0x8a6a3a), 0, 0, 0, 0, 0, Math.PI / 2, w);
    void t;
    wheels.push(w);
  }
  const lights = [-0.6, 0.6].map((x) => m(G.sph(0.14, 6, 5), glow(0xffd24a, 3), x * s, 1.1 * s, 1.62 * s, 0, 0, 0, body));
  return { root, parts: { body, gun, w0: wheels[0], w1: wheels[1], w2: wheels[2], w3: wheels[3], l0: lights[0], l1: lights[1] } };
}

function vehicleAI(e: Enemy, w: World, dt: number, cruise: number, charge: number, burst: number, spread: number) {
  const p = w.player;
  const d = e.distTo(p.pos.x, p.pos.z);
  e.st += dt;
  e.cd -= dt;
  e.cd2 -= dt;
  let target = { x: p.pos.x, z: p.pos.z };
  if (e.state === 'charge') target = { x: e.tx, z: e.tz };
  let desired = headingOf(target.x - e.pos.x, target.z - e.pos.z);
  if (e.state !== 'charge' && !w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z)) {
    const dir = e.pathTo(w, p.pos.x, p.pos.z);
    desired = headingOf(dir.x, dir.z);
  }
  const diff = angleDiff(e.heading, desired);
  const turn = e.state === 'charge' ? 1.2 : 2.6;
  e.heading += clamp(diff, -turn * dt, turn * dt) * e.slow;
  let speed = e.state === 'charge' ? charge : Math.abs(diff) < 0.7 ? cruise : cruise * 0.45;
  if (e.state === 'backoff') speed = -cruise * 0.6;
  speed *= e.speedMult * e.slow;
  const cur = e.aux2;
  e.aux2 = damp(cur, speed, 2.5, dt);
  e.vel.x = Math.sin(e.heading) * e.aux2;
  e.vel.z = Math.cos(e.heading) * e.aux2;
  if (e.state === 'charge' && e.st > 1.3) {
    setState(e, 'drive');
    e.cd = rand(3, 5);
  }
  if (e.state === 'backoff' && e.st > 0.8) setState(e, 'drive');
  if ((e.state === 'drive' || e.state === 'idle') && d < 35 && d > 8 && Math.abs(diff) < 0.3 && e.cd <= 0 && playerTargetable(w)) {
    setState(e, 'charge');
    const L = lead(w, e, charge, 0.5);
    e.tx = L.x;
    e.tz = L.z;
    w.fx.tele.line(e.pos.x, e.pos.z, e.heading, Math.min(40, d + 8), 4, 0.5);
    audio.play('horn', { pitch: 1.4 });
  }
  // gun bursts
  if (e.cd2 <= 0 && d < 45 && Math.abs(diff) < 0.6 && playerTargetable(w)) {
    e.aux += dt;
    if (e.aux > 0.14) {
      e.aux = 0;
      e.tx2 = (e.tx2 ?? 0) + 1;
      const a = e.heading + rand(-spread, spread);
      w.projectiles.enemyShot('ebullet', e.pos.x + Math.sin(a) * 2.4, 1.9 * e.scale, e.pos.z + Math.cos(a) * 2.4, Math.sin(a) * 70, 0, Math.cos(a) * 70, e.damage * 0.3, e);
      audio.play('mg', { x: e.pos.x, z: e.pos.z, pitch: 1.3, vol: 0.6 });
      if (e.tx2 >= burst) {
        e.tx2 = 0;
        e.cd2 = rand(1.4, 2.2);
      }
    }
  }
  // contact ram
  if (d < e.radius + 2.2 && Math.abs(e.aux2) > 12 && e.ramCd <= 0) {
    e.ramCd = 1;
    w.damagePlayer(e.damage * (e.state === 'charge' ? 1.4 : 0.7), { enemy: e, x: e.pos.x, z: e.pos.z, knock: 18 });
    audio.play('ram', { x: e.pos.x, z: e.pos.z });
    setState(e, 'backoff');
  }
}

declare module './Enemy' {
  interface Enemy {
    tx2?: number;
  }
}

const buggy: EnemyDef = {
  id: 'buggy', name: 'Goblin Buggy', hp: 280, speed: 28, radius: 1.8, height: 2.4, mass: 2.2, damage: 40, xp: 30, gold: 12,
  body: 'armor', cost: 3.2, minFloor: 2, acts: [2, 3], weight: 4,
  spheres: [{ y: 1.1, r: 1.6, crit: false, fwd: 0.6 }, { y: 1.1, r: 1.6, crit: false, fwd: -0.9 }, { y: 2.1, r: 0.45, crit: true, fwd: -0.3 }],
  build: () => buggyModel(false),
  ai: (e, w, dt) => {
    e.ramCd -= dt;
    vehicleAI(e, w, dt, 26, 44, 5, 0.06);
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    e.walkPhase += e.aux2 * dt;
    for (const k of ['w0', 'w1', 'w2', 'w3']) p[k].rotation.x = e.walkPhase / 0.55;
    p.body.position.y = Math.sin(e.walkPhase * 1.5) * 0.05;
    const blink = e.state === 'charge' && Math.sin(e.st * 30) > 0;
    p.l0.visible = p.l1.visible = !blink;
  },
  onDeath: (e, w) => {
    w.explode(e.pos.x, 1, e.pos.z, 6, e.damage * 0.6, { team: 'both', element: 'fire', source: e, noDamageOwner: true });
    w.fx.chunkBurst(e.pos.x, 1.5, e.pos.z, 0x7a4a22, 12, 0.6, 12);
  },
};

const trucker: EnemyDef = {
  ...buggy,
  id: 'trucker', name: 'Skeletal Trucker', hp: 900, speed: 26, radius: 2.4, height: 3.2, mass: 5, damage: 60, xp: 80, gold: 25,
  cost: 7, minFloor: 6, acts: [3], weight: 2,
  spheres: [{ y: 1.4, r: 2.1, crit: false, fwd: 0.9 }, { y: 1.4, r: 2.1, crit: false, fwd: -1.2 }, { y: 2.9, r: 0.5, crit: true, fwd: -0.4 }],
  build: () => buggyModel(true),
  noRam: true,
  ai: (e, w, dt) => {
    e.ramCd -= dt;
    vehicleAI(e, w, dt, 24, 48, 8, 0.12);
  },
};

function mimicModel(): EnemyVisual {
  const root = new THREE.Group();
  const wood = toon(0x7a4a22);
  const gold = toon(0xe0aa2a, { emissive: 0x3a2400, emissiveIntensity: 0.6 });
  const body = pivot(0, 0, 0, root);
  m(G.box(2.2, 1.2, 1.5), wood, 0, 0.6, 0, 0, 0, 0, body);
  m(G.box(2.3, 0.14, 1.6), gold, 0, 1.18, 0, 0, 0, 0, body);
  for (const x of [-0.9, 0.9]) m(G.box(0.14, 1.25, 1.6), gold, x, 0.62, 0, 0, 0, 0, body);
  const lidP = pivot(0, 1.2, -0.75, body);
  m(G.box(2.2, 0.6, 1.5), wood, 0, 0.3, 0.75, 0, 0, 0, lidP);
  m(G.box(2.3, 0.14, 1.6), gold, 0, 0.02, 0.75, 0, 0, 0, lidP);
  m(G.box(0.3, 0.4, 0.1), gold, 0, 0.1, 1.55, 0, 0, 0, lidP);
  const teeth = toon(0xf4f0e0);
  for (let i = 0; i < 7; i++) {
    const x = -0.9 + i * 0.3;
    m(G.cone(0.1, 0.35, 4), teeth, x, 1.05, 0.68, 0, 0, 0, body);
    m(G.cone(0.1, 0.35, 4), teeth, x, -0.12, 1.45, Math.PI, 0, 0, lidP);
  }
  const inner = m(G.box(1.9, 0.1, 1.2), toon(0x3a0610, { emissive: 0x400010, emissiveIntensity: 1 }), 0, 1.05, 0, 0, 0, 0, body);
  const tongue = m(G.box(0.5, 0.12, 1.4), toon(0xd0304a), 0, 1.15, 0.6, 0, 0, 0, body);
  const eyes = [-0.4, 0.4].map((x) => m(G.sph(0.12, 6, 5), glow(0xffe040, 4), x, 1.2, -0.3, 0, 0, 0, body));
  void inner;
  return { root, parts: { body, lid: lidP, tongue, e0: eyes[0], e1: eyes[1] } };
}

const mimic: EnemyDef = {
  id: 'mimic', name: 'Mimic', hp: 420, speed: 15, radius: 1.4, height: 2.2, mass: 1.8, damage: 45, xp: 60, gold: 60,
  body: 'flesh', cost: 99, minFloor: 0, acts: [1, 2, 3], weight: 0,
  spheres: [{ y: 0.8, r: 1.3, crit: false }, { y: 1.3, r: 0.6, crit: true, fwd: 0.2 }],
  build: mimicModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    switch (e.state) {
      case 'idle':
      case 'disguised':
        e.state = 'disguised';
        e.move(w, 0, 0, 0, dt);
        if (d < 7 || e.hp < e.maxHp) {
          setState(e, 'reveal');
          audio.play('chomp', { x: e.pos.x, z: e.pos.z });
          w.say('mimic');
        }
        break;
      case 'reveal':
        e.faceTo(p.pos.x, p.pos.z, dt, 6);
        if (e.st > 0.7) setState(e, 'hop');
        break;
      case 'hop': {
        const dir = e.pathTo(w, p.pos.x, p.pos.z);
        const phase = (e.st % 0.65) / 0.65;
        e.move(w, dir.x, dir.z, phase < 0.6 ? e.def.speed * 1.4 : 0, dt, 10);
        e.y = Math.sin(Math.min(1, phase / 0.6) * Math.PI) * 1.4;
        if (d < 4.2 && phase > 0.6) {
          setState(e, 'bite');
          e.y = 0;
        }
        break;
      }
      case 'bite':
        e.move(w, 0, 0, 0, dt);
        e.faceTo(p.pos.x, p.pos.z, dt, 12);
        if (e.aux === 0 && e.st > 0.3) {
          e.aux = 1;
          audio.play('chomp', { x: e.pos.x, z: e.pos.z });
          if (d < 5) w.damagePlayer(e.damage, { melee: true, enemy: e, x: e.pos.x, z: e.pos.z });
        }
        if (e.st > 0.7) {
          e.aux = 0;
          setState(e, 'hop');
        }
        break;
    }
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    const open = e.state === 'disguised' ? 0 : e.state === 'bite' ? (e.st < 0.3 ? 1.1 : 0.1) : 0.5 + Math.sin(e.st * 10) * 0.25;
    p.lid.rotation.x = damp(p.lid.rotation.x, -open, 14, dt);
    p.tongue.visible = e.state !== 'disguised';
    p.e0.visible = p.e1.visible = e.state !== 'disguised';
  },
  onDeath: (e, w) => {
    w.fx.chunkBurst(e.pos.x, 1, e.pos.z, 0x7a4a22, 12, 0.6, 10);
    w.fx.chunkBurst(e.pos.x, 1, e.pos.z, 0xe0aa2a, 6, 0.4, 10);
    audio.play('splat', { x: e.pos.x, z: e.pos.z });
  },
};

function sentryModel(): EnemyVisual {
  const root = new THREE.Group();
  m(new THREE.DodecahedronGeometry(1.4, 0), toon(0x4a4058), 0, 0.8, 0, 0, 0, 0, root).scale.set(1.2, 0.7, 1.2);
  const spin = pivot(0, 2.6, 0, root);
  const crystal = m(new THREE.OctahedronGeometry(1, 0), toon(0x9a4cff, { emissive: 0x9a4cff, emissiveIntensity: 1.6 }), 0, 0, 0, 0, 0, 0, spin);
  crystal.scale.set(0.8, 1.7, 0.8);
  const shards: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const s = m(new THREE.OctahedronGeometry(0.35, 0), toon(0xc080ff, { emissive: 0xb44cff, emissiveIntensity: 1.2 }), Math.cos((i / 3) * 6.28) * 1.6, 0, Math.sin((i / 3) * 6.28) * 1.6, 0, 0, 0, spin);
    s.scale.set(0.6, 1.4, 0.6);
    shards.push(s);
  }
  return { root, parts: { spin, crystal } };
}

const sentry: EnemyDef = {
  id: 'sentry', name: 'Crystal Sentry', hp: 230, speed: 0, radius: 1.6, height: 4.2, mass: 99, damage: 20, xp: 26, gold: 9,
  body: 'armor', cost: 2.5, minFloor: 3, acts: [2], weight: 4, stationary: true, noRam: true,
  spheres: [{ y: 1.0, r: 1.5, crit: false }, { y: 2.6, r: 1.1, crit: true }],
  build: sentryModel,
  ai: (e, w, dt) => {
    const p = w.player;
    e.st += dt;
    e.cd -= dt;
    const los = w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
    e.faceTo(p.pos.x, p.pos.z, dt, 3);
    if (e.state === 'charge') {
      if (e.st > 0.8 && e.aux < 3 && e.st > 0.8 + e.aux * 0.16) {
        const L = lead(w, e, 50, 0.5);
        const a = headingOf(L.x - e.pos.x, L.z - e.pos.z) + rand(-0.05, 0.05);
        w.projectiles.enemyShot('shard', e.pos.x + Math.sin(a) * 1.5, 2.6, e.pos.z + Math.cos(a) * 1.5, Math.sin(a) * 50, 0, Math.cos(a) * 50, e.damage, e);
        audio.play('laserZap', { x: e.pos.x, z: e.pos.z, pitch: 1.5 });
        e.aux++;
      }
      if (e.aux >= 3) {
        e.aux = 0;
        setState(e, 'idle');
        e.cd = rand(2.2, 3);
      }
      return;
    }
    if (e.cd <= 0 && los && e.distTo(p.pos.x, p.pos.z) < 60 && playerTargetable(w)) setState(e, 'charge');
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    p.spin.rotation.y += dt * (e.state === 'charge' ? 6 : 1);
    p.crystal.scale.set(0.8, 1.7, 0.8).multiplyScalar(e.state === 'charge' ? 1 + Math.min(0.3, e.st * 0.4) : 1);
  },
  onDeath: (e, w) => {
    w.fx.magicBurst(e.pos.x, 2.5, e.pos.z, [0.7, 0.3, 1], 30, 14);
    w.fx.chunkBurst(e.pos.x, 2.5, e.pos.z, 0xb44cff, 10, 0.5, 12);
    audio.play('shatter', { x: e.pos.x, z: e.pos.z });
  },
};

function wraithModel(): EnemyVisual {
  const root = new THREE.Group();
  const cloth = toon(0x283048, { emissive: 0x0a2030, emissiveIntensity: 1 });
  const float = pivot(0, 1.4, 0, root);
  m(G.cone(1.1, 2.8, 9, ), cloth, 0, 0.2, 0, Math.PI, 0, 0, float).scale.set(1, 1, 0.8);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    m(G.cone(0.22, 0.9, 4), cloth, Math.cos(a) * 0.95, -1.4, Math.sin(a) * 0.75, Math.PI, 0, 0, float);
  }
  const head = pivot(0, 1.85, 0.05, float);
  m(G.sph(0.42, 10, 8), toon(0xd8d0c0), 0, 0, 0, 0, 0, 0, head);
  m(G.cone(0.55, 0.9, 8), cloth, 0, 0.2, -0.12, -0.25, 0, 0, head);
  for (const s of [-1, 1]) m(G.sph(0.09, 6, 5), glow(0x40ffd0, 5), s * 0.14, 0.02, 0.36, 0, 0, 0, head);
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pivot(s * 0.7, 1.2, 0.1, float);
    m(G.cyl(0.1, 0.05, 1.6, 5), cloth, 0, -0.8, 0, 0, 0, 0, a);
    for (let k = -1; k <= 1; k++) m(G.cone(0.04, 0.4, 4), toon(0xd8d0c0), k * 0.08, -1.75, 0, Math.PI, 0, 0, a);
    arms.push(a);
  }
  return { root, parts: { float, head, armL: arms[0], armR: arms[1] } };
}

const wraith: EnemyDef = {
  id: 'wraith', name: 'Toll Wraith', hp: 130, speed: 13, radius: 1.1, height: 4, mass: 0.6, damage: 22, xp: 24, gold: 8,
  body: 'spirit', flying: true, cost: 2.4, minFloor: 4, acts: [2, 3], weight: 4,
  spheres: [{ y: 2.0, r: 1.1, crit: false }, { y: 3.3, r: 0.48, crit: true }],
  build: wraithModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    if (e.state === 'cast') {
      e.move(w, 0, 0, 0, dt, 5);
      e.faceTo(p.pos.x, p.pos.z, dt, 8);
      if (e.st > 0.6) {
        const a = e.heading;
        w.projectiles.enemyShot('skull', e.pos.x + Math.sin(a) * 1.4, 3.1, e.pos.z + Math.cos(a) * 1.4, Math.sin(a) * 18, 0, Math.cos(a) * 18, e.damage, e, { homing: 2.2, life: 4.5 });
        audio.play('orb', { x: e.pos.x, z: e.pos.z, pitch: 0.7 });
        e.cd = rand(2.6, 3.8);
        setState(e, 'orbit');
      }
      return;
    }
    if (e.state === 'dash') {
      if (e.aux === 0 && d < 3) {
        e.aux = 1;
        w.damagePlayer(e.damage, { melee: true, enemy: e, x: e.pos.x, z: e.pos.z });
      }
      if (e.st > 0.7) {
        e.aux = 0;
        setState(e, 'orbit');
      }
      return;
    }
    e.aux2 += dt * (e.id % 2 ? 0.5 : -0.5);
    const ox = p.pos.x + Math.cos(e.aux2) * 18, oz = p.pos.z + Math.sin(e.aux2) * 18;
    const dir = e.pathTo(w, ox, oz);
    e.move(w, dir.x, dir.z, e.def.speed, dt, 3, false);
    e.faceTo(p.pos.x, p.pos.z, dt, 5);
    if (e.cd <= 0 && playerTargetable(w)) {
      if (d < 14 && Math.random() < 0.4) {
        setState(e, 'dash');
        const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        e.vel.set((dx / dl) * 34, 0, (dz / dl) * 34);
        e.cd = 2;
      } else if (w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z)) setState(e, 'cast');
    }
  },
  anim: (e, dt) => {
    const p = e.visual.parts;
    e.walkPhase += dt;
    p.float.position.y = 1.4 + Math.sin(e.walkPhase * 2.4 + e.id) * 0.35;
    p.float.rotation.x = e.state === 'dash' ? 0.5 : Math.sin(e.walkPhase) * 0.08;
    const cast = e.state === 'cast';
    p.armL.rotation.x = damp(p.armL.rotation.x, cast ? -1.6 : -0.3 + Math.sin(e.walkPhase * 2) * 0.2, 6, dt);
    p.armR.rotation.x = damp(p.armR.rotation.x, cast ? -1.6 : -0.3 - Math.sin(e.walkPhase * 2) * 0.2, 6, dt);
  },
  onDeath: (e, w) => {
    w.fx.magicBurst(e.pos.x, 2.5, e.pos.z, [0.25, 1, 0.8], 30, 10);
    w.fx.boneBurst(e.pos.x, 3, e.pos.z, 0, 0, 3);
    audio.play('shatter', { x: e.pos.x, z: e.pos.z, pitch: 0.6 });
  },
};

function impModel(): EnemyVisual {
  const root = new THREE.Group();
  const skin = toon(0xc8401a, { emissive: 0x401000, emissiveIntensity: 1 });
  const dark = toon(0x2a0a06);
  const hips = pivot(0, 1.0, 0, root);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const l = pivot(s * 0.22, 0, 0, hips);
    m(G.cyl(0.12, 0.08, 0.9, 6), skin, 0, -0.45, 0, 0, 0, 0, l);
    legs.push(l);
  }
  const torso = pivot(0, 0.1, 0, hips);
  m(G.sph(0.55, 10, 8), skin, 0, 0.45, 0, 0, 0, 0, torso).scale.set(1, 1.15, 0.85);
  m(G.box(0.08, 0.6, 0.05), glow(0xffa020, 3), 0, 0.5, 0.46, 0, 0, 0.3, torso);
  const head = pivot(0, 1.1, 0.05, torso);
  m(G.sph(0.4, 10, 8), skin, 0, 0, 0, 0, 0, 0, head);
  for (const s of [-1, 1]) {
    m(G.cone(0.1, 0.5, 5), dark, s * 0.25, 0.35, 0, 0, 0, -s * 0.5, head);
    m(G.sph(0.07, 6, 5), glow(0xffe040, 4), s * 0.14, 0.05, 0.34, 0, 0, 0, head);
  }
  const wingMat = toon(0x6a1a0a, { side: THREE.DoubleSide });
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const wp = pivot(s * 0.3, 0.7, -0.35, torso);
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.2, 0.5), new THREE.Vector2(1.0, -0.3), new THREE.Vector2(0.6, -0.1), new THREE.Vector2(0.4, -0.5)]);
    const wg = new THREE.ShapeGeometry(shape);
    const mesh = m(wg, wingMat, 0, 0, 0, 0, s > 0 ? 0 : Math.PI, 0, wp);
    void mesh;
    wings.push(wp);
  }
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = pivot(s * 0.55, 0.75, 0, torso);
    m(G.cyl(0.09, 0.07, 0.7, 5), skin, 0, -0.35, 0, 0, 0, 0, a);
    arms.push(a);
  }
  const ball = m(G.sph(0.35, 8, 6), glow(0xff7020, 3.5), 0, -0.8, 0.1, 0, 0, 0, arms[1]);
  return { root, parts: { hips, torso, head, legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1], wingL: wings[0], wingR: wings[1], ball } };
}

const imp: EnemyDef = {
  id: 'imp', name: 'Magma Imp', hp: 85, speed: 14, radius: 0.9, height: 2.8, mass: 0.6, damage: 30, xp: 16, gold: 5,
  body: 'flesh', cost: 1.6, minFloor: 5, acts: [3], weight: 7,
  spheres: [{ y: 1.4, r: 0.8, crit: false }, { y: 2.3, r: 0.45, crit: true }],
  build: impModel,
  ai: (e, w, dt) => {
    const p = w.player;
    const d = e.distTo(p.pos.x, p.pos.z);
    e.st += dt;
    e.cd -= dt;
    const los = w.grid.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
    if (e.state === 'throw') {
      e.move(w, 0, 0, 0, dt, 8);
      const L = lead(w, e, 25, 1);
      e.faceTo(L.x, L.z, dt, 10);
      if (e.st > 0.6) {
        w.projectiles.lob('fireball', e.pos.x, 2.5, e.pos.z, L.x, L.z, 0.95, e.damage, e, 3.5);
        w.fx.tele.circle(L.x, L.z, 3.5, 0.95, 0xff6020);
        audio.play('fireball', { x: e.pos.x, z: e.pos.z });
        e.cd = rand(2.2, 3.2);
        setState(e, 'move');
      }
      return;
    }
    let dx = 0, dz = 0;
    if (d > 30 || !los) {
      const dir = e.pathTo(w, p.pos.x, p.pos.z);
      dx = dir.x;
      dz = dir.z;
    } else if (d < 14) {
      dx = (e.pos.x - p.pos.x) / d;
      dz = (e.pos.z - p.pos.z) / d;
    } else {
      const sgn = e.id % 2 ? 1 : -1;
      dx = (-(p.pos.z - e.pos.z) / d) * sgn;
      dz = ((p.pos.x - e.pos.x) / d) * sgn;
    }
    e.move(w, dx, dz, e.def.speed, dt);
    if (e.cd <= 0 && los && d < 40 && playerTargetable(w)) setState(e, 'throw');
  },
  anim: (e, dt) => {
    bipedWalk(e, dt, 2, 0.7);
    const p = e.visual.parts;
    p.wingL.rotation.y = Math.sin(e.walkPhase * 4 + 1) * 0.5 + 0.3;
    p.wingR.rotation.y = -Math.sin(e.walkPhase * 4 + 1) * 0.5 - 0.3;
    p.armR.rotation.x = damp(p.armR.rotation.x, e.state === 'throw' ? -2.6 : -0.4, 10, dt);
    p.ball.visible = e.state === 'throw' || e.cd < 1;
  },
  onDeath: (e, w) => {
    w.explode(e.pos.x, 1, e.pos.z, 4, e.damage * 0.4, { team: 'enemy', element: 'fire', source: e, noDamageOwner: true });
    w.fx.gooBurst(e.pos.x, 1.5, e.pos.z, [1, 0.4, 0.05], 10);
  },
};

export const ENEMIES: Record<string, EnemyDef> = {
  bonewalker, boneknight, bonearcher, hellhound, bomber: goblinBomber, brute, necro, buggy, trucker, mimic, sentry, wraith, imp,
};

export function spawnTable(act: number, floor: number): [EnemyDef, number][] {
  return Object.values(ENEMIES)
    .filter((d) => d.weight > 0 && d.acts.includes(act) && d.minFloor <= floor)
    .map((d) => [d, d.weight] as [EnemyDef, number]);
}
