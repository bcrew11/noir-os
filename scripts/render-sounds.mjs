// Renders NOIR's navigation sounds to WAV files for auditioning, using the exact same synthesis
// code the TV uses (apps/tv/src/lib/sound.ts, served by the Vite dev server).
// Usage: node scripts/render-sounds.mjs [outDir]   (needs `npm run dev`)
import fs from 'node:fs';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'sounds-preview';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-proxy-server'] });
const page = await b.newPage();
await page.goto('http://localhost:5173/');
const files = await page.evaluate(async () => {
  const m = await import('/src/lib/sound.ts');
  const sr = 44100;
  // A short demo phrase: move, move, move, select, … back.
  const phrase = [[0, 'move'], [0.32, 'move'], [0.64, 'move'], [1.05, 'select'], [1.75, 'back']];
  const result = {};
  for (const style of Object.keys(m.SOUND_STYLES).filter((s) => s !== 'off')) {
    const ctx = new OfflineAudioContext(1, sr * 2.3, sr);
    const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    for (const [t, kind] of phrase) m.renderSound(ctx, master, style, kind, t + 0.05);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    // 16-bit PCM WAV
    const bytes = new DataView(new ArrayBuffer(44 + data.length * 2));
    const w = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); bytes.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVEfmt ');
    bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
    bytes.setUint32(24, sr, true); bytes.setUint32(28, sr * 2, true); bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true);
    w(36, 'data'); bytes.setUint32(40, data.length * 2, true);
    let peak = 0;
    for (let i = 0; i < data.length; i++) { const v = Math.max(-1, Math.min(1, data[i])); peak = Math.max(peak, Math.abs(v)); bytes.setInt16(44 + i * 2, v * 0x7fff, true); }
    let bin = ''; const u8 = new Uint8Array(bytes.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    result[`${Object.keys(m.SOUND_STYLES).indexOf(style)}-${style}`] = { b64: btoa(bin), peak };
  }
  return result;
});
for (const [name, { b64, peak }] of Object.entries(files)) {
  fs.writeFileSync(`${out}/noir-sound-${name}.wav`, Buffer.from(b64, 'base64'));
  console.log(`${name}: peak ${peak.toFixed(2)}`);
}
await b.close();
