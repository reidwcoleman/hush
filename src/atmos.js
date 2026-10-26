// Shared air: the height fog / aerial perspective every material is patched with, and a tileable
// noise texture the shaders sample (period 256 px so the floating-origin shifts never show).
import * as THREE from 'three';

export const AT = {
  uFogCol: { value: new THREE.Color(0.7, 0.75, 0.82) },
  uFogSun: { value: new THREE.Color(1.0, 0.8, 0.6) },
  uSunDir: { value: new THREE.Vector3(0.3, 0.4, 0.8).normalize() },
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  uFogA: { value: 0.00045 },
  uFogB: { value: 1 / 160 },
  uFogBase: { value: 0 },
  uHaze: { value: 0.00004 },
  uTime: { value: 0 },
  uNoise: { value: null },
  uNight: { value: 0 },
};

function periodicValueNoise(size, period, seed) {
  const lat = new Float32Array(period * period);
  let s = seed;
  for (let i = 0; i < lat.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; lat[i] = s / 4294967296; }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * period, fy = (y / size) * period;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = lat[(iy % period) * period + (ix % period)], b = lat[(iy % period) * period + ((ix + 1) % period)];
    const c = lat[((iy + 1) % period) * period + (ix % period)], d = lat[((iy + 1) % period) * period + ((ix + 1) % period)];
    out[y * size + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  return out;
}

export function makeNoiseTexture() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const bases = [4, 8, 16, 32];
  for (let ch = 0; ch < 4; ch++) {
    const acc = new Float32Array(S * S);
    let amp = 1, norm = 0;
    for (let o = 0; o < 4; o++) {
      const per = bases[ch] << o;
      if (per > S) break;
      const n = periodicValueNoise(S, per, 1234 + ch * 97 + o * 13);
      for (let i = 0; i < acc.length; i++) acc[i] += n[i] * amp;
      norm += amp; amp *= 0.5;
    }
    for (let i = 0; i < acc.length; i++) data[i * 4 + ch] = Math.max(0, Math.min(255, Math.round((acc[i] / norm) * 255)));
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  AT.uNoise.value = t;
  return t;
}

export const FOG_GLSL = /* glsl */ `
uniform vec3 uFogCol, uFogSun, uSunDir;
uniform float uFogA, uFogB, uFogBase, uHaze;
vec3 atmosFog(vec3 col, vec3 wp) {
  vec3 ro = cameraPosition;
  vec3 dv = wp - ro;
  float t = length(dv);
  vec3 rd = dv / max(t, 1e-3);
  float q = rd.y * uFogB;
  float roY = ro.y - uFogBase;
  float amt = uFogA * exp(-uFogB * roY) * (abs(q) < 1e-5 ? t : (1.0 - exp(-t * q)) / q);
  amt += t * uHaze;
  float tr = exp(-amt);
  float sa = max(dot(rd, uSunDir), 0.0);
  vec3 fc = mix(uFogCol, uFogSun, pow(sa, 5.0) * 0.85);
  return mix(fc, col, tr);
}
`;

// height fog + aerial perspective on any built-in material
export function patchAtmos(shader) {
  Object.assign(shader.uniforms, {
    uFogCol: AT.uFogCol, uFogSun: AT.uFogSun, uSunDir: AT.uSunDir, uFogA: AT.uFogA, uFogB: AT.uFogB,
    uFogBase: AT.uFogBase, uHaze: AT.uHaze,
  });
  if (!shader.vertexShader.includes('varying vec3 vAtW;')) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAtW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 atw = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  atw = instanceMatrix * atw;
#endif
  vAtW = ( modelMatrix * atw ).xyz;
}`);
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vAtW;\n' + FOG_GLSL)
    .replace('#include <fog_fragment>', 'gl_FragColor.rgb = atmosFog( gl_FragColor.rgb, vAtW );');
}

// for materials with no other patch
export function atmosMaterial(m, extra) {
  m.onBeforeCompile = (sh) => { patchAtmos(sh); extra?.(sh); };
  return m;
}
