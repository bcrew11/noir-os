/**
 * The native bridge exposed by the NOIR Android TV launcher (android/ → MainActivity.Bridge).
 * All calls are synchronous JavascriptInterface methods.
 */
export interface AndroidBridge {
  platform(): string;
  findApp(candidatesJson: string, label: string): string | null;
  launch(pkg: string): string;
  installedApps(): string;
  appBanner(pkg: string): string | null;
  openStore(pkg: string): boolean;
  mediaKey(key: string): void;
  /** Low-latency navigation sounds (native SoundPool). */
  soundLoad?(key: string, wavBase64: string): void;
  soundPlay?(key: string, volume: number): boolean;
  nowPlaying(): string;
  openNotificationAccess(): boolean;
  openSystemSettings(): void;
  updateStatus?(): string;
  goveeHasKey?(): boolean;
  goveeSetKey?(key: string): void;
  goveeRequest?(callbackId: string, method: string, path: string, body: string | null): void;
  keyServiceEnabled?(): boolean;
  openAccessibilitySettings?(): boolean;
  learnKey?(callbackId: string): void;
  cancelLearnKey?(): void;
  keyMappings?(): string;
  setKeyMapping?(keyCode: number, actionJson: string | null): boolean;
  checkForUpdate?(): void;
  installUpdate?(): void;
}

export interface UpdateStatus {
  state: 'idle' | 'disabled' | 'checking' | 'current' | 'available' | 'downloading' | 'installing' | 'installed' | 'error';
  currentVersion: string;
  latestVersion: string | null;
  notes: string | null;
  progress: number;
  error: string | null;
}

export function readUpdateStatus(): UpdateStatus | null {
  try {
    const raw = androidBridge()?.updateStatus?.();
    return raw ? (JSON.parse(raw) as UpdateStatus) : null;
  } catch { return null; }
}

/** appId → Android package, filled by the standalone app scan. Avoids bridge calls on every render. */
export const packageCache = new Map<string, string>();

export const androidBridge = (): AndroidBridge | undefined => (globalThis as { NoirAndroid?: AndroidBridge }).NoirAndroid;

/** True when NOIR runs self-contained inside the Android TV launcher (no NOIR server). */
export const isStandalone = (): boolean => {
  try { return androidBridge()?.platform() === 'android-tv'; } catch { return false; }
};

export function installedApps(): Array<{ pkg: string; label: string }> {
  try {
    return (JSON.parse(androidBridge()?.installedApps() ?? '[]') as Array<[string, string]>).map(([pkg, label]) => ({ pkg, label }));
  } catch { return []; }
}

export interface NowPlaying {
  permission: boolean;
  active: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  album?: string;
  durationMs?: number;
  positionMs?: number;
  app?: string;
  art?: string | null;
}

/* Async results from native code arrive as window.__noirNative(callbackId, a, b). */
const waiters = new Map<string, (a: unknown, b: unknown) => void>();
(globalThis as { __noirNative?: (id: string, a: unknown, b: unknown) => void }).__noirNative = (id, a, b) => {
  const w = waiters.get(id);
  waiters.delete(id);
  w?.(a, b);
};
let nativeSeq = 0;
export function nativeCallbackId(prefix: string) {
  return `${prefix}${++nativeSeq}`;
}
/** Wait for a native callback; rejects after `timeoutMs` (0 = never). */
export function awaitNative(id: string, timeoutMs: number): Promise<[unknown, unknown]> {
  return new Promise((resolve, reject) => {
    const timer = timeoutMs ? setTimeout(() => { waiters.delete(id); reject(new Error('timeout')); }, timeoutMs) : undefined;
    waiters.set(id, (a, b) => { clearTimeout(timer); resolve([a, b]); });
  });
}
export function cancelNative(id: string) {
  waiters.delete(id);
}
