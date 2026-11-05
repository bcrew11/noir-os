import type { CommandResult, MusicProvider, MusicState, Track } from '@noir/core';

/** Generated gradient "album art" so demo mode ships no third-party artwork. */
export function gradientArt(a: string, b: string, c: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><radialGradient id="g" cx="30%" cy="25%" r="90%"><stop offset="0" stop-color="${c}"/><stop offset=".45" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient><linearGradient id="l" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><path d="M0 290 C120 230 200 330 400 250 L400 400 L0 400Z" fill="url(#l)"/><circle cx="300" cy="110" r="46" fill="#fff" fill-opacity=".12"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEMO_TRACKS: Track[] = [
  { id: 'd1', title: 'Velvet Hour', artist: 'Lumen Fields', album: 'Afterglow Sessions', durationMs: 214_000, artUrl: gradientArt('#6d28d9', '#140a26', '#f0abfc') },
  { id: 'd2', title: 'Night Transit', artist: 'Cassia Vale', album: 'Low Light', durationMs: 187_000, artUrl: gradientArt('#1e3a8a', '#0b0a1a', '#a5b4fc') },
  { id: 'd3', title: 'Amethyst Drift', artist: 'The Quiet Hours', album: 'Slow Weather', durationMs: 242_000, artUrl: gradientArt('#7e22ce', '#1a0b20', '#fbcfe8') },
  { id: 'd4', title: 'Signal & Static', artist: 'Moth Radio', album: 'Long Distance', durationMs: 199_000, artUrl: gradientArt('#0f766e', '#071312', '#c4b5fd') },
  { id: 'd5', title: 'Glasshouse', artist: 'Ondine Reyes', album: 'Mirrors', durationMs: 226_000, artUrl: gradientArt('#9d174d', '#16070f', '#fda4af') },
];

/** Sample-data music source for demo mode. Clearly labelled as such. */
export class DemoMusicProvider implements MusicProvider {
  readonly id = 'demo' as const;
  private index = 0;
  private playing = false;
  private startedAt = 0;
  private offset = 0;
  private recent: Track[] = [];
  private started = false;

  constructor(private readonly now: () => number = Date.now) {}

  private progress(): number {
    return this.playing ? this.offset + (this.now() - this.startedAt) : this.offset;
  }

  /** Advance through tracks that finished while nobody was looking. */
  private settle() {
    let track = DEMO_TRACKS[this.index]!;
    while (this.playing && this.progress() >= track.durationMs) {
      const over = this.progress() - track.durationMs;
      this.pushRecent(track);
      this.index = (this.index + 1) % DEMO_TRACKS.length;
      track = DEMO_TRACKS[this.index]!;
      this.offset = over;
      this.startedAt = this.now();
    }
  }

  private pushRecent(t: Track) {
    this.recent = [t, ...this.recent.filter((r) => r.id !== t.id)].slice(0, 6);
  }

  async getState(): Promise<MusicState> {
    this.settle();
    const track = this.started ? DEMO_TRACKS[this.index]! : null;
    return {
      provider: 'demo',
      providerLabel: 'Demo music',
      connected: true,
      isPlaying: this.playing,
      track,
      progressMs: track ? this.progress() : 0,
      updatedAt: this.now(),
      device: { id: 'demo-speaker', name: 'Living Room (demo)', type: 'Speaker', active: true },
      devices: [
        { id: 'demo-speaker', name: 'Living Room (demo)', type: 'Speaker', active: true },
        { id: 'demo-phone', name: 'Phone (demo)', type: 'Smartphone', active: false },
      ],
      recent: this.recent.length ? this.recent : DEMO_TRACKS.slice(1, 5),
      canControl: true,
      note: 'Sample data — no audio is playing.',
    };
  }

  private result(message: string): CommandResult {
    return { status: 'demo', message };
  }

  async playPause() {
    this.settle();
    if (!this.started) {
      this.started = true;
      this.offset = 0;
    }
    if (this.playing) {
      this.offset = this.progress();
      this.playing = false;
    } else {
      this.startedAt = this.now();
      this.playing = true;
    }
    return this.result(this.playing ? 'Playing (demo)' : 'Paused (demo)');
  }

  private jump(delta: number) {
    this.settle();
    if (this.started) this.pushRecent(DEMO_TRACKS[this.index]!);
    this.started = true;
    this.index = (this.index + delta + DEMO_TRACKS.length) % DEMO_TRACKS.length;
    this.offset = 0;
    this.startedAt = this.now();
  }

  async next() { this.jump(1); return this.result('Next track (demo)'); }
  async previous() {
    if (this.started && this.progress() > 4000) {
      this.offset = 0;
      this.startedAt = this.now();
    } else this.jump(-1);
    return this.result('Previous track (demo)');
  }
  async seek(ms: number) {
    this.offset = Math.max(0, ms);
    this.startedAt = this.now();
    return this.result('Seek (demo)');
  }
  async transfer(deviceId: string) { return this.result(`Playback moved to ${deviceId} (demo)`); }
}
