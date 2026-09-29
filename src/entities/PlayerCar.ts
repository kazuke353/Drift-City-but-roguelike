import * as THREE from 'three';
import type { World } from '../game/World';
import type { ChassisDef } from '../game/Cars';
import { buildCar, setCarPlow, setCarWheels, type CarModel } from './CarModels';
import { WeaponRuntime, GadgetRuntime } from '../combat/Weapons';
import { angleDiff, clamp, damp, wrapAngle } from '../core/MathUtil';
import { audio } from '../audio/Audio';
import { rand } from '../core/Rng';
import { SHAPE_CORE, SHAPE_DOT } from '../fx/Particles';
import { glow, FX_LAYER } from '../render/Toon';

export interface DriveInput {
  throttle: number;
  steer: number;
  steerFromKeys: boolean;
  handbrake: boolean;
  boost: boolean;
  camYaw: number;
  mode: 'camera' | 'classic';
}

const DRIFT_TIERS = [0.75, 1.7, 2.9];
const TIER_COLORS: [number, number, number][] = [[1, 0.8, 0.4], [0.3, 0.6, 1], [1, 0.55, 0.1], [0.8, 0.3, 1]];

export class PlayerCar {
  model: CarModel;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  heading = 0;
  angVel = 0;
  steer = 0;
  throttle = 0;
  vy = 0;
  airborne = false;
  airTime = 0;
  drifting = false;
  driftCharge = 0;
  driftTier = 0;
  driftDir = 0;
  driftBoostT = 0;
  boosting = false;
  hopSlamDmg = 0;
  bubbleT = 0;
  downed = false;
  downedT = 0;
  downedMax = 10;
  downedCount = 0;
  dead = false;
  invulnT = 0;
  shieldDelayT = 0;
  hornCd = 0;
  weapons: (WeaponRuntime | null)[] = [null, null];
  gadget: GadgetRuntime | null = null;
  hitRadius = 1.6;
  mass = 1;
  private roll = 0;
  private pitch = 0;
  private rollV = 0;
  private pitchV = 0;
  private prevVLong = 0;
  private prevVLat = 0;
  private wheelSpin = 0;
  private lastSkid: ({ x: number; z: number } | null)[] = [null, null];
  private shieldMesh: THREE.Mesh;
  private shieldFlash = 0;
  private bubbleMesh: THREE.Mesh;
  private handbrake = false;
  private slamPending = false;
  lastHitT = 0;
  hitDirX = 0;
  hitDirZ = 0;
  fireTrailT = 0;
  shadowTrailT = 0;
  onRamp = false;

  constructor(public world: World, public chassis: ChassisDef) {
    this.model = buildCar(chassis);
    this.hitRadius = chassis.kind === 'truck' ? 2.0 : chassis.kind === 'buggy' ? 1.45 : 1.65;
    const sm = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4aa8ff).multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    sm.scale.set(this.model.halfWidth * 1.7, 1.6, this.model.length * 0.62);
    sm.position.y = 0.9;
    sm.layers.set(FX_LAYER);
    this.model.root.add(sm);
    this.shieldMesh = sm;
    const bm = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), glow(0xffd070, 1.6, { additive: true, transparent: true, opacity: 0.35 }).clone());
    bm.scale.set(this.model.halfWidth * 2.2, 2.4, this.model.length * 0.75);
    bm.position.y = 1;
    bm.layers.set(FX_LAYER);
    bm.visible = false;
    this.model.root.add(bm);
    this.bubbleMesh = bm;
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }
  get alive() {
    return !this.dead;
  }
  get vLong() {
    return this.vel.x * Math.sin(this.heading) + this.vel.z * Math.cos(this.heading);
  }

  /** Rebuild weapons & parts from the run's equipped items. */
  refreshLoadout() {
    const run = this.world.run;
    const eq = run.equipped;
    const setW = (i: number, slot: 'main' | 'side') => {
      const it = eq[slot];
      const cur = this.weapons[i];
      if (cur && cur.item === it) return;
      cur?.detach();
      if (it) {
        const wr = new WeaponRuntime(it, this);
        wr.attach(slot === 'main' ? [this.model.turretMount] : this.model.sideMounts);
        this.weapons[i] = wr;
      } else this.weapons[i] = null;
    };
    setW(0, 'main');
    setW(1, 'side');
    if (eq.gadget) {
      if (!this.gadget || this.gadget.item !== eq.gadget) this.gadget = new GadgetRuntime(eq.gadget, this);
    } else this.gadget = null;
    setCarPlow(this.model, eq.plow);
    setCarWheels(this.model, eq.wheels);
    this.mass = run.stats.mass;
  }

  kick(x: number, z: number) {
    this.vel.x += x * 0.3;
    this.vel.z += z * 0.3;
  }

  hop(vy: number, slam: boolean, dmg: number) {
    if (this.airborne) return;
    this.airborne = true;
    this.vy = vy;
    this.pos.y = Math.max(this.pos.y, 0.05);
    this.slamPending = slam;
    this.hopSlamDmg = dmg;
    audio.play('jump');
    this.world.fx.dust(this.pos.x, this.pos.z, 8, [0.5, 0.48, 0.45], 1.2);
  }

  update(dt: number, inp: DriveInput) {
    const w = this.world;
    const st = w.run.stats;
    const run = w.run;
    const fx0 = Math.sin(this.heading), fz0 = Math.cos(this.heading);
    const rx0 = Math.cos(this.heading), rz0 = -Math.sin(this.heading);
    let vLong = this.vel.x * fx0 + this.vel.z * fz0;
    let vLat = this.vel.x * rx0 + this.vel.z * rz0;
    const speed = Math.hypot(vLong, vLat);
    const downedMul = this.downed ? 0.55 : 1;

    // ---------------- inputs
    let thr = this.dead ? 0 : inp.throttle;
    let steerIn = 0;
    if (inp.mode === 'camera' && !inp.steerFromKeys) {
      const diff = angleDiff(this.heading, inp.camYaw);
      const reversing = vLong < -1 && thr < 0;
      steerIn = clamp(diff * 2.2, -1, 1) * (reversing ? -1 : 1);
      if (Math.abs(thr) < 0.1 && speed < 3) steerIn = 0;
      // In camera mode W drives "toward the camera", so a big turn needs throttle-assist
      if (Math.abs(diff) > 2.4 && thr > 0 && speed < 12) steerIn = Math.sign(diff);
    } else steerIn = inp.steer;
    if (this.dead) steerIn = 0;
    this.steer = damp(this.steer, steerIn, 12, dt);
    this.throttle = thr;
    this.handbrake = inp.handbrake && !this.dead;

    // ---------------- nitro
    const wantBoost = inp.boost && !this.dead && run.nitro > 1 && !this.airborne;
    if (wantBoost && !this.boosting) audio.play('boostStart');
    this.boosting = wantBoost;
    if (this.boosting) run.nitro = Math.max(0, run.nitro - 34 * dt);
    else run.nitro = Math.min(st.boostMax, run.nitro + st.boostRegen * dt);
    if (this.driftBoostT > 0) this.driftBoostT -= dt;

    let top = st.topSpeed * downedMul;
    if (this.boosting) top *= 1 + 0.38 * st.boostPower;
    if (this.driftBoostT > 0) top *= 1.28;

    if (!this.airborne) {
      // ---------------- engine & brakes
      const speedBefore = Math.hypot(vLong, vLat);
      if (thr > 0) {
        if (vLong < -0.5) vLong += 60 * dt * thr;
        else if (vLong < top) {
          const k = clamp(1 - vLong / top, 0, 1);
          vLong += st.accel * thr * (0.3 + 0.7 * k) * dt;
        }
      } else if (thr < 0) {
        if (vLong > 0.5) vLong -= 62 * dt * -thr;
        else if (vLong > -top * 0.45) vLong -= st.accel * 0.75 * -thr * dt;
      } else {
        vLong -= Math.sign(vLong) * Math.min(Math.abs(vLong), 6 * dt);
      }
      if (this.boosting && vLong < top) vLong += 42 * st.boostPower * dt;
      if (this.driftBoostT > 0 && vLong < top) vLong += 55 * dt;
      if (vLong > top) vLong = damp(vLong, top, 2.5, dt);

      // ---------------- drifting
      const canDrift = speed > 11;
      if (!this.drifting && this.handbrake && canDrift && Math.abs(this.steer) > 0.25) {
        this.drifting = true;
        this.driftDir = Math.sign(this.steer);
        this.driftCharge = 0;
        this.driftTier = 0;
      }
      if (this.drifting && (!this.handbrake || speed < 7)) this.endDrift();

      let grip = st.grip;
      if (this.handbrake) grip *= this.drifting ? 0.42 : 0.2;
      if (this.handbrake && !this.drifting) vLong -= Math.sign(vLong) * Math.min(Math.abs(vLong), 14 * dt);
      vLat *= Math.exp(-grip * dt);
      if (this.drifting) {
        // arcade drift: keep most of the momentum, redirected along the slide
        const now = Math.hypot(vLong, vLat);
        const keep = speedBefore * (1 - 0.18 * dt);
        if (now > 0.1 && now < keep) {
          const k = keep / now;
          vLong *= k;
          vLat *= k;
        }
      }

      // ---------------- steering
      const spd01 = clamp(Math.abs(vLong) / 9, 0, 1);
      const hi = 1 - 0.38 * clamp(Math.abs(vLong) / Math.max(1, st.topSpeed), 0, 1);
      const dirSign = vLong >= -0.5 ? 1 : -1;
      let yawTarget = this.steer * 2.35 * st.handling * spd01 * hi * dirSign;
      if (this.drifting) {
        const into = this.steer * this.driftDir; // -1 (countersteer) .. 1 (into the drift)
        yawTarget = this.driftDir * 1.55 * st.handling * (0.7 + 0.45 * into);
        this.driftCharge += dt * st.driftCharge * (0.7 + 0.5 * Math.max(0, into));
        run.counters.driftTime += dt;
        const tier = this.driftCharge > DRIFT_TIERS[2] ? 3 : this.driftCharge > DRIFT_TIERS[1] ? 2 : this.driftCharge > DRIFT_TIERS[0] ? 1 : 0;
        if (tier > this.driftTier) {
          this.driftTier = tier;
          audio.play('driftTier', { pitch: 1 + tier * 0.25 });
        }
        // drift keeps momentum
        if (thr > 0 && vLong < top * 0.95) vLong += st.accel * 0.35 * dt;
      } else if (this.handbrake) yawTarget *= 1.5;
      this.angVel = damp(this.angVel, yawTarget, this.drifting ? 6 : 10, dt);
    } else {
      // airborne: keep momentum, slight air control
      this.angVel = damp(this.angVel, this.steer * 1.2, 2, dt);
      this.vy -= 44 * dt;
      this.pos.y += this.vy * dt;
      this.airTime += dt;
      if (this.pos.y <= 0) {
        this.land();
      }
    }
    this.heading = wrapAngle(this.heading + this.angVel * dt);
    this.vel.x = fx0 * vLong + rx0 * vLat;
    this.vel.z = fz0 * vLong + rz0 * vLat;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    this.collideWalls(dt);

    // ---------------- body dynamics for visuals
    const aLong = (vLong - this.prevVLong) / Math.max(dt, 1e-4);
    const aLat = (vLat - this.prevVLat) / Math.max(dt, 1e-4) + this.angVel * vLong;
    this.prevVLong = vLong;
    this.prevVLat = vLat;
    const rollT = clamp(-aLat * 0.0045, -0.14, 0.14) + (this.drifting ? -this.driftDir * 0.05 : 0);
    const pitchT = clamp(-aLong * 0.004, -0.09, 0.09);
    this.rollV += ((rollT - this.roll) * 90 - this.rollV * 12) * dt;
    this.pitchV += ((pitchT - this.pitch) * 90 - this.pitchV * 12) * dt;
    this.roll += this.rollV * dt;
    this.pitch += this.pitchV * dt;

    // ---------------- timers
    if (this.bubbleT > 0) this.bubbleT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    this.hornCd -= dt;
    this.shieldDelayT += dt;
    if (!this.downed && !this.dead) {
      if (this.shieldDelayT > st.shieldDelay && run.shield < st.maxShield) {
        const wasEmpty = run.shield <= 0;
        run.shield = Math.min(st.maxShield, run.shield + st.maxShield * st.shieldRate * dt);
        if (wasEmpty) audio.play('shieldUp');
      }
      if (st.hpRegen > 0) run.hp = Math.min(st.maxHp, run.hp + st.hpRegen * dt);
    }
    if (this.downed) {
      this.downedT -= dt;
      if (Math.random() < 0.6) w.fx.smokePuff(this.pos.x, this.pos.y + 1.4, this.pos.z, rand(-1, 1), 3, rand(-1, 1), 0.8, 0.15, 1.2);
      if (Math.random() < 0.3) w.fx.fire.emit(this.pos.x + rand(-0.5, 0.5), this.pos.y + 1.3, this.pos.z + rand(-0.5, 0.5), 0, 3, 0, 0.4, 0.5, [4, 1.5, 0.3], [1, 0.1, 0], 2, 3);
      if (this.downedT <= 0) w.playerWrecked();
    }
    this.gadget?.update(dt);
    this.trails(dt, st);
    this.syncVisual(dt, vLong);
    this.audioUpdate(speed, top);
  }

  private endDrift() {
    const w = this.world;
    if (this.driftTier >= 1) {
      let dur = [0, 0.55, 0.95, 1.45][this.driftTier];
      if (w.run.special('passive_burnout') > 0) dur *= 1.4;
      if (w.run.special('driftBoostPlus') > 0) dur *= 1 + 0.35 * w.run.special('driftBoostPlus');
      this.driftBoostT = dur;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      this.vel.x += fx * 8 * this.driftTier;
      this.vel.z += fz * 8 * this.driftTier;
      audio.play('driftBoost', { pitch: this.driftTier });
      w.fx.shake(0.15 * this.driftTier);
      w.onDriftBoost(this.driftTier);
      const c = TIER_COLORS[this.driftTier];
      for (const ex of this.model.exhausts) {
        const p = ex.clone().applyMatrix4(this.model.root.matrixWorld);
        for (let i = 0; i < 10; i++) w.fx.add.emit(p.x, p.y, p.z, -fx * rand(10, 25) + rand(-3, 3), rand(0, 4), -fz * rand(10, 25) + rand(-3, 3), 0.35, 0.5, 0.1, c[0] * 3, c[1] * 3, c[2] * 3, 1, { stretch: 0.04, shape: SHAPE_CORE });
      }
    }
    this.drifting = false;
    this.driftTier = 0;
    this.driftCharge = 0;
  }

  private land() {
    const w = this.world;
    const impact = -this.vy;
    this.pos.y = 0;
    this.vy = 0;
    this.airborne = false;
    if (impact > 6) {
      audio.play('land', { vol: clamp(impact / 25, 0.3, 1.2) });
      w.fx.dust(this.pos.x, this.pos.z, 10, [0.5, 0.48, 0.45], 1.4);
      w.fx.shake(Math.min(0.6, impact * 0.02));
      this.pitchV += 2;
    }
    if (this.slamPending) {
      this.slamPending = false;
      w.fx.rings.spawn(this.pos.x, 0.3, this.pos.z, 1, 12, 0.4, 0xffc060);
      w.fx.explosion(this.pos.x, 0.4, this.pos.z, 4, 'none');
      for (const e of w.enemiesNear(this.pos.x, this.pos.z, 10)) {
        if (!e.alive) continue;
        const d = e.distTo(this.pos.x, this.pos.z);
        if (d > 10) continue;
        const k = 1 - d / 12;
        w.damageEnemy(e, { amount: this.hopSlamDmg * k, element: 'none', source: 'gadget', kx: (e.pos.x - this.pos.x) / (d || 1), kz: (e.pos.z - this.pos.z) / (d || 1), knock: 24 });
        if (e.mass < 2) e.launch((e.pos.x - this.pos.x) * 1.2, (e.pos.z - this.pos.z) * 1.2, 14);
      }
    }
    this.airTime = 0;
  }

  private collideWalls(dt: number) {
    const w = this.world;
    const L = this.model.length * 0.3;
    const r = this.model.halfWidth + 0.15;
    for (const side of [1, -1]) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const cx = this.pos.x + fx * L * side, cz = this.pos.z + fz * L * side;
      const res = w.grid.collideCircle(cx, cz, r, true, this.pos.y);
      if (!res.hit) continue;
      const px = res.x - cx, pz = res.z - cz;
      this.pos.x += px;
      this.pos.z += pz;
      const vn = this.vel.x * res.nx + this.vel.z * res.nz;
      if (vn < 0) {
        const impact = -vn;
        this.vel.x -= res.nx * vn * 1.25;
        this.vel.z -= res.nz * vn * 1.25;
        // tangential friction
        const tx = -res.nz, tz = res.nx;
        const vt = this.vel.x * tx + this.vel.z * tz;
        this.vel.x -= tx * vt * 0.04;
        this.vel.z -= tz * vt * 0.04;
        // torque: impulse at the front/rear corner rotates the car
        const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
        const jr = (res.nx * rx + res.nz * rz) * impact;
        this.angVel += jr * side * L * 0.06;
        if (impact > 7) {
          const hx = cx - res.nx * r, hz = cz - res.nz * r;
          w.fx.sparks(hx, 0.8, hz, res.nx, 0.6, res.nz, Math.min(24, impact), [1, 0.8, 0.4], impact * 0.6);
          audio.play('wallHit', { vol: clamp(impact / 30, 0.2, 1) });
          w.fx.shake(Math.min(0.5, impact * 0.012));
          if (impact > 22) {
            const dmg = (impact - 22) * 3.2 * (1 - clamp(w.run.stats.ramResist, 0, 0.9));
            w.damagePlayer(dmg, { silent: true, collision: true });
          }
          if (this.drifting && impact > 15) this.endDrift();
        }
      }
    }
    void dt;
  }

  private trails(dt: number, st: { topSpeed: number }) {
    const w = this.world;
    const m = this.model;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
    // rear wheel positions
    const slip = Math.abs(this.vel.x * rx + this.vel.z * rz);
    const skidding = !this.airborne && (this.drifting || slip > 6 || (this.handbrake && this.speed > 6) || (this.throttle > 0.5 && this.speed < 8 && this.speed > 1));
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      const wx = this.pos.x + fx * m.rearWheelZ + rx * s * (m.halfWidth - 0.1);
      const wz = this.pos.z + fz * m.rearWheelZ + rz * s * (m.halfWidth - 0.1);
      if (skidding) {
        const last = this.lastSkid[i];
        if (last) w.fx.decals.skid(last.x, last.z, wx, wz, 0.45, this.drifting ? 0.7 : 0.45);
        this.lastSkid[i] = { x: wx, z: wz };
        if (Math.random() < 0.55) w.fx.smokePuff(wx, 0.35, wz, rand(-1, 1) - this.vel.x * 0.05, rand(0.5, 2), rand(-1, 1) - this.vel.z * 0.05, rand(0.5, 0.9), 0.9, rand(0.6, 1.0));
        if (this.drifting && this.driftTier > 0) {
          const c = TIER_COLORS[this.driftTier];
          for (let k = 0; k < 2; k++) w.fx.add.emit(wx, 0.3, wz, rx * s * rand(3, 9) - fx * rand(2, 8), rand(2, 7), rz * s * rand(3, 9) - fz * rand(2, 8), rand(0.2, 0.4), 0.18, 0.05, c[0] * 4, c[1] * 4, c[2] * 4, 1, { grav: 25, stretch: 0.04, shape: SHAPE_CORE });
          if (Math.random() < 0.4) w.fx.add.draw(wx, 0.4, wz, 0, 0, 0, 1.4, 0, c[0] * 2, c[1] * 2, c[2] * 2, 0.8, SHAPE_DOT);
        }
      } else this.lastSkid[i] = null;
    }
    // boost flames
    if (this.boosting || this.driftBoostT > 0) {
      m.root.updateMatrixWorld();
      const c = this.driftBoostT > 0 && !this.boosting ? TIER_COLORS[Math.max(1, this.driftTier || 2)] : [0.4, 0.7, 1] as [number, number, number];
      for (const ex of m.exhausts) {
        const p = ex.clone().applyMatrix4(m.root.matrixWorld);
        const back = m.kind === 'truck' ? 0 : 1;
        const dx = -fx * back, dz = -fz * back, dy = m.kind === 'truck' ? 1 : 0.1;
        w.fx.add.emit(p.x, p.y, p.z, dx * 18 + this.vel.x, dy * 18, dz * 18 + this.vel.z, 0.12, 0.7, 0.2, c[0] * 3, c[1] * 3, c[2] * 3, 1, { stretch: 0.02, shape: SHAPE_CORE });
        w.fx.add.draw(p.x, p.y, p.z, dx * 20, dy * 20, dz * 20, 0.6, 0.05, c[0] * 4, c[1] * 4, c[2] * 4, 1, SHAPE_CORE);
        if (Math.random() < 0.3) w.fx.fire.emit(p.x, p.y, p.z, dx * 6, dy * 6 + 1, dz * 6, 0.18, 0.35, [c[0] * 4, c[1] * 4, c[2] * 4], [0.3, 0.1, 0.4], 3, 1);
      }
      if (Math.random() < 0.3) w.lights.flash(this.pos.x - fx * 3, 1, this.pos.z - fz * 3, new THREE.Color(c[0], c[1], c[2]), 6, 12, 0.08, 0.5);
      // fire trail
      if (w.run.special('boostFireTrail') > 0 && this.boosting) {
        this.fireTrailT -= dt;
        if (this.fireTrailT <= 0) {
          this.fireTrailT = 0.09;
          w.addFirePatch(this.pos.x - fx * 3, this.pos.z - fz * 3, 2.4, 2.5, 40 * w.run.stats.dmg * Math.pow(1.14, w.run.floor), 'player');
        }
      }
    }
    if (w.run.special('driftShadowTrail') > 0 && this.drifting) {
      this.shadowTrailT -= dt;
      if (this.shadowTrailT <= 0) {
        this.shadowTrailT = 0.08;
        w.addFirePatch(this.pos.x - fx * 2.5, this.pos.z - fz * 2.5, 2.2, 2.2, 35 * w.run.stats.dmg * Math.pow(1.14, w.run.floor), 'player', 'shadow');
      }
    }
    // exhaust idle puffs
    if (!this.boosting && Math.random() < 0.08 && !this.downed) {
      m.root.updateMatrixWorld();
      const p = m.exhausts[0].clone().applyMatrix4(m.root.matrixWorld);
      w.fx.smokePuff(p.x, p.y, p.z, -fx * 2, 0.8, -fz * 2, 0.25, 0.35, 0.6);
    }
    void st;
  }

  private syncVisual(dt: number, vLong: number) {
    const m = this.model;
    m.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    m.root.rotation.y = this.heading;
    const airPitch = this.airborne ? clamp(-this.vy * 0.02, -0.35, 0.35) : 0;
    m.body.rotation.set(this.pitch + airPitch, 0, this.roll, 'YXZ');
    m.body.position.y = Math.sin(performance.now() * 0.03) * (this.speed < 2 && !this.dead ? 0.015 : 0.004);
    this.wheelSpin += (vLong * dt) / 0.55;
    for (const wref of m.wheels) {
      wref.spin.rotation.x = this.wheelSpin * (0.55 / wref.radius);
      if (wref.front) wref.pivot.rotation.y = this.drifting ? -this.driftDir * 0.35 + this.steer * 0.2 : this.steer * 0.45;
      // suspension droop when airborne
      wref.pivot.position.y = wref.radius - (this.airborne ? 0.15 : 0);
    }
    // brake lights
    const braking = (this.throttle < -0.1 && vLong > 1) || this.handbrake;
    m.brakeLights.color.setRGB(braking ? 4 : 1.4, braking ? 0.2 : 0.05, braking ? 0.3 : 0.1);
    // shield shimmer
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 3);
    (this.shieldMesh.material as THREE.MeshBasicMaterial).opacity = this.shieldFlash * 0.45;
    this.shieldMesh.visible = this.shieldFlash > 0.01;
    this.bubbleMesh.visible = this.bubbleT > 0;
    if (this.bubbleT > 0) {
      this.bubbleMesh.rotation.y += dt * 2;
      this.bubbleMesh.scale.setScalar(1).multiply(new THREE.Vector3(this.model.halfWidth * 2.2, 2.4, this.model.length * 0.75)).multiplyScalar(1 + Math.sin(performance.now() * 0.02) * 0.03);
    }
    m.root.visible = !this.dead;
  }

  flashShield() {
    this.shieldFlash = 1;
  }

  private audioUpdate(speed: number, top: number) {
    const rpm = clamp(speed / Math.max(1, top), 0, 1.4);
    const gearish = (rpm * 3.2) % 1;
    const base = 38 + rpm * 70 + gearish * 25;
    const pitch = this.chassis.kind === 'truck' ? 0.7 : this.chassis.kind === 'buggy' ? 1.35 : 1;
    const vol = this.dead ? 0 : 0.16 + Math.abs(this.throttle) * 0.12 + rpm * 0.06;
    audio.loop('engine', vol, { f1: base * pitch, f2: base * pitch * 1.5, f3: base * pitch * 0.5, lfo: 8 + rpm * 20, cut: 350 + rpm * 1400 + Math.abs(this.throttle) * 400 });
    const skid = this.drifting ? 0.28 : this.handbrake && speed > 6 ? 0.2 : 0;
    audio.loop('drift', skid, { f: 1100 + (this.driftTier * 250) });
    audio.loop('boost', this.boosting ? 0.25 : this.driftBoostT > 0 ? 0.15 : 0);
  }

  honk() {
    const w = this.world;
    if (this.hornCd > 0 || this.dead) return;
    const st = w.run.stats;
    this.hornCd = 4 / Math.min(2.5, Math.sqrt(st.hornPower));
    audio.play('horn', { pitch: w.run.special('honkCannon') > 0 ? 0.8 : 1 });
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    w.fx.rings.spawn(this.pos.x + fx * 2.5, 1.2, this.pos.z + fz * 2.5, 0.5, 6, 0.3, 0xffffff, true);
    w.say('honk');
    if (w.run.special('honkCannon') > 0) {
      for (let i = -2; i <= 2; i++) {
        const a = this.heading + i * 0.12;
        const p = w.projectiles.spawn('sonic', 'player', this.pos.x + fx * 3, 1.4, this.pos.z + fz * 3, Math.sin(a) * 60, 0, Math.cos(a) * 60, 70 * st.dmg * st.hornPower * Math.pow(1.14, w.run.floor), 0.7, 2.2);
        p.pierce = 99;
      }
      w.fx.shake(0.4);
      return;
    }
    for (const e of w.enemiesNear(this.pos.x, this.pos.z, 13)) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 13 || (dx * fx + dz * fz) / d < 0.3) continue;
      e.stunT = Math.max(e.stunT, 0.7);
      e.knock(dx / d, dz / d, 20 * Math.min(3, st.hornPower));
      w.damageEnemy(e, { amount: 8 * st.hornPower * Math.pow(1.14, w.run.floor), element: 'none', source: 'horn', noCrit: true });
    }
  }
}
