import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadSettings, type AppDefinition, type LaunchConfig, type PairedPhone, type Settings } from '@noir/core';

/**
 * Persistent storage (SQLite via node:sqlite).
 *
 * Secrets (TV auth token, Spotify refresh token) are encrypted at rest with AES-256-GCM
 * using a key file created with 0600 permissions in the data directory. This protects
 * against casual disclosure (backups, copying the DB) — not against someone with full
 * access to the machine. Secrets are never sent to browsers.
 */
export class Store {
  readonly db: DatabaseSync;
  private readonly key: Buffer;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const keyFile = path.join(dataDir, 'secret.key');
    if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32), { mode: 0o600 });
    this.key = fs.readFileSync(keyFile);
    this.db = new DatabaseSync(dataDir === ':memory:' ? ':memory:' : path.join(dataDir, 'noir.db'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS phones (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_seen_at INTEGER);
      CREATE TABLE IF NOT EXISTS launch_configs (app_id TEXT NOT NULL, platform TEXT NOT NULL, config TEXT NOT NULL, source TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (app_id, platform));
      CREATE TABLE IF NOT EXISTS custom_apps (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    `);
  }

  /* ---------------- kv ---------------- */
  getJson<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.value) as T; } catch { return null; }
  }
  setJson(key: string, value: unknown) {
    this.db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  }
  delete(key: string) {
    this.db.prepare('DELETE FROM kv WHERE key = ?').run(key);
  }

  getSettings(): Settings {
    return loadSettings(this.getJson('settings'));
  }
  saveSettings(s: Settings) {
    this.setJson('settings', s);
  }

  /* -------------- secrets ------------- */
  setSecret(key: string, value: unknown | null) {
    if (value == null) {
      this.db.prepare('DELETE FROM secrets WHERE key = ?').run(key);
      return;
    }
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
    const blob = Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
    this.db.prepare('INSERT INTO secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, blob);
  }
  getSecret<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM secrets WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return null;
    try {
      const buf = Buffer.from(row.value, 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', this.key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')) as T;
    } catch {
      return null;
    }
  }

  /* --------------- phones -------------- */
  static hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  addPhone(name: string): { phone: PairedPhone; token: string } {
    const token = crypto.randomBytes(32).toString('base64url');
    const phone: PairedPhone = { id: crypto.randomUUID(), name, createdAt: Date.now(), lastSeenAt: Date.now() };
    this.db.prepare('INSERT INTO phones (id, name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(phone.id, name, Store.hashToken(token), phone.createdAt, phone.lastSeenAt);
    return { phone, token };
  }
  phoneForToken(token: string): PairedPhone | null {
    const row = this.db.prepare('SELECT id, name, created_at, last_seen_at FROM phones WHERE token_hash = ?').get(Store.hashToken(token)) as
      | { id: string; name: string; created_at: number; last_seen_at: number | null }
      | undefined;
    return row ? { id: row.id, name: row.name, createdAt: row.created_at, lastSeenAt: row.last_seen_at } : null;
  }
  touchPhone(id: string) {
    this.db.prepare('UPDATE phones SET last_seen_at = ? WHERE id = ?').run(Date.now(), id);
  }
  listPhones(): PairedPhone[] {
    return (this.db.prepare('SELECT id, name, created_at, last_seen_at FROM phones ORDER BY created_at').all() as Array<{ id: string; name: string; created_at: number; last_seen_at: number | null }>).map(
      (r) => ({ id: r.id, name: r.name, createdAt: r.created_at, lastSeenAt: r.last_seen_at }),
    );
  }
  removePhone(id: string) {
    this.db.prepare('DELETE FROM phones WHERE id = ?').run(id);
  }

  /* ------------ launch configs ---------- */
  getLaunch(appId: string, platform: string): LaunchConfig | null {
    const r = this.db.prepare('SELECT config, source, verified FROM launch_configs WHERE app_id = ? AND platform = ?').get(appId, platform) as
      | { config: string; source: LaunchConfig['source']; verified: number }
      | undefined;
    return r ? { platform, config: JSON.parse(r.config) as Record<string, unknown>, source: r.source, verified: !!r.verified } : null;
  }
  setLaunch(appId: string, launch: LaunchConfig) {
    this.db
      .prepare('INSERT INTO launch_configs (app_id, platform, config, source, verified) VALUES (?, ?, ?, ?, ?) ON CONFLICT(app_id, platform) DO UPDATE SET config = excluded.config, source = excluded.source, verified = excluded.verified')
      .run(appId, launch.platform, JSON.stringify(launch.config), launch.source, launch.verified ? 1 : 0);
  }
  markLaunchVerified(appId: string, platform: string) {
    this.db.prepare('UPDATE launch_configs SET verified = 1 WHERE app_id = ? AND platform = ?').run(appId, platform);
  }
  deleteLaunch(appId: string, platform: string) {
    this.db.prepare('DELETE FROM launch_configs WHERE app_id = ? AND platform = ?').run(appId, platform);
  }
  listLaunch(platform: string): Array<{ appId: string } & LaunchConfig> {
    return (this.db.prepare('SELECT app_id, config, source, verified FROM launch_configs WHERE platform = ?').all(platform) as Array<{ app_id: string; config: string; source: LaunchConfig['source']; verified: number }>).map(
      (r) => ({ appId: r.app_id, platform, config: JSON.parse(r.config) as Record<string, unknown>, source: r.source, verified: !!r.verified }),
    );
  }

  /* ------------- custom apps ------------ */
  listCustomApps(): AppDefinition[] {
    return (this.db.prepare('SELECT json FROM custom_apps').all() as Array<{ json: string }>).map((r) => JSON.parse(r.json) as AppDefinition);
  }
  saveCustomApp(app: AppDefinition) {
    this.db.prepare('INSERT INTO custom_apps (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json').run(app.id, JSON.stringify(app));
  }
  deleteCustomApp(id: string) {
    this.db.prepare('DELETE FROM custom_apps WHERE id = ?').run(id);
  }

  close() {
    this.db.close();
  }
}
