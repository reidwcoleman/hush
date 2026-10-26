// drive the game with real key presses and log what the skier does
// node tools/play.mjs [seconds] [pattern: carve|straight|jumps|auto]
import { chromium } from 'playwright-core';
import { CHROME, ARGS } from './chrome.mjs';
const [secs = '30', pattern = 'carve'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ARGS });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5290}/?fixdpr=1&q=low&${pattern === 'auto' ? 'auto=1&' : ''}z=${process.env.Z ?? 0}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.keyboard.press('KeyX'); // drop in
await page.evaluate(() => { window.__log = []; const g = window.__game; const s = g.skier; const orig = s.emit.bind(s); s.emit = (t, d = {}) => { window.__log.push({ t, ...d, at: performance.now() }); orig(t, d); }; });
const t0 = Date.now();
let i = 0;
const held = new Set();
const hold = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
while ((Date.now() - t0) / 1000 < Number(secs)) {
  const t = (Date.now() - t0) / 1000;
  if (pattern === 'carve') { const ph = Math.floor(t / 1.4) % 2; await hold('ArrowLeft', ph === 0); await hold('ArrowRight', ph === 1); }
  if (pattern === 'jumps') { await hold('Space', (t % 3) < 0.5); const ph = Math.floor(t / 2) % 2; await hold('ArrowLeft', ph === 0 && t % 3 > 2); }
  if (pattern === 'tuck') { await hold('ArrowUp', true); }
  if (pattern === 'brake') { await hold('ArrowDown', (t % 6) > 4); await hold('ArrowUp', (t % 6) < 3); }
  if (i++ % 5 === 0) {
    const st = await page.evaluate(() => { const s = window.__game.skier; return { sp: +s.speed.toFixed(1), edge: +s.edge.toFixed(2), air: s.air, wipe: +s.wipe.toFixed(1), pw: +s.powder.toFixed(2), y: +s.pos.y.toFixed(1), fps: window.__fps?.toFixed(0) }; });
    console.log(t.toFixed(1).padStart(5), JSON.stringify(st));
  }
  await page.waitForTimeout(100);
}
const log = await page.evaluate(() => window.__log.map((e) => ({ ...e, at: undefined })));
const sum = {};
for (const e of log) sum[e.t] = (sum[e.t] ?? 0) + 1;
console.log('events', JSON.stringify(sum));
const airs = log.filter((e) => e.t === 'land').map((e) => +e.airT.toFixed(2)).sort((a, b) => a - b); console.log('airT', JSON.stringify(airs)); console.log(JSON.stringify(log.filter((e) => e.t === 'wipe')));
const stats = await page.evaluate(() => window.__game.stats);
console.log('stats', JSON.stringify(stats));
await page.screenshot({ path: 'shots/play_end.jpg' });
await browser.close();
