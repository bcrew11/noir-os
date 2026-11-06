import dgram from 'node:dgram';
import http from 'node:http';
import https from 'node:https';
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

/**
 * Device info is readable without pairing (confirmed on onn W4K65M-1031, API 3.7.3), which lets
 * discovery show the model and the TV's own name before the user pairs.
 */
export function readPublicDeviceInfo(host: string, port: number, timeoutMs = 2500): Promise<{ name?: string; model?: string } | null> {
  return new Promise((resolve) => {
    const req = https.request({ host, port, path: '/state/device/deviceinfo', method: 'GET', rejectUnauthorized: false, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => { body += c.toString(); });
      res.on('end', () => {
        try {
          const v = (JSON.parse(body) as { ITEMS?: Array<{ VALUE?: Record<string, unknown> }> }).ITEMS?.[0]?.VALUE ?? {};
          resolve({ name: typeof v.CAST_NAME === 'string' ? v.CAST_NAME : undefined, model: typeof v.MODEL_NAME === 'string' ? v.MODEL_NAME : undefined });
        } catch { resolve(null); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}

export async function discoverTVs(opts: { scan?: boolean } = {}): Promise<DiscoveredTV[]> {
  // SSDP alone may miss the TV (it did on the onn W4K65M — only the router and a Roku answered),
  // so fall back to the port scan whenever SSDP finds nothing with an open SmartCast port.
  const ssdp = (await ssdpDiscover()).filter((t) => t.port);
  const found = ssdp.length || !opts.scan ? ssdp : await subnetScan();
  await Promise.all(found.map(async (t) => {
    if (!t.port) return;
    const info = await readPublicDeviceInfo(t.host, t.port);
    if (info) { t.name = info.name ?? t.name; t.model = info.model ?? t.model; }
  }));
  return found;
}
