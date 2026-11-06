/**
 * Hardware-neutral television contracts.
 *
 * The dashboard never talks to VIZIO (or any other vendor) directly. It talks to
 * the NOIR server, which owns exactly one TVAdapter. Every adapter publishes a
 * TVCapabilities object so the UI can disable or explain operations that the
 * connected television does not support — instead of pretending they worked.
 */

export type RemoteKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ok'
  | 'back'
  | 'home'
  | 'menu'
  | 'play'
  | 'pause'
  | 'playpause'
  | 'volume_up'
  | 'volume_down'
  | 'mute'
  | 'channel_up'
  | 'channel_down'
  | 'input_next'
  | 'power_on'
  | 'power_off'
  | 'power_toggle';

export const REMOTE_KEYS: readonly RemoteKey[] = [
  'up', 'down', 'left', 'right', 'ok', 'back', 'home', 'menu', 'play', 'pause', 'playpause',
  'volume_up', 'volume_down', 'mute', 'channel_up', 'channel_down', 'input_next',
  'power_on', 'power_off', 'power_toggle',
];

/**
 * How confident we are that a capability works on the connected device.
 * - `verified`: confirmed against this specific TV (e.g. state read back after a command).
 * - `documented`: documented by the vendor or established community projects, not yet confirmed here.
 * - `experimental`: plausible but unconfirmed; UI must label it.
 * - `unsupported`: known not to work, or no path exists.
 */
export type SupportLevel = 'verified' | 'documented' | 'experimental' | 'unsupported';

export interface Capability {
  level: SupportLevel;
  /** Human explanation, shown in the UI when the capability is not plainly available. */
  note?: string;
}

export interface TVCapabilities {
  power: Capability;
  volume: Capability;
  mute: Capability;
  inputs: Capability;
  remoteKeys: Capability;
  appLaunch: Capability;
  /** Reading back state (power/input/volume) after a command, to confirm it took effect. */
  stateReadback: Capability;
}

export interface DeviceInfo {
  name: string;
  manufacturer: string;
  model?: string;
  firmware?: string;
  /** Local API version reported by the TV (e.g. "3.7.3-2640.0001"). */
  apiVersion?: string;
  serial?: string;
  address?: string;
  /** API port the adapter is speaking to, if applicable. */
  port?: number;
}

export type PowerState = 'on' | 'off' | 'standby' | 'unknown';

export interface InputSource {
  /** Stable id used for switching, e.g. "HDMI-1". */
  id: string;
  /** Name reported by the TV (may be generic). */
  systemName: string;
}

export interface AudioState {
  volume: number | null; // 0–100
  muted: boolean | null;
}

export interface CurrentApp {
  /** Opaque launch configuration as reported by the TV. */
  config: Record<string, unknown> | null;
  /** NOIR catalog id when we recognize it. */
  appId?: string;
}

/**
 * Outcome of a command.
 * `sent` means the TV accepted the request; `verified` means we read the state back
 * and confirmed the change. Never report `verified` without a read-back.
 */
export type CommandStatus = 'verified' | 'sent' | 'unsupported' | 'failed' | 'demo';

export interface CommandResult {
  status: CommandStatus;
  message: string;
  /** Extra machine-readable detail (e.g. the state that was read back). */
  detail?: Record<string, unknown>;
}

export const ok = (message: string, detail?: Record<string, unknown>): CommandResult => ({ status: 'verified', message, detail });
export const sent = (message: string, detail?: Record<string, unknown>): CommandResult => ({ status: 'sent', message, detail });
export const unsupported = (message: string): CommandResult => ({ status: 'unsupported', message });
export const failed = (message: string, detail?: Record<string, unknown>): CommandResult => ({ status: 'failed', message, detail });

/** A launch configuration for an app on a specific platform. Opaque to the UI. */
export interface LaunchConfig {
  platform: string; // e.g. "vizio-smartcast"
  config: Record<string, unknown>;
  /** Where this config came from — `learned` configs were captured from the user's own TV. */
  source: 'learned' | 'catalog' | 'manual';
  /** True once the user has confirmed a launch succeeded on their TV. */
  verified: boolean;
}

export interface TVAdapter {
  readonly kind: 'mock' | 'vizio' | 'none';
  getCapabilities(): Promise<TVCapabilities>;
  getDeviceInfo(): Promise<DeviceInfo>;
  getPowerState(): Promise<PowerState>;
  getInputs(): Promise<InputSource[]>;
  getCurrentInput(): Promise<string | null>;
  getAudio(): Promise<AudioState>;
  getCurrentApp(): Promise<CurrentApp>;
  setVolume(volume: number): Promise<CommandResult>;
  setMuted(muted: boolean): Promise<CommandResult>;
  setPower(on: boolean): Promise<CommandResult>;
  switchInput(inputId: string): Promise<CommandResult>;
  launchApp(launch: LaunchConfig): Promise<CommandResult>;
  sendRemoteKey(key: RemoteKey): Promise<CommandResult>;
}

/** Capabilities for "no TV connected" — everything explains itself. */
export const NO_TV_CAPABILITIES: TVCapabilities = {
  power: { level: 'unsupported', note: 'No television is paired. Pair one in Settings → Devices.' },
  volume: { level: 'unsupported', note: 'No television is paired.' },
  mute: { level: 'unsupported', note: 'No television is paired.' },
  inputs: { level: 'unsupported', note: 'No television is paired.' },
  remoteKeys: { level: 'unsupported', note: 'No television is paired.' },
  appLaunch: { level: 'unsupported', note: 'No television is paired, so NOIR cannot open streaming apps.' },
  stateReadback: { level: 'unsupported', note: 'No television is paired.' },
};
