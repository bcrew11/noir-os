// Renders NOIR's start-up intro to a 1080p60 H.264 video with its sound, for the Android launcher
// to play natively at launch: android/app/src/main/res/raw/boot_intro.mp4
//
// The intro is the same BootIntro component (CSS keyframes). Each frame is captured with every
// animation paused and set to an exact time, at 2x resolution, then downscaled with Lanczos for
// clean anti-aliasing. A tiny temporal dither keeps the dark gradients from banding in 8-bit video.
//
// Needs the Vite dev server (`npm run dev`) and ffmpeg.
//   node scripts/render-boot-video.mjs           (also renders the sound first)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const FPS = 60;
const SECONDS = 7.0;           // the sound's length; the launcher starts fading the video out at ~6.2 s
const root = new URL('..', import.meta.url).pathname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noir-intro-'));
const wav = path.join(tmp, 'boot.wav');

execFileSync('node', [path.join(root, 'scripts/render-boot-sound.mjs'), wav], { stdio: 'inherit', env: process.env });

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-proxy-server', '--force-color-profile=srgb'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:5173/?bootcapture=1');
await page.waitForSelector('.boot-word');
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

const frames = Math.round(SECONDS * FPS);
for (let i = 0; i < frames; i++) {
  const t = (i / FPS) * 1000;
  await page.evaluate((ms) => {
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
  }, t);
  await page.screenshot({ path: path.join(tmp, `f${String(i).padStart(4, '0')}.png`) });
  if (i % 60 === 0) process.stdout.write(`\rframes ${i}/${frames}`);
}
await b.close();
console.log(`\rframes ${frames}/${frames}`);

const out = path.join(root, 'android/app/src/main/res/raw/boot_intro.mp4');
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync('ffmpeg', [
  '-v', 'error', '-y',
  '-framerate', String(FPS), '-i', path.join(tmp, 'f%04d.png'),
  '-i', wav,
  '-vf', 'scale=1920:1080:flags=lanczos,noise=alls=2:allf=t,format=yuv420p',
  '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-preset', 'slow', '-crf', '15', '-tune', 'film',
  '-r', String(FPS), '-g', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
], { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`→ ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
