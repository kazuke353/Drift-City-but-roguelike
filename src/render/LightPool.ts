import * as THREE from 'three';

export interface LightSource {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  intensity: number;
  distance: number;
  flicker?: number;
  priority?: number;
  ttl?: number;
  life?: number;
  phase?: number;
}

/**
 * Fixed-size pool of point lights so shader programs never recompile.
 * Each frame the most relevant static + transient sources get a real light.
 */
export class LightPool {
  lights: THREE.PointLight[] = [];
  statics: LightSource[] = [];
  transients: LightSource[] = [];
  private scratch: { s: LightSource; score: number }[] = [];
  private t = 0;

  constructor(private scene: THREE.Scene, count: number) {
    this.setCount(count);
  }

  setCount(count: number) {
    for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 1.6);
      l.castShadow = false;
      this.scene.add(l);
      this.lights.push(l);
    }
  }

  clearStatics() {
    this.statics = [];
    this.transients = [];
  }

  addStatic(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity: number, distance: number, flicker = 0.15) {
    const s: LightSource = { x, y, z, color: new THREE.Color(color), intensity, distance, flicker, phase: Math.random() * 100 };
    this.statics.push(s);
    return s;
  }

  flash(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity: number, distance: number, ttl: number, priority = 1) {
    if (this.transients.length > 40) this.transients.shift();
    this.transients.push({ x, y, z, color: new THREE.Color(color), intensity, distance, ttl, life: ttl, priority });
  }

  update(dt: number, fx: number, fz: number) {
    this.t += dt;
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const s = this.transients[i];
      s.life! -= dt;
      if (s.life! <= 0) this.transients.splice(i, 1);
    }
    const sc = this.scratch;
    sc.length = 0;
    for (const s of this.transients) {
      const d = Math.hypot(s.x - fx, s.z - fz);
      if (d > 90) continue;
      sc.push({ s, score: (s.priority ?? 1) * 200 + s.intensity * 4 - d });
    }
    for (const s of this.statics) {
      const d = Math.hypot(s.x - fx, s.z - fz);
      if (d > 70) continue;
      sc.push({ s, score: -d });
    }
    sc.sort((a, b) => b.score - a.score);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const e = sc[i];
      if (!e) {
        l.intensity = 0;
        continue;
      }
      const s = e.s;
      l.position.set(s.x, s.y, s.z);
      l.color.copy(s.color);
      l.distance = s.distance;
      let inten = s.intensity;
      if (s.ttl !== undefined) {
        const k = Math.max(0, s.life! / s.ttl);
        inten *= k * k;
      } else if (s.flicker) {
        const p = s.phase!;
        inten *= 1 - s.flicker * (0.5 + 0.5 * Math.sin(this.t * 11 + p) * Math.sin(this.t * 7.3 + p * 2));
      }
      l.intensity = inten;
    }
  }
}
