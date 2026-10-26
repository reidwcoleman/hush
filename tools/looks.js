// snippets for tools/multi.mjs
window.__lookTree = (dist = 0.55, up = 0.35) => {
  const g = window.__game; g.auto.on = false;
  const p = g.skier.pos; let best = null;
  for (let a = 0; a < 80; a++) { const x = p.x + Math.cos(a) * a * 2, z = p.z + Math.sin(a) * a * 2; const h = g.nearestTree(x, z); if (h && h.kind === 'tree' && (!best || h.s > best.s)) best = h; }
  const tx = best.x - g.ORIGIN.x, tz = best.z - g.ORIGIN.z, ty = best.y - g.ORIGIN.y; const H = 14 * best.s;
  window.__freeCam = { p: [tx + H * dist, ty + H * up, tz + H * dist], l: [tx, ty + H * 0.45, tz], fov: 50 };
};
