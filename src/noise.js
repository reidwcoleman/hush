// Seeded 2D simplex noise plus the fbm / ridged variants the mountain is made of.
// Runs on the main thread (physics) and in the terrain workers, so it must stay pure.

export function makeNoise(seed = 1) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const GX = new Float32Array([1, -1, 1, -1, 1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071]);
  const GY = new Float32Array([0, 0, 0, 0, 1, 1, -1, -1, 0.7071, 0.7071, -0.7071, -0.7071]);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;

  // simplex noise, roughly -1..1
  function n2(x, y) {
    const sk = (x + y) * F2;
    const i = Math.floor(x + sk), j = Math.floor(y + sk);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, tt, g;
    tt = 0.5 - x0 * x0 - y0 * y0;
    if (tt > 0) { g = perm[ii + perm[jj]] % 12; tt *= tt; n += tt * tt * (GX[g] * x0 + GY[g] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1;
    if (tt > 0) { g = perm[ii + i1 + perm[jj + j1]] % 12; tt *= tt; n += tt * tt * (GX[g] * x1 + GY[g] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2;
    if (tt > 0) { g = perm[ii + 1 + perm[jj + 1]] % 12; tt *= tt; n += tt * tt * (GX[g] * x2 + GY[g] * y2); }
    return 70 * n;
  }

  function fbm(x, y, oct = 5, lac = 2.03, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += a * n2(x * f + o * 17.3, y * f - o * 9.1);
      norm += a; a *= gain; f *= lac;
    }
    return sum / norm;
  }

  // sharp crests, 0..1: the far ranges
  function ridged(x, y, oct = 6) {
    let a = 0.5, f = 1, sum = 0, prev = 1;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(n2(x * f + o * 31.7, y * f + o * 11.3));
      v *= v;
      sum += v * a * prev;
      prev = Math.min(1, v * 1.6);
      a *= 0.5; f *= 2.05;
    }
    return sum;
  }

  return { n2, fbm, ridged };
}

// cheap deterministic hash of two ints, 0..1
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
