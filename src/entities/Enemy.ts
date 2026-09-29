import * as THREE from 'three';
import type { World } from '../game/World';
import type { Element } from '../fx/FX';
import { clamp, damp, dampAngle, headingOf } from '../core/MathUtil';

export type BodyType = 'bone' | 'flesh' | 'armor' | 'spirit';
export type EliteMod = 'armored' | 'blazing' | 'hasted' | 'vampiric' | 'shielded' | 'volatile';

export const ELITE_INFO: Record<EliteMod, { name: string; color: number }> = {
  armored: { name: 'Armored', color: 0xc0c8d8 },
  blazing: { name: 'Blazing', color: 0xff5a1a },
  hasted: { name: 'Hasted', color: 0x40e0ff },
  vampiric: { name: 'Vampiric', color: 0xff2050 },
  shielded: { name: 'Shielded', color: 0x4a8aff },
  volatile: { name: 'Volatile', color: 0xffd23a },
};

export interface HitSphere {
  y: number;
  r: number;
  crit: boolean;
  fwd?: number;
}

export interface EnemyVisual {
  root: THREE.Group;
  parts: Record<string, THREE.Object3D>;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  height: number;
  mass: number;
  damage: number;
  xp: number;
  gold: number;
  body: BodyType;
  flying?: boolean;
  cost: number;
  minFloor: number;
  acts: number[];
  weight: number;
  spheres: HitSphere[];
  build: () => EnemyVisual;
  ai: (e: Enemy, w: World, dt: number) => void;
  anim: (e: Enemy, dt: number, w?: World) => void;
  onDeath?: (e: Enemy, w: World) => void;
  boss?: boolean;
  noRam?: boolean;
  stationary?: boolean;
}

const tmpDir = { x: 0, z: 0 };
let enemyIds = 1;

export class Enemy {
  id = enemyIds++;
  def: EnemyDef;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  heading = 0;
  hp: number;
  maxHp: number;
  shield = 0;
  maxShield = 0;
  radius: number;
  mass: number;
  damage: number;
  speedMult = 1;
  alive = true;
  dead = false;
  room: number;
  visual: EnemyVisual;
  mats: THREE.MeshToonMaterial[] = [];
  baseEmissive: THREE.Color[] = [];
  flash = 0;
  punch = 0;
  scale = 1;
  // state machine
  state = 'idle';
  st = 0;
  cd = 0;
  cd2 = 0;
  aux = 0;
  aux2 = 0;
  tx = 0;
  tz = 0;
  walkPhase = 0;
  spawnT = 0.8;
  // statuses
  burnT = 0;
  burnDps = 0;
  shockT = 0;
  shockDps = 0;
  acidT = 0;
  acidDps = 0;
  chill = 0;
  chillT = 0;
  frozenT = 0;
  stunT = 0;
  knockX = 0;
  knockZ = 0;
  y = 0;
  vy = 0;
  airborne = false;
  spinX = 0;
  spinZ = 0;
  lastHitT = -10;
  ramCd = 0;
  elite: EliteMod[] = [];
  isElite = false;
  isMiniboss = false;
  summoned = false;
  lastElement: Element = 'none';
  pullX = 0;
  pullZ = 0;
  displayName: string;
  shieldBubble: THREE.Mesh | null = null;
  auraT = 0;
  dotAccum = 0;
  killedByRam = false;
  frozeOnDeath = false;

  constructor(def: EnemyDef, x: number, z: number, room: number, hpMult: number, dmgMult: number) {
    this.def = def;
    this.pos.set(x, 0, z);
    this.maxHp = this.hp = def.hp * hpMult;
    this.radius = def.radius;
    this.mass = def.mass;
    this.damage = def.damage * dmgMult;
    this.room = room;
    this.visual = def.build();
    this.displayName = def.name;
    this.visual.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      const mat = m.material as THREE.Material;
      if ((mat as THREE.MeshToonMaterial).isMeshToonMaterial) {
        const c = (mat as THREE.MeshToonMaterial).clone();
        if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
          c.onBeforeCompile = mat.onBeforeCompile;
          c.customProgramCacheKey = mat.customProgramCacheKey;
        }
        m.material = c;
        this.mats.push(c);
        this.baseEmissive.push(c.emissive.clone().multiplyScalar(c.emissiveIntensity));
        c.emissiveIntensity = 1;
        c.emissive.copy(this.baseEmissive[this.baseEmissive.length - 1]);
      }
    });
    this.visual.root.position.copy(this.pos);
    this.heading = Math.random() * Math.PI * 2;
  }

  makeElite(mods: EliteMod[]) {
    this.elite = mods;
    this.isElite = true;
    this.maxHp *= 2.6;
    this.damage *= 1.25;
    this.scale = 1.25;
    for (const m of mods) {
      if (m === 'armored') this.maxHp *= 1.5;
      if (m === 'hasted') this.speedMult = 1.45;
      if (m === 'shielded') {
        this.maxShield = this.shield = this.maxHp * 0.45;
        const b = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4a8aff).multiplyScalar(1.5), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        b.layers.set(1);
        const s = Math.max(this.def.radius * 1.6, this.def.height * 0.7);
        b.scale.setScalar(s);
        b.position.y = this.def.height * 0.5;
        this.visual.root.add(b);
        this.shieldBubble = b;
      }
    }
    this.hp = this.maxHp;
    this.displayName = `${mods.map((m) => ELITE_INFO[m].name).join(' ')} ${this.def.name}`;
    const c = new THREE.Color(ELITE_INFO[mods[0]].color);
    this.mats.forEach((m, i) => {
      this.baseEmissive[i].lerp(c.clone().multiplyScalar(0.35), 0.6);
      m.emissive.copy(this.baseEmissive[i]);
    });
    this.visual.root.scale.setScalar(this.scale);
  }

  get cx() {
    return this.pos.x;
  }
  get cz() {
    return this.pos.z;
  }
  get active() {
    return this.alive && this.spawnT <= 0;
  }
  get disabled() {
    return this.frozenT > 0 || this.stunT > 0 || this.airborne || this.spawnT > 0;
  }
  get slow() {
    return this.frozenT > 0 ? 0 : 1 - Math.min(0.6, this.chill * 0.12);
  }
  distTo(x: number, z: number) {
    return Math.hypot(this.pos.x - x, this.pos.z - z);
  }

  /** Move toward a planar direction with acceleration, separation and collisions. */
  move(w: World, dx: number, dz: number, speed: number, dt: number, accel = 8, face = true) {
    const sp = speed * this.speedMult * this.slow;
    let tvx = dx * sp, tvz = dz * sp;
    // separation
    const nb = w.enemiesNear(this.pos.x, this.pos.z, this.radius + 3);
    for (const o of nb) {
      if (o === this) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const d = Math.hypot(ox, oz);
      const min = this.radius + o.radius;
      if (d < min && d > 1e-4) {
        const push = ((min - d) / min) * 12;
        tvx += (ox / d) * push;
        tvz += (oz / d) * push;
      }
    }
    this.vel.x = damp(this.vel.x, tvx, accel, dt);
    this.vel.z = damp(this.vel.z, tvz, accel, dt);
    if (face && (Math.abs(dx) + Math.abs(dz)) > 0.01 && sp > 0.1) this.heading = dampAngle(this.heading, headingOf(dx, dz), 8, dt);
  }

  /** Direction toward (x,z) using direct line if visible, otherwise the flow field. */
  pathTo(w: World, x: number, z: number): { x: number; z: number } {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (this.def.flying || (d < 60 && w.grid.los(this.pos.x, this.pos.z, x, z) && this.clearWalk(w, x, z))) {
      tmpDir.x = dx / d;
      tmpDir.z = dz / d;
      return tmpDir;
    }
    if (w.grid.flowDir(this.pos.x, this.pos.z, tmpDir)) return tmpDir;
    tmpDir.x = dx / d;
    tmpDir.z = dz / d;
    return tmpDir;
  }

  private clearWalk(w: World, x: number, z: number) {
    // avoid lava on the straight path (sample a few points)
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      if (w.grid.isLava(this.pos.x + (x - this.pos.x) * t, this.pos.z + (z - this.pos.z) * t)) return false;
    }
    return true;
  }

  faceTo(x: number, z: number, dt: number, rate = 10) {
    this.heading = dampAngle(this.heading, headingOf(x - this.pos.x, z - this.pos.z), rate, dt);
  }

  /** Physics integrate: knockback, airborne launches, collisions. */
  integrate(w: World, dt: number) {
    if (this.airborne) {
      this.vy -= 42 * dt;
      this.y += this.vy * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.airborne = false;
        this.vel.multiplyScalar(0.3);
        this.stunT = Math.max(this.stunT, 0.5);
        w.fx.dust(this.pos.x, this.pos.z, 3, [0.45, 0.42, 0.38], 0.8);
        if (!this.alive) this.dead = true;
      }
    } else {
      this.pos.x += (this.vel.x + this.knockX + this.pullX) * dt;
      this.pos.z += (this.vel.z + this.knockZ + this.pullZ) * dt;
      const k = Math.exp(-6 * dt);
      this.knockX *= k;
      this.knockZ *= k;
      this.pullX = 0;
      this.pullZ = 0;
    }
    if (!this.def.stationary) {
      const r = w.grid.collideCircle(this.pos.x, this.pos.z, this.radius, true, this.y);
      this.pos.x = r.x;
      this.pos.z = r.z;
      if (r.hit && this.airborne) {
        // wall slam
        const vn = this.vel.x * r.nx + this.vel.z * r.nz;
        if (vn < 0) {
          this.vel.x -= 1.6 * vn * r.nx;
          this.vel.z -= 1.6 * vn * r.nz;
        }
      }
    }
  }

  knock(dx: number, dz: number, force: number) {
    if (this.def.boss || this.def.stationary) return;
    const f = force / Math.max(0.4, this.mass);
    this.knockX += dx * f;
    this.knockZ += dz * f;
  }

  launch(vx: number, vz: number, vy: number) {
    if (this.def.boss || this.def.stationary || this.mass > 3) return;
    this.airborne = true;
    this.vel.set(vx, 0, vz);
    this.vy = vy;
    this.y = Math.max(this.y, 0.1);
    this.spinX = (Math.random() - 0.5) * 14;
    this.spinZ = (Math.random() - 0.5) * 14;
  }

  statusTick(w: World, dt: number) {
    let dot = 0;
    if (this.burnT > 0) {
      this.burnT -= dt;
      dot += this.burnDps;
      if (Math.random() < dt * 14) w.fx.fire.emit(this.pos.x + (Math.random() - 0.5) * this.radius, this.y + Math.random() * this.def.height, this.pos.z + (Math.random() - 0.5) * this.radius, 0, 3, 0, 0.4, 0.4 + Math.random() * 0.3, [3, 1.2, 0.2], [1, 0.1, 0], 2, 3);
    }
    if (this.shockT > 0) {
      this.shockT -= dt;
      dot += this.shockDps;
      if (Math.random() < dt * 6) {
        const h = this.def.height;
        w.fx.beams.lightning(this.pos.x, this.y + Math.random() * h, this.pos.z, this.pos.x + (Math.random() - 0.5) * 3, this.y + Math.random() * h, this.pos.z + (Math.random() - 0.5) * 3, 0.15, 0.6, 1.2, 3, 0.5);
      }
    }
    if (this.acidT > 0) {
      this.acidT -= dt;
      dot += this.acidDps;
      if (Math.random() < dt * 8) w.fx.add.emit(this.pos.x + (Math.random() - 0.5) * this.radius, this.y + Math.random() * this.def.height, this.pos.z + (Math.random() - 0.5) * this.radius, 0, -2, 0, 0.6, 0.25, 0.1, 0.5, 1.6, 0.2, 1, { grav: 10 });
    }
    if (this.chillT > 0) {
      this.chillT -= dt;
      if (this.chillT <= 0) this.chill = 0;
    }
    if (this.frozenT > 0) this.frozenT -= dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (dot > 0) {
      this.dotAccum += dot * dt;
      if (this.dotAccum >= Math.max(3, this.maxHp * 0.01)) {
        const amt = this.dotAccum;
        this.dotAccum = 0;
        const el: Element = this.burnT > 0 ? 'fire' : this.acidT > 0 ? 'acid' : 'shock';
        w.damageEnemy(this, { amount: amt, element: el, source: 'status', noStatus: true, noCrit: true, silent: true });
      }
    }
  }

  /** Visual sync: flash, squash, spawn rise, frozen tint, airborne spin. */
  syncVisual(dt: number) {
    const v = this.visual.root;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.punch = Math.max(0, this.punch - dt * 5);
    const f = this.flash;
    const frozen = this.frozenT > 0;
    for (let i = 0; i < this.mats.length; i++) {
      const m = this.mats[i];
      const base = this.baseEmissive[i];
      if (frozen) m.emissive.setRGB(0.35, 0.6, 0.9);
      else if (f > 0) m.emissive.setRGB(base.r + f * 1.2, base.g + f * 1.2, base.b + f * 1.2);
      else if (this.burnT > 0) m.emissive.setRGB(base.r + 0.25, base.g + 0.08, base.b);
      else m.emissive.copy(base);
    }
    let yOff = this.y;
    if (this.spawnT > 0) yOff -= (this.spawnT / 0.8) * this.def.height * 1.1;
    v.position.set(this.pos.x, yOff, this.pos.z);
    v.rotation.y = this.heading;
    if (this.airborne) {
      v.rotation.x += this.spinX * dt;
      v.rotation.z += this.spinZ * dt;
    } else {
      v.rotation.x = damp(v.rotation.x, 0, 12, dt);
      v.rotation.z = damp(v.rotation.z, 0, 12, dt);
    }
    const sq = 1 + this.punch * 0.25;
    v.scale.set(this.scale * sq, this.scale * (2 - sq), this.scale * sq);
    if (this.shieldBubble) {
      this.shieldBubble.visible = this.shield > 0;
      (this.shieldBubble.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.2 * clamp(this.flash, 0, 1);
    }
  }
}
