/**
 * NOIR's start-up sound (original): a cloud of slightly detuned synth voices drifting at random
 * pitches gathers with the sparks, glides together as the light ignites, and blooms into one warm
 * chord as the wordmark appears, fading as the intro lifts away.
 *
 * Rendered ahead of time by scripts/render-boot-sound.mjs into public/boot-sound.m4a, so the stick
 * only plays a file — no synthesis while the animation runs. Timings follow BootIntro (~6.7 s).
 */

/** Deterministic pseudo-random numbers, so every render is identical. */
function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// The resolved chord: E♭ with a 9th, spread over four octaves (Hz). Kept above ~75 Hz: big, not boomy.
const CHORD = [77.78, 116.54, 155.56, 196.0, 233.08, 311.13, 349.23, 392.0, 466.16, 622.25, 698.46, 783.99, 932.33, 1244.51];
const VOICES = 28;
const T = { gather: 0.1, glideStart: 1.35, glideEnd: 3.3, bloomPeak: 4.4, fadeStart: 5.3, end: 6.9 };

function reverb(ctx: BaseAudioContext, seconds: number, decay: number): ConvolverNode {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  const r = rng(7);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  const c = ctx.createConvolver();
  c.buffer = ir;
  return c;
}

export const BOOT_SOUND_SECONDS = 7.4;

export function renderBootSound(ctx: BaseAudioContext, dest: AudioNode) {
  const r = rng(20251107);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.exponentialRampToValueAtTime(0.35, T.glideStart);           // the cloud swells in
  master.gain.exponentialRampToValueAtTime(1, T.bloomPeak);               // …and blooms
  master.gain.setValueAtTime(1, T.fadeStart);
  master.gain.exponentialRampToValueAtTime(0.0001, T.end);                // lifts away with the intro

  // Warmth: the filter opens as the voices converge (dark cloud → bright chord).
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass'; tone.Q.value = 0.6;
  tone.frequency.setValueAtTime(700, 0);
  tone.frequency.exponentialRampToValueAtTime(1400, T.glideStart);
  tone.frequency.exponentialRampToValueAtTime(5200, T.bloomPeak);
  tone.frequency.exponentialRampToValueAtTime(2600, T.end);

  // Body: a gentle low shelf, with the sub-sonic rumble trimmed so it stays tight, not boomy.
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'lowshelf'; shelf.frequency.value = 160; shelf.gain.value = 3.5;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 34; hp.Q.value = 0.7;
  const space = reverb(ctx, 2.8, 2.6);
  const wet = ctx.createGain(); wet.gain.value = 0.32;
  const dry = ctx.createGain(); dry.gain.value = 0.8;
  master.connect(tone);
  tone.connect(shelf).connect(hp);
  hp.connect(dry).connect(dest);
  hp.connect(space).connect(wet).connect(dest);

  // Sub layer: warm sines on the chord's root and fifth, swelling in with the bloom.
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 77.78; // E♭2
  const sub2 = ctx.createOscillator(); sub2.type = 'sine'; sub2.frequency.value = 116.54; // B♭2
  const subG = ctx.createGain();
  subG.gain.setValueAtTime(0.0001, 0);
  subG.gain.setValueAtTime(0.0001, T.glideStart);
  subG.gain.exponentialRampToValueAtTime(0.035, T.glideEnd);
  subG.gain.exponentialRampToValueAtTime(0.045, T.bloomPeak);
  subG.gain.setValueAtTime(0.045, T.fadeStart);
  subG.gain.exponentialRampToValueAtTime(0.0001, T.end);
  const sub2G = ctx.createGain(); sub2G.gain.value = 0.35;
  sub.connect(subG); sub2.connect(sub2G).connect(subG);
  subG.connect(hp);
  sub.start(0); sub2.start(0); sub.stop(T.end + 0.1); sub2.stop(T.end + 0.1);

  // Punch: a soft low hit as the chord locks in (and the wordmark arrives), felt more than heard.
  const hitAt = T.glideEnd - 0.05;
  const hit = ctx.createOscillator(); hit.type = 'sine';
  hit.frequency.setValueAtTime(110, hitAt);
  hit.frequency.exponentialRampToValueAtTime(77.78, hitAt + 0.12); // settles onto the root, no 808 drop
  const hitG = ctx.createGain();
  hitG.gain.value = 0.0001;
  hitG.gain.setValueAtTime(0.0001, hitAt);
  hitG.gain.exponentialRampToValueAtTime(0.11, hitAt + 0.035);
  hitG.gain.exponentialRampToValueAtTime(0.0001, hitAt + 1.1);
  hit.connect(hitG).connect(hp);
  hitG.connect(space);
  hit.start(hitAt); hit.stop(hitAt + 1.5);

  for (let v = 0; v < VOICES; v++) {
    const target = CHORD[v % CHORD.length]! * (1 + (r() - 0.5) * 0.004); // a hair of detune keeps it alive
    const start = 180 + r() * 260;                                           // the random cloud
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    // Drift around the start pitch while gathering, then glide (with a little overshoot-free ease).
    o.frequency.setValueAtTime(start, 0);
    o.frequency.linearRampToValueAtTime(start * (0.92 + r() * 0.16), T.glideStart * (0.6 + r() * 0.4));
    o.frequency.setValueAtTime(start * (0.95 + r() * 0.1), T.glideStart);
    o.frequency.exponentialRampToValueAtTime(target, T.glideEnd + (r() - 0.5) * 0.5);
    // Slow vibrato that settles as the chord locks in.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 3 + r() * 3;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(start * 0.01, 0);
    depth.gain.linearRampToValueAtTime(target * 0.002, T.glideEnd);
    lfo.connect(depth).connect(o.frequency);

    const g = ctx.createGain();
    // Each voice slightly different in level (the low ones carry real weight).
    g.gain.value = (target < 120 ? 0.9 : target < 250 ? 0.95 : 1) * (0.6 + r() * 0.4) / VOICES * 2.2;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (r() * 2 - 1) * 0.8;
    o.connect(g).connect(pan).connect(master);
    o.start(0); lfo.start(0);
    o.stop(T.end + 0.1); lfo.stop(T.end + 0.1);
  }
}
