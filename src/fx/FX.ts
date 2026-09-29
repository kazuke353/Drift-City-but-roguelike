import * as THREE from 'three';
import { Billboards, Puffs, Debris, Beams, FloorDecals, Telegraphs, Rings, SHAPE_CORE, SHAPE_DOT, SHAPE_STAR } from './Particles';
import type { LightPool } from '../render/LightPool';
import { rand } from '../core/Rng';

export type Element = 'none' | 'fire' | 'shock' | 'acid' | 'cryo';

export const ELEMENT_COLORS: Record<Element | 'holy' | 'dark' | 'gold', [number, number, number]> = {
  none: [1.0, 0.72, 0.3],
  fire: [1.0, 0.42, 0.08],
  shock: [0.35, 0.65, 1.0],
  acid: [0.45, 1.0, 0.18],
  cryo: [0.55, 0.9, 1.0],
  holy: [1.0, 0.88, 0.45],
  dark: [0.7, 0.25, 1.0],
  gold: [1.0, 0.8, 0.2],
};

export const ELEMENT_HEX: Record<Element, string> = {
  none: '#ffd27a',
  fire: '#ff6a1a',
  shock: '#4fa8ff',
  acid: '#7cff2e',
  cryo: '#9fe8ff',
};

const tmpC = new THREE.Color();

/** High level visual effects built from the particle primitives. */
export class FX {
  add: Billboards;
  smoke: Puffs;
  fire: Puffs;
  debris: Debris;
  beams: Beams;
  decals: FloorDecals;
  tele: Telegraphs;
  rings: Rings;
  shakeAmount = 0;
  hitStop = 0;
  quality = 1;

  constructor(public scene: THREE.Scene, public lights: LightPool) {
    this.add = new Billboards(scene, 5000, 2500, THREE.AdditiveBlending);
    this.smoke = new Puffs(scene, 900, false);
    this.fire = new Puffs(scene, 500, true);
    this.debris = new Debris(scene, 450);
    this.beams = new Beams(scene, 1200);
    this.decals = new FloorDecals(scene, 3500);
    this.tele = new Telegraphs(scene);
    this.rings = new Rings(scene);
  }

  shake(a: number) {
    this.shakeAmount = Math.min(2.5, this.shakeAmount + a);
  }

  update(dt: number, camPos: THREE.Vector3) {
    this.add.update(dt);
    this.smoke.update(dt);
    this.fire.update(dt);
    this.debris.update(dt);
    this.beams.update(dt);
    this.decals.update(dt);
    this.tele.update(dt);
    this.rings.update(dt, camPos);
  }

  clear() {
    this.add.clear();
    this.smoke.clear();
    this.fire.clear();
    this.debris.clear();
    this.beams.clear();
    this.decals.clear();
    this.tele.clear();
    this.rings.clear();
  }

  // ---------------------------------------------------------------- presets

  sparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, count: number, color: [number, number, number] = ELEMENT_COLORS.none, speed = 18, spread = 0.9) {
    const n = Math.ceil(count * this.quality);
    for (let i = 0; i < n; i++) {
      const vx = nx + rand(-spread, spread), vy = ny + rand(-spread * 0.5, spread), vz = nz + rand(-spread, spread);
      const l = Math.hypot(vx, vy, vz) || 1;
      const s = speed * rand(0.4, 1.2);
      this.add.emit(x, y, z, (vx / l) * s, (vy / l) * s, (vz / l) * s, rand(0.15, 0.4), 0.14, 0.05, color[0] * 3, color[1] * 3, color[2] * 3, 1, { drag: 2, grav: 28, stretch: 0.045, shape: SHAPE_CORE });
    }
  }

  hit(x: number, y: number, z: number, element: Element, crit: boolean, dx = 0, dz = 0) {
    const c = ELEMENT_COLORS[element];
    this.sparks(x, y, z, -dx * 0.6, 0.5, -dz * 0.6, crit ? 10 : 5, c, crit ? 22 : 15);
    this.add.emit(x, y, z, 0, 0, 0, 0.09, crit ? 2.2 : 1.3, crit ? 3 : 1.8, c[0] * 3, c[1] * 3, c[2] * 3, 1, { shape: SHAPE_STAR });
    if (element === 'fire') this.fire.emit(x, y, z, rand(-2, 2), rand(2, 5), rand(-2, 2), 0.35, 0.5, [3, 1.2, 0.3], [1.2, 0.2, 0.05], 3, 4);
    if (element === 'acid') for (let i = 0; i < 3; i++) this.add.emit(x, y, z, rand(-5, 5), rand(2, 8), rand(-5, 5), 0.5, 0.3, 0.15, 0.6, 1.8, 0.2, 1, { grav: 25, shape: SHAPE_DOT });
    if (element === 'cryo') for (let i = 0; i < 4; i++) this.add.emit(x, y, z, rand(-6, 6), rand(1, 7), rand(-6, 6), 0.45, 0.25, 0.05, 1.5, 2.4, 3, 1, { grav: 10, shape: SHAPE_STAR });
  }

  muzzle(x: number, y: number, z: number, dx: number, dy: number, dz: number, size = 1, color: [number, number, number] = [1, 0.7, 0.3]) {
    this.add.emit(x, y, z, dx * 0.01, dy * 0.01, dz * 0.01, 0.06, 1.2 * size, 1.6 * size, color[0] * 4, color[1] * 4, color[2] * 4, 1, { shape: SHAPE_STAR });
    this.add.emit(x + dx * 0.6 * size, y + dy * 0.6 * size, z + dz * 0.6 * size, dx * 30, dy * 30, dz * 30, 0.05, 0.5 * size, 0.3 * size, color[0] * 4, color[1] * 3.5, color[2] * 3, 1, { stretch: 0.03, shape: SHAPE_CORE });
    if (Math.random() < 0.5) this.lights.flash(x, y, z, tmpC.setRGB(color[0], color[1], color[2]), 7 * size, 14, 0.06, 0.5);
  }

  explosion(x: number, y: number, z: number, radius: number, element: Element | 'dark' | 'holy' = 'none', big = false) {
    const c = ELEMENT_COLORS[element];
    const q = this.quality;
    // hot core flash
    this.add.emit(x, y + 0.5, z, 0, 0, 0, 0.12, radius * 1.6, radius * 2.4, c[0] * 5, c[1] * 5, c[2] * 5, 1, { shape: SHAPE_DOT });
    this.add.emit(x, y + 0.5, z, 0, 0, 0, 0.18, radius * 0.8, radius * 3, c[0] * 3, c[1] * 3, c[2] * 3, 1, { shape: SHAPE_STAR });
    // fireballs
    const nf = Math.ceil((big ? 14 : 8) * q);
    for (let i = 0; i < nf; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0, radius * 0.5);
      const hot: [number, number, number] = element === 'none' || element === 'fire' ? [4, 2.2, 0.7] : [c[0] * 4, c[1] * 4, c[2] * 4];
      const cool: [number, number, number] = element === 'none' || element === 'fire' ? [1.2, 0.25, 0.05] : [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8];
      this.fire.emit(x + Math.cos(a) * r, y + rand(0.3, 1.5), z + Math.sin(a) * r, Math.cos(a) * rand(3, 10) * radius * 0.25, rand(3, 9), Math.sin(a) * rand(3, 10) * radius * 0.25, rand(0.35, 0.6), radius * rand(0.35, 0.6), hot, cool, 4, 3);
    }
    // smoke
    const ns = Math.ceil((big ? 12 : 6) * q);
    for (let i = 0; i < ns; i++) {
      const a = rand(0, Math.PI * 2);
      const g = rand(0.08, 0.16);
      this.smoke.emit(x + Math.cos(a) * radius * 0.4, y + rand(0.5, 2), z + Math.sin(a) * radius * 0.4, Math.cos(a) * rand(2, 6), rand(2, 6), Math.sin(a) * rand(2, 6), rand(0.9, 1.6), radius * rand(0.3, 0.55), [g * 1.4, g * 1.2, g], [g * 0.6, g * 0.55, g * 0.5], 2.5, 3);
    }
    this.sparks(x, y + 0.5, z, 0, 1, 0, big ? 40 : 20, [c[0], c[1] * 0.9, c[2] * 0.7], radius * 5, 1.3);
    this.rings.spawn(x, 0.15, z, radius * 0.3, radius * 1.4, 0.35, tmpC.setRGB(c[0], c[1], c[2]));
    this.decals.splat(x, z, radius * 0.8, 0x050303, 0.7, 25, 1);
    this.lights.flash(x, y + 2, z, tmpC.setRGB(c[0], c[1] * 0.8, c[2] * 0.6), big ? 40 : 22, radius * 6, big ? 0.5 : 0.3, 3);
    this.shake(big ? 0.9 : Math.min(0.5, radius * 0.08));
  }

  smokePuff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, gray = 0.85, life = 0.8) {
    this.smoke.emit(x, y, z, vx, vy, vz, life, size, [gray, gray, gray * 1.02], [gray * 0.7, gray * 0.7, gray * 0.72], 3, 1.5);
  }

  dust(x: number, z: number, count: number, color: [number, number, number] = [0.5, 0.45, 0.4], size = 0.8) {
    for (let i = 0; i < count * this.quality; i++) {
      const a = rand(0, Math.PI * 2);
      this.smoke.emit(x + Math.cos(a) * rand(0, 1), 0.3, z + Math.sin(a) * rand(0, 1), Math.cos(a) * rand(2, 6), rand(0.5, 3), Math.sin(a) * rand(2, 6), rand(0.4, 0.8), size * rand(0.6, 1.2), color, [color[0] * 0.7, color[1] * 0.7, color[2] * 0.7], 3, 1);
    }
  }

  boneBurst(x: number, y: number, z: number, dirX: number, dirZ: number, power: number, color = 0xe8e0c8) {
    tmpC.set(color);
    const n = Math.ceil(9 * this.quality);
    for (let i = 0; i < n; i++) {
      const long = Math.random() < 0.6;
      this.debris.emit(x + rand(-0.5, 0.5), y + rand(0.5, 2), z + rand(-0.5, 0.5),
        dirX * power * rand(0.3, 1) + rand(-5, 5), rand(5, 13), dirZ * power * rand(0.3, 1) + rand(-5, 5),
        long ? 0.18 : 0.3, long ? 0.18 : 0.26, long ? rand(0.7, 1.2) : 0.3, tmpC, rand(2.5, 4));
    }
    this.dust(x, z, 3, [0.75, 0.72, 0.62], 0.7);
  }

  chunkBurst(x: number, y: number, z: number, color: THREE.ColorRepresentation, count: number, size = 0.5, power = 10) {
    tmpC.set(color);
    for (let i = 0; i < count * this.quality; i++) {
      const s = size * rand(0.5, 1.3);
      this.debris.emit(x + rand(-0.5, 0.5), y + rand(0, 1), z + rand(-0.5, 0.5), rand(-power, power), rand(power * 0.4, power * 1.3), rand(-power, power), s, s * rand(0.4, 1), s * rand(0.6, 1.4), tmpC, rand(2, 4));
    }
  }

  gooBurst(x: number, y: number, z: number, color: [number, number, number], count = 10) {
    for (let i = 0; i < count * this.quality; i++) {
      this.add.emit(x, y, z, rand(-9, 9), rand(3, 12), rand(-9, 9), rand(0.4, 0.8), rand(0.3, 0.6), 0.1, color[0] * 1.5, color[1] * 1.5, color[2] * 1.5, 1, { grav: 30, shape: SHAPE_CORE });
    }
  }

  magicBurst(x: number, y: number, z: number, color: [number, number, number], count = 16, speed = 10) {
    for (let i = 0; i < count * this.quality; i++) {
      const a = rand(0, Math.PI * 2), b = rand(-0.5, 1);
      this.add.emit(x, y, z, Math.cos(a) * speed * rand(0.3, 1), b * speed, Math.sin(a) * speed * rand(0.3, 1), rand(0.4, 0.9), rand(0.3, 0.6), 0, color[0] * 3, color[1] * 3, color[2] * 3, 1, { drag: 2, shape: SHAPE_STAR });
    }
  }

  lootBeam(x: number, y: number, z: number, color: [number, number, number], height: number, t: number) {
    const pulse = 0.8 + Math.sin(t * 4) * 0.2;
    this.beams.segment(x, y, z, x, y + height, z, 0.45 * pulse, color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, 0.75);
    this.beams.segment(x, y, z, x, y + height * 0.6, z, 1.4, color[0] * 0.35, color[1] * 0.35, color[2] * 0.35, 0.3);
  }

  spawnPortal(x: number, z: number, color: [number, number, number]) {
    this.rings.spawn(x, 0.12, z, 0.5, 3.5, 0.8, tmpC.setRGB(color[0], color[1], color[2]));
    this.magicBurst(x, 0.5, z, color, 14, 6);
    for (let i = 0; i < 6 * this.quality; i++) {
      const a = rand(0, Math.PI * 2);
      this.add.emit(x + Math.cos(a) * 1.5, 0.2, z + Math.sin(a) * 1.5, 0, rand(4, 9), 0, 0.6, 0.4, 0.1, color[0] * 3, color[1] * 3, color[2] * 3, 1, { stretch: 0.06, shape: SHAPE_CORE });
    }
  }
}
