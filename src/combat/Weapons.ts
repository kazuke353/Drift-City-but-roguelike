import * as THREE from 'three';
import type { World } from '../game/World';
import type { PlayerCar } from '../entities/PlayerCar';
import type { Enemy } from '../entities/Enemy';
import { buildWeapon, type WeaponModel } from '../entities/WeaponModels';
import type { Item } from '../loot/Items';
import { ELEMENT_COLORS, type Element } from '../fx/FX';
import { audio } from '../audio/Audio';
import { rand } from '../core/Rng';
import { clamp, raySphere, dampAngle, damp } from '../core/MathUtil';
import { WALL_H } from '../world/DungeonGen';

export interface FireCtx {
  w: World;
  car: PlayerCar;
  aim: THREE.Vector3;
  aimEnemy: Enemy | null;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const ELEMS: Element[] = ['fire', 'shock', 'acid', 'cryo'];

export class WeaponRuntime {
  item: Item;
  models: WeaponModel[] = [];
  mag: number;
  reloadT = 0;
  cd = 0;
  spin = 0;
  charge = 0;
  beamOn = false;
  muzzleIdx = 0;
  firstShotReady = true;
  laserAccum = 0;
  laserTick = 0;
  zaps: { pts: THREE.Vector3[]; t: number }[] = [];
  slot: 'main' | 'side';
  wasFiring = false;
  kineticAccum = 0;

  constructor(item: Item, public car: PlayerCar) {
    this.item = item;
    this.slot = item.slot === 'side' ? 'side' : 'main';
    this.mag = this.magMax;
  }

  get w() {
    return this.item.w!;
  }
  get magMax() {
    return Math.max(1, Math.round(this.w.mag * this.car.world.run.stats.magSize));
  }
  get reloading() {
    return this.reloadT > 0;
  }
  get reloadTime() {
    const run = this.car.world.run;
    let t = this.w.reload / run.stats.reloadSpeed;
    const dr = run.special('driftReload');
    if (dr > 0 && this.car.drifting) t /= 1 + 0.7 * dr;
    return t;
  }

  attach(mounts: THREE.Object3D[]) {
    for (const m of this.models) m.root.removeFromParent();
    this.models = [];
    if (this.slot === 'main') {
      const wm = buildWeapon(this.item);
      mounts[0].add(wm.root);
      this.models.push(wm);
    } else {
      mounts.forEach((mt, i) => {
        const wm = buildWeapon(this.item, i === 0);
        mt.add(wm.root);
        this.models.push(wm);
      });
    }
    for (const m of this.models) m.root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  }

  detach() {
    for (const m of this.models) m.root.removeFromParent();
    this.models = [];
    this.stopLoops();
  }

  stopLoops() {
    if (this.item.wtype === 'laser') audio.loop('laser', 0);
    if (this.item.wtype === 'flamer') audio.loop('flamer', 0);
    if (this.item.wtype === 'minigun') audio.loop('minigun', 0);
    if (this.item.wtype === 'rail') audio.loop('charge', 0);
  }

  startReload() {
    if (this.reloadT > 0 || this.mag >= this.magMax) return;
    this.reloadT = this.reloadTime;
    this.beamOn = false;
    audio.play('reload');
  }

  /** Aim model(s) toward the aim point (local yaw/pitch). */
  aimModels(ctx: FireCtx, dt: number) {
    for (const m of this.models) {
      const parent = m.root.parent;
      if (!parent) continue;
      parent.updateWorldMatrix(true, false);
      tmpM.copy(parent.matrixWorld).invert();
      tmpA.copy(ctx.aim).applyMatrix4(tmpM);
      let yaw = Math.atan2(tmpA.x, tmpA.z);
      const horiz = Math.hypot(tmpA.x, tmpA.z);
      let pitch = -Math.atan2(tmpA.y - 0.3, horiz);
      if (this.slot === 'side') yaw = clamp(yaw, -0.7, 0.7);
      pitch = clamp(pitch, -0.5, 0.35);
      m.root.rotation.y = dampAngle(m.root.rotation.y, yaw, 18, dt);
      m.pitch.rotation.x = damp(m.pitch.rotation.x, pitch, 18, dt);
      if (m.spinner) {
        if (this.item.wtype === 'minigun') m.spinner.rotation.z += dt * this.spin * 40;
        else if (this.item.wtype === 'saw') m.spinner.rotation.y += dt * 20;
        else m.spinner.rotation.y += dt * 2;
      }
    }
  }

  muzzle(out: THREE.Vector3): THREE.Vector3 {
    const all: THREE.Object3D[] = [];
    for (const m of this.models) all.push(...m.muzzles);
    if (!all.length) return out.copy(this.car.pos).setY(this.car.pos.y + 1.6);
    const mz = all[this.muzzleIdx % all.length];
    mz.getWorldPosition(out);
    return out;
  }

  private dmgBase(ctx: FireCtx) {
    const run = ctx.w.run;
    const st = run.stats;
    let d = this.w.damage * st.dmg;
    const low = run.special('lowHpDamage');
    if (low > 0) d *= 1 + 0.7 * (1 - run.hp / st.maxHp);
    if (run.special('driftDamage') > 0 && ctx.car.drifting) d *= 1.25;
    if (run.special('killBoost') > 0 && ctx.car.boosting && this.car.world.run.equipped.engine?.special === 'killBoost') d *= 1.3;
    if (this.firstShotReady && run.special('firstShot') > 0) d *= 3;
    return d;
  }

  private element(ctx: FireCtx): Element {
    if (ctx.w.run.special('chaosElement') > 0) return ELEMS[Math.floor(Math.random() * 4)];
    return this.item.element;
  }

  private elemChance(ctx: FireCtx, el: Element) {
    if (el === 'none') return 0;
    return clamp(this.w.elemChance * ctx.w.run.stats.elemChance * (ctx.w.run.special('chaosElement') > 0 ? 1.4 : 1), 0, 1);
  }

  get fireRate() {
    const run = this.car.world.run;
    let r = this.w.fireRate * run.stats.fireRate;
    if (this.item.special === 'speedFireRate') r *= 1 + Math.min(1.2, (this.car.speed / run.stats.topSpeed) * 1.2);
    return r;
  }

  update(dt: number, firing: boolean, ctx: FireCtx) {
    this.aimModels(ctx, dt);
    this.cd -= dt;
    for (let i = this.zaps.length - 1; i >= 0; i--) {
      const z = this.zaps[i];
      z.t -= dt;
      if (z.t <= 0) {
        this.zaps.splice(i, 1);
        continue;
      }
      const c = ELEMENT_COLORS[this.item.element === 'none' ? 'shock' : this.item.element];
      for (let k = 0; k < z.pts.length - 1; k++) {
        const a = z.pts[k], b = z.pts[k + 1];
        ctx.w.fx.beams.lightning(a.x, a.y, a.z, b.x, b.y, b.z, 0.35, c[0] * 2.5, c[1] * 2.5, c[2] * 2.5, 0.9);
      }
    }
    // kinetic mag: driving fast trickles ammo back
    if (ctx.w.run.special('kineticMag') > 0 && this.car.speed > 25 && this.mag < this.magMax && this.reloadT <= 0) {
      this.kineticAccum += dt * (this.magMax / 6);
      if (this.kineticAccum >= 1) {
        this.mag = Math.min(this.magMax, this.mag + Math.floor(this.kineticAccum));
        this.kineticAccum %= 1;
      }
    }
    if (this.reloadT > 0) {
      const drMult = ctx.w.run.special('driftReload') > 0 && this.car.drifting ? 1 + 0.7 * ctx.w.run.special('driftReload') : 1;
      this.reloadT -= dt * drMult;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        this.mag = this.magMax;
        this.firstShotReady = true;
        audio.play('reloadDone');
      }
      this.stopLoops();
      this.spin = Math.max(0, this.spin - dt * 2);
      return;
    }
    const t = this.item.wtype!;
    // minigun spin up
    if (t === 'minigun') {
      this.spin = clamp(this.spin + (firing ? dt * 2.2 : -dt * 1.5), 0, 1);
      audio.loop('minigun', this.spin * 0.25, { f: 40 + this.spin * 80 });
    }
    if (t === 'laser') {
      this.updateLaser(dt, firing, ctx);
      return;
    }
    if (t === 'flamer') audio.loop('flamer', firing && this.mag > 0 ? 0.35 : 0);
    if (t === 'rail') {
      if (firing && this.mag > 0 && this.cd <= 0) {
        this.charge += dt;
        audio.loop('charge', 0.2, { f: 200 + this.charge * 1600, f2: 400 + this.charge * 3200 });
        const mp = this.muzzle(tmpA);
        ctx.w.fx.add.draw(mp.x, mp.y, mp.z, 0, 0, 0, 0.5 + this.charge * 3, 0, 1, 2, 4, 1, 1);
        if (this.charge >= 0.42) {
          this.fireRail(ctx);
          this.charge = 0;
          this.cd = 1 / this.fireRate;
          audio.loop('charge', 0);
        }
      } else {
        this.charge = Math.max(0, this.charge - dt * 2);
        audio.loop('charge', 0);
      }
      if (this.mag <= 0) this.startReload();
      return;
    }
    if (!firing) {
      this.wasFiring = false;
      return;
    }
    if (this.mag <= 0) {
      this.startReload();
      return;
    }
    if (t === 'minigun' && this.spin < 0.6) return;
    let shots = 0;
    while (this.cd <= 0 && this.mag > 0 && shots < 4) {
      this.fire(ctx);
      this.cd += 1 / this.fireRate;
      shots++;
    }
    if (this.cd < -0.1) this.cd = 0;
    if (this.mag <= 0) this.startReload();
  }

  private spreadDir(from: THREE.Vector3, to: THREE.Vector3, spread: number, out: THREE.Vector3) {
    out.subVectors(to, from).normalize();
    if (spread > 0) {
      out.x += rand(-spread, spread);
      out.y += rand(-spread, spread) * 0.5;
      out.z += rand(-spread, spread);
      out.normalize();
    }
    return out;
  }

  private fire(ctx: FireCtx) {
    const { w } = ctx;
    const it = this.item;
    const ws = this.w;
    const t = it.wtype!;
    const run = w.run;
    const mp = this.muzzle(tmpA);
    const el = this.element(ctx);
    const ec = this.elemChance(ctx, el);
    const dmg = this.dmgBase(ctx);
    const col = ELEMENT_COLORS[el];
    this.firstShotReady = false;
    this.mag--;
    this.muzzleIdx++;
    const dir = tmpB;
    const pspeed = ws.projSpeed * run.stats.projSpeed;
    const carV = ctx.car.vel;
    switch (t) {
      case 'mg':
      case 'minigun': {
        this.spreadDir(mp, ctx.aim, ws.spread * (t === 'minigun' ? 1 : 1), dir);
        const p = w.projectiles.spawn('bullet', 'player', mp.x, mp.y, mp.z, dir.x * pspeed + carV.x, dir.y * pspeed, dir.z * pspeed + carV.z, dmg, ws.range / pspeed, 0.2);
        p.element = el;
        p.elemChance = ec;
        p.critBonus = ws.critBonus;
        p.weapon = this;
        w.fx.muzzle(mp.x, mp.y, mp.z, dir.x, dir.y, dir.z, t === 'minigun' ? 0.8 : 1, [col[0], col[1] * 0.9, col[2] * 0.7]);
        audio.play(t, { pitch: rand(0.95, 1.05) });
        w.fx.shake(0.02);
        break;
      }
      case 'shotgun': {
        for (let i = 0; i < ws.pellets; i++) {
          this.spreadDir(mp, ctx.aim, ws.spread, dir);
          const sp = pspeed * rand(0.85, 1.1);
          const p = w.projectiles.spawn('pellet', 'player', mp.x, mp.y, mp.z, dir.x * sp + carV.x, dir.y * sp, dir.z * sp + carV.z, dmg, ws.range / sp, 0.25);
          p.element = el;
          p.elemChance = ec / 2;
          p.critBonus = ws.critBonus;
          p.weapon = this;
        }
        this.spreadDir(mp, ctx.aim, 0, dir);
        w.fx.muzzle(mp.x, mp.y, mp.z, dir.x, dir.y, dir.z, 1.8, col);
        w.fx.smokePuff(mp.x + dir.x, mp.y, mp.z + dir.z, dir.x * 4, 1, dir.z * 4, 0.6, 0.7, 0.5);
        audio.play('shotgun');
        w.fx.shake(0.12);
        ctx.car.kick(-dir.x * 2, -dir.z * 2);
        break;
      }
      case 'cannon': {
        this.spreadDir(mp, ctx.aim, ws.spread, dir);
        // compensate gravity a little by aiming slightly up
        const d = mp.distanceTo(ctx.aim);
        dir.y += (6 * (d / pspeed)) / pspeed * 0.5;
        dir.normalize();
        const p = w.projectiles.spawn('shell', 'player', mp.x, mp.y, mp.z, dir.x * pspeed + carV.x, dir.y * pspeed, dir.z * pspeed + carV.z, dmg, ws.range / pspeed + 0.5, 0.35);
        p.gravity = 6;
        p.splash = ws.splash;
        p.element = el;
        p.elemChance = ec;
        p.critBonus = ws.critBonus;
        p.weapon = this;
        w.fx.muzzle(mp.x, mp.y, mp.z, dir.x, dir.y, dir.z, 2.4, [1, 0.6, 0.3]);
        for (let i = 0; i < 3; i++) w.fx.smokePuff(mp.x + dir.x * i, mp.y, mp.z + dir.z * i, dir.x * 6 + rand(-2, 2), rand(0, 2), dir.z * 6 + rand(-2, 2), 0.7, 0.75, 0.6);
        audio.play('cannon');
        w.fx.shake(0.18);
        ctx.car.kick(-dir.x * 4, -dir.z * 4);
        break;
      }
      case 'flamer': {
        this.spreadDir(mp, ctx.aim, ws.spread, dir);
        const sp = pspeed * rand(0.9, 1.1);
        const p = w.projectiles.spawn('flame', 'player', mp.x, mp.y, mp.z, dir.x * sp + carV.x * 0.8, dir.y * sp, dir.z * sp + carV.z * 0.8, dmg, ws.range / sp, 0.5);
        p.element = el;
        p.elemChance = ec;
        p.weapon = this;
        p.pierce = 99;
        if (Math.random() < 0.3) w.lights.flash(mp.x, mp.y, mp.z, 0xff7020, 8, 14, 0.08, 0.5);
        break;
      }
      case 'tesla':
        this.fireTesla(ctx, dmg, el === 'none' ? 'shock' : el, ec);
        break;
      case 'rocket': {
        this.spreadDir(mp, ctx.aim, ws.spread, dir);
        const big = it.special === 'bigRocket';
        const sp = pspeed * 0.6;
        const p = w.projectiles.spawn('rocket', 'player', mp.x, mp.y, mp.z, dir.x * sp + carV.x * 0.5, dir.y * sp + 2, dir.z * sp + carV.z * 0.5, dmg, 3.5, 0.4);
        p.splash = ws.splash;
        p.homing = big ? 0.8 : 3.2;
        p.target = ctx.aimEnemy;
        p.element = el;
        p.elemChance = ec;
        p.critBonus = ws.critBonus;
        p.weapon = this;
        p.size = big ? 2.4 : 1;
        w.fx.muzzle(mp.x, mp.y, mp.z, dir.x, dir.y, dir.z, big ? 2 : 1.2, [1, 0.6, 0.3]);
        for (let i = 0; i < 3; i++) w.fx.smokePuff(mp.x, mp.y, mp.z, -dir.x * 3 + rand(-2, 2), rand(0, 2), -dir.z * 3 + rand(-2, 2), big ? 1.2 : 0.6, 0.8, 0.6);
        audio.play('rocket', { pitch: big ? 0.6 : 1 });
        if (big) w.fx.shake(0.3);
        break;
      }
      case 'swarm': {
        this.spreadDir(mp, ctx.aim, 0, dir);
        const side = this.muzzleIdx % 2 ? 1 : -1;
        const sx = -dir.z * side, sz = dir.x * side;
        const sp = pspeed * 0.7;
        const p = w.projectiles.spawn('minirocket', 'player', mp.x, mp.y, mp.z, (dir.x * 0.6 + sx * 0.7) * sp + carV.x * 0.5, (0.5 + rand(0, 0.4)) * sp * 0.5, (dir.z * 0.6 + sz * 0.7) * sp + carV.z * 0.5, dmg, 3, 0.3);
        p.splash = ws.splash;
        p.homing = 5;
        p.target = ctx.aimEnemy ?? w.nearestEnemy(ctx.aim.x, ctx.aim.z, 20);
        p.element = el;
        p.elemChance = ec;
        p.weapon = this;
        audio.play('rocket', { pitch: 1.6, vol: 0.5 });
        break;
      }
      case 'mortar': {
        const dx = ctx.aim.x - mp.x, dz = ctx.aim.z - mp.z;
        let dist = Math.hypot(dx, dz);
        const maxR = ws.range;
        let tx = ctx.aim.x, tz = ctx.aim.z;
        if (dist > maxR) {
          tx = mp.x + (dx / dist) * maxR;
          tz = mp.z + (dz / dist) * maxR;
          dist = maxR;
        }
        const flight = 0.7 + dist / 55;
        const p = w.projectiles.lob('mortar', mp.x, mp.y, mp.z, tx + ctx.car.vel.x * flight * 0.3, tz + ctx.car.vel.z * flight * 0.3, flight, dmg, null, ws.splash, 'player');
        p.element = el;
        p.elemChance = ec;
        p.weapon = this;
        w.fx.tele.circle(tx, tz, ws.splash * run.stats.splash, flight, 0x40a0ff);
        w.fx.muzzle(mp.x, mp.y, mp.z, 0, 1, 0, 1.6, [1, 0.6, 0.3]);
        w.fx.smokePuff(mp.x, mp.y + 0.5, mp.z, 0, 4, 0, 0.8, 0.8, 0.8);
        audio.play('mortar');
        break;
      }
      case 'saw': {
        this.spreadDir(mp, ctx.aim, ws.spread, dir);
        dir.y = 0;
        dir.normalize();
        const inf = it.special === 'infiniteSaws';
        const p = w.projectiles.spawn('saw', 'player', mp.x, Math.max(0.8, mp.y - 0.2), mp.z, dir.x * pspeed + carV.x * 0.5, 0, dir.z * pspeed + carV.z * 0.5, dmg, inf ? 6 : 3, 0.8);
        p.bounces = inf ? 0 : 3;
        p.data = inf ? 1 : 0;
        p.pierce = 99;
        p.element = el;
        p.elemChance = ec;
        p.weapon = this;
        audio.play('saw');
        break;
      }
    }
  }

  private updateLaser(dt: number, firing: boolean, ctx: FireCtx) {
    const { w } = ctx;
    const on = firing && this.mag > 0;
    audio.loop('laser', on ? 0.22 : 0, { f: 880 + Math.sin(performance.now() * 0.01) * 40 });
    if (!on) {
      if (this.mag <= 0) this.startReload();
      this.beamOn = false;
      return;
    }
    this.beamOn = true;
    this.laserAccum += dt * this.fireRate;
    const mp = this.muzzle(tmpA);
    const dir = this.spreadDir(mp, ctx.aim, 0, tmpB);
    const el = this.element(ctx);
    const col = ELEMENT_COLORS[el === 'none' ? 'shock' : el];
    // find hit
    const range = this.w.range;
    let hitT = range;
    let hitE: Enemy | null = null;
    let hitCrit = false;
    const horiz = Math.hypot(dir.x, dir.z);
    const wallD = w.grid.raycast(mp.x, mp.z, dir.x, dir.z, range * horiz) / Math.max(0.01, horiz);
    hitT = Math.min(hitT, wallD);
    if (dir.y < -0.001) hitT = Math.min(hitT, mp.y / -dir.y);
    for (const e of w.enemiesNear(mp.x + dir.x * range * 0.5, mp.z + dir.z * range * 0.5, range * 0.5 + 10)) {
      if (!e.alive || e.spawnT > 0) continue;
      const fx = Math.sin(e.heading), fz = Math.cos(e.heading);
      for (const s of e.def.spheres) {
        const f = (s.fwd ?? 0) * e.scale;
        const t = raySphere(mp.x, mp.y, mp.z, dir.x, dir.y, dir.z, e.pos.x + fx * f, e.y + s.y * e.scale, e.pos.z + fz * f, s.r * e.scale);
        if (t >= 0 && t < hitT) {
          hitT = t;
          hitE = e;
          hitCrit = s.crit;
        }
      }
    }
    const ex = mp.x + dir.x * hitT, ey = mp.y + dir.y * hitT, ez = mp.z + dir.z * hitT;
    const jitter = 0.1 + Math.random() * 0.15;
    w.fx.beams.segment(mp.x, mp.y, mp.z, ex, ey, ez, 0.9 + jitter, col[0] * 2.2, col[1] * 2.2, col[2] * 2.2, 1);
    w.fx.beams.segment(mp.x, mp.y, mp.z, ex, ey, ez, 0.25, 3, 3, 3, 1);
    w.fx.add.draw(ex, ey, ez, 0, 0, 0, 1.8, 0, col[0] * 3, col[1] * 3, col[2] * 3, 1, 2, performance.now() * 0.01);
    w.fx.add.draw(mp.x, mp.y, mp.z, 0, 0, 0, 1.2, 0, col[0] * 3, col[1] * 3, col[2] * 3, 1, 1);
    if (Math.random() < 0.6) w.fx.sparks(ex, ey, ez, -dir.x, 0.5, -dir.z, 2, col, 12);
    if (Math.random() < 0.25) w.lights.flash(ex, ey + 1, ez, new THREE.Color(col[0], col[1], col[2]), 8, 14, 0.08, 0.5);
    this.laserTick -= dt;
    if (this.laserTick <= 0) {
      const tickRate = 12;
      this.laserTick = 1 / tickRate;
      const dmg = (this.dmgBase(ctx) * this.fireRate) / tickRate;
      this.firstShotReady = false;
      if (hitE) {
        w.damageEnemy(hitE, { amount: dmg, element: el, elemChance: this.elemChance(ctx, el) / 4, headshot: hitCrit, critBonus: this.w.critBonus, source: 'weapon', weapon: this, hx: ex, hy: ey, hz: ez, kx: dir.x, kz: dir.z, knock: 0.6, quiet: true });
      } else if (ey < 0.5) {
        if (Math.random() < 0.3) w.fx.decals.splat(ex, ez, 0.6, 0x100808, 0.5, 6, 1);
      }
      w.hitPropsRay(mp, dir, hitT, dmg);
    }
    while (this.laserAccum >= 1) {
      this.laserAccum -= 1;
      this.mag--;
    }
    if (this.mag <= 0) {
      this.mag = 0;
      this.startReload();
    }
  }

  private fireTesla(ctx: FireCtx, dmg: number, el: Element, ec: number) {
    const { w } = ctx;
    const mp = this.muzzle(tmpA).clone();
    const range = this.w.range;
    // target: enemy closest to the aim ray, else nearest in front
    let target = ctx.aimEnemy && ctx.aimEnemy.distTo(mp.x, mp.z) < range ? ctx.aimEnemy : null;
    if (!target) {
      let best = 1e9;
      const ax = ctx.aim.x - mp.x, az = ctx.aim.z - mp.z;
      const al = Math.hypot(ax, az) || 1;
      for (const e of w.enemiesNear(mp.x, mp.z, range)) {
        if (!e.alive || e.spawnT > 0) continue;
        const dx = e.pos.x - mp.x, dz = e.pos.z - mp.z;
        const d = Math.hypot(dx, dz);
        const cos = (dx * ax + dz * az) / (d * al || 1);
        if (cos < 0.55) continue;
        const score = d * (2 - cos);
        if (score < best && w.grid.los(mp.x, mp.z, e.pos.x, e.pos.z)) {
          best = score;
          target = e;
        }
      }
    }
    const pts: THREE.Vector3[] = [mp];
    audio.play('tesla');
    if (!target) {
      const miss = ctx.aim.clone();
      const d = miss.distanceTo(mp);
      if (d > range) miss.sub(mp).multiplyScalar(range / d).add(mp);
      pts.push(miss);
      this.zaps.push({ pts, t: 0.09 });
      w.fx.sparks(miss.x, miss.y, miss.z, 0, 1, 0, 4, ELEMENT_COLORS.shock, 10);
      return;
    }
    const chains = 2 + (w.run.special('shockChain') > 0 ? 2 : 0) + (this.item.special === 'shockChain' ? 3 : 0);
    const hit = new Set<number>();
    let cur: Enemy | null = target;
    let d = dmg;
    for (let i = 0; i <= chains && cur; i++) {
      hit.add(cur.id);
      const p = new THREE.Vector3(cur.pos.x, cur.y + cur.def.height * 0.5 * cur.scale, cur.pos.z);
      pts.push(p);
      w.damageEnemy(cur, { amount: d, element: el, elemChance: ec, critBonus: this.w.critBonus, source: 'weapon', weapon: this, hx: p.x, hy: p.y, hz: p.z, knock: 1 });
      d *= 0.75;
      let next: Enemy | null = null;
      let nd = 14;
      for (const e of w.enemiesNear(cur.pos.x, cur.pos.z, 14)) {
        if (!e.alive || hit.has(e.id) || e.spawnT > 0) continue;
        const dd = e.distTo(cur.pos.x, cur.pos.z);
        if (dd < nd) {
          nd = dd;
          next = e;
        }
      }
      cur = next;
    }
    this.zaps.push({ pts, t: 0.1 });
    w.lights.flash(target.pos.x, 3, target.pos.z, 0x60a0ff, 12, 18, 0.1, 1);
    this.firstShotReady = false;
    this.mag--;
  }

  private fireRail(ctx: FireCtx) {
    const { w } = ctx;
    const mp = this.muzzle(tmpA).clone();
    const dir = this.spreadDir(mp, ctx.aim, 0, new THREE.Vector3());
    const dmg = this.dmgBase(ctx);
    const el = this.element(ctx);
    const range = this.w.range;
    const horiz = Math.hypot(dir.x, dir.z);
    let end = w.grid.raycast(mp.x, mp.z, dir.x, dir.z, range * horiz) / Math.max(0.01, horiz);
    if (dir.y < -0.001) end = Math.min(end, mp.y / -dir.y);
    // pierce every enemy on the line
    const hits: { e: Enemy; t: number; crit: boolean }[] = [];
    for (const e of w.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      let bt = -1, crit = false;
      const fx = Math.sin(e.heading), fz = Math.cos(e.heading);
      for (const s of e.def.spheres) {
        const f = (s.fwd ?? 0) * e.scale;
        const t = raySphere(mp.x, mp.y, mp.z, dir.x, dir.y, dir.z, e.pos.x + fx * f, e.y + s.y * e.scale, e.pos.z + fz * f, s.r * e.scale + 0.3);
        if (t >= 0 && t < end && (bt < 0 || t < bt)) {
          bt = t;
          crit = crit || s.crit;
        } else if (t >= 0 && t < end && s.crit) crit = true;
      }
      if (bt >= 0) hits.push({ e, t: bt, crit });
    }
    const el2 = el;
    for (const h of hits) {
      const bossMult = this.item.special === 'railPierceBoss' && h.e.def.boss ? 2 : 1;
      w.damageEnemy(h.e, { amount: dmg * bossMult, element: el2, elemChance: this.elemChance(ctx, el2), headshot: h.crit, critBonus: this.w.critBonus, source: 'weapon', weapon: this, kx: dir.x, kz: dir.z, knock: 14, hx: mp.x + dir.x * h.t, hy: mp.y + dir.y * h.t, hz: mp.z + dir.z * h.t });
    }
    const ex = mp.x + dir.x * end, ey = mp.y + dir.y * end, ez = mp.z + dir.z * end;
    const col = ELEMENT_COLORS[el === 'none' ? 'shock' : el];
    w.fx.beams.trail(mp.x, mp.y, mp.z, ex, ey, ez, 1.4, col[0] * 2.5, col[1] * 2.5, col[2] * 2.5, 0.45);
    w.fx.beams.trail(mp.x, mp.y, mp.z, ex, ey, ez, 0.4, 3, 3, 3, 0.3);
    w.fx.explosion(ex, Math.max(0.3, ey), ez, 2, el === 'none' ? 'shock' : el);
    w.fx.muzzle(mp.x, mp.y, mp.z, dir.x, dir.y, dir.z, 2.5, col);
    audio.play('rail');
    w.fx.shake(0.35);
    ctx.car.kick(-dir.x * 6, -dir.z * 6);
    w.hitPropsRay(mp, dir, end, dmg);
    this.firstShotReady = false;
    this.mag--;
    void WALL_H;
  }
}

// ============================================================ gadgets
export class GadgetRuntime {
  cd = 0;
  charges = 1;
  constructor(public item: Item, public car: PlayerCar) {
    this.charges = this.maxCharges;
  }
  get maxCharges() {
    return this.item.special === 'secondCharge' ? 2 : 1;
  }
  get cooldown() {
    let c = (this.item.cooldown ?? 8) * this.car.world.run.stats.cooldown;
    if (this.item.gtype === 'hop' && this.car.world.run.special('passive_featherweight') > 0) c *= 0.5;
    return c;
  }
  get ready() {
    return this.charges > 0;
  }
  get power() {
    return this.item.power ?? 1;
  }

  update(dt: number) {
    if (this.charges < this.maxCharges) {
      this.cd -= dt;
      if (this.cd <= 0) {
        this.charges++;
        if (this.charges < this.maxCharges) this.cd = this.cooldown;
      }
    }
  }

  activate(w: World) {
    if (!this.ready) return false;
    const car = this.car;
    if (this.item.gtype === 'hop' && car.airborne) return false;
    this.charges--;
    if (this.cd <= 0) this.cd = this.cooldown;
    const pw = this.power * w.run.stats.dmg;
    const x = car.pos.x, z = car.pos.z;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    audio.play('gadget');
    switch (this.item.gtype) {
      case 'mines': {
        for (let i = 0; i < 3; i++) {
          const a = car.heading + Math.PI + (i - 1) * 0.5;
          const m = w.projectiles.spawn('mine', 'player', x + Math.sin(a) * 3.2, 0.2, z + Math.cos(a) * 3.2, 0, 0, 0, 130 * pw, 25, 0.5);
          m.splash = 6;
          m.element = this.item.element;
          m.elemChance = this.item.element !== 'none' ? 1 : 0;
        }
        break;
      }
      case 'hop':
        car.hop(20, true, 95 * pw);
        break;
      case 'pulse': {
        w.fx.rings.spawn(x, 0.5, z, 1, 15, 0.45, 0x60a0ff);
        w.fx.rings.spawn(x, 1.5, z, 1, 12, 0.35, 0xa0d0ff);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          w.fx.beams.lightning(x, 1.2, z, x + Math.cos(a) * 13, 0.5, z + Math.sin(a) * 13, 0.4, 1, 2, 4, 1.4);
        }
        audio.play('shock');
        w.fx.shake(0.4);
        for (const e of w.enemiesNear(x, z, 14)) {
          if (!e.alive) continue;
          const d = e.distTo(x, z);
          if (d > 14) continue;
          w.damageEnemy(e, { amount: 90 * pw, element: 'shock', elemChance: 1, source: 'gadget', kx: (e.pos.x - x) / (d || 1), kz: (e.pos.z - z) / (d || 1), knock: 22 });
          e.stunT = Math.max(e.stunT, 1.5);
        }
        break;
      }
      case 'turret':
        w.spawnTurret(x - fx * 4, z - fz * 4, 10, 16 * pw);
        break;
      case 'bubble':
        car.bubbleT = 2.6;
        audio.play('shieldUp');
        break;
      case 'gravity': {
        const tx = w.aimPoint.x, tz = w.aimPoint.z;
        const dx = tx - x, dz = tz - z;
        const d = Math.min(35, Math.hypot(dx, dz));
        const dl = Math.hypot(dx, dz) || 1;
        w.spawnGravityWell(x + (dx / dl) * d, z + (dz / dl) * d, 3, 110 * pw);
        break;
      }
    }
    return true;
  }
}
