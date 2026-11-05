/**
 * Read-only compatibility probe for your TV. Changes nothing on the TV.
 *
 *   npm run probe -w @noir/server              # search the network
 *   npm run probe -w @noir/server -- 192.168.1.42
 *
 * Reports: whether the SmartCast HTTPS API answers (port 7345 / 9000), and what
 * unauthenticated endpoints return. Paste the output into an issue / the docs if
 * something behaves differently on your model.
 */
import { VizioClient, VizioError, discoverTVs, findSmartCastPort } from '@noir/tv-adapters/node';

const host = process.argv[2];
const line = (k: string, v: string) => console.log(`  ${k.padEnd(26)} ${v}`);

async function probe(ip: string) {
  console.log(`\nProbing ${ip}`);
  const port = await findSmartCastPort(ip, 2000);
  line('SmartCast HTTPS port', port ? String(port) : 'none answered (tried 7345, 9000)');
  if (!port) {
    console.log('\n  → The TV did not expose the SmartCast local API. Check it is on, on the same network,\n    and that “Mobile/SmartCast” or remote-control features are enabled in its settings.');
    return;
  }
  const client = new VizioClient({ host: ip, port, timeoutMs: 4000 });
  for (const [label, path] of [['Device info (no auth)', '/state/device/deviceinfo'], ['Power state (no auth)', '/state/device/power_mode']] as const) {
    try {
      const r = await client.get(path);
      line(label, JSON.stringify(r.ITEMS?.[0]?.VALUE ?? r.ITEMS ?? r).slice(0, 160));
    } catch (e) {
      line(label, e instanceof VizioError ? `${e.code}${e.httpStatus ? ` (HTTP ${e.httpStatus})` : ''}: ${e.message}` : String(e));
    }
  }
  console.log('\n  → If a port answered, pair from NOIR: Settings → Devices → Enter TV IP address (or the phone app).');
}

if (host) await probe(host);
else {
  console.log('Searching the local network (SSDP, then a port scan)…');
  const found = await discoverTVs({ scan: true });
  if (!found.length) console.log('No SmartCast TVs found. Pass the TV’s IP: npm run probe -w @noir/server -- <ip>');
  for (const tv of found) await probe(tv.host);
}
