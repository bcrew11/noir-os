import { APP_CATALOG, type AppDefinition, type NoirState } from '@noir/core';
import { command, pushToast, useNoir } from '@noir/ui';
import { androidBridge, packageCache } from './android.ts';

export function allApps(state: NoirState | null): AppDefinition[] {
  return [...APP_CATALOG, ...(state?.customApps ?? [])];
}

export function useFavorites(): AppDefinition[] {
  const state = useNoir((s) => s.state);
  const all = allApps(state);
  return (state?.settings.home.favorites ?? []).map((id) => all.find((a) => a.id === id)).filter((a): a is AppDefinition => !!a);
}

export type LaunchReadiness = 'demo' | 'ready' | 'verified' | 'needs-setup' | 'no-tv' | 'web-only' | 'installed' | 'not-installed';

export function androidPackageFor(app: AppDefinition): string | null {
  const cached = packageCache.get(app.id);
  if (cached) return cached;
  try { return androidBridge()?.findApp(JSON.stringify(app.androidPackages ?? []), app.name) ?? null; } catch { return null; }
}

/** Open the app's Google Play page on the device (Android TV launcher only). */
export function openInStore(app: AppDefinition): boolean {
  const pkg = app.androidPackages?.[0];
  if (!pkg) return false;
  try { return !!androidBridge()?.openStore(pkg); } catch { return false; }
}

/** Honest description of whether NOIR can actually open an app right now. */
export function launchReadiness(state: NoirState | null, appId: string): LaunchReadiness {
  if (!state) return 'no-tv';
  if (androidBridge()) {
    // Filled once per app scan (see standalone.ts) — no native calls while rendering.
    return state.launch[appId] ? 'installed' : 'not-installed';
  }
  if (state.tv.adapter === 'mock') return 'demo';
  if (state.tv.adapter === 'none') return 'no-tv';
  const l = state.launch[appId];
  if (!l) return 'needs-setup';
  return l.verified ? 'verified' : 'ready';
}

export const READINESS_LABEL: Record<LaunchReadiness, string> = {
  demo: 'Demo',
  ready: 'Ready',
  verified: 'Ready · verified',
  'needs-setup': 'Needs setup',
  'no-tv': 'No TV paired',
  'web-only': 'Website',
  installed: 'Installed',
  'not-installed': 'Not installed',
};

export async function launchApp(app: AppDefinition) {
  const state = useNoir.getState().state;
  const bridge = androidBridge();
  if (bridge) {
    const pkg = androidPackageFor(app);
    if (!pkg) {
      pushToast({ tone: 'warning', title: `${app.name} isn’t installed yet`, body: 'Opening Google Play so you can install it.' });
      openInStore(app);
      return;
    }
    const res = JSON.parse(bridge.launch(pkg)) as { ok: boolean; message: string };
    pushToast({ tone: res.ok ? 'success' : 'error', title: res.ok ? `Opening ${app.name}` : res.message });
    return;
  }
  const r = launchReadiness(state, app.id);
  if (r === 'no-tv' && state?.deployment === 'browser' && app.webUrl) {
    pushToast({ tone: 'warning', title: `${app.name} can’t open on a TV yet`, body: 'No television is paired. Pair one in Settings → Devices.' });
    return;
  }
  await command({ type: 'app.launch', appId: app.id });
}

/** The input featured on the Home widget: the user's choice, else the first HDMI source that isn't a soundbar. */
export function widgetInput(state: NoirState | null): string {
  const chosen = state?.settings.home.widgetInputId;
  if (chosen) return chosen;
  const auto = state?.tv.inputs.find((i) => /^HDMI/i.test(i.id) && !/sound ?bar|arc|audio/i.test(i.systemName));
  return auto?.id ?? 'HDMI-1';
}
