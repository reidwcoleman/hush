// Textures painted in code: the spruce bough card, the bark, the far-tree card, the ski top sheet.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// one drooping spruce bough seen from above: a twig, side shoots, dense needles
export function boughTexture() {
  const W = 256, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const r = rng(91);
  g.clearRect(0, 0, W, H);
  g.lineCap = 'round';
  // v runs from the trunk (bottom, v=0) to the tip (top)
  const spine = (t) => [W / 2 + Math.sin(t * 3.1) * 6, H - t * H * 0.97];
  const width = (t) => (0.22 + 0.78 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62)) * (1 - t * 0.55);
  // the bough's body: a dark mass under the needles so the card reads solid
  g.fillStyle = 'rgb(30,48,36)';
  g.beginPath();
  for (let i = 0; i <= 60; i++) { const t = i / 60; const [x, y] = spine(t); g.lineTo(x - width(t) * W * 0.36, y); }
  for (let i = 60; i >= 0; i--) { const t = i / 60; const [x, y] = spine(t); g.lineTo(x + width(t) * W * 0.36, y); }
  g.closePath(); g.fill();
  // needles: many short strokes, darker inside, lighter at the tips
  for (let pass = 0; pass < 3; pass++) {
    const n = [3800, 3000, 1200][pass];
    for (let i = 0; i < n; i++) {
      const t = Math.pow(r(), 0.85);
      const [sx, sy] = spine(t);
      const side = r() < 0.5 ? -1 : 1;
      const w = width(t) * W * 0.47;
      const off = Math.pow(r(), 0.7) * w;
      const x = sx + side * off;
      const y = sy + (r() - 0.5) * 18 - off * 0.35;
      const len = 7 + r() * 9;
      const ang = -Math.PI / 2 + side * (0.6 + r() * 0.7);
      const shade = pass === 0 ? 0.55 : pass === 1 ? 0.8 : 1.0;
      const gr = (38 + r() * 20) * shade, gg = (66 + r() * 34) * shade, gb = (46 + r() * 18) * shade;
      g.strokeStyle = `rgb(${gr | 0},${gg | 0},${gb | 0})`;
      g.lineWidth = 1.6 + r() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
  }
  // the twig
  g.strokeStyle = 'rgb(62,44,30)';
  g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i <= 40; i++) { const [x, y] = spine((i / 40) * 0.92); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function barkTexture() {
  const W = 128, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const r = rng(5);
  g.fillStyle = 'rgb(58,44,34)';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = r() * H;
    const c = 30 + r() * 50;
    g.fillStyle = `rgba(${c + 20 | 0},${c + 8 | 0},${c | 0},0.5)`;
    g.fillRect(x, y, 2 + r() * 6, 1 + r() * 3);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ski top sheet: a calm two-tone design with a thin pinstripe
export function skiTexture(base = '#e9e2d4', accent = '#c4562f', ink = '#22262b') {
  const W = 64, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  g.fillStyle = accent; g.fillRect(0, H * 0.62, W, H * 0.38);
  g.fillStyle = ink; g.fillRect(0, H * 0.6, W, 6);
  g.fillRect(W / 2 - 1, 0, 2, H * 0.6);
  g.globalAlpha = 0.85;
  g.fillStyle = ink;
  g.font = 'italic 700 34px Georgia, serif';
  g.save(); g.translate(W / 2 + 12, H * 0.22); g.rotate(Math.PI / 2); g.fillText('hush', 0, 0); g.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// a soft dot for the snow particles
export function dotTexture() {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (let i = 0; i <= 8; i++) { const r = i / 8; gr.addColorStop(r, `rgba(255,255,255,${Math.exp(-r * r * 4.5).toFixed(3)})`); }
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  return t;
}
