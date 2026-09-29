import * as THREE from 'three';
import { Rng } from '../core/Rng';

/**
 * Tileable grit textures sampled triplanar in object space by rimToon({ detail }).
 * Each kind yields a grayscale colour-modulation map (mean ~0.5) and an optional crack/vein mask.
 */
export type DetailKind = 'rock' | 'hide' | 'plate' | 'cloth' | 'fur' | 'scale';

export interface DetailTex {
  color: THREE.Texture;
  mask: THREE.Texture | null;
  id: string;
}

const cache = new Map<DetailKind, DetailTex>();

function cv(S: number) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
}
function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function noise(S: number, cells: number, rng: Rng): Float32Array {
  const G = cells;
  const lat = new Float32Array(G * G);
  for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const fy = (y / S) * G, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
    const ya = y0 % G, yb = (y0 + 1) % G;
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * G, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
      const xa = x0 % G, xb = (x0 + 1) % G;
      const a = lat[ya * G + xa], b = lat[ya * G + xb], c = lat[yb * G + xa], d = lat[yb * G + xb];
      out[y * S + x] = a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy;
    }
  }
  return out;
}
function fbm(S: number, base: number, oct: number, rng: Rng): Float32Array {
  const out = new Float32Array(S * S);
  let amp = 1, tot = 0, cells = base;
  for (let o = 0; o < oct; o++) {
    const f = noise(S, cells, rng);
    for (let i = 0; i < out.length; i++) out[i] += f[i] * amp;
    tot += amp;
    amp *= 0.5;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

/** Voronoi F2-F1 (cell edges) on a wrapped grid. */
function voronoiEdges(S: number, cells: number, rng: Rng, jitter = 0.85): { edge: Float32Array; f1: Float32Array } {
  const pts: [number, number][] = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.5 + (rng.next() - 0.5) * jitter) / cells, (j + 0.5 + (rng.next() - 0.5) * jitter) / cells]);
  const edge = new Float32Array(S * S), f1o = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
      let d1 = 9, d2 = 9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + cells) % cells, jj = (cj + dj + cells) % cells;
        let [px, py] = pts[jj * cells + ii];
        if (ci + di < 0) px -= 1; else if (ci + di >= cells) px += 1;
        if (cj + dj < 0) py -= 1; else if (cj + dj >= cells) py += 1;
        const d = Math.hypot(px - u, py - v);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      edge[y * S + x] = (d2 - d1) * cells;
      f1o[y * S + x] = d1 * cells;
    }
  }
  return { edge, f1: f1o };
}

function pack(S: number, vals: Float32Array, lo = 0, hi = 1): HTMLCanvasElement {
  const [c, g] = cv(S);
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = Math.max(0, Math.min(255, ((vals[i] - lo) / (hi - lo)) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function detailTexture(kind: DetailKind): DetailTex {
  const hit = cache.get(kind);
  if (hit) return hit;
  const S = 256;
  const rng = new Rng(kind.length * 977 + 13);
  const f1 = fbm(S, 4, 4, rng), f2 = fbm(S, 16, 2, rng);
  const val = new Float32Array(S * S);
  let mask: Float32Array | null = null;
  if (kind === 'rock') {
    const vor = voronoiEdges(S, 5, rng);
    const vor2 = voronoiEdges(S, 11, rng);
    mask = new Float32Array(S * S);
    for (let i = 0; i < val.length; i++) {
      const e = Math.min(vor.edge[i] * 3, 1);
      const e2 = Math.min(vor2.edge[i] * 4, 1);
      const crack = 1 - Math.min(e, 1);
      const hair = (1 - e2) * (f1[i] > 0.52 ? 1 : 0);
      val[i] = (0.42 + 0.5 * f1[i] + 0.22 * (f2[i] - 0.5)) * (0.35 + 0.65 * e) * (0.7 + 0.3 * e2) + vor.f1[i] * 0.05;
      mask[i] = Math.min(1, Math.max(0, crack * crack * crack * 1.6 - 0.1) + hair * 0.18) * (f1[i] > 0.46 ? 1 : 0.15);
    }
  } else if (kind === 'hide') {
    const vor = voronoiEdges(S, 14, rng, 0.9);
    for (let i = 0; i < val.length; i++) val[i] = (0.35 + 0.65 * Math.min(vor.f1[i] * 1.3, 1) * 0 + 0.55 * (1 - Math.min(vor.edge[i] * 2.4, 1) * 0.7)) * (0.7 + 0.5 * f1[i]) + (f2[i] - 0.5) * 0.15;
  } else if (kind === 'fur') {
    const [c, g] = cv(S);
    g.fillStyle = '#7a7a7a';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = rng.float(0, S), y = rng.float(0, S), l = rng.float(6, 20), a = rng.float(1.2, 1.9);
      g.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.25)';
      g.lineWidth = rng.float(0.8, 1.8);
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke();
      }
    }
    const im = g.getImageData(0, 0, S, S).data;
    for (let i = 0; i < val.length; i++) val[i] = (im[i * 4] / 255) * (0.75 + 0.5 * f1[i]);
  } else if (kind === 'scale') {
    const vor = voronoiEdges(S, 9, rng, 0.4);
    for (let i = 0; i < val.length; i++) val[i] = (0.3 + 0.7 * Math.min(vor.edge[i] * 2.6, 1)) * (0.65 + 0.6 * f1[i]);
  } else if (kind === 'plate') {
    const [c, g] = cv(S);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 3;
    for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * S / 2, 0); g.lineTo(k * S / 2, S); g.stroke(); g.beginPath(); g.moveTo(0, k * S / 2); g.lineTo(S, k * S / 2); g.stroke(); }
    for (let i = 0; i < 260; i++) {
      const x = rng.float(0, S), y = rng.float(0, S), l = rng.float(8, 50), a = rng.float(0, Math.PI);
      g.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.3)';
      g.lineWidth = rng.float(0.6, 1.4);
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); }
    }
    for (const [x, y] of [[16, 16], [S / 2 + 16, 16], [16, S / 2 + 16], [S / 2 + 16, S / 2 + 16], [S / 2 - 16, 16], [S - 16, 16], [S / 2 - 16, S - 16], [S - 16, S - 16]]) {
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x + dx - 1, y + dy - 1, 4, 0, 6.3); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(x + dx + 1, y + dy + 1, 4, 0, 6.3); g.fill();
      }
    }
    const im = g.getImageData(0, 0, S, S).data;
    for (let i = 0; i < val.length; i++) val[i] = (im[i * 4] / 255) * (0.55 + 0.9 * f1[i]) * (0.85 + 0.3 * f2[i]);
  } else {
    // cloth: weave + stains
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const w = 0.5 + 0.22 * Math.sin(x * 0.55 * 2) * Math.sin(y * 0.55 * 2) + 0.12 * Math.sin(x * 1.1 + y * 0.3);
      val[y * S + x] = w * (0.55 + 0.9 * f1[y * S + x]);
    }
  }
  // normalise mean to ~0.5
  let mean = 0;
  for (let i = 0; i < val.length; i++) mean += val[i];
  mean /= val.length;
  const k = 0.5 / Math.max(0.05, mean);
  for (let i = 0; i < val.length; i++) val[i] = Math.min(1, val[i] * k);
  const out: DetailTex = { color: tex(pack(S, val)), mask: mask ? tex(pack(S, mask)) : null, id: kind };
  cache.set(kind, out);
  return out;
}
