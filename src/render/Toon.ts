import * as THREE from 'three';

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
export function bakedToon(map: THREE.Texture | null, color: THREE.ColorRepresentation = 0xffffff, extraEmissive?: { color: THREE.ColorRepresentation; intensity: number }) {
  const m = new THREE.MeshToonMaterial({ color, map, gradientMap: toonRamp });
  if (extraEmissive) {
    m.emissive = new THREE.Color(extraEmissive.color);
    m.emissiveIntensity = extraEmissive.intensity;
  }
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 baked;\nvarying vec3 vBaked;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBaked = baked;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBaked;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float bl = max(max(vBaked.r, vBaked.g), vBaked.b);
        float q = bl > 0.001 ? (floor(bl * 4.0 + 0.35) / 4.0) / bl : 0.0;
        totalEmissiveRadiance += diffuseColor.rgb * vBaked * mix(1.0, q, 0.65);`,
      );
  };
  m.customProgramCacheKey = () => 'bakedToon';
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
export function rimToon(color: THREE.ColorRepresentation, rim: THREE.ColorRepresentation, opts: ToonOpts & { rimStrength?: number; rimWidth?: number } = {}): THREE.MeshToonMaterial {
  const rc = new THREE.Color(rim).multiplyScalar(0.42 * (opts.rimStrength ?? 1));
  const width = opts.rimWidth ?? 0.66;
  const key = `r|${new THREE.Color(color).getHexString()}|${rc.getHexString()}|${width}|${opts.emissive !== undefined ? new THREE.Color(opts.emissive).getHexString() : ''}|${opts.emissiveIntensity ?? ''}|${opts.map?.uuid ?? ''}|${opts.side ?? ''}|${opts.transparent ?? ''}|${opts.vertexColors ?? ''}`;
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
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
      totalEmissiveRadiance += ${vec} * smoothstep(${lo}, ${hi}, rimF);`,
    );
  };
  m.customProgramCacheKey = () => 'rim' + vec + lo;
  cache.set(key, m);
  return m;
}
