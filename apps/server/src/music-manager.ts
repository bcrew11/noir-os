import { EMPTY_MUSIC, failed, unsupported, type CommandResult, type MusicProvider, type MusicState, type Settings } from '@noir/core';
import { DemoMusicProvider, SpotifyProvider, createPkcePair, exchangeSpotifyCode, spotifyAuthorizeUrl, type SpotifyTokens } from '@noir/integrations';
import type { ServerConfig } from './config.ts';
import type { Store } from './store.ts';

/** Owns the active music provider, polls it adaptively, and handles Spotify sign-in. */
export class MusicManager {
  state: MusicState = EMPTY_MUSIC;
  private provider: MusicProvider | null = null;
  private readonly demo = new DemoMusicProvider();
  private spotify: SpotifyProvider | null = null;
  private pending = new Map<string, { verifier: string; at: number }>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastSig = '';
  active = false;

  constructor(private readonly cfg: ServerConfig, private readonly store: Store, private readonly opts: { getSettings: () => Settings; onChange: () => void }) {
    if (cfg.spotifyClientId) {
      this.spotify = new SpotifyProvider({ clientId: cfg.spotifyClientId, redirectUri: cfg.spotifyRedirectUri }, {
        load: () => store.getSecret<SpotifyTokens>('spotify'),
        save: (t) => store.setSecret('spotify', t),
      });
    }
    this.selectProvider();
  }

  get spotifyInfo() {
    const t = this.store.getSecret<SpotifyTokens>('spotify');
    return { configured: !!this.spotify, connected: !!t, account: t?.account, redirectUri: this.spotify ? this.cfg.spotifyRedirectUri : undefined };
  }

  selectProvider() {
    const want = this.opts.getSettings().music.provider;
    this.provider = want === 'spotify' ? this.spotify : this.demo;
    void this.refresh();
  }

  /** Poll only while a dashboard or phone is connected. */
  setActive(active: boolean) {
    this.active = active;
    if (active) void this.refresh();
    else clearTimeout(this.timer);
  }

  async refresh() {
    clearTimeout(this.timer);
    let next: MusicState;
    if (!this.provider) {
      next = { ...EMPTY_MUSIC, provider: 'spotify', providerLabel: 'Spotify', updatedAt: Date.now(), note: this.spotify ? 'Sign in to Spotify in Settings → Music.' : 'Spotify isn’t configured on the NOIR server. See docs/SPOTIFY.md.' };
    } else {
      next = await this.provider.getState().catch((e: Error) => ({ ...EMPTY_MUSIC, provider: this.provider!.id, providerLabel: 'Music', updatedAt: Date.now(), note: e.message }));
    }
    const sig = JSON.stringify({ ...next, progressMs: Math.round(next.progressMs / 3000), updatedAt: 0 });
    this.state = next;
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.opts.onChange();
    }
    if (this.active) {
      const isSpotify = this.provider?.id === 'spotify';
      const delay = isSpotify ? (next.isPlaying ? 5000 : 15000) : next.isPlaying && next.track ? Math.min(5000, next.track.durationMs - next.progressMs + 50) : 30000;
      this.timer = setTimeout(() => void this.refresh(), Math.max(1000, delay));
    }
  }

  private async run(fn: (p: MusicProvider) => Promise<CommandResult>) {
    if (!this.provider) return unsupported('No music source is connected.');
    if (!this.state.canControl && this.provider.id === 'spotify') return unsupported(this.state.note ?? 'Playback control is not available.');
    const r = await fn(this.provider).catch((e: Error) => failed(e.message));
    setTimeout(() => void this.refresh(), this.provider.id === 'spotify' ? 600 : 0);
    return r;
  }

  playPause() { return this.run((p) => p.playPause()); }
  next() { return this.run((p) => p.next()); }
  previous() { return this.run((p) => p.previous()); }
  transfer(id: string) { return this.run((p) => (p.transfer ? p.transfer(id) : Promise.resolve(unsupported('This source cannot switch devices.')))); }

  /* ---------------------------- Spotify OAuth --------------------------- */

  spotifyLoginUrl(): string {
    if (!this.cfg.spotifyClientId) throw new Error('Set SPOTIFY_CLIENT_ID on the NOIR server first (see docs/SPOTIFY.md).');
    const { verifier, challenge } = createPkcePair();
    const state = crypto.randomUUID();
    this.pending.set(state, { verifier, at: Date.now() });
    for (const [k, v] of this.pending) if (Date.now() - v.at > 10 * 60_000) this.pending.delete(k);
    return spotifyAuthorizeUrl({ clientId: this.cfg.spotifyClientId, redirectUri: this.cfg.spotifyRedirectUri }, challenge, state);
  }

  async spotifyCallback(code: string, state: string) {
    const p = this.pending.get(state);
    if (!p || !this.cfg.spotifyClientId) throw new Error('Sign-in session expired. Start again from NOIR.');
    this.pending.delete(state);
    const tokens = await exchangeSpotifyCode({ clientId: this.cfg.spotifyClientId, redirectUri: this.cfg.spotifyRedirectUri }, code, p.verifier);
    try {
      const me = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
      if (me.ok) tokens.account = ((await me.json()) as { display_name?: string; id: string }).display_name ?? undefined;
    } catch { /* account name is cosmetic */ }
    this.store.setSecret('spotify', tokens);
    this.selectProvider();
  }

  spotifyDisconnect() {
    this.store.setSecret('spotify', null);
    this.selectProvider();
  }

  stop() {
    clearTimeout(this.timer);
  }
}
