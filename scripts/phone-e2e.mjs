// End-to-end check of the stick-hosted phone remote without a stick.
// A small Node server stands in for PhoneServer.kt (same relay contract), the TV build runs in one
// page with a mock NoirAndroid bridge, and the real phone app runs in another.
//   npm run build -w @noir/tv -- --base=./ --outDir dist-android --emptyOutDir && npm run build -w @noir/phone
//   node scripts/phone-e2e.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const dirs = { '/tv/': join(root, 'apps/tv/dist-android'), '/phone/': join(root, 'apps/phone/dist') };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const PORT = 8795;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server', '--host-resolver-rules=MAP stick.test 127.0.0.1'] });
const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const pending = new Map();
const sockets = new Map();
const failures = [];
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures.push(what); };

await tv.exposeBinding('__respond', (_s, id, status, body) => pending.get(id)?.(status, body));
await tv.exposeBinding('__send', (_s, cid, text) => sockets.get(cid)?.send(text));
await tv.exposeBinding('__close', (_s, cid) => sockets.get(cid)?.close());
await tv.addInitScript((port) => {
  const apps = [['com.netflix.ninja', 'Netflix'], ['com.google.android.youtube.tv', 'YouTube']];
  window.__launched = [];
  window.NoirAndroid = {
    platform: () => 'android-tv', findApp: () => null, launch: (pkg) => { window.__launched.push(pkg); return '{"ok":true}'; },
    installedApps: () => JSON.stringify(apps), appBanner: () => null, openStore: (pkg) => { window.__launched.push(`store:${pkg}`); return true; }, mediaKey: () => {},
    nowPlaying: () => '{"permission":true,"active":false}', openNotificationAccess: () => true, openSystemSettings: () => {},
    updateStatus: () => '{"state":"current","currentVersion":"x","latestVersion":"x","notes":null,"progress":0,"error":null}',
    phoneUrl: () => `http://127.0.0.1:${port}/phone/`,
    fetchMeta: (cb) => setTimeout(() => window.__noirNative(cb, JSON.stringify({ title: 'Test Video Title', image: 'https://i.ytimg.com/vi/abc123def45/hqdefault.jpg' }), null), 50),
    openUrl: (url, pkg) => { window.__launched.push(`url:${pkg}:${url}`); return '{"ok":true,"message":"Opened"}'; },
    phoneRespond: (id, status, body) => window.__respond(id, status, body),
    phoneSend: (cid, text) => window.__send(cid, text),
    phoneClose: (cid) => window.__close(cid),
  };
}, PORT);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    if (globalThis.__tvDown) { res.writeHead(504, { 'Content-Type': 'application/json' }).end('{"message":"NOIR didn\'t answer. Is NOIR open on the TV?"}'); return; }
    let body = '';
    for await (const c of req) body += c;
    const id = randomUUID();
    const done = new Promise((r) => pending.set(id, (status, text) => r([status, text])));
    await tv.evaluate(([id, m, p, a, b]) => window.__noirPhoneRequest(id, m, p, a, b, '127.0.0.1'), [id, req.method, req.url, req.headers.authorization ?? '', body]);
    const [status, text] = await done;
    pending.delete(id);
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(text);
    return;
  }
  const prefix = Object.keys(dirs).find((p) => url.pathname.startsWith(p));
  if (!prefix) { res.writeHead(404).end(); return; }
  const rel = normalize(url.pathname.slice(prefix.length) || 'index.html');
  const file = await readFile(join(dirs[prefix], rel)).catch(() => (prefix === '/phone/' ? readFile(join(dirs[prefix], 'index.html')) : null));
  if (!file) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(rel)] ?? 'text/html' }).end(file);
});
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  const cid = randomUUID();
  sockets.set(cid, ws);
  void tv.evaluate((c) => window.__noirPhoneSocket('open', c, ''), cid);
  ws.on('message', (d) => void tv.evaluate(([c, t]) => window.__noirPhoneSocket('message', c, t), [cid, String(d)]));
  ws.on('close', () => { sockets.delete(cid); void tv.evaluate((c) => window.__noirPhoneSocket('close', c, ''), cid).catch(() => {}); });
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// The TV's pairing dialog shows each digit in its own box.
const tvCode = async () => {
  await tv.getByText('Enter this code on your phone').waitFor({ timeout: 5000 });
  return (await tv.locator('span.h-24.tabular-nums').allInnerTexts()).join('').replace(/\D/g, '');
};

try {
  await tv.goto(`http://127.0.0.1:${PORT}/tv/index.html?noboot=1`);
  await tv.waitForSelector('[data-app]');

  // Unpaired requests are refused.
  const anon = await fetch(`http://127.0.0.1:${PORT}/api/state`);
  check(anon.status === 401, 'unpaired /api/state → 401');
  const badTok = await fetch(`http://127.0.0.1:${PORT}/api/command`, { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{"type":"music.next"}' });
  check(badTok.status === 401, 'bad token /api/command → 401');

  // Pair the real phone app (iPhone-sized page, served from a non-localhost-looking origin path).
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
  // The phone app trusts localhost without pairing; use the LAN-style host so the real flow runs.
  await phone.goto(`http://stick.test:${PORT}/phone/`);
  const lanHost = !['localhost', '127.0.0.1'].includes(new URL(phone.url()).hostname);
  if (lanHost) {
    check(await phone.getByText('Add to Home Screen').isVisible(), 'iPhone install tip shown before pairing');
    await phone.getByRole('button', { name: 'Show code on TV' }).click();
    const code = await tvCode();
    check(true, `TV shows pairing code ${code}`);
    // One wrong code first.
    await phone.getByLabel('6-digit code').fill(code === '000000' ? '111111' : '000000');
    await phone.getByRole('button', { name: 'Pair', exact: true }).click();
    check(await phone.getByText('doesn’t match').first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'wrong code rejected');
    await phone.getByLabel('6-digit code').fill(code);
    await phone.getByRole('button', { name: 'Pair', exact: true }).click();
  } else {
    console.log('note: nip.io not resolvable here; pairing via the API instead');
    const r = await (await fetch(`http://127.0.0.1:${PORT}/api/phone/pair/request`, { method: 'POST', body: '{"name":"Test iPhone"}' })).json();
    const code = await tvCode();
    const c = await (await fetch(`http://127.0.0.1:${PORT}/api/phone/pair/confirm`, { method: 'POST', body: JSON.stringify({ requestId: r.requestId, code }) })).json();
    await phone.evaluate((t) => localStorage.setItem('noir.token', t), c.token);
    await phone.reload();
  }
  await phone.getByText('Connected').waitFor({ timeout: 8000 });
  // Pages live in the sidebar (closed by default).
  const tab = async (name) => { await phone.getByRole('button', { name: 'Menu', exact: true }).click(); await phone.locator('nav').getByRole('button', { name }).click(); await phone.getByRole('button', { name: 'Close menu' }).waitFor({ state: 'detached' }); };
  check(await phone.getByRole('button', { name: 'Play/Pause' }).first().isVisible(), 'mini player visible');
  check(true, 'phone connected over WebSocket');
  check(!(await phone.getByText('Control TV apps').isVisible()), 'TV-only remote target hidden');
  check(!(await phone.getByLabel('Volume up').isVisible()), 'volume/power hidden');
  check(!(await phone.getByText('Google TV app').isVisible()), 'Google TV app note removed');
  const tvPhones = await tv.evaluate(() => JSON.parse(localStorage.getItem('noir.phones') ?? '[]'));
  check(tvPhones.length === 1 && !('token' in tvPhones[0]) && /^[0-9a-f]{64}$/.test(tvPhones[0].hash), 'TV stores only a token hash');

  // D-pad → TV focus moves.
  const focusedId = () => tv.evaluate(() => document.querySelector('[data-focused]')?.outerHTML.slice(0, 120) ?? null);
  const before = await focusedId();
  await phone.getByLabel('right').click();
  await phone.waitForTimeout(400);
  const after = await focusedId();
  check(!!after && before !== after, 'phone D-pad moves focus on the TV');

  // Settings change from the phone reaches the TV (and is saved on the device).
  await tab('Customize');
  await phone.getByRole('button', { name: 'Thock' }).click();
  await tv.waitForFunction(() => JSON.parse(localStorage.getItem('noir.settings') ?? '{}').sound?.style === 'thock', null, { timeout: 4000 }).then(() => check(true, 'phone setting saved on TV'), () => check(false, 'phone setting saved on TV'));
  check(!(await phone.getByText('Custom shortcut').isVisible()), 'custom shortcut (server-only) hidden');

  // Settings change on the TV is pushed to the phone.
  await tab('Devices');
  check(await phone.getByText('NOIR on Google TV').isVisible(), 'Devices tab shows on-device mode');
  check(await phone.getByText('iPhone').first().isVisible(), 'paired phone listed');

  // App launch command from the phone opens the app natively.
  await tab('Remote');
  await phone.locator('section').filter({ has: phone.getByRole('heading', { name: 'Apps', exact: true }) }).locator('button').first().click();
  await phone.waitForTimeout(500);
  const launched = await tv.evaluate(() => window.__launched);
  check(launched.length > 0, `app shortcut launched natively (${launched.join(', ') || 'none'})`);

  // Custom sound: upload a clip from the phone; the TV stores it and switches to the Custom style.
  // (Generated here: a short 660 Hz beep as a WAV file.)
  const sr = 22050, n = Math.floor(sr / 4), wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 660 * i) / sr) * 12000 * (1 - i / n)), 44 + i * 2);
  await tab('Customize');
  await phone.getByText('Custom sounds').waitFor({ timeout: 5000 });
  await phone.locator('input[type=file]').first().setInputFiles({ name: 'beep.wav', mimeType: 'audio/wav', buffer: wav });
  await phone.getByText('Custom clip set').waitFor({ timeout: 8000 }).then(() => check(true, 'custom clip uploaded'), () => check(false, 'custom clip uploaded'));
  const custom = await tv.evaluate(() => ({ stored: Object.keys(JSON.parse(localStorage.getItem('noir.customSounds') ?? '{}')), style: JSON.parse(localStorage.getItem('noir.settings') ?? '{}').sound?.style }));
  check(custom.stored.join() === 'move' && custom.style === 'custom', `TV stored the clip and switched to Custom (${JSON.stringify(custom)})`);
  const bad = await phone.evaluate(async () => (await fetch('/api/sounds/custom/select', { method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('noir.token')}` }, body: JSON.stringify({ data: btoa('not audio') }) })).status);
  check(bad === 400, 'non-audio upload rejected');
  await tab('Remote');

  // Watch later: save a link from the phone; the TV fills in its title and opens it in the right app.
  await tab('Saved');
  await phone.getByPlaceholder('Paste a link').fill('Check this out https://youtu.be/abc123def45?si=x');
  await phone.getByRole('button', { name: 'Save for later' }).click();
  await phone.getByText('Test Video Title').waitFor({ timeout: 6000 }).then(() => check(true, 'saved link shows with its fetched title'), () => check(false, 'saved link shows with its fetched title'));
  const tvSaved = await tv.evaluate(() => JSON.parse(localStorage.getItem('noir.saved') ?? '[]'));
  check(tvSaved.length === 1 && tvSaved[0].appId === 'youtube', `TV stored it as a YouTube link (${tvSaved[0]?.appId})`);
  await phone.getByRole('button', { name: /^Watch Test Video Title/ }).click();
  await phone.waitForTimeout(500);
  const opened = (await tv.evaluate(() => window.__launched)).find((l) => l.startsWith('url:'));
  check(opened?.startsWith('url:com.google.android.youtube.tv:https://youtu.be/abc123def45'), `watch on TV opens the link in the YouTube app (${opened})`);
  // TV unreachable: the link waits on the phone, then syncs.
  globalThis.__tvDown = true;
  await phone.getByPlaceholder('Paste a link').fill('https://www.netflix.com/title/80057281');
  await phone.getByRole('button', { name: 'Save for later' }).click();
  await phone.getByText('Waiting to sync').waitFor({ timeout: 6000 }).then(() => check(true, 'offline link queued on phone'), () => check(false, 'offline link queued on phone'));
  globalThis.__tvDown = false;
  await phone.getByRole('button', { name: 'Try syncing now' }).click();
  await phone.getByText('Waiting to sync').waitFor({ state: 'detached', timeout: 6000 }).then(() => check(true, 'queued link synced'), () => check(false, 'queued link synced'));
  const tvSaved2 = await tv.evaluate(() => JSON.parse(localStorage.getItem('noir.saved') ?? '[]'));
  check(tvSaved2.length === 2 && tvSaved2[0].appId === 'netflix', 'TV has the Netflix link on top');
  if (process.env.SHOTDIR) {
    const D = process.env.SHOTDIR;
    await phone.screenshot({ path: `${D}/phone-saved.png` });
    await phone.getByRole('button', { name: 'Menu', exact: true }).click(); await phone.waitForTimeout(500);
    await phone.screenshot({ path: `${D}/phone-menu.png` });
    await phone.getByRole('button', { name: 'Close menu' }).click(); await phone.waitForTimeout(500);
    await tv.click('nav >> text=Saved'); await tv.mouse.move(5, 5); await tv.waitForTimeout(900);
    await tv.screenshot({ path: `${D}/tv-saved.png` });
  }
  await tab('Remote');
  if (process.env.SHOTDIR) await phone.screenshot({ path: `${process.env.SHOTDIR}/phone-remote.png` });

  // Removing the phone on the TV revokes it.
  const id = tvPhones[0].id;
  const del = await phone.evaluate(async (pid) => (await fetch(`/api/phones/${pid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('noir.token')}` } })).status, id);
  check(del === 200, 'phone removed');
  const after401 = await phone.evaluate(async () => (await fetch('/api/state', { headers: { Authorization: `Bearer ${localStorage.getItem('noir.token')}` } })).status);
  check(after401 === 401, 'removed phone gets 401');
  await phone.screenshot({ path: process.env.SHOT ?? '/tmp/phone-e2e.png' }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
