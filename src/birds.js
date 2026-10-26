// A few birds wheeling high over the valley by day.
import * as THREE from 'three';
import { AT, patchAtmos } from './atmos.js';

export class Birds {
  constructor(scene, n = 7) {
    // one bird: a body and two wings that flap in the vertex shader
    const P = [0, 0, 0.18, 0, 0, -0.2, 0, 0.02, 0, // body sliver
      0, 0, 0.06, 0.55, 0.0, -0.05, 0, 0, -0.08, // left wing
      0, 0, 0.06, 0, 0, -0.08, -0.55, 0.0, -0.05]; // right wing
    const W = [0, 0, 0, 0, 1, 0, 0, 0, 1];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aWing', new THREE.Float32BufferAttribute(W, 1));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 1, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      patchAtmos(sh);
      sh.uniforms.uTime = AT.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWing; uniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float ph = uTime * 5.5 + float( gl_InstanceID ) * 1.7;
  float flap = sin( ph ) * 0.55 * step( 0.0, sin( uTime * 0.4 + float( gl_InstanceID ) ) + 0.3 );
  transformed.y += aWing * abs( transformed.x ) * flap * 1.6;
}`);
    };
    this.mesh = new THREE.InstancedMesh(g, m, n);
    this.mesh.frustumCulled = false;
    this.n = n;
    this.seeds = Array.from({ length: n }, () => [Math.random() * 6.28, 0.7 + Math.random() * 0.6, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10]);
    this.center = new THREE.Vector3();
    this.t = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(1.4, 1.4, 1.4);
    scene.add(this.mesh);
  }

  update(dt, skierPos, dir, day) {
    this.mesh.visible = day > 0.2;
    if (!this.mesh.visible) return;
    this.t += dt;
    // the flock drifts ahead of the rider, high over the valley
    const want = new THREE.Vector3().copy(skierPos).addScaledVector(dir, 160);
    want.y += 55;
    if (this.center.distanceToSquared(want) > 600 * 600) this.center.copy(want);
    this.center.lerp(want, 1 - Math.exp(-0.15 * dt));
    for (let i = 0; i < this.n; i++) {
      const [a0, sp, ox, oy] = this.seeds[i];
      const a = a0 + this.t * 0.18 * sp;
      const r = 38 + ox;
      const p = new THREE.Vector3(this.center.x + Math.cos(a) * r, this.center.y + oy + Math.sin(this.t * 0.3 + a0) * 3, this.center.z + Math.sin(a) * r);
      this._e.set(Math.sin(this.t * 0.5 + a0) * 0.15, -a + Math.PI, -0.35);
      this._q.setFromEuler(this._e);
      this._m.compose(p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  shift(d) { this.center.sub(d); }
}
