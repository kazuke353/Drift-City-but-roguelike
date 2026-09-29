import * as THREE from 'three';
import { FX_LAYER } from '../render/Toon';

export interface FlameSpec {
  x: number;
  y: number;
  z: number;
  size: number;
  color: [number, number, number];
  phase: number;
}

const vert = /* glsl */ `
attribute vec3 aPos;
attribute vec2 aData; // size, phase
attribute vec3 aCol;
varying vec2 vUv;
varying float vPhase;
varying vec3 vTint;
void main() {
  vUv = vec2(position.x * 2.0, position.y);
  vPhase = aData.y;
  vTint = aCol;
  // cylindrical billboard: face the camera around the Y axis
  vec3 right = vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]);
  right = normalize(right + vec3(1e-5, 0.0, 0.0));
  float s = aData.x;
  vec3 wp = aPos + right * position.x * s * 1.05 + vec3(0.0, position.y * s * 1.7, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const frag = /* glsl */ `
uniform float time;
varying vec2 vUv;
varying float vPhase;
varying vec3 vTint;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float t = time * 1.9 + vPhase;
  float y = vUv.y;
  float sway = (n(vec2(y * 2.2 - t * 1.6, vPhase)) - 0.5) * 0.9 * y;
  float x = vUv.x - sway;
  float w = pow(max(1.0 - y, 0.0), 0.75) * (0.78 + 0.22 * n(vec2(t * 2.0, vPhase)));
  float d = abs(x) / max(w, 0.001);
  float lick = n(vec2(x * 3.0, y * 3.5 - t * 2.4));
  float body = smoothstep(1.0, 0.55, d + lick * 0.28 * y);
  body *= smoothstep(1.0, 0.72, y + lick * 0.16);
  float heat = clamp(1.0 - y * 0.9 - d * 0.55 + lick * 0.18, 0.0, 1.0);
  vec3 edge = vTint * vTint * vec3(0.9, 0.55, 0.5);
  vec3 hot = mix(vTint, vec3(1.0, 0.95, 0.78), 0.72);
  vec3 c = mix(edge, vTint, smoothstep(0.1, 0.5, heat));
  c = mix(c, hot, smoothstep(0.5, 0.85, heat));
  gl_FragColor = vec4(c * 2.1, body * 0.92);
}
`;

/** Instanced, shader-animated flame billboards (torches, braziers, candles). */
export class FlameField {
  mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(flames: FlameSpec[]) {
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    const n = flames.length;
    const pos = new Float32Array(n * 3), data = new Float32Array(n * 2), col = new Float32Array(n * 3);
    flames.forEach((f, i) => {
      pos.set([f.x, f.y, f.z], i * 3);
      data.set([f.size, f.phase], i * 2);
      const m = Math.max(f.color[0], f.color[1], f.color[2], 0.01);
      col.set([f.color[0] / m, f.color[1] / m, f.color[2] / m], i * 3);
    });
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 2));
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    g.instanceCount = n;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { time: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(FX_LAYER);
    this.mesh.renderOrder = 4;
  }

  update(t: number) {
    this.mat.uniforms.time.value = t;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
