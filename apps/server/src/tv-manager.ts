import crypto from 'node:crypto';
import {
  NO_TV_CAPABILITIES, failed, findApp, unsupported,
  type CommandResult, type LaunchSummary, type RemoteKey, type Settings, type TVAdapter, type TVStatus,
} from '@noir/core';
import {
  MockTVAdapter, VIZIO_PLATFORM, VizioAdapter, cancelPairing, discoverTVs, fetchVizioCatalog, findSmartCastPort, finishPairing, startPairing,
  type DiscoveredTV, type PairingChallenge,
} from '@noir/tv-adapters/node';
import type { Store } from './store.ts';

interface VizioSecret { host: string; port: number; token: string }

const MOCK_PLATFORM = 'mock';

export class TVManager {
  adapter: TVAdapter | null = null;
  status: TVStatus = this.emptyStatus();
  private challenge: PairingChallenge | null = null;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private wasOn = false;
  private deviceInfoFetched = false;

  constructor(
    private readonly store: Store,
    private readonly opts: { demoTv: boolean; getSettings: () => Settings; onChange: () => void; log: (msg: string) => void },
  ) {}

  private emptyStatus(): TVStatus {
    return { adapter: 'none', reachable: false, paired: false, device: null, capabilities: NO_TV_CAPABILITIES, power: 'unknown', inputs: [], currentInput: null, audio: { volume: null, muted: null }, checkedAt: 0 };
  }

  get platform() {
    return this.adapter?.kind === 'vizio' ? VIZIO_PLATFORM : this.adapter?.kind === 'mock' ? MOCK_PLATFORM : null;
  }

  get deviceId(): string {
    let id = this.store.getJson<string>('vizio.deviceId');
    if (!id) {
      id = `noir-${crypto.randomUUID().slice(0, 8)}`;
      this.store.setJson('vizio.deviceId', id);
    }
    return id;
  }

  async init() {
    const secret = this.store.getSecret<VizioSecret>('vizio');
    if (secret) this.adapter = new VizioAdapter({ host: secret.host, port: secret.port, authToken: secret.token });
    else if (this.opts.demoTv) this.adapter = new MockTVAdapter();
    else this.adapter = null;
    this.deviceInfoFetched = false;
    this.status = { ...this.emptyStatus(), adapter: this.adapter?.kind ?? 'none', paired: !!secret };
    await this.refresh();
    clearInterval(this.pollTimer);
    // Real TVs are polled lightly (state can change from the physical remote). The mock never changes on its own.
    if (this.adapter?.kind === 'vizio') this.pollTimer = setInterval(() => void this.refresh(), 8000);
  }

  stop() {
    clearInterval(this.pollTimer);
  }

  async refresh(): Promise<void> {
    const a = this.adapter;
    if (!a) {
      this.status = { ...this.emptyStatus(), checkedAt: Date.now() };
      this.opts.onChange();
      return;
    }
    const [caps, power, inputs, current, audio, device] = await Promise.allSettled([
      a.getCapabilities(),
      a.getPowerState(),
      this.status.inputs.length ? Promise.resolve(this.status.inputs) : a.getInputs(),
      a.getCurrentInput(),
      a.getAudio(),
      this.deviceInfoFetched ? Promise.resolve(this.status.device) : a.getDeviceInfo(),
    ]);
    const val = <T,>(r: PromiseSettledResult<T>, fallback: T) => (r.status === 'fulfilled' ? r.value : fallback);
    const firstError = [power, current, audio, device].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (device.status === 'fulfilled' && device.value) this.deviceInfoFetched = true;
    const powerState = val(power, 'unknown' as const);
    this.status = {
      adapter: a.kind,
      reachable: power.status === 'fulfilled' && powerState !== 'unknown',
      paired: a.kind === 'vizio',
      device: val(device, this.status.device),
      capabilities: val(caps, NO_TV_CAPABILITIES),
      power: powerState,
      inputs: val(inputs, this.status.inputs),
      currentInput: val(current, this.status.currentInput),
      audio: val(audio, this.status.audio),
      lastError: firstError ? String((firstError.reason as Error)?.message ?? firstError.reason) : undefined,
      checkedAt: Date.now(),
    };
    await this.maybeAutoSwitch(powerState === 'on');
    this.opts.onChange();
  }

  /** "Boot into NOIR": when the TV transitions to on, switch to NOIR's HDMI input. */
  private async maybeAutoSwitch(isOn: boolean) {
    const sys = this.opts.getSettings().system;
    const turnedOn = isOn && !this.wasOn;
    this.wasOn = isOn;
    if (!turnedOn || !sys.autoSwitchOnPowerOn || !sys.noirInputId || !this.adapter) return;
    if (this.status.currentInput === sys.noirInputId) return;
    const r = await this.adapter.switchInput(sys.noirInputId);
    this.opts.log(`auto-switch on power-on → ${sys.noirInputId}: ${r.status} ${r.message}`);
    if (r.detail?.currentInput) this.status.currentInput = String(r.detail.currentInput);
  }

  private async afterCommand(r: CommandResult) {
    // Immediately reflect the new state rather than waiting for the poll.
    void this.refresh();
    return r;
  }

  private noTv(): CommandResult {
    return unsupported('No television is paired. Open Settings → Devices to connect your TV over Wi‑Fi.');
  }

  async key(key: RemoteKey) { return this.adapter ? this.afterCommand(await this.adapter.sendRemoteKey(key)) : this.noTv(); }
  async volume(v: number) { return this.adapter ? this.afterCommand(await this.adapter.setVolume(v)) : this.noTv(); }
  async volumeStep(delta: number) {
    if (!this.adapter) return this.noTv();
    const cur = this.status.audio.volume;
    if (cur == null) return this.afterCommand(await this.adapter.sendRemoteKey(delta > 0 ? 'volume_up' : 'volume_down'));
    return this.afterCommand(await this.adapter.setVolume(cur + delta));
  }
  async mute(muted?: boolean) {
    if (!this.adapter) return this.noTv();
    const next = muted ?? !(this.status.audio.muted ?? false);
    return this.afterCommand(await this.adapter.setMuted(next));
  }
  async power(on: boolean) { return this.adapter ? this.afterCommand(await this.adapter.setPower(on)) : this.noTv(); }
  async input(id: string) { return this.adapter ? this.afterCommand(await this.adapter.switchInput(id)) : this.noTv(); }

  async returnToNoir(): Promise<CommandResult> {
    const id = this.opts.getSettings().system.noirInputId;
    if (!id) return unsupported('Set which HDMI input NOIR is connected to in Settings → System first.');
    return this.input(id);
  }

  launchSummaries(): Record<string, LaunchSummary> {
    const p = this.platform;
    if (!p || p === MOCK_PLATFORM) return {};
    return Object.fromEntries(this.store.listLaunch(p).map((l) => [l.appId, { source: l.source, verified: l.verified }]));
  }

  async launch(appId: string): Promise<CommandResult> {
    const app = findApp(appId, this.store.listCustomApps());
    if (!app) return failed(`Unknown app “${appId}”.`);
    if (!this.adapter) return this.noTv();
    if (this.adapter.kind === 'mock') {
      return this.adapter.launchApp({ platform: MOCK_PLATFORM, config: { appId }, source: 'manual', verified: false }).then((r) => ({
        ...r,
        message: `${app.name}: launch simulated (demo). Pair your TV to open the real app.`,
      }));
    }
    const launch = this.store.getLaunch(appId, VIZIO_PLATFORM);
    if (!launch) {
      return unsupported(`NOIR doesn’t know how to open ${app.name} on this TV yet. Open ${app.name} once with your TV remote, then choose “Learn from TV” in the app’s options.`);
    }
    const r = await this.adapter.launchApp(launch);
    if (r.status === 'verified' && !launch.verified) this.store.markLaunchVerified(appId, VIZIO_PLATFORM);
    this.opts.onChange();
    return { ...r, message: r.status === 'verified' ? `${app.name} is open on your TV` : r.status === 'sent' ? `${app.name}: ${r.message}` : r.message };
  }

  /** Capture the launch configuration of whatever app is currently open on the TV. */
  async learn(appId: string): Promise<CommandResult> {
    const app = findApp(appId, this.store.listCustomApps());
    if (!app) return failed(`Unknown app “${appId}”.`);
    if (!this.adapter || this.adapter.kind !== 'vizio') return unsupported('Learning app launch settings requires a paired VIZIO TV.');
    const cur = await this.adapter.getCurrentApp().catch((e: Error) => e);
    if (cur instanceof Error) return failed(`Couldn’t read the current app: ${cur.message}`);
    if (!cur.config) return failed(`No app is open on the TV. Open ${app.name} with the TV remote first, then try again.`);
    this.store.setLaunch(appId, { platform: VIZIO_PLATFORM, config: cur.config, source: 'learned', verified: false });
    this.opts.onChange();
    return { status: 'verified', message: `Learned how to open ${app.name}.`, detail: { config: cur.config } };
  }

  forget(appId: string) {
    if (this.platform && this.platform !== MOCK_PLATFORM) this.store.deleteLaunch(appId, this.platform);
    this.opts.onChange();
  }

  /** Import candidate configs from VIZIO's public app directory for apps without a learned config. */
  async importCatalog(): Promise<{ imported: string[] }> {
    const candidates = await fetchVizioCatalog();
    const imported: string[] = [];
    for (const c of candidates) {
      const existing = this.store.getLaunch(c.noirId, VIZIO_PLATFORM);
      if (existing && existing.source !== 'catalog') continue;
      this.store.setLaunch(c.noirId, { platform: VIZIO_PLATFORM, config: c.config, source: 'catalog', verified: false });
      imported.push(c.noirId);
    }
    this.opts.onChange();
    return { imported };
  }

  /* ------------------------------ pairing ------------------------------ */

  discover(scan: boolean): Promise<DiscoveredTV[]> {
    return discoverTVs({ scan });
  }

  async pairStart(host: string, port?: number): Promise<{ port: number }> {
    if (!/^[a-zA-Z0-9.\-:]+$/.test(host)) throw new Error('Enter the TV’s IP address, e.g. 192.168.1.42');
    const p = port ?? (await findSmartCastPort(host));
    if (!p) throw new Error(`No SmartCast service answered at ${host} on port 7345 or 9000. Check the address and that the TV is on.`);
    if (this.challenge) await cancelPairing(this.challenge);
    this.challenge = await startPairing(host, p, this.deviceId, 'NOIR');
    return { port: p };
  }

  async pairFinish(pin: string): Promise<void> {
    if (!this.challenge) throw new Error('Start pairing first.');
    if (Date.now() - this.challenge.startedAt > 5 * 60_000) {
      this.challenge = null;
      throw new Error('The pairing request expired. Start again.');
    }
    const token = await finishPairing(this.challenge, pin);
    this.store.setSecret('vizio', { host: this.challenge.host, port: this.challenge.port, token } satisfies VizioSecret);
    this.challenge = null;
    await this.init();
  }

  async pairCancel() {
    if (this.challenge) await cancelPairing(this.challenge);
    this.challenge = null;
  }

  async unpair() {
    this.store.setSecret('vizio', null);
    await this.init();
  }
}
