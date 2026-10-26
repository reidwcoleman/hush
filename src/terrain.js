// Streams the mountain around the rider: LOD chunks near, one warped grid for the ranges.
import * as THREE from 'three';
import { AT, patchAtmos } from './atmos.js';

export const CHUNK = 192;
const R = 6; // chunks each side of the centre
const FAR_N = 321, FAR_SPAN = 17000, FAR_PW = 2.5, FAR_HOLE = 700;

function resFor(d) {
  return d < 280 ? 96 : d < 620 ? 48 : d < 1100 ? 24 : 12;
}

const indexCache = new Map();
function gridIndex(n) {
  if (indexCache.has(n)) return indexCache.get(n);
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let o = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    // alternate the diagonal so long slopes don't show a grain
    if ((i + j) & 1) { idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
    else { idx[o++] = a; idx[o++] = c; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = b; }
  }
  const attr = new THREE.BufferAttribute(idx, 1);
  indexCache.set(n, attr);
  return attr;
}

const TERRAIN_VERT_HEAD = /* glsl */ `
attribute vec2 aData;
varying vec2 vData; varying vec3 vTW; varying vec3 vTN;
uniform vec4 uNearBox;
`;

const TERRAIN_FRAG_HEAD = /* glsl */ `
varying vec2 vData; varying vec3 vTW; varying vec3 vTN;
uniform sampler2D uNoise, uSnowN, uRockC, uRockN;
uniform vec4 uNearBox;
uniform float uNightK;
float tRock, tRough, tDist, tCling;
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3i(vec3 c) { return vec3(pcg3(uvec3(ivec3(c) + 65536))) / 4294967295.0; }
vec3 tri(sampler2D t, vec3 p, vec3 w, float s) {
  return texture2D(t, p.zy / s).rgb * w.x + texture2D(t, p.xz / s).rgb * w.y + texture2D(t, p.xy / s).rgb * w.z;
}
`;

export function makeTerrainMaterial(tex, far = false) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 });
  const u = {
    uNoise: AT.uNoise, uSnowN: { value: tex.snowN }, uRockC: { value: tex.rockC }, uRockN: { value: tex.rockN },
    uNearBox: tex.nearBox, uNightK: AT.uNight,
  };
  if (far) m.defines = { FAR: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    patchAtmos(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_VERT_HEAD)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 wq = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
#ifdef FAR
  // under the near chunks where the two overlap
  vec2 inn = min( wq.xz - uNearBox.xy, uNearBox.zw - wq.xz );
  float ins = min( inn.x, inn.y );
  transformed.y -= 4.0 * smoothstep( -260.0, 0.0, ins );
#endif
  vData = aData;
  vTN = normalize( mat3( modelMatrix ) * normal );
  vTW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_FRAG_HEAD)
      .replace('#include <map_fragment>', `
#ifdef FAR
  {
    vec2 inn = min( vTW.xz - uNearBox.xy, uNearBox.zw - vTW.xz );
    if ( min( inn.x, inn.y ) > 40.0 ) discard;
  }
#endif
  tDist = length( vTW - cameraPosition );
  vec3 N0 = normalize( vTN );
  vec4 nA = texture2D( uNoise, vTW.xz / 256.0 );
  vec4 nB = texture2D( uNoise, vTW.xz / 32.0 );
  vec4 nC = texture2D( uNoise, vTW.xz / 4.0 );
  float slope = 1.0 - N0.y;
  float farK = smoothstep( 300.0, 2500.0, tDist );
  tRock = smoothstep( 0.29 + 0.1 * farK, 0.42 + 0.12 * farK, slope + ( nA.g - 0.5 ) * 0.24 + ( nB.r - 0.5 ) * 0.12 );
  vec3 bw = pow( abs( N0 ), vec3( 4.0 ) ); bw /= bw.x + bw.y + bw.z;
  vec3 rc = tri( uRockC, vTW, bw, 8.0 );
  vec3 rcFar = tri( uRockC, vTW, bw, 64.0 );
  rc = mix( rc, rcFar, smoothstep( 120.0, 600.0, tDist ) );
  rc = mix( vec3( dot( rc, vec3( 0.33 ) ) ), rc, 0.2 ) * vec3( 0.58, 0.6, 0.65 );
  // weathered streaks down the faces
  rc *= 0.82 + 0.3 * texture2D( uNoise, vec2( vTW.x + vTW.z, vTW.y * 3.0 ) / 64.0 ).r;
  // snow sticks to the ledges and in the cracks
  tCling = smoothstep( 0.42, 0.62, dot( rc, vec3( 0.4 ) ) + N0.y * 0.55 + ( nB.g - 0.5 ) * 0.4 - 0.25 );
  vec3 snow = vec3( 0.90, 0.925, 0.965 );
  snow *= mix( 0.955, 1.0, vData.y );
  snow *= 0.965 + 0.06 * nA.b;
  // wind-scoured crust glazed a touch blue-grey on the steeper rolls
  snow = mix( snow, snow * vec3( 0.92, 0.95, 1.0 ), smoothstep( 0.12, 0.3, slope ) * ( 1.0 - vData.y ) * 0.6 );
  vec3 col = mix( snow, rc, tRock * ( 1.0 - tCling * 0.7 ) );
  // the forest seen from far off: the canopy over the snow
  float fk = smoothstep( 900.0, 1700.0, tDist ) * smoothstep( 0.12, 0.5, vData.x );
  float canopy = fk * smoothstep( 0.4, 0.62, nB.a * 0.7 + nC.b * 0.3 + vData.x * 0.35 );
  col = mix( col, vec3( 0.045, 0.065, 0.06 ), canopy * 0.8 );
  diffuseColor.rgb *= col;
  tRough = mix( mix( 0.6, 0.72, 1.0 - vData.y ), 0.88, tRock * ( 1.0 - tCling ) );
`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', `
{
  vec3 Nw = normalize( vTN );
  float fade = 1.0 - smoothstep( 25.0, 200.0, tDist );
  vec2 dn = vec2( 0.0 );
  if ( fade > 0.0 ) {
    vec3 s1 = texture2D( uSnowN, vTW.xz / 4.0 ).xyz * 2.0 - 1.0;
    vec3 s2 = texture2D( uSnowN, vTW.xz / 1.0 + 0.37 ).xyz * 2.0 - 1.0;
    dn += ( s1.xy * 0.3 + s2.xy * 0.22 ) * fade * ( 1.0 - tRock );
  }
  // wind ripples and old drifts
  vec2 uvR = vTW.xz / 16.0;
  float r0 = texture2D( uNoise, uvR ).a;
  float rx = texture2D( uNoise, uvR + vec2( 1.0 / 256.0, 0.0 ) ).a;
  float rz = texture2D( uNoise, uvR + vec2( 0.0, 1.0 / 256.0 ) ).a;
  dn += vec2( r0 - rx, r0 - rz ) * 2.2 * ( 1.0 - smoothstep( 60.0, 600.0, tDist ) ) * ( 1.0 - vData.y * 0.6 );
  if ( tRock > 0.01 ) {
    vec3 bw2 = pow( abs( Nw ), vec3( 4.0 ) ); bw2 /= bw2.x + bw2.y + bw2.z;
    vec3 rn = tri( uRockN, vTW, bw2, 8.0 ) * 2.0 - 1.0;
    dn += rn.xy * tRock * ( 1.0 - tCling ) * 1.2;
  }
  vec3 T = normalize( vec3( 1.0, 0.0, 0.0 ) - Nw * Nw.x );
  vec3 B = normalize( cross( T, Nw ) );
  vec3 Nd = normalize( Nw + T * dn.x + B * dn.y );
  normal = normalize( ( viewMatrix * vec4( Nd, 0.0 ) ).xyz );
}`)
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
#if NUM_DIR_LIGHTS > 0
{
  // glints: ice crystals catching the sun
  float fadeS = 1.0 - smoothstep( 3.0, 55.0, tDist );
  if ( fadeS > 0.0 && tRock < 0.5 ) {
    vec3 cp = vTW * 26.0;
    vec3 cell = floor( cp );
    vec3 h3 = hash3i( cell );
    vec3 h4 = hash3i( cell + 17.0 );
    float dd = length( fract( cp ) - h4 * 0.7 - 0.15 );
    vec3 fn = normalize( h3 * 2.0 - 1.0 + vec3( 0.0, 1.0, 0.0 ) );
    vec3 V = normalize( cameraPosition - vTW );
    vec3 H = normalize( uSunDir + V );
    float g = pow( max( dot( fn, H ), 0.0 ), 1400.0 ) * smoothstep( 0.22, 0.05, dd ) * step( 0.35, h4.z );
    reflectedLight.directSpecular += directLight.color * g * 90.0 * fadeS;
  }
}
#endif`);
  };
  m.customProgramCacheKey = () => (far ? 'terrain-far' : 'terrain');
  return m;
}

export class Terrain {
  constructor(scene, origin, tex) {
    this.scene = scene;
    this.origin = origin;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.nearBox = { value: new THREE.Vector4(1e9, 1e9, -1e9, -1e9) };
    tex.nearBox = this.nearBox;
    this.mat = makeTerrainMaterial(tex, false);
    this.farMat = makeTerrainMaterial(tex, true);
    this.chunks = new Map();
    this.workers = [];
    this.jobs = new Map();
    this.nextId = 1;
    this.queue = [];
    const nw = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
    for (let i = 0; i < nw; i++) {
      const w = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });
      w.busy = 0;
      w.onmessage = (ev) => { w.busy--; this.onResult(ev.data); this.pump(); };
      this.workers.push(w);
    }
    this.far = null; this.farPending = false; this.farCenter = null;
    this.center = null; // the chunk the loaded square is built around
    this.shownCenter = null;
    this.onProps = null; // (key, trees, rocks) once a chunk's props exist
    this.onPropsGone = null;
  }

  key(i, j) { return i + ',' + j; }

  pump() {
    this.queue.sort((a, b) => a.pri - b.pri);
    for (const w of this.workers) {
      while (w.busy < 2 && this.queue.length) {
        const job = this.queue.shift();
        if (job.stale?.()) continue;
        job.id = this.nextId++;
        this.jobs.set(job.id, job);
        w.busy++;
        w.postMessage({ ...job.msg, id: job.id });
      }
    }
  }

  onResult(r) {
    const job = this.jobs.get(r.id);
    this.jobs.delete(r.id);
    if (!job) return;
    job.done(r);
  }

  makeGeo(r, n) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(r.nrm, 3));
    g.setAttribute('aData', new THREE.BufferAttribute(r.dat, 2));
    g.setIndex(gridIndex(n));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  request(i, j, res, pri) {
    const k = this.key(i, j);
    let c = this.chunks.get(k);
    if (!c) { c = { i, j, mesh: null, res: 0, pending: 0, props: false }; this.chunks.set(k, c); }
    if (c.pending === res) return;
    c.pending = res;
    const o = this.origin;
    const job0 = { ox: o.x, oy: o.y, oz: o.z };
    this.queue.push({
      pri,
      stale: () => c.pending !== res || !this.chunks.has(k),
      msg: { kind: 'chunk', x0: i * CHUNK, z0: j * CHUNK, size: CHUNK, res, ox: o.x, oy: o.y, oz: o.z, withProps: !c.props },
      done: (r) => {
        if (!this.chunks.has(k) || c.pending !== res) return;
        // the origin may have moved while it was being built
        const geo = this.makeGeo(r, res + 3);
        const mesh = new THREE.Mesh(geo, this.mat);
        mesh.position.set(job0.ox - this.origin.x, job0.oy - this.origin.y, job0.oz - this.origin.z);
        mesh.receiveShadow = true;
        mesh.castShadow = res >= 48;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
        c.mesh = mesh; c.res = res; c.pending = 0;
        this.group.add(mesh);
        if (r.trees && !c.props) { c.props = true; this.onProps?.(k, r.trees, r.rocks); }
      },
    });
  }

  // absolute rider position
  update(ax, az) {
    const ci = Math.floor(ax / CHUNK), cj = Math.floor(az / CHUNK);
    this.center = [ci, cj];
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      const dx = (i + 0.5) * CHUNK - ax, dz = (j + 0.5) * CHUNK - az;
      const d = Math.max(0, Math.hypot(dx, dz) - CHUNK * 0.5);
      const res = resFor(d);
      const c = this.chunks.get(this.key(i, j));
      if (!c || (c.res !== res && c.pending !== res)) this.request(i, j, res, d + (c?.mesh ? 400 : 0));
    }
    // swap the far grid's hole once the whole square is up (at the very start, once the inner
    // rings are: the far grid covers the rest until they land)
    let all = true;
    const RR = this.shownCenter ? R : 3;
    for (let j = cj - RR; j <= cj + RR && all; j++) for (let i = ci - RR; i <= ci + RR; i++) {
      const c = this.chunks.get(this.key(i, j));
      if (!c || !c.mesh) { all = false; break; }
    }
    if (all && (!this.shownCenter || this.shownCenter[0] !== ci || this.shownCenter[1] !== cj || this.shownR !== RR)) {
      this.shownCenter = [ci, cj];
      this.shownR = RR;
      for (const [k, c] of this.chunks) {
        if (Math.abs(c.i - ci) > R || Math.abs(c.j - cj) > R) {
          if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
          this.chunks.delete(k);
          if (c.props) this.onPropsGone?.(k);
        }
      }
    }
    this.updateBox();
    // the ranges
    if (!this.farPending && (!this.farCenter || Math.hypot(ax - this.farCenter[0], az - this.farCenter[1]) > 420)) {
      this.farPending = true;
      const o = { x: this.origin.x, y: this.origin.y, z: this.origin.z };
      const fc = [ax, az];
      this.queue.push({
        pri: this.far ? 300 : -1,
        msg: { kind: 'far', cx: ax, cz: az, n: FAR_N, span: FAR_SPAN, pw: FAR_PW, hole: FAR_HOLE, ox: o.x, oy: o.y, oz: o.z },
        done: (r) => {
          const geo = this.makeGeo(r, FAR_N);
          geo.boundingSphere.radius = 1e6;
          const mesh = new THREE.Mesh(geo, this.farMat);
          mesh.position.set(o.x - this.origin.x, o.y - this.origin.y, o.z - this.origin.z);
          mesh.frustumCulled = false;
          mesh.receiveShadow = false;
          if (this.far) { this.group.remove(this.far); this.far.geometry.dispose(); }
          this.far = mesh; this.farCenter = fc; this.farPending = false;
          this.group.add(mesh);
        },
      });
    }
    this.pump();
  }

  updateBox() {
    if (!this.shownCenter) return;
    const [ci, cj] = this.shownCenter;
    const r = this.shownR ?? R;
    const o = this.origin;
    this.nearBox.value.set((ci - r) * CHUNK - o.x, (cj - r) * CHUNK - o.z, (ci + r + 1) * CHUNK - o.x, (cj + r + 1) * CHUNK - o.z);
  }

  // every chunk in place and the far grid built
  ready() {
    if (!this.far || !this.center) return false;
    const [ci, cj] = this.center;
    for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
      const c = this.chunks.get(this.key(i, j));
      if (!c || !c.mesh) return false;
    }
    return !!this.shownCenter;
  }

  progress() {
    let n = 0, t = 0;
    for (const c of this.chunks.values()) { t++; if (c.mesh) n++; }
    return t ? n / t : 0;
  }

  // the origin moved by d (all local positions shift by -d)
  shift(d) {
    for (const c of this.chunks.values()) if (c.mesh) { c.mesh.position.sub(d); c.mesh.updateMatrix(); }
    if (this.far) this.far.position.sub(d);
    this.updateBox();
  }
}
