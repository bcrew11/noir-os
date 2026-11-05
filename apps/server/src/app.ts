import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import QRCode from 'qrcode';
import { z, ZodError } from 'zod';
import {
  APP_CATALOG, ClientMessageSchema, CommandSchema, NOIR_VERSION, applySettingsPatch, defaultSettings,
  type AppDefinition, type Command, type CommandResult, type NoirState, type ServerMessage, type Settings,
} from '@noir/core';
import { fetchWeather } from '@noir/integrations';
import type { ServerConfig } from './config.ts';
import { MusicManager } from './music-manager.ts';
import { Store } from './store.ts';
import { TVManager } from './tv-manager.ts';

interface Client {
  ws: WebSocket;
  role: 'tv' | 'phone' | null;
  authorized: boolean;
  phoneId?: string;
}

interface PhonePairRequest { id: string; code: string; name: string; expiresAt: number; attempts: number }

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export async function buildServer(cfg: ServerConfig, deps: { store?: Store; logger?: boolean } = {}) {
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 256 * 1024 });
  const store = deps.store ?? new Store(cfg.dataDir);
  let settings: Settings = store.getSettings();
  const clients = new Set<Client>();
  let phoneRequest: PhonePairRequest | null = null;
  let weather: NoirState['weather'] = null;
  let broadcastTimer: ReturnType<typeof setTimeout> | undefined;

  const log = (msg: string) => app.log.info(msg);
  const getSettings = () => settings;
  const scheduleBroadcast = () => {
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => broadcast({ type: 'state', state: snapshot() }), 30);
  };

  const tv = new TVManager(store, { demoTv: cfg.demoTv, getSettings, onChange: scheduleBroadcast, log });
  const music = new MusicManager(cfg, store, { getSettings, onChange: scheduleBroadcast });

  /* ------------------------------ assets ------------------------------ */
  const listDir = (dir: string, exts: RegExp) => {
    try { return fs.readdirSync(dir).filter((f) => exts.test(f)).sort(); } catch { return []; }
  };
  const scanAssets = () => {
    const logos: Record<string, string> = {};
    for (const f of listDir(path.join(cfg.assetsDir, 'icons'), /\.(svg|png|webp)$/i)) logos[f.replace(/\.[^.]+$/, '')] = `/assets/icons/${f}`;
    const photos = listDir(path.join(cfg.assetsDir, 'backgrounds/photos'), /\.(jpe?g|png|webp|avif)$/i).map((f) => `/assets/backgrounds/photos/${encodeURIComponent(f)}`);
    return { logos, photos };
  };
  let assets = scanAssets();

  /* ------------------------------ state ------------------------------- */
  function snapshot(): NoirState {
    const demo = tv.status.adapter === 'mock' || music.state.provider === 'demo';
    return {
      version: NOIR_VERSION,
      mode: demo ? 'demo' : 'live',
      deployment: cfg.deployment,
      settings,
      tv: tv.status,
      music: music.state,
      launch: tv.launchSummaries(),
      customApps: store.listCustomApps(),
      logos: assets.logos,
      photos: assets.photos,
      spotify: music.spotifyInfo,
      weather,
      phones: store.listPhones(),
    };
  }

  function sendTo(c: Client, msg: ServerMessage) {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  }
  function broadcast(msg: ServerMessage, filter: (c: Client) => boolean = () => true) {
    const data = JSON.stringify(msg);
    for (const c of clients) if (c.authorized && filter(c) && c.ws.readyState === 1) c.ws.send(data);
  }
  const toast = (t: Omit<Extract<ServerMessage, { type: 'toast' }>['toast'], 'id'>) =>
    broadcast({ type: 'toast', toast: { id: crypto.randomUUID(), ...t } });

  /* ------------------------------ auth -------------------------------- */
  function isLocal(req: FastifyRequest) {
    const remote = req.ip ?? req.socket?.remoteAddress ?? '';
    const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
    return LOOPBACK.has(remote) && (!fwd || LOOPBACK.has(fwd));
  }
  function bearer(req: FastifyRequest) {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7) : null;
  }
  function authorize(req: FastifyRequest): { ok: boolean; phoneId?: string } {
    if (isLocal(req)) return { ok: true };
    const t = bearer(req);
    const phone = t ? store.phoneForToken(t) : null;
    if (phone) {
      store.touchPhone(phone.id);
      return { ok: true, phoneId: phone.id };
    }
    return { ok: false };
  }
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!authorize(req).ok) return reply.code(401).send({ message: 'This device is not paired with NOIR. Pair it from the phone app.' });
  };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ message: 'Invalid request', issues: err.issues });
    const e = err as Error & { statusCode?: number };
    return reply.code(e.statusCode ?? 500).send({ message: e.message });
  });

  /* ----------------------------- realtime ------------------------------ */
  await app.register(fastifyWebsocket, { options: { maxPayload: 16 * 1024 } });
  app.register(async (scope) => {
    scope.get('/ws', { websocket: true }, (socket, req) => {
      const client: Client = { ws: socket, role: null, authorized: false };
      clients.add(client);
      const helloTimeout = setTimeout(() => { if (!client.role) socket.close(4000, 'hello required'); }, 5000);
      socket.on('message', (raw) => {
        let msg;
        try { msg = ClientMessageSchema.parse(JSON.parse(String(raw))); } catch { return; }
        if (msg.type === 'hello') {
          clearTimeout(helloTimeout);
          client.role = msg.role;
          const local = isLocal(req);
          const phone = msg.token ? store.phoneForToken(msg.token) : null;
          client.authorized = local || !!phone;
          client.phoneId = phone?.id;
          sendTo(client, { type: 'welcome', role: msg.role, authorized: client.authorized });
          if (!client.authorized) return socket.close(4001, 'unauthorized');
          if (phone) store.touchPhone(phone.id);
          sendTo(client, { type: 'state', state: snapshot() });
          if (msg.role === 'tv' && phoneRequest) sendTo(client, { type: 'phonePairing', request: { code: phoneRequest.code, expiresAt: phoneRequest.expiresAt, deviceName: phoneRequest.name } });
          music.setActive(true);
          return;
        }
        if (!client.authorized) return;
        if (msg.type === 'nav') broadcast({ type: 'nav', key: msg.key }, (c) => c.role === 'tv');
        else if (msg.type === 'ping') sendTo(client, { type: 'pong' });
      });
      socket.on('close', () => {
        clearTimeout(helloTimeout);
        clients.delete(client);
        if (![...clients].some((c) => c.authorized)) music.setActive(false);
      });
    });
  });

  /* ------------------------------ routes ------------------------------- */
  app.get('/api/health', async () => ({ ok: true, version: NOIR_VERSION }));

  app.register(async (api) => {
    api.addHook('preHandler', requireAuth);

    api.get('/api/state', async () => snapshot());

    api.patch('/api/settings', async (req) => {
      const prevProvider = settings.music.provider;
      settings = applySettingsPatch(settings, req.body);
      store.saveSettings(settings);
      if (settings.music.provider !== prevProvider) music.selectProvider();
      void refreshWeather();
      scheduleBroadcast();
      return settings;
    });

    api.post('/api/settings/reset', async () => {
      settings = defaultSettings();
      store.saveSettings(settings);
      music.selectProvider();
      scheduleBroadcast();
      return settings;
    });

    api.post('/api/command', async (req): Promise<CommandResult> => runCommand(CommandSchema.parse(req.body)));

    api.get('/api/catalog', async () => [...APP_CATALOG, ...store.listCustomApps()]);

    const CustomAppSchema = z.object({
      name: z.string().trim().min(1).max(40),
      category: z.enum(['streaming', 'live-tv', 'sports', 'music', 'entertainment', 'utilities']),
      webUrl: z.string().url().max(300).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#C084FC'),
    });
    api.post('/api/apps/custom', async (req) => {
      const b = CustomAppSchema.parse(req.body);
      const id = `custom-${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
      if (APP_CATALOG.some((a) => a.id === id)) throw Object.assign(new Error('That app already exists in the library.'), { statusCode: 409 });
      const def: AppDefinition = {
        id, name: b.name, category: b.category, description: 'Custom shortcut', webUrl: b.webUrl,
        brand: { background: 'linear-gradient(160deg,#241d33,#14101d)', color: b.color, font: 'sans', weight: 700 },
      };
      store.saveCustomApp(def);
      scheduleBroadcast();
      return def;
    });
    api.delete('/api/apps/custom/:id', async (req) => {
      const { id } = req.params as { id: string };
      store.deleteCustomApp(id);
      settings = applySettingsPatch(settings, { home: { favorites: settings.home.favorites.filter((f) => f !== id) } });
      store.saveSettings(settings);
      scheduleBroadcast();
      return { ok: true };
    });

    api.post('/api/apps/:id/learn', async (req) => tv.learn((req.params as { id: string }).id));
    api.delete('/api/apps/:id/launch', async (req) => { tv.forget((req.params as { id: string }).id); return { ok: true }; });
    api.post('/api/apps/import-catalog', async () => tv.importCatalog());

    api.post('/api/tv/discover', async (req) => {
      const { scan } = z.object({ scan: z.boolean().default(false) }).parse(req.body ?? {});
      return tv.discover(scan);
    });
    api.post('/api/tv/pair/start', async (req) => {
      const { host, port } = z.object({ host: z.string().trim().min(3).max(64), port: z.number().int().min(1).max(65535).optional() }).parse(req.body);
      const r = await tv.pairStart(host, port);
      broadcast({ type: 'tvPairing', stage: 'awaiting-pin', message: 'Enter the PIN shown on your TV.' });
      return r;
    });
    api.post('/api/tv/pair/finish', async (req) => {
      const { pin } = z.object({ pin: z.string().trim().min(4).max(6) }).parse(req.body);
      try {
        await tv.pairFinish(pin);
      } catch (e) {
        broadcast({ type: 'tvPairing', stage: 'error', message: (e as Error).message });
        throw e;
      }
      broadcast({ type: 'tvPairing', stage: 'paired', message: 'Television paired.' });
      toast({ tone: 'success', title: 'Television paired', body: tv.status.device?.model });
      return { ok: true, device: tv.status.device };
    });
    api.post('/api/tv/pair/cancel', async () => { await tv.pairCancel(); broadcast({ type: 'tvPairing', stage: 'idle' }); return { ok: true }; });
    api.post('/api/tv/unpair', async () => { await tv.unpair(); return { ok: true }; });
    api.post('/api/tv/refresh', async () => { await tv.refresh(); assets = scanAssets(); scheduleBroadcast(); return tv.status; });

    api.get('/api/phone/link', async () => {
      const urls = lanUrls(cfg.production ? cfg.port : Number(process.env.NOIR_PHONE_DEV_PORT ?? 5174));
      const qrSvg = urls[0] ? await QRCode.toString(urls[0], { type: 'svg', margin: 1, color: { dark: '#f8f7fc', light: '#00000000' } }) : null;
      return { urls, qrSvg };
    });
    api.get('/api/phones', async () => store.listPhones());
    api.delete('/api/phones/:id', async (req) => {
      const { id } = req.params as { id: string };
      store.removePhone(id);
      for (const c of clients) if (c.phoneId === id) c.ws.close(4001, 'revoked');
      scheduleBroadcast();
      return { ok: true };
    });
    api.post('/api/phone/pair/deny', async () => {
      phoneRequest = null;
      broadcast({ type: 'phonePairing', request: null }, (c) => c.role === 'tv');
      return { ok: true };
    });

    api.get('/api/music/spotify/login', async (req, reply) => {
      const url = music.spotifyLoginUrl();
      if ((req.query as { redirect?: string }).redirect === '1') return reply.redirect(url);
      return { url, note: 'Open this on the computer running NOIR — Spotify only redirects back to 127.0.0.1.' };
    });
    api.post('/api/music/spotify/disconnect', async () => { music.spotifyDisconnect(); return { ok: true }; });

    api.get('/api/diagnostics', async () => ({
      version: NOIR_VERSION,
      node: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      uptimeSec: Math.round(process.uptime()),
      deployment: cfg.deployment,
      demoTv: cfg.demoTv,
      tv: { adapter: tv.status.adapter, reachable: tv.status.reachable, lastError: tv.status.lastError, address: tv.status.device?.address, port: tv.status.device?.port, checkedAt: tv.status.checkedAt },
      clients: { tv: [...clients].filter((c) => c.role === 'tv').length, phone: [...clients].filter((c) => c.role === 'phone').length },
      lan: lanUrls(cfg.port),
      cec: cfg.cec,
    }));
  });

  /* --------------------- unauthenticated pairing --------------------- */
  app.post('/api/phone/pair/request', async (req) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(40).default('Phone') }).parse(req.body ?? {});
    // Only one outstanding request exists at a time; a new request replaces the old code.
    phoneRequest = { id: crypto.randomUUID(), code: String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'), name, expiresAt: Date.now() + 120_000, attempts: 0 };
    broadcast({ type: 'phonePairing', request: { code: phoneRequest.code, expiresAt: phoneRequest.expiresAt, deviceName: name } }, (c) => c.role === 'tv');
    return { requestId: phoneRequest.id, expiresAt: phoneRequest.expiresAt, displayedOnTv: [...clients].some((c) => c.authorized && c.role === 'tv') };
  });
  app.post('/api/phone/pair/confirm', async (req, reply) => {
    const { requestId, code } = z.object({ requestId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const r = phoneRequest;
    if (!r || r.id !== requestId || r.expiresAt < Date.now()) return reply.code(410).send({ message: 'This pairing request expired. Start again.' });
    r.attempts++;
    const match = crypto.timingSafeEqual(Buffer.from(r.code), Buffer.from(code));
    if (!match) {
      if (r.attempts >= 5) {
        phoneRequest = null;
        broadcast({ type: 'phonePairing', request: null }, (c) => c.role === 'tv');
        return reply.code(429).send({ message: 'Too many incorrect codes. Start again.' });
      }
      return reply.code(403).send({ message: 'That code doesn’t match the one on your TV.' });
    }
    phoneRequest = null;
    const { phone, token } = store.addPhone(r.name);
    broadcast({ type: 'phonePairing', request: null }, (c) => c.role === 'tv');
    toast({ tone: 'success', title: `${phone.name} paired`, body: 'It can now control NOIR.' });
    scheduleBroadcast();
    return { token, phone };
  });

  app.get('/api/music/spotify/callback', async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const page = (title: string, body: string) =>
      reply.type('text/html').send(`<!doctype html><meta name=viewport content="width=device-width"><title>NOIR</title><body style="background:#0b0912;color:#f8f7fc;font:18px system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-weight:600">${title}</h1><p style="color:#a9a3ba">${body}</p></div>`);
    if (q.error || !q.code || !q.state) return page('Spotify not connected', 'Sign-in was cancelled. You can close this tab.');
    try {
      await music.spotifyCallback(q.code, q.state);
      toast({ tone: 'success', title: 'Spotify connected' });
      return page('Spotify connected', 'You can close this tab and return to NOIR.');
    } catch (e) {
      return page('Spotify not connected', (e as Error).message.replace(/</g, '&lt;'));
    }
  });

  /* ------------------------------ static ------------------------------- */
  await app.register(fastifyStatic, { root: cfg.assetsDir, prefix: '/assets/', decorateReply: false, maxAge: '1h' });
  if (fs.existsSync(cfg.phoneDist)) {
    await app.register(fastifyStatic, { root: cfg.phoneDist, prefix: '/phone/', decorateReply: false });
  }
  if (fs.existsSync(cfg.tvDist)) {
    await app.register(fastifyStatic, { root: cfg.tvDist, prefix: '/', decorateReply: true, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) return reply.code(404).send({ message: 'Not found' });
      if (req.url.startsWith('/phone')) return reply.type('text/html').send(fs.readFileSync(path.join(cfg.phoneDist, 'index.html')));
      return reply.sendFile('index.html');
    });
  }

  /* ----------------------------- commands ------------------------------ */
  async function runCommand(cmd: Command): Promise<CommandResult> {
    switch (cmd.type) {
      case 'tv.key': return tv.key(cmd.key);
      case 'tv.volume': return tv.volume(cmd.volume);
      case 'tv.volumeStep': return tv.volumeStep(cmd.delta);
      case 'tv.mute': return tv.mute(cmd.muted);
      case 'tv.power': return tv.power(cmd.on);
      case 'tv.input': return tv.input(cmd.inputId);
      case 'tv.returnToNoir': return tv.returnToNoir();
      case 'app.launch': {
        // In Android TV mode the app lives on the NOIR device itself; the dashboard there opens it.
        if (cfg.deployment === 'android-tv') {
          const screens = [...clients].filter((c) => c.authorized && c.role === 'tv');
          if (!screens.length) return { status: 'failed', message: 'The NOIR launcher isn’t connected right now.' };
          broadcast({ type: 'launchOnDisplay', appId: cmd.appId }, (c) => c.role === 'tv');
          return { status: 'sent', message: 'Asked the NOIR launcher to open the app.' };
        }
        return tv.launch(cmd.appId);
      }
      case 'music.playpause': return music.playPause();
      case 'music.next': return music.next();
      case 'music.previous': return music.previous();
      case 'music.transfer': return music.transfer(cmd.deviceId);
    }
  }

  async function refreshWeather() {
    const w = settings.weather;
    if (w.latitude == null || w.longitude == null || !settings.ambient.showWeather) {
      weather = null;
      return;
    }
    if (weather && Date.now() - weather.updatedAt < 30 * 60_000) return;
    try {
      weather = await fetchWeather(w.latitude, w.longitude);
      scheduleBroadcast();
    } catch (e) {
      log(`weather: ${(e as Error).message}`);
    }
  }
  const weatherTimer = setInterval(() => void refreshWeather(), 30 * 60_000);

  app.addHook('onClose', async () => {
    tv.stop();
    music.stop();
    clearInterval(weatherTimer);
    clearTimeout(broadcastTimer);
  });

  await tv.init();
  void refreshWeather();

  return { app, store, tv, music, broadcast, snapshot, runCommand };
}

export function lanUrls(port: number, pathName = '/phone/'): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}${pathName}`);
  }
  return out;
}
