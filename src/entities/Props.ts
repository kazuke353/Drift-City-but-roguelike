import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../game/World';
import { toon, glow, FX_LAYER } from '../render/Toon';
import { woodTexture, signTexture } from '../render/Textures';
import { audio } from '../audio/Audio';
import { rand } from '../core/Rng';
import { segSphere, clamp } from '../core/MathUtil';
import type { FloorMod } from '../game/Run';
import type { Proj } from '../combat/Projectiles';
import { SHAPE_CORE, SHAPE_DOT } from '../fx/Particles';

// ------------------------------------------------------------------ geometry helper
function colored(parts: [THREE.BufferGeometry, number][]): THREE.BufferGeometry {
  const gs = parts.map(([g, c]) => {
    const geo = g.index ? g.toNonIndexed() : g;
    const col = new THREE.Color(c);
    const n = geo.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geo.deleteAttribute('uv');
    return geo;
  });
  return mergeGeometries(gs)!;
}

export interface Interactable {
  x: number;
  z: number;
  r: number;
  enabled: boolean;
  label(): string | null;
  sub?(): string | null;
  use(): void;
  key?: 'interact';
}

// ================================================================== destructibles
export type DKind = 'barrel' | 'crate' | 'urn' | 'tnt' | 'sack';

interface Destructible {
  kind: DKind;
  x: number;
  z: number;
  r: number;
  h: number;
  hp: number;
  alive: boolean;
  idx: number;
  rot: number;
}

const D_INFO: Record<DKind, { r: number; h: number; hp: number; color: number }> = {
  barrel: { r: 1.0, h: 2.2, hp: 30, color: 0x7a4a22 },
  crate: { r: 1.1, h: 2.0, hp: 30, color: 0x8a5a2a },
  urn: { r: 0.8, h: 1.8, hp: 12, color: 0xb0603a },
  tnt: { r: 1.0, h: 2.2, hp: 20, color: 0xb01a1a },
  sack: { r: 0.9, h: 1.3, hp: 10, color: 0xc8a040 },
};

// ================================================================== class
export class Props {
  destructibles: Destructible[] = [];
  private dMeshes = new Map<DKind, THREE.InstancedMesh>();
  interactables: Interactable[] = [];
  spikes: { x: number; z: number; t: number; up: number; idx: number; hitCd: number }[] = [];
  private spikeMesh: THREE.InstancedMesh | null = null;
  maces: { x: number; z: number; axis: number; t: number; len: number; group: THREE.Group; ball: THREE.Object3D; bx: number; bz: number; by: number; hitCd: number }[] = [];
  ramps: { x: number; z: number; dir: number; len: number; w: number; cd: number }[] = [];
  portals: Portal[] = [];
  chests: Chest[] = [];
  group = new THREE.Group();
  vortexMats: THREE.ShaderMaterial[] = [];
  time = 0;

  constructor(private w: World, private scene: THREE.Scene) {
    scene.add(this.group);
    const wood = woodTexture(5);
    const mat = toon(0xffffff, { vertexColors: true });
    const woodMat = toon(0xffffff, { map: wood });
    const make = (kind: DKind, geo: THREE.BufferGeometry, m: THREE.Material) => {
      const im = new THREE.InstancedMesh(geo, m, 160);
      im.count = 0;
      im.castShadow = true;
      im.receiveShadow = true;
      this.group.add(im);
      this.dMeshes.set(kind, im);
    };
    make('barrel', colored([
      [new THREE.CylinderGeometry(0.95, 0.95, 2.1, 12).translate(0, 1.05, 0), 0x7a4a22],
      [new THREE.CylinderGeometry(1.0, 1.0, 0.16, 12).translate(0, 0.35, 0), 0x2a2a30],
      [new THREE.CylinderGeometry(1.0, 1.0, 0.16, 12).translate(0, 1.75, 0), 0x2a2a30],
      [new THREE.CylinderGeometry(0.85, 0.85, 0.05, 12).translate(0, 2.12, 0), 0x5a3418],
    ]), mat);
    make('crate', new THREE.BoxGeometry(2, 2, 2).translate(0, 1, 0), woodMat);
    const urnPts = [[0, 0], [0.45, 0], [0.7, 0.4], [0.8, 0.9], [0.6, 1.4], [0.35, 1.6], [0.45, 1.8], [0.4, 1.85]].map(([x, y]) => new THREE.Vector2(x, y));
    make('urn', colored([[new THREE.LatheGeometry(urnPts, 10), 0xb0603a], [new THREE.TorusGeometry(0.72, 0.08, 5, 12).rotateX(Math.PI / 2).translate(0, 0.9, 0), 0xe0aa2a]]), mat);
    make('tnt', colored([
      [new THREE.CylinderGeometry(0.95, 0.95, 2.1, 12).translate(0, 1.05, 0), 0xb01a1a],
      [new THREE.CylinderGeometry(1.0, 1.0, 0.18, 12).translate(0, 0.4, 0), 0x1a1a1a],
      [new THREE.CylinderGeometry(1.0, 1.0, 0.18, 12).translate(0, 1.7, 0), 0x1a1a1a],
      [new THREE.BoxGeometry(0.9, 0.5, 0.1).translate(0, 1.05, 0.95), 0xf2d024],
    ]), mat);
    make('sack', colored([[new THREE.SphereGeometry(0.85, 10, 8).scale(1, 0.8, 1).translate(0, 0.7, 0), 0x8a6a3a], [new THREE.ConeGeometry(0.3, 0.5, 6).translate(0, 1.45, 0), 0x6a4a2a], [new THREE.CylinderGeometry(0.2, 0.2, 0.08, 8).rotateX(Math.PI / 2).translate(0, 0.8, 0.82), 0xf2b632]]), mat);
  }

  clear() {
    this.destructibles = [];
    for (const im of this.dMeshes.values()) im.count = 0;
    this.interactables = [];
    this.spikes = [];
    if (this.spikeMesh) {
      this.group.remove(this.spikeMesh);
      this.spikeMesh = null;
    }
    for (const m of this.maces) this.group.remove(m.group);
    this.maces = [];
    this.ramps = [];
    this.portals = [];
    this.chests = [];
    this.vortexMats = [];
    const keep = new Set(this.dMeshes.values());
    for (const c of [...this.group.children]) if (!keep.has(c as THREE.InstancedMesh)) this.group.remove(c);
  }

  // -------------------------------------------------------------- destructibles
  addDestructible(kind: DKind, x: number, z: number) {
    const info = D_INFO[kind];
    const im = this.dMeshes.get(kind)!;
    if (im.count >= 160) return;
    const d: Destructible = { kind, x, z, r: info.r, h: info.h, hp: info.hp * Math.pow(1.15, this.w.run.floor), alive: true, idx: im.count, rot: rand(0, Math.PI * 2) };
    im.count++;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, d.rot, 0)), new THREE.Vector3(1, 1, 1));
    im.setMatrixAt(d.idx, m);
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    this.destructibles.push(d);
  }

  damageDestructible(d: Destructible, amount: number, dirX = 0, dirZ = 0) {
    if (!d.alive) return;
    d.hp -= amount;
    if (d.hp <= 0) this.breakD(d, dirX, dirZ);
  }

  private breakD(d: Destructible, dirX: number, dirZ: number) {
    const w = this.w;
    d.alive = false;
    const im = this.dMeshes.get(d.kind)!;
    im.setMatrixAt(d.idx, new THREE.Matrix4().makeScale(0, 0, 0));
    im.instanceMatrix.needsUpdate = true;
    const info = D_INFO[d.kind];
    const col = d.kind === 'crate' || d.kind === 'barrel' ? 0x7a4a22 : info.color;
    for (let i = 0; i < 8 * w.fx.quality; i++) {
      const s = rand(0.3, 0.8);
      w.fx.debris.emit(d.x + rand(-0.6, 0.6), rand(0.5, 1.8), d.z + rand(-0.6, 0.6), dirX * rand(4, 14) + rand(-6, 6), rand(6, 14), dirZ * rand(4, 14) + rand(-6, 6), s * 0.3, s * 0.2, s * 1.4, new THREE.Color(col), rand(2, 3.5));
    }
    w.fx.dust(d.x, d.z, 4, [0.55, 0.45, 0.35], 1);
    audio.play(d.kind === 'urn' ? 'shatter' : 'bone', { x: d.x, z: d.z, pitch: 0.6 });
    if (d.kind === 'tnt') {
      w.explode(d.x, 1, d.z, 8, 180 * Math.pow(1.15, w.run.floor), { team: 'both', element: 'fire', big: true });
    } else {
      const goldBase = d.kind === 'sack' ? 18 : d.kind === 'urn' ? 8 : 3;
      if (Math.random() < (d.kind === 'sack' || d.kind === 'urn' ? 1 : 0.45)) w.pickups.spawnGold(d.x, d.z, goldBase * (1 + w.run.floor * 0.3), 0.6);
      if (Math.random() < 0.04) w.pickups.spawnSmall('repair', d.x, d.z);
      if (Math.random() < 0.03) w.pickups.spawnSmall('nitro', d.x, d.z);
    }
  }

  /** Projectile segment vs destructibles. */
  hitBySegment(p: Proj, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (const d of this.destructibles) {
      if (!d.alive) continue;
      const mx = (x0 + x1) / 2 - d.x, mz = (z0 + z1) / 2 - d.z;
      if (mx * mx + mz * mz > 64) continue;
      const t = segSphere(x0, y0, z0, x1, y1, z1, d.x, d.h * 0.5, d.z, d.r + 0.2);
      if (t >= 0) {
        this.damageDestructible(d, p.damage, p.vx * 0.01, p.vz * 0.01);
        if (p.kind === 'bullet' || p.kind === 'pellet' || p.kind === 'arrow') {
          p.alive = false;
          this.w.fx.sparks(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, 0, 1, 0, 3, [1, 0.7, 0.4], 8);
        }
        return;
      }
    }
  }

  hitByRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, dmg: number) {
    for (const d of this.destructibles) {
      if (!d.alive) continue;
      const t = segSphere(ox, oy, oz, ox + dx * maxT, oy + dy * maxT, oz + dz * maxT, d.x, d.h * 0.5, d.z, d.r);
      if (t >= 0) this.damageDestructible(d, dmg, dx, dz);
    }
  }

  damageInRadius(x: number, z: number, r: number, dmg: number) {
    for (const d of this.destructibles) {
      if (!d.alive) continue;
      const dd = Math.hypot(d.x - x, d.z - z);
      if (dd < r + d.r) this.damageDestructible(d, dmg, (d.x - x) / (dd || 1), (d.z - z) / (dd || 1));
    }
  }

  // -------------------------------------------------------------- hazards
  addSpikes(x: number, z: number) {
    this.spikes.push({ x, z, t: rand(0, 3), up: 0, idx: this.spikes.length, hitCd: 0 });
  }

  finalizeSpikes() {
    if (!this.spikes.length) return;
    const n = this.spikes.length;
    const cone = new THREE.ConeGeometry(0.28, 1.6, 5).translate(0, 0.8, 0);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) parts.push(cone.clone().translate(i * 1.1, 0, j * 1.1));
    const geo = mergeGeometries(parts)!;
    this.spikeMesh = new THREE.InstancedMesh(geo, toon(0xb8bcc8), n);
    this.spikeMesh.castShadow = true;
    this.group.add(this.spikeMesh);
    const plateGeo = new THREE.BoxGeometry(3.6, 0.12, 3.6);
    const plates = new THREE.InstancedMesh(plateGeo, toon(0x2a2a30, { emissive: 0x300808, emissiveIntensity: 1 }), n);
    this.spikes.forEach((s, i) => plates.setMatrixAt(i, new THREE.Matrix4().makeTranslation(s.x, 0.06, s.z)));
    this.group.add(plates);
  }

  addMace(x: number, z: number, axis: number) {
    const g = new THREE.Group();
    const len = 13;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 5).translate(0, -len / 2, 0), toon(0x2a2a30));
    g.add(chain);
    const ball = new THREE.Group();
    ball.position.y = -len;
    const sph = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), toon(0x3a3a42));
    ball.add(sph);
    const spikeGeo = new THREE.ConeGeometry(0.3, 1.1, 5);
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0.7, -0.7, 0], [-0.7, -0.7, 0], [0, 0.7, 0.7], [0, -0.7, -0.7]];
    for (const [dx, dy, dz] of dirs) {
      const s = new THREE.Mesh(spikeGeo, toon(0xc8ccd6));
      const v = new THREE.Vector3(dx, dy, dz).normalize();
      s.position.copy(v).multiplyScalar(1.8);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      ball.add(s);
    }
    g.add(ball);
    g.position.set(x, len + 3, z);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    this.group.add(g);
    this.maces.push({ x, z, axis, t: rand(0, 6), len, group: g, ball, bx: x, bz: z, by: 3, hitCd: 0 });
  }

  addRamp(x: number, z: number, dir: number) {
    const len = 9, wd = 7, h = 2.4;
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len, 0), new THREE.Vector2(len, h), new THREE.Vector2(len - 0.8, h)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: wd, bevelEnabled: false });
    geo.translate(-len / 2, 0, -wd / 2);
    // stripes via vertex colors on top faces
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f2d024';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#111';
    for (let i = -64; i < 128; i += 22) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 11, 0);
      g.lineTo(i + 11 - 64, 64);
      g.lineTo(i - 64, 64);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(0.25, 0.25);
    const mesh = new THREE.Mesh(geo, [toon(0x3a3a42), toon(0xffffff, { map: tex })]);
    // heading: shape x axis → world direction `dir` (0 = +z)
    mesh.rotation.y = dir - Math.PI / 2;
    mesh.position.set(x, 0, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.ramps.push({ x, z, dir, len, w: wd, cd: 0 });
  }

  update(dt: number) {
    const w = this.w;
    const p = w.player;
    this.time += dt;
    // spikes
    if (this.spikeMesh) {
      const m = new THREE.Matrix4();
      const spiky = w.run.hasMod('spikyRoads') || w.run.hasMod('ancientVaults') ? 1.8 : 1;
      this.spikes.forEach((s, i) => {
        s.t += dt;
        s.hitCd -= dt;
        const cyc = s.t % 3.2;
        const up = cyc < 1.8 ? 0 : cyc < 2.0 ? 0.25 : cyc < 2.1 ? (cyc - 2.0) / 0.1 : cyc < 2.9 ? 1 : 1 - (cyc - 2.9) / 0.3;
        s.up = up;
        m.compose(new THREE.Vector3(s.x, -1.5 + up * 1.5, s.z), new THREE.Quaternion(), new THREE.Vector3(1, Math.max(0.05, up), 1));
        this.spikeMesh!.setMatrixAt(i, m);
        if (cyc > 1.8 && cyc < 2.0 && Math.random() < 0.1) w.fx.add.emit(s.x + rand(-1.5, 1.5), 0.2, s.z + rand(-1.5, 1.5), 0, 2, 0, 0.3, 0.3, 0.1, 3, 0.3, 0.2, 1, { shape: SHAPE_CORE });
        if (up > 0.6) {
          if (p.alive && !p.airborne && Math.abs(p.pos.x - s.x) < 2.6 && Math.abs(p.pos.z - s.z) < 2.6 && s.hitCd <= 0) {
            s.hitCd = 0.8;
            w.damagePlayer(28 * spiky * Math.pow(1.13, w.run.floor), { x: s.x, z: s.z, hazard: true });
          }
          for (const e of w.enemiesNear(s.x, s.z, 3)) {
            if (e.def.flying || e.airborne) continue;
            if (Math.abs(e.pos.x - s.x) < 2.2 && Math.abs(e.pos.z - s.z) < 2.2 && e.ramCd <= 0) {
              w.damageEnemy(e, { amount: 30 * Math.pow(1.13, w.run.floor), element: 'none', source: 'hazard', noCrit: true });
              e.ramCd = 0.8;
            }
          }
        }
      });
      this.spikeMesh.instanceMatrix.needsUpdate = true;
    }
    // maces
    for (const m of this.maces) {
      m.t += dt;
      m.hitCd -= dt;
      const ang = Math.sin(m.t * 1.3) * 1.05;
      if (m.axis === 0) m.group.rotation.set(0, 0, ang);
      else m.group.rotation.set(ang, 0, 0);
      const off = Math.sin(ang) * m.len;
      m.bx = m.x + (m.axis === 0 ? -off : 0);
      m.bz = m.z + (m.axis === 0 ? 0 : off);
      m.by = m.len + 3 - Math.cos(ang) * m.len;
      const d = Math.hypot(p.pos.x - m.bx, p.pos.z - m.bz);
      if (p.alive && d < 3.4 && m.by < 4 && m.hitCd <= 0) {
        m.hitCd = 1;
        const dx = (p.pos.x - m.bx) / (d || 1), dz = (p.pos.z - m.bz) / (d || 1);
        const spiky = w.run.hasMod('spikyRoads') ? 1.8 : 1;
        w.damagePlayer(45 * spiky * Math.pow(1.13, w.run.floor), { x: m.bx, z: m.bz, knock: 30, hazard: true });
        p.vel.x += dx * 20;
        p.vel.z += dz * 20;
        audio.play('ram');
        w.fx.sparks(m.bx, 2, m.bz, dx, 0.5, dz, 16, [1, 0.8, 0.5], 18);
      }
      for (const e of w.enemiesNear(m.bx, m.bz, 3.5)) {
        if (m.by < 4 && e.ramCd <= 0 && e.distTo(m.bx, m.bz) < 3.2) {
          e.ramCd = 1;
          w.damageEnemy(e, { amount: 90 * Math.pow(1.13, w.run.floor), element: 'none', source: 'hazard', kx: (e.pos.x - m.bx), kz: e.pos.z - m.bz, knock: 25 });
          if (e.mass < 2) e.launch((e.pos.x - m.bx) * 4, (e.pos.z - m.bz) * 4, 14);
        }
      }
    }
    // ramps
    for (const r of this.ramps) {
      r.cd -= dt;
      if (!p.alive || p.airborne || r.cd > 0) continue;
      const fx = Math.sin(r.dir), fz = Math.cos(r.dir);
      const dx = p.pos.x - r.x, dz = p.pos.z - r.z;
      const along = dx * fx + dz * fz, side = dx * -fz + dz * fx;
      if (Math.abs(side) < r.w / 2 && along > -r.len / 2 && along < r.len / 2) {
        const vAlong = p.vel.x * fx + p.vel.z * fz;
        if (vAlong > 12) {
          r.cd = 1;
          p.hop(Math.min(26, vAlong * 0.55), false, 0);
          p.vel.x += fx * 6;
          p.vel.z += fz * 6;
          w.say('ramp');
        } else if (along > r.len / 2 - 2) {
          // hit the tall end head-on at low speed: bump
          p.vel.x -= fx * 5;
          p.vel.z -= fz * 5;
        }
      }
    }
    for (const m of this.vortexMats) m.uniforms.time.value = this.time;
    for (const port of this.portals) port.update(dt, w);
    for (const c of this.chests) c.update(dt);
  }

  // -------------------------------------------------------------- interactables
  addChest(x: number, z: number, tier: 0 | 1 | 2, heading = 0): Chest {
    const c = new Chest(this.w, x, z, tier, heading);
    this.group.add(c.group);
    this.interactables.push(c);
    this.chests.push(c);
    this.w.grid.obstacles.push({ x, z, r: 1.4, h: 1.5 });
    return c;
  }

  addPortal(x: number, z: number, heading: number, mod: FloorMod | null, title: string, sub: string, final = false): Portal {
    const p = new Portal(this.w, x, z, heading, mod, title, sub, final);
    this.group.add(p.group);
    this.vortexMats.push(p.vortex);
    this.portals.push(p);
    return p;
  }

  addInteractable(i: Interactable, obj?: THREE.Object3D) {
    this.interactables.push(i);
    if (obj) this.group.add(obj);
  }

  nearestInteractable(x: number, z: number): Interactable | null {
    let best: Interactable | null = null;
    let bd = 1e9;
    for (const i of this.interactables) {
      if (!i.enabled) continue;
      const d = Math.hypot(i.x - x, i.z - z);
      if (d < i.r && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
}

// ================================================================== chest
export class Chest implements Interactable {
  group = new THREE.Group();
  lid: THREE.Group;
  r = 5.5;
  enabled = true;
  opened = false;
  openT = 0;
  constructor(private w: World, public x: number, public z: number, public tier: 0 | 1 | 2, heading: number) {
    const base = tier === 2 ? 0xd4a020 : tier === 1 ? 0x5a5f6e : 0x7a4a22;
    const trim = tier === 2 ? 0xfff0a0 : tier === 1 ? 0xe0aa2a : 0x2a2a30;
    const bm = toon(base, tier === 2 ? { emissive: 0x4a3000, emissiveIntensity: 0.8 } : {});
    const tm = toon(trim, tier >= 1 ? { emissive: 0x3a2400, emissiveIntensity: 0.6 } : {});
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1.6), bm);
    body.position.y = 0.65;
    const band1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.35, 1.65), tm);
    band1.position.set(-0.8, 0.66, 0);
    const band2 = band1.clone();
    band2.position.x = 0.8;
    this.lid = new THREE.Group();
    this.lid.position.set(0, 1.3, -0.8);
    const lidM = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.4, 10, 1, false, 0, Math.PI), bm);
    lidM.rotation.z = Math.PI / 2;
    lidM.rotation.y = Math.PI / 2;
    lidM.position.set(0, 0, 0.8);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.15), tm);
    lock.position.set(0, 0.0, 1.62);
    this.lid.add(lidM, lock);
    this.group.add(body, band1, band2, this.lid);
    if (tier === 2) {
      for (const s of [-1, 1]) {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), glow(0xff3060, 3));
        gem.position.set(s * 0.45, 0.8, 0.82);
        this.group.add(gem);
      }
    }
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    this.group.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
  }
  label() {
    if (this.opened) return null;
    if (this.tier === 2) return this.w.run.keys > 0 ? 'Unlock Golden Chest' : 'Locked (needs a Key)';
    return this.tier === 1 ? 'Open Iron Chest' : 'Open Chest';
  }
  sub() {
    return this.tier === 2 ? `Keys: ${this.w.run.keys}` : null;
  }
  use() {
    if (this.opened) return;
    if (this.tier === 2) {
      if (this.w.run.keys <= 0) {
        audio.play('uiError');
        this.w.say('needKey');
        return;
      }
      this.w.run.keys--;
    }
    this.opened = true;
    this.enabled = false;
    audio.play('chest', { x: this.x, z: this.z });
    this.w.openChest(this);
  }
  update(dt: number) {
    if (this.opened && this.openT < 1) {
      this.openT = Math.min(1, this.openT + dt * 3);
      this.lid.rotation.x = -this.openT * 1.9;
    }
    if (!this.opened && this.tier >= 1 && Math.random() < dt * 4) {
      const c = this.tier === 2 ? [1, 0.8, 0.3] : [0.6, 0.7, 1];
      this.w.fx.add.emit(this.x + rand(-1.2, 1.2), rand(0.5, 1.6), this.z + rand(-0.8, 0.8), 0, rand(1, 3), 0, 0.8, 0.2, 0.05, c[0] * 3, c[1] * 3, c[2] * 3, 1, { shape: SHAPE_CORE });
    }
  }
}

// ================================================================== portal
const vortexVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const vortexFrag = /* glsl */ `
uniform float time;
uniform vec3 colA;
uniform vec3 colB;
uniform float locked;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float sw = sin(a * 5.0 + r * 12.0 - time * 4.0) * 0.5 + 0.5;
  float sw2 = sin(a * 3.0 - r * 8.0 + time * 2.5) * 0.5 + 0.5;
  vec3 c = mix(colA, colB, sw * sw2);
  c *= 1.4 + (1.0 - r) * 2.5;
  c = floor(c * 4.0) / 4.0;
  if (locked > 0.5) {
    float bars = step(0.8, fract(p.x * 4.0));
    c = mix(c * 0.25, vec3(2.5, 0.2, 0.2), bars * 0.8);
  }
  float edge = smoothstep(0.85, 1.0, r);
  gl_FragColor = vec4(c + edge * colB * 2.0, 1.0);
}
`;

export class Portal {
  group = new THREE.Group();
  vortex: THREE.ShaderMaterial;
  used = false;
  constructor(private w: World, public x: number, public z: number, public heading: number, public mod: FloorMod | null, public title: string, public subtitle: string, public final: boolean) {
    const stone = toon(0x5a5f6e);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.9, 10, 32), stone);
    ring.position.y = 6.4;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.25, 6, 32), glow(mod ? mod.color : '#40a0ff', 2.5));
    inner.position.y = 6.4;
    this.vortex = new THREE.ShaderMaterial({
      vertexShader: vortexVert,
      fragmentShader: vortexFrag,
      uniforms: {
        time: { value: 0 },
        colA: { value: new THREE.Color(mod ? mod.color : '#40a0ff').multiplyScalar(0.5) },
        colB: { value: new THREE.Color(final ? '#ffd23a' : '#80e0ff') },
        locked: { value: 1 },
      },
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.2, 32), this.vortex);
    disc.position.y = 6.4;
    disc.layers.set(FX_LAYER);
    const base = new THREE.Mesh(new THREE.BoxGeometry(15, 1, 4), toon(0x3a3d48));
    base.position.y = 0.5;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.3), glow(mod ? mod.color : '#40a0ff', 3));
      rune.position.set(Math.cos(a) * 6, 6.4 + Math.sin(a) * 6, 0.9);
      this.group.add(rune);
    }
    const signTex = signTexture(title, subtitle, '#111', '#f2efe6', mod ? mod.color : '#40a0ff');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.1), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide }));
    sign.position.y = 14.6;
    this.group.add(ring, inner, disc, base, sign);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    this.group.traverse((o) => ((o as THREE.Mesh).isMesh && o !== disc ? (o.castShadow = true) : null));
  }
  get locked() {
    return !this.final && this.w.run.keystones <= 0 && !this.w.isBossFloor;
  }
  update(dt: number, w: World) {
    this.vortex.uniforms.locked.value = this.locked ? 1 : 0;
    if (this.used) return;
    const c = this.mod ? new THREE.Color(this.mod.color) : new THREE.Color(0x40a0ff);
    if (!this.locked && Math.random() < dt * 20) {
      const a = rand(0, Math.PI * 2);
      const fx = Math.cos(this.heading), fz = -Math.sin(this.heading);
      const px = this.x + fx * Math.cos(a) * 5, pz = this.z + fz * Math.cos(a) * 5;
      w.fx.add.emit(px, 6.4 + Math.sin(a) * 5, pz, 0, 0, 0, 0.6, 0.35, 0.05, c.r * 3, c.g * 3, c.b * 3, 1, { shape: SHAPE_DOT });
    }
    const p = w.player;
    const dx = p.pos.x - this.x, dz = p.pos.z - this.z;
    // local frame: portal plane faces along heading
    const nx = Math.sin(this.heading), nz = Math.cos(this.heading);
    const along = dx * nx + dz * nz;
    const side = dx * nz - dz * nx;
    if (Math.abs(side) < 5.5 && Math.abs(along) < 2.2 && p.alive) {
      if (this.locked) {
        if (!(this as any).warned) {
          (this as any).warned = true;
          w.say('needKeystone');
          audio.play('uiError');
          setTimeout(() => ((this as any).warned = false), 2500);
        }
        p.vel.x -= nx * Math.sign(along || 1) * 10;
        p.vel.z -= nz * Math.sign(along || 1) * 10;
      } else {
        this.used = true;
        audio.play('portal');
        w.enterPortal(this);
      }
    }
    void clamp;
  }
}
