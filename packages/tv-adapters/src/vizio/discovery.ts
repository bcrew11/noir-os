import dgram from 'node:dgram';
import http from 'node:http';
import os from 'node:os';
import tls from 'node:tls';

/** Ports used by the SmartCast local API: 7345 on current firmware, 9000 on older sets. */
export const SMARTCAST_PORTS = [7345, 9000] as const;

export interface DiscoveredTV {
  host: string;
  port: number | null;
  name?: string;
  manufacturer?: string;
  model?: string;
  via: 'ssdp' | 'scan' | 'manual';
}

/** True if a TLS service answers on host:port (SmartCast speaks HTTPS with a self-signed cert). */
export function probeTls(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      sock.end();
      resolve(true);
    });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.on('error', () => resolve(false));
  });
}

export async function findSmartCastPort(host: string, timeoutMs = 1200): Promise<number | null> {
  for (const port of SMARTCAST_PORTS) if (await probeTls(host, port, timeoutMs)) return port;
  return null;
}

function fetchText(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { body += c; if (body.length > 64_000) req.destroy(); });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`, 'i'))?.[1]?.trim();

/** SSDP (DIAL) discovery. VIZIO TVs advertise as DIAL devices for casting. */
export function ssdpDiscover(timeoutMs = 2500): Promise<DiscoveredTV[]> {
  return new Promise((resolve) => {
    const found = new Map<string, string>();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const msg = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:dial-multiscreen-org:device:dial:1\r\n\r\n',
    );
    sock.on('message', (buf, rinfo) => {
      const loc = buf.toString().match(/^location:\s*(.+)$/im)?.[1]?.trim();
      if (loc && !found.has(rinfo.address)) found.set(rinfo.address, loc);
    });
    sock.on('error', () => undefined);
    sock.bind(() => {
      try {
        sock.send(msg, 1900, '239.255.255.250');
        setTimeout(() => sock.send(msg, 1900, '239.255.255.250'), 600);
      } catch { /* multicast unavailable */ }
    });
    setTimeout(async () => {
      sock.close();
      const out: DiscoveredTV[] = [];
      await Promise.all(
        [...found].map(async ([host, loc]) => {
          const xml = await fetchText(loc, 1500).catch(() => '');
          const manufacturer = tag(xml, 'manufacturer');
          const name = tag(xml, 'friendlyName');
          const model = tag(xml, 'modelName');
          const looksVizio = /vizio|onn/i.test(`${manufacturer} ${name} ${model}`);
          if (!looksVizio) return;
          out.push({ host, port: await findSmartCastPort(host), name, manufacturer, model, via: 'ssdp' });
        }),
      );
      resolve(out);
    }, timeoutMs);
  });
}

/** Fallback for networks that block multicast: probe every host on local /24 subnets for port 7345/9000. */
export async function subnetScan(concurrency = 48, timeoutMs = 500): Promise<DiscoveredTV[]> {
  const prefixes = new Set<string>();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && /^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(a.address)) {
        prefixes.add(a.address.split('.').slice(0, 3).join('.'));
      }
    }
  }
  const hosts = [...prefixes].flatMap((p) => Array.from({ length: 254 }, (_, i) => `${p}.${i + 1}`));
  const out: DiscoveredTV[] = [];
  let idx = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (idx < hosts.length) {
        const host = hosts[idx++]!;
        for (const port of SMARTCAST_PORTS) {
          if (await probeTls(host, port, timeoutMs)) {
            out.push({ host, port, via: 'scan' });
            break;
          }
        }
      }
    }),
  );
  return out;
}

export async function discoverTVs(opts: { scan?: boolean } = {}): Promise<DiscoveredTV[]> {
  const ssdp = await ssdpDiscover();
  if (ssdp.length || !opts.scan) return ssdp;
  return subnetScan();
}
