// The mountain. One height function, sampled by the terrain workers, the physics, the trees
// and the camera. Absolute coordinates: downhill is +z, it never ends.
import { makeNoise, hash2 } from './noise.js';

const N = makeNoise(7), M = makeNoise(101), F = makeNoise(4242), R = makeNoise(77);

export const GRADE = 0.3;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// the valley floor's meander
export function lineX(z) {
  return 360 * N.n2(z * 0.0003, 3.1) + 110 * N.n2(z * 0.0012, 8.7);
}

// the fall line: steeper pitches and gentle benches
export function baseY(z) {
  return -GRADE * z + 34 * N.n2(z * 0.0011, 1.7) + 6 * N.n2(z * 0.0045, 5.3);
}

// the valley's cross profile (metres above the floor at |d| off the line)
function profile(ad) {
  return (0.00042 * ad * ad) / (1 + ad / 950);
}

// benches that end in a lip and a short steep roll: the natural kickers and drops
function benches(x, z, ad) {
  // local patches, a hundred metres or two across
  const amp = clamp(F.n2(x * 0.0042 + 40, z * 0.0036) * 1.9 - 0.45, 0, 1) * 5 * (1 - smooth(240, 480, ad));
  if (amp <= 0.01) return 0;
  // the lip wanders and breaks up across the slope
  const f = z / 190 + 1.5 * F.n2(x * 0.0065, z * 0.0028 + 9) + 0.35 * F.n2(x * 0.02 + 5, z * 0.01);
  const fr = f - Math.floor(f);
  // a bench a little flatter than the fall line, then the edge rolls over and drops
  return amp * (fr - smooth(0.9, 1.0, fr) - 0.45);
}

export function heightAt(x, z) {
  const cx = lineX(z);
  const d = x - cx, ad = Math.abs(d);
  let h = baseY(z) + profile(ad);
  // the ranges either side
  const rk = smooth(320, 1900, ad);
  if (rk > 0) h += rk * (1150 * M.ridged(x * 0.00042, z * 0.00042, 6) + 260 * M.n2(x * 0.0011 + 5, z * 0.0011));
  // ridges and gullies on the valley walls
  const wk = smooth(150, 700, ad);
  if (wk > 0) h += wk * 55 * R.ridged(x * 0.0024 + 3, z * 0.0024 - 7, 4);
  // rolling ground
  h += 2.8 * F.fbm(x * 0.0085, z * 0.0085, 3);
  h += 0.55 * F.n2(x * 0.068 + 2, z * 0.068) + 0.18 * F.n2(x * 0.19, z * 0.19);
  h += benches(x, z, ad);
  return h;
}

const _n = { x: 0, y: 1, z: 0 };
export function normalAt(x, z, out = _n, e = 0.6) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  out.x = nx / l; out.y = ny / l; out.z = nz / l;
  return out;
}

// how many trees grow here, 0..1
export function forestAt(x, z, h, ny) {
  const cx = lineX(z);
  const ad = Math.abs(x - cx);
  const rel = h - baseY(z);
  if (rel > 560) return 0;
  let f = smooth(-0.3, 0.4, F.fbm(x * 0.0032 + 11, z * 0.0032 - 4, 4));
  // glades in the valley, open bowls, dense on the walls
  f *= 0.22 + 0.78 * smooth(90, 300, ad);
  f *= 1 - smooth(380, 560, rel);
  f *= smooth(0.72, 0.86, ny);
  // stands and clumps with open snow between
  f *= 0.25 + 0.75 * smooth(-0.35, 0.3, F.n2(x * 0.026 + 3, z * 0.026 - 8));
  // the odd lone tree
  f = Math.max(f, 0.05 * smooth(0.82, 0.9, ny) * (1 - smooth(380, 500, rel)));
  return f;
}

// powder depth 0..1: wind-packed patches and sheltered pockets of deep snow
export function powderAt(x, z) {
  return smooth(-0.45, 0.35, F.n2(x * 0.006 - 30, z * 0.006 + 12));
}

// the trees of one square of ground: [x, y, z, scale, seed] per tree (absolute coordinates)
export function treesIn(x0, z0, size, spacing = 6.5) {
  const out = [];
  const n = Math.ceil(size / spacing);
  const gx0 = Math.floor(x0 / spacing), gz0 = Math.floor(z0 / spacing);
  const nn = { x: 0, y: 1, z: 0 };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gi = gx0 + i, gj = gz0 + j;
    const r = hash2(gi, gj);
    const x = (gi + 0.15 + 0.7 * hash2(gi + 91, gj)) * spacing;
    const z = (gj + 0.15 + 0.7 * hash2(gi, gj - 37)) * spacing;
    if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
    const h = heightAt(x, z);
    normalAt(x, z, nn, 1.5);
    const f = forestAt(x, z, h, nn.y);
    if (r > f * 0.62) continue;
    if (nearCabin(x, z)) continue;
    const s = 0.55 + 0.75 * hash2(gi - 5, gj + 13) * (0.6 + 0.4 * f);
    out.push(x, h, z, s, hash2(gi + 3, gj + 7));
  }
  return out;
}

// boulders: on steep ground and scattered through the snow. [x, y, z, size, seed]
export function rocksIn(x0, z0, size) {
  const out = [];
  const sp = 11;
  const n = Math.ceil(size / sp);
  const gx0 = Math.floor(x0 / sp), gz0 = Math.floor(z0 / sp);
  const nn = { x: 0, y: 1, z: 0 };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gi = gx0 + i, gj = gz0 + j;
    const x = (gi + hash2(gi + 1, gj + 2)) * sp, z = (gj + hash2(gi + 4, gj + 9)) * sp;
    if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
    const h = heightAt(x, z);
    normalAt(x, z, nn, 2);
    const steep = smooth(0.9, 0.7, nn.y);
    const chance = steep * 0.5 + 0.012;
    if (hash2(gi - 11, gj + 5) > chance) continue;
    const s = (0.5 + 2.2 * Math.pow(hash2(gi + 8, gj - 3), 2.5)) * (0.7 + steep);
    out.push(x, h - s * 0.35, z, s, hash2(gi, gj + 77));
  }
  return out;
}

export { clamp, smooth };

// the height the finest terrain mesh (2 m grid, alternating diagonals) actually has here, so
// tracks and skis sit on what you see
export function meshHeightAt(x, z, step = 2) {
  const gi = Math.floor(x / step), gj = Math.floor(z / step);
  const fx = x / step - gi, fz = z / step - gj;
  const x0 = gi * step, z0 = gj * step;
  const ha = heightAt(x0, z0), hb = heightAt(x0 + step, z0), hc = heightAt(x0, z0 + step), hd = heightAt(x0 + step, z0 + step);
  if (((gi + gj) & 1) !== 0) {
    return fx + fz <= 1 ? ha + (hb - ha) * fx + (hc - ha) * fz : hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }
  return fz >= fx ? ha + (hd - hc) * fx + (hc - ha) * fz : ha + (hb - ha) * fx + (hd - hb) * fz;
}

// the cabins: one stretch of valley every PERIOD metres may have one, set back on flat ground
export const CABIN_PERIOD = 850;
const cabinCache = new Map();
export function cabinSite(k) {
  if (cabinCache.has(k)) return cabinCache.get(k);
  let out = null;
  if (hash2(k, 911) >= 0.25) {
    const z = k * CABIN_PERIOD + 200 + hash2(k, 3) * 400;
    const side = hash2(k, 7) < 0.5 ? -1 : 1;
    const nn = { x: 0, y: 1, z: 0 };
    for (let tries = 0; tries < 10 && !out; tries++) {
      const off = side * (55 + tries * 14 + hash2(k, tries) * 20);
      const x = lineX(z) + off;
      normalAt(x, z, nn, 4);
      if (nn.y > 0.95) out = { x, z, y: heightAt(x, z), yaw: Math.atan2(-off, 0) + (hash2(k, 5) - 0.5) * 0.6 };
    }
  }
  if (cabinCache.size > 200) cabinCache.clear();
  cabinCache.set(k, out);
  return out;
}
function nearCabin(x, z) {
  const k = Math.floor(z / CABIN_PERIOD);
  for (const kk of [k - 1, k, k + 1]) {
    const c = cabinSite(kk);
    if (c && Math.abs(c.x - x) < 14 && Math.abs(c.z - z) < 14) return true;
  }
  return false;
}
