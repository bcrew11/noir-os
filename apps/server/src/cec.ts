import { spawn } from 'node:child_process';
import type { NavKey } from '@noir/core';

/**
 * Optional HDMI-CEC bridge for External HDMI mode (e.g. Raspberry Pi).
 * With CEC enabled on the TV, presses on the TV's own remote are forwarded over HDMI to the
 * active source. `cec-client` (libcec) prints them as "key pressed: up (1)"; we map those to NOIR
 * navigation. Which keys a given TV forwards is up to its firmware — test on your set.
 */
const MAP: Record<string, NavKey> = {
  up: 'up', down: 'down', left: 'left', right: 'right',
  select: 'ok', enter: 'ok', exit: 'back', back: 'back', 'root menu': 'home', 'setup menu': 'home',
  play: 'playpause', pause: 'playpause',
};

export function parseCecLine(line: string): NavKey | null {
  const m = line.match(/key pressed:\s*([a-z ]+?)\s*\(/i);
  if (!m || /duration/i.test(line)) return null;
  return MAP[m[1]!.toLowerCase()] ?? null;
}

export function startCecBridge(onKey: (k: NavKey) => void, log: (m: string) => void) {
  const proc = spawn('cec-client', ['-d', '8', '-t', 'p', '-o', 'NOIR'], { stdio: ['pipe', 'pipe', 'ignore'] });
  proc.on('error', (e) => log(`CEC bridge unavailable: ${e.message} (install libcec / cec-utils)`));
  let buf = '';
  proc.stdout.on('data', (d: Buffer) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const l of lines) {
      const k = parseCecLine(l);
      if (k) onKey(k);
    }
  });
  return () => proc.kill();
}
