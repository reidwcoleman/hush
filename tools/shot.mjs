// node tools/shot.mjs <out.jpg> [query] [waitSeconds] [EVAL=js run before the shot]
import { chromium } from 'playwright-core';
import { CHROME, ARGS } from './chrome.mjs';
const [out = 'shots/shot.jpg', q = 'menu=0&auto=1', wait = '6'] = process.argv.slice(2);
const W = Number(process.env.W ?? 1280), H = Number(process.env.H ?? 720);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ARGS });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[' + m.type() + ']', m.text().slice(0, 400)); });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5290}/?fixdpr=1&${q}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
if (process.env.EVAL) await page.evaluate(process.env.EVAL);
const shots = Number(process.env.N ?? 1);
for (let i = 0; i < shots; i++) {
  await page.waitForTimeout(Number(wait) * 1000);
  const p = shots > 1 ? out.replace(/(\.\w+)$/, `_${i}$1`) : out;
  await page.screenshot({ path: p, quality: 88 });
  const info = await page.evaluate(() => { const g = window.__game; return { fps: window.__fps?.toFixed(1), speed: g.skier.speed.toFixed(1), air: g.skier.air, wipe: g.skier.wipe > 0, h: g.sky.hours.toFixed(2), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }; });
  console.log(p, JSON.stringify(info));
}
await browser.close();
