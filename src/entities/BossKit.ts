import * as THREE from 'three';

/** Geometry & texture toolkit for organic, sculpted boss models. */

export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function rnd(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const texCache = new Map<string, THREE.Texture>();

/** Ivory bone with streaks, speckles and inked hairline cracks. */
export function boneTexture(tint = '#eadfc3', dark = '#b9a57c', key = 'bone') {
  const hit = texCache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(256, 256);
  const r = rnd(11);
  g.fillStyle = tint;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = dark;
    g.globalAlpha = 0.15 + r() * 0.25;
    g.lineWidth = 1 + r() * 3;
    g.beginPath();
    const x = r() * 256;
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (r() - 0.5) * 40, 90, x + (r() - 0.5) * 40, 170, x + (r() - 0.5) * 30, 256);
    g.stroke();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 500; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(80,60,30,0.25)' : 'rgba(255,255,240,0.25)';
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  g.strokeStyle = '#3a2a18';
  g.lineWidth = 1.6;
  for (let i = 0; i < 9; i++) {
    let x = r() * 256, y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 26;
      y += r() * 18;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}

/** Tattered wing membrane with glowing veins and holes (alpha tested). */
export function membraneTexture(base: string, vein: string, edge: string, key: string) {
  const hit = texCache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(512, 512);
  const r = rnd(key.length * 97);
  const grad = g.createRadialGradient(0, 512, 20, 0, 512, 700);
  grad.addColorStop(0, base);
  grad.addColorStop(0.75, base);
  grad.addColorStop(1, edge);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  // veins radiating from the root (bottom-left)
  g.strokeStyle = vein;
  for (let i = 0; i < 11; i++) {
    const a = ((i + 0.5) / 11) * (Math.PI / 2) + (r() - 0.5) * 0.05;
    g.lineWidth = 3 + r() * 4;
    g.beginPath();
    let x = 0, y = 512;
    g.moveTo(x, y);
    for (let k = 0; k < 10; k++) {
      x += Math.cos(a) * 60 + (r() - 0.5) * 18;
      y -= Math.sin(a) * 60 + (r() - 0.5) * 18;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // cel shading band
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.moveTo(0, 512);
  g.lineTo(512, 512);
  g.lineTo(512, 340);
  g.closePath();
  g.fill();
  // tears & holes near the outer rim
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const a = r() * (Math.PI / 2);
    const d = 330 + r() * 200;
    const x = Math.cos(a) * d, y = 512 - Math.sin(a) * d;
    g.beginPath();
    g.ellipse(x, y, 6 + r() * 22, 4 + r() * 12, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.alpha = true;
  texCache.set(key, t);
  return t;
}

/** Cloth with trim & a painted emblem (tabards, banners). */
export function clothTexture(color: string, trim: string, emblem: 'cross' | 'crown' | 'skull', key: string) {
  const hit = texCache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(256, 512);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 512);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.4)');
  grad.addColorStop(0.25, 'rgba(0,0,0,0)');
  grad.addColorStop(0.75, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.4)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = trim;
  g.fillRect(0, 0, 256, 18);
  g.fillRect(14, 0, 10, 512);
  g.fillRect(232, 0, 10, 512);
  g.fillRect(0, 480, 256, 32);
  g.strokeStyle = '#111';
  g.lineWidth = 6;
  g.fillStyle = trim;
  g.save();
  g.translate(128, 220);
  if (emblem === 'cross') {
    g.beginPath();
    g.rect(-18, -110, 36, 220);
    g.rect(-70, -55, 140, 36);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(0, -37, 26, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else if (emblem === 'crown') {
    g.beginPath();
    g.moveTo(-80, 50);
    g.lineTo(-90, -50);
    g.lineTo(-40, 0);
    g.lineTo(0, -80);
    g.lineTo(40, 0);
    g.lineTo(90, -50);
    g.lineTo(80, 50);
    g.closePath();
    g.fill();
    g.stroke();
  } else {
    g.beginPath();
    g.arc(0, -10, 70, Math.PI, 0);
    g.lineTo(55, 50);
    g.lineTo(-55, 50);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(-28, -8, 18, 0, Math.PI * 2);
    g.arc(28, -8, 18, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

// ------------------------------------------------------------------ geometry

/** Tube along a Catmull-Rom curve with radius tapering from r0 to r1. */
export function taperTube(pts: THREE.Vector3[], r0: number, r1: number, seg = 24, rad = 10, ease = 1) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const P = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P);
    const r = r0 + (r1 - r0) * Math.pow(t, ease);
    for (let j = 0; j <= rad; j++) {
      const idx = i * (rad + 1) + j;
      pos.setXYZ(idx, P.x + (pos.getX(idx) - P.x) * r, P.y + (pos.getY(idx) - P.y) * r, P.z + (pos.getZ(idx) - P.z) * r);
    }
  }
  pos.needsUpdate = true;
  return g;
}

const boneLatheCache = new Map<string, THREE.BufferGeometry>();
/** Cartoon bone (knobbly ends, slim waist) along +Y from 0..len. */
export function boneGeo(len: number, r: number) {
  const key = `${len.toFixed(2)}|${r.toFixed(2)}`;
  let g = boneLatheCache.get(key);
  if (g) return g;
  const k = r * 1.55;
  const pts = [
    [0, 0], [k * 0.75, len * 0.01], [k, len * 0.06], [k * 0.9, len * 0.13], [r, len * 0.22], [r * 0.82, len * 0.5], [r, len * 0.78], [k * 0.9, len * 0.87], [k, len * 0.94], [k * 0.75, len * 0.99], [0, len],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  g = new THREE.LatheGeometry(pts, 10);
  boneLatheCache.set(key, g);
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);
/** Place an object at `a` pointing its +Y axis toward `b`. */
export function orient(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  obj.position.copy(a);
  obj.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return obj;
}

export function bone(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const m = new THREE.Mesh(boneGeo(a.distanceTo(b), r), mat);
  m.castShadow = true;
  return orient(m, a, b);
}

/** Pivot group at `a` whose child bone reaches `b` (for articulated limbs). */
export function limb(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const g = new THREE.Group();
  g.position.copy(a);
  parent.add(g);
  const m = new THREE.Mesh(boneGeo(a.distanceTo(b), r), mat);
  m.castShadow = true;
  m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  g.add(m);
  return g;
}

export interface SkullOpts {
  len: number;
  w: number;
  h: number;
  snout?: number;
  socket?: number;
}

/**
 * A sculpted dragon/demon skull from a deformed sphere: stretched snout, brow ridge,
 * deep eye sockets, cheekbones and a nasal cavity. Returns geometry + eye positions.
 */
export function skull(o: SkullOpts) {
  const snout = o.snout ?? 1.9;
  const sockDepth = o.socket ?? 0.4;
  const g = new THREE.SphereGeometry(1, 40, 28);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const feats = (n: THREE.Vector3) => {
    let r = 1;
    const bump = (dx: number, dy: number, dz: number, ang: number, amt: number) => {
      const d = new THREE.Vector3(dx, dy, dz).normalize();
      const a = Math.acos(THREE.MathUtils.clamp(n.dot(d), -1, 1));
      if (a < ang) {
        const k = 1 - a / ang;
        r += amt * k * k;
      }
    };
    for (const s of [-1, 1]) {
      bump(s * 0.5, 0.36, 0.78, 0.44, -sockDepth);
      bump(s * 0.45, 0.7, 0.55, 0.42, 0.14);
      bump(s * 0.88, -0.1, 0.42, 0.45, 0.12);
      bump(s * 1, 0.25, -0.2, 0.5, -0.1);
    }
    bump(0, 0.22, 1, 0.2, -0.22);
    bump(0, 0.9, -0.45, 0.7, 0.16);
    bump(0, 0.55, 0.85, 0.3, 0.07);
    return r;
  };
  const deform = (n: THREE.Vector3, r: number) => {
    let x = n.x * r, y = n.y * r, z = n.z * r;
    if (z > 0) {
      const f = Math.min(1, z);
      z *= snout;
      x *= 1 - 0.42 * f;
      y *= 1 - 0.28 * f;
      y -= 0.14 * f;
    } else z *= 0.95;
    if (y < -0.32) y = -0.32 + (y + 0.32) * 0.28;
    // normalise so the skull is exactly w × h × len
    return new THREE.Vector3(x * o.w * 0.5, (y + 0.32) * (o.h / 1.45) - o.h * 0.3, z * o.len * 0.5 / ((snout + 0.95) / 2));
  };
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const p = deform(n, feats(n));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  const eyes = [-1, 1].map((s) => {
    const d = new THREE.Vector3(s * 0.5, 0.36, 0.78).normalize();
    return deform(d, 1 - sockDepth * 0.55);
  });
  const toothRow: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    const d = new THREE.Vector3(Math.sin(a) * 0.95, -0.34, Math.cos(a) * 0.95 + 0.05).normalize();
    if (d.z < 0.15) continue;
    toothRow.push(deform(d, 1));
  }
  return { geo: g, eyes, teeth: toothRow };
}

/** U-shaped lower jaw; top face at y=0, extends toward +z. */
export function jawGeo(len: number, w: number, t: number, thick: number) {
  const s = new THREE.Shape();
  s.moveTo(-w * 0.5, 0);
  s.quadraticCurveTo(-w * 0.46, len * 0.95, 0, len);
  s.quadraticCurveTo(w * 0.46, len * 0.95, w * 0.5, 0);
  s.lineTo(w * 0.5 - t, 0);
  s.quadraticCurveTo(w * 0.42 - t, len * 0.9 - t, 0, len - t * 1.3);
  s.quadraticCurveTo(-w * 0.42 + t, len * 0.9 - t, -w * 0.5 + t, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.25, bevelSize: t * 0.2, bevelSegments: 2, curveSegments: 12 });
  g.rotateX(Math.PI / 2);
  return g;
}

/** Points along the jaw's outer arc (for teeth). */
export function jawArc(len: number, w: number, n: number, inset: number) {
  const out: THREE.Vector3[] = [];
  const q = (p0: THREE.Vector2, c: THREE.Vector2, p1: THREE.Vector2, t: number) => new THREE.Vector2(
    (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x,
    (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y,
  );
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const left = u < 0.5;
    const t = left ? u * 2 : (u - 0.5) * 2;
    const p = left
      ? q(new THREE.Vector2(-w * 0.5 + inset, 0), new THREE.Vector2(-w * 0.46 + inset, len * 0.95 - inset), new THREE.Vector2(0, len - inset), t)
      : q(new THREE.Vector2(0, len - inset), new THREE.Vector2(w * 0.46 - inset, len * 0.95 - inset), new THREE.Vector2(w * 0.5 - inset, 0), t);
    if (p.y < len * 0.2) continue;
    out.push(new THREE.Vector3(p.x, 0, p.y));
  }
  return out;
}

/** Scalloped wing membrane between finger tips (in the XY plane, root at origin). */
export function membraneGeo(tips: THREE.Vector2[], bottom: THREE.Vector2) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(tips[0].x, tips[0].y);
  for (let i = 1; i < tips.length; i++) {
    const a = tips[i - 1], b = tips[i];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const inward = mid.clone().multiplyScalar(0.72);
    s.quadraticCurveTo(inward.x, inward.y, b.x, b.y);
  }
  const last = tips[tips.length - 1];
  s.quadraticCurveTo((last.x + bottom.x) * 0.4, (last.y + bottom.y) * 0.4, bottom.x, bottom.y);
  s.lineTo(0, 0);
  const g = new THREE.ShapeGeometry(s, 16);
  // normalise uvs to 0..1 over the bbox
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  return g;
}

export function chain(n: number, link: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(link * 0.5, link * 0.14, 6, 12);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -i * link * 0.78;
    m.rotation.y = i % 2 ? Math.PI / 2 : 0;
    m.scale.set(1, 1.35, 1);
    g.add(m);
  }
  return g;
}

/** Cloth plane (top edge at y=0) that can be waved each frame. */
export function clothMesh(w: number, h: number, mat: THREE.Material, sx = 8, sy = 12) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  g.translate(0, -h / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.userData.base = Float32Array.from((g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array);
  m.userData.h = h;
  m.castShadow = true;
  return m;
}

export function waveCloth(m: THREE.Mesh, t: number, amp: number, freq = 1.2, push = 0) {
  const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
  const base = m.userData.base as Float32Array;
  const h = m.userData.h as number;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1];
    const d = -y / h;
    const z = Math.sin(t * 3 + y * freq + x * 0.6) * amp * d + Math.sin(t * 1.7 + x * 1.3) * amp * 0.4 * d - push * d * d;
    pos.setZ(i, base[i * 3 + 2] + z);
  }
  pos.needsUpdate = true;
  m.geometry.computeVertexNormals();
}

/** Lumpy displaced hemisphere (gold hoards, rubble mounds). */
export function mound(rx: number, ry: number, rz: number, seed: number, lump = 0.12) {
  const g = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const r = rnd(seed);
  const bumps = Array.from({ length: 14 }, () => ({ d: new THREE.Vector3(r() - 0.5, r() * 0.8 + 0.1, r() - 0.5).normalize(), a: 0.2 + r() * 0.35, h: (r() - 0.3) * lump * 2 }));
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    let k = 1;
    for (const b of bumps) {
      const a = Math.acos(THREE.MathUtils.clamp(n.clone().normalize().dot(b.d), -1, 1));
      if (a < b.a) k += b.h * (1 - a / b.a);
    }
    pos.setXYZ(i, n.x * rx * k, Math.max(0, n.y * ry * k), n.z * rz * k);
  }
  g.computeVertexNormals();
  return g;
}

export function spikes(parent: THREE.Object3D, pts: THREE.Vector3[], dirs: THREE.Vector3[], r: number, h: number, mat: THREE.Material) {
  const geo = new THREE.ConeGeometry(r, h, 6);
  geo.translate(0, h / 2, 0);
  pts.forEach((p, i) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(p);
    m.quaternion.setFromUnitVectors(UP, dirs[i].clone().normalize());
    m.castShadow = true;
    parent.add(m);
  });
}
