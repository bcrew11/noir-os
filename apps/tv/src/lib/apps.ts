import { APP_CATALOG, type AppDefinition, type NoirState } from '@noir/core';
import { command, pushToast, useNoir } from '@noir/ui';

export function allApps(state: NoirState | null): AppDefinition[] {
  return [...APP_CATALOG, ...(state?.customApps ?? [])];
}

export function useFavorites(): AppDefinition[] {
  const state = useNoir((s) => s.state);
  const all = allApps(state);
  return (state?.settings.home.favorites ?? []).map((id) => all.find((a) => a.id === id)).filter((a): a is AppDefinition => !!a);
}

export type LaunchReadiness = 'demo' | 'ready' | 'verified' | 'needs-setup' | 'no-tv' | 'web-only';

/** Honest description of whether NOIR can actually open an app right now. */
export function launchReadiness(state: NoirState | null, appId: string): LaunchReadiness {
  if (!state) return 'no-tv';
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
};

export async function launchApp(app: AppDefinition) {
  const state = useNoir.getState().state;
  const r = launchReadiness(state, app.id);
  if (r === 'no-tv' && state?.deployment === 'browser' && app.webUrl) {
    pushToast({ tone: 'warning', title: `${app.name} can’t open on a TV yet`, body: 'No television is paired. Pair one in Settings → Devices.' });
    return;
  }
  await command({ type: 'app.launch', appId: app.id });
}
