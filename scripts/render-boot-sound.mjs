// Renders NOIR's start-up sound (apps/tv/src/lib/bootSound.ts) to apps/tv/public/boot-sound.m4a,
// using the browser's Web Audio engine via the Vite dev server (needs `npm run dev`) and ffmpeg.
// Usage: node scripts/render-boot-sound.mjs [preview.wav]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-proxy-server'] });
const page = await b.newPage();
await page.goto('http://localhost:5173/?noboot=1');
const { b64, peak } = await page.evaluate(async () => {
  const m = await import('/src/lib/bootSound.ts');
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * m.BOOT_SOUND_SECONDS), sr);
  m.renderBootSound(ctx, ctx.destination);
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let pk = 0;
  for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const gain = 0.85 / pk; // normalize to -1.4 dBFS
  const n = L.length, bytes = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); bytes.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt ');
  bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
  bytes.setUint32(24, sr, true); bytes.setUint32(28, sr * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
  w(36, 'data'); bytes.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    bytes.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * gain)) * 0x7fff, true);
    bytes.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * gain)) * 0x7fff, true);
  }
  let bin = ''; const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return { b64: btoa(bin), peak: pk };
});
await b.close();

const wav = process.argv[2] ?? path.join(os.tmpdir(), 'noir-boot-sound.wav');
fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
const out = new URL('../apps/tv/public/boot-sound.m4a', import.meta.url).pathname;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '160k', out]);
console.log(`rendered (raw peak ${peak.toFixed(2)}) → ${out} (${Math.round(fs.statSync(out).size / 1024)} KB); preview: ${wav}`);
