import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { Quality } from '../core/Save';
import { FX_LAYER } from './Toon';

const compositeFrag = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float outlineOn;
uniform float aoOn;
uniform float thickness;
uniform float time;
uniform float speedLines;
uniform float damage;
uniform float lowHp;
uniform float chroma;
uniform float exposure;
uniform float saturation;
uniform float desat;
uniform vec4 flash;
uniform float hatch;
uniform vec3 inkColor;
varying vec2 vUv;

float viewZ(float d) { return (cameraNear * cameraFar) / ((cameraFar - cameraNear) * d - cameraFar); }
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r = length(cc * vec2(resolution.x / resolution.y, 1.0));

  // chromatic aberration
  vec3 col;
  if (chroma > 0.001) {
    vec2 dir = cc * chroma * 0.02;
    col.r = texture2D(tColor, uv + dir).r;
    col.g = texture2D(tColor, uv).g;
    col.b = texture2D(tColor, uv - dir).b;
  } else {
    col = texture2D(tColor, uv).rgb;
  }

  // ---- ink outlines from depth + normals
  if (outlineOn > 0.5) {
    float dRaw = texture2D(tDepth, uv).x;
    float d0 = -viewZ(dRaw);
    vec3 n0 = texture2D(tNormal, uv).xyz * 2.0 - 1.0;
    vec2 px = thickness / resolution;
    float de = 0.0;
    float ne = 0.0;
    float closer = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
      float dn = -viewZ(texture2D(tDepth, uv + o * px).x);
      vec3 nn = texture2D(tNormal, uv + o * px).xyz * 2.0 - 1.0;
      de += d0 - dn;
      closer = max(closer, d0 - dn);
      ne += 1.0 - dot(n0, nn);
    }
    float ndv = clamp(abs(n0.z), 0.05, 1.0);
    float thr = 0.035 * d0 * (1.0 + (1.0 - ndv) * 6.0) + 0.02;
    float depthEdge = smoothstep(thr, thr * 1.6, closer);
    float normalEdge = smoothstep(0.55, 0.95, ne);
    float edge = max(depthEdge, normalEdge * (dRaw < 0.9999 ? 1.0 : 0.0));
    edge *= 1.0 - smoothstep(90.0, 180.0, d0);
    col = mix(col, col * 0.06 + inkColor, edge * 0.92);

    // ---- cheap screen-space ambient occlusion from the depth buffer (grounds props, cars and walls)
    if (aoOn > 0.5 && dRaw < 0.9999) {
      float occ = 0.0;
      float rad = clamp(3.4 / max(d0, 3.0), 0.12, 1.0) * 26.0;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982 + hash2(uv * resolution) * 0.5;
        vec2 o = vec2(cos(a), sin(a)) * (rad * (0.45 + 0.55 * float(i % 2))) / resolution;
        float dn = -viewZ(texture2D(tDepth, uv + o).x);
        float diff = d0 - dn;
        occ += smoothstep(0.35, 1.6, diff) * (1.0 - smoothstep(2.5, 9.0, diff));
      }
      col *= 1.0 - clamp(occ * 0.16, 0.0, 0.5);
    }
  }

  // ---- tone mapping (saturation friendly exponential)
  col = vec3(1.0) - exp(-col * exposure);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, saturation * (1.0 - desat));
  // split-toning: cool blue-teal shadows, warm gold highlights (Borderlands-ish dungeon grade)
  col *= mix(vec3(0.84, 0.94, 1.14), vec3(1.12, 1.0, 0.84), smoothstep(0.12, 0.68, lum));
  // punchy S-curve
  col = clamp(col, 0.0, 1.0);
  col = col * col * (3.0 - 2.0 * col) * 0.5 + col * 0.5;

  // ---- comic hatching in deep shadows
  if (hatch > 0.5) {
    float hl = step(0.62, fract((gl_FragCoord.x + gl_FragCoord.y) / 7.0));
    float hl2 = step(0.62, fract((gl_FragCoord.x - gl_FragCoord.y) / 7.0));
    float dark = smoothstep(0.1, 0.02, lum);
    float darker = smoothstep(0.05, 0.0, lum);
    col *= 1.0 - (hl * dark + hl2 * darker) * 0.45;
  }

  // ---- anime speed lines
  if (speedLines > 0.01) {
    float ang = atan(cc.y, cc.x * resolution.x / resolution.y);
    float ray = floor((ang + 3.14159) / 6.28318 * 110.0);
    float h = hash(ray);
    float h2 = hash(ray * 3.7 + 1.3);
    float along = fract(r * 1.6 - time * (1.8 + h * 2.5) + h2);
    float line = step(0.72, h) * smoothstep(0.0, 0.25, along) * smoothstep(1.0, 0.6, along);
    float mask = smoothstep(0.32, 0.75, r);
    col = mix(col, vec3(1.0), line * mask * speedLines * 0.55);
  }

  // ---- vignettes
  col *= 1.0 - 0.45 * smoothstep(0.45, 1.05, r);
  float pulse = 0.65 + 0.35 * sin(time * 6.0);
  float redAmt = clamp(damage + lowHp * pulse * 0.6, 0.0, 1.0) * smoothstep(0.25, 0.95, r);
  col = mix(col, vec3(0.55, 0.0, 0.04), redAmt);
  col = mix(col, flash.rgb, flash.a);

  // film grain
  col += (hash2(uv * resolution + time * 60.0) - 0.5) * 0.02;

  gl_FragColor = vec4(toSRGB(col), 1.0);
}
`;

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private sceneRT!: THREE.WebGLRenderTarget;
  private normalRT!: THREE.WebGLRenderTarget;
  private postRT!: THREE.WebGLRenderTarget;
  private bloom!: UnrealBloomPass;
  private composite: THREE.ShaderMaterial;
  private compositeQuad: FullScreenQuad;
  private fxaa: THREE.ShaderMaterial;
  private fxaaQuad: FullScreenQuad;
  private normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  quality: Quality = 'high';
  outline = true;
  useBloom = true;
  useFxaa = true;
  width = 1;
  height = 1;
  uniforms: {
    speedLines: { value: number };
    damage: { value: number };
    lowHp: { value: number };
    chroma: { value: number };
    exposure: { value: number };
    saturation: { value: number };
    desat: { value: number };
    flash: { value: THREE.Vector4 };
    time: { value: number };
    inkColor: { value: THREE.Color };
  };
  keyLight: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.3, 420);
    this.camera.layers.enable(FX_LAYER);

    this.composite = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: compositeFrag,
      uniforms: {
        tColor: { value: null },
        tNormal: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: this.camera.near },
        cameraFar: { value: this.camera.far },
        outlineOn: { value: 1 },
        aoOn: { value: 1 },
        thickness: { value: 1 },
        time: { value: 0 },
        speedLines: { value: 0 },
        damage: { value: 0 },
        lowHp: { value: 0 },
        chroma: { value: 0 },
        exposure: { value: 1.5 },
        saturation: { value: 1.22 },
        desat: { value: 0 },
        flash: { value: new THREE.Vector4(1, 1, 1, 0) },
        hatch: { value: 1 },
        inkColor: { value: new THREE.Color(0x0a0608) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.uniforms = this.composite.uniforms as any;
    this.compositeQuad = new FullScreenQuad(this.composite);
    this.fxaa = new THREE.ShaderMaterial({
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      depthTest: false,
      depthWrite: false,
    });
    this.fxaaQuad = new FullScreenQuad(this.fxaa);

    this.hemi = new THREE.HemisphereLight(0x8090c0, 0x302018, 0.9);
    this.scene.add(this.hemi);
    this.keyLight = new THREE.DirectionalLight(0xfff0dd, 1.3);
    this.keyLight.position.set(30, 60, 20);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    const sc = this.keyLight.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 160;
    this.keyLight.shadow.bias = -0.0008;
    this.keyLight.shadow.normalBias = 0.04;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.createTargets(1, 1);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private createTargets(w: number, h: number) {
    this.sceneRT?.dispose();
    this.normalRT?.dispose();
    this.postRT?.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
    const depthTex = new THREE.DepthTexture(w, h);
    depthTex.type = THREE.UnsignedIntType;
    this.normalRT = new THREE.WebGLRenderTarget(w, h, { depthTexture: depthTex, depthBuffer: true });
    this.postRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
    this.postRT.texture.minFilter = THREE.LinearFilter;
    if (this.bloom) this.bloom.dispose();
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.85, 0.55, 0.92);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.outline = q !== 'low';
    this.useBloom = q !== 'low';
    this.useFxaa = q === 'high';
    this.renderer.shadowMap.enabled = q !== 'low';
    this.keyLight.castShadow = q !== 'low';
    this.keyLight.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    this.keyLight.shadow.map?.dispose();
    (this.keyLight.shadow as any).map = null;
    this.uniforms && ((this.composite.uniforms.hatch.value = q === 'low' ? 0 : 1));
    this.resize();
  }

  resize() {
    const dprCap = this.quality === 'high' ? 1.75 : this.quality === 'medium' ? 1.25 : 0.85;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const bw = Math.max(1, Math.floor(w * dpr)), bh = Math.max(1, Math.floor(h * dpr));
    this.width = bw;
    this.height = bh;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.createTargets(bw, bh);
    this.composite.uniforms.resolution.value.set(bw, bh);
    this.composite.uniforms.thickness.value = Math.max(1.3, bh / 620);
    this.fxaa.uniforms.resolution.value.set(1 / bw, 1 / bh);
  }

  setFog(color: THREE.ColorRepresentation, near: number, far: number) {
    this.scene.fog = new THREE.Fog(color, near, far);
    this.scene.background = new THREE.Color(color);
  }

  stats = { calls: 0, tris: 0 };

  render(time: number) {
    const r = this.renderer;
    r.info.autoReset = false;
    r.info.reset();
    const u = this.composite.uniforms;
    u.time.value = time;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;

    // 1) colour pass (HDR)
    r.shadowMap.needsUpdate = true;
    this.camera.layers.enableAll();
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, this.camera);

    this.stats.calls = r.info.render.calls;
    this.stats.tris = r.info.render.triangles;
    // 2) normal + depth pass for ink lines (opaque layer only)
    if (this.outline) {
      const bg = this.scene.background;
      const fog = this.scene.fog;
      this.scene.background = null;
      this.scene.fog = null;
      this.scene.overrideMaterial = this.normalMat;
      this.camera.layers.set(0);
      const oldClear = r.getClearColor(new THREE.Color());
      const oldAlpha = r.getClearAlpha();
      r.setClearColor(0x8080ff, 1);
      r.setRenderTarget(this.normalRT);
      r.clear();
      r.render(this.scene, this.camera);
      r.setClearColor(oldClear, oldAlpha);
      this.scene.overrideMaterial = null;
      this.scene.background = bg;
      this.scene.fog = fog;
      this.camera.layers.enableAll();
    }

    // 3) bloom, blended back into the HDR colour target
    if (this.useBloom) this.bloom.render(r, null as any, this.sceneRT, 0, false);

    // 4) composite: outlines, tonemap, grading, speed lines
    u.tColor.value = this.sceneRT.texture;
    u.tNormal.value = this.normalRT.texture;
    u.tDepth.value = this.normalRT.depthTexture;
    u.outlineOn.value = this.outline ? 1 : 0;
    u.aoOn.value = this.quality === 'high' ? 1 : 0;
    if (this.useFxaa) {
      r.setRenderTarget(this.postRT);
      this.compositeQuad.render(r);
      this.fxaa.uniforms.tDiffuse.value = this.postRT.texture;
      r.setRenderTarget(null);
      this.fxaaQuad.render(r);
    } else {
      r.setRenderTarget(null);
      this.compositeQuad.render(r);
    }
  }

  /** Point the shadow camera at the action. */
  followShadow(x: number, z: number) {
    const snap = 2;
    const sx = Math.round(x / snap) * snap, sz = Math.round(z / snap) * snap;
    this.keyLight.position.set(sx + 22, 70, sz + 30);
    this.keyLight.target.position.set(sx, 0, sz);
    this.keyLight.target.updateMatrixWorld();
  }
}
