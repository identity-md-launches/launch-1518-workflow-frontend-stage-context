// Typographic social card only. This does not generate or stand in for collection art.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const font = await readFile(`${root}node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2`);
  await page.setContent(`<style>@font-face{font-family:Space;src:url(data:font/woff2;base64,${font.toString('base64')})}*{box-sizing:border-box}body{margin:0;background:#f4f1e8;color:#20231f;font-family:Space,Arial;padding:70px 80px;height:630px;display:flex;flex-direction:column}header{font-size:28px;display:flex;justify-content:space-between}h1{font-size:110px;letter-spacing:-6px;line-height:1.05;margin:70px 0 25px}p{font-family:Arial;font-size:28px;margin:0}footer{margin-top:auto;border-top:1px solid #a5a99f;padding-top:24px;display:flex;justify-content:space-between;font-family:Arial;font-size:24px}.action{color:#ae351e}</style><header><span>Swarm Cats</span><span>Sepolia</span></header><h1>Mint your Swarm Cat.</h1><p>10,000 PFPs drawn by the IMD swarm.</p><footer><span>Free mint + protocol fee</span><span class="action">Meet the swarm ↗</span></footer>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${root}public/share.png` });
} finally { await browser.close(); }
