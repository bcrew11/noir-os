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

  const space = reverb(ctx, 2.8, 2.6);
  const wet = ctx.createGain(); wet.gain.value = 0.32;
  const dry = ctx.createGain(); dry.gain.value = 0.8;
  master.connect(tone);
  tone.connect(dry).connect(dest);
  tone.connect(space).connect(wet).connect(dest);

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
    // Low voices a bit quieter (no rumble), each voice slightly different in level.
    g.gain.value = (target < 120 ? 0.5 : target < 250 ? 0.8 : 1) * (0.6 + r() * 0.4) / VOICES * 2.2;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (r() * 2 - 1) * 0.8;
    o.connect(g).connect(pan).connect(master);
    o.start(0); lfo.start(0);
    o.stop(T.end + 0.1); lfo.stop(T.end + 0.1);
  }
}
