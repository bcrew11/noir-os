#!/usr/bin/env node
// NOIR TV probe — standalone, no dependencies (Node.js 18+). READ-ONLY: changes nothing on the TV.
//
//   node noir-probe.mjs                 # search your network for the TV
//   node noir-probe.mjs 192.168.1.42    # probe a specific address
//
// Paste the full output back to Claude.
import dgram from 'node:dgram';
import https from 'node:https';
import http from 'node:http';
import os from 'node:os';
import tls from 'node:tls';

const PORTS = [7345, 9000];
const out = (...a) => console.log(...a);

function tlsOpen(host, port, ms = 700) {
  return new Promise((res) => {
    const s = tls.connect({ host, port, rejectUnauthorized: false, timeout: ms }, () => { s.end(); res(true); });
    s.on('timeout', () => { s.destroy(); res(false); });
    s.on('error', () => res(false));
  });
}

function get(host, port, path) {
  return new Promise((res) => {
    const req = https.request({ host, port, path, method: 'GET', rejectUnauthorized: false, timeout: 4000 }, (r) => {
      let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b.slice(0, 600) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => res({ status: 0, body: e.message }));
    req.end();
  });
}

function ssdp(ms = 3000) {
  return new Promise((resolve) => {
    const found = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const msg = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n');
    sock.on('message', (b, r) => {
      const loc = b.toString().match(/^location:\s*(.+)$/im)?.[1]?.trim();
      const server = b.toString().match(/^server:\s*(.+)$/im)?.[1]?.trim();
      if (!found.has(r.address)) found.set(r.address, { loc, server });
    });
    sock.on('error', () => {});
    sock.bind(() => { try { sock.send(msg, 1900, '239.255.255.250'); setTimeout(() => sock.send(msg, 1900, '239.255.255.250'), 700); } catch { /* multicast unavailable */ } });
    setTimeout(async () => {
      sock.close();
      const list = [];
      for (const [ip, { loc, server }] of found) {
        let xml = '';
        if (loc) xml = await new Promise((r) => http.get(loc, { timeout: 1500 }, (s) => { let d = ''; s.on('data', (c) => (d += c)); s.on('end', () => r(d)); }).on('error', () => r('')).on('timeout', function () { this.destroy(); r(''); }));
        const tag = (t) => xml.match(new RegExp(`<${t}>([^<]*)</${t}>`, 'i'))?.[1];
        list.push({ ip, server, name: tag('friendlyName'), maker: tag('manufacturer'), model: tag('modelName') });
      }
      resolve(list);
    }, ms);
  });
}

async function scan() {
  const prefixes = new Set();
  for (const a of Object.values(os.networkInterfaces()).flat()) {
    if (a && a.family === 'IPv4' && !a.internal) prefixes.add(a.address.split('.').slice(0, 3).join('.'));
  }
  const hosts = [...prefixes].flatMap((p) => Array.from({ length: 254 }, (_, i) => `${p}.${i + 1}`));
  const hits = []; let i = 0;
  await Promise.all(Array.from({ length: 64 }, async () => {
    while (i < hosts.length) { const h = hosts[i++]; for (const p of PORTS) if (await tlsOpen(h, p, 500)) { hits.push(h); break; } }
  }));
  return hits;
}

async function probe(ip) {
  out(`\n=== ${ip} ===`);
  let port = null;
  for (const p of PORTS) { const open = await tlsOpen(ip, p, 2000); out(`port ${p}: ${open ? 'OPEN (TLS)' : 'closed'}`); if (open && !port) port = p; }
  if (!port) return out('No SmartCast API port answered.');
  for (const path of ['/state/device/deviceinfo', '/state/device/power_mode', '/menu_native/dynamic/tv_settings/devices/current_input', '/app/current']) {
    const r = await get(ip, port, path);
    out(`GET ${path} -> HTTP ${r.status}\n  ${r.body.replace(/\s+/g, ' ')}`);
  }
}

out(`NOIR probe · node ${process.version} · ${os.platform()}`);
out('Local addresses:', Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address).join(', ') || 'none');
const target = process.argv[2];
if (target) await probe(target);
else {
  out('\nSSDP discovery (3s)…');
  const dev = await ssdp();
  for (const d of dev) out(`  ${d.ip}  ${[d.maker, d.model, d.name].filter(Boolean).join(' | ') || d.server || ''}`);
  const tvs = dev.filter((d) => /vizio|onn|smartcast/i.test(`${d.maker} ${d.model} ${d.name} ${d.server}`)).map((d) => d.ip);
  out(`\nPort scan for 7345/9000 (up to ~30s)…`);
  const hits = await scan();
  out(`  answered: ${hits.join(', ') || 'none'}`);
  const all = [...new Set([...tvs, ...hits])];
  if (!all.length) out('\nNo TV found automatically. Re-run with the TV IP: node noir-probe.mjs <ip>  (TV: Menu → Network → Network Information)');
  for (const ip of all) await probe(ip);
}
out('\nDone. Nothing was changed on the TV.');
