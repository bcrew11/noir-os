import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { loadConfig } from './config.ts';
import { buildServer } from './app.ts';
import { parseCecLine } from './cec.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noir-test-'));
let srv: Awaited<ReturnType<typeof buildServer>>;
const LAN = { remoteAddress: '10.1.2.3' };

beforeAll(async () => {
  srv = await buildServer({ ...loadConfig({ NOIR_DATA_DIR: dir }), tvDist: '/nonexistent', phoneDist: '/nonexistent' });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
});
afterAll(async () => { await srv.app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('NOIR server', () => {
  it('serves state to the local dashboard in demo mode', async () => {
    const r = await srv.app.inject({ url: '/api/state' });
    expect(r.statusCode).toBe(200);
    expect(r.json().mode).toBe('demo');
    expect(r.json().tv.adapter).toBe('mock');
  });

  it('rejects unpaired LAN devices', async () => {
    expect((await srv.app.inject({ url: '/api/state', ...LAN })).statusCode).toBe(401);
    expect((await srv.app.inject({ url: '/api/state', ...LAN, headers: { 'x-forwarded-for': '127.0.0.1' } })).statusCode).toBe(401);
    // A proxied request from a LAN phone (dev proxy on localhost) must not be trusted.
    expect((await srv.app.inject({ url: '/api/state', headers: { 'x-forwarded-for': '10.1.2.3' } })).statusCode).toBe(401);
  });

  it('pairs a phone with the code shown on the TV and accepts its token', async () => {
    // Act as the TV screen: the code is only ever sent to dashboards.
    const port = (srv.app.server.address() as { port: number }).port;
    const tv = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const codes: string[] = [];
    tv.on('message', (m: Buffer) => { const msg = JSON.parse(String(m)); if (msg.type === 'phonePairing' && msg.request) codes.push(msg.request.code); });
    await new Promise((r) => tv.once('open', r));
    tv.send(JSON.stringify({ type: 'hello', role: 'tv' }));
    await new Promise((r) => setTimeout(r, 80));

    const req = (await srv.app.inject({ method: 'POST', url: '/api/phone/pair/request', ...LAN, payload: { name: 'Test phone' } })).json();
    expect(JSON.stringify(req)).not.toMatch(/"code"/);
    await new Promise((r) => setTimeout(r, 80));
    const code = codes.at(-1)!;
    expect(code).toMatch(/^\d{6}$/);

    const wrong = code === '000000' ? '111111' : '000000';
    expect((await srv.app.inject({ method: 'POST', url: '/api/phone/pair/confirm', ...LAN, payload: { requestId: req.requestId, code: wrong } })).statusCode).toBe(403);
    const ok = await srv.app.inject({ method: 'POST', url: '/api/phone/pair/confirm', ...LAN, payload: { requestId: req.requestId, code } });
    expect(ok.statusCode).toBe(200);
    const { token } = ok.json();
    // Code is single-use.
    expect((await srv.app.inject({ method: 'POST', url: '/api/phone/pair/confirm', ...LAN, payload: { requestId: req.requestId, code } })).statusCode).toBe(410);

    expect((await srv.app.inject({ url: '/api/state', ...LAN, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    const phones = srv.store.listPhones();
    expect(phones.map((p) => p.name)).toContain('Test phone');
    await srv.app.inject({ method: 'DELETE', url: `/api/phones/${phones[0]!.id}` });
    expect((await srv.app.inject({ url: '/api/state', ...LAN, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    tv.terminate();
  });

  it('locks a pairing request after 5 wrong codes', async () => {
    const req = (await srv.app.inject({ method: 'POST', url: '/api/phone/pair/request', ...LAN, payload: {} })).json();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await srv.app.inject({ method: 'POST', url: '/api/phone/pair/confirm', ...LAN, payload: { requestId: req.requestId, code: String(100000 + i) } })).statusCode);
    }
    expect(statuses.slice(-2)).toEqual([429, 410]);
  });

  it('validates settings patches', async () => {
    const bad = await srv.app.inject({ method: 'PATCH', url: '/api/settings', payload: { appearance: { accent: 'nope' } } });
    expect(bad.statusCode).toBe(400);
    const good = await srv.app.inject({ method: 'PATCH', url: '/api/settings', payload: { appearance: { accent: 'indigo' } } });
    expect(good.json().appearance.accent).toBe('indigo');
    expect(srv.store.getSettings().appearance.accent).toBe('indigo');
  });

  it('labels demo app launches honestly', async () => {
    const r = (await srv.app.inject({ method: 'POST', url: '/api/command', payload: { type: 'app.launch', appId: 'netflix' } })).json();
    expect(r.status).toBe('demo');
    expect(r.message).toMatch(/simulated/);
  });

  it('rejects unknown commands', async () => {
    expect((await srv.app.inject({ method: 'POST', url: '/api/command', payload: { type: 'tv.selfDestruct' } })).statusCode).toBe(400);
  });

  it('never exposes secrets in state', async () => {
    srv.store.setSecret('vizio', { host: '1.2.3.4', port: 7345, token: 'SECRET-TOKEN' });
    const body = (await srv.app.inject({ url: '/api/state' })).body;
    expect(body).not.toContain('SECRET-TOKEN');
    expect(srv.store.getSecret<{ token: string }>('vizio')?.token).toBe('SECRET-TOKEN');
    const raw = srv.store.db.prepare('SELECT value FROM secrets').all() as Array<{ value: string }>;
    expect(JSON.stringify(raw)).not.toContain('SECRET-TOKEN');
    srv.store.setSecret('vizio', null);
  });
});

describe('CEC bridge', () => {
  it('parses cec-client key presses', () => {
    expect(parseCecLine('TRAFFIC: [ 123] key pressed: up (1)')).toBe('up');
    expect(parseCecLine('key pressed: select (0)')).toBe('ok');
    expect(parseCecLine('key pressed: exit (d)')).toBe('back');
    expect(parseCecLine('key released: up (1) duration (120)')).toBeNull();
  });
});
