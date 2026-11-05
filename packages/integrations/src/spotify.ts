import crypto from 'node:crypto';
import { EMPTY_MUSIC, failed, ok, sent, type CommandResult, type MusicProvider, type MusicState, type PlaybackDevice, type Track } from '@noir/core';

/**
 * Spotify Web API provider (server-side only).
 *
 * - OAuth 2.0 Authorization Code with PKCE; the client secret is never needed.
 * - Spotify requires redirect URIs to use HTTPS or a loopback IP literal
 *   (http://127.0.0.1:PORT/...), so sign-in happens on the machine running the server.
 * - Playback *control* endpoints require Spotify Premium; reading "now playing" does not.
 * - NOIR never plays audio itself; it controls an existing Spotify Connect device.
 */
export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
];

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  account?: string;
}

export interface SpotifyTokenStore {
  load(): SpotifyTokens | null;
  save(tokens: SpotifyTokens | null): void;
}

export interface SpotifyConfig {
  clientId: string;
  redirectUri: string;
}

type FetchFn = typeof fetch;
const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

export function createPkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function spotifyAuthorizeUrl(cfg: SpotifyConfig, challenge: string, state: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES.join(' '),
    state,
  });
  return `${ACCOUNTS}/authorize?${p}`;
}

interface TokenResponse { access_token: string; refresh_token?: string; expires_in: number }

export async function exchangeSpotifyCode(cfg: SpotifyConfig, code: string, verifier: string, f: FetchFn = fetch): Promise<SpotifyTokens> {
  const res = await f(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, code_verifier: verifier }),
  });
  if (!res.ok) throw new Error(`Spotify sign-in failed (${res.status})`);
  const j = (await res.json()) as TokenResponse;
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? '', expiresAt: Date.now() + j.expires_in * 1000 };
}

interface SpotifyImage { url: string; width?: number }
interface SpotifyTrack { id: string; name: string; duration_ms: number; artists?: { name: string }[]; album?: { name: string; images?: SpotifyImage[] } }
interface SpotifyDevice { id: string | null; name: string; type: string; is_active: boolean; is_restricted?: boolean }

const toTrack = (t: SpotifyTrack): Track => ({
  id: t.id,
  title: t.name,
  artist: (t.artists ?? []).map((a) => a.name).join(', '),
  album: t.album?.name,
  // Pick the ~300px image: crisp on a TV widget without oversized downloads.
  artUrl: [...(t.album?.images ?? [])].sort((a, b) => Math.abs((a.width ?? 0) - 300) - Math.abs((b.width ?? 0) - 300))[0]?.url,
  durationMs: t.duration_ms,
});

const toDevice = (d: SpotifyDevice): PlaybackDevice | null =>
  d.id ? { id: d.id, name: d.name, type: d.type, active: d.is_active } : null;

export class SpotifyProvider implements MusicProvider {
  readonly id = 'spotify' as const;
  private recentCache: { at: number; tracks: Track[] } = { at: 0, tracks: [] };
  private premiumNote: string | undefined;

  constructor(private readonly cfg: SpotifyConfig, private readonly store: SpotifyTokenStore, private readonly f: FetchFn = fetch) {}

  get connected() { return !!this.store.load(); }

  private async token(): Promise<string | null> {
    const t = this.store.load();
    if (!t) return null;
    if (t.expiresAt - 60_000 > Date.now()) return t.accessToken;
    const res = await this.f(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: this.cfg.clientId }),
    });
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) this.store.save(null); // revoked
      return null;
    }
    const j = (await res.json()) as TokenResponse;
    const next = { ...t, accessToken: j.access_token, refreshToken: j.refresh_token ?? t.refreshToken, expiresAt: Date.now() + j.expires_in * 1000 };
    this.store.save(next);
    return next.accessToken;
  }

  private async api(method: string, path: string, body?: unknown): Promise<Response | null> {
    const token = await this.token();
    if (!token) return null;
    return this.f(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async getState(): Promise<MusicState> {
    const base: MusicState = { ...EMPTY_MUSIC, provider: 'spotify', providerLabel: 'Spotify', updatedAt: Date.now() };
    const res = await this.api('GET', '/me/player?additional_types=track').catch(() => null);
    if (!res) return { ...base, note: 'Sign in to Spotify in Settings → Music.' };
    if (res.status === 429) return { ...base, connected: true, note: 'Spotify rate limit reached; retrying shortly.' };
    const recent = await this.recent();
    const devices = await this.devices();
    if (res.status === 204) {
      return { ...base, connected: true, devices, recent, canControl: devices.length > 0, note: 'Nothing playing. Start Spotify on a device, then control it here.' };
    }
    if (!res.ok) return { ...base, connected: true, note: `Spotify returned ${res.status}.` };
    const j = (await res.json()) as { is_playing: boolean; progress_ms: number | null; item: SpotifyTrack | null; device: SpotifyDevice | null; timestamp?: number };
    return {
      ...base,
      connected: true,
      isPlaying: j.is_playing,
      track: j.item ? toTrack(j.item) : null,
      progressMs: j.progress_ms ?? 0,
      updatedAt: Date.now(),
      device: j.device ? toDevice(j.device) : null,
      devices,
      recent,
      canControl: !j.device?.is_restricted,
      note: this.premiumNote ?? (j.device?.is_restricted ? 'This device does not accept remote control.' : undefined),
    };
  }

  private async devices(): Promise<PlaybackDevice[]> {
    const r = await this.api('GET', '/me/player/devices').catch(() => null);
    if (!r?.ok) return [];
    const j = (await r.json()) as { devices: SpotifyDevice[] };
    return j.devices.map(toDevice).filter((d): d is PlaybackDevice => !!d);
  }

  private async recent(): Promise<Track[]> {
    if (Date.now() - this.recentCache.at < 120_000) return this.recentCache.tracks;
    const r = await this.api('GET', '/me/player/recently-played?limit=8').catch(() => null);
    if (!r?.ok) return this.recentCache.tracks;
    const j = (await r.json()) as { items: { track: SpotifyTrack }[] };
    const seen = new Set<string>();
    const tracks = j.items.map((i) => toTrack(i.track)).filter((t) => !seen.has(t.id) && seen.add(t.id)).slice(0, 6);
    this.recentCache = { at: Date.now(), tracks };
    return tracks;
  }

  private async control(method: string, path: string, label: string, body?: unknown): Promise<CommandResult> {
    const r = await this.api(method, path, body).catch((e: Error) => e);
    if (r instanceof Error) return failed(`Spotify: ${r.message}`);
    if (!r) return failed('Spotify is not connected.');
    if (r.status === 403) {
      this.premiumNote = 'Spotify playback control requires a Premium account.';
      return failed(this.premiumNote);
    }
    if (r.status === 404) return failed('No active Spotify device. Start playback on a device first.');
    if (!r.ok) return failed(`Spotify returned ${r.status}.`);
    // Spotify acknowledges asynchronously; the next state refresh confirms.
    return sent(label);
  }

  async playPause() {
    const st = await this.getState();
    return st.isPlaying ? this.control('PUT', '/me/player/pause', 'Paused') : this.control('PUT', '/me/player/play', 'Playing');
  }
  next() { return this.control('POST', '/me/player/next', 'Next track'); }
  previous() { return this.control('POST', '/me/player/previous', 'Previous track'); }
  seek(ms: number) { return this.control('PUT', `/me/player/seek?position_ms=${Math.round(ms)}`, 'Seek'); }
  async transfer(deviceId: string) {
    const r = await this.control('PUT', '/me/player', 'Playback moved', { device_ids: [deviceId] });
    return r.status === 'sent' ? ok('Playback moved') : r;
  }
}
