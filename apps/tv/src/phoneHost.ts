/**
 * Phone companion host for self-contained (Google TV) mode.
 *
 * The NOIR launcher's built-in server (android/…/PhoneServer.kt) forwards every phone API request
 * and WebSocket message here. This module speaks the same protocol as the NOIR Node server, so the
 * phone app works unchanged:
 *   - pairing: POST /api/phone/pair/request shows a 6-digit code on the TV; /confirm exchanges it
 *     for a random token. Only a SHA-256 hash of each token is stored (localStorage).
 *   - every other request and socket must present a valid token.
 */
import { extractUrl, CommandSchema, NAV_KEYS, type NavKey, type NoirState, type PairedPhone } from '@noir/core';
import { command, emitRemoteNav, patchSettings, useNoir } from '@noir/ui';
import { androidBridge } from './lib/android.ts';
import { getPower, goveeHasKey, setPower } from './lib/govee.ts';
import { addSaved, loadSaved, openSaved, removeSaved } from './lib/saved.ts';
import { customSounds, playSound, setCustomSound, type SoundKind } from './lib/sound.ts';

interface StoredPhone extends PairedPhone { hash: string }
interface PairRequest { id: string; code: string; name: string; expiresAt: number; attempts: number }
interface Client { authorized: boolean; phoneId?: string }

type Bridge = { phoneRespond?(id: string, status: number, body: string): void; phoneSend?(clientId: string, text: string): void; phoneClose?(clientId: string): void; phoneUrl?(): string | null };
const native = () => androidBridge() as (ReturnType<typeof androidBridge> & Bridge) | undefined;

const PHONES_KEY = 'noir.phones';
let pairRequest: PairRequest | null = null;
const clients = new Map<string, Client>();

/* ------------------------------- storage -------------------------------- */

function loadPhones(): StoredPhone[] {
  try { return JSON.parse(localStorage.getItem(PHONES_KEY) ?? '[]') as StoredPhone[]; } catch { return []; }
}
function savePhones(list: StoredPhone[]) {
  try { localStorage.setItem(PHONES_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}
export function pairedPhones(): PairedPhone[] {
  return loadPhones().map(({ hash: _hash, ...p }) => p);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomCode(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, '0');
}
/** Constant-time string compare (for pairing codes). */
function sameCode(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function phoneForToken(token: string | undefined | null): Promise<StoredPhone | null> {
  if (!token) return null;
  const hash = await sha256(token);
  const list = loadPhones();
  const phone = list.find((p) => p.hash === hash) ?? null;
  if (phone) { phone.lastSeenAt = Date.now(); savePhones(list); }
  return phone;
}

function setPairing(r: PairRequest | null) {
  pairRequest = r;
  useNoir.setState({ phonePairing: r ? { code: r.code, expiresAt: r.expiresAt, deviceName: r.name } : null });
}

function refreshPhonesInState() {
  const cur = useNoir.getState().state;
  if (cur) useNoir.setState({ state: { ...cur, phones: pairedPhones() } });
}

/** Called by the TV UI (Settings → Devices). */
export function removePhone(id: string) {
  savePhones(loadPhones().filter((p) => p.id !== id));
  for (const [cid, c] of clients) if (c.phoneId === id) { native()?.phoneClose?.(cid); clients.delete(cid); }
  refreshPhonesInState();
}
export function denyPairing() { setPairing(null); }
export const phoneUrl = () => { try { return native()?.phoneUrl?.() ?? null; } catch { return null; } };

/* -------------------------------- HTTP ---------------------------------- */

type Reply = [number, unknown];
const err = (status: number, message: string): Reply => [status, { message }];

async function handle(method: string, path: string, auth: string, body: string): Promise<Reply> {
  const url = new URL(path, 'http://phone.local');
  const p = url.pathname;
  const json = () => { try { return body ? JSON.parse(body) as Record<string, unknown> : {}; } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); } };

  if (p === '/api/health') return [200, { ok: true }];

  if (p === '/api/phone/pair/request' && method === 'POST') {
    const name = String(json().name ?? 'Phone').trim().slice(0, 40) || 'Phone';
    const r: PairRequest = { id: crypto.randomUUID(), code: randomCode(), name, expiresAt: Date.now() + 120_000, attempts: 0 };
    setPairing(r);
    setTimeout(() => { if (pairRequest?.id === r.id) setPairing(null); }, 121_000);
    return [200, { requestId: r.id, expiresAt: r.expiresAt, displayedOnTv: true }];
  }
  if (p === '/api/phone/pair/confirm' && method === 'POST') {
    const b = json();
    const r = pairRequest;
    if (!r || r.id !== b.requestId || r.expiresAt < Date.now()) return err(410, 'This pairing request expired. Start again.');
    r.attempts++;
    if (!sameCode(r.code, String(b.code ?? ''))) {
      if (r.attempts >= 5) { setPairing(null); return err(429, 'Too many incorrect codes. Start again.'); }
      return err(403, 'That code doesn’t match the one on your TV.');
    }
    setPairing(null);
    const token = randomToken();
    const phone: StoredPhone = { id: crypto.randomUUID(), name: r.name, createdAt: Date.now(), lastSeenAt: Date.now(), hash: await sha256(token) };
    savePhones([...loadPhones(), phone]);
    refreshPhonesInState();
    const { hash: _h, ...pub } = phone;
    return [200, { token, phone: pub }];
  }

  // Everything else needs a paired phone.
  const me = await phoneForToken(auth.startsWith('Bearer ') ? auth.slice(7) : null);
  if (!me) return err(401, 'This phone isn’t paired with NOIR. Pair it again from the phone app.');

  if (p === '/api/state' && method === 'GET') return [200, snapshot()];
  if (p === '/api/settings' && method === 'PATCH') {
    try { await patchSettings(json()); } catch (e) { return err(400, (e as Error).message); }
    return [200, useNoir.getState().state?.settings ?? {}];
  }
  if (p === '/api/command' && method === 'POST') {
    const parsed = CommandSchema.safeParse(json());
    if (!parsed.success) return err(400, 'Invalid command');
    return [200, await command(parsed.data, { silent: true })];
  }
  if (p === '/api/lights' && method === 'GET') {
    const lights = useNoir.getState().state?.settings.smartHome.devices ?? [];
    if (!goveeHasKey()) return [200, lights.map((l) => ({ ...l, on: null }))];
    return [200, await Promise.all(lights.map(async (l) => ({ ...l, on: await getPower(l).catch(() => null) })))];
  }
  const light = p.match(/^\/api\/lights\/([^/]+)$/);
  if (light && method === 'POST') {
    const l = useNoir.getState().state?.settings.smartHome.devices.find((d) => d.device === decodeURIComponent(light[1]!));
    if (!l) return err(404, 'Unknown light');
    const want = typeof json().on === 'boolean' ? (json().on as boolean) : !((await getPower(l).catch(() => null)) ?? false);
    const r = await setPower(l, want);
    if (r.status === 'verified') window.dispatchEvent(new CustomEvent('noir-light', { detail: { device: l.device, on: r.on } }));
    return [200, r];
  }
  if (p === '/api/saved' && method === 'GET') return [200, loadSaved()];
  if (p === '/api/saved' && method === 'POST') {
    const url = extractUrl(String(json().url ?? ''));
    if (!url) return err(400, 'That doesn’t look like a link.');
    return [200, addSaved(url)];
  }
  const sv = p.match(/^\/api\/saved\/([^/]+)(\/open)?$/);
  if (sv) {
    const item = loadSaved().find((s) => s.id === decodeURIComponent(sv[1]!));
    if (!item) return err(404, 'That link isn’t saved any more.');
    if (sv[2] && method === 'POST') return [200, openSaved(item)];
    if (!sv[2] && method === 'DELETE') { removeSaved(item.id); return [200, { ok: true }]; }
  }
  if (p === '/api/sounds/custom' && method === 'GET') return [200, soundSlots()];
  const snd = p.match(/^\/api\/sounds\/custom\/(move|select|back)$/);
  if (snd) {
    const kind = snd[1] as SoundKind;
    if (method === 'DELETE') { await setCustomSound(kind, null); return [200, soundSlots()]; }
    if (method === 'PUT') {
      const data = json().data;
      if (typeof data !== 'string' || !data) return err(400, 'No audio file received.');
      try { await setCustomSound(kind, data); } catch (e) { return err(400, (e as Error).message); }
      playSound(kind, 'custom'); // let the room hear the new clip
      return [200, soundSlots()];
    }
  }
  if (p === '/api/phones' && method === 'GET') return [200, pairedPhones()];
  const del = p.match(/^\/api\/phones\/([^/]+)$/);
  if (del && method === 'DELETE') { removePhone(decodeURIComponent(del[1]!)); return [200, { ok: true }]; }

  return err(404, 'Not available on the Google TV setup.');
}

function soundSlots() {
  const s = customSounds();
  return { move: !!s.move, select: !!s.select, back: !!s.back };
}

function snapshot(): NoirState | null {
  const s = useNoir.getState().state;
  if (!s) return null;
  // The cover is served by the stick at /art/… for phones (the TV page uses its own origin).
  const track = s.music.track;
  const art = track?.artUrl?.replace('https://appassets.androidplatform.net/art/', '/art/');
  const music = track && art !== track.artUrl ? { ...s.music, track: { ...track, artUrl: art } } : s.music;
  return { ...s, music, phones: pairedPhones() };
}

/* ------------------------------ WebSocket ------------------------------- */

function sendTo(clientId: string, msg: unknown) {
  native()?.phoneSend?.(clientId, JSON.stringify(msg));
}

async function onSocket(event: string, clientId: string, data: string) {
  if (event === 'open') { clients.set(clientId, { authorized: false }); return; }
  if (event === 'close') { clients.delete(clientId); return; }
  const c = clients.get(clientId);
  if (!c) return;
  let msg: { type?: string; token?: string; role?: string; key?: string };
  try { msg = JSON.parse(data) as typeof msg; } catch { return; }
  if (msg.type === 'hello') {
    const phone = await phoneForToken(msg.token);
    c.authorized = !!phone;
    c.phoneId = phone?.id;
    sendTo(clientId, { type: 'welcome', role: msg.role === 'tv' ? 'tv' : 'phone', authorized: c.authorized });
    if (!c.authorized) { native()?.phoneClose?.(clientId); clients.delete(clientId); return; }
    sendTo(clientId, { type: 'state', state: snapshot() });
    return;
  }
  if (!c.authorized) return;
  if (msg.type === 'nav' && (NAV_KEYS as readonly string[]).includes(msg.key ?? '')) emitRemoteNav(msg.key as NavKey);
  else if (msg.type === 'ping') sendTo(clientId, { type: 'pong' });
}

/* -------------------------------- wiring -------------------------------- */

export function startPhoneHost() {
  const w = window as unknown as Record<string, unknown>;
  w.__noirPhoneRequest = (id: string, method: string, path: string, auth: string, body: string) => {
    void handle(method, path, auth, body)
      .catch((e: Error & { status?: number }) => err(e.status ?? 500, e.message))
      .then(([status, payload]) => native()?.phoneRespond?.(id, status, JSON.stringify(payload ?? null)));
  };
  w.__noirPhoneSocket = (event: string, clientId: string, data: string) => { void onSocket(event, clientId, data); };

  // Push state to paired phones when it changes (debounced; at most ~6/s).
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: NoirState | null = null;
  useNoir.subscribe((s) => {
    if (s.state === last) return;
    last = s.state;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const snap = snapshot();
      for (const [id, c] of clients) if (c.authorized) sendTo(id, { type: 'state', state: snap });
    }, 150);
  });
}
