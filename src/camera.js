// Cameras: a soft chase cam, and a cinematic director that cuts between trackside, drone,
// low-follow and lead shots. Plus a free orbit for photo mode.
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class CamRig {
  constructor(camera, G) {
    this.cam = camera;
    this.G = G;
    this.mode = 'chase';
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.fov = 58;
    this.snap = true;
    this.shot = null;
    this.shotT = 0;
    this.shotI = 0;
    this.orbit = { yaw: 0, pitch: 0.25, dist: 6 };
    this.shake = 0;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
  }

  ground(p, clear) {
    const h = this.G.h(p.x, p.z);
    if (p.y < h + clear) p.y = h + clear;
  }

  update(dt, sk) {
    const p = sk.pos;
    const v = sk.vel;
    const sp = v.length();
    const hv = this._v.set(v.x, 0, v.z);
    if (hv.lengthSq() > 0.5) this.dir.lerp(hv.normalize(), 1 - Math.exp(-(sk.air ? 1.2 : 2.6) * dt)).normalize();
    else this.dir.lerp(this._w.set(Math.sin(sk.yaw), 0, Math.cos(sk.yaw)), 1 - Math.exp(-2 * dt)).normalize();
    if (this.mode === 'photo') return this.updateOrbit(dt, sk);
    if (this.mode === 'cine') return this.updateCine(dt, sk);
    if (this.mode === 'drone') return this.updateDrone(dt, sk);
    if (this.mode === 'title') return this.updateTitle(dt, sk);
    this.chase(dt, sk);
  }

  chase(dt, sk) {
    const p = sk.pos;
    const sp = sk.vel.length();
    const dist = 4.4 + Math.min(sp, 30) * 0.055;
    const hgt = 1.55 + Math.min(sp, 30) * 0.018;
    const want = this._w.copy(p).addScaledVector(this.dir, -dist);
    want.y = p.y + hgt;
    // a camera can't go into the slope behind you
    const hb = this.G.h(want.x, want.z);
    want.y = Math.max(want.y, hb + 1.2);
    const lookT = this._v.copy(p).addScaledVector(this.dir, 3.5 + sp * 0.08);
    lookT.y = p.y + 0.9 - Math.min(2.5, Math.max(0, p.y - this.G.h(lookT.x, lookT.z)) * 0.15);
    if (this.snap) { this.pos.copy(want); this.look.copy(lookT); this.snap = false; }
    this.pos.x = damp(this.pos.x, want.x, 5.5, dt);
    this.pos.z = damp(this.pos.z, want.z, 5.5, dt);
    this.pos.y = damp(this.pos.y, want.y, sk.air ? 2.5 : 4.5, dt);
    this.ground(this.pos, 0.9);
    this.look.lerp(lookT, 1 - Math.exp(-9 * dt));
    this.fov = damp(this.fov, 56 + clamp(sp - 8, 0, 25) * 0.42, 2, dt);
    this.apply();
  }

  // the title: wide and high, the rider small in the lower third, drifting round slowly
  updateTitle(dt, sk) {
    const p = sk.pos;
    this.titleA = (this.titleA ?? 0.9) + dt * 0.035;
    const a = Math.sin(this.titleA) * 0.9;
    const side = this._w.set(this.dir.z, 0, -this.dir.x);
    const want = this._v.copy(p).addScaledVector(this.dir, -24 * Math.cos(a)).addScaledVector(side, 24 * Math.sin(a) + 8);
    want.y = p.y + 9;
    if (this.snap) { this.pos.copy(want); this.snap = false; this.look.copy(p); }
    this.pos.lerp(want, 1 - Math.exp(-1.2 * dt));
    this.ground(this.pos, 4);
    const lk = this._w.copy(p).addScaledVector(this.dir, 16);
    lk.y = p.y + 3.2;
    this.look.lerp(lk, 1 - Math.exp(-2 * dt));
    this.fov = damp(this.fov, 52, 2, dt);
    this.apply();
  }

  updateDrone(dt, sk) {
    const p = sk.pos;
    const side = this._w.set(this.dir.z, 0, -this.dir.x);
    const want = this._v.copy(p).addScaledVector(this.dir, -18).addScaledVector(side, 9);
    want.y = p.y + 11;
    if (this.snap) { this.pos.copy(want); this.look.copy(p); this.snap = false; }
    this.pos.lerp(want, 1 - Math.exp(-1.6 * dt));
    this.ground(this.pos, 3);
    this.look.lerp(this._w.copy(p).addScaledVector(this.dir, 4), 1 - Math.exp(-5 * dt));
    this.fov = damp(this.fov, 50, 2, dt);
    this.apply();
  }

  // the director: pick a new shot every few seconds
  updateCine(dt, sk) {
    const p = sk.pos;
    const sp = sk.vel.length();
    this.shotT -= dt;
    if (!this.shot || this.shotT <= 0 || (this.shot.type === 'track' && this.shot.passed > 2.5)) this.newShot(sk);
    const s = this.shot;
    const side = this._w.set(this.dir.z, 0, -this.dir.x);
    if (s.type === 'track') {
      // fixed on the snow beside the line, long lens, panning
      this.pos.copy(s.at);
      const toR = this._v.copy(p).sub(s.at);
      if (toR.dot(this.dir) > 0) s.passed += dt;
      this.look.lerp(this._v.copy(p).setY(p.y + 0.8), 1 - Math.exp(-12 * dt));
      const d = Math.max(4, p.distanceTo(s.at));
      this.fov = damp(this.fov, clamp(900 / d, 14, 55), 3, dt);
    } else if (s.type === 'lead') {
      // ahead of the rider, looking back up the hill at them
      const want = this._v.copy(p).addScaledVector(this.dir, 7 + sp * 0.12).addScaledVector(side, s.side * 2.5);
      want.y = p.y + 1.0;
      if (s.fresh) { this.pos.copy(want); s.fresh = false; }
      this.pos.lerp(want, 1 - Math.exp(-4 * dt));
      this.ground(this.pos, 0.8);
      this.look.lerp(this._w.copy(p).setY(p.y + 0.9), 1 - Math.exp(-10 * dt));
      this.fov = damp(this.fov, 42, 3, dt);
    } else if (s.type === 'side') {
      // low and alongside, tracking
      const want = this._v.copy(p).addScaledVector(side, s.side * 6).addScaledVector(this.dir, 1.5);
      want.y = p.y + 0.6;
      if (s.fresh) { this.pos.copy(want); s.fresh = false; }
      this.pos.lerp(want, 1 - Math.exp(-5 * dt));
      this.ground(this.pos, 0.5);
      this.look.lerp(this._w.copy(p).setY(p.y + 0.85), 1 - Math.exp(-12 * dt));
      this.fov = damp(this.fov, 46, 3, dt);
    } else if (s.type === 'high') {
      // a wide drone shot pulling away, the valley below
      const want = this._v.copy(p).addScaledVector(this.dir, -26).addScaledVector(side, s.side * 18);
      want.y = p.y + 22;
      if (s.fresh) { this.pos.copy(want); s.fresh = false; }
      this.pos.lerp(want, 1 - Math.exp(-1.2 * dt));
      this.ground(this.pos, 6);
      this.look.lerp(this._w.copy(p).addScaledVector(this.dir, 10), 1 - Math.exp(-4 * dt));
      this.fov = damp(this.fov, 48, 2, dt);
    } else {
      if (s.fresh) { this.snap = true; s.fresh = false; }
      return this.chase(dt, sk);
    }
    this.apply();
  }

  newShot(sk) {
    const types = ['track', 'lead', 'side', 'high', 'track', 'chase'];
    let type = types[this.shotI++ % types.length];
    const side = Math.random() < 0.5 ? -1 : 1;
    const s = { type, side, fresh: true, passed: 0 };
    if (type === 'track') {
      // somewhere the rider is about to pass
      const sp = Math.max(8, sk.vel.length());
      const ahead = this._v.copy(sk.pos).addScaledVector(this.dir, sp * 2.6);
      const sd = this._w.set(this.dir.z, 0, -this.dir.x);
      ahead.addScaledVector(sd, side * (7 + Math.random() * 6));
      ahead.y = this.G.h(ahead.x, ahead.z) + 0.9 + Math.random() * 1.2;
      s.at = ahead.clone();
      this.shotT = 7;
    } else if (type === 'chase') {
      this.shotT = 7;
    } else this.shotT = 5.5 + Math.random() * 2.5;
    this.shot = s;
  }

  updateOrbit(dt, sk) {
    const o = this.orbit;
    const c = this._v.copy(sk.pos).setY(sk.pos.y + 1);
    this.pos.set(c.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, c.y + Math.sin(o.pitch) * o.dist, c.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
    this.ground(this.pos, 0.4);
    this.look.copy(c);
    this.apply();
  }

  apply() {
    const c = this.cam;
    c.position.copy(this.pos);
    if (this.shake > 0) {
      c.position.x += (Math.random() - 0.5) * this.shake * 0.05;
      c.position.y += (Math.random() - 0.5) * this.shake * 0.05;
      this.shake *= 0.9;
    }
    c.lookAt(this.look);
    if (Math.abs(c.fov - this.fov) > 0.01) { c.fov = this.fov; c.updateProjectionMatrix(); }
  }
}
