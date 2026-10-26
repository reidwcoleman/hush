// several looks from one session: node tools/multi.mjs <prefix> "<label>|<js>" ...
import { chromium } from 'playwright-core';
import { CHROME, ARGS } from './chrome.mjs';
const [prefix, ...shots] = process.argv.slice(2);
const W = Number(process.env.W ?? 1280), H = Number(process.env.H ?? 720);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ARGS });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5290}/?fixdpr=1&${process.env.Q ?? 'menu=0&auto=1'}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.addScriptTag({ path: new URL('./looks.js', import.meta.url).pathname });
await page.waitForTimeout(Number(process.env.SETTLE ?? 3000));
for (const s of shots) {
  const [label, js = '', wait = '2500'] = s.split('@@');
  if (js) await page.evaluate(js);
  await page.waitForTimeout(Number(wait));
  await page.screenshot({ path: `${prefix}_${label}.jpg`, quality: 88 });
  const info = await page.evaluate(() => { const g = window.__game; return { fps: window.__fps?.toFixed(1), sp: g.skier.speed.toFixed(1), h: g.sky.hours.toFixed(2) }; });
  console.log(label, JSON.stringify(info));
}
await browser.close();
