import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { PlayerCar } from '../entities/PlayerCar';
import type { Grid } from '../world/Grid';
import { Save } from '../core/Save';
import { clamp, damp, dampAngle, wrapAngle } from '../core/MathUtil';

/** Borderlands-2 / GTA style orbit chase camera. Mouse orbits; the car can steer toward the view. */
export class CameraRig {
  yaw = 0;
  pitch = 0.2;
  dist = 9.4;
  focus = new THREE.Vector3();
  private curDist = 9.4;
  private idleT = 0;
  private shakeT = 0;
  fovKick = 0;
  lookBack = false;
  cinematic: { x: number; y: number; z: number; tx: number; ty: number; tz: number; t: number } | null = null;

  constructor(public camera: THREE.PerspectiveCamera) {}

  snapTo(car: PlayerCar) {
    this.yaw = car.heading;
    this.pitch = 0.22;
    this.focus.set(car.pos.x, car.pos.y + 2.4, car.pos.z);
  }

  update(dt: number, input: Input, car: PlayerCar, grid: Grid, shake: number, allowLook: boolean) {
    const s = Save.settings;
    const sens = s.sensitivity;
    let moved = false;
    if (allowLook) {
      const mx = input.mouseDX * 0.0022 * sens;
      const my = input.mouseDY * 0.0022 * sens * (s.invertY ? -1 : 1);
      if (Math.abs(mx) + Math.abs(my) > 0.0005) moved = true;
      this.yaw -= mx;
      this.pitch += my;
      if (Math.abs(input.lookX) + Math.abs(input.lookY) > 0.05) {
        this.yaw -= input.lookX * 2.9 * sens * dt;
        this.pitch += input.lookY * 2.0 * sens * dt * (s.invertY ? -1 : 1);
        moved = true;
      }
    }
    this.idleT = moved ? 0 : this.idleT + dt;
    // classic (GTA) mode or pad: recentre behind the car when not looking around
    const autoCentre = s.steerMode === 'classic' || input.lastDevice === 'pad';
    if (autoCentre && this.idleT > 1.1 && car.speed > 6) {
      const vh = Math.atan2(car.vel.x, car.vel.z);
      const target = car.vLong < -2 ? car.heading : vh;
      this.yaw = dampAngle(this.yaw, target, 2.2, dt);
      this.pitch = damp(this.pitch, 0.2, 1.5, dt);
    }
    this.yaw = wrapAngle(this.yaw);
    this.pitch = clamp(this.pitch, -0.28, 0.95);

    // focus follows the car with a little lag & lead
    const lead = 0.06;
    const fx = car.pos.x + car.vel.x * lead, fz = car.pos.z + car.vel.z * lead;
    const fy = car.pos.y * 0.7 + 2.5;
    this.focus.x = damp(this.focus.x, fx, 18, dt);
    this.focus.y = damp(this.focus.y, fy, 10, dt);
    this.focus.z = damp(this.focus.z, fz, 18, dt);

    const speedK = clamp(car.speed / 45, 0, 1.3);
    const wantDist = this.dist + speedK * 2.6 + (car.boosting ? 1.4 : 0);
    const yaw = this.yaw + (this.lookBack ? Math.PI : 0);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dirX = -Math.sin(yaw) * cp, dirZ = -Math.cos(yaw) * cp;
    // wall avoidance (horizontal)
    const hLen = wantDist * cp;
    const hit = grid.raycast(this.focus.x, this.focus.z, dirX, dirZ, hLen + 0.8, true);
    let d = wantDist;
    if (hit < hLen + 0.8) d = Math.max(3.2, (hit - 0.8) / Math.max(0.2, cp));
    // tall obstacles (statues, columns) also push the camera in
    for (const o of grid.obstacles) {
      if (o.h < 8) continue;
      const ox = o.x - this.focus.x, oz = o.z - this.focus.z;
      const t = ox * dirX + oz * dirZ;
      if (t < 0 || t > hLen + 2) continue;
      const perp = Math.abs(ox * dirZ - oz * dirX);
      const rr = o.r + 0.9;
      if (perp < rr) {
        const tt = t - Math.sqrt(rr * rr - perp * perp);
        if (tt > 0) d = Math.min(d, Math.max(6.2, tt / Math.max(0.2, cp)));
      }
    }
    this.curDist = d < this.curDist ? damp(this.curDist, d, 25, dt) : damp(this.curDist, d, 3, dt);
    const cam = this.camera;
    let px = this.focus.x + dirX * this.curDist;
    let py = this.focus.y + sp * this.curDist + 1.2;
    let pz = this.focus.z + dirZ * this.curDist;
    py = Math.max(0.8, py);

    // shake
    this.shakeT += dt * 40;
    const sh = shake * s.screenShake;
    if (sh > 0.001) {
      px += (Math.sin(this.shakeT * 1.3) + Math.sin(this.shakeT * 2.9)) * sh * 0.25;
      py += (Math.sin(this.shakeT * 1.7 + 1) + Math.sin(this.shakeT * 3.3)) * sh * 0.25;
      pz += (Math.sin(this.shakeT * 1.1 + 2) + Math.sin(this.shakeT * 2.3)) * sh * 0.25;
    }
    if (this.cinematic) {
      const c = this.cinematic;
      c.t -= dt;
      cam.position.set(damp(cam.position.x, c.x, 3, dt), damp(cam.position.y, c.y, 3, dt), damp(cam.position.z, c.z, 3, dt));
      cam.lookAt(c.tx, c.ty, c.tz);
      if (c.t <= 0) this.cinematic = null;
    } else {
      cam.position.set(px, py, pz);
      // look slightly above the car so it sits in the lower third
      cam.lookAt(this.focus.x - dirX * 0.4, this.focus.y + 1.3 - sp * 1.5, this.focus.z - dirZ * 0.4);
    }
    const baseFov = s.fov;
    const targetFov = baseFov + speedK * 7 + (car.boosting ? 8 : 0) + (car.driftBoostT > 0 ? 6 : 0) + this.fovKick;
    cam.fov = damp(cam.fov, targetFov, 4, dt);
    this.fovKick = damp(this.fovKick, 0, 5, dt);
    cam.updateProjectionMatrix();
  }
}
