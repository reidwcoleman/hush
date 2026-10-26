// Little log cabins every so often beside the valley: snow on the roof, smoke from the
// chimney, windows that glow warm as the light goes. Deterministic per stretch of valley.
import * as THREE from 'three';
import { cabinSite, CABIN_PERIOD } from './world.js';
import { AT, patchAtmos, FOG_GLSL } from './atmos.js';

const PERIOD = CABIN_PERIOD;

function logTexture() {
  const W = 256, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const logs = 8;
  for (let i = 0; i < logs; i++) {
    const y0 = (i / logs) * H, h = H / logs;
    const gr = g.createLinearGradient(0, y0, 0, y0 + h);
    gr.addColorStop(0, '#2c1d13'); gr.addColorStop(0.18, '#6b4a31'); gr.addColorStop(0.5, '#7d5a3c'); gr.addColorStop(0.85, '#5a3d27'); gr.addColorStop(1, '#22160e');
    g.fillStyle = gr; g.fillRect(0, y0, W, h);
    g.globalAlpha = 0.18;
    for (let k = 0; k < 40; k++) { g.fillStyle = k % 2 ? '#3a2716' : '#9a7650'; g.fillRect(Math.random() * W, y0 + Math.random() * h, 20 + Math.random() * 60, 1); }
    g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function std(o) { const m = new THREE.MeshStandardMaterial(o); m.onBeforeCompile = patchAtmos; return m; }

function cabinModel(mats) {
  const g = new THREE.Group();
  const W = 6.2, D = 5, H = 2.9;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H - 0.3, D), mats.log);
  walls.position.y = (H - 0.3) / 2 + 0.3;
  // a stone footing: on a slope the downhill side stands proud of the snow
  const footing = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 4.5, D + 0.2), mats.stone);
  footing.position.y = 0.3 - 2.25;
  g.add(footing);
  const uv = walls.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.5, uv.getY(i) * 1.6);
  g.add(walls);
  // gables
  const gable = new THREE.Shape();
  gable.moveTo(-D / 2, 0); gable.lineTo(D / 2, 0); gable.lineTo(0, 1.9); gable.closePath();
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(gable), mats.log);
    m.position.set(s * W / 2, H, 0);
    m.rotation.y = s * Math.PI / 2;
    g.add(m);
  }
  // roof: two slabs, snow on top, dark timber under the eaves
  const pitch = Math.atan2(1.9, D / 2);
  const slabL = Math.hypot(D / 2, 1.9) + 0.7;
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 1.1, 0.16, slabL), mats.timber);
    roof.position.set(0, H + 0.95, s * (D / 4 + 0.05));
    roof.rotation.x = s * pitch;
    const snow = new THREE.Mesh(new THREE.BoxGeometry(W + 1.15, 0.32, slabL + 0.05), mats.snow);
    snow.position.set(0, 0.22, 0);
    roof.add(snow);
    g.add(roof);
  }
  // chimney
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.7), mats.stone);
  ch.position.set(W * 0.28, H + 1.6, -0.9);
  g.add(ch);
  const chs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.8), mats.snow);
  chs.position.set(W * 0.28, H + 2.75, -0.9);
  g.add(chs);
  // windows and a door
  for (const [x, z, ry, w, h] of [[-1.4, D / 2 + 0.01, 0, 1.0, 0.9], [1.5, D / 2 + 0.01, 0, 1.0, 0.9], [W / 2 + 0.01, 0.6, Math.PI / 2, 0.9, 0.8], [-W / 2 - 0.01, -0.5, -Math.PI / 2, 0.9, 0.8], [0, -D / 2 - 0.01, Math.PI, 0.9, 0.8]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.window);
    win.position.set(x, 1.45, z); win.rotation.y = ry;
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.18, h + 0.18), mats.timber);
    frame.position.copy(win.position); frame.rotation.y = ry;
    frame.position.addScaledVector(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)), -0.005);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.06, h), mats.timber);
    bar.position.copy(win.position).addScaledVector(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)), 0.006); bar.rotation.y = ry;
    g.add(frame, win, bar);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.9), mats.timber);
  door.position.set(0, 0.95, D / 2 + 0.012);
  g.add(door);
  // a woodpile and a bench of snow by the door
  const pile = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.6), mats.log);
  pile.position.set(-W / 2 - 0.6, 0.3, 1.2);
  const pileSnow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.7), mats.snow);
  pileSnow.position.set(-W / 2 - 0.6, 0.8, 1.2);
  g.add(pile, pileSnow);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

const SMOKE_VERT = /* glsl */ `
attribute float aT;
uniform float uTime, uScale;
uniform vec3 uWind;
varying float vA; varying vec3 vW;
void main() {
  float t = fract( uTime * 0.045 + aT );
  vec3 p = position + vec3( 0.0, t * 26.0, 0.0 ) + uWind * t * t * 30.0 + vec3( sin( aT * 40.0 + uTime * 0.3 ), 0.0, cos( aT * 31.0 + uTime * 0.25 ) ) * t * 3.0;
  vec4 w = modelMatrix * vec4( p, 1.0 );
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  gl_Position = projectionMatrix * mv;
  vA = smoothstep( 0.0, 0.08, t ) * ( 1.0 - t );
  gl_PointSize = ( 0.8 + t * 7.0 ) * uScale / max( 1.0, -mv.z );
}`;
const SMOKE_FRAG = /* glsl */ `
uniform sampler2D uDot; uniform vec3 uSunCol, uAmb;
varying float vA; varying vec3 vW;
${FOG_GLSL}
void main() {
  vec4 t = texture2D( uDot, gl_PointCoord );
  vec3 V = normalize( vW - cameraPosition );
  float fwd = pow( max( dot( V, uSunDir ), 0.0 ), 5.0 );
  vec3 col = uAmb * 0.75 + uSunCol * ( 0.12 + 0.9 * fwd );
  gl_FragColor = vec4( atmosFog( col, vW ), t.a * vA * 0.14 );
}`;

export class Cabins {
  constructor(scene, origin, dot) {
    this.scene = scene;
    this.origin = origin;
    this.live = new Map();
    const glow = { value: 0 };
    this.glow = glow;
    const win = new THREE.MeshStandardMaterial({ color: 0x1a120a, emissive: 0xffa04a, emissiveIntensity: 0.2, roughness: 0.2 });
    win.onBeforeCompile = (sh) => { patchAtmos(sh); sh.uniforms.uGlow = glow; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.3 + uGlow * 9.0;'); };
    this.mats = {
      log: std({ map: logTexture(), roughness: 0.92 }),
      timber: std({ color: 0x2e2118, roughness: 0.9 }),
      snow: std({ color: 0xeef2f8, roughness: 0.7 }),
      stone: std({ color: 0x5f5d5a, roughness: 0.95 }),
      window: win,
    };
    this.model = cabinModel(this.mats);
    this.smokeU = { uTime: AT.uTime, uScale: { value: 400 }, uWind: { value: new THREE.Vector3(0.5, 0, 0.25) }, uDot: { value: dot }, uSunCol: AT.uSunCol, uAmb: { value: new THREE.Color() },
      uFogCol: AT.uFogCol, uFogSun: AT.uFogSun, uSunDir: AT.uSunDir, uFogA: AT.uFogA, uFogB: AT.uFogB, uFogBase: AT.uFogBase, uHaze: AT.uHaze };
    const n = 70;
    const P = new Float32Array(n * 3), T = new Float32Array(n);
    for (let i = 0; i < n; i++) { T[i] = i / n; P[i * 3] = (Math.random() - 0.5) * 0.3; P[i * 3 + 2] = (Math.random() - 0.5) * 0.3; }
    this.smokeGeo = new THREE.BufferGeometry();
    this.smokeGeo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    this.smokeGeo.setAttribute('aT', new THREE.BufferAttribute(T, 1));
    this.smokeMat = new THREE.ShaderMaterial({ vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, uniforms: this.smokeU, transparent: true, depthWrite: false });
    this.lamp = new THREE.PointLight(0xffa456, 0, 26, 1.6);
    scene.add(this.lamp);
  }

  site(k) { return cabinSite(k); }

  update(ax, az) {
    const k0 = Math.floor(az / PERIOD);
    const want = new Set();
    for (let k = k0 - 2; k <= k0 + 4; k++) want.add(k);
    for (const [k, c] of this.live) if (!want.has(k)) { if (c) this.scene.remove(c.g); this.live.delete(k); }
    for (const k of want) {
      if (this.live.has(k)) continue;
      const s = this.site(k);
      if (!s) { this.live.set(k, null); continue; }
      const g = this.model.clone();
      const smoke = new THREE.Points(this.smokeGeo, this.smokeMat);
      smoke.position.set(6.2 * 0.28, 2.9 + 2.8, -0.9);
      smoke.frustumCulled = false;
      g.add(smoke);
      g.rotation.y = s.yaw;
      this.scene.add(g);
      this.live.set(k, { g, s });
    }
    this.place();
    // the nearest cabin's window light spills onto the snow after dark
    let best = null, bd = 1e9;
    for (const c of this.live.values()) { if (!c) continue; const d = Math.hypot(c.s.x - ax, c.s.z - az); if (d < bd) { bd = d; best = c; } }
    if (best && bd < 400) {
      this.lamp.position.set(best.s.x - this.origin.x, best.s.y - this.origin.y + 1.4, best.s.z - this.origin.z).add(new THREE.Vector3(Math.sin(best.s.yaw) * 3.6, 0, Math.cos(best.s.yaw) * 3.6));
      this.lamp.intensity = this.glow.value * 30;
    } else this.lamp.intensity = 0;
  }

  place() {
    const o = this.origin;
    for (const c of this.live.values()) if (c) c.g.position.set(c.s.x - o.x, c.s.y - o.y - 0.15, c.s.z - o.z);
  }

  // obstacles near an absolute point: [{x, z, r}]
  near(ax, az) {
    for (const c of this.live.values()) {
      if (!c) continue;
      const d = Math.hypot(c.s.x - ax, c.s.z - az);
      if (d < 5) return { d: d - 4.2, x: c.s.x, z: c.s.z };
    }
    return null;
  }
}
