/**
 * Watch later (Google TV setup): links saved from the phone, kept on the TV, opened in the right app.
 * Stored in this device's localStorage; title and thumbnail are filled in after saving.
 */
import { findApp, serviceForUrl, youTubeId, type CommandResult, type SavedItem } from '@noir/core';
import { useNoir } from '@noir/ui';
import { androidBridge, awaitNative, nativeCallbackId } from './android.ts';
import { androidPackageFor, openInStore } from './apps.ts';

const KEY = 'noir.saved';
const MAX = 200;

export function loadSaved(): SavedItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedItem[]; } catch { return []; }
}
function store(list: SavedItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* storage full */ }
  const cur = useNoir.getState().state;
  if (cur) useNoir.setState({ state: { ...cur, saved: loadSaved() } });
}

function fallbackTitle(url: string): string {
  try {
    const u = new URL(url);
    const app = serviceForUrl(url);
    const name = app ? findApp(app)?.name : u.hostname.replace(/^www\./, '');
    return `${name ?? 'Link'} · ${decodeURIComponent(u.pathname).replace(/[-_/]+/g, ' ').trim().slice(0, 60) || 'saved link'}`;
  } catch { return 'Saved link'; }
}

/** Add a link (newest first; saving the same link again moves it to the top). */
export function addSaved(url: string): SavedItem {
  const existing = loadSaved().find((s) => s.url === url);
  const id = nativeCallbackId('s') + Date.now().toString(36);
  const yt = youTubeId(url);
  const item: SavedItem = existing ? { ...existing, addedAt: Date.now() } : {
    id, url, appId: serviceForUrl(url), title: fallbackTitle(url),
    image: yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null, addedAt: Date.now(),
  };
  store([item, ...loadSaved().filter((s) => s.url !== url)]);
  if (!existing) void enrich(item.id, url);
  return item;
}

async function enrich(id: string, url: string) {
  const bridge = androidBridge();
  if (!bridge?.fetchMeta) return;
  const cb = nativeCallbackId('meta');
  const wait = awaitNative(cb, 25000);
  bridge.fetchMeta(cb, url);
  try {
    const [raw] = await wait;
    const meta = JSON.parse(String(raw)) as { title?: string; image?: string | null; author?: string; error?: string };
    if (meta.error) return;
    // Streaming sites often append their own name ("… | Netflix Official Site"): trim that.
    const title = (meta.title ?? '').replace(/\s*[|–—-]\s*(Netflix|Hulu|Disney\+|Prime Video|Max|Peacock|Paramount\+|Apple TV\+?|YouTube)[^|]*$/i, '').replace(/^Watch\s+/i, '').trim();
    store(loadSaved().map((s) => s.id === id ? { ...s, title: title || s.title, image: meta.image || s.image } : s));
  } catch { /* offline or blocked: keep the fallback title */ }
}

export function removeSaved(id: string) {
  store(loadSaved().filter((s) => s.id !== id));
}

interface IntentStep { data: string; pkg?: string; component?: string; flags?: number; extras?: Record<string, string> }

/** Netflix title id from title/watch/jbv links (share links look like netflix.com/title/80057281?s=i…). */
export function netflixId(url: string): string | null {
  return url.match(/netflix\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:title|watch)\/(\d+)/i)?.[1] ?? url.match(/[?&]jbv=(\d+)/)?.[1] ?? null;
}

/**
 * How to open a saved link, best first. Most TV apps only open their home screen for a plain web
 * link, so services with a known deep-link form get it tried first. Plain links stay as fallbacks.
 */
export function openSteps(url: string, appId: string | null, pkg: string | null): IntentStep[] {
  const steps: IntentStep[] = [];
  if (appId === 'netflix' && pkg) {
    const id = netflixId(url);
    if (id) {
      // Netflix's TV app opens a title's page from its own scheme; `source=30` marks a launcher deep link.
      steps.push({ data: `netflix://title/${id}`, pkg, extras: { source: '30' }, flags: 0x10008000 }); // NEW_TASK | CLEAR_TASK: jump there even if Netflix is already open
      steps.push({ data: `https://www.netflix.com/title/${id}`, pkg, extras: { source: '30' } });
    }
  }
  if (pkg) steps.push({ data: url, pkg });
  steps.push({ data: url });
  return steps;
}

/** Open in the service's own app when it's installed, else whatever app handles the link. */
export function openSaved(item: SavedItem): CommandResult {
  const bridge = androidBridge();
  if (!bridge?.openUrl) return { status: 'unsupported', message: 'Opening links works on the NOIR Google TV launcher.' };
  const app = item.appId ? findApp(item.appId, useNoir.getState().state?.customApps) : undefined;
  const pkg = app ? androidPackageFor(app) : null;
  if (app && !pkg) {
    openInStore(app);
    return { status: 'unsupported', message: `${app.name} isn’t installed — opened Google Play on the TV.` };
  }
  const r = JSON.parse(bridge.openIntents
    ? bridge.openIntents(JSON.stringify(openSteps(item.url, item.appId, pkg)))
    : bridge.openUrl(item.url, pkg)) as { ok: boolean; message: string };
  return r.ok ? { status: 'verified', message: `Opening in ${app?.name ?? 'the browser'}` } : { status: 'failed', message: r.message };
}
