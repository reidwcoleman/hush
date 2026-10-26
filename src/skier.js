// Ski physics. Edge-angle carving (radius from the sidecut), skids that scrub speed, powder
// that bogs you down, airs off lips when gravity can't hold you to the snow, soft landings,
// and gentle wipeouts. Works in local (origin-relative) coordinates; G gives the ground.
import * as THREE from 'three';

const g = 9.81;
const SIDECUT = 13;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Skier {
  constructor(G) {
    this.G = G; // { h(x,z), n(x,z,out), powder(x,z) }
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.edge = 0;
    this.air = false;
    this.airT = 0;
    this.spinVel = 0;
    this.spinAcc = 0;
    this.grab = 0;
    this.charge = 0;
    this.crouch = 0.3; this.crouchV = 0;
    this.tuck = 0;
    this.brake = 0;
    this.skid = 0;
    this.wipe = 0; // seconds left in a wipeout
    this.wipeK = 0;
    this.revert = 0;
    this.visYaw = 0;
    this.n = new THREE.Vector3(0, 1, 0);
    this.events = [];
    this.speed = 0;
    this.powder = 0;
    this.lean = 0;
    this.leanV = 0;
    this.carve = 0;
    this._f = new THREE.Vector3(); this._s = new THREE.Vector3(); this._a = new THREE.Vector3(); this._n2 = new THREE.Vector3();
  }

  place(x, z, yaw) {
    this.pos.set(x, this.G.h(x, z), z);
    this.vel.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(4);
    this.yaw = yaw; this.visYaw = yaw;
    this.air = false; this.wipe = 0; this.edge = 0;
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  // in: { steer -1..1 (+ = left), tuck 0..1, brake 0..1, jump bool held, grab bool }
  step(dt, inp) {
    const G = this.G;
    const p = this.pos, v = this.vel;
    this.speed = v.length();
    if (this.wipe > 0) return this.stepWipe(dt);
    this.tuck += ((inp.tuck ? 1 : 0) - this.tuck) * (1 - Math.exp(-5 * dt));
    this.brake += ((inp.brake ? 1 : 0) - this.brake) * (1 - Math.exp(-7 * dt));
    if (this.air) return this.stepAir(dt, inp);

    const n = G.n(p.x, p.z, this.n);
    const f = this._f.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    f.addScaledVector(n, -f.dot(n)).normalize();
    const s = this._s.crossVectors(n, f).normalize(); // rider's left
    const speed = this.speed;
    this.powder = G.powder(p.x, p.z);

    // edges: the further you tip, the tighter the arc
    const maxEdge = 0.3 + 0.75 * ss(1.5, 9, speed);
    const steer = inp.steer * (1 - this.brake * 0.6);
    const target = steer * maxEdge;
    this.edge += (target - this.edge) * (1 - Math.exp(-(Math.abs(target) > Math.abs(this.edge) ? 5.5 : 7) * dt));
    const ae = Math.abs(this.edge);
    let yawRate = 0;
    if (ae > 0.01) {
      const R = Math.max(4.2, SIDECUT / Math.tan(ae));
      yawRate = (speed / R) * Math.sign(this.edge);
    }
    // slow: steer by pivoting the skis
    yawRate += inp.steer * 1.5 * (1 - ss(2.5, 8, speed));
    // with nothing pressed the skis drift to follow the snow's slope a touch (they want the fall line)
    this.yaw += yawRate * dt;

    // gravity along the slope
    const a = this._a.set(0, -g, 0);
    a.addScaledVector(n, g * n.y);
    v.addScaledVector(a, dt);
    // keep it in the surface
    v.addScaledVector(n, -v.dot(n));

    let vf = v.dot(f), vs = v.dot(s);
    // grip: carving holds the line; flat skis and braking let them slide
    const grip = this.brake > 0.2 ? 1.6 : 5 + 11 * ss(0.05, 0.5, ae);
    const vs2 = vs * Math.exp(-grip * dt);
    const lost = Math.abs(vs - vs2);
    this.skid = Math.abs(vs2) + lost / dt * 0.02;
    // a clean carve hands some of that sideways momentum back along the skis
    vf += Math.sign(vf || 1) * lost * 0.18 * (1 - this.brake);
    vs = vs2;
    // friction, drag, powder
    const powder = this.powder;
    const mu = 0.03 + 0.03 * powder + 0.4 * this.brake + 0.015 * ae;
    const drag = THREE.MathUtils.lerp(0.0052, 0.0028, this.tuck) * (1 + this.crouch * 0.1);
    const sink = powder * 0.012 * speed * (1 - ss(10, 22, speed) * 0.6);
    let dec = mu * g * n.y + drag * speed * speed + sink;
    // pushing along on the flats
    if (inp.tuck && speed < 7) dec -= 2.2 * (1 - speed / 7);
    const af = Math.abs(vf);
    const nf = Math.max(0, af - dec * dt);
    vf = Math.sign(vf) * nf;
    if (af < 0.05 && dec < 0) vf = -dec * dt;
    v.copy(f).multiplyScalar(vf).addScaledVector(s, vs);
    this.carve = ae * ss(5, 12, speed) * (1 - this.brake);

    // hockey stop: skis swing across the slope while braking
    // lean into the turn (centripetal) — the visual body roll
    const latAcc = speed * yawRate;
    const leanT = Math.atan2(latAcc, g) * 0.95;
    this.leanV += ((leanT - this.lean) * 60 - this.leanV * 12) * dt;
    this.lean += this.leanV * dt;

    // the pop: hold to load, release to jump
    if (inp.jump) this.charge = Math.min(1, this.charge + dt * 2.2);
    let pop = 0;
    if (!inp.jump && this.charge > 0) { pop = 2.0 + 2.3 * this.charge; this.charge = 0; }

    const prevY = p.y;
    p.addScaledVector(v, dt);
    const hNew = G.h(p.x, p.z);
    const n2 = G.n(p.x, p.z, this._n2);

    // does the ground fall away faster than gravity can follow? (curvature along travel)
    let launch = false;
    if (speed > 6) {
      const dx = v.x / speed, dz = v.z / speed;
      const d = 4;
      const h0 = G.h(p.x, p.z), hf = G.h(p.x + dx * d, p.z + dz * d), hb = G.h(p.x - dx * d, p.z - dz * d);
      const kappa = -(hf - 2 * h0 + hb) / (d * d);
      const hs = Math.hypot(v.x, v.z);
      if (kappa > 0 && hs * hs * kappa > g * n2.y * 1.05 + 1.0) launch = true;
    }
    if (pop > 0 || launch) {
      this.air = true;
      this.airT = 0;
      this.spinAcc = 0;
      this.spinVel = 0;
      // a turn held over a lip doesn't become a spin: let go and press again to spin
      this.spinArmed = pop > 0 && !inp.steer;
      p.y = Math.max(hNew, prevY + v.y * dt) + 0.02;
      if (pop > 0) v.addScaledVector(n2, pop).addScaledVector(UP, pop * 0.25);
      this.emit('takeoff', { pop: pop > 0, speed });
      this.crouch = 0.15;
      return;
    }
    p.y = hNew;
    // re-project into the new surface
    v.addScaledVector(n2, -v.dot(n2));

    // posture: crouch springs
    const crouchT = 0.28 + 0.25 * this.charge + 0.1 * ae + 0.18 * this.brake;
    this.crouchV += ((crouchT - this.crouch) * 90 - this.crouchV * 14) * dt;
    this.crouch = clamp(this.crouch + this.crouchV * dt, 0, 1);
    this.visYaw = this.yaw + this.brake * Math.sign(this.edge || 1) * 1.15 * ss(3, 6, speed);
    this.grab = Math.max(0, this.grab - dt * 6);
  }

  stepAir(dt, inp) {
    const p = this.pos, v = this.vel;
    this.airT += dt;
    v.y -= g * dt;
    const sp = v.length();
    v.multiplyScalar(1 - 0.0016 * sp * dt);
    // spins: steer to rotate, it settles on its own when you let go
    if (!inp.steer) this.spinArmed = true;
    const steer = this.spinArmed ? inp.steer : 0;
    const want = steer * 7.5;
    this.spinVel += (want - this.spinVel) * (1 - Math.exp(-(steer ? 5 : 2.5) * dt));
    // with no input, ease toward the nearest whole half-turn so landings come round
    if (!steer) {
      const head = Math.atan2(v.x, v.z);
      const off = wrap(this.yaw - head);
      const k = Math.round(off / Math.PI) * Math.PI;
      this.spinVel += (k - off) * 6 * dt;
    }
    this.yaw += this.spinVel * dt;
    this.spinAcc += this.spinVel * dt;
    this.visYaw = this.yaw;
    this.grab += ((inp.grab ? 1 : 0) - this.grab) * (1 - Math.exp(-9 * dt));
    this.lean *= 1 - 3 * dt;
    this.crouch += ((0.35 + this.grab * 0.4) - this.crouch) * (1 - Math.exp(-6 * dt));
    this.tuck *= 0.98;
    p.addScaledVector(v, dt);
    const h = this.G.h(p.x, p.z);
    if (p.y <= h) {
      p.y = h;
      this.land();
    }
  }

  land() {
    const v = this.vel;
    const n = this.G.n(this.pos.x, this.pos.z, this.n);
    const vn = v.dot(n);
    const impact = Math.max(0, -vn);
    v.addScaledVector(n, -vn);
    const head = Math.atan2(v.x, v.z);
    const off = wrap(this.yaw - head);
    const half = Math.round(off / Math.PI);
    const resid = Math.abs(off - half * Math.PI);
    const turns = Math.round(Math.abs(this.spinAcc) / Math.PI) * 180;
    this.air = false;
    const sp = v.length();
    if ((resid > 1.1 && sp > 7) || impact > 17 || (this.grab > 0.6 && impact > 9)) {
      this.startWipe('landing');
      return;
    }
    // soften: speed lost to the impact, legs absorb
    v.multiplyScalar(1 - Math.min(0.35, impact * 0.012));
    this.crouchV -= impact * 0.55;
    if (half % 2 !== 0) { this.yaw += Math.PI; this.revert = 1; }
    // settle on the line we're travelling
    this.yaw = head + wrap(this.yaw - head) * 0.4;
    this.emit('land', { impact, airT: this.airT, turns, clean: resid < 0.35, revert: half % 2 !== 0 });
    this.grab = 0;
    this.spinVel = 0;
  }

  startWipe(reason, push) {
    this.wipe = 2.6;
    this.wipeK = 0;
    this.air = false;
    if (push) this.vel.addScaledVector(push, 1);
    this.emit('wipe', { reason, speed: this.vel.length() });
  }

  stepWipe(dt) {
    const p = this.pos, v = this.vel;
    this.wipe -= dt;
    const t = 2.6 - this.wipe;
    // tumble and slide, then get up
    this.wipeK = t < 1.6 ? Math.min(1, t * 4) : Math.max(0, 1 - (t - 1.6) * 1.4);
    const n = this.G.n(p.x, p.z, this.n);
    v.y -= g * dt;
    v.addScaledVector(n, -Math.min(0, v.dot(n)));
    const sp = v.length();
    const dec = (3.5 + 0.12 * sp * sp) * dt;
    v.multiplyScalar(Math.max(0, sp - dec) / (sp || 1));
    p.addScaledVector(v, dt);
    const h = this.G.h(p.x, p.z);
    if (p.y < h) p.y = h;
    if (p.y > h + 0.05) p.y = Math.max(h, p.y);
    this.edge *= 0.9; this.lean *= 0.9; this.charge = 0;
    if (sp > 0.5) this.yaw = THREE.MathUtils.lerp(this.yaw, this.yaw + wrap(Math.atan2(v.x, v.z) - this.yaw), 2 * dt);
    this.visYaw = this.yaw;
    if (this.wipe <= 0) {
      this.wipe = 0; this.wipeK = 0;
      p.y = h;
      // back on your feet, pointed downhill-ish
      const nn = this.G.n(p.x, p.z, this.n);
      const fall = Math.atan2(nn.x, nn.z);
      this.yaw = fall + wrap(this.yaw - fall) * 0.3;
      this.vel.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(2);
      this.emit('up');
    }
  }
}
