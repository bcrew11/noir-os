/**
 * Self-contained mode for the NOIR Android TV launcher.
 *
 * There is no NOIR server: settings live on the device, apps are the ones installed from
 * Google Play (launched natively through the bridge), and the music widget controls whatever
 * is playing on the device. TV-input control isn't used — the device opens apps itself.
 */
import {
  EMPTY_MUSIC, NOIR_VERSION, NO_TV_CAPABILITIES, applySettingsPatch, defaultSettings, failed, loadSettings,
  APP_CATALOG, type AppDefinition, type Command, type CommandResult, type MusicState, type NoirState, type Settings,
} from '@noir/core';
import { setLocalBackend, useNoir } from '@noir/ui';
import { androidBridge, installedApps, packageCache, type NowPlaying } from './lib/android.ts';
import { allApps, launchApp } from './lib/apps.ts';
import { loadSaved } from './lib/saved.ts';
import { denyPairing, pairedPhones, phoneUrl, removePhone, startPhoneHost } from './phoneHost.ts';

const SETTINGS_KEY = 'noir.settings';

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? loadSettings(JSON.parse(raw)) : standaloneDefaults();
  } catch { return standaloneDefaults(); }
}

function standaloneDefaults(): Settings {
  const s = defaultSettings();
  // No TV control in this mode, so the input widget would only be noise.
  s.home.showInputWidget = false;
  return s;
}

function saveSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

/** Installed apps that aren't in NOIR's catalog still appear in the library. */
function discoverApps(): { extra: AppDefinition[]; logos: Record<string, string>; launch: NoirState['launch'] } {
  const bridge = androidBridge();
  const installed = installedApps();
  const byPkg = new Map(installed.map((a) => [a.pkg, a.label]));
  const byLabel = new Map(installed.map((a) => [a.label.toLowerCase(), a.pkg]));
  const logos: Record<string, string> = {};
  const launch: NoirState['launch'] = {};
  const claimed = new Set<string>();
  packageCache.clear();
  for (const app of APP_CATALOG) {
    // Match locally against one installed-apps snapshot instead of one native call per app.
    const pkg = (app.androidPackages ?? []).find((p) => byPkg.has(p)) ?? byLabel.get(app.name.toLowerCase());
    if (!pkg) continue;
    claimed.add(pkg);
    packageCache.set(app.id, pkg);
    launch[app.id] = { source: 'manual', verified: true };
    const banner = bridge?.appBanner(pkg);
    if (banner) logos[app.id] = banner;
  }
  const hidden = /^(com\.google\.android\.(tvlauncher|apps\.tv\.launcherx|leanbacklauncher)|com\.android\.(tv\.settings|vending)|app\.noir\.launcher)$/;
  const extra: AppDefinition[] = installed
    .filter((a) => !claimed.has(a.pkg) && !hidden.test(a.pkg))
    .map((a) => ({
      id: `android:${a.pkg}`,
      name: a.label,
      category: 'entertainment',
      description: 'Installed on this device',
      androidPackages: [a.pkg],
      brand: { background: 'linear-gradient(160deg,#241d33,#14101d)', color: '#e9e4f5', font: 'sans', weight: 700 },
    }));
  for (const app of extra) {
    const pkg = app.androidPackages![0]!;
    packageCache.set(app.id, pkg);
    launch[app.id] = { source: 'manual', verified: true };
    const banner = bridge?.appBanner(pkg);
    if (banner) logos[app.id] = banner;
  }
  return { extra, logos, launch };
}

function musicFrom(np: NowPlaying | null): MusicState {
  const base: MusicState = { ...EMPTY_MUSIC, provider: 'device', providerLabel: 'This device', connected: true, canControl: true, updatedAt: Date.now() };
  if (!np) return base;
  if (!np.permission) {
    return { ...base, note: 'To show what’s playing, allow NOIR notification access (see Settings → Music).' };
  }
  if (!np.active || !np.title) return { ...base, note: 'Nothing playing. Play/pause controls the active media app.' };
  return {
    ...base,
    providerLabel: np.app ?? 'Now playing',
    isPlaying: !!np.playing,
    track: { id: `${np.app}:${np.title}`, title: np.title, artist: np.artist ?? '', album: np.album, artUrl: np.art ?? undefined, durationMs: np.durationMs ?? 0 },
    progressMs: np.positionMs ?? 0,
    updatedAt: Date.now(),
  };
}

function readNowPlaying(): NowPlaying | null {
  try { return JSON.parse(androidBridge()?.nowPlaying() ?? 'null') as NowPlaying | null; } catch { return null; }
}

export function startStandalone() {
  let settings = readSettings();
  let apps = discoverApps();

  const build = (): NoirState => ({
    version: NOIR_VERSION,
    mode: 'live',
    deployment: 'android-tv',
    settings,
    tv: {
      adapter: 'none', reachable: false, paired: false, device: null,
      capabilities: { ...NO_TV_CAPABILITIES, appLaunch: { level: 'verified', note: 'Apps open directly on this device.' } },
      power: 'unknown', inputs: [], currentInput: null, audio: { volume: null, muted: null }, checkedAt: Date.now(),
    },
    music: musicFrom(readNowPlaying()),
    launch: apps.launch,
    customApps: apps.extra,
    logos: apps.logos,
    photos: [],
    spotify: { configured: false, connected: false },
    weather: useNoir.getState().state?.weather ?? null,
    phones: pairedPhones(),
    saved: loadSaved(),
  });
  const publish = () => useNoir.setState({ state: build(), status: 'online' });

  const unsupported = (message: string): CommandResult => ({ status: 'unsupported', message });

  setLocalBackend({
    async command(cmd: Command): Promise<CommandResult> {
      const bridge = androidBridge();
      switch (cmd.type) {
        case 'app.launch': {
          const app = allApps(build()).find((a) => a.id === cmd.appId);
          if (!app) return failed('Unknown app.');
          return (await launchApp(app, { quiet: true })) ?? failed('Couldn’t open the app.');
        }
        case 'music.playpause': case 'music.next': case 'music.previous': {
          bridge?.mediaKey(cmd.type.slice(6));
          setTimeout(publish, 400);
          return { status: 'sent', message: 'Sent to the media app' };
        }
        default:
          return unsupported('TV input and volume control aren’t used in this setup — use the TV remote for volume.');
      }
    },
    async patchSettings(patch) {
      settings = applySettingsPatch(settings, patch);
      saveSettings(settings);
      publish();
      // A new location (or turning weather on) should show up now, not at the next 30-minute refresh.
      if (patch.weather || patch.ambient?.showWeather) void weather();
    },
    async api(path, init) {
      if (path === '/api/tv/refresh') { apps = discoverApps(); publish(); return {}; }
      if (path === '/api/phone/pair/deny') { denyPairing(); return {}; }
      if (path === '/api/phone/link') {
        const url = phoneUrl();
        if (!url) return { urls: [], qrSvg: null };
        const QR = await import('qrcode');
        const qrSvg = await QR.toString(url, { type: 'svg', margin: 1, color: { dark: '#f8f7fc', light: '#00000000' } });
        return { urls: [url], qrSvg };
      }
      const del = path.match(/^\/api\/phones\/(.+)$/);
      if (del && init.method === 'DELETE') { removePhone(decodeURIComponent(del[1]!)); return {}; }
      throw new Error('Not available on this device.');
    },
  });

  publish();
  startPhoneHost();

  // Re-scan apps when NOIR comes back to the foreground (the user may have installed something).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { apps = discoverApps(); publish(); }
  });

  // Now-playing: poll the device's media session only while NOIR is visible.
  const tick = () => {
    if (document.visibilityState === 'visible') {
      const next = musicFrom(readNowPlaying());
      const cur = useNoir.getState().state;
      if (cur && JSON.stringify({ ...next, updatedAt: 0, progressMs: 0 }) !== JSON.stringify({ ...cur.music, updatedAt: 0, progressMs: 0 })) {
        useNoir.setState({ state: { ...cur, music: next } });
      }
    }
    // Cheap now that artwork is served by URL, so a new track shows up promptly even after a pause.
    setTimeout(tick, 2000);
  };
  setTimeout(tick, 2000);

  // Weather straight from Open-Meteo (no key) when a location is set.
  const weather = async () => {
    const w = settings.weather;
    if (w.latitude == null || w.longitude == null || !settings.ambient.showWeather) return;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${w.latitude}&longitude=${w.longitude}&current=temperature_2m,weather_code`);
      if (!r.ok) return;
      const j = (await r.json()) as { current: { temperature_2m: number; weather_code: number } };
      const cur = useNoir.getState().state;
      if (cur) useNoir.setState({ state: { ...cur, weather: { tempC: j.current.temperature_2m, code: j.current.weather_code, updatedAt: Date.now() } } });
    } catch { /* offline */ }
  };
  void weather();
  setInterval(() => void weather(), 30 * 60_000);
  window.addEventListener('online', () => void weather());
}
