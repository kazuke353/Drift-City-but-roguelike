import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Geometry helpers for building detailed vehicles: lofted bodies, rounded plates, rivets, tubes, static merging. */

export type Pt = [number, number];

/** Chaikin corner cutting on a closed polygon. */
export function chaikin(pts: Pt[], iter = 2): Pt[] {
  let p = pts;
  for (let it = 0; it < iter; it++) {
    const out: Pt[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = out;
  }
  return p;
}

/** Cross-section of the lower body (counter-clockwise from the front). */
export function bodyRing(hw: number, yb: number, ys: number, yc: number, tw: number, hwb = hw * 0.86, iter = 2): Pt[] {
  const lower = yb + (ys - yb) * 0.32;
  return chaikin([[-hwb, yb], [hwb, yb], [hw, lower], [hw, ys], [tw, yc], [-tw, yc], [-hw, ys], [-hw, lower]], iter);
}

/** Cross-section of a rounded trapezoid (cabin / boxes). */
export function trapRing(hwb: number, yb: number, hwt: number, yt: number, iter = 2): Pt[] {
  const ym = yb + (yt - yb) * 0.55;
  return chaikin([[-hwb, yb], [hwb, yb], [hwb * 0.98 + hwt * 0.02, ym], [hwt, yt], [-hwt, yt], [-hwb * 0.98 - hwt * 0.02, ym]], iter);
}

export interface Station {
  z: number;
  ring: Pt[];
}

/**
 * Loft a closed surface through cross-sections. Faces are split into two material groups by the
 * geometric normal: group 1 where ny >= splitNy (top panels), otherwise group 0.
 */
export function loft(stations: Station[], splitNy = 2, capEnds = true): THREE.BufferGeometry {
  const S = stations.length;
  const N = stations[0].ring.length;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let s = 0; s < S; s++) {
    for (let i = 0; i < N; i++) {
      const [x, y] = stations[s].ring[i];
      pos.push(x, y, stations[s].z);
      uv.push(s / (S - 1), i / N);
    }
  }
  const tris: number[] = [];
  for (let s = 0; s < S - 1; s++) {
    for (let i = 0; i < N; i++) {
      const a = s * N + i, b = s * N + ((i + 1) % N), c = (s + 1) * N + ((i + 1) % N), d = (s + 1) * N + i;
      tris.push(a, b, c, a, c, d);
    }
  }
  // caps
  const capIdx: number[] = [];
  if (capEnds) {
    for (const [s, dir] of [[0, -1], [S - 1, 1]] as const) {
      let cx = 0, cy = 0;
      for (let i = 0; i < N; i++) { cx += stations[s].ring[i][0]; cy += stations[s].ring[i][1]; }
      cx /= N; cy /= N;
      const c0 = pos.length / 3;
      pos.push(cx, cy, stations[s].z);
      uv.push(0.5, 0.5);
      for (let i = 0; i < N; i++) {
        const a = s * N + i, b = s * N + ((i + 1) % N);
        if (dir > 0) capIdx.push(c0, a, b);
        else capIdx.push(c0, b, a);
      }
    }
  }
  const all = tris.concat(capIdx);
  // orientation: signed volume must be positive
  let vol = 0;
  for (let t = 0; t < all.length; t += 3) {
    const ax = pos[all[t] * 3], ay = pos[all[t] * 3 + 1], az = pos[all[t] * 3 + 2];
    const bx = pos[all[t + 1] * 3], by = pos[all[t + 1] * 3 + 1], bz = pos[all[t + 1] * 3 + 2];
    const cx = pos[all[t + 2] * 3], cy = pos[all[t + 2] * 3 + 1], cz = pos[all[t + 2] * 3 + 2];
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) {
    for (let t = 0; t < all.length; t += 3) {
      const tmp = all[t + 1];
      all[t + 1] = all[t + 2];
      all[t + 2] = tmp;
    }
  }
  // split by face normal
  const g0: number[] = [], g1: number[] = [];
  for (let t = 0; t < all.length; t += 3) {
    const ax = pos[all[t] * 3], ay = pos[all[t] * 3 + 1], az = pos[all[t] * 3 + 2];
    const bx = pos[all[t + 1] * 3], by = pos[all[t + 1] * 3 + 1], bz = pos[all[t + 1] * 3 + 2];
    const cx = pos[all[t + 2] * 3], cy = pos[all[t + 2] * 3 + 1], cz = pos[all[t + 2] * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    (ny / l >= splitNy ? g1 : g0).push(all[t], all[t + 1], all[t + 2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(g0.concat(g1));
  g.addGroup(0, g0.length, 0);
  if (g1.length) g.addGroup(g0.length, g1.length, 1);
  g.computeVertexNormals();
  return g;
}

/** Interpolated station helper: returns rings sampled from key-frame params. */
export function stationsFrom<T extends number[]>(keys: ({ z: number } & { p: T })[], make: (p: T) => Pt[]): Station[] {
  return keys.map((k) => ({ z: k.z, ring: make(k.p) }));
}

/** Slightly beveled box. */
export function bevBox(w: number, h: number, d: number, r = 0.04, seg = 2): THREE.BufferGeometry {
  // cheap bevel: a box scaled inside a rounded outline via ExtrudeGeometry
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - rr * 1.2), bevelEnabled: true, bevelThickness: rr * 0.6, bevelSize: rr * 0.6, bevelSegments: seg, curveSegments: 3 });
  g.translate(0, 0, -(d - rr * 1.2) / 2);
  return g;
}

/** Extruded polygon plate (profile in XY, extruded along Z), optionally chamfered. */
export function plate(points: Pt[], thick: number, bevel = 0.02): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 2 });
  g.translate(0, 0, -thick / 2);
  return g;
}

export function cone(r: number, h: number, seg = 6): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(0, h / 2, 0);
  return g;
}

/** Merged rivet/bolt heads at points. */
export function rivets(points: [number, number, number][], r = 0.03): THREE.BufferGeometry {
  const list = points.map(([x, y, z]) => {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.translate(x, y, z);
    return g;
  });
  return mergeGeometries(list)!;
}

export function tubeBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/** Tube along a smooth path. */
export function pathTube(pts: THREE.Vector3[], r: number, seg = 24, rad = 7): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
  return new THREE.TubeGeometry(curve, seg, r, rad, false);
}

function normalizeAttrs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let out = g.index ? g.toNonIndexed() : g;
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2));
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k);
  return out;
}

/**
 * Merge every plain mesh under `root` (excluding subtrees flagged userData.keep) into one mesh per material.
 * Geometry is baked into root-local space.
 */
export function bakeStatic(root: THREE.Object3D, into: THREE.Object3D = root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const remove: THREE.Object3D[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || o.userData.keep) return;
    // skip anything under a kept subtree
    let p: THREE.Object3D | null = o.parent;
    while (p && p !== root) {
      if (p.userData.keep) return;
      p = p.parent;
    }
    const mat = m.material;
    if (Array.isArray(mat) || (m.geometry.groups && m.geometry.groups.length > 1)) return;
    let g = normalizeAttrs(m.geometry.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const b = buckets.get(mat) ?? { geos: [], cast: false };
    b.geos.push(g);
    b.cast = b.cast || m.castShadow;
    buckets.set(mat, b);
    remove.push(m);
  });
  for (const m of remove) m.parent?.remove(m);
  for (const [mat, b] of buckets) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    into.add(mesh);
  }
}

/** Catmull-Rom resample of loft key-stations into `n` smooth stations. */
export function smoothStations(keys: Station[], n: number): Station[] {
  const S = keys.length;
  const N = keys[0].ring.length;
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  const out: Station[] = [];
  for (let k = 0; k < n; k++) {
    const u = (k / (n - 1)) * (S - 1);
    const i = Math.min(S - 2, Math.floor(u));
    const f = u - i;
    const a = keys[Math.max(0, i - 1)], b = keys[i], c = keys[i + 1], d = keys[Math.min(S - 1, i + 2)];
    const ring: Pt[] = [];
    for (let j = 0; j < N; j++) {
      ring.push([cr(a.ring[j][0], b.ring[j][0], c.ring[j][0], d.ring[j][0], f), cr(a.ring[j][1], b.ring[j][1], c.ring[j][1], d.ring[j][1], f)]);
    }
    out.push({ z: cr(a.z, b.z, c.z, d.z, f), ring });
  }
  return out;
}
