import {
  type AudioState, type CommandResult, type CurrentApp, type DeviceInfo, type InputSource, type LaunchConfig,
  type PowerState, type RemoteKey, type TVAdapter, type TVCapabilities,
} from '@noir/core';

const demo = (message: string, detail?: Record<string, unknown>): CommandResult => ({ status: 'demo', message, detail });

/**
 * A simulated television used in demo mode. It keeps internal state so the UI behaves
 * realistically, but every result is tagged `demo` so nothing is mistaken for hardware.
 */
export class MockTVAdapter implements TVAdapter {
  readonly kind = 'mock' as const;
  private power: PowerState = 'on';
  private input = 'HDMI-1';
  private volume = 18;
  private muted = false;
  private app: CurrentApp = { config: null };
  constructor(private readonly latencyMs = 40) {}

  private wait() {
    return new Promise((r) => setTimeout(r, this.latencyMs));
  }

  async getCapabilities(): Promise<TVCapabilities> {
    const note = 'Demo mode — simulated television.';
    return {
      power: { level: 'experimental', note },
      volume: { level: 'experimental', note },
      mute: { level: 'experimental', note },
      inputs: { level: 'experimental', note },
      remoteKeys: { level: 'experimental', note },
      appLaunch: { level: 'experimental', note },
      stateReadback: { level: 'experimental', note },
    };
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    return { name: 'Demo Television', manufacturer: 'NOIR (simulated)', model: 'MOCK-55', firmware: 'demo' };
  }
  async getPowerState() { return this.power; }
  async getInputs(): Promise<InputSource[]> {
    return [
      { id: 'HDMI-1', systemName: 'HDMI-1' },
      { id: 'HDMI-2', systemName: 'HDMI-2' },
      { id: 'HDMI-3', systemName: 'HDMI-3' },
      { id: 'TV', systemName: 'Antenna' },
    ];
  }
  async getCurrentInput() { return this.input; }
  async getAudio(): Promise<AudioState> { return { volume: this.volume, muted: this.muted }; }
  async getCurrentApp() { return this.app; }

  async setVolume(v: number) {
    await this.wait();
    this.volume = Math.max(0, Math.min(100, Math.round(v)));
    return demo(`Volume ${this.volume} (simulated)`, { volume: this.volume });
  }
  async setMuted(m: boolean) {
    await this.wait();
    this.muted = m;
    return demo(m ? 'Muted (simulated)' : 'Unmuted (simulated)', { muted: m });
  }
  async setPower(on: boolean) {
    await this.wait();
    this.power = on ? 'on' : 'standby';
    return demo(`Power ${on ? 'on' : 'off'} (simulated)`);
  }
  async switchInput(id: string) {
    await this.wait();
    const inputs = await this.getInputs();
    if (!inputs.some((i) => i.id === id)) return { status: 'failed' as const, message: `Unknown input ${id}` };
    this.input = id;
    this.app = { config: null };
    return demo(`Switched to ${id} (simulated)`, { currentInput: id });
  }
  async launchApp(launch: LaunchConfig) {
    await this.wait();
    this.app = { config: launch.config };
    return demo('Launch simulated — no real app was opened.', { config: launch.config });
  }
  async sendRemoteKey(key: RemoteKey) {
    await this.wait();
    if (key === 'volume_up') return this.setVolume(this.volume + 1);
    if (key === 'volume_down') return this.setVolume(this.volume - 1);
    if (key === 'mute') return this.setMuted(!this.muted);
    if (key === 'power_toggle') return this.setPower(this.power !== 'on');
    if (key === 'power_on') return this.setPower(true);
    if (key === 'power_off') return this.setPower(false);
    return demo(`Key “${key}” (simulated)`);
  }

  /** Test helper: pretend the user opened an app with the physical remote. */
  simulateForegroundApp(config: Record<string, unknown>) {
    this.app = { config };
  }
}
