import * as THREE from 'three';
import { injectLightMap } from './LightMap';
import { detailTexture, type DetailKind } from './DetailTex';

/** Layer used for objects that should NOT get ink outlines (particles, beams, UI-ish meshes). */
export const FX_LAYER = 1;

function makeGradient(steps: number[]) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    const c = Math.round(v * 255);
    data[i * 4] = c;
    data[i * 4 + 1] = c;
    data[i * 4 + 2] = c;
    data[i * 4 + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Three-band cel shading ramp (shadow / mid / lit). */
export const toonRamp = makeGradient([0.28, 0.62, 1.0]);
/** Harsher two-tone ramp for characters. */
export const toonRamp2 = makeGradient([0.38, 1.0]);

const cache = new Map<string, THREE.Material>();

export interface ToonOpts {
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  map?: THREE.Texture | null;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  ramp?: 2 | 3;
  vertexColors?: boolean;
  flat?: boolean;
}

export function toon(color: THREE.ColorRepresentation, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = `t|${new THREE.Color(color).getHexString()}|${opts.emissive !== undefined ? new THREE.Color(opts.emissive).getHexString() : ''}|${opts.emissiveIntensity ?? ''}|${opts.map?.uuid ?? ''}|${opts.transparent ?? ''}|${opts.opacity ?? ''}|${opts.side ?? ''}|${opts.ramp ?? 3}|${opts.vertexColors ?? ''}|${opts.flat ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshToonMaterial;
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: opts.ramp === 2 ? toonRamp2 : toonRamp,
    map: opts.map ?? null,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: opts.vertexColors ?? false,
  });
  if (opts.flat) (m as any).flatShading = true;
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  m.onBeforeCompile = (sh) => injectLightMap(sh);
  m.customProgramCacheKey = () => 'toonLM';
  cache.set(key, m);
  return m;
}

/** Unlit glowing material (for bloom). Intensity > 1 pushes into HDR so it blooms. */
export function glow(color: THREE.ColorRepresentation, intensity = 2.5, opts: { transparent?: boolean; opacity?: number; additive?: boolean; side?: THREE.Side; depthWrite?: boolean } = {}) {
  const key = `g|${new THREE.Color(color).getHexString()}|${intensity}|${opts.transparent ?? ''}|${opts.opacity ?? ''}|${opts.additive ?? ''}|${opts.side ?? ''}|${opts.depthWrite ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshBasicMaterial;
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const m = new THREE.MeshBasicMaterial({
    color: c,
    transparent: opts.transparent ?? !!opts.additive,
    opacity: opts.opacity ?? 1,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: opts.depthWrite ?? !opts.additive,
    side: opts.side ?? THREE.FrontSide,
    toneMapped: false,
  });
  cache.set(key, m);
  return m;
}

/**
 * Environment material with baked lighting: a per-vertex `baked` attribute (rgb light)
 * is added as emissive * albedo and quantized for a cel-shaded look.
 */
export interface BakedOpts {
  bump?: THREE.Texture | null;
  bumpScale?: number;
  /** world-space low-frequency mottling that breaks up texture tiling */
  mottle?: number;
  /** ramp stops for the baked light quantiser */
  bands?: number;
  /** wet-floor glancing sheen strength (reflects the baked light pools) */
  sheen?: number;
}

export function bakedToon(map: THREE.Texture | null, color: THREE.ColorRepresentation = 0xffffff, extraEmissive?: { color: THREE.ColorRepresentation; intensity: number }, opts: BakedOpts = {}) {
  const m = new THREE.MeshToonMaterial({ color, map, gradientMap: toonRamp });
  if (opts.bump) {
    m.bumpMap = opts.bump;
    m.bumpScale = opts.bumpScale ?? 1.5;
  }
  if (extraEmissive) {
    m.emissive = new THREE.Color(extraEmissive.color);
    m.emissiveIntensity = extraEmissive.intensity;
  }
  const mottle = (opts.mottle ?? 0).toFixed(3);
  const bands = (opts.bands ?? 4).toFixed(1);
  const sheen = (opts.sheen ?? 0).toFixed(3);
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 baked;\nvarying vec3 vBaked;\nvarying vec3 vWp;\nvarying float vUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBaked = baked;\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;\nvUp = abs(normalize(mat3(modelMatrix) * normal).y);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBaked;
varying vec3 vWp;
varying float vUp;
float bh21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bn2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(bh21(i), bh21(i + vec2(1.0, 0.0)), f.x), mix(bh21(i + vec2(0.0, 1.0)), bh21(i + vec2(1.0, 1.0)), f.x), f.y); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        ${opts.mottle ? `{
          vec2 mp = vUp > 0.5 ? vWp.xz : vec2(vWp.x + vWp.z, vWp.y);
          float mo = bn2(mp * 0.11) * 0.6 + bn2(mp * 0.37 + 7.0) * 0.4;
          diffuseColor.rgb *= 1.0 - ${mottle} + ${mottle} * 2.0 * mo;
        }` : ''}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float bl = max(max(vBaked.r, vBaked.g), vBaked.b);
        float q = bl > 0.001 ? (floor(bl * ${bands} + 0.35) / ${bands}) / bl : 0.0;
        totalEmissiveRadiance += diffuseColor.rgb * vBaked * mix(1.0, q, 0.65);
        ${opts.sheen ? `{
          float sv = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          float wet = pow(sv, 3.0) * ${sheen};
          float pat = 0.35 + 0.65 * bn2(vWp.xz * 0.23 + 3.1);
          totalEmissiveRadiance += (vBaked * 1.0 + vec3(0.02, 0.025, 0.04)) * wet * pat * 0.9;
        }` : ''}`,
      );
  };
  m.customProgramCacheKey = () => `bakedToon|${opts.bump ? 'b' : ''}|${mottle}|${bands}|${sheen}`;
  return m;
}

export function setLayerRecursive(obj: THREE.Object3D, layer: number) {
  obj.traverse((o) => o.layers.set(layer));
}

export function enableShadows(obj: THREE.Object3D, cast = true, receive = true) {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}

/**
 * Toon material with a hard cel "rim light" on silhouettes — makes characters pop
 * off dark dungeon backgrounds (Borderlands-style inked highlight).
 */
export interface DetailOpts {
  kind: DetailKind;
  /** object-space tiles per unit */
  scale?: number;
  /** contrast of the grit (0..1.5) */
  strength?: number;
  /** emissive colour of the crack/vein mask (needs a kind that produces one, e.g. rock) */
  glow?: THREE.ColorRepresentation;
  glowIntensity?: number;
}

export function rimToon(color: THREE.ColorRepresentation, rim: THREE.ColorRepresentation, opts: ToonOpts & { rimStrength?: number; rimWidth?: number; detail?: DetailOpts } = {}): THREE.MeshToonMaterial {
  const rc = new THREE.Color(rim).multiplyScalar(0.42 * (opts.rimStrength ?? 1));
  const width = opts.rimWidth ?? 0.66;
  const dt = opts.detail ? detailTexture(opts.detail.kind) : null;
  const dkey = opts.detail ? `${opts.detail.kind}|${opts.detail.scale ?? 1}|${opts.detail.strength ?? 1}|${opts.detail.glow !== undefined ? new THREE.Color(opts.detail.glow).getHexString() : ''}|${opts.detail.glowIntensity ?? 1}` : '';
  const key = `r|${dkey}|${new THREE.Color(color).getHexString()}|${rc.getHexString()}|${width}|${opts.emissive !== undefined ? new THREE.Color(opts.emissive).getHexString() : ''}|${opts.emissiveIntensity ?? ''}|${opts.map?.uuid ?? ''}|${opts.side ?? ''}|${opts.transparent ?? ''}|${opts.vertexColors ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshToonMaterial;
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: opts.ramp === 2 ? toonRamp2 : toonRamp,
    map: opts.map ?? null,
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    alphaTest: opts.transparent ? 0 : opts.map && opts.map.userData?.alpha ? 0.5 : 0,
    vertexColors: opts.vertexColors ?? false,
  });
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  const vec = `vec3(${rc.r.toFixed(4)}, ${rc.g.toFixed(4)}, ${rc.b.toFixed(4)})`;
  const lo = width.toFixed(3), hi = (width + 0.06).toFixed(3);
  const dScale = (opts.detail?.scale ?? 1).toFixed(3);
  const dStr = (opts.detail?.strength ?? 1).toFixed(3);
  const gcol = opts.detail?.glow !== undefined ? new THREE.Color(opts.detail.glow) : null;
  const gI = (opts.detail?.glowIntensity ?? 1).toFixed(3);
  m.onBeforeCompile = (sh) => {
    injectLightMap(sh, 0.55);
    if (dt) {
      sh.uniforms.tDetail = { value: dt.color };
      sh.uniforms.tDetailMask = { value: dt.mask ?? dt.color };
      sh.uniforms.uDetailTime = { value: 0 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDP;\nvarying vec3 vDN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDP = position;\nvDN = objectNormal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDP;\nvarying vec3 vDN;\nuniform sampler2D tDetail;\nuniform sampler2D tDetailMask;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec3 dAn = pow(abs(normalize(vDN)), vec3(4.0));
          dAn /= (dAn.x + dAn.y + dAn.z + 1e-4);
          vec2 dUx = vDP.zy * ${dScale}, dUy = vDP.xz * ${dScale}, dUz = vDP.xy * ${dScale};
          float dV = texture2D(tDetail, dUx).r * dAn.x + texture2D(tDetail, dUy).r * dAn.y + texture2D(tDetail, dUz).r * dAn.z;
          diffuseColor.rgb *= mix(1.0, dV * 2.0, ${dStr});
          float dM = ${gcol ? 'texture2D(tDetailMask, dUx).r * dAn.x + texture2D(tDetailMask, dUy).r * dAn.y + texture2D(tDetailMask, dUz).r * dAn.z' : '0.0'};`,
        );
    }
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
      totalEmissiveRadiance += ${vec} * smoothstep(${lo}, ${hi}, rimF);
      ${dt && gcol ? `totalEmissiveRadiance += vec3(${gcol.r.toFixed(3)}, ${gcol.g.toFixed(3)}, ${gcol.b.toFixed(3)}) * ${gI} * smoothstep(0.55, 0.92, dM);` : ''}`,
    );
  };
  m.customProgramCacheKey = () => 'rimLM' + vec + lo + dkey + (gcol ? 'g' : '');
  cache.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Glossy cel-shaded "car paint" / metal materials: triplanar livery map, banded environment
// reflection, a hard specular blob, and a silhouette rim light.
// ---------------------------------------------------------------------------------------------

export interface PaintOpts {
  /** livery map, projected triplanar in object space */
  map?: THREE.Texture | null;
  /** object-space units covered by one tile of the map */
  tile?: number;
  /** environment reflection strength (0..1) */
  refl?: number;
  /** specular blob threshold on N.H (higher = smaller blob), 0 disables */
  spec?: number;
  specStrength?: number;
  rim?: THREE.ColorRepresentation;
  rimStrength?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  side?: THREE.Side;
  ramp?: 2 | 3;
  /** horizon tint of the fake environment (torch glow) */
  env?: THREE.ColorRepresentation;
}

const paintCache = new Map<string, THREE.MeshToonMaterial>();

export function paintToon(color: THREE.ColorRepresentation, o: PaintOpts = {}): THREE.MeshToonMaterial {
  const c = new THREE.Color(color);
  const rim = new THREE.Color(o.rim ?? 0xffffff).multiplyScalar(o.rimStrength ?? 0);
  const env = new THREE.Color(o.env ?? 0xff8a3a);
  const key = `p|${c.getHexString()}|${o.map?.uuid ?? ''}|${o.tile ?? 3}|${o.refl ?? 0.5}|${o.spec ?? 0.985}|${o.specStrength ?? 0.8}|${rim.getHexString()}|${env.getHexString()}|${o.emissive !== undefined ? new THREE.Color(o.emissive).getHexString() : ''}|${o.emissiveIntensity ?? ''}|${o.side ?? ''}|${o.ramp ?? 3}`;
  const hit = paintCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshToonMaterial({ color: c, map: o.map ?? null, gradientMap: o.ramp === 2 ? toonRamp2 : toonRamp, side: o.side ?? THREE.FrontSide });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  const f = (v: number) => v.toFixed(4);
  const refl = f(o.refl ?? 0.5);
  const spec = o.spec ?? 0.985;
  const specS = f(o.specStrength ?? 0.8);
  const tile = f(1 / (o.tile ?? 3));
  const rimV = `vec3(${f(rim.r)}, ${f(rim.g)}, ${f(rim.b)})`;
  const envV = `vec3(${f(env.r)}, ${f(env.g)}, ${f(env.b)})`;
  const hasMap = !!o.map;
  m.onBeforeCompile = (sh) => {
    injectLightMap(sh, 1.0);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOPos;\nvarying vec3 vONrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOPos = position;\nvONrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vOPos;
varying vec3 vONrm;
vec3 paintEnv(vec3 r) {
  float y = r.y;
  vec3 sky = mix(vec3(0.16, 0.14, 0.26), vec3(0.06, 0.1, 0.28), smoothstep(0.0, 0.9, y));
  vec3 col = y > 0.0 ? sky : vec3(0.03, 0.025, 0.03);
  col += ${envV} * 1.6 * smoothstep(0.16, 0.0, abs(y - 0.06));
  float az = atan(r.z, r.x);
  col += vec3(0.55, 0.7, 1.0) * step(0.9, sin(az * 3.0 + y * 4.0)) * step(0.15, y) * 0.85;
  col += vec3(1.0, 0.95, 0.85) * step(0.94, sin(az * 5.0 - 1.3)) * step(0.35, y) * 0.9;
  return floor(col * 6.0) / 6.0;
}`,
      );
    if (hasMap) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `{
  vec3 an = pow(abs(normalize(vONrm)), vec3(5.0));
  an /= (an.x + an.y + an.z + 1e-4);
  vec3 op = vOPos * ${tile} + 0.5;
  vec4 tx = texture2D(map, op.zy);
  vec4 ty = texture2D(map, op.xz);
  vec4 tz = texture2D(map, op.xy);
  diffuseColor *= tx * an.x + ty * an.y + tz * an.z;
}`,
      );
    }
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
  vec3 Vv = normalize(vViewPosition);
  vec3 Nv = normalize(normal);
  float ndv = clamp(dot(Nv, Vv), 0.0, 1.0);
  float lit = clamp(dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.3333)), 0.0, 1.0);
  float litK = 0.35 + 0.65 * smoothstep(0.03, 0.4, lit);
  vec3 Rw = inverseTransformDirection(reflect(-Vv, Nv), viewMatrix);
  float fres = 0.22 + 0.78 * pow(1.0 - ndv, 3.0);
  outgoingLight += min(paintEnv(Rw) * 0.75, vec3(0.8)) * fres * ${refl} * litK;
  ${spec > 0 ? `
  vec3 Lv = normalize((viewMatrix * vec4(normalize(vec3(0.45, 0.85, 0.35)), 0.0)).xyz);
  float sp = dot(Nv, normalize(Lv + Vv));
  outgoingLight += vec3(0.95, 0.92, 0.85) * step(${spec.toFixed(4)}, sp) * ${specS} * 0.7 * litK;` : ''}
  outgoingLight += ${rimV} * smoothstep(0.6, 0.68, 1.0 - ndv) * litK;
}
#include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => key;
  paintCache.set(key, m);
  return m;
}

/** Dark, sharply reflective cel metal (armour plates, barrels, exhausts). */
export function metalToon(color: THREE.ColorRepresentation, o: Omit<PaintOpts, 'refl' | 'spec'> & { refl?: number; spec?: number } = {}) {
  return paintToon(color, { refl: 0.85, spec: 0.972, specStrength: 0.9, rim: 0x9ab4ff, rimStrength: 0.22, ...o });
}

// ---------------------------------------------------------------------------------------------
// World-space triplanar stone: props (pilasters, statues, ribs, arches) share the exact brick/slab
// texture of the walls so the dungeon reads as one continuous structure.
// ---------------------------------------------------------------------------------------------
const stoneCache = new Map<string, THREE.MeshToonMaterial>();

export function stoneToon(tex: THREE.Texture, tint: THREE.ColorRepresentation, o: { scale?: number; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; bump?: THREE.Texture | null } = {}): THREE.MeshToonMaterial {
  const c = new THREE.Color(tint);
  const key = `s|${tex.uuid}|${c.getHexString()}|${o.scale ?? 15}|${o.emissive !== undefined ? new THREE.Color(o.emissive).getHexString() : ''}|${o.emissiveIntensity ?? ''}`;
  const hit = stoneCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshToonMaterial({ color: c, map: tex, gradientMap: toonRamp });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  const inv = (1 / (o.scale ?? 15)).toFixed(5);
  m.onBeforeCompile = (sh) => {
    injectLightMap(sh, 1.0);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSP;\nvarying vec3 vSN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 sp4 = vec4(transformed, 1.0);
          vec3 sn3 = objectNormal;
          #ifdef USE_INSTANCING
          sp4 = instanceMatrix * sp4;
          sn3 = mat3(instanceMatrix) * sn3;
          #endif
          vSP = (modelMatrix * sp4).xyz;
          vSN = normalize(mat3(modelMatrix) * sn3);
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSP;\nvarying vec3 vSN;')
      .replace(
        '#include <map_fragment>',
        `{
          vec3 an = pow(abs(normalize(vSN)), vec3(4.0));
          an /= (an.x + an.y + an.z + 1e-4);
          vec3 tc = texture2D(map, vSP.zy * ${inv}).rgb * an.x + texture2D(map, vSP.xz * ${inv}).rgb * an.y + texture2D(map, vSP.xy * ${inv}).rgb * an.z;
          diffuseColor.rgb *= tc;
        }`,
      );
  };
  m.customProgramCacheKey = () => `stoneToon|${inv}`;
  stoneCache.set(key, m);
  return m;
}
