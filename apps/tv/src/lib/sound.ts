/**
 * Navigation sounds, synthesized with Web Audio (no sample files, nothing licensed).
 * Each style has three variants: move (lightest), select (fuller) and back (lower).
 * The same functions render the preview WAVs in scripts/render-sounds.mjs, so what you audition
 * is exactly what plays on the TV.
 */
export const SOUND_STYLES = {
  off: 'Off',
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
function noise(ctx: Ctx, out: AudioNode, t: number, peak: number, decay: number, filter: { type: BiquadFilterType; freq: number; q?: number }) {
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
  env(ctx, g, t, peak, 0.001, decay);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + decay + 0.02);
}

/** Per-style level trim so every style sounds about equally loud (measured peaks, ~0.3). */
const STYLE_TRIM: Record<SoundStyle, number> = { off: 0, tick: 1.75, glass: 3, wood: 1.1, bubble: 1.5, felt: 0.95 };

/** Schedule one sound on any (online or offline) audio context. */
export function renderSound(ctx: Ctx, dest: AudioNode, style: SoundStyle, kind: SoundKind, t = ctx.currentTime) {
  const k = kind === 'select' ? 1 : kind === 'back' ? 2 : 0;
  const out = ctx.createGain();
  out.gain.value = STYLE_TRIM[style];
  out.connect(dest);
  switch (style) {
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

export function configureSound(style: SoundStyle, volume: number) {
  current = { style, volume };
  if (master) master.gain.value = volume;
  void prerender(style);
}

/** Play a navigation sound. `volume` overrides the setting for this one sound (previews). */
export function playSound(kind: SoundKind, style: SoundStyle = current.style, volume?: number) {
  if (style === 'off') return;
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
