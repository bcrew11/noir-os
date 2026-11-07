/**
 * Navigation sounds, synthesized with Web Audio (no sample files, nothing licensed).
 * Each style has three variants: move (lightest), select (fuller) and back (lower).
 * The same functions render the preview WAVs in scripts/render-sounds.mjs, so what you audition
 * is exactly what plays on the TV.
 */
import { androidBridge } from './android.ts';
export const SOUND_STYLES = {
  off: 'Off',
  thock: 'Thock',
  tactile: 'Tactile',
  creamy: 'Creamy',
  tick: 'Soft tick',
  glass: 'Glass',
  wood: 'Wood',
  bubble: 'Bubble',
  felt: 'Felt',
} as const;
export type SoundStyle = keyof typeof SOUND_STYLES;
export type SoundKind = 'move' | 'select' | 'back';

export const SOUND_HINTS: Record<SoundStyle, string> = {
  off: 'No sounds.',
  thock: 'Deep, smooth keyboard thock — a lubed linear switch in a heavy case.',
  tactile: 'Crisper keyboard clack with a little bump before bottoming out.',
  creamy: 'Soft, muted keyboard press — the gentlest of the three.',
  tick: 'A short, soft click — like a premium watch crown.',
  glass: 'A tiny bell-like ping; select rises, back falls.',
  wood: 'A warm, muted knock.',
  bubble: 'A gentle rising pop.',
  felt: 'A low, cushioned tap — the quietest feel.',
};

type Ctx = BaseAudioContext;

function env(ctx: Ctx, g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(ctx: Ctx, out: AudioNode, t: number, freq: number, peak: number, decay: number, opts: { type?: OscillatorType; to?: number; glide?: number; attack?: number } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.glide ?? decay));
  env(ctx, g, t, peak, opts.attack ?? 0.002, decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + (opts.attack ?? 0.002) + decay + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: Ctx, out: AudioNode, t: number, peak: number, decay: number, filter: { type: BiquadFilterType; freq: number; q?: number }, attack = 0.001, lowpass?: number) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q ?? 1;
  const g = ctx.createGain();
  env(ctx, g, t, peak, attack, decay);
  // Optional second filter rounds off the top end (what makes a click "soft" rather than sharp).
  if (lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = lowpass; lp.Q.value = 0.7;
    src.connect(f).connect(lp).connect(g).connect(out);
  } else src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + decay + 0.02);
}

/** Per-style level trim so every style sounds about equally loud (measured peaks, ~0.3). */
const STYLE_TRIM: Record<SoundStyle, number> = { off: 0, thock: 0.47, tactile: 0.62, creamy: 0.83, tick: 1.75, glass: 3, wood: 1.1, bubble: 1.5, felt: 0.95 };

/** Schedule one sound on any (online or offline) audio context. */
export function renderSound(ctx: Ctx, dest: AudioNode, style: SoundStyle, kind: SoundKind, t = ctx.currentTime) {
  const k = kind === 'select' ? 1 : kind === 'back' ? 2 : 0;
  const out = ctx.createGain();
  out.gain.value = STYLE_TRIM[style];
  out.connect(dest);
  switch (style) {
    /*
     * Keyboard-style sounds, three layers like a real switch — and deliberately *no* pitch drop or
     * sub-bass (a falling low sine is an 808 kick):
     *   body     – hollow keycap/case knock: resonant band-passed noise at ~400–650 Hz, ~30 ms,
     *              low-passed too (a single band-pass leaks a lot of energy into the click range)
     *   clack    – rounded bottom-out transient (band-pass, then low-pass so it isn't sharp)
     *   upstroke – a much smaller click ~45 ms later as the key returns
     * select = slightly heavier press; back = a little lower and softer.
     */
    case 'thock': {
      const body = [560, 510, 460][k]!;
      noise(ctx, out, t, [2.2, 2.6, 2.0][k]!, 0.036, { type: 'bandpass', freq: body, q: 1.5 }, 0.0025, 1100);
      tone(ctx, out, t, body, [0.32, 0.38, 0.3][k]!, 0.028, { attack: 0.002 }); // steady pitch: a knock, not a kick
      noise(ctx, out, t, [1.3, 1.45, 1.15][k]!, 0.018, { type: 'bandpass', freq: 1400, q: 0.9 }, 0.0025, 2600);
      noise(ctx, out, t + 0.045, 0.35, 0.011, { type: 'bandpass', freq: 1800, q: 1 }, 0.002, 3000);
      break;
    }
    case 'tactile': {
      const body = [650, 600, 540][k]!;
      noise(ctx, out, t, 0.45, 0.008, { type: 'bandpass', freq: 1500, q: 1.2 }, 0.0015, 3000); // tactile bump
      noise(ctx, out, t + 0.012, [1.8, 2.2, 1.7][k]!, 0.028, { type: 'bandpass', freq: body, q: 2.6 }, 0.002, 1200);
      tone(ctx, out, t + 0.012, body, [0.15, 0.18, 0.14][k]!, 0.022, { attack: 0.002 });
      noise(ctx, out, t + 0.012, [1.25, 1.4, 1.1][k]!, 0.016, { type: 'bandpass', freq: 2000, q: 1.1 }, 0.0015, 3200);
      noise(ctx, out, t + 0.06, 0.35, 0.011, { type: 'bandpass', freq: 2200, q: 1.1 }, 0.0015, 3200);
      break;
    }
    case 'creamy': {
      const body = [460, 420, 380][k]!;
      noise(ctx, out, t, [1.15, 1.35, 1.0][k]!, 0.04, { type: 'bandpass', freq: body, q: 2.2 }, 0.004, 1000);
      tone(ctx, out, t, body, [0.18, 0.22, 0.16][k]!, 0.03, { attack: 0.004 });
      noise(ctx, out, t, [1.05, 1.2, 0.95][k]!, 0.026, { type: 'bandpass', freq: 1100, q: 0.8 }, 0.004, 1800);
      noise(ctx, out, t + 0.05, 0.22, 0.013, { type: 'bandpass', freq: 1500, q: 0.8 }, 0.003, 2000);
      break;
    }
    case 'tick': {
      const f = [2400, 2000, 1500][k]!;
      noise(ctx, out, t, [0.22, 0.3, 0.22][k]!, 0.012, { type: 'bandpass', freq: 3200, q: 1.4 });
      tone(ctx, out, t, f, [0.12, 0.18, 0.12][k]!, [0.03, 0.05, 0.04][k]!);
      break;
    }
    case 'glass': {
      const base = [2093, 1568, 1568][k]!;
      tone(ctx, out, t, base, 0.09, [0.09, 0.16, 0.12][k]!);
      tone(ctx, out, t, base * 2.76, 0.025, 0.05);
      if (k === 1) tone(ctx, out, t + 0.055, 2349, 0.08, 0.18); // select: second, higher note
      if (k === 2) tone(ctx, out, t + 0.05, 1175, 0.07, 0.14);  // back: second, lower note
      break;
    }
    case 'wood': {
      const f = [820, 700, 560][k]!;
      tone(ctx, out, t, f, [0.28, 0.36, 0.28][k]!, [0.045, 0.06, 0.05][k]!, { to: f * 0.72, glide: 0.03, type: 'triangle' });
      noise(ctx, out, t, 0.12, 0.018, { type: 'bandpass', freq: 1800, q: 2 });
      break;
    }
    case 'bubble': {
      const [from, to] = ([[500, 900], [420, 980], [800, 420]] as const)[k]!;
      tone(ctx, out, t, from, [0.16, 0.22, 0.16][k]!, [0.06, 0.08, 0.07][k]!, { to, glide: 0.045, attack: 0.004 });
      break;
    }
    case 'felt': {
      const f = [260, 220, 180][k]!;
      tone(ctx, out, t, f, [0.32, 0.42, 0.34][k]!, [0.06, 0.08, 0.07][k]!, { to: f * 0.8, glide: 0.05 });
      noise(ctx, out, t, 0.1, 0.03, { type: 'lowpass', freq: 900 });
      break;
    }
    case 'off':
      break;
  }
}

/* ------------------------------ live playback ------------------------------ */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let current: { style: SoundStyle; volume: number } = { style: 'tick', volume: 0.6 };
/**
 * Pre-rendered clips per style. Playing a ready AudioBuffer is a single cheap node, so a key press
 * never pays for building oscillators/filters (measured: ~25% of key-to-paint time at 10x slowdown).
 */
const clips = new Map<SoundStyle, Partial<Record<SoundKind, AudioBuffer>>>();

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      master = ctx.createGain();
      master.gain.value = current.volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

async function prerender(style: SoundStyle) {
  if (style === 'off' || clips.has(style)) return;
  const live = audio();
  if (!live) return;
  const set: Partial<Record<SoundKind, AudioBuffer>> = {};
  clips.set(style, set);
  for (const kind of ['move', 'select', 'back'] as const) {
    const off = new OfflineAudioContext(1, Math.ceil(live.sampleRate * 0.35), live.sampleRate);
    renderSound(off, off.destination, style, kind, 0.005);
    set[kind] = await off.startRendering();
  }
}

/** 16-bit mono WAV, base64 — the format handed to the native player. */
function wavBase64(buf: AudioBuffer, gain: number): string {
  const data = buf.getChannelData(0);
  const bytes = new Uint8Array(44 + data.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i]! * gain)) * 0x7fff, true);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * On the Google TV launcher, hand the current style's clips to Android's SoundPool: the WebView's
 * audio output adds a noticeable delay, the native player doesn't. Volume is baked in.
 */
let nativeFor = '';
const nativeSounds = () => {
  const b = androidBridge();
  return b?.soundLoad && b.soundPlay ? b : null;
};
async function loadNative() {
  const b = nativeSounds();
  const { style, volume } = current;
  const tag = `${style}@${volume}`;
  if (!b || style === 'off' || nativeFor === tag) return;
  await prerender(style);
  const set = clips.get(style);
  if (!set || current.style !== style || current.volume !== volume) return;
  for (const kind of ['move', 'select', 'back'] as const) {
    const clip = set[kind];
    if (clip) b.soundLoad!(kind, wavBase64(clip, volume));
  }
  nativeFor = tag;
}

export function configureSound(style: SoundStyle, volume: number) {
  current = { style, volume };
  if (master) master.gain.value = volume;
  void prerender(style).then(loadNative);
}

/** Play a navigation sound. `volume` overrides the setting for this one sound (previews). */
export function playSound(kind: SoundKind, style: SoundStyle = current.style, volume?: number) {
  if (style === 'off') return;
  // Everyday navigation goes through the native player; previews of other styles/volumes use Web Audio.
  if (volume === undefined && style === current.style && nativeFor === `${style}@${current.volume}`) {
    try { if (nativeSounds()?.soundPlay!(kind, 1)) return; } catch { /* fall back to Web Audio */ }
  }
  const c = audio();
  if (!c || !master) return;
  try {
    let out: AudioNode = master;
    if (volume !== undefined) {
      const g = c.createGain();
      g.gain.value = volume;
      g.connect(c.destination);
      setTimeout(() => g.disconnect(), 1000);
      out = g;
    }
    const clip = clips.get(style)?.[kind];
    if (clip) {
      const src = c.createBufferSource();
      src.buffer = clip;
      src.connect(out);
      src.start();
    } else {
      renderSound(c, out, style, kind); // first press before pre-rendering finishes
      void prerender(style);
    }
  } catch { /* audio unavailable — stay silent */ }
}
