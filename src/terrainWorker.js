// Builds terrain meshes off the main thread: square chunks near the rider (with a skirt so LOD
// seams never open) and one big warped grid for the far ranges.
import { heightAt, forestAt, powderAt, treesIn, rocksIn } from './world.js';

function buildChunk({ x0, z0, size, res, ox, oy, oz, withProps }) {
  const n = res + 3; // one skirt ring each side
  const pos = new Float32Array(n * n * 3);
  const nrm = new Float32Array(n * n * 3);
  const dat = new Float32Array(n * n * 2);
  const step = size / res;
  const e = Math.max(0.6, step * 0.5);
  const skirt = 2 + step * 0.8;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const ci = Math.min(res, Math.max(0, i - 1)), cj = Math.min(res, Math.max(0, j - 1));
    const edge = ci !== i - 1 || cj !== j - 1;
    const x = x0 + ci * step, z = z0 + cj * step;
    const h = heightAt(x, z);
    const hx = heightAt(x + e, z) - heightAt(x - e, z);
    const hz = heightAt(x, z + e) - heightAt(x, z - e);
    let nx = -hx, ny = 2 * e, nz = -hz;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const k = j * n + i;
    pos[k * 3] = x - ox; pos[k * 3 + 1] = h - oy - (edge ? skirt : 0); pos[k * 3 + 2] = z - oz;
    nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
    dat[k * 2] = forestAt(x, z, h, ny);
    dat[k * 2 + 1] = powderAt(x, z);
  }
  const out = { pos, nrm, dat };
  if (withProps) {
    out.trees = new Float32Array(treesIn(x0, z0, size));
    out.rocks = new Float32Array(rocksIn(x0, z0, size));
  }
  return out;
}

// the far grid: dense near its centre, spreading out to the horizon
function buildFar({ cx, cz, n, span, pw, hole, ox, oy, oz }) {
  const pos = new Float32Array(n * n * 3);
  const nrm = new Float32Array(n * n * 3);
  const dat = new Float32Array(n * n * 2);
  const half = (n - 1) / 2;
  // few vertices under the near chunks, most of them just beyond, spreading to the horizon
  const t0 = 0.12;
  const warp = (t) => {
    const a = Math.abs(t);
    const d = a < t0 ? (hole * a) / t0 : hole + (span - hole) * Math.pow((a - t0) / (1 - t0), pw);
    return Math.sign(t) * d;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = cx + warp((i - half) / half), z = cz + warp((j - half) / half);
    const r = Math.hypot(x - cx, z - cz);
    const e = Math.max(2, r * 0.012);
    const h = heightAt(x, z);
    const hx = heightAt(x + e, z) - heightAt(x - e, z);
    const hz = heightAt(x, z + e) - heightAt(x, z - e);
    let nx = -hx, ny = 2 * e, nz = -hz;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const k = j * n + i;
    pos[k * 3] = x - ox; pos[k * 3 + 1] = h - oy; pos[k * 3 + 2] = z - oz;
    nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
    dat[k * 2] = forestAt(x, z, h, ny);
    dat[k * 2 + 1] = powderAt(x, z);
  }
  return { pos, nrm, dat };
}

self.onmessage = (ev) => {
  const m = ev.data;
  const r = m.kind === 'far' ? buildFar(m) : buildChunk(m);
  const tr = [r.pos.buffer, r.nrm.buffer, r.dat.buffer];
  if (r.trees) tr.push(r.trees.buffer, r.rocks.buffer);
  self.postMessage({ id: m.id, kind: m.kind, ...r }, tr);
};
