// Measures focus-navigation smoothness of the Android (standalone) build under CPU throttling.
// Usage: node scripts/perf-probe.mjs [url] [cpuSlowdown]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:8790/index.html';
const slow = Number(process.argv[3] ?? 6);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-proxy-server'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(() => {
  const apps = [['com.google.android.youtube.tvunplugged', 'YouTube TV'], ['com.google.android.youtube.tv', 'YouTube'], ['com.espn.score_center', 'ESPN'], ['com.netflix.ninja', 'Netflix'], ['com.disney.disneyplus', 'Disney+']];
  window.NoirAndroid = { platform: () => 'android-tv', findApp: () => null, launch: () => '{"ok":true}', installedApps: () => JSON.stringify(apps), appBanner: () => null,
    openStore: () => true, mediaKey: () => {}, nowPlaying: () => '{"permission":true,"active":false}', openNotificationAccess: () => true, openSystemSettings: () => {},
    updateStatus: () => '{"state":"current","currentVersion":"x","latestVersion":"x","notes":null,"progress":0,"error":null}' };
});
await page.goto(url);
await page.waitForSelector('[data-app]'); await page.waitForTimeout(2500);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
await page.evaluate(() => {
  window.__frames = []; let last = performance.now();
  const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__run) requestAnimationFrame(tick); };
  window.__run = true; requestAnimationFrame(tick);
});
const keys = ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'];
const latency = [];
for (const k of keys) {
  const t0 = Date.now();
  await page.keyboard.press(k);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  latency.push(Date.now() - t0);
  await page.waitForTimeout(350);
}
const frames = await page.evaluate(() => { window.__run = false; return window.__frames.slice(1); });
const sorted = [...frames].sort((a, b) => a - b);
const pct = (p) => sorted[Math.floor(sorted.length * p)]?.toFixed(1);
console.log(JSON.stringify({
  cpuSlowdown: slow, frames: frames.length,
  medianFrameMs: pct(0.5), p95FrameMs: pct(0.95), worstFrameMs: sorted.at(-1)?.toFixed(1),
  jankyFrames: frames.filter((f) => f > 34).length,
  keyToPaintMs: { median: [...latency].sort((a, b) => a - b)[5], max: Math.max(...latency) },
}));
await b.close();
