// The sky: a painted dome driven by the sun's height (dawn, day, golden hour, dusk, night),
// clouds, stars and moon, the sun/moon light, and the image-based light baked from the dome.
import * as THREE from 'three';
import { AT } from './atmos.js';

const C = (h) => new THREE.Color(h);
// keyed by the sun's elevation in degrees
const KEYS = [
  { e: -16, zen: 0x02040b, mid: 0x050a18, hor: 0x0b1324, glow: 0x0a1120, sun: 0x9fb4e0, si: 0.0, env: 0.55, exp: 2.6, stars: 1, cl: 0x1a2232, cs: 0x070a12, fog: 0.8 },
  { e: -7, zen: 0x0a1430, mid: 0x1a2a52, hor: 0x34405e, glow: 0x5a4467, sun: 0x9fb4e0, si: 0.0, env: 0.75, exp: 2.1, stars: 0.6, cl: 0x3a3b58, cs: 0x141a2c, fog: 0.9 },
  { e: -2.5, zen: 0x1a3060, mid: 0x4d6a9a, hor: 0xb08378, glow: 0xd06a48, sun: 0xff6a3a, si: 0.0, env: 0.9, exp: 1.55, stars: 0.1, cl: 0xc0707a, cs: 0x2e2c48, fog: 1.0 },
  { e: 1.5, zen: 0x24508f, mid: 0x7ea2cc, hor: 0xe9b08a, glow: 0xff9248, sun: 0xffb06a, si: 3.2, env: 0.62, exp: 1.4, stars: 0, cl: 0xffb888, cs: 0x5d6a86, fog: 1.1 },
  { e: 6, zen: 0x2a5ea8, mid: 0x92c0dc, hor: 0xf0d2a8, glow: 0xffb468, sun: 0xffcf8e, si: 5.2, env: 0.6, exp: 1.12, stars: 0, cl: 0xffe0bc, cs: 0x7f8ba4, fog: 1.0 },
  { e: 13, zen: 0x2e66b6, mid: 0x96c4e4, hor: 0xdfe3e2, glow: 0xffdcb0, sun: 0xffe4bc, si: 5.4, env: 0.65, exp: 0.95, stars: 0, cl: 0xfff2e0, cs: 0x9aa6bc, fog: 0.9 },
  { e: 26, zen: 0x2864c2, mid: 0x8fbbea, hor: 0xc4daf0, glow: 0xfff2de, sun: 0xfff0e0, si: 5.0, env: 0.7, exp: 0.8, stars: 0, cl: 0xffffff, cs: 0xa9b4c8, fog: 0.8 },
  { e: 60, zen: 0x2160c4, mid: 0x86b6ea, hor: 0xb4d0f0, glow: 0xffffff, sun: 0xfff8f0, si: 5.0, env: 0.72, exp: 0.74, stars: 0, cl: 0xffffff, cs: 0xb0bccf, fog: 0.75 },
].map((k) => ({ ...k, zen: C(k.zen), mid: C(k.mid), hor: C(k.hor), glow: C(k.glow), sun: C(k.sun), cl: C(k.cl), cs: C(k.cs) }));

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZen, uMid, uHor, uGlow, uSunC, uSunDir, uMoonDir, uCloudLit, uCloudShade, uGround;
uniform float uStars, uTime, uCover, uEnv, uOvercast;
uniform sampler2D uNoise;
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3i(vec3 c) { return vec3(pcg3(uvec3(ivec3(c) + 4096))) / 4294967295.0; }
void main() {
  vec3 d = normalize( vDir );
  float y = d.y;
  float yy = max( y, 0.0 );
  // horizon -> pale blue -> zenith
  vec3 col = mix( uHor, uMid, smoothstep( 0.0, 0.22, pow( yy, 0.8 ) ) );
  col = mix( col, uZen, smoothstep( 0.12, 0.85, yy ) );
  float mu = dot( d, uSunDir );
  float hb = 1.0 - smoothstep( 0.0, 0.45, yy );
  float sm = max( mu, 0.0 );
  col += uGlow * ( pow( sm, 3.0 ) * 0.32 * ( 0.35 + 0.65 * hb ) + pow( sm, 24.0 ) * 0.55 + pow( sm, 400.0 ) * 1.5 );
  // a faint warm band right on the horizon opposite the sun at dusk (the earth's shadow above it)
  col += uGlow * 0.08 * pow( max( -mu, 0.0 ), 2.0 ) * smoothstep( 0.2, 0.02, yy );
  if ( uEnv < 0.5 ) {
    // stars and the milky way
    if ( uStars > 0.001 ) {
      vec3 sp = d * 420.0;
      vec3 h = hash3i( floor( sp ) );
      float r = length( fract( sp ) - 0.25 - h * 0.5 );
      float tw = 0.75 + 0.25 * sin( uTime * ( 2.0 + h.y * 4.0 ) + h.z * 40.0 );
      float star = step( 0.9965, h.x ) * smoothstep( 0.22, 0.0, r ) * ( 0.3 + 2.4 * pow( h.y, 6.0 ) ) * tw;
      vec3 band = normalize( vec3( 0.55, 0.35, -0.76 ) );
      float mw = exp( -pow( dot( d, band ), 2.0 ) * 22.0 );
      float mwn = texture2D( uNoise, d.xz * 1.7 + d.y ).r * 0.6 + texture2D( uNoise, d.xy * 4.0 ).g * 0.4;
      col += ( vec3( 0.75, 0.82, 1.0 ) * star + vec3( 0.20, 0.22, 0.30 ) * mw * smoothstep( 0.35, 0.8, mwn ) * 0.18 ) * uStars * smoothstep( 0.0, 0.15, yy );
      // the moon
      float mm = dot( d, uMoonDir );
      col += vec3( 0.9, 0.93, 1.0 ) * ( smoothstep( 0.99985, 0.99991, mm ) * 9.0 + pow( max( mm, 0.0 ), 600.0 ) * 0.25 + pow( max( mm, 0.0 ), 40.0 ) * 0.03 ) * uStars;
    }
    // the sun's disc
    col += uSunC * smoothstep( 0.99989, 0.99995, mu ) * 60.0;
  }
  // clouds, a high layer drifting
  if ( y > 0.0 ) {
    vec2 uv = d.xz / ( yy + 0.06 );
    vec2 w = vec2( uTime * 0.0012, uTime * 0.0004 );
    float dn = texture2D( uNoise, uv * 0.045 + w ).r * 0.55 + texture2D( uNoise, uv * 0.12 + w * 1.7 ).g * 0.3 + texture2D( uNoise, uv * 0.4 + w * 2.3 ).b * 0.15;
    float c = smoothstep( uCover, uCover + 0.22, dn );
    float thin = c * ( 1.0 - smoothstep( uCover + 0.05, uCover + 0.3, dn ) );
    c *= smoothstep( 0.0, 0.14, yy );
    vec3 cc = mix( uCloudShade, uCloudLit, clamp( 0.45 + 0.55 * mu, 0.0, 1.0 ) );
    cc += uGlow * pow( sm, 6.0 ) * thin * 2.4;
    col = mix( col, cc, c * 0.92 );
  }
  // overcast: the whole sky goes to a soft grey
  col = mix( col, mix( uHor, uCloudShade * 1.1, smoothstep( -0.1, 0.6, y ) * 0.6 ) * 0.95, uOvercast );
  if ( y < 0.0 ) col = mix( col, uEnv > 0.5 ? uGround : uHor, smoothstep( 0.0, uEnv > 0.5 ? -0.05 : -0.2, y ) );
  gl_FragColor = vec4( col, 1.0 );
}`;

export class Sky {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.u = {
      uZen: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uSunC: { value: new THREE.Color() }, uSunDir: AT.uSunDir, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uStars: { value: 0 }, uTime: AT.uTime, uCover: { value: 0.58 }, uEnv: { value: 0 }, uNoise: AT.uNoise, uOvercast: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.u, side: THREE.BackSide, depthWrite: false, depthTest: true });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
    this.dome.scale.setScalar(20000);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);
    // a copy for the image-based light: no sun disc or stars, lit snow below the horizon
    const envU = { ...this.u, uEnv: { value: 1 } };
    const envMat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: envU, side: THREE.BackSide, depthWrite: false });
    this.envScene = new THREE.Scene();
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), envMat);
    envDome.scale.setScalar(50);
    this.envScene.add(envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.lastEnvKey = null;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(4096, 4096);
    const ext = 140;
    s.camera.left = -ext; s.camera.right = ext; s.camera.top = ext; s.camera.bottom = -ext;
    s.camera.near = 1; s.camera.far = 900;
    s.bias = -0.0005; s.normalBias = 0.13;
    s.radius = 2;
    scene.add(this.sun, this.sun.target);

    this.hours = 16.6;
    this.overcast = 0;
    this.state = {};
    this.exposure = 1;
  }

  // the sun's direction for a time of day: low in the south-west in the afternoon, ahead and to
  // the right as you ski down
  sunDir(h, out = new THREE.Vector3()) {
    const e = THREE.MathUtils.degToRad(-6 + 42 * Math.sin(((h - 6.6) / 12) * Math.PI));
    const a = -0.85 + (h - 12) * 0.27;
    return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  }

  sample(elev) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].e < elev) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((elev - a.e) / (b.e - a.e), 0, 1);
    const st = this.state;
    for (const k of ['zen', 'mid', 'hor', 'glow', 'sun', 'cl', 'cs']) (st[k] ??= new THREE.Color()).copy(a[k]).lerp(b[k], t);
    for (const k of ['si', 'env', 'exp', 'stars', 'fog']) st[k] = a[k] + (b[k] - a[k]) * t;
    return st;
  }

  update(dt, camPos, scene) {
    const sd = this.sunDir(this.hours, AT.uSunDir.value);
    const elev = THREE.MathUtils.radToDeg(Math.asin(sd.y));
    const st = this.sample(elev);
    const oc = this.overcast;
    const u = this.u;
    u.uZen.value.copy(st.zen); u.uMid.value.copy(st.mid); u.uHor.value.copy(st.hor); u.uGlow.value.copy(st.glow).multiplyScalar(1 - oc * 0.8);
    u.uSunC.value.copy(st.sun).multiplyScalar(1 - oc);
    u.uCloudLit.value.copy(st.cl); u.uCloudShade.value.copy(st.cs);
    u.uStars.value = st.stars * (1 - oc);
    u.uOvercast.value = oc;
    u.uCover.value = THREE.MathUtils.lerp(0.6, 0.25, oc);
    // the moon rides opposite the sun, high
    const md = u.uMoonDir.value.set(-sd.x, Math.max(0.55, -sd.y), -sd.z).normalize();
    AT.uNight.value = THREE.MathUtils.smoothstep(-elev, 2, 10);

    // the key light: the sun by day, the moon by night
    const moonK = THREE.MathUtils.smoothstep(-elev, 3, 9);
    const sunK = THREE.MathUtils.smoothstep(elev, -2.5, 0.5);
    const L = this.sun;
    if (sunK > 0.001) {
      L.position.copy(sd);
      L.color.copy(st.sun);
      L.intensity = st.si * (1 - oc * 0.85) * sunK;
    } else {
      L.position.copy(md);
      L.color.set(0x9fb4e0);
      L.intensity = 0.42 * moonK * (1 - oc * 0.8);
    }
    L.position.multiplyScalar(400).add(camPos);
    L.target.position.copy(camPos);
    // snap the shadow camera to texels so the shadows don't crawl
    L.updateMatrixWorld(); L.target.updateMatrixWorld();

    // the air
    AT.uFogCol.value.copy(st.hor).lerp(st.cs, oc * 0.5);
    AT.uFogSun.value.copy(st.hor).add(new THREE.Color().copy(st.glow).multiplyScalar(0.55 * (1 - oc)));
    AT.uSunCol.value.copy(L.color).multiplyScalar(L.intensity);
    const fogK = st.fog * (1 + oc * 2.4);
    AT.uFogA.value = 0.00042 * fogK;
    AT.uHaze.value = 0.000035 * fogK;
    AT.uFogBase.value = camPos.y - 60;

    // lit snow under the horizon for the bounce light
    const g = u.uGround.value.copy(st.mid).lerp(st.hor, 0.3).multiplyScalar(0.5).add(new THREE.Color(1, 0.97, 0.94).multiplyScalar(L.intensity * Math.max(0.1, L.position.clone().sub(camPos).normalize().y) * 0.22));
    g.multiplyScalar(0.8);

    this.exposure = st.exp * (1 + oc * 0.25);
    scene.environmentIntensity = st.env;
    this.dome.position.copy(camPos);

    // re-bake the image-based light when the sky has moved on
    const key = Math.round(elev * 3) + ':' + Math.round(oc * 20);
    if (key !== this.lastEnvKey) {
      this.lastEnvKey = key;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      scene.environment = rt.texture;
    }
    return elev;
  }
}
