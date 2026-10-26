// node tools/eval.mjs "<js expression>" -- evaluates after 4 s of autopilot riding
import { chromium } from 'playwright-core';
import { CHROME, ARGS } from './chrome.mjs';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ARGS });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type()==='warning') console.log('[c]', m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:5290/?fixdpr=1&menu=0&auto=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.waitForTimeout(4000);
console.log(await page.evaluate(process.argv[2]));
await browser.close();
