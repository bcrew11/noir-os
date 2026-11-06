/**
 * After pairing: print what the TV reports for inputs, audio and the current app (read-only).
 *   npm run tv:report
 * The auth token is never printed.
 */
import { loadConfig } from '../config.ts';
import { Store } from '../store.ts';
import { PATHS, VizioClient } from '@noir/tv-adapters/node';

const cfg = loadConfig();
const store = new Store(cfg.dataDir);
const secret = store.getSecret<{ host: string; port: number; token: string }>('vizio');
if (!secret) {
  console.log('No TV is paired yet. Pair from NOIR (Settings → Devices) first.');
  process.exit(1);
}
const client = new VizioClient({ host: secret.host, port: secret.port, authToken: secret.token, timeoutMs: 5000 });
console.log(`NOIR TV report · ${secret.host}:${secret.port}`);
for (const [label, path] of Object.entries({
  deviceInfo: PATHS.deviceInfo, power: PATHS.power, inputs: PATHS.inputs, currentInput: PATHS.currentInput,
  audio: PATHS.audio, currentApp: PATHS.currentApp,
})) {
  try {
    const r = await client.get(path);
    const body = JSON.stringify(r.ITEMS ?? r.ITEM ?? r);
    console.log(`\n## ${label}  (${path})\n${body.length > 2500 ? `${body.slice(0, 2500)}…` : body}`);
  } catch (e) {
    console.log(`\n## ${label}  (${path})\nERROR: ${(e as Error).message}`);
  }
}
console.log('\nDone. Nothing was changed on the TV.');
store.close();
