import type { CommandResult } from './tv.ts';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artUrl?: string;
  durationMs: number;
}

export interface PlaybackDevice {
  id: string;
  name: string;
  type: string;
  active: boolean;
}

export interface MusicState {
  provider: 'demo' | 'spotify' | 'device' | 'none';
  providerLabel: string;
  /** False when the provider is configured but not signed in / unreachable. */
  connected: boolean;
  isPlaying: boolean;
  track: Track | null;
  progressMs: number;
  /** Server timestamp at which progressMs was measured; clients extrapolate from this. */
  updatedAt: number;
  device: PlaybackDevice | null;
  devices: PlaybackDevice[];
  recent: Track[];
  canControl: boolean;
  /** Shown when controls are disabled or something needs attention. */
  note?: string;
}

export interface MusicProvider {
  readonly id: MusicState['provider'];
  getState(): Promise<MusicState>;
  playPause(): Promise<CommandResult>;
  next(): Promise<CommandResult>;
  previous(): Promise<CommandResult>;
  seek?(positionMs: number): Promise<CommandResult>;
  transfer?(deviceId: string): Promise<CommandResult>;
  dispose?(): void;
}

export const EMPTY_MUSIC: MusicState = {
  provider: 'none',
  providerLabel: 'No source',
  connected: false,
  isPlaying: false,
  track: null,
  progressMs: 0,
  updatedAt: 0,
  device: null,
  devices: [],
  recent: [],
  canControl: false,
};

/** Extrapolate playback progress client-side so we never need to poll per second. */
export function liveProgress(state: MusicState, now = Date.now()): number {
  if (!state.track) return 0;
  const p = state.isPlaying ? state.progressMs + (now - state.updatedAt) : state.progressMs;
  return Math.max(0, Math.min(state.track.durationMs, p));
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
