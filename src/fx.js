// Snow in the air: the spray off the skis (backlit by the sun), ski tracks pressed into the
// snow, falling snow and the glittering diamond dust of a cold clear day.
import * as THREE from 'three';
import { AT, FOG_GLSL } from './atmos.js';

const SPRAY_VERT = /* glsl */ `
attribute float aSize; attribute float aLife; attribute float aSeed;
varying float vLife; varying float vSeed; varying vec3 vW;
uniform float uScale;
void main() {
  vLife = aLife; vSeed = aSeed;
  vec4 w = modelMatrix * vec4( position, 1.0 );
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  gl_Position = projectionMatrix * mv;
  float grow = 1.0 + ( 1.0 - aLife ) * 4.0;
  gl_PointSize = aSize * grow * uScale / max( 0.5, -mv.z );
}`;
const SPRAY_FRAG = /* glsl */ `
varying float vLife; varying float vSeed; varying vec3 vW;
uniform sampler2D uDot; uniform vec3 uSunCol, uAmb;
${FOG_GLSL}
void main() {
  if ( vLife <= 0.0 ) discard;
  vec4 t = texture2D( uDot, gl_PointCoord );
  vec3 V = normalize( vW - cameraPosition );
  float fwd = pow( max( dot( V, uSunDir ), 0.0 ), 6.0 );
  vec3 col = uAmb * 0.9 + uSunCol * ( 0.18 + 1.6 * fwd );
  float a = t.a * smoothstep( 0.0, 0.6, vLife ) * 0.15 * ( 0.6 + 0.4 * vSeed );
  gl_FragColor = vec4( atmosFog( col, vW ), a );
}`;

export class Spray {
  constructor(scene, dot, max = 5000) {
    this.max = max;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.decay = new Float32Array(max);
    this.size = new Float32Array(max);
    this.seed = new Float32Array(max);
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    for (let i = 0; i < max; i++) this.seed[i] = Math.random();
    this.uAmb = { value: new THREE.Color(0.6, 0.7, 0.85) };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SPRAY_VERT, fragmentShader: SPRAY_FRAG, transparent: true, depthWrite: false,
      uniforms: {
        uDot: { value: dot }, uSunCol: AT.uSunCol, uAmb: this.uAmb, uScale: { value: 400 },
        uFogCol: AT.uFogCol, uFogSun: AT.uFogSun, uSunDir: AT.uSunDir, uFogA: AT.uFogA, uFogB: AT.uFogB, uFogBase: AT.uFogBase, uHaze: AT.uHaze,
      },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, spread, n, size = 0.25, life = 1.2) {
    for (let k = 0; k < n; k++) {
      const i = this.i; this.i = (this.i + 1) % this.max;
      this.p[i * 3] = x + (Math.random() - 0.5) * 0.3;
      this.p[i * 3 + 1] = y + Math.random() * 0.1;
      this.p[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
      this.v[i * 3] = vx + (Math.random() - 0.5) * spread;
      this.v[i * 3 + 1] = vy + Math.random() * spread * 0.7;
      this.v[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      this.life[i] = 1;
      this.decay[i] = 1 / (life * (0.6 + Math.random() * 0.8));
      this.size[i] = size * (0.5 + Math.random());
    }
  }

  update(dt, ground) {
    const p = this.p, v = this.v;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= this.decay[i] * dt;
      const o = i * 3;
      v[o + 1] -= 4.5 * dt;
      const k = Math.exp(-2.4 * dt);
      v[o] *= k; v[o + 1] *= k; v[o + 2] *= k;
      p[o] += v[o] * dt; p[o + 1] += v[o + 1] * dt; p[o + 2] += v[o + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aLife.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }

  shift(d) {
    for (let i = 0; i < this.max; i++) { this.p[i * 3] -= d.x; this.p[i * 3 + 1] -= d.y; this.p[i * 3 + 2] -= d.z; }
  }
}

// ski tracks: a ribbon per ski, pressed grooves lit like the snow around them
export class Tracks {
  constructor(scene, max = 3000) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.uv = new Float32Array(max * 4 * 2);
    this.age = new Float32Array(max * 4);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const a = i * 4;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aDepth', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.geo = g;
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.76, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aDepth; varying float vDepth; varying vec2 vTUv; varying vec3 vTW2;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvDepth = aDepth; vTUv = uv; vTW2 = ( modelMatrix * vec4( position, 1.0 ) ).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vDepth; varying vec2 vTUv; varying vec3 vTW2;\n' + FOG_GLSL)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
{
  // across the ribbon: a rounded groove, walls catching the light on one side
  float u = vTUv.x * 2.0 - 1.0;
  vec3 up = vec3( 0.0, 1.0, 0.0 );
  vec3 dx = dFdx( vTW2 ), dy = dFdy( vTW2 );
  vec3 Nw = normalize( cross( dx, dy ) ); if ( Nw.y < 0.0 ) Nw = -Nw;
  // the across direction from the uv's screen gradient
  vec3 acr = normalize( dx * dFdx( vTUv.x ) + dy * dFdy( vTUv.x ) + vec3( 1e-6 ) );
  float tilt = -u * ( 0.5 + 1.6 * vDepth );
  vec3 Ng = normalize( Nw + acr * tilt );
  normal = normalize( ( viewMatrix * vec4( Ng, 0.0 ) ).xyz );
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
float uu = abs( vTUv.x * 2.0 - 1.0 );
diffuseColor.rgb *= mix( 0.74, 0.93, uu * uu );
diffuseColor.a = smoothstep( 1.0, 0.7, uu ) * min( 1.0, 0.55 + vDepth );`)
        .replace('#include <fog_fragment>', 'gl_FragColor.rgb = atmosFog( gl_FragColor.rgb, vTW2 );');
      Object.assign(sh.uniforms, { uFogCol: AT.uFogCol, uFogSun: AT.uFogSun, uSunDir: AT.uSunDir, uFogA: AT.uFogA, uFogB: AT.uFogB, uFogBase: AT.uFogBase, uHaze: AT.uHaze });
    };
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.n = 0;
    this.last = { L: null, R: null };
    this.dirtyLo = Infinity; this.dirtyHi = -1;
  }

  // add a segment from the last point of this ski to (a) — a and b are the groove's edges
  add(side, l, r, depth) {
    const last = this.last[side];
    this.last[side] = { l: l.clone(), r: r.clone(), depth };
    if (!last) return;
    const i = this.n % this.max; this.n++;
    const P = this.pos, o = i * 12;
    P[o] = last.l.x; P[o + 1] = last.l.y; P[o + 2] = last.l.z;
    P[o + 3] = last.r.x; P[o + 4] = last.r.y; P[o + 5] = last.r.z;
    P[o + 6] = l.x; P[o + 7] = l.y; P[o + 8] = l.z;
    P[o + 9] = r.x; P[o + 10] = r.y; P[o + 11] = r.z;
    const U = this.uv, q = i * 8;
    U.set([0, 0, 1, 0, 0, 1, 1, 1], q);
    this.age.set([last.depth, last.depth, depth, depth], i * 4);
    this.dirtyLo = Math.min(this.dirtyLo, i); this.dirtyHi = Math.max(this.dirtyHi, i);
  }

  lift(side) { this.last[side] = null; }

  flush() {
    if (this.dirtyHi < 0) return;
    const a = this.geo.attributes;
    for (const [k, w] of [['position', 12], ['uv', 8], ['aDepth', 4]]) {
      a[k].clearUpdateRanges();
      a[k].addUpdateRange(this.dirtyLo * w, (this.dirtyHi - this.dirtyLo + 1) * w);
      a[k].needsUpdate = true;
    }
    this.dirtyLo = Infinity; this.dirtyHi = -1;
  }

  shift(d) {
    for (let i = 0; i < this.pos.length; i += 3) { this.pos[i] -= d.x; this.pos[i + 1] -= d.y; this.pos[i + 2] -= d.z; }
    for (const s of ['L', 'R']) if (this.last[s]) { this.last[s].l.sub(d); this.last[s].r.sub(d); }
    this.geo.attributes.position.clearUpdateRanges();
    this.geo.attributes.position.needsUpdate = true;
  }
}

// falling snow and diamond dust in a box that follows the camera
const AIR_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uBox, uSnow, uDust, uScale;
uniform vec3 uCam, uWind;
varying float vA; varying float vDust; varying float vTw;
void main() {
  vec3 p = position;
  float dust = step( 0.72, aSeed.w );
  float fall = mix( 1.1 + aSeed.x * 0.6, 0.12, dust );
  p += uWind * uTime * ( 0.6 + aSeed.y * 0.6 ) + vec3( sin( uTime * 0.7 + aSeed.z * 30.0 ), 0.0, cos( uTime * 0.6 + aSeed.x * 30.0 ) ) * 0.4;
  p.y -= fall * uTime;
  p = mod( p - uCam + uBox * 0.5, uBox ) + uCam - uBox * 0.5;
  vec4 mv = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vA = ( dust > 0.5 ? uDust : uSnow ) * smoothstep( uBox * 0.5, uBox * 0.25, d ) * smoothstep( 0.3, 1.5, d );
  vDust = dust;
  vTw = aSeed.z;
  gl_PointSize = ( dust > 0.5 ? 0.012 : 0.07 + aSeed.y * 0.06 ) * uScale / max( 0.3, d );
}`;
const AIR_FRAG = /* glsl */ `
uniform sampler2D uDot; uniform vec3 uSunCol, uAmb, uSunDir; uniform float uTime;
varying float vA; varying float vDust; varying float vTw;
void main() {
  if ( vA <= 0.001 ) discard;
  vec4 t = texture2D( uDot, gl_PointCoord );
  vec3 col = uAmb * 1.25 + uSunCol * 0.35;
  float a = t.a * vA * 0.9;
  if ( vDust > 0.5 ) {
    float g = pow( 0.5 + 0.5 * sin( uTime * ( 3.0 + vTw * 9.0 ) + vTw * 60.0 ), 24.0 );
    col = uSunCol * ( 0.2 + 5.0 * g );
    a *= 0.15 + g * 0.8;
  }
  gl_FragColor = vec4( col, a );
}`;

export class AirSnow {
  constructor(scene, dot, n = 9000) {
    const box = 46;
    const P = new Float32Array(n * 3), S = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      P[i * 3] = Math.random() * box; P[i * 3 + 1] = Math.random() * box; P[i * 3 + 2] = Math.random() * box;
      S.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(S, 4));
    this.u = {
      uTime: AT.uTime, uBox: { value: box }, uSnow: { value: 0 }, uDust: { value: 0.6 }, uScale: { value: 500 },
      uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector3(0.6, 0, 0.3) },
      uDot: { value: dot }, uSunCol: AT.uSunCol, uAmb: { value: new THREE.Color(0.5, 0.55, 0.65) }, uSunDir: AT.uSunDir,
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: AIR_VERT, fragmentShader: AIR_FRAG, uniforms: this.u, transparent: true, depthWrite: false });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }
  update(cam) { this.u.uCam.value.copy(cam.position); }
}
