import { describe, expect, it } from 'vitest';
import { DEMO_TRACKS, DemoMusicProvider } from './demo-music.ts';

describe('DemoMusicProvider', () => {
  it('starts idle, plays, and advances across track boundaries', async () => {
    let now = 1_000_000;
    const p = new DemoMusicProvider(() => now);
    expect((await p.getState()).track).toBeNull();
    expect((await p.playPause()).status).toBe('demo');
    expect((await p.getState()).isPlaying).toBe(true);
    now += DEMO_TRACKS[0]!.durationMs + 5000;
    const s = await p.getState();
    expect(s.track?.id).toBe(DEMO_TRACKS[1]!.id);
    expect(s.progressMs).toBeGreaterThanOrEqual(5000);
    expect(s.note).toMatch(/Sample data/);
  });
});
