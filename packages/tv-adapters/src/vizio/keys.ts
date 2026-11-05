import type { RemoteKey } from '@noir/core';

/**
 * SmartCast key codes as [CODESET, CODE].
 *
 * Source: community-documented values used by the open-source pyvizio library and the
 * Home Assistant / openHAB VIZIO integrations. These are NOT published by VIZIO and have
 * not been confirmed on VIZIO OS (onn) firmware — treat them as `documented`, and the
 * adapter reports a key as `sent`, never `verified`, because key presses cannot be read back.
 */
export const VIZIO_KEY_CODES: Record<RemoteKey, readonly [number, number]> = {
  play: [2, 3],
  pause: [2, 2],
  playpause: [2, 3], // no dedicated toggle documented; NOIR sends play
  down: [3, 0],
  left: [3, 1],
  ok: [3, 2],
  right: [3, 7],
  up: [3, 8],
  back: [4, 0],
  home: [4, 15],
  menu: [4, 8],
  volume_down: [5, 0],
  volume_up: [5, 1],
  mute: [5, 4], // toggle
  input_next: [7, 1],
  channel_down: [8, 0],
  channel_up: [8, 1],
  power_off: [11, 0],
  power_on: [11, 1],
  power_toggle: [11, 2],
};

export const MUTE_OFF: readonly [number, number] = [5, 2];
export const MUTE_ON: readonly [number, number] = [5, 3];

export function keyPayload(codes: ReadonlyArray<readonly [number, number]>) {
  return { KEYLIST: codes.map(([CODESET, CODE]) => ({ CODESET, CODE, ACTION: 'KEYPRESS' })) };
}
