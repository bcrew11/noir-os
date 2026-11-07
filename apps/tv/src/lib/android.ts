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
  nowPlaying(): string;
  openNotificationAccess(): boolean;
  openSystemSettings(): void;
  updateStatus?(): string;
  goveeHasKey?(): boolean;
  goveeSetKey?(key: string): void;
  goveeRequest?(callbackId: string, method: string, path: string, body: string | null): void;
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
