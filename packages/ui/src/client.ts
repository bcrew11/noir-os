import { create } from 'zustand';
import type { Command, CommandResult, NavKey, NoirState, ServerMessage, SettingsPatch, Toast } from '@noir/core';

/**
 * Realtime client shared by the TV dashboard and the phone companion.
 * One WebSocket carries full state snapshots; commands go over REST so each has a result.
 */
export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'unauthorized';

export interface NoirClientState {
  status: ConnectionStatus;
  state: NoirState | null;
  toasts: Toast[];
  phonePairing: { code: string; expiresAt: number; deviceName: string } | null;
  tvPairing: { stage: 'idle' | 'awaiting-pin' | 'paired' | 'error'; message?: string };
}

export const useNoir = create<NoirClientState>(() => ({
  status: 'connecting',
  state: null,
  toasts: [],
  phonePairing: null,
  tvPairing: { stage: 'idle' },
}));

const TOKEN_KEY = 'noir.token';

/**
 * Optional in-process backend. When NOIR runs self-contained (the Android TV launcher),
 * there is no NOIR server: state, settings and commands are handled on the device.
 */
export interface LocalBackend {
  command(cmd: Command): Promise<CommandResult>;
  patchSettings(patch: SettingsPatch): Promise<void>;
  api?(path: string, init: { method?: string; body?: unknown }): Promise<unknown>;
}
let local: LocalBackend | null = null;
export function setLocalBackend(b: LocalBackend) {
  local = b;
  useNoir.setState({ status: 'online' });
}
export const isLocalBackend = () => local !== null;

export function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
}

type LaunchListener = (appId: string) => void;
const launchListeners = new Set<LaunchListener>();
export function onLaunchOnDisplay(fn: LaunchListener) {
  launchListeners.add(fn);
  return () => launchListeners.delete(fn);
}

type NavListener = (key: NavKey) => void;
/** Deliver a remote-control press as if it came from a connected phone (self-contained mode). */
export function emitRemoteNav(key: NavKey) {
  navListeners.forEach((fn) => fn(key));
}
const navListeners = new Set<NavListener>();
export function onRemoteNav(fn: NavListener) {
  navListeners.add(fn);
  return () => navListeners.delete(fn);
}

let ws: WebSocket | null = null;
let role: 'tv' | 'phone' = 'tv';
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

export function pushToast(t: Omit<Toast, 'id'> & { id?: string }, ttl = 4200) {
  const toast: Toast = { id: t.id ?? Math.random().toString(36).slice(2), tone: t.tone, title: t.title, body: t.body };
  useNoir.setState((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== toast.id), toast].slice(-3) }));
  setTimeout(() => useNoir.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== toast.id) })), ttl);
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  const t = getStoredToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (local) {
    if (!local.api) throw new Error('Not available on this device.');
    return (await local.api(path, init)) as T;
  }
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: headers(init.body !== undefined),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (res.status === 401) useNoir.setState({ status: 'unauthorized' });
  if (!res.ok) {
    const msg = (data as { message?: string } | null)?.message ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

/** Run a command and surface an honest toast describing what actually happened. */
export async function command(cmd: Command, opts: { silent?: boolean } = {}): Promise<CommandResult> {
  let result: CommandResult;
  try {
    result = local ? await local.command(cmd) : await api<CommandResult>('/api/command', { body: cmd });
  } catch (e) {
    result = { status: 'failed', message: (e as Error).message };
  }
  if (!opts.silent || result.status === 'failed' || result.status === 'unsupported') {
    const tone = result.status === 'verified' ? 'success' : result.status === 'sent' ? 'info' : result.status === 'demo' ? 'demo' : result.status === 'unsupported' ? 'warning' : 'error';
    pushToast({ tone, title: result.message, body: result.status === 'sent' ? 'Sent to the TV — not yet confirmed.' : undefined, id: `cmd-${cmd.type}` });
  }
  return result;
}

export async function patchSettings(patch: SettingsPatch) {
  // Optimistic: apply locally, the server snapshot will follow.
  const cur = useNoir.getState().state;
  if (cur) {
    const { mergeDeep } = await import('@noir/core');
    useNoir.setState({ state: { ...cur, settings: mergeDeep(cur.settings, patch) } });
  }
  try {
    if (local) await local.patchSettings(patch);
    else await api('/api/settings', { method: 'PATCH', body: patch });
  } catch (e) {
    pushToast({ tone: 'error', title: 'Could not save setting', body: (e as Error).message });
  }
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

function handle(msg: ServerMessage) {
  switch (msg.type) {
    case 'welcome':
      useNoir.setState({ status: msg.authorized ? 'online' : 'unauthorized' });
      break;
    case 'state':
      useNoir.setState({ state: msg.state, status: 'online' });
      break;
    case 'nav':
      navListeners.forEach((fn) => fn(msg.key));
      break;
    case 'launchOnDisplay':
      launchListeners.forEach((fn) => fn(msg.appId));
      break;
    case 'toast':
      pushToast(msg.toast);
      break;
    case 'phonePairing':
      useNoir.setState({ phonePairing: msg.request });
      break;
    case 'tvPairing':
      useNoir.setState({ tvPairing: { stage: msg.stage, message: msg.message } });
      break;
  }
}

export function connect(as: 'tv' | 'phone') {
  if (local) return;
  role = as;
  clearTimeout(retryTimer);
  ws?.close();
  useNoir.setState({ status: 'connecting' });
  const sock = new WebSocket(wsUrl());
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    sock.send(JSON.stringify({ type: 'hello', role, token: getStoredToken() ?? undefined }));
  };
  sock.onmessage = (ev) => {
    try { handle(JSON.parse(String(ev.data)) as ServerMessage); } catch { /* ignore malformed */ }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    if (useNoir.getState().status !== 'unauthorized') useNoir.setState({ status: 'offline' });
    retry = Math.min(retry + 1, 6);
    retryTimer = setTimeout(() => connect(role), 500 * 2 ** retry);
  };
}

export function send(msg: { type: 'nav'; key: NavKey } | { type: 'activity' }) {
  if (local) return;
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
