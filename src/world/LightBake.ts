import * as THREE from 'three';
import type { Grid } from './Grid';
import { LM_SCALE } from '../render/LightMap';

export interface BakeLight {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  range: number;
}

/** Bucketed static-light evaluator with grid occlusion. */
export class LightBaker {
  private BS = 32;
  private bw: number;
  private bh: number;
  private buckets: number[][];

  constructor(private lights: BakeLight[], private grid: Grid, worldW: number, worldH: number) {
    const BS = this.BS;
    this.bw = Math.ceil(worldW / BS) + 1;
    this.bh = Math.ceil(worldH / BS) + 1;
    this.buckets = Array.from({ length: this.bw * this.bh }, () => []);
    lights.forEach((l, i) => {
      const x0 = Math.max(0, Math.floor((l.x - l.range) / BS)), x1 = Math.min(this.bw - 1, Math.floor((l.x + l.range) / BS));
      const z0 = Math.max(0, Math.floor((l.z - l.range) / BS)), z1 = Math.min(this.bh - 1, Math.floor((l.z + l.range) / BS));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.buckets[z * this.bw + x].push(i);
    });
  }

  at(px: number, py: number, pz: number, nx: number, ny: number, nz: number, out: number[]) {
    let r = 0, g = 0, b = 0;
    const list = this.buckets[Math.floor(pz / this.BS) * this.bw + Math.floor(px / this.BS)];
    if (list) {
      for (const li of list) {
        const l = this.lights[li];
        const lx = l.x - px, ly = l.y - py, lz = l.z - pz;
        const dd = Math.sqrt(lx * lx + ly * ly + lz * lz);
        if (dd > l.range || dd < 1e-4) continue;
        const ndl = (lx * nx + ly * ny + lz * nz) / dd;
        if (ndl <= 0) continue;
        const sx = px + nx * 0.3, sz = pz + nz * 0.3;
        const hd = Math.hypot(l.x - sx, l.z - sz);
        if (hd > 0.5 && this.grid.raycast(sx, sz, l.x - sx, l.z - sz, hd, true) < hd - 0.6) continue;
        const k = 1 - dd / l.range;
        const a = k * k * (0.35 + 0.65 * ndl);
        r += l.r * a;
        g += l.g * a;
        b += l.b * a;
      }
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
  }
}

export interface LightMapData {
  tex: THREE.DataTexture;
  x0: number;
  z0: number;
  w: number;
  h: number;
}

/** Rasterise the static lights to a small RGBA8 texture (value = light / LM_SCALE). */
export function buildLightMap(baker: LightBaker, worldW: number, worldH: number, res = 2): LightMapData {
  const w = Math.ceil(worldW / res), h = Math.ceil(worldH / res);
  const data = new Uint8Array(w * h * 4);
  const tmp = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      baker.at((x + 0.5) * res, 3.2, (y + 0.5) * res, 0, 1, 0, tmp);
      const o = (y * w + x) * 4;
      data[o] = Math.min(255, (tmp[0] / LM_SCALE) * 255);
      data[o + 1] = Math.min(255, (tmp[1] / LM_SCALE) * 255);
      data[o + 2] = Math.min(255, (tmp[2] / LM_SCALE) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { tex, x0: 0, z0: 0, w: w * res, h: h * res };
}
