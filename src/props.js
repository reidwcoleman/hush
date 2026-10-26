// Spruce forest and boulders: instanced in three distance bands, rebuilt as the rider moves.
// Chunks hand over their trees/rocks (absolute coordinates); collisions read the same lists.
import * as THREE from 'three';
import { AT, patchAtmos } from './atmos.js';
import { boughTexture, barkTexture } from './textures.js';
import { CHUNK } from './terrain.js';
import { normalAt } from './world.js';

const rad = (h) => 0.3 * Math.pow(1 - h, 0.95) + 0.018;

// near spruce: trunk + drooping bough cards (unit height)
function spruceGeometry() {
  const P = [], N = [], U = [], S = [], I = [];
  let v = 0;
  const r = (() => { let s = 7; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); })();
  const NW = 13;
  for (let w = 0; w < NW; w++) {
    const h = 0.1 + 0.86 * Math.pow(w / (NW - 1), 0.9);
    const k = Math.round(5 + 4 * (1 - h));
    const L = rad(h) * 1.25 + 0.025;
    const off = r() * 6.28;
    for (let c = 0; c < k; c++) {
      const th = off + (c / k) * Math.PI * 2 + (r() - 0.5) * 0.4;
      const dx = Math.cos(th), dz = Math.sin(th);
      const sx = -dz, sz = dx;
      const roll = (r() - 0.5) * 0.5;
      const hy = h + (r() - 0.5) * 0.02;
      const droop = 0.28 + r() * 0.16;
      // three stations along the bough: trunk, middle, tip
      const st = [
        [0.0, 0.0, 0.30],
        [0.5, -droop * 0.3, 0.62],
        [1.0, -droop, 0.30],
      ];
      // two cards per bough: a flat one and one stood on its edge (an X down the branch)
      for (const vert of [0, 1]) {
      for (const [t, dy, wd] of st) {
        const cx = dx * L * t, cy = hy + dy * L, cz = dz * L * t;
        const W = L * (vert ? 0.42 : 0.72) * wd;
        for (const sgn of [-1, 1]) {
          const px = cx + (vert ? 0 : sx * W * sgn), pz = cz + (vert ? 0 : sz * W * sgn), py = cy + (vert ? W * sgn * 0.9 - W * 0.25 : roll * W * sgn);
          P.push(px, py, pz);
          // rounded normals: outward and up, like a cone of foliage
          const nx = px, ny = (py - 0.45) * 0.35 + 0.42, nz = pz;
          const nl = Math.hypot(nx, ny, nz) || 1;
          N.push(nx / nl, ny / nl, nz / nl);
          U.push(sgn < 0 ? 0 : 1, t);
          S.push(t);
        }
      }
      for (let q = 0; q < 2; q++) {
        const a = v + q * 2;
        I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      v += 6;
      }
    }
  }
  const boughs = new THREE.BufferGeometry();
  boughs.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  boughs.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  boughs.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  boughs.setAttribute('aSway', new THREE.Float32BufferAttribute(S, 1));
  boughs.setIndex(I);
  const trunk = new THREE.CylinderGeometry(0.006, 0.028, 0.86, 7, 1, true);
  trunk.translate(0, 0.43, 0);
  trunk.setAttribute('aSway', new THREE.Float32BufferAttribute(new Float32Array(trunk.attributes.position.count), 1));
  // a dense core so you never see daylight through the middle
  const core = coneSpruce(9, 16, 5);
  core.scale(0.72, 0.96, 0.72);
  core.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(core.attributes.position.count * 2), 2));
  core.setAttribute('aSway', new THREE.Float32BufferAttribute(new Float32Array(core.attributes.position.count), 1));
  return mergeGroups([trunk, boughs, core]);
}

function mergeGroups(geos) {
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv', 'aSway'];
  const arrs = Object.fromEntries(names.map((n) => [n, []]));
  const idx = [];
  let base = 0;
  geos.forEach((g, gi) => {
    for (const n of names) arrs[n].push(...g.attributes[n].array);
    const start = idx.length;
    const gIdx = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (const i of gIdx) idx.push(i + base);
    out.addGroup(start, idx.length - start, gi);
    base += g.attributes.position.count;
  });
  out.setAttribute('position', new THREE.Float32BufferAttribute(arrs.position, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(arrs.normal, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(arrs.uv, 2));
  out.setAttribute('aSway', new THREE.Float32BufferAttribute(arrs.aSway, 1));
  out.setIndex(idx);
  return out;
}

// mid/far spruce: stacked jagged cones
function coneSpruce(tiers, seg, seed = 1) {
  const P = [], N = [], I = [];
  let v = 0;
  let sd = seed;
  const r = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let t = 0; t < tiers; t++) {
    const b = 0.06 + t * (0.8 / tiers);
    const top = Math.min(1, b + 0.42 + (t === tiers - 1 ? 0.2 : 0));
    const R0 = rad(b) * 1.18;
    const apex = v;
    P.push(0, top, 0); N.push(0, 1, 0); v++;
    const rot = r() * 6.28;
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2 + rot;
      const ss = s % seg;
      const jag = ss % 2 ? 0.74 + 0.08 * r() : 0.95 + 0.12 * ((ss * 7919 + t * 31) % 13) / 13;
      const x = Math.cos(a) * R0 * jag, z = Math.sin(a) * R0 * jag, y = b - (ss % 2 ? -0.01 : 0.05 * jag);
      P.push(x, y, z);
      const nl = Math.hypot(x, 0.55, z);
      N.push(x / nl, 0.55 / nl, z / nl);
      v++;
      if (s > 0) I.push(apex, apex + s + 1, apex + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}

function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  let s = seed;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const bumps = Array.from({ length: 7 }, () => [new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), 0.15 + r() * 0.3]);
  const vv = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    vv.fromBufferAttribute(p, i);
    let k = 1;
    for (const [d, a] of bumps) k += a * Math.max(0, vv.dot(d) - 0.5) * -1.2 + a * 0.15;
    // flattened facets
    vv.multiplyScalar(k);
    vv.y *= 0.7;
    if (vv.y < -0.2) vv.y = -0.2 + (vv.y + 0.2) * 0.3;
    p.setXYZ(i, vv.x, vv.y, vv.z);
  }
  g.computeVertexNormals();
  return g;
}

const SNOWY_HEAD = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uSunCol;
`;

function treeMaterial(kind, tex) {
  const opts = kind === 'near'
    ? { map: tex.bough, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.92 }
    : { color: 0x3c5a48, roughness: 0.95 };
  const m = new THREE.MeshStandardMaterial(opts);
  m.onBeforeCompile = (sh) => {
    patchAtmos(sh);
    sh.uniforms.uNoise = AT.uNoise; sh.uniforms.uTime = AT.uTime; sh.uniforms.uSunCol = AT.uSunCol;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\n' + (kind === 'near' ? 'attribute float aSway;\n' : '') + 'varying float vTH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTH = position.y;
#ifdef USE_INSTANCING
{
  vec3 ip = instanceMatrix[3].xyz;
  float ph = uTime * 1.1 + ip.x * 0.11 + ip.z * 0.07;
  ${kind === 'near' ? 'float sw = aSway * position.y * 0.012;' : 'float sw = position.y * position.y * 0.006;'}
  transformed.x += sin( ph ) * sw; transformed.z += cos( ph * 0.83 ) * sw;
}
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SNOWY_HEAD + 'varying float vTH;')
      .replace('#include <map_fragment>', `
{
  // never let a branch fill the lens: dither out right by the camera
  float cd = length( vAtW - cameraPosition );
  float dth = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
  if ( cd < 3.5 && dth > ( cd - 1.2 ) / 2.3 ) discard;
}
#include <map_fragment>
float tSnow;
{
  vec3 fnW = normalize( cross( dFdx( vAtW ), dFdy( vAtW ) ) );
  vec3 V = normalize( cameraPosition - vAtW );
  if ( dot( fnW, V ) < 0.0 ) fnW = -fnW;
  ${kind === 'near'
    ? `float nz = texture2D( uNoise, vMapUv * vec2( 0.9, 2.2 ) + vAtW.xz * 0.013 ).g;
  float ridge = 1.0 - smoothstep( 0.12, 0.42, abs( vMapUv.x - 0.5 ) );
  tSnow = smoothstep( 0.4, 0.85, fnW.y ) * smoothstep( 0.46, 0.62, nz * 0.8 + ridge * 0.35 ) * smoothstep( 0.05, 0.25, vMapUv.y ) * 0.9;
  diffuseColor.rgb *= vec3( 0.9, 1.0, 0.92 );`
    : `float nz = texture2D( uNoise, vAtW.xz * 0.05 + vTH ).g;
  tSnow = smoothstep( 0.35, 0.8, fnW.y ) * smoothstep( 0.35, 0.65, nz ) * 0.85;
  diffuseColor.rgb *= 0.55 + 0.45 * smoothstep( 0.0, 1.0, vTH );`}
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.89, 0.94 ), tSnow );
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 V = normalize( cameraPosition - vAtW );
  float back = pow( max( dot( -V, uSunDir ), 0.0 ), 4.0 );
  totalEmissiveRadiance += diffuseColor.rgb * uSunCol * back * 0.18 * ( 1.0 - tSnow );
}`);
  };
  m.customProgramCacheKey = () => 'tree-' + kind;
  return m;
}

function rockMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  m.onBeforeCompile = (sh) => {
    patchAtmos(sh);
    sh.uniforms.uRockC = { value: tex.rockC };
    sh.uniforms.uNoise = AT.uNoise;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uRockC, uNoise;')
      .replace('#include <map_fragment>', `
{
  vec3 fnW = normalize( cross( dFdx( vAtW ), dFdy( vAtW ) ) );
  vec3 bw = pow( abs( fnW ), vec3( 4.0 ) ); bw /= bw.x + bw.y + bw.z;
  vec3 rc = texture2D( uRockC, vAtW.zy / 3.0 ).rgb * bw.x + texture2D( uRockC, vAtW.xz / 3.0 ).rgb * bw.y + texture2D( uRockC, vAtW.xy / 3.0 ).rgb * bw.z;
  rc = mix( vec3( dot( rc, vec3( 0.33 ) ) ), rc, 0.5 ) * 0.8;
  float nz = texture2D( uNoise, vAtW.xz * 0.21 ).r;
  float sn = smoothstep( 0.45, 0.75, fnW.y + ( nz - 0.5 ) * 0.5 );
  diffuseColor.rgb *= mix( rc, vec3( 0.9, 0.925, 0.96 ), sn );
}`);
  };
  m.customProgramCacheKey = () => 'rock';
  return m;
}

// the dip and the shade round a tree's foot
function wellTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.14)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}

const NEAR_R = 170, MID_R = 560, FAR_R = 1500;
const MAX_NEAR = 4000, MAX_MID = 20000, MAX_FAR = 26000, MAX_ROCK = 3000;

export class Props {
  constructor(scene, origin, tex) {
    this.origin = origin;
    this.lists = new Map(); // chunk key -> { trees, rocks, cells }
    this.cells = new Map();
    const bough = boughTexture(), bark = barkTexture();
    const t = { ...tex, bough };
    this.near = new THREE.InstancedMesh(spruceGeometry(), [
      (() => { const m = new THREE.MeshStandardMaterial({ map: bark, roughness: 1 }); m.onBeforeCompile = patchAtmos; return m; })(),
      treeMaterial('near', t),
      treeMaterial('mid', t),
    ], MAX_NEAR);
    this.mid = new THREE.InstancedMesh(coneSpruce(4, 8, 3), treeMaterial('mid', t), MAX_MID);
    this.farT = new THREE.InstancedMesh(coneSpruce(2, 6), treeMaterial('far', t), MAX_FAR);
    this.rocks = new THREE.InstancedMesh(rockGeometry(3), rockMaterial(tex), MAX_ROCK);
    const wellGeo = new THREE.PlaneGeometry(1, 1);
    wellGeo.rotateX(-Math.PI / 2);
    const wellMat = new THREE.MeshStandardMaterial({ color: 0x5d6f8c, alphaMap: wellTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    wellMat.onBeforeCompile = patchAtmos;
    this.wells = new THREE.InstancedMesh(wellGeo, wellMat, MAX_NEAR);
    this.wells.receiveShadow = true;
    this.wells.renderOrder = 1;
    this._n = { x: 0, y: 1, z: 0 };
    this._up = new THREE.Vector3();
    for (const m of [this.near, this.mid, this.farT, this.rocks, this.wells]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.near.castShadow = true; this.near.receiveShadow = true;
    this.mid.castShadow = true; this.mid.receiveShadow = true;
    this.rocks.castShadow = true; this.rocks.receiveShadow = true;
    this.near.customDepthMaterial = undefined;
    this.lastNear = null; this.lastMid = null;
    this.dirty = true;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._c = new THREE.Color();
    this._y = new THREE.Vector3(0, 1, 0);
  }

  add(key, trees, rocks) {
    // a 12 m hash grid of obstacles for the collision and look-ahead queries
    const cells = [];
    const put = (o) => {
      const ck = Math.floor(o.x / 12) + ',' + Math.floor(o.z / 12);
      let c = this.cells.get(ck);
      if (!c) { c = []; this.cells.set(ck, c); cells.push(ck); }
      c.push(o);
    };
    for (let k = 0; k < trees.length; k += 5) put({ kind: 'tree', x: trees[k], y: trees[k + 1], z: trees[k + 2], s: trees[k + 3], r: 0.35 + 0.35 * trees[k + 3] });
    for (let k = 0; k < rocks.length; k += 5) put({ kind: 'rock', x: rocks[k], y: rocks[k + 1] + rocks[k + 3] * 0.55, z: rocks[k + 2], s: rocks[k + 3], r: rocks[k + 3] * 0.9 });
    this.lists.set(key, { trees, rocks, cells });
    this.dirty = true;
  }
  remove(key) {
    const L = this.lists.get(key);
    if (L) for (const ck of L.cells) this.cells.delete(ck);
    this.lists.delete(key);
    this.dirty = true;
  }

  setTree(mesh, i, x, y, z, s, seed, widen = 1) {
    const H = 14 * s;
    const o = this.origin;
    this._p.set(x - o.x, y - o.y - 0.4, z - o.z);
    this._q.setFromAxisAngle(this._y, seed * 6.283);
    const wr = (0.85 + 0.3 * ((seed * 7.13) % 1)) * widen;
    this._s.set(H * wr, H, H * wr);
    this._m.compose(this._p, this._q, this._s);
    mesh.setMatrixAt(i, this._m);
    const k = 0.8 + 0.4 * ((seed * 13.7) % 1);
    this._c.setRGB(k * (0.92 + 0.1 * ((seed * 3.1) % 1)), k, k * 0.95);
    mesh.setColorAt(i, this._c);
  }

  // absolute rider position
  update(ax, az, force = false) {
    const movedNear = !this.lastNear || Math.hypot(ax - this.lastNear[0], az - this.lastNear[1]) > 22;
    const movedMid = !this.lastMid || Math.hypot(ax - this.lastMid[0], az - this.lastMid[1]) > 90;
    if (!force && !this.dirty && !movedNear && !movedMid) return;
    const doMid = force || this.dirty || movedMid;
    this.dirty = false;
    this.lastNear = [ax, az];
    if (doMid) this.lastMid = [ax, az];
    let nn = 0, nm = 0, nf = 0, nr = 0;
    const o = this.origin;
    for (const { trees, rocks } of this.lists.values()) {
      // a quick reject of whole chunks
      const cx = trees.length ? trees[0] : ax, cz = trees.length ? trees[2] : az;
      const cd = Math.hypot(cx - ax, cz - az);
      if (cd > FAR_R + CHUNK * 1.5) continue;
      for (let i = 0; i < trees.length; i += 5) {
        const x = trees[i], z = trees[i + 2];
        const d = Math.hypot(x - ax, z - az);
        if (d < NEAR_R) {
          if (nn < MAX_NEAR) {
            this.setTree(this.near, nn, x, trees[i + 1], z, trees[i + 3], trees[i + 4]);
            // the well, tilted to the slope
            normalAt(x, z, this._n, 1.5);
            this._q.setFromUnitVectors(this._y, this._up.set(this._n.x, this._n.y, this._n.z));
            const R = 14 * trees[i + 3] * 0.62;
            this._s.set(R, 1, R);
            this._p.set(x - o.x, trees[i + 1] - o.y + 0.03, z - o.z);
            this._m.compose(this._p, this._q, this._s);
            this.wells.setMatrixAt(nn, this._m);
            nn++;
          }
        } else if (!doMid) continue;
        else if (d < MID_R) {
          if (nm < MAX_MID) this.setTree(this.mid, nm++, x, trees[i + 1], z, trees[i + 3], trees[i + 4]);
        } else if (d < FAR_R) {
          const sd = trees[i + 4];
          if (d > 900 && sd > 0.55) continue;
          if (nf < MAX_FAR) this.setTree(this.farT, nf++, x, trees[i + 1], z, trees[i + 3], sd, d > 900 ? 1.2 : 1);
        }
      }
      if (doMid) for (let i = 0; i < rocks.length; i += 5) {
        const x = rocks[i], z = rocks[i + 2];
        if (Math.hypot(x - ax, z - az) > 700 || nr >= MAX_ROCK) continue;
        const s = rocks[i + 3], sd = rocks[i + 4];
        this._p.set(x - o.x, rocks[i + 1] - o.y, z - o.z);
        this._q.setFromEuler(new THREE.Euler(sd * 3, sd * 40, sd * 17 % 1));
        this._s.set(s * (1 + sd * 0.6), s * (0.7 + sd * 0.4), s * (1.3 - sd * 0.4));
        this._m.compose(this._p, this._q, this._s);
        this.rocks.setMatrixAt(nr++, this._m);
      }
    }
    this.near.count = nn;
    this.near.instanceMatrix.needsUpdate = true;
    this.wells.count = nn;
    this.wells.instanceMatrix.needsUpdate = true;
    if (this.near.instanceColor) this.near.instanceColor.needsUpdate = true;
    if (doMid) {
      this.mid.count = nm; this.farT.count = nf; this.rocks.count = nr;
      for (const m of [this.mid, this.farT, this.rocks]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }

  // the nearest trunk or boulder to an absolute point: { d, kind, x, z, r, y, s }
  nearest(ax, az) {
    const ci = Math.floor(ax / 12), cj = Math.floor(az / 12);
    let best = null, bd = 1e9;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const c = this.cells.get(i + ',' + j);
      if (!c) continue;
      for (const o of c) {
        const d = Math.hypot(o.x - ax, o.z - az) - o.r;
        if (d < bd) { bd = d; best = o; }
      }
    }
    return best ? { ...best, d: bd } : null;
  }
}
