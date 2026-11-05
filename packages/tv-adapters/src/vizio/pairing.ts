import { VizioClient, type Transport } from './client.ts';

/**
 * SmartCast PIN pairing (community-documented):
 *   1. PUT /pairing/start  { DEVICE_ID, DEVICE_NAME }        → TV shows a 4-digit PIN
 *   2. PUT /pairing/pair   { DEVICE_ID, CHALLENGE_TYPE, RESPONSE_VALUE: PIN, PAIRING_REQ_TOKEN } → AUTH_TOKEN
 * Re-pairing with the same DEVICE_ID invalidates the previous token.
 */
export interface PairingChallenge {
  host: string;
  port: number;
  deviceId: string;
  challengeType: number;
  pairingToken: number | string;
  startedAt: number;
}

export async function startPairing(host: string, port: number, deviceId: string, deviceName: string, transport?: Transport): Promise<PairingChallenge> {
  const client = new VizioClient({ host, port, timeoutMs: 6000 }, transport);
  const r = await client.put('/pairing/start', { DEVICE_ID: deviceId, DEVICE_NAME: deviceName });
  const item = (r.ITEM ?? {}) as Record<string, unknown>;
  if (item.PAIRING_REQ_TOKEN == null) throw new Error('The TV did not return a pairing token. Make sure it is on and not already showing a PIN.');
  return {
    host,
    port,
    deviceId,
    challengeType: Number(item.CHALLENGE_TYPE ?? 1),
    pairingToken: item.PAIRING_REQ_TOKEN as number | string,
    startedAt: Date.now(),
  };
}

export async function finishPairing(ch: PairingChallenge, pin: string, transport?: Transport): Promise<string> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('The PIN shown on the TV is 4 digits.');
  const client = new VizioClient({ host: ch.host, port: ch.port, timeoutMs: 6000 }, transport);
  const r = await client.put('/pairing/pair', {
    DEVICE_ID: ch.deviceId,
    CHALLENGE_TYPE: ch.challengeType,
    RESPONSE_VALUE: pin,
    PAIRING_REQ_TOKEN: ch.pairingToken,
  });
  const token = (r.ITEM as Record<string, unknown> | undefined)?.AUTH_TOKEN;
  if (typeof token !== 'string' || !token) throw new Error('The TV did not return an auth token. Check the PIN and try again.');
  return token;
}

export async function cancelPairing(ch: PairingChallenge, transport?: Transport): Promise<void> {
  const client = new VizioClient({ host: ch.host, port: ch.port, timeoutMs: 3000 }, transport);
  await client
    .put('/pairing/cancel', { DEVICE_ID: ch.deviceId, CHALLENGE_TYPE: 1, RESPONSE_VALUE: '1111', PAIRING_REQ_TOKEN: 0 })
    .catch(() => undefined);
}
