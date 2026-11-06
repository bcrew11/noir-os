import {
  failed, ok, sent, unsupported,
  type AudioState, type Capability, type CommandResult, type CurrentApp, type DeviceInfo, type InputSource,
  type LaunchConfig, type PowerState, type RemoteKey, type TVAdapter, type TVCapabilities,
} from '@noir/core';
import { VizioClient, VizioError, type Transport } from './client.ts';
import { MUTE_OFF, MUTE_ON, VIZIO_KEY_CODES, keyPayload } from './keys.ts';

export const VIZIO_PLATFORM = 'vizio-smartcast';

export const PATHS = {
  deviceInfo: '/state/device/deviceinfo',
  power: '/state/device/power_mode',
  keys: '/key_command/',
  inputs: '/menu_native/dynamic/tv_settings/devices/name_input',
  currentInput: '/menu_native/dynamic/tv_settings/devices/current_input',
  audio: '/menu_native/dynamic/tv_settings/audio',
  volume: '/menu_native/dynamic/tv_settings/audio/volume',
  mute: '/menu_native/dynamic/tv_settings/audio/mute',
  currentApp: '/app/current',
  launchApp: '/app/launch',
} as const;

type Item = Record<string, unknown>;
const items = (r: { ITEMS?: Item[] }) => (Array.isArray(r.ITEMS) ? r.ITEMS : []);
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface VizioAdapterOptions {
  host: string;
  port: number;
  authToken: string;
  transport?: Transport;
  /** Delay before reading state back to verify a command. */
  verifyDelayMs?: number;
}

/**
 * TVAdapter for VIZIO SmartCast / VIZIO OS televisions, using the local HTTPS API.
 *
 * Every write that has a readable result (input, volume, mute, power, app) is followed
 * by a read-back; the result is `verified` only when the TV reports the requested state.
 * Capabilities start at `documented` and are promoted to `verified` once a read-back
 * succeeds on this TV.
 */
export class VizioAdapter implements TVAdapter {
  readonly kind = 'vizio' as const;
  readonly client: VizioClient;
  private readonly verifyDelayMs: number;
  private readonly confirmed = new Set<keyof TVCapabilities>();
  private readonly failedCaps = new Map<keyof TVCapabilities, string>();

  constructor(opts: VizioAdapterOptions) {
    this.client = new VizioClient({ host: opts.host, port: opts.port, authToken: opts.authToken }, opts.transport);
    this.verifyDelayMs = opts.verifyDelayMs ?? 700;
  }

  private cap(key: keyof TVCapabilities, note: string): Capability {
    if (this.failedCaps.has(key)) return { level: 'unsupported', note: this.failedCaps.get(key) };
    if (this.confirmed.has(key)) return { level: 'verified' };
    return { level: 'documented', note };
  }

  private mark(key: keyof TVCapabilities, result: CommandResult) {
    if (result.status === 'verified') {
      this.confirmed.add(key);
      this.failedCaps.delete(key);
    }
    return result;
  }

  private wrapError(e: unknown, what: string): CommandResult {
    if (e instanceof VizioError) return failed(`${what} failed: ${e.message}`, { code: e.code });
    return failed(`${what} failed: ${(e as Error).message}`);
  }

  async getCapabilities(): Promise<TVCapabilities> {
    const community = 'Community-documented SmartCast API; not yet confirmed on this TV.';
    return {
      power: this.cap('power', `${community} Power-on over Wi‑Fi only works if the TV keeps its network awake in standby (Quick Start / Eco settings).`),
      volume: this.cap('volume', community),
      mute: this.cap('mute', community),
      inputs: this.cap('inputs', community),
      remoteKeys: { level: 'documented', note: 'Key presses are sent but cannot be confirmed by the TV.' },
      appLaunch: this.cap('appLaunch', 'Launch IDs are learned from your TV per app. Unlearned apps cannot be launched.'),
      stateReadback: this.cap('stateReadback', community),
    };
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const r = await this.client.get(PATHS.deviceInfo);
    const v = (items(r)[0]?.VALUE ?? {}) as Item;
    this.confirmed.add('stateReadback');
    return {
      // Confirmed on onn W4K65M-1031 / API 3.7.3: the user-facing TV name is CAST_NAME.
      name: str(v.CAST_NAME) ?? str(v.NAME) ?? str(v.FRIENDLY_NAME) ?? 'VIZIO OS TV',
      manufacturer: 'VIZIO OS',
      model: str(v.MODEL_NAME) ?? str(v.MODEL),
      firmware: str(v.VERSION) ?? str(v.FW_VERSION) ?? str(v.SYSTEM_VERSION) ?? str(v.SW_VERSION),
      apiVersion: str(v.API_VERSION),
      serial: str(v.SERIAL_NUMBER),
      address: this.client.host,
      port: this.client.port,
    };
  }

  async getPowerState(): Promise<PowerState> {
    try {
      const r = await this.client.get(PATHS.power);
      const v = items(r)[0]?.VALUE;
      return v === 1 || v === '1' ? 'on' : 'standby';
    } catch (e) {
      if (e instanceof VizioError && (e.code === 'timeout' || e.code === 'network')) return 'unknown';
      throw e;
    }
  }

  async getInputs(): Promise<InputSource[]> {
    const r = await this.client.get(PATHS.inputs);
    return items(r)
      .map((it) => {
        const id = str(it.NAME) ?? str(it.CNAME);
        if (!id) return null;
        const value = it.VALUE as Item | undefined;
        const label = (value && str(value.NAME)) || id;
        return { id, systemName: label };
      })
      .filter((x): x is InputSource => !!x && !/^(CAST|SMARTCAST)$/i.test(x.id));
  }

  private async currentInputItem() {
    const r = await this.client.get(PATHS.currentInput);
    const it = items(r)[0];
    return { value: str(it?.VALUE) ?? null, hash: it?.HASHVAL };
  }

  async getCurrentInput(): Promise<string | null> {
    return (await this.currentInputItem()).value;
  }

  async getAudio(): Promise<AudioState> {
    const r = await this.client.get(PATHS.audio);
    const byName = new Map(items(r).map((it) => [String(it.CNAME ?? '').toLowerCase(), it]));
    const vol = byName.get('volume')?.VALUE;
    const mute = byName.get('mute')?.VALUE;
    return {
      volume: typeof vol === 'number' ? vol : vol != null && !Number.isNaN(Number(vol)) ? Number(vol) : null,
      muted: mute == null ? null : String(mute).toLowerCase() === 'on',
    };
  }

  async getCurrentApp(): Promise<CurrentApp> {
    const r = await this.client.get(PATHS.currentApp);
    const value = (r.ITEM as Item | undefined)?.VALUE as Item | undefined;
    if (!value || (value.APP_ID == null && value.NAME_SPACE == null)) return { config: null };
    return { config: { APP_ID: value.APP_ID, NAME_SPACE: value.NAME_SPACE, MESSAGE: value.MESSAGE ?? null } };
  }

  async setVolume(volume: number): Promise<CommandResult> {
    const target = Math.max(0, Math.min(100, Math.round(volume)));
    try {
      const r = await this.client.get(PATHS.volume);
      const hash = items(r)[0]?.HASHVAL;
      await this.client.put(PATHS.volume, { REQUEST: 'MODIFY', HASHVAL: hash, VALUE: target });
      await sleep(this.verifyDelayMs / 2);
      const audio = await this.getAudio();
      if (audio.volume === target) return this.mark('volume', ok(`Volume ${target}`, { volume: target }));
      return sent(`Volume change sent; TV reports ${audio.volume ?? 'unknown'}.`, { volume: audio.volume });
    } catch (e) {
      return this.wrapError(e, 'Volume change');
    }
  }

  async setMuted(muted: boolean): Promise<CommandResult> {
    try {
      await this.client.put(PATHS.keys, keyPayload([muted ? MUTE_ON : MUTE_OFF]));
      await sleep(this.verifyDelayMs / 2);
      const audio = await this.getAudio();
      if (audio.muted === muted) return this.mark('mute', ok(muted ? 'Muted' : 'Unmuted', { muted }));
      return sent('Mute command sent but the TV did not confirm the change.', { muted: audio.muted });
    } catch (e) {
      return this.wrapError(e, 'Mute');
    }
  }

  async setPower(on: boolean): Promise<CommandResult> {
    try {
      await this.client.put(PATHS.keys, keyPayload([VIZIO_KEY_CODES[on ? 'power_on' : 'power_off']]));
    } catch (e) {
      if (on && e instanceof VizioError && (e.code === 'timeout' || e.code === 'network')) {
        return failed('The TV is not reachable on the network. Power-on over Wi‑Fi requires the TV to keep networking awake in standby.');
      }
      return this.wrapError(e, 'Power');
    }
    await sleep(this.verifyDelayMs * 2);
    const state = await this.getPowerState().catch(() => 'unknown' as const);
    if ((on && state === 'on') || (!on && state !== 'on' && state !== 'unknown')) return this.mark('power', ok(on ? 'TV is on' : 'TV is off'));
    return sent(`Power command sent; TV reports “${state}”.`);
  }

  async switchInput(inputId: string): Promise<CommandResult> {
    try {
      const { hash } = await this.currentInputItem();
      await this.client.put(PATHS.currentInput, { REQUEST: 'MODIFY', VALUE: inputId, HASHVAL: hash });
      await sleep(this.verifyDelayMs);
      const now = await this.getCurrentInput();
      if (now?.toLowerCase() === inputId.toLowerCase()) return this.mark('inputs', ok(`Switched to ${inputId}`, { currentInput: now }));
      return sent(`Input change sent; TV reports ${now ?? 'unknown'}.`, { currentInput: now });
    } catch (e) {
      return this.wrapError(e, 'Input switch');
    }
  }

  async launchApp(launch: LaunchConfig): Promise<CommandResult> {
    if (launch.platform !== VIZIO_PLATFORM) return unsupported('This launch configuration was not made for a VIZIO TV.');
    const cfg = launch.config;
    try {
      await this.client.put(PATHS.launchApp, { VALUE: { APP_ID: cfg.APP_ID, NAME_SPACE: cfg.NAME_SPACE, MESSAGE: cfg.MESSAGE ?? null } });
    } catch (e) {
      return this.wrapError(e, 'App launch');
    }
    // Apps take a moment to come to the foreground. Poll briefly.
    for (let i = 0; i < 4; i++) {
      await sleep(this.verifyDelayMs * (i === 0 ? 2 : 1));
      const cur = await this.getCurrentApp().catch(() => ({ config: null }) as CurrentApp);
      if (cur.config && String(cur.config.APP_ID) === String(cfg.APP_ID) && String(cur.config.NAME_SPACE) === String(cfg.NAME_SPACE)) {
        return this.mark('appLaunch', ok('App is open on the TV', { config: cur.config }));
      }
    }
    return sent('The TV accepted the launch request but did not report the app in the foreground yet.');
  }

  async sendRemoteKey(key: RemoteKey): Promise<CommandResult> {
    const code = VIZIO_KEY_CODES[key];
    if (!code) return unsupported(`Key “${key}” has no known SmartCast code.`);
    try {
      await this.client.put(PATHS.keys, keyPayload([code]));
      return sent(`Sent ${key}`);
    } catch (e) {
      return this.wrapError(e, `Key ${key}`);
    }
  }
}
