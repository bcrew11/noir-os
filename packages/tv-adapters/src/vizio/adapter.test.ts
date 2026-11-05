import { describe, expect, it } from 'vitest';
import type { Transport } from './client.ts';
import { VizioAdapter, PATHS, VIZIO_PLATFORM } from './adapter.ts';
import { finishPairing, startPairing } from './pairing.ts';
import { parseVizioCatalog } from './app-catalog.ts';

/** A fake SmartCast TV. `sticky` simulates a TV that accepts writes but doesn't apply them. */
function fakeTv(opts: { sticky?: boolean } = {}) {
  const st = { input: 'HDMI-1', volume: 20, muted: false, app: null as null | Record<string, unknown>, power: 1 };
  const calls: Array<{ method: string; path: string; body?: unknown; auth?: string }> = [];
  const ok = (extra: object) => ({ status: 200, body: JSON.stringify({ STATUS: { RESULT: 'SUCCESS' }, ...extra }) });
  const transport: Transport = async ({ method, path, body, headers }) => {
    const b = body ? JSON.parse(body) : undefined;
    calls.push({ method, path, body: b, auth: headers.AUTH });
    if (!headers.AUTH && !path.startsWith('/pairing')) return { status: 403, body: '' };
    switch (`${method} ${path}`) {
      case `GET ${PATHS.power}`: return ok({ ITEMS: [{ VALUE: st.power }] });
      case `GET ${PATHS.currentInput}`: return ok({ ITEMS: [{ VALUE: st.input, HASHVAL: 42 }] });
      case `PUT ${PATHS.currentInput}`: if (!opts.sticky) st.input = b.VALUE; return ok({});
      case `GET ${PATHS.inputs}`: return ok({ ITEMS: [{ NAME: 'HDMI-1', VALUE: { NAME: 'PlayStation' } }, { NAME: 'HDMI-2', VALUE: { NAME: 'HDMI-2' } }, { NAME: 'CAST', VALUE: { NAME: 'CAST' } }] });
      case `GET ${PATHS.audio}`: return ok({ ITEMS: [{ CNAME: 'volume', VALUE: st.volume }, { CNAME: 'mute', VALUE: st.muted ? 'On' : 'Off' }] });
      case `GET ${PATHS.volume}`: return ok({ ITEMS: [{ VALUE: st.volume, HASHVAL: 7 }] });
      case `PUT ${PATHS.volume}`: if (!opts.sticky) st.volume = b.VALUE; return ok({});
      case `PUT ${PATHS.keys}`: {
        const k = b.KEYLIST[0];
        if (k.CODESET === 5 && k.CODE === 3) st.muted = true;
        if (k.CODESET === 5 && k.CODE === 2) st.muted = false;
        return ok({});
      }
      case `GET ${PATHS.currentApp}`: return ok({ ITEM: { VALUE: st.app } });
      case `PUT ${PATHS.launchApp}`: if (!opts.sticky) st.app = b.VALUE; return ok({});
      case `GET ${PATHS.deviceInfo}`: return ok({ ITEMS: [{ VALUE: { MODEL_NAME: 'W4K65M-1031', VERSION: '86.920.9.3-2' } }] });
      case 'PUT /pairing/start': return ok({ ITEM: { PAIRING_REQ_TOKEN: 123, CHALLENGE_TYPE: 1 } });
      case 'PUT /pairing/pair': return b.RESPONSE_VALUE === '1234' ? ok({ ITEM: { AUTH_TOKEN: 'tok-abc' } }) : { status: 200, body: JSON.stringify({ STATUS: { RESULT: 'INVALID_PIN' } }) };
    }
    return { status: 404, body: '' };
  };
  return { st, calls, transport };
}

const make = (sticky = false) => {
  const tv = fakeTv({ sticky });
  return { tv, a: new VizioAdapter({ host: '10.0.0.9', port: 7345, authToken: 'tok', transport: tv.transport, verifyDelayMs: 1 }) };
};

describe('VizioAdapter', () => {
  it('sends the auth token and reads device info', async () => {
    const { a, tv } = make();
    const info = await a.getDeviceInfo();
    expect(info.model).toBe('W4K65M-1031');
    expect(info.firmware).toBe('86.920.9.3-2');
    expect(tv.calls.every((c) => c.auth === 'tok')).toBe(true);
  });

  it('lists inputs without the cast pseudo-input', async () => {
    const { a } = make();
    expect((await a.getInputs()).map((i) => i.id)).toEqual(['HDMI-1', 'HDMI-2']);
  });

  it('reports verified only when the TV reads back the new input', async () => {
    const { a } = make();
    const r = await a.switchInput('HDMI-2');
    expect(r.status).toBe('verified');
    expect((await a.getCapabilities()).inputs.level).toBe('verified');
  });

  it('reports sent (not success) when the TV accepts but does not apply', async () => {
    const { a } = make(true);
    expect((await a.switchInput('HDMI-2')).status).toBe('sent');
    expect((await a.setVolume(50)).status).toBe('sent');
    expect((await a.getCapabilities()).inputs.level).toBe('documented');
  });

  it('verifies volume and mute by read-back', async () => {
    const { a } = make();
    expect((await a.setVolume(33)).status).toBe('verified');
    expect((await a.setMuted(true)).status).toBe('verified');
  });

  it('verifies app launches by reading the foreground app', async () => {
    const { a } = make();
    const r = await a.launchApp({ platform: VIZIO_PLATFORM, config: { APP_ID: '1', NAME_SPACE: 3, MESSAGE: null }, source: 'learned', verified: false });
    expect(r.status).toBe('verified');
  });

  it('turns network errors into failed results instead of throwing', async () => {
    const a = new VizioAdapter({ host: 'x', port: 1, authToken: 't', transport: async () => { throw Object.assign(new Error('ECONNREFUSED'), {}); }, verifyDelayMs: 1 });
    expect((await a.switchInput('HDMI-1')).status).toBe('failed');
  });
});

describe('pairing', () => {
  it('exchanges the on-screen PIN for an auth token', async () => {
    const { transport } = fakeTv();
    const ch = await startPairing('10.0.0.9', 7345, 'noir-1', 'NOIR', transport);
    await expect(finishPairing(ch, '0000', transport)).rejects.toThrow(/INVALID_PIN/);
    expect(await finishPairing(ch, '1234', transport)).toBe('tok-abc');
  });
});

describe('VIZIO catalog parsing', () => {
  it('maps catalog entries to NOIR apps as candidates', () => {
    const apps = [{ id: 11, name: 'Netflix' }, { id: 12, name: 'Some Unknown App' }];
    const avail = [{ id: 11, chipsets: { '*': [{ app_type_payload: '{"NAME_SPACE":3,"APP_ID":"1","MESSAGE":null}' }] } }];
    expect(parseVizioCatalog(apps, avail)).toEqual([{ noirId: 'netflix', vizioName: 'Netflix', config: { APP_ID: '1', NAME_SPACE: 3, MESSAGE: null } }]);
    expect(parseVizioCatalog(null, null)).toEqual([]);
  });
});
