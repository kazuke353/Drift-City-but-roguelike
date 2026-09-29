import * as THREE from 'three';
import { FX_LAYER, toon } from '../render/Toon';

export const SHAPE_DOT = 0;
export const SHAPE_CORE = 1;
export const SHAPE_STAR = 2;
export const SHAPE_RING = 3;

const billboardVert = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iCol;
attribute vec4 iParams;
varying vec4 vCol;
varying vec2 vUv;
varying float vShape;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float size = iParams.x;
  float stretch = iParams.y;
  vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
  vec2 d = vv.xy;
  float l = length(d);
  vec2 axis = l > 1e-4 ? d / l : vec2(cos(iParams.w), sin(iParams.w));
  vec2 perp = vec2(-axis.y, axis.x);
  float sl = stretch * l;
  float len = size + sl;
  vec2 off = axis * ((position.x - 0.5) * len + size * 0.5) + perp * position.y * size;
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  vCol = iCol;
  vUv = vec2(position.x * 2.0, position.y * 2.0);
  vShape = iParams.z;
}
`;

const billboardFrag = /* glsl */ `
varying vec4 vCol;
varying vec2 vUv;
varying float vShape;
void main() {
  float r = length(vUv);
  float a;
  if (vShape < 0.5) { a = smoothstep(1.0, 0.0, r); a *= a; }
  else if (vShape < 1.5) { a = smoothstep(1.0, 0.55, r) * 0.6 + smoothstep(0.55, 0.0, r); }
  else if (vShape < 2.5) {
    vec2 p = abs(vUv);
    float star = smoothstep(0.18, 0.0, min(p.x, p.y) * (0.4 + max(p.x, p.y)));
    a = max(star, smoothstep(0.5, 0.0, r)) * smoothstep(1.0, 0.7, r);
  } else { a = smoothstep(0.16, 0.0, abs(r - 0.8)); }
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
}
`;

/** GPU billboards: soft dots, hot cores, stars and velocity-stretched streaks. */
export class Billboards {
  readonly cap: number;
  private px: Float32Array; private py: Float32Array; private pz: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private life: Float32Array; private max: Float32Array;
  private s0: Float32Array; private s1: Float32Array;
  private cr: Float32Array; private cg: Float32Array; private cb: Float32Array; private ca: Float32Array;
  private drag: Float32Array; private grav: Float32Array; private stretch: Float32Array; private shape: Float32Array; private rot: Float32Array;
  private fade: Float32Array;
  count = 0;
  private immCount = 0;
  private immCap: number;
  mesh: THREE.Mesh;
  private aPos: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aPar: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(scene: THREE.Scene, cap = 5000, immCap = 2500, blending: THREE.Blending = THREE.AdditiveBlending) {
    this.cap = cap;
    this.immCap = immCap;
    const F = () => new Float32Array(cap);
    this.px = F(); this.py = F(); this.pz = F();
    this.vx = F(); this.vy = F(); this.vz = F();
    this.life = F(); this.max = F(); this.s0 = F(); this.s1 = F();
    this.cr = F(); this.cg = F(); this.cb = F(); this.ca = F();
    this.drag = F(); this.grav = F(); this.stretch = F(); this.shape = F(); this.rot = F(); this.fade = F();
    const total = cap + immCap;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iVel', this.aVel);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iParams', this.aPar);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      vertexShader: billboardVert,
      fragmentShader: billboardFrag,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.layers.set(FX_LAYER);
    scene.add(this.mesh);
  }

  /** Emit a simulated particle. Colors may exceed 1 for bloom. */
  emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size0: number, size1: number,
    r: number, g: number, b: number, a = 1,
    opts: { drag?: number; grav?: number; stretch?: number; shape?: number; rot?: number; fade?: number } = {},
  ) {
    let i = this.count;
    if (i >= this.cap) i = Math.floor(Math.random() * this.cap);
    else this.count++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life;
    this.s0[i] = size0; this.s1[i] = size1;
    this.cr[i] = r; this.cg[i] = g; this.cb[i] = b; this.ca[i] = a;
    this.drag[i] = opts.drag ?? 0;
    this.grav[i] = opts.grav ?? 0;
    this.stretch[i] = opts.stretch ?? 0;
    this.shape[i] = opts.shape ?? SHAPE_DOT;
    this.rot[i] = opts.rot ?? Math.random() * 6.28;
    this.fade[i] = opts.fade ?? 1;
  }

  /** Draw a billboard for this frame only (projectiles, glows). */
  draw(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, stretch: number, r: number, g: number, b: number, a: number, shape = SHAPE_DOT, rot = 0) {
    if (this.immCount >= this.immCap) return;
    const i = this.cap + this.immCount++;
    const P = this.aPos.array as Float32Array, V = this.aVel.array as Float32Array, C = this.aCol.array as Float32Array, Q = this.aPar.array as Float32Array;
    // written directly at the end region; compacted in update()
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    V[i * 3] = vx; V[i * 3 + 1] = vy; V[i * 3 + 2] = vz;
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a;
    Q[i * 4] = size; Q[i * 4 + 1] = stretch; Q[i * 4 + 2] = shape; Q[i * 4 + 3] = rot;
  }

  update(dt: number) {
    const P = this.aPos.array as Float32Array, V = this.aVel.array as Float32Array, C = this.aCol.array as Float32Array, Q = this.aPar.array as Float32Array;
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.count;
        if (i !== j) {
          this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
          this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
          this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
          this.cr[i] = this.cr[j]; this.cg[i] = this.cg[j]; this.cb[i] = this.cb[j]; this.ca[i] = this.ca[j];
          this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j]; this.stretch[i] = this.stretch[j]; this.shape[i] = this.shape[j];
          this.rot[i] = this.rot[j]; this.fade[i] = this.fade[j];
        }
        continue;
      }
      const dk = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= dk; this.vz[i] *= dk;
      this.vy[i] = this.vy[i] * dk - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.05 && this.vy[i] < 0) {
        this.py[i] = 0.05;
        this.vy[i] *= -0.4;
        this.vx[i] *= 0.7; this.vz[i] *= 0.7;
      }
      const t = 1 - this.life[i] / this.max[i];
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const alpha = this.ca[i] * (this.fade[i] > 0 ? 1 - Math.pow(t, 1 + this.fade[i]) : 1);
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i];
      V[i * 3] = this.vx[i]; V[i * 3 + 1] = this.vy[i]; V[i * 3 + 2] = this.vz[i];
      C[i * 4] = this.cr[i]; C[i * 4 + 1] = this.cg[i]; C[i * 4 + 2] = this.cb[i]; C[i * 4 + 3] = alpha;
      Q[i * 4] = size; Q[i * 4 + 1] = this.stretch[i]; Q[i * 4 + 2] = this.shape[i]; Q[i * 4 + 3] = this.rot[i];
      i++;
    }
    // move immediate draws right after live particles
    const n = this.count, m = this.immCount;
    if (m > 0) {
      P.copyWithin(n * 3, this.cap * 3, (this.cap + m) * 3);
      V.copyWithin(n * 3, this.cap * 3, (this.cap + m) * 3);
      C.copyWithin(n * 4, this.cap * 4, (this.cap + m) * 4);
      Q.copyWithin(n * 4, this.cap * 4, (this.cap + m) * 4);
    }
    const total = n + m;
    this.geo.instanceCount = total;
    for (const [a, sz] of [[this.aPos, 3], [this.aVel, 3], [this.aCol, 4], [this.aPar, 4]] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, total) * sz);
      a.needsUpdate = true;
    }
    this.immCount = 0;
  }

  clear() {
    this.count = 0;
    this.immCount = 0;
  }
}

/** Chunky cel-shaded puffs (smoke, dust, fireballs). They shrink instead of fading. */
export class Puffs {
  readonly cap: number;
  mesh: THREE.InstancedMesh;
  private d: Float32Array; // per puff: x y z vx vy vz life max size r0 g0 b0 r1 g1 b1 drag rise
  private static STRIDE = 17;
  count = 0;
  private colorArr: Float32Array;

  constructor(scene: THREE.Scene, cap: number, emissive: boolean) {
    this.cap = cap;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat: THREE.Material = emissive
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
      : toon(0xffffff).clone();
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.colorArr = new Float32Array(cap * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.colorArr, 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
    this.d = new Float32Array(cap * Puffs.STRIDE);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, c0: THREE.Color | number[], c1: THREE.Color | number[], drag = 2, rise = 0) {
    let i = this.count;
    if (i >= this.cap) i = Math.floor(Math.random() * this.cap);
    else this.count++;
    const d = this.d, o = i * Puffs.STRIDE;
    const a0 = Array.isArray(c0) ? c0 : [c0.r, c0.g, c0.b];
    const a1 = Array.isArray(c1) ? c1 : [c1.r, c1.g, c1.b];
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = life; d[o + 7] = life; d[o + 8] = size;
    d[o + 9] = a0[0]; d[o + 10] = a0[1]; d[o + 11] = a0[2];
    d[o + 12] = a1[0]; d[o + 13] = a1[1]; d[o + 14] = a1[2];
    d[o + 15] = drag; d[o + 16] = rise;
  }

  update(dt: number) {
    const d = this.d, S = Puffs.STRIDE;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.colorArr;
    let i = 0;
    while (i < this.count) {
      const o = i * S;
      d[o + 6] -= dt;
      if (d[o + 6] <= 0) {
        const j = --this.count;
        if (i !== j) d.copyWithin(o, j * S, j * S + S);
        continue;
      }
      const dk = Math.max(0, 1 - d[o + 15] * dt);
      d[o + 3] *= dk; d[o + 5] *= dk;
      d[o + 4] = d[o + 4] * dk + d[o + 16] * dt;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      if (d[o + 1] < 0.2) d[o + 1] = 0.2;
      const t = 1 - d[o + 6] / d[o + 7];
      const grow = t < 0.18 ? t / 0.18 : 1 - Math.pow((t - 0.18) / 0.82, 1.6);
      const s = d[o + 8] * Math.max(0.001, grow);
      const k = i * 16;
      m[k] = s; m[k + 1] = 0; m[k + 2] = 0; m[k + 3] = 0;
      m[k + 4] = 0; m[k + 5] = s; m[k + 6] = 0; m[k + 7] = 0;
      m[k + 8] = 0; m[k + 9] = 0; m[k + 10] = s; m[k + 11] = 0;
      m[k + 12] = d[o]; m[k + 13] = d[o + 1]; m[k + 14] = d[o + 2]; m[k + 15] = 1;
      const ct = Math.min(1, t * 1.6);
      col[i * 3] = d[o + 9] + (d[o + 12] - d[o + 9]) * ct;
      col[i * 3 + 1] = d[o + 10] + (d[o + 13] - d[o + 10]) * ct;
      col[i * 3 + 2] = d[o + 11] + (d[o + 14] - d[o + 11]) * ct;
      i++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, Math.max(1, this.count) * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    const ic = this.mesh.instanceColor!;
    ic.clearUpdateRanges();
    ic.addUpdateRange(0, Math.max(1, this.count) * 3);
    ic.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
  }
}

/** Physical debris chunks: bones, planks, stones, metal, gems. */
export class Debris {
  readonly cap: number;
  mesh: THREE.InstancedMesh;
  private items: { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; wx: number; wy: number; wz: number; sx: number; sy: number; sz: number; life: number; max: number; rest: boolean; r: number; g: number; b: number }[] = [];
  private colors: Float32Array;
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private mtx = new THREE.Matrix4();
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3();
  isSolid: ((x: number, z: number) => boolean) | null = null;

  constructor(scene: THREE.Scene, cap = 500) {
    this.cap = cap;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, toon(0xffffff).clone(), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.colors = new Float32Array(cap * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, sx: number, sy: number, sz: number, color: THREE.Color, life = 3) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({
      x, y, z, vx, vy, vz,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
      wx: (Math.random() - 0.5) * 18, wy: (Math.random() - 0.5) * 18, wz: (Math.random() - 0.5) * 18,
      sx, sy, sz, life, max: life, rest: false, r: color.r, g: color.g, b: color.b,
    });
  }

  update(dt: number) {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.life -= dt;
      if (it.life <= 0) {
        items.splice(i, 1);
        continue;
      }
      if (!it.rest) {
        it.vy -= 32 * dt;
        const nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
        if (this.isSolid && this.isSolid(nx, nz)) {
          it.vx *= -0.4;
          it.vz *= -0.4;
        } else {
          it.x = nx;
          it.z = nz;
        }
        it.y += it.vy * dt;
        it.rx += it.wx * dt; it.ry += it.wy * dt; it.rz += it.wz * dt;
        const floor = it.sy * 0.5;
        if (it.y < floor) {
          it.y = floor;
          if (Math.abs(it.vy) < 3) {
            it.vy = 0;
            it.vx *= 0.85; it.vz *= 0.85;
            it.wx *= 0.8; it.wy *= 0.8; it.wz *= 0.8;
            if (Math.abs(it.vx) + Math.abs(it.vz) < 0.3) {
              it.rest = true;
              it.rx = Math.round(it.rx / (Math.PI / 2)) * (Math.PI / 2);
              it.rz = Math.round(it.rz / (Math.PI / 2)) * (Math.PI / 2);
            }
          } else {
            it.vy *= -0.35;
            it.vx *= 0.7; it.vz *= 0.7;
          }
        }
      }
    }
    const m = this.mesh;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const shrink = it.life < 0.6 ? it.life / 0.6 : 1;
      this.e.set(it.rx, it.ry, it.rz);
      this.q.setFromEuler(this.e);
      this.pos.set(it.x, it.y, it.z);
      this.scl.set(it.sx * shrink, it.sy * shrink, it.sz * shrink);
      this.mtx.compose(this.pos, this.q, this.scl);
      m.setMatrixAt(i, this.mtx);
      this.colors[i * 3] = it.r;
      this.colors[i * 3 + 1] = it.g;
      this.colors[i * 3 + 2] = it.b;
    }
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor!.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}

const beamVert = /* glsl */ `
attribute vec4 color;
attribute vec2 buv;
varying vec4 vColor;
varying vec2 vUv;
void main() { vColor = color; vUv = buv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const beamFrag = /* glsl */ `
varying vec4 vColor;
varying vec2 vUv;
void main() {
  float x = abs(vUv.y * 2.0 - 1.0);
  float a = smoothstep(1.0, 0.0, x);
  float core = smoothstep(0.35, 0.0, x);
  vec3 c = vColor.rgb * a + vec3(1.0) * core * 0.5;
  gl_FragColor = vec4(c, vColor.a * a);
}
`;

/** Camera-facing ribbons for lasers, lightning and rail trails (rebuilt every frame). */
export class Beams {
  private cap: number;
  private pos: Float32Array;
  private col: Float32Array;
  private uv: Float32Array;
  private geo: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  private n = 0;
  private persistent: { ax: number; ay: number; az: number; bx: number; by: number; bz: number; w: number; r: number; g: number; b: number; life: number; max: number }[] = [];
  private cam = new THREE.Vector3();

  constructor(scene: THREE.Scene, cap = 900) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 4 * 3);
    this.col = new Float32Array(cap * 4 * 4);
    this.uv = new Float32Array(cap * 4 * 2);
    const idx: number[] = [];
    for (let i = 0; i < cap; i++) {
      const o = i * 4;
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('buv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.layers.set(FX_LAYER);
    scene.add(this.mesh);
  }

  segment(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, r: number, g: number, b: number, a = 1) {
    if (this.n >= this.cap) return;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const tx = this.cam.x - ax, ty = this.cam.y - ay, tz = this.cam.z - az;
    let sx = dy * tz - dz * ty, sy = dz * tx - dx * tz, sz = dx * ty - dy * tx;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx = (sx / sl) * w * 0.5; sy = (sy / sl) * w * 0.5; sz = (sz / sl) * w * 0.5;
    const i = this.n++;
    const p = this.pos, o = i * 12;
    p[o] = ax - sx; p[o + 1] = ay - sy; p[o + 2] = az - sz;
    p[o + 3] = bx - sx; p[o + 4] = by - sy; p[o + 5] = bz - sz;
    p[o + 6] = bx + sx; p[o + 7] = by + sy; p[o + 8] = bz + sz;
    p[o + 9] = ax + sx; p[o + 10] = ay + sy; p[o + 11] = az + sz;
    const c = this.col, co = i * 16;
    for (let k = 0; k < 4; k++) {
      c[co + k * 4] = r; c[co + k * 4 + 1] = g; c[co + k * 4 + 2] = b; c[co + k * 4 + 3] = a;
    }
    const u = this.uv, uo = i * 8;
    u[uo] = 0; u[uo + 1] = 0; u[uo + 2] = 1; u[uo + 3] = 0; u[uo + 4] = 1; u[uo + 5] = 1; u[uo + 6] = 0; u[uo + 7] = 1;
  }

  /** Jagged lightning between two points. */
  lightning(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, r: number, g: number, b: number, jag = 1.2) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const segs = Math.max(3, Math.floor(len / 2.2));
    let px = ax, py = ay, pz = az;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const off = i === segs ? 0 : jag;
      const nx = ax + (bx - ax) * t + (Math.random() - 0.5) * off * 2;
      const ny = ay + (by - ay) * t + (Math.random() - 0.5) * off * 2;
      const nz = az + (bz - az) * t + (Math.random() - 0.5) * off * 2;
      this.segment(px, py, pz, nx, ny, nz, w, r, g, b);
      px = nx; py = ny; pz = nz;
    }
  }

  /** A fading beam that lives for `life` seconds. */
  trail(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, r: number, g: number, b: number, life: number) {
    this.persistent.push({ ax, ay, az, bx, by, bz, w, r, g, b, life, max: life });
  }

  begin(camPos: THREE.Vector3) {
    this.cam.copy(camPos);
    this.n = 0;
  }

  update(dt: number) {
    for (let i = this.persistent.length - 1; i >= 0; i--) {
      const p = this.persistent[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.persistent.splice(i, 1);
        continue;
      }
      const k = p.life / p.max;
      this.segment(p.ax, p.ay, p.az, p.bx, p.by, p.bz, p.w * (0.3 + 0.7 * k), p.r, p.g, p.b, k);
    }
    this.geo.setDrawRange(0, this.n * 6);
    for (const name of ['position', 'color', 'buv']) {
      const a = this.geo.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, this.n) * 4 * a.itemSize);
      a.needsUpdate = true;
    }
  }

  clear() {
    this.persistent.length = 0;
    this.n = 0;
  }
}

const decalVert = /* glsl */ `
attribute vec4 color;
attribute vec2 duv;
attribute vec2 meta; // birth, life
varying vec4 vColor;
varying vec2 vUv;
varying float vFade;
varying float vKind;
uniform float uTime;
attribute float kind;
void main() {
  vColor = color;
  vUv = duv;
  float age = uTime - meta.x;
  vFade = clamp(1.0 - age / meta.y, 0.0, 1.0);
  vFade = min(vFade * 3.0, 1.0);
  vKind = kind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const decalFrag = /* glsl */ `
varying vec4 vColor;
varying vec2 vUv;
varying float vFade;
varying float vKind;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float a = vColor.a * vFade;
  if (vKind > 0.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float ang = atan(p.y, p.x);
    float r = length(p) + (sin(ang * 7.0 + vColor.r * 30.0) * 0.08 + sin(ang * 13.0) * 0.05);
    a *= smoothstep(1.0, 0.55, r);
    if (vKind > 1.5) a *= 0.85 + 0.15 * step(0.5, fract(r * 6.0));
  } else {
    float e = abs(vUv.y * 2.0 - 1.0);
    a *= smoothstep(1.0, 0.6, e);
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}
`;

/** Ring-buffered floor decals: skid marks (kind 0), scorch marks (1), splats (2). */
export class FloorDecals {
  private cap: number;
  private i = 0;
  private used = 0;
  private pos: Float32Array;
  private col: Float32Array;
  private uv: Float32Array;
  private meta: Float32Array;
  private kind: Float32Array;
  private geo: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  time = 0;

  constructor(scene: THREE.Scene, cap = 3000) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 12);
    this.col = new Float32Array(cap * 16);
    this.uv = new Float32Array(cap * 8);
    this.meta = new Float32Array(cap * 8);
    this.kind = new Float32Array(cap * 4);
    const idx: number[] = [];
    for (let i = 0; i < cap; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('duv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('meta', new THREE.BufferAttribute(this.meta, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('kind', new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: decalVert,
      fragmentShader: decalFrag,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.layers.set(FX_LAYER);
    scene.add(this.mesh);
  }

  private write(corners: number[], r: number, g: number, b: number, a: number, life: number, kind: number) {
    const i = this.i;
    this.i = (this.i + 1) % this.cap;
    this.used = Math.min(this.cap, this.used + 1);
    this.pos.set(corners, i * 12);
    for (let k = 0; k < 4; k++) {
      this.col[i * 16 + k * 4] = r; this.col[i * 16 + k * 4 + 1] = g; this.col[i * 16 + k * 4 + 2] = b; this.col[i * 16 + k * 4 + 3] = a;
      this.meta[i * 8 + k * 2] = this.time; this.meta[i * 8 + k * 2 + 1] = life;
      this.kind[i * 4 + k] = kind;
    }
    this.uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    this.dirty = true;
  }
  private dirty = false;

  skid(x0: number, z0: number, x1: number, z1: number, w: number, a = 0.55) {
    const dx = x1 - x0, dz = z1 - z0;
    const l = Math.hypot(dx, dz);
    if (l < 0.01) return;
    const nx = (-dz / l) * w * 0.5, nz = (dx / l) * w * 0.5;
    const y = 0.03;
    this.write([x0 - nx, y, z0 - nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz, x0 + nx, y, z0 + nz], 0.03, 0.03, 0.035, a, 14, 0);
  }

  splat(x: number, z: number, r: number, color: THREE.ColorRepresentation, a = 0.8, life = 30, kind = 1) {
    const c = new THREE.Color(color);
    const rot = Math.random() * Math.PI;
    const cs = Math.cos(rot) * r, sn = Math.sin(rot) * r;
    const y = 0.04 + Math.random() * 0.01;
    this.write([x - cs + sn, y, z - sn - cs, x + cs + sn, y, z + sn - cs, x + cs - sn, y, z + sn + cs, x - cs - sn, y, z - sn + cs], c.r, c.g, c.b, a, life, kind);
  }

  update(dt: number) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    this.geo.setDrawRange(0, this.used * 6);
    if (this.dirty) {
      for (const name of ['position', 'color', 'duv', 'meta', 'kind']) (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
      this.dirty = false;
    }
  }

  clear() {
    this.i = 0;
    this.used = 0;
    this.geo.setDrawRange(0, 0);
  }
}

const teleVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const teleFrag = /* glsl */ `
uniform float progress;
uniform vec3 color;
uniform float shape; // 0 circle, 1 rect
uniform float time;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = shape < 0.5 ? length(p) : max(abs(p.x), abs(p.y));
  float coord = shape < 0.5 ? d : abs(p.y);
  if (shape > 0.5) { d = abs(p.x); coord = (p.y + 1.0) * 0.5; }
  float edge = shape < 0.5 ? smoothstep(0.9, 0.96, d) * smoothstep(1.0, 0.97, d) : smoothstep(0.86, 0.95, d) * smoothstep(1.0, 0.96, d);
  float fill = shape < 0.5 ? step(d, progress) * 0.35 : step(coord, progress) * 0.35 * step(d, 1.0);
  float stripes = step(0.5, fract((vUv.x + vUv.y) * 8.0 - time * 2.0)) * 0.12;
  float inside = shape < 0.5 ? step(d, 1.0) : 1.0;
  float a = (edge + fill + stripes * inside) * inside;
  a *= 0.8 + 0.2 * sin(time * 20.0);
  gl_FragColor = vec4(color * 2.0, a);
}
`;

interface Tele {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  life: number;
  max: number;
  active: boolean;
}

/** Red ground warnings for enemy attacks that fill up before impact. */
export class Telegraphs {
  private pool: Tele[] = [];
  private circleGeo = new THREE.PlaneGeometry(2, 2);
  private time = 0;
  constructor(private scene: THREE.Scene) {}

  private get(): Tele {
    for (const t of this.pool) if (!t.active) return t;
    const mat = new THREE.ShaderMaterial({
      vertexShader: teleVert,
      fragmentShader: teleFrag,
      uniforms: { progress: { value: 0 }, color: { value: new THREE.Color(1, 0.1, 0.1) }, shape: { value: 0 }, time: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.circleGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.layers.set(FX_LAYER);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    const t: Tele = { mesh, mat, life: 0, max: 1, active: false };
    this.pool.push(t);
    return t;
  }

  circle(x: number, z: number, r: number, dur: number, color: THREE.ColorRepresentation = 0xff2020) {
    const t = this.get();
    t.active = true;
    t.life = dur;
    t.max = dur;
    t.mesh.visible = true;
    t.mesh.position.set(x, 0.08, z);
    t.mesh.rotation.set(-Math.PI / 2, 0, 0);
    t.mesh.scale.set(r, r, 1);
    t.mat.uniforms.shape.value = 0;
    (t.mat.uniforms.color.value as THREE.Color).set(color);
    return t;
  }

  /** Rectangle starting at (x,z) extending `len` along heading. */
  line(x: number, z: number, heading: number, len: number, width: number, dur: number, color: THREE.ColorRepresentation = 0xff2020) {
    const t = this.get();
    t.active = true;
    t.life = dur;
    t.max = dur;
    t.mesh.visible = true;
    const cx = x + Math.sin(heading) * len * 0.5, cz = z + Math.cos(heading) * len * 0.5;
    t.mesh.position.set(cx, 0.08, cz);
    t.mesh.rotation.set(-Math.PI / 2, 0, heading + Math.PI);
    t.mesh.scale.set(width * 0.5, len * 0.5, 1);
    t.mat.uniforms.shape.value = 1;
    (t.mat.uniforms.color.value as THREE.Color).set(color);
    return t;
  }

  update(dt: number) {
    this.time += dt;
    for (const t of this.pool) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      t.mat.uniforms.progress.value = 1 - t.life / t.max;
      t.mat.uniforms.time.value = this.time;
    }
  }

  clear() {
    for (const t of this.pool) {
      t.active = false;
      t.mesh.visible = false;
    }
  }
}

/** Expanding shockwave rings on the ground. */
export class Rings {
  private pool: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; r0: number; r1: number; active: boolean }[] = [];
  private geo = new THREE.RingGeometry(0.82, 1, 48);
  constructor(private scene: THREE.Scene) {}
  spawn(x: number, y: number, z: number, r0: number, r1: number, life: number, color: THREE.ColorRepresentation, vertical = false) {
    let p = this.pool.find((q) => !q.active);
    if (!p) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.layers.set(FX_LAYER);
      this.scene.add(mesh);
      p = { mesh, mat, life: 0, max: 1, r0: 1, r1: 1, active: false };
      this.pool.push(p);
    }
    p.active = true;
    p.life = life;
    p.max = life;
    p.r0 = r0;
    p.r1 = r1;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.mesh.rotation.set(vertical ? 0 : -Math.PI / 2, 0, 0);
    p.mat.color.set(color).multiplyScalar(2.5);
  }
  update(dt: number, camPos?: THREE.Vector3) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const t = 1 - p.life / p.max;
      const e = 1 - Math.pow(1 - t, 3);
      const r = p.r0 + (p.r1 - p.r0) * e;
      p.mesh.scale.set(r, r, r);
      p.mat.opacity = 1 - t;
      if (camPos && p.mesh.rotation.x === 0) p.mesh.lookAt(camPos);
    }
  }
  clear() {
    for (const p of this.pool) {
      p.active = false;
      p.mesh.visible = false;
    }
  }
}
