/**
 * Navigation sounds, synthesized with Web Audio (no sample files, nothing licensed).
 * Each style has three variants: move (lightest), select (fuller) and back (lower).
 * The same functions render the preview WAVs in scripts/render-sounds.mjs, so what you audition
 * is exactly what plays on the TV.
 */
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
const STYLE_TRIM: Record<SoundStyle, number> = { off: 0, thock: 0.68, tactile: 0.72, creamy: 0.64, tick: 1.75, glass: 3, wood: 1.1, bubble: 1.5, felt: 0.95 };

/** Schedule one sound on any (online or offline) audio context. */
export function renderSound(ctx: Ctx, dest: AudioNode, style: SoundStyle, kind: SoundKind, t = ctx.currentTime) {
  const k = kind === 'select' ? 1 : kind === 'back' ? 2 : 0;
  const out = ctx.createGain();
  out.gain.value = STYLE_TRIM[style];
  out.connect(dest);
  switch (style) {
    /*
     * Keyboard-style sounds are three layers, like a real switch:
     *   body     – low, rounded resonance of keycap + case ("thock")
     *   clack    – muffled bottom-out transient (band-passed, then low-passed so it isn't sharp)
     *   upstroke – a much smaller click ~45ms later as the key returns
     * select = heavier press, back = lower and a touch softer.
     */
    case 'thock': {
      const body = [175, 150, 130][k]!;
      tone(ctx, out, t, body, [0.42, 0.5, 0.4][k]!, [0.055, 0.07, 0.06][k]!, { to: body * 0.72, glide: 0.035, attack: 0.003 });
      tone(ctx, out, t, body * 2.4, 0.1, 0.03, { attack: 0.002 });
      noise(ctx, out, t, [0.34, 0.4, 0.3][k]!, 0.022, { type: 'bandpass', freq: 1150, q: 0.8 }, 0.0025, 2200);
      noise(ctx, out, t + 0.045, 0.08, 0.012, { type: 'bandpass', freq: 1700, q: 1 }, 0.002, 2600);
      break;
    }
    case 'tactile': {
      const body = [260, 230, 200][k]!;
      noise(ctx, out, t, 0.12, 0.008, { type: 'bandpass', freq: 1600, q: 1.2 }, 0.0015, 3000); // tactile bump
      tone(ctx, out, t + 0.012, body, [0.3, 0.38, 0.3][k]!, 0.045, { to: body * 0.75, glide: 0.03, attack: 0.002 });
      noise(ctx, out, t + 0.012, [0.38, 0.44, 0.34][k]!, 0.018, { type: 'bandpass', freq: 2000, q: 1.1 }, 0.0015, 3200);
      noise(ctx, out, t + 0.06, 0.09, 0.012, { type: 'bandpass', freq: 2200, q: 1.1 }, 0.0015, 3200);
      break;
    }
    case 'creamy': {
      const body = [210, 185, 160][k]!;
      tone(ctx, out, t, body, [0.34, 0.42, 0.32][k]!, [0.05, 0.065, 0.055][k]!, { to: body * 0.8, glide: 0.04, attack: 0.004 });
      noise(ctx, out, t, [0.3, 0.36, 0.26][k]!, 0.03, { type: 'lowpass', freq: 1300, q: 0.7 }, 0.004);
      noise(ctx, out, t + 0.05, 0.06, 0.015, { type: 'lowpass', freq: 1700, q: 0.7 }, 0.003);
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
