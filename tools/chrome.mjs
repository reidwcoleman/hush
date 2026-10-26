// the system Chrome for the headless tools (macOS: Metal)
import fs from 'node:fs';
const C = { darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'], linux: ['/usr/bin/google-chrome', '/usr/bin/chromium'] };
export const CHROME = process.env.CHROME ?? (C[process.platform] ?? []).find((p) => fs.existsSync(p)) ?? C.darwin[0];
export const ARGS = [process.platform === 'darwin' ? '--use-angle=metal' : '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
