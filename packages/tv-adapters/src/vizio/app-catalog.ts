import https from 'node:https';
import { matchAppByName } from '@noir/core';

/**
 * VIZIO publishes its app directory as JSON (used by pyvizio and Home Assistant).
 * NOIR fetches it at runtime instead of hardcoding IDs, and only treats the result as a
 * *candidate* (`source: 'catalog', verified: false`) until a launch is confirmed on the TV.
 * The preferred path is still "learning" the config from the TV itself.
 */
const APPS_URL = 'https://scfs.vizio.com/appservice/vizio_apps_prod.json';
const AVAIL_URL = 'https://scfs.vizio.com/appservice/app_availability_prod.json';

function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: timeoutMs }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      })
      .on('timeout', function (this: { destroy(e: Error): void }) { this.destroy(new Error('timeout')); })
      .on('error', reject);
  });
}

export interface CatalogCandidate {
  noirId: string;
  vizioName: string;
  config: Record<string, unknown>;
}

type Rec = Record<string, unknown>;

export function parseVizioCatalog(apps: unknown, availability: unknown): CatalogCandidate[] {
  if (!Array.isArray(apps) || !Array.isArray(availability)) return [];
  const avail = new Map<string, Rec>((availability as Rec[]).map((a) => [String(a.id), a]));
  const out: CatalogCandidate[] = [];
  for (const app of apps as Rec[]) {
    const name = typeof app.name === 'string' ? app.name : undefined;
    if (!name) continue;
    const match = matchAppByName(name);
    if (!match) continue;
    const chipsets = (avail.get(String(app.id))?.chipsets ?? {}) as Record<string, Rec[]>;
    const entry = chipsets['*']?.[0] ?? Object.values(chipsets)[0]?.[0];
    const payload = entry?.app_type_payload;
    try {
      const cfg = (typeof payload === 'string' ? JSON.parse(payload) : payload) as Rec | undefined;
      if (cfg && cfg.APP_ID != null && cfg.NAME_SPACE != null) {
        out.push({ noirId: match.id, vizioName: name, config: { APP_ID: cfg.APP_ID, NAME_SPACE: cfg.NAME_SPACE, MESSAGE: cfg.MESSAGE ?? null } });
      }
    } catch { /* skip malformed */ }
  }
  return out;
}

export async function fetchVizioCatalog(): Promise<CatalogCandidate[]> {
  const [apps, availability] = await Promise.all([getJson(APPS_URL), getJson(AVAIL_URL)]);
  return parseVizioCatalog(apps, availability);
}
