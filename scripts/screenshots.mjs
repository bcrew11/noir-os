// Capture the dashboard at 1080p. Usage: node scripts/screenshots.mjs [baseUrl] [outDir] [scale]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'screenshots';
const scale = Number(process.argv[4] ?? 1);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const key = async (k, wait = 450) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
const shot = async (name) => page.screenshot({ path: `${out}/${name}.png` });

await page.goto(base);
await page.waitForSelector('[data-app]');
await page.waitForTimeout(1800);
await shot('01-home');
await key('ArrowRight'); await key('ArrowRight');
await shot('02-home-focus-espn');
await key('ArrowDown');
await shot('03-home-widgets');
const nav = async (label, wait = 900) => { await page.click(`nav >> text=${label}`); await page.mouse.move(5, 5); await page.waitForTimeout(wait); };
await nav('Apps'); await shot('04-apps');
await nav('Music'); await shot('05-music');
await nav('Inputs'); await shot('06-inputs');
await nav('Settings'); await shot('08-settings');
await key('ArrowDown', 200); await key('ArrowDown', 600); await shot('09-settings-devices');
await nav('Ambient', 2400); await shot('07-ambient');
await key('Escape', 1600);
await key('h', 900); await page.click('[data-app="netflix"]'); await page.waitForTimeout(300); await page.mouse.move(5, 5);
await page.keyboard.down('Enter'); await page.waitForTimeout(800); await page.keyboard.up('Enter'); await page.waitForTimeout(500);
await shot('10-app-options');
await key('Escape');
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
