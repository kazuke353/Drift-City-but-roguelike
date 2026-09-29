import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../game/World';
import type { Enemy } from '../entities/Enemy';
import type { Element } from '../fx/FX';
import { ELEMENT_COLORS } from '../fx/FX';
import { SHAPE_CORE, SHAPE_DOT, SHAPE_STAR } from '../fx/Particles';
import { toon, glow } from '../render/Toon';
import { segSphere } from '../core/MathUtil';
import { WALL_H } from '../world/DungeonGen';
import { audio } from '../audio/Audio';
import { rand } from '../core/Rng';
import type { WeaponRuntime } from './Weapons';

export type ProjKind =
  | 'bullet' | 'pellet' | 'shell' | 'flame' | 'rocket' | 'minirocket' | 'mortar' | 'saw' | 'bomblet' | 'shard_p' | 'ghost' | 'mine' | 'sonic'
  | 'arrow' | 'orb' | 'holy' | 'purple' | 'ebullet' | 'shard' | 'skull' | 'coin' | 'boulder' | 'fireball' | 'eflame' | 'meteor';

export interface Proj {
  kind: ProjKind;
  team: 'player' | 'enemy';
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  age: number;
  radius: number;
  damage: number;
  element: Element;
  elemChance: number;
  splash: number;
  pierce: number;
  bounces: number;
  homing: number;
  target: Enemy | null;
  gravity: number;
  critBonus: number;
  hitSet: Map<number, number> | null;
  weapon: WeaponRuntime | null;
  owner: Enemy | null;
  size: number;
  delay: number;
  alive: boolean;
  spin: number;
  armed: number;
  data: number;
}

class InstPool {
  mesh: THREE.InstancedMesh;
  n = 0;
  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, shadow = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  push(m: THREE.Matrix4) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.mesh.setMatrixAt(this.n++, m);
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.n = 0;
  }
}

const Z = new THREE.Vector3(0, 0, 1);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

export class Projectiles {
  list: Proj[] = [];
  private pool: Proj[] = [];
  private shells: InstPool;
  private rockets: InstPool;
  private saws: InstPool;
  private arrows: InstPool;
  private shards: InstPool;
  private coins: InstPool;
  private boulders: InstPool;
  private mines: InstPool;
  private skulls: InstPool;

  constructor(private w: World, scene: THREE.Scene) {
    this.shells = new InstPool(scene, new THREE.SphereGeometry(0.32, 10, 8), toon(0x2a2a30, { emissive: 0xff8030, emissiveIntensity: 0.6 }), 120);
    const rg = mergeGeometries([
      new THREE.CylinderGeometry(0.16, 0.16, 1.0, 8).rotateX(Math.PI / 2),
      new THREE.ConeGeometry(0.16, 0.4, 8).rotateX(Math.PI / 2).translate(0, 0, 0.7),
      new THREE.BoxGeometry(0.6, 0.05, 0.25).translate(0, 0, -0.4),
      new THREE.BoxGeometry(0.05, 0.6, 0.25).translate(0, 0, -0.4),
    ])!;
    this.rockets = new InstPool(scene, rg, toon(0xc02020), 200);
    const sawParts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.75, 0.75, 0.08, 16)];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      sawParts.push(new THREE.ConeGeometry(0.12, 0.3, 4).rotateZ(-Math.PI / 2).rotateY(-a).translate(Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82));
    }
    this.saws = new InstPool(scene, mergeGeometries(sawParts)!, toon(0xd8dce6, { emissive: 0x404048, emissiveIntensity: 0.5 }), 60);
    const ag = mergeGeometries([
      new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4).rotateX(Math.PI / 2),
      new THREE.ConeGeometry(0.12, 0.3, 4).rotateX(Math.PI / 2).translate(0, 0, 0.9),
    ])!;
    this.arrows = new InstPool(scene, ag, toon(0x8a6a3a, { emissive: 0xff4010, emissiveIntensity: 0.4 }), 120);
    this.shards = new InstPool(scene, new THREE.OctahedronGeometry(0.4, 0).scale(0.6, 0.6, 1.8), toon(0xc080ff, { emissive: 0xb44cff, emissiveIntensity: 1.8 }), 120);
    this.coins = new InstPool(scene, new THREE.CylinderGeometry(0.35, 0.35, 0.08, 10).rotateX(Math.PI / 2), toon(0xf2b632, { emissive: 0x8a5a00, emissiveIntensity: 0.8 }), 400);
    this.boulders = new InstPool(scene, new THREE.DodecahedronGeometry(1.1, 0), toon(0x6a6a72), 40, true);
    this.mines = new InstPool(scene, mergeGeometries([new THREE.CylinderGeometry(0.5, 0.6, 0.3, 10), new THREE.SphereGeometry(0.15, 6, 5).translate(0, 0.2, 0)])!, toon(0x2a2a30, { emissive: 0xff2020, emissiveIntensity: 0.6 }), 40);
    const sk = mergeGeometries([new THREE.SphereGeometry(0.45, 8, 6), new THREE.BoxGeometry(0.4, 0.2, 0.4).translate(0, -0.3, 0.1)])!;
    this.skulls = new InstPool(scene, sk, toon(0xe8dfc6, { emissive: 0x40ffc0, emissiveIntensity: 0.8 }), 120);
    void glow;
  }

  private make(): Proj {
    const p = this.pool.pop() ?? ({} as Proj);
    p.alive = true;
    p.age = 0;
    p.hitSet = null;
    p.weapon = null;
    p.owner = null;
    p.target = null;
    p.homing = 0;
    p.gravity = 0;
    p.pierce = 0;
    p.bounces = 0;
    p.splash = 0;
    p.critBonus = 0;
    p.elemChance = 0;
    p.element = 'none';
    p.size = 1;
    p.delay = 0;
    p.spin = 0;
    p.armed = 0;
    p.data = 0;
    this.list.push(p);
    return p;
  }

  spawn(kind: ProjKind, team: 'player' | 'enemy', x: number, y: number, z: number, vx: number, vy: number, vz: number, damage: number, life: number, radius: number): Proj {
    const p = this.make();
    p.kind = kind;
    p.team = team;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.damage = damage;
    p.life = life;
    p.radius = radius;
    return p;
  }

  enemyShot(kind: ProjKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, damage: number, owner: Enemy | null, opts: { homing?: number; life?: number; gravity?: number } = {}) {
    const radius = kind === 'orb' || kind === 'holy' ? 0.75 : kind === 'skull' ? 0.8 : kind === 'eflame' ? 1.2 : kind === 'coin' ? 0.45 : 0.5;
    const p = this.spawn(kind, 'enemy', x, y, z, vx, vy, vz, damage, opts.life ?? 3, radius);
    p.owner = owner;
    p.homing = opts.homing ?? 0;
    p.gravity = opts.gravity ?? 0;
    if (kind === 'eflame') p.element = 'fire';
    if (kind === 'purple') p.element = 'shock';
    return p;
  }

  /** Ballistic lob landing at (tx,tz) after `t` seconds. */
  lob(kind: ProjKind, x: number, y: number, z: number, tx: number, tz: number, t: number, damage: number, owner: Enemy | null, radius: number, team: 'player' | 'enemy' = 'enemy') {
    const g = 30;
    const vx = (tx - x) / t, vz = (tz - z) / t;
    const vy = (0 - y + 0.5 * g * t * t) / t;
    const p = this.spawn(kind, team, x, y, z, vx, vy, vz, damage, t + 1, 0.8);
    p.gravity = g;
    p.splash = radius;
    p.owner = owner;
    if (kind === 'fireball') p.element = 'fire';
    return p;
  }

  meteor(tx: number, tz: number, delay: number, damage: number, owner: Enemy | null) {
    const h = 55;
    const p = this.spawn('meteor', 'enemy', tx + rand(-6, 6), h, tz + rand(-6, 6), 0, 0, 0, damage, delay + 0.5, 1.5);
    p.vx = (tx - p.x) / delay;
    p.vz = (tz - p.z) / delay;
    p.vy = -h / delay;
    p.splash = 5;
    p.element = 'fire';
    p.owner = owner;
    return p;
  }

  clear() {
    for (const p of this.list) this.pool.push(p);
    this.list.length = 0;
  }

  update(dt: number) {
    const w = this.w;
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.alive) this.step(p, dt);
      if (!p.alive) {
        list[i] = list[list.length - 1];
        list.pop();
        this.pool.push(p);
      }
    }
    void w;
  }

  private kill(p: Proj) {
    p.alive = false;
  }

  private step(p: Proj, dt: number) {
    const w = this.w;
    p.age += dt;
    p.life -= dt;
    if (p.life <= 0) {
      if (p.kind === 'rocket' || p.kind === 'minirocket' || p.kind === 'mortar' || p.kind === 'bomblet' || p.kind === 'shell') this.detonate(p, p.x, p.y, p.z);
      this.kill(p);
      return;
    }
    // --- mines are stationary triggers
    if (p.kind === 'mine') {
      p.armed += dt;
      if (p.armed > 0.5) {
        if (Math.random() < dt * 3) audio.play('mineBeep', { x: p.x, z: p.z });
        const near = w.nearestEnemy(p.x, p.z, 3.8);
        if (near) {
          this.detonate(p, p.x, 0.5, p.z);
          this.kill(p);
        }
      }
      return;
    }
    // --- homing
    if (p.homing > 0) {
      if (p.team === 'player') {
        if (!p.target || !p.target.alive) p.target = w.nearestEnemy(p.x, p.z, 45, p.vx, p.vz);
        if (p.target) {
          const t = p.target;
          tmpV.set(t.pos.x - p.x, t.y + t.def.height * 0.45 * t.scale - p.y, t.pos.z - p.z);
          this.steer(p, tmpV, dt);
        }
      } else {
        const pl = w.player;
        tmpV.set(pl.pos.x - p.x, pl.pos.y + 1 - p.y, pl.pos.z - p.z);
        this.steer(p, tmpV, dt);
      }
    }
    if (p.kind === 'rocket' || p.kind === 'minirocket') {
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      const acc = Math.min(1.5, 1 + dt * 1.8);
      if (sp < 140) {
        p.vx *= acc; p.vy *= acc; p.vz *= acc;
      }
    }
    if (p.kind === 'flame' || p.kind === 'eflame') {
      const k = Math.exp(-2.2 * dt);
      p.vx *= k; p.vz *= k;
      p.vy += 3 * dt;
      p.radius += dt * 2.6;
    }
    p.vy -= p.gravity * dt;
    const x0 = p.x, y0 = p.y, z0 = p.z;
    let x1 = x0 + p.vx * dt, y1 = y0 + p.vy * dt, z1 = z0 + p.vz * dt;

    // --- wall collision
    const segLen = Math.hypot(x1 - x0, z1 - z0);
    if (segLen > 1e-5 && y0 < WALL_H) {
      const wd = w.grid.raycast(x0, z0, x1 - x0, z1 - z0, segLen, p.team === 'enemy' && p.kind === 'meteor');
      if (wd < segLen) {
        const t = wd / segLen;
        const hx = x0 + (x1 - x0) * t, hz = z0 + (z1 - z0) * t, hy = y0 + (y1 - y0) * t;
        if (p.kind === 'saw' && (p.bounces > 0 || p.data > 0)) {
          // bounce: figure out which axis we crossed
          const cellA = w.grid.isSolidAt(x1, z0), cellB = w.grid.isSolidAt(x0, z1);
          if (cellA || !cellB) p.vx = -p.vx;
          if (cellB || !cellA) p.vz = -p.vz;
          p.bounces--;
          x1 = hx - Math.sign(p.vx) * -0.1;
          z1 = hz - Math.sign(p.vz) * -0.1;
          w.fx.sparks(hx, hy, hz, p.vx * 0.02, 0.5, p.vz * 0.02, 8, [1, 0.9, 0.6], 16);
          audio.play('sawHit', { x: hx, z: hz });
          x1 = hx;
          z1 = hz;
        } else {
          this.impact(p, hx - (x1 - x0) * 0.02, hy, hz - (z1 - z0) * 0.02, true);
          return;
        }
      }
    }
    // --- floor
    if (y1 <= 0.05 && p.vy <= 0) {
      if (p.kind === 'coin' && p.team === 'enemy') {
        if (Math.random() < 0.35) w.spawnCoinsAt(x1, z1, 1, 0.5, true);
        this.kill(p);
        return;
      }
      if (p.kind === 'saw') {
        y1 = 0.6;
        p.vy = 0;
      } else if (p.kind === 'flame' || p.kind === 'eflame') {
        y1 = 0.3;
        p.vy = Math.abs(p.vy) * 0.2;
      } else {
        const t = y0 / Math.max(1e-4, y0 - y1);
        this.impact(p, x0 + (x1 - x0) * t, 0.1, z0 + (z1 - z0) * t, false);
        return;
      }
    }
    // --- entity collisions
    if (p.team === 'player') {
      if (this.hitEnemies(p, x0, y0, z0, x1, y1, z1)) return;
      w.hitProps(p, x0, y0, z0, x1, y1, z1);
    } else if (p.kind !== 'meteor') {
      const pl = w.player;
      if (pl.alive) {
        const cy = pl.pos.y + 0.9;
        const r = pl.hitRadius + p.radius;
        let hit = segSphere(x0, y0, z0, x1, y1, z1, pl.pos.x, cy, pl.pos.z, r) >= 0;
        if (!hit) {
          const fx = Math.sin(pl.heading) * 1.4, fz = Math.cos(pl.heading) * 1.4;
          hit = segSphere(x0, y0, z0, x1, y1, z1, pl.pos.x + fx, cy, pl.pos.z + fz, pl.hitRadius * 0.85 + p.radius) >= 0 ||
            segSphere(x0, y0, z0, x1, y1, z1, pl.pos.x - fx, cy, pl.pos.z - fz, pl.hitRadius * 0.85 + p.radius) >= 0;
        }
        if (hit) {
          if (pl.bubbleT > 0) {
            // reflect
            p.team = 'player';
            const tgt = w.nearestEnemy(p.x, p.z, 60);
            const sp = Math.hypot(p.vx, p.vz) * 1.3;
            if (tgt) {
              const dx = tgt.pos.x - p.x, dz = tgt.pos.z - p.z;
              const dl = Math.hypot(dx, dz) || 1;
              p.vx = (dx / dl) * sp;
              p.vz = (dz / dl) * sp;
            } else {
              p.vx = -p.vx;
              p.vz = -p.vz;
            }
            p.damage *= 2.5;
            p.life = 2;
            w.fx.sparks(x1, y1, z1, 0, 1, 0, 10, [0.5, 0.8, 1], 14);
          } else {
            w.damagePlayer(p.damage, { element: p.element, x: p.x, z: p.z, enemy: p.owner, projectile: true });
            this.impact(p, x1, y1, z1, false);
            return;
          }
        }
      }
    }
    p.x = x1; p.y = y1; p.z = z1;
    this.trail(p, dt);
  }

  private steer(p: Proj, to: THREE.Vector3, dt: number) {
    const sp = Math.hypot(p.vx, p.vy, p.vz);
    to.normalize().multiplyScalar(sp);
    const k = 1 - Math.exp(-p.homing * dt);
    p.vx += (to.x - p.vx) * k;
    p.vy += (to.y - p.vy) * k;
    p.vz += (to.z - p.vz) * k;
  }

  private hitEnemies(p: Proj, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    const w = this.w;
    const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
    const half = Math.hypot(x1 - x0, z1 - z0) * 0.5 + p.radius;
    const cands = w.enemiesNear(mx, mz, half + 9);
    let best: Enemy | null = null;
    let bestT = 2;
    let bestCrit = false;
    for (const e of cands) {
      if (!e.alive || e.spawnT > 0) continue;
      if (p.hitSet) {
        const last = p.hitSet.get(e.id);
        if (last !== undefined && (p.kind !== 'saw' || p.age - last < 0.3)) continue;
      }
      const sc = e.scale;
      const fx = Math.sin(e.heading), fz = Math.cos(e.heading);
      for (const s of e.def.spheres) {
        const f = (s.fwd ?? 0) * sc;
        const t = segSphere(x0, y0, z0, x1, y1, z1, e.pos.x + fx * f, e.y + s.y * sc, e.pos.z + fz * f, s.r * sc + p.radius * 0.5);
        if (t >= 0 && t < bestT) {
          bestT = t;
          best = e;
          bestCrit = s.crit;
        }
      }
    }
    if (!best) return false;
    const hx = x0 + (x1 - x0) * bestT, hy = y0 + (y1 - y0) * bestT, hz = z0 + (z1 - z0) * bestT;
    const dl = Math.hypot(p.vx, p.vz) || 1;
    const isArea = p.splash > 0 && p.kind !== 'saw';
    if (isArea) {
      // direct hit bonus then splash
      w.damageEnemy(best, { amount: p.damage * 0.5, element: p.element, elemChance: p.elemChance, headshot: bestCrit, critBonus: p.critBonus, source: 'weapon', weapon: p.weapon, kx: p.vx / dl, kz: p.vz / dl, knock: 8, hx, hy, hz });
      this.impact(p, hx, hy, hz, false);
      return true;
    }
    w.damageEnemy(best, {
      amount: p.damage, element: p.element, elemChance: p.elemChance, headshot: bestCrit, critBonus: p.critBonus, source: p.kind === 'ghost' ? 'ghost' : 'weapon', weapon: p.weapon,
      kx: p.vx / dl, kz: p.vz / dl, knock: p.kind === 'pellet' ? 3 : p.kind === 'saw' ? 2 : p.kind === 'sonic' ? 26 : 1.5, hx, hy, hz,
    });
    if (p.kind === 'saw') audio.play('sawHit', { x: hx, z: hz });
    if (p.pierce > 0 || p.kind === 'flame' || p.kind === 'sonic') {
      if (!p.hitSet) p.hitSet = new Map();
      p.hitSet.set(best.id, p.age);
      if (p.kind !== 'flame' && p.kind !== 'sonic' && p.kind !== 'saw') p.pierce--;
      return false;
    }
    this.kill(p);
    return true;
  }

  private detonate(p: Proj, x: number, y: number, z: number) {
    const w = this.w;
    if (p.team === 'player') {
      w.explode(x, y, z, p.splash * w.run.stats.splash, p.damage, { team: 'player', element: p.element, elemChance: p.elemChance, weapon: p.weapon, critBonus: p.critBonus, small: p.kind === 'minirocket' || p.kind === 'bomblet' });
      const sp = p.weapon?.item.special;
      if (sp === 'boneShards' && p.kind === 'rocket') {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const s = this.spawn('shard_p', 'player', x, Math.max(0.8, y), z, Math.cos(a) * 60, 2, Math.sin(a) * 60, p.damage * 0.3, 0.5, 0.3);
          s.pierce = 2;
          s.weapon = p.weapon;
        }
        w.fx.boneBurst(x, y, z, 0, 0, 10);
      }
      if (sp === 'clusterMortar' && p.kind === 'mortar') {
        for (let i = 0; i < 6; i++) {
          const b = this.spawn('bomblet', 'player', x, 1.5, z, rand(-14, 14), rand(12, 20), rand(-14, 14), p.damage * 0.4, 3, 0.4);
          b.gravity = 34;
          b.splash = 3.5;
          b.weapon = p.weapon;
          b.element = p.element;
        }
      }
      if (sp === 'splitShells' && p.kind === 'shell') {
        for (let i = 0; i < 3; i++) {
          const b = this.spawn('bomblet', 'player', x, 1.5, z, rand(-12, 12), rand(10, 16), rand(-12, 12), p.damage * 0.35, 3, 0.4);
          b.gravity = 34;
          b.splash = 3;
          b.element = 'fire';
          b.elemChance = 1;
          b.weapon = p.weapon;
        }
      }
    } else {
      w.explode(x, y, z, p.splash || 3, p.damage, { team: 'enemy', element: p.element, source: p.owner ?? undefined, noDamageOwner: true });
      if (p.kind === 'fireball' || p.kind === 'meteor') w.addFirePatch(x, z, p.kind === 'meteor' ? 4.5 : 3.2, 3.5, p.damage * 0.25, 'enemy');
    }
  }

  private impact(p: Proj, x: number, y: number, z: number, wall: boolean) {
    const w = this.w;
    const c = ELEMENT_COLORS[p.element];
    switch (p.kind) {
      case 'shell':
      case 'rocket':
      case 'minirocket':
      case 'mortar':
      case 'bomblet':
      case 'boulder':
      case 'fireball':
      case 'meteor':
        this.detonate(p, x, Math.max(0.3, y), z);
        if (p.kind === 'boulder') {
          w.fx.chunkBurst(x, 1, z, 0x6a6a72, 8, 0.7, 10);
          w.fx.dust(x, z, 6, [0.5, 0.48, 0.45], 1.5);
        }
        break;
      case 'saw':
        break;
      case 'bullet':
      case 'pellet':
      case 'shard_p':
      case 'ebullet':
        w.fx.sparks(x, y, z, wall ? -p.vx * 0.01 : 0, 0.6, wall ? -p.vz * 0.01 : 0, 3, c, 12);
        if (wall && Math.random() < 0.3) w.fx.smokePuff(x, y, z, 0, 1, 0, 0.35, 0.6, 0.4);
        break;
      case 'arrow':
      case 'shard':
        w.fx.sparks(x, y, z, 0, 0.6, 0, 5, p.kind === 'shard' ? [0.7, 0.3, 1] : [1, 0.7, 0.4], 12);
        break;
      case 'orb':
      case 'holy':
      case 'purple':
      case 'skull':
      case 'ghost':
      case 'sonic': {
        const col: [number, number, number] = p.kind === 'holy' ? [1, 0.85, 0.4] : p.kind === 'purple' ? [0.7, 0.3, 1] : p.kind === 'skull' || p.kind === 'ghost' ? [0.3, 1, 0.8] : [0.75, 0.3, 1];
        w.fx.magicBurst(x, y, z, col, 8, 8);
        break;
      }
      case 'flame':
      case 'eflame':
        break;
      case 'coin':
        w.fx.sparks(x, y, z, 0, 1, 0, 4, [1, 0.8, 0.2], 8);
        break;
    }
    this.kill(p);
  }

  /** Per-frame visuals: trails, glows and instanced meshes. */
  private trail(p: Proj, dt: number) {
    const w = this.w;
    const fx = w.fx;
    const c = ELEMENT_COLORS[p.element];
    switch (p.kind) {
      case 'rocket':
      case 'minirocket':
        if (Math.random() < (p.kind === 'rocket' ? 0.9 : 0.4)) fx.smokePuff(p.x - p.vx * 0.012, p.y, p.z - p.vz * 0.012, rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5), p.kind === 'rocket' ? 0.45 * p.size : 0.25, 0.8, 0.7);
        break;
      case 'mortar':
      case 'fireball':
      case 'meteor':
        if (Math.random() < 0.8) fx.fire.emit(p.x, p.y, p.z, rand(-1, 1), rand(0, 2), rand(-1, 1), 0.4, p.kind === 'meteor' ? 1.6 : 0.6, [4, 1.6, 0.3], [1, 0.1, 0.02], 3, 2);
        if (p.kind === 'meteor' && Math.random() < 0.5) fx.smokePuff(p.x, p.y + 1, p.z, 0, 2, 0, 1.2, 0.2, 1.2);
        break;
      case 'flame':
      case 'eflame':
        if (Math.random() < 0.7) fx.fire.emit(p.x, p.y, p.z, p.vx * 0.2, 1, p.vz * 0.2, 0.25, p.radius * 0.8, p.kind === 'flame' && p.element !== 'fire' ? [c[0] * 3, c[1] * 3, c[2] * 3] : [4, 1.8, 0.4], [0.8, 0.1, 0.02], 4, 3);
        break;
      case 'skull':
      case 'ghost':
        if (Math.random() < 0.6) fx.add.emit(p.x, p.y, p.z, rand(-1, 1), rand(0, 1), rand(-1, 1), 0.5, 0.5, 0.1, 0.4, 2.2, 1.6, 1);
        break;
    }
    void dt;
  }

  /** Render all projectiles (called once per frame after update). */
  render(time: number) {
    const add = this.w.fx.add;
    for (const p of this.list) {
      const c = ELEMENT_COLORS[p.element];
      const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
      switch (p.kind) {
        case 'bullet':
        case 'shard_p':
          add.draw(p.x, p.y, p.z, p.vx, p.vy, p.vz, 0.28 * p.size, 0.018, c[0] * 4, c[1] * 3.2, c[2] * 2.5, 1, SHAPE_CORE);
          break;
        case 'pellet':
          add.draw(p.x, p.y, p.z, p.vx, p.vy, p.vz, 0.22, 0.012, c[0] * 4, c[1] * 3.2, c[2] * 2.5, 1, SHAPE_CORE);
          break;
        case 'ebullet':
          add.draw(p.x, p.y, p.z, p.vx, p.vy, p.vz, 0.35, 0.02, 4, 1.4, 0.4, 1, SHAPE_CORE);
          break;
        case 'shell':
          this.orient(p, sp, 1);
          this.shells.push(tmpM);
          add.draw(p.x, p.y, p.z, 0, 0, 0, 1.3, 0, c[0] * 2, c[1] * 1.5, c[2], 0.7, SHAPE_DOT);
          break;
        case 'rocket':
        case 'minirocket': {
          const s = p.kind === 'rocket' ? 1.1 * p.size : 0.6;
          this.orient(p, sp, s);
          this.rockets.push(tmpM);
          add.draw(p.x - (p.vx / sp) * s * 0.8, p.y - (p.vy / sp) * s * 0.8, p.z - (p.vz / sp) * s * 0.8, -p.vx, -p.vy, -p.vz, 0.5 * s, 0.012, 4, 2, 0.5, 1, SHAPE_CORE);
          break;
        }
        case 'mortar':
        case 'bomblet':
          this.orient(p, sp, p.kind === 'mortar' ? 1.5 : 0.7);
          this.shells.push(tmpM);
          break;
        case 'saw': {
          tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), time * 30);
          tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(1, 1, 1));
          this.saws.push(tmpM);
          add.draw(p.x, p.y, p.z, 0, 0, 0, 1.8, 0, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 0.35, SHAPE_DOT);
          break;
        }
        case 'flame':
        case 'eflame':
          add.draw(p.x, p.y, p.z, 0, 0, 0, p.radius * 1.4, 0, 1.6, 0.5, 0.1, 0.4, SHAPE_DOT);
          break;
        case 'arrow':
          this.orient(p, sp, 1);
          this.arrows.push(tmpM);
          add.draw(p.x, p.y, p.z, p.vx, p.vy, p.vz, 0.3, 0.012, 3, 1.2, 0.4, 0.8, SHAPE_CORE);
          break;
        case 'shard':
          this.orient(p, sp, 1);
          this.shards.push(tmpM);
          add.draw(p.x, p.y, p.z, 0, 0, 0, 1.2, 0, 1.4, 0.6, 2.4, 0.6, SHAPE_DOT);
          break;
        case 'orb':
          add.draw(p.x, p.y, p.z, 0, 0, 0, 2.4, 0, 1.6, 0.5, 2.8, 0.7, SHAPE_DOT);
          add.draw(p.x, p.y, p.z, 0, 0, 0, 0.9, 0, 3, 2, 4, 1, SHAPE_CORE);
          break;
        case 'holy':
          add.draw(p.x, p.y, p.z, 0, 0, 0, 2.6, 0, 2.6, 1.9, 0.6, 0.7, SHAPE_DOT);
          add.draw(p.x, p.y, p.z, 0, 0, 0, 1.0, 0, 4, 3.6, 2, 1, SHAPE_STAR, time * 4);
          break;
        case 'purple':
          add.draw(p.x, p.y, p.z, p.vx, p.vy, p.vz, 1.2, 0.02, 1.8, 0.6, 3.5, 0.9, SHAPE_CORE);
          break;
        case 'skull':
        case 'ghost': {
          this.orient(p, sp, 1);
          this.skulls.push(tmpM);
          add.draw(p.x, p.y, p.z, 0, 0, 0, 2.2, 0, 0.3, 1.8, 1.3, 0.6, SHAPE_DOT);
          break;
        }
        case 'sonic':
          add.draw(p.x, p.y, p.z, 0, 0, 0, p.radius * 2.2, 0, 1.6, 1.6, 2.2, 0.5, 3);
          break;
        case 'coin':
          tmpQ.setFromEuler(new THREE.Euler(time * 12 + p.x, time * 7, 0));
          tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(1, 1, 1));
          this.coins.push(tmpM);
          break;
        case 'boulder':
          tmpQ.setFromEuler(new THREE.Euler(time * 5, time * 3, 0));
          tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(1.2, 1.2, 1.2));
          this.boulders.push(tmpM);
          break;
        case 'fireball':
          add.draw(p.x, p.y, p.z, 0, 0, 0, 2.4, 0, 3, 1.2, 0.3, 0.9, SHAPE_DOT);
          add.draw(p.x, p.y, p.z, 0, 0, 0, 1.0, 0, 4, 2.6, 1, 1, SHAPE_CORE);
          break;
        case 'meteor':
          tmpQ.setFromEuler(new THREE.Euler(time * 4, 0, 0));
          tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(3, 3, 3));
          this.skulls.push(tmpM);
          add.draw(p.x, p.y, p.z, 0, 0, 0, 6, 0, 3, 1, 0.2, 0.9, SHAPE_DOT);
          break;
        case 'mine': {
          tmpM.compose(tmpP.set(p.x, 0.15, p.z), tmpQ.identity(), tmpS.set(1, 1, 1));
          this.mines.push(tmpM);
          const blink = p.armed > 0.5 && Math.sin(time * 12) > 0;
          if (blink) add.draw(p.x, 0.5, p.z, 0, 0, 0, 0.8, 0, 4, 0.3, 0.2, 1, SHAPE_CORE);
          break;
        }
      }
    }
    for (const pool of [this.shells, this.rockets, this.saws, this.arrows, this.shards, this.coins, this.boulders, this.mines, this.skulls]) pool.end();
  }

  private orient(p: Proj, sp: number, s: number) {
    tmpV.set(p.vx / sp, p.vy / sp, p.vz / sp);
    tmpQ.setFromUnitVectors(Z, tmpV);
    if (p.kind === 'skull' || p.kind === 'ghost') {
      tmpQ2.setFromAxisAngle(Z, 0);
      tmpQ.multiply(tmpQ2);
    }
    tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(s, s, s));
  }
}
