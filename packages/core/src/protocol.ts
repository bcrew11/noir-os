import { z } from 'zod';
import type { AppDefinition } from './catalog.ts';
import type { MusicState } from './music.ts';
import type { Settings } from './settings.ts';
import { REMOTE_KEYS, type AudioState, type DeviceInfo, type InputSource, type PowerState, type RemoteKey, type TVCapabilities } from './tv.ts';

export const NOIR_VERSION = '0.1.0';

/** Keys understood by the NOIR dashboard's own focus engine. */
export const NAV_KEYS = ['up', 'down', 'left', 'right', 'ok', 'back', 'home', 'playpause'] as const;
export type NavKey = (typeof NAV_KEYS)[number];

/** browser: dev machine. cast: a computer casts/AirPlays the NOIR tab to the TV over Wi‑Fi. external-hdmi: a small computer plugged into the TV. android-tv: NOIR installed as the launcher on a Google TV / Android TV device. */
export type DeploymentMode = 'browser' | 'cast' | 'external-hdmi' | 'android-tv';

export interface TVStatus {
  adapter: 'mock' | 'vizio' | 'none';
  /** True when the adapter answered its last health check. */
  reachable: boolean;
  paired: boolean;
  device: DeviceInfo | null;
  capabilities: TVCapabilities;
  power: PowerState;
  inputs: InputSource[];
  currentInput: string | null;
  audio: AudioState;
  lastError?: string;
  checkedAt: number;
}

export interface LaunchSummary {
  source: 'learned' | 'catalog' | 'manual';
  verified: boolean;
}

export interface PairedPhone {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
}

export interface NoirState {
  version: string;
  /** `demo` means mock hardware and sample music. Always surfaced in the UI. */
  mode: 'demo' | 'live';
  deployment: DeploymentMode;
  settings: Settings;
  tv: TVStatus;
  music: MusicState;
  launch: Record<string, LaunchSummary>;
  customApps: AppDefinition[];
  /** App ids that have an official logo file in assets/icons. */
  logos: Record<string, string>;
  /** Filenames in assets/backgrounds/photos for the photo ambient theme. */
  photos: string[];
  spotify: { configured: boolean; connected: boolean; account?: string; redirectUri?: string };
  weather: { tempC: number; code: number; updatedAt: number } | null;
  phones: PairedPhone[];
}

/* ------------------------------ commands ------------------------------ */

export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tv.key'), key: z.enum(REMOTE_KEYS as [RemoteKey, ...RemoteKey[]]) }),
  z.object({ type: z.literal('tv.volume'), volume: z.number().int().min(0).max(100) }),
  z.object({ type: z.literal('tv.volumeStep'), delta: z.number().int().min(-10).max(10) }),
  z.object({ type: z.literal('tv.mute'), muted: z.boolean().optional() }),
  z.object({ type: z.literal('tv.power'), on: z.boolean() }),
  z.object({ type: z.literal('tv.input'), inputId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('tv.returnToNoir') }),
  z.object({ type: z.literal('app.launch'), appId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('music.playpause') }),
  z.object({ type: z.literal('music.next') }),
  z.object({ type: z.literal('music.previous') }),
  z.object({ type: z.literal('music.transfer'), deviceId: z.string().min(1).max(128) }),
]);
export type Command = z.infer<typeof CommandSchema>;

/* --------------------------- websocket frames -------------------------- */

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), role: z.enum(['tv', 'phone']), token: z.string().max(256).optional() }),
  /** Phone → dashboard navigation (drives NOIR's focus engine, not the TV). */
  z.object({ type: z.literal('nav'), key: z.enum(NAV_KEYS) }),
  z.object({ type: z.literal('activity') }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type Toast = { id: string; tone: 'info' | 'success' | 'warning' | 'error' | 'demo'; title: string; body?: string };

export type ServerMessage =
  | { type: 'welcome'; role: 'tv' | 'phone'; authorized: boolean }
  | { type: 'state'; state: NoirState }
  | { type: 'nav'; key: NavKey }
  | { type: 'toast'; toast: Toast }
  | { type: 'phonePairing'; request: { code: string; expiresAt: number; deviceName: string } | null }
  | { type: 'tvPairing'; stage: 'idle' | 'awaiting-pin' | 'paired' | 'error'; message?: string }
  /** Android TV mode: ask the dashboard (which runs on the device) to open an app natively. */
  | { type: 'launchOnDisplay'; appId: string }
  | { type: 'pong' };
