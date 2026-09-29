import * as THREE from 'three';

/**
 * Global low-resolution "light map" of the current dungeon (baked torch / crystal / lava light on the
 * floor plane). Every toon material samples it by world XZ so cars, enemies, props and bosses pick up
 * the same coloured pools of light as the walls and floor.
 */
export const lightMapUniforms = {
  tLightMap: { value: null as THREE.Texture | null },
  uLMRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uLMOn: { value: 0 },
};

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
blank.needsUpdate = true;
lightMapUniforms.tLightMap.value = blank;

export const LM_SCALE = 3; // stored value = light / LM_SCALE

export function setLightMap(tex: THREE.Texture | null, x0: number, z0: number, w: number, h: number) {
  lightMapUniforms.tLightMap.value = tex ?? blank;
  lightMapUniforms.uLMRect.value.set(x0, z0, 1 / w, 1 / h);
  lightMapUniforms.uLMOn.value = tex ? 1 : 0;
}

/** Patch a MeshToonMaterial's shader so it adds light-map lighting (as emissive * albedo). */
export function injectLightMap(sh: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }, strength = 0.9) {
  sh.uniforms.tLightMap = lightMapUniforms.tLightMap;
  sh.uniforms.uLMRect = lightMapUniforms.uLMRect;
  sh.uniforms.uLMOn = lightMapUniforms.uLMOn;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLmPos;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 lmw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        lmw = instanceMatrix * lmw;
        #endif
        vLmPos = (modelMatrix * lmw).xyz;
      }`,
    );
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLmPos;\nuniform sampler2D tLightMap;\nuniform vec4 uLMRect;\nuniform float uLMOn;')
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      if (uLMOn > 0.5) {
        vec2 lmUv = (vLmPos.xz - uLMRect.xy) * uLMRect.zw;
        vec3 lmC = texture2D(tLightMap, lmUv).rgb * ${LM_SCALE.toFixed(1)};
        lmC = lmC / (1.0 + lmC * 0.55);
        totalEmissiveRadiance += diffuseColor.rgb * lmC * ${strength.toFixed(3)};
      }`,
    );
}
