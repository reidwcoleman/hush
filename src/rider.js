// The skier: one skinned body lofted along a small skeleton (jacket, baggy pants, sleeves),
// rigid helmet, goggles, mitts, boots, skis and poles. Posed every frame by pose().
// Rider space: +z forward along the skis, +y up, +x the rider's left. Origin between the feet
// on the snow.
import * as THREE from 'three';
import { patchAtmos } from './atmos.js';
import { skiTexture } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// rest joints
const J = {
  hips: V(0, 0.98, 0), spine: V(0, 1.1, 0), chest: V(0, 1.3, 0), neck: V(0, 1.5, 0), head: V(0, 1.58, 0),
  hipL: V(0.095, 0.95, 0), kneeL: V(0.1, 0.53, 0), ankleL: V(0.105, 0.12, 0),
  hipR: V(-0.095, 0.95, 0), kneeR: V(-0.1, 0.53, 0), ankleR: V(-0.105, 0.12, 0),
  shL: V(0.19, 1.42, 0), elL: V(0.25, 1.15, 0), wrL: V(0.29, 0.9, 0),
  shR: V(-0.19, 1.42, 0), elR: V(-0.25, 1.15, 0), wrR: V(-0.29, 0.9, 0),
};
const BONES = [
  ['hips', null], ['spine', 'hips'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'],
  ['hipL', 'hips'], ['kneeL', 'hipL'], ['ankleL', 'kneeL'],
  ['hipR', 'hips'], ['kneeR', 'hipR'], ['ankleR', 'kneeR'],
  ['shL', 'chest'], ['elL', 'shL'], ['wrL', 'elL'],
  ['shR', 'chest'], ['elR', 'shR'], ['wrR', 'elR'],
];
const BI = Object.fromEntries(BONES.map(([n], i) => [n, i]));

// rings along a path -> a skinned tube. ring: { c, r: [rx, rz] across, w: [[bone, weight],..] }
function loft(rings, seg, out, { capStart = false, capEnd = false, axisRef = V(0, 0, 1), vScale = 1 } = {}) {
  const base = out.pos.length / 3;
  const n = rings.length;
  for (let k = 0; k < n; k++) {
    const R = rings[k];
    const prev = rings[Math.max(0, k - 1)].c, next = rings[Math.min(n - 1, k + 1)].c;
    const T = next.clone().sub(prev).normalize();
    // a stable frame across the tube: 'fwd' stays toward axisRef
    const F = axisRef.clone().sub(T.clone().multiplyScalar(axisRef.dot(T))).normalize();
    const S = new THREE.Vector3().crossVectors(F, T).normalize();
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rx = R.r[0] * (R.shape ? R.shape(a) : 1), rz = R.r[1] * (R.shape ? R.shape(a) : 1);
      const off = S.clone().multiplyScalar(ca * rx).add(F.clone().multiplyScalar(sa * rz));
      const p = R.c.clone().add(off);
      out.pos.push(p.x, p.y, p.z);
      out.uv.push(s / seg, (R.v ?? k / (n - 1)) * vScale);
      const w = R.w;
      out.si.push(BI[w[0][0]], w[1] ? BI[w[1][0]] : 0, w[2] ? BI[w[2][0]] : 0, 0);
      out.sw.push(w[0][1], w[1] ? w[1][1] : 0, w[2] ? w[2][1] : 0, 0);
    }
  }
  const row = seg + 1;
  for (let k = 0; k < n - 1; k++) for (let s = 0; s < seg; s++) {
    const a = base + k * row + s, b = a + 1, c = a + row, d = c + 1;
    out.idx.push(a, b, c, b, d, c);
  }
  const cap = (k, flip) => {
    const R = rings[k];
    const ci = out.pos.length / 3;
    out.pos.push(R.c.x, R.c.y, R.c.z);
    out.uv.push(0.5, 0.5);
    const w = R.w;
    out.si.push(BI[w[0][0]], w[1] ? BI[w[1][0]] : 0, w[2] ? BI[w[2][0]] : 0, 0);
    out.sw.push(w[0][1], w[1] ? w[1][1] : 0, w[2] ? w[2][1] : 0, 0);
    for (let s = 0; s < seg; s++) {
      const a = base + k * row + s;
      if (flip) out.idx.push(ci, a + 1, a); else out.idx.push(ci, a, a + 1);
    }
  };
  if (capStart) cap(0, true);
  if (capEnd) cap(n - 1, false);
}

const lerpW = (a, b, t) => (t <= 0 ? [[a, 1]] : t >= 1 ? [[b, 1]] : [[a, 1 - t], [b, t]]);
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function buildBody() {
  const jacket = { pos: [], uv: [], si: [], sw: [], idx: [] };
  const pants = { pos: [], uv: [], si: [], sw: [], idx: [] };
  // torso: hem to collar
  const TY = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.38, 1.44, 1.49, 1.53, 1.6];
  const TR = [[0.185, 0.14], [0.18, 0.135], [0.172, 0.128], [0.17, 0.125], [0.182, 0.13], [0.195, 0.135], [0.2, 0.13], [0.19, 0.12], [0.12, 0.1], [0.085, 0.085], [0.08, 0.082]];
  const tw = (y) => {
    if (y < 1.04) return lerpW('hips', 'spine', sm(0.94, 1.08, y));
    if (y < 1.24) return lerpW('spine', 'chest', sm(1.1, 1.26, y));
    if (y < 1.5) return lerpW('chest', 'neck', sm(1.45, 1.53, y));
    return [['neck', 1]];
  };
  loft(TY.map((y, i) => ({
    c: V(0, y, i >= 8 ? -0.012 : -0.005 + (y > 1.15 && y < 1.4 ? 0.01 : 0)),
    r: TR[i], w: tw(y), v: (y - 0.8) / 0.8,
    // a softer box than an ellipse: shoulders and hips are wide and flat-ish
    shape: (a) => 1 + 0.06 * Math.pow(Math.abs(Math.cos(2 * a)), 2) - 0.03,
  })), 24, jacket, { capStart: true });
  // sleeves
  for (const sd of ['L', 'R']) {
    const sh = J['sh' + sd], el = J['el' + sd], wr = J['wr' + sd];
    const inward = V(-Math.sign(sh.x) * 0.07, 0.01, 0);
    const pts = [
      [sh.clone().add(inward), 0.07, [['chest', 1]]],
      [sh.clone(), 0.074, [['chest', 0.4], ['sh' + sd, 0.6]]],
      [sh.clone().lerp(el, 0.35), 0.068, [['sh' + sd, 1]]],
      [sh.clone().lerp(el, 0.75), 0.063, [['sh' + sd, 1]]],
      [el.clone(), 0.06, [['sh' + sd, 0.5], ['el' + sd, 0.5]]],
      [el.clone().lerp(wr, 0.3), 0.058, [['el' + sd, 1]]],
      [el.clone().lerp(wr, 0.8), 0.055, [['el' + sd, 1]]],
      [wr.clone().add(V(Math.sign(sh.x) * 0.004, -0.02, 0)), 0.06, [['el' + sd, 0.3], ['wr' + sd, 0.7]]],
    ];
    loft(pts.map(([c, r, w], i) => ({ c, r: [r, r * 1.05], w, v: i / 7 })), 14, jacket, { capEnd: true, axisRef: V(0, 0, 1) });
  }
  // pelvis + legs
  loft([0.86, 0.9, 0.96, 1.02].map((y, i) => ({ c: V(0, y, 0), r: [[0.17, 0.125], [0.178, 0.13], [0.176, 0.13], [0.17, 0.125]][i], w: [['hips', 1]], v: i / 3 })), 22, pants, { capStart: true, capEnd: true });
  for (const sd of ['L', 'R']) {
    const hp = J['hip' + sd], kn = J['knee' + sd], an = J['ankle' + sd];
    const s = Math.sign(hp.x);
    const pts = [
      [V(s * 0.08, 0.98, 0), 0.1, [['hips', 1]]],
      [hp.clone().lerp(kn, 0.08), 0.098, [['hips', 0.35], ['hip' + sd, 0.65]]],
      [hp.clone().lerp(kn, 0.3), 0.092, [['hip' + sd, 1]]],
      [hp.clone().lerp(kn, 0.65), 0.084, [['hip' + sd, 1]]],
      [hp.clone().lerp(kn, 0.9), 0.078, [['hip' + sd, 0.8], ['knee' + sd, 0.2]]],
      [kn.clone(), 0.076, [['hip' + sd, 0.5], ['knee' + sd, 0.5]]],
      [kn.clone().lerp(an, 0.12), 0.074, [['hip' + sd, 0.15], ['knee' + sd, 0.85]]],
      [kn.clone().lerp(an, 0.4), 0.074, [['knee' + sd, 1]]],
      [kn.clone().lerp(an, 0.68), 0.079, [['knee' + sd, 1]]],
      [kn.clone().lerp(an, 0.86), 0.088, [['knee' + sd, 1]]],
      [an.clone().add(V(0, 0.01, 0.0)), 0.094, [['knee' + sd, 0.7], ['ankle' + sd, 0.3]]],
    ];
    loft(pts.map(([c, r, w], i) => ({ c, r: [r, r * 1.08], w, v: i / 10 })), 16, pants, { axisRef: V(0, 0, 1) });
  }
  const mk = (o) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(o.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(o.sw, 4));
    g.setIndex(o.idx);
    g.computeVertexNormals();
    return g;
  };
  return { jacket: mk(jacket), pants: mk(pants) };
}

// fabric: soft sheen, quilted baffles on the jacket, creases
function fabric(color, { quilt = 0, rough = 0.78 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35) });
  m.onBeforeCompile = (sh) => {
    patchAtmos(sh);
    sh.uniforms.uQuilt = { value: quilt };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvFUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFUv; uniform float uQuilt;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // baffles: horizontal ridges along v, creases across
  float b = sin( vFUv.y * 6.2831 * 7.0 ) * uQuilt;
  vec3 dx = dFdx( vViewPosition ), dy = dFdy( vViewPosition );
  float h = b * 0.0035;
  vec2 dh = vec2( dFdx( h ), dFdy( h ) );
  vec3 r1 = cross( dy, normal ), r2 = cross( normal, dx );
  float det = dot( dx, r1 );
  vec3 grad = sign( det ) * ( dh.x * r1 + dh.y * r2 );
  normal = normalize( abs( det ) * normal - grad * 0.9 );
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 1.0 - 0.035 * uQuilt * pow( 0.5 + 0.5 * cos( vFUv.y * 6.2831 * 7.0 ), 6.0 );`);
  };
  m.customProgramCacheKey = () => 'fabric' + quilt;
  return m;
}

function std(color, rough = 0.6, metal = 0, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  m.onBeforeCompile = patchAtmos;
  return m;
}

export const KITS = [
  { pack: 0x30373c, jacket: 0xb4532a, pants: 0x2a3038, helmet: 0xe8e2d6, lens: 0xd48a2a, mitts: 0x23262a, boots: 0x3a3f46, ski: ['#e9e2d4', '#c4562f', '#22262b'] },
  { pack: 0x8a4a2c, jacket: 0x2d5a62, pants: 0xd9d0c0, helmet: 0x1e2227, lens: 0x6aa6d8, mitts: 0x2a2d31, boots: 0xe7e3dc, ski: ['#1f2428', '#e3b04b', '#f1ece2'] },
  { pack: 0x3a4a3c, jacket: 0xe9e3d6, pants: 0x55433a, helmet: 0x8a6b4a, lens: 0xc2662c, mitts: 0x3a2e28, boots: 0x2a2b2e, ski: ['#d9cdb7', '#5d7a6a', '#2a2b2e'] },
  { pack: 0xb08a4a, jacket: 0x6d7f4e, pants: 0x2b2f2a, helmet: 0xd8d4c9, lens: 0x9a5fc4, mitts: 0x1d1f1c, boots: 0x6d6a62, ski: ['#efe9dd', '#6d7f4e', '#1d1f1c'] },
];

export class Rider {
  constructor(kit = KITS[0]) {
    this.root = new THREE.Group(); // placed on the snow, faces the skis
    this.lean = new THREE.Group(); // rolls the whole body into the turn about the skis
    this.root.add(this.lean);
    this.body = new THREE.Group();
    this.lean.add(this.body);
    // skeleton
    this.bones = BONES.map(([n]) => { const b = new THREE.Bone(); b.name = n; return b; });
    BONES.forEach(([n, p], i) => {
      const b = this.bones[i];
      if (p) { this.bones[BI[p]].add(b); b.position.copy(J[n]).sub(J[p]); } else { b.position.copy(J[n]); this.body.add(b); }
    });
    this.body.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(this.bones);
    const geo = buildBody();
    this.mats = {};
    this.kit = kit;
    this.mats.jacket = fabric(kit.jacket, { quilt: 1, rough: 0.7 });
    this.mats.pants = fabric(kit.pants, { quilt: 0, rough: 0.85 });
    this.jacket = new THREE.SkinnedMesh(geo.jacket, this.mats.jacket);
    this.pants = new THREE.SkinnedMesh(geo.pants, this.mats.pants);
    for (const m of [this.jacket, this.pants]) {
      this.body.add(m);
      m.bind(skel);
      m.castShadow = true; m.receiveShadow = true;
      m.frustumCulled = false;
    }
    const B = (n) => this.bones[BI[n]];
    // head: balaclava, helmet, goggles
    const head = new THREE.Group();
    head.position.set(0, 0.1, 0.01);
    B('head').add(head);
    this.mats.helmet = std(kit.helmet, 0.35, 0.0, { });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.098, 24, 18), fabric(0x1b1d20, { rough: 0.9 }));
    skull.scale.set(0.95, 1.1, 1.05);
    head.add(skull);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.128, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), this.mats.helmet);
    helmet.scale.set(0.98, 0.98, 1.1);
    helmet.position.set(0, 0.022, -0.012);
    helmet.rotation.x = -0.12;
    head.add(helmet);
    // a vent ridge
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.007, 6, 30, Math.PI), std(0x2a2d31, 0.5));
    ridge.rotation.y = Math.PI / 2; ridge.position.set(0, 0.04, -0.015);
    head.add(ridge);
    // goggles: frame band + mirrored lens
    const lensMat = new THREE.MeshPhysicalMaterial({ color: kit.lens, metalness: 0.9, roughness: 0.08, iridescence: 0.8, iridescenceIOR: 1.6, clearcoat: 1, clearcoatRoughness: 0.03 });
    lensMat.onBeforeCompile = patchAtmos;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.062, 26, 1, true, -1.05, 2.1), lensMat);
    lens.position.set(0, 0.0, 0.012);
    lens.rotation.y = Math.PI / 2 + Math.PI / 2;
    lens.scale.set(1, 1, 1.12);
    head.add(lens);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.114, 0.012, 6, 36), std(0x15171a, 0.6));
    frame.rotation.x = Math.PI / 2; frame.scale.set(1, 1.08, 1.3); frame.position.set(0, 0.0, 0.003);
    head.add(frame);
    // collar / neck gaiter
    const gaiter = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.088, 0.13, 20, 1, false), fabric(0x22262a, { rough: 0.95 }));
    gaiter.position.set(0, -0.07, 0.008);
    head.add(gaiter);
    // a small touring pack
    const pack = new THREE.Group();
    B('chest').add(pack);
    const packMat = fabric(kit.pack ?? 0x2b3136, { rough: 0.85 });
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.4, 0.13, 2, 2, 2), packMat);
    roundBox(bag.geometry, 0.05);
    bag.position.set(0, 0.02, -0.17);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.09, 0.14, 2, 2, 2), packMat);
    roundBox(lid.geometry, 0.035);
    lid.position.set(0, 0.23, -0.165);
    for (const sx of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.02), std(0x1b1d20, 0.8));
      strap.position.set(sx * 0.09, 0.03, 0.12);
      strap.rotation.x = -0.12;
      pack.add(strap);
    }
    pack.add(bag, lid);
    // mitts
    this.mats.mitts = fabric(kit.mitts, { rough: 0.8 });
    this.hands = {};
    for (const sd of ['L', 'R']) {
      const g = new THREE.Group();
      B('wr' + sd).add(g);
      const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), this.mats.mitts);
      mitt.scale.set(0.85, 1.25, 1.1);
      mitt.position.set(0, -0.05, 0.012);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.07, 14), this.mats.mitts);
      cuff.position.set(0, 0.0, 0);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), this.mats.mitts);
      thumb.scale.set(1, 1.6, 1); thumb.position.set(-Math.sign(J['wr' + sd].x) * 0.035, -0.04, 0.035);
      g.add(mitt, cuff, thumb);
      for (const o of [mitt, cuff, thumb]) o.castShadow = true;
      this.hands[sd] = g;
    }
    // boots
    this.mats.boots = std(kit.boots, 0.32, 0.0);
    for (const sd of ['L', 'R']) {
      const g = new THREE.Group();
      B('ankle' + sd).add(g);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.2, 0.3, 2, 2, 2), this.mats.boots);
      roundBox(shell.geometry, 0.04);
      shell.position.set(0, -0.03, 0.03);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.16, 14), this.mats.boots);
      cuff.position.set(0, 0.07, -0.01);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.03), std(0xb8bcc2, 0.3, 0.9));
      buckle.position.set(0, 0.05, 0.05);
      g.add(shell, cuff, buckle);
      shell.castShadow = cuff.castShadow = true;
    }
    // skis: their own groups on the snow, under the boots
    const skiTex = skiTexture(...kit.ski);
    const skiMat = new THREE.MeshStandardMaterial({ map: skiTex, roughness: 0.3, metalness: 0.05 });
    skiMat.onBeforeCompile = patchAtmos;
    this.skis = {};
    for (const sd of ['L', 'R']) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(skiGeometry(), skiMat);
      m.castShadow = true;
      g.add(m);
      const binding = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.035, 0.42), std(0x2a2d31, 0.45, 0.4));
      binding.position.set(0, 0.03, 0.0);
      g.add(binding);
      this.lean.add(g);
      this.skis[sd] = g;
    }
    // poles: shaft + basket, held in the mitts
    const poleMat = std(0x9aa0a8, 0.25, 0.9);
    this.poles = {};
    for (const sd of ['L', 'R']) {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 1.18, 6), poleMat);
      shaft.position.y = -0.59;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.14, 8), std(0x1a1c1f, 0.7));
      grip.position.y = -0.03;
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.008, 12), std(0x1a1c1f, 0.6));
      basket.position.y = -1.08;
      g.add(shaft, grip, basket);
      shaft.castShadow = true;
      this.lean.add(g);
      this.poles[sd] = g;
    }
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.B = B;
    // pose state
    this.t = 0;
    this.plant = { L: 0, R: 0 };
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
  }

  // aim a bone so its rest segment (to its child) points along dir (rider-body space), with
  // 'ref' the direction its rest +z should face as far as it can
  aim(name, child, dir, ref) {
    const b = this.B(name);
    const rest = J[child].clone().sub(J[name]).normalize();
    const restRef = V(0, 0, 1).sub(rest.clone().multiplyScalar(rest.z)).normalize();
    const d = dir.clone().normalize();
    const r = ref.clone().sub(d.clone().multiplyScalar(ref.dot(d))).normalize();
    const m0 = new THREE.Matrix4().makeBasis(rest, restRef, new THREE.Vector3().crossVectors(rest, restRef));
    const m1 = new THREE.Matrix4().makeBasis(d, r, new THREE.Vector3().crossVectors(d, r));
    const qW = new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.transpose()));
    // to local: parent's body-space rotation
    const pq = new THREE.Quaternion();
    let p = b.parent;
    const chain = [];
    while (p && p.isBone) { chain.unshift(p); p = p.parent; }
    for (const c of chain) pq.multiply(c.quaternion);
    b.quaternion.copy(pq.invert().multiply(qW));
  }

  // two-bone IK: returns the middle joint for a chain root->end with lengths a, b, bending
  // toward 'pole'
  ik(root, end, a, b, pole) {
    const d = end.clone().sub(root);
    let L = d.length();
    L = Math.min(L, (a + b) * 0.999);
    const dir = d.normalize();
    const x = (a * a - b * b + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    const pp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    return root.clone().add(dir.clone().multiplyScalar(x)).add(pp.multiplyScalar(h));
  }

  // p: { crouch 0..1, tuck 0..1, lean rad (into the turn, + = left), edge rad, fore -1..1,
  //      twist rad (upper body toward the fall line), plantL/R 0..1, air bool, grab 0..1, spread, t }
  pose(p) {
    const { crouch = 0.3, tuck = 0, lean = 0, edge = 0, fore = 0, twist = 0, grab = 0, air = false, wipe = 0 } = p;
    this.lean.rotation.z = -lean * 0.9;
    this.lean.rotation.x = wipe * 1.2;
    // stance: feet apart, the inside ski a touch ahead
    const stance = 0.115 + 0.02 * Math.abs(lean);
    const ahead = THREE.MathUtils.clamp(lean, -0.6, 0.6) * 0.08;
    const footY = 0.12 + (air ? 0.06 * grab : 0);
    const fL = V(stance, footY, ahead), fR = V(-stance, footY, -ahead);
    // angulation: the legs take the edge, the upper body stays more upright
    const k = THREE.MathUtils.clamp(crouch + tuck * 0.45 + grab * 0.35, 0, 1);
    const hipY = 0.98 - k * 0.36;
    const hipZ = -0.08 * k - 0.05 * tuck + fore * 0.05;
    const hipX = Math.sin(lean) * 0.12;
    // legs
    const hips = this.B('hips');
    hips.position.set(hipX, hipY, hipZ);
    hips.rotation.set(0.25 * k + 0.25 * tuck, twist * 0.25, -lean * 0.3);
    this.body.updateMatrixWorld(true);
    const tmp = new THREE.Vector3();
    const inv = new THREE.Matrix4().copy(this.body.matrixWorld).invert();
    const bodyPos = (bone) => tmp.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inv).clone();
    for (const [sd, foot] of [['L', fL], ['R', fR]]) {
      const hp = bodyPos(this.B('hip' + sd));
      const thigh = J['knee' + sd].distanceTo(J['hip' + sd]), shin = J['ankle' + sd].distanceTo(J['knee' + sd]);
      const knee = this.ik(hp, foot, thigh, shin, V(Math.sign(foot.x) * 0.15 + Math.sin(lean) * 0.3, 0.1, 1));
      this.aim('hip' + sd, 'knee' + sd, knee.clone().sub(hp), V(0, 0, 1));
      this.body.updateMatrixWorld(true);
      this.aim('knee' + sd, 'ankle' + sd, foot.clone().sub(knee), V(0, 0, 1));
      this.body.updateMatrixWorld(true);
      // feet flat on the skis
      const ank = this.B('ankle' + sd);
      const pq = new THREE.Quaternion();
      let q = ank.parent; const chain = [];
      while (q && q.isBone) { chain.unshift(q); q = q.parent; }
      for (const c of chain) pq.multiply(c.quaternion);
      ank.quaternion.copy(pq.invert());
    }
    // torso: fold forward with the crouch, counter the turn
    const sp = this.B('spine'), ch = this.B('chest'), nk = this.B('neck'), hd = this.B('head');
    sp.rotation.set(0.12 * k + 0.35 * tuck - 0.05, twist * 0.3, lean * 0.18);
    ch.rotation.set(0.1 * k + 0.25 * tuck, twist * 0.35, lean * 0.12);
    nk.rotation.set(-0.15 * k - 0.35 * tuck, -twist * 0.4, -lean * 0.15);
    hd.rotation.set(-0.1 * k - 0.2 * tuck + 0.05, -twist * 0.3, -lean * 0.25);
    this.body.updateMatrixWorld(true);
    // arms: hands forward and wide, pole plants, tucked in a tuck, grab reaches down
    for (const sd of ['L', 'R']) {
      const s = sd === 'L' ? 1 : -1;
      const sh = bodyPos(this.B('sh' + sd));
      const pl = this.plant[sd];
      let hand = V(s * (0.33 - 0.12 * tuck), hipY + 0.12 + 0.05 * (1 - k) - 0.05 * tuck, hipZ + 0.42 - 0.08 * tuck + pl * 0.12);
      hand.y += pl * -0.08;
      if (air && grab > 0) {
        // reach for the outside of the ski
        const g = sd === 'R' ? grab : grab * 0.3;
        hand.lerp(V(s * 0.2, 0.36, 0.25), g);
      }
      const ua = J['el' + sd].distanceTo(J['sh' + sd]), fa = J['wr' + sd].distanceTo(J['el' + sd]);
      const elbow = this.ik(sh, hand, ua, fa, V(s * 0.8, -0.3, -0.6));
      this.aim('sh' + sd, 'el' + sd, elbow.clone().sub(sh), V(0, 0, 1));
      this.body.updateMatrixWorld(true);
      this.aim('el' + sd, 'wr' + sd, hand.clone().sub(elbow), V(0, 0, 1));
      this.body.updateMatrixWorld(true);
      const wr = this.B('wr' + sd);
      const pq = new THREE.Quaternion();
      let q = wr.parent; const chain = [];
      while (q && q.isBone) { chain.unshift(q); q = q.parent; }
      for (const c of chain) pq.multiply(c.quaternion);
      wr.quaternion.copy(pq.invert()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1 - pl * 0.4, 0, s * 0.25)));
      this.body.updateMatrixWorld(true);
      // the pole: from the mitt, its tip trailing behind or planted ahead
      const pole = this.poles[sd];
      const hw = new THREE.Vector3().setFromMatrixPosition(wr.matrixWorld);
      const handL = this.lean.worldToLocal(hw.clone()).add(V(0, -0.06, 0.02));
      pole.position.copy(handL);
      const tip = pl > 0.05
        ? V(s * 0.38, -0.02, handL.z + 0.35)
        : V(s * (0.34 + 0.06 * tuck), tuck > 0.4 ? handL.y - 0.3 : 0.06, handL.z - (tuck > 0.4 ? 1.1 : 0.78));
      const dir = handL.clone().sub(tip).normalize();
      pole.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
    }
    // skis edge with the lean; they spread a little in a wipe
    for (const [sd, f] of [['L', fL], ['R', fR]]) {
      const g = this.skis[sd];
      g.position.set(f.x + hipX * 0, 0.0 + (air ? (footY - 0.12) : 0), f.z);
      g.rotation.set(0, 0, 0);
    }
    this.body.position.y = 0;
  }
}

function roundBox(g, r) {
  const p = g.attributes.position;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const c = bb.getCenter(new THREE.Vector3()), h = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c);
    const inner = new THREE.Vector3(Math.max(-h.x + r, Math.min(h.x - r, v.x)), Math.max(-h.y + r, Math.min(h.y - r, v.y)), Math.max(-h.z + r, Math.min(h.z - r, v.z)));
    const d = v.clone().sub(inner);
    if (d.lengthSq() > 0) d.normalize().multiplyScalar(r);
    p.setXYZ(i, inner.x + d.x + c.x, inner.y + d.y + c.y, inner.z + d.z + c.z);
  }
  g.computeVertexNormals();
}

// a ski: long, thin, with a turned-up shovel and a small tail kick, waisted (sidecut)
function skiGeometry() {
  const L = 1.74, segs = 40;
  const P = [], U = [], I = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; // 0 tail .. 1 tip
    const z = (t - 0.47) * L;
    const sc = 1 - 0.14 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.08) / 0.8)));
    let w = 0.052 * sc;
    let y = 0.012;
    if (t > 0.86) { const u = (t - 0.86) / 0.14; y += u * u * 0.1; w *= 1 - 0.35 * u * u; }
    if (t < 0.06) { const u = (0.06 - t) / 0.06; y += u * u * 0.03; w *= 1 - 0.3 * u * u; }
    for (const [x, yy] of [[-w, y], [w, y], [-w, y - 0.012], [w, y - 0.012]]) { P.push(x, yy, z); }
    U.push(0, t, 1, t, 0, t, 1, t);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 4, b = a + 4;
    I.push(a, b, a + 1, a + 1, b, b + 1); // top
    I.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2); // base
    I.push(a, a + 2, b, a + 2, b + 2, b); // side
    I.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
