/**
 * Govee smart lights, through the NOIR Android launcher's native bridge.
 * The API key is stored and attached natively; this module never sees it.
 * API reference: https://developer.govee.com/reference/control-you-devices
 */
import { androidBridge, awaitNative, nativeCallbackId } from './android.ts';

export interface GoveeDevice { device: string; sku: string; name: string; canPower: boolean }
export interface PowerResult { status: 'verified' | 'sent' | 'failed'; on: boolean | null; message: string }

export const goveeAvailable = () => typeof androidBridge()?.goveeRequest === 'function';
export const goveeHasKey = () => { try { return !!androidBridge()?.goveeHasKey?.(); } catch { return false; } };
export const goveeSetKey = (key: string) => androidBridge()?.goveeSetKey?.(key.trim());

function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const bridge = androidBridge();
  if (!bridge?.goveeRequest) return Promise.reject(new Error('Smart home control runs on the NOIR Google TV launcher.'));
  const id = nativeCallbackId('govee');
  const result = awaitNative(id, 20000).catch(() => { throw new Error('Govee didn’t respond.'); });
  bridge.goveeRequest(id, method, path, body === undefined ? null : JSON.stringify(body));
  return result.then(([statusRaw, bodyRaw]) => {
    const status = Number(statusRaw);
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(String(bodyRaw || '{}')) as Record<string, unknown>; } catch { /* non-JSON error page */ }
    if (status === 401 || status === 403) throw new Error('Govee rejected the API key. Check it in Settings → Smart Home.');
    if (status === 429) throw new Error('Govee rate limit reached; try again in a minute.');
    if (status < 200 || status >= 300) throw new Error(String(json.message ?? `Govee error ${status}`));
    return { status, json };
  });
}

const rid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

type Cap = { type?: string; instance?: string; state?: { value?: unknown } };

export async function listDevices(): Promise<GoveeDevice[]> {
  const { json } = await call('GET', '/router/api/v1/user/devices');
  const data = (json.data ?? []) as Array<{ device: string; sku: string; deviceName?: string; capabilities?: Cap[] }>;
  return data.map((d) => ({
    device: d.device,
    sku: d.sku,
    name: d.deviceName || d.sku,
    canPower: (d.capabilities ?? []).some((c) => c.instance === 'powerSwitch'),
  }));
}

/** Current power state, or null if Govee can't say (e.g. the device is offline). */
export async function getPower(d: { device: string; sku: string }): Promise<boolean | null> {
  const { json } = await call('POST', '/router/api/v1/device/state', { requestId: rid(), payload: { sku: d.sku, device: d.device } });
  const caps = ((json.payload as { capabilities?: Cap[] } | undefined)?.capabilities ?? []);
  const online = caps.find((c) => c.instance === 'online')?.state?.value;
  const power = caps.find((c) => c.instance === 'powerSwitch')?.state?.value;
  if (online === false || power === undefined || power === null || power === '') return null;
  return Number(power) === 1;
}

/**
 * Turn a light on/off, then read its state back. Govee can acknowledge a command the light didn't
 * act on, so this only reports `verified` when the read-back matches.
 */
export async function setPower(d: { device: string; sku: string; name: string }, on: boolean): Promise<PowerResult> {
  try {
    await call('POST', '/router/api/v1/device/control', {
      requestId: rid(),
      payload: { sku: d.sku, device: d.device, capability: { type: 'devices.capabilities.on_off', instance: 'powerSwitch', value: on ? 1 : 0 } },
    });
  } catch (e) {
    return { status: 'failed', on: null, message: (e as Error).message };
  }
  for (const wait of [700, 1500]) {
    await new Promise((r) => setTimeout(r, wait));
    const now = await getPower(d).catch(() => null);
    if (now === on) return { status: 'verified', on, message: `${d.name} is ${on ? 'on' : 'off'}` };
  }
  return { status: 'sent', on: null, message: `${d.name}: sent, but Govee hasn’t confirmed the change yet` };
}
