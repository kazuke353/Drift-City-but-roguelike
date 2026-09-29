import * as THREE from 'three';

/** Preloaded raster art (textures sliced from the reference sheets and the asset pack in public/art). */
const base = (import.meta as any).env?.BASE_URL ?? './';
export const artUrl = (name: string) => `${base}art/${name}`;

const COLOR_TEXTURES = ['tex_floor', 'tex_wall', 'tex_metal', 'tex_lava', 'pk_coin', 'pk_sigil', 'pk_skid', 'pk_muzzle', 'pk_impact', 'pk_chest', 'pk_frame_legend'];
const DATA_TEXTURES = ['tex_floor_h', 'tex_wall_h'];

const cache = new Map<string, THREE.Texture>();

function load(name: string, srgb: boolean): Promise<void> {
  return new Promise((resolve) => {
    const ext = name.startsWith('tex_') ? 'webp' : 'webp';
    new THREE.TextureLoader().load(
      artUrl(`${name}.${ext}`),
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = name.startsWith('tex_') ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        t.anisotropy = 8;
        t.needsUpdate = true;
        cache.set(name, t);
        resolve();
      },
      undefined,
      () => resolve(),
    );
  });
}

let started: Promise<void> | null = null;
export function preloadArt(): Promise<void> {
  if (!started) started = Promise.all([...COLOR_TEXTURES.map((n) => load(n, true)), ...DATA_TEXTURES.map((n) => load(n, false))]).then(() => undefined);
  return started;
}

/** Returns a preloaded texture (or a 1x1 fallback if it failed to load). */
export function art(name: string): THREE.Texture {
  const t = cache.get(name);
  if (t) return t;
  const px = new THREE.DataTexture(new Uint8Array([90, 90, 100, 255]), 1, 1, THREE.RGBAFormat);
  px.needsUpdate = true;
  return px;
}
