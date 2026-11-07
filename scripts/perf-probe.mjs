// Measures focus-navigation smoothness of the Android (standalone) build under CPU throttling.
// Usage: node scripts/perf-probe.mjs [url] [cpuSlowdown]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:8790/index.html?noboot=1';
const slow = Number(process.argv[3] ?? 6);
// Optional CSS injected after load, for A/B experiments (e.g. disable a feature).
const extraCss = process.argv[4] ?? '';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-proxy-server'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
// Optional settings for A/B runs, e.g. NOIR_SETTINGS='{"sound":{"style":"off"}}'
await page.addInitScript((settings) => { if (settings) localStorage.setItem('noir.settings', settings); }, process.env.NOIR_SETTINGS ?? '');
await page.addInitScript(() => {
  const apps = [['com.google.android.youtube.tvunplugged', 'YouTube TV'], ['com.google.android.youtube.tv', 'YouTube'], ['com.espn.score_center', 'ESPN'], ['com.netflix.ninja', 'Netflix'], ['com.disney.disneyplus', 'Disney+']];
  window.NoirAndroid = { platform: () => 'android-tv', findApp: () => null, launch: () => '{"ok":true}', installedApps: () => JSON.stringify(apps), appBanner: () => null,
    openStore: () => true, mediaKey: () => {}, nowPlaying: () => '{"permission":true,"active":false}', openNotificationAccess: () => true, openSystemSettings: () => {},
    updateStatus: () => '{"state":"current","currentVersion":"x","latestVersion":"x","notes":null,"progress":0,"error":null}' };
});
await page.goto(url.includes('?') ? url : `${url}?noboot=1`);
await page.waitForSelector('[data-app]');
if (extraCss) await page.addStyleTag({ content: extraCss });
await page.waitForTimeout(2500);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
await page.evaluate(() => {
  window.__frames = []; let last = performance.now();
  const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__run) requestAnimationFrame(tick); };
  window.__run = true; requestAnimationFrame(tick);
});
await b.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
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
// Main-thread rendering cost while navigating, from the trace (ms, at the throttled CPU speed).
const trace = JSON.parse((await b.stopTracing()).toString());
const sum = (names) => trace.traceEvents.filter((e) => names.includes(e.name) && e.dur).reduce((t, e) => t + e.dur / 1000, 0);
const cost = { paint: sum(['Paint']), raster: sum(['RasterTask']), styleLayout: sum(['UpdateLayoutTree', 'Layout']), layers: sum(['UpdateLayer', 'UpdateLayerTree', 'Layerize', 'PrePaint']), script: sum(['FunctionCall', 'EvaluateScript']) };
const sorted = [...frames].sort((a, b) => a - b);
const pct = (p) => sorted[Math.floor(sorted.length * p)]?.toFixed(1);
console.log(JSON.stringify({
  cpuSlowdown: slow, frames: frames.length,
  medianFrameMs: pct(0.5), p95FrameMs: pct(0.95), worstFrameMs: sorted.at(-1)?.toFixed(1),
  jankyFrames: frames.filter((f) => f > 34).length,
  keyToPaintMs: { median: [...latency].sort((a, b) => a - b)[5], max: Math.max(...latency) },
  threadMs: Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.round(v)])),
}));
await b.close();
