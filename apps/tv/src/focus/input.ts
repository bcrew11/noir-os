import type { NavKey } from '@noir/core';
import { onRemoteNav } from '@noir/ui';
import { focus, hasLongSelect, move, select } from './focus.ts';
import { playSound } from '../lib/sound.ts';
import { handleBack, markActivity, useUI } from '../store/ui.ts';

/**
 * Maps physical input to NOIR navigation:
 *  - Keyboard: arrows, Enter = OK, Escape/Backspace = Back, H (configurable) = Home, Space = Play/Pause
 *  - TV browsers / Android TV WebViews: D-pad arrive as arrow keys; vendor Back codes handled below
 *  - Phone companion: "nav" messages over WebSocket
 *  - HDMI-CEC (External HDMI mode): forwarded by the server as "nav" messages
 */
const KEYMAP: Record<string, NavKey> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'ok', NumpadEnter: 'ok', Select: 'ok',
  Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back',
  Home: 'home', BrowserHome: 'home',
  MediaPlayPause: 'playpause', ' ': 'playpause',
};
// Vendor keyCodes: webOS back (461), Tizen back (10009), Android back (4).
const KEYCODE_MAP: Record<number, NavKey> = { 461: 'back', 10009: 'back', 4: 'back', 179: 'playpause' };

let homeShortcut = 'h';
/** Change the keyboard key that simulates the remote's Home button (default: H). */
export function setHomeShortcut(key: string) {
  homeShortcut = key.toLowerCase();
}

type Extra = { onPlayPause?: () => void };
let extra: Extra = {};
export function setInputExtras(e: Extra) {
  extra = e;
}

/** Hooks that want first look at nav (e.g. ambient mode wakes on any key). */
type Interceptor = (key: NavKey) => boolean;
const interceptors: Interceptor[] = [];
export function interceptNav(fn: Interceptor) {
  interceptors.push(fn);
  return () => {
    const i = interceptors.indexOf(fn);
    if (i >= 0) interceptors.splice(i, 1);
  };
}

export function dispatchNav(key: NavKey, opts: { long?: boolean } = {}) {
  markActivity();
  for (let i = interceptors.length - 1; i >= 0; i--) if (interceptors[i]!(key)) return;
  switch (key) {
    case 'up': case 'down': case 'left': case 'right':
      if (move(key)) playSound('move'); // silent at edges
      return;
    case 'ok':
      if (select(!!opts.long)) playSound('select');
      return;
    case 'back':
      playSound('back');
      if (!handleBack()) {
        const ui = useUI.getState();
        if (ui.screen !== 'home') ui.go('home');
      }
      return;
    case 'home': {
      // Home anywhere → Home screen. Home again while already there → jump to the nav bar,
      // so the nav is always one or two presses away.
      const ui = useUI.getState();
      if (ui.screen === 'home') focus('nav-home');
      else ui.go('home');
      return;
    }
    case 'playpause':
      extra.onPlayPause?.();
      return;
  }
}

function isTextInput(t: EventTarget | null) {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}

export function installInput(): () => void {
  let okDownAt = 0;
  let longFired = false;
  let longTimer: ReturnType<typeof setTimeout> | undefined;

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTextInput(e.target) && !['ArrowUp', 'ArrowDown', 'Escape', 'Enter'].includes(e.key)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let key: NavKey | undefined = KEYMAP[e.key] ?? KEYCODE_MAP[e.keyCode];
    if (!key && e.key.toLowerCase() === homeShortcut && !isTextInput(e.target)) key = 'home';
    if (!key) return;
    e.preventDefault();
    if (key === 'ok') {
      // OK fires on release so a long press (≥ 550ms) can open options instead.
      if (e.repeat) return;
      okDownAt = performance.now();
      longFired = false;
      if (hasLongSelect()) {
        longTimer = setTimeout(() => { longFired = true; dispatchNav('ok', { long: true }); }, 550);
      }
      return;
    }
    dispatchNav(key);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (KEYMAP[e.key] !== 'ok' || !okDownAt) return;
    clearTimeout(longTimer);
    okDownAt = 0;
    if (!longFired) dispatchNav('ok');
  };
  const onPointer = () => markActivity();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointermove', onPointer, { passive: true });
  const offRemote = onRemoteNav((k) => dispatchNav(k));
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pointermove', onPointer);
    offRemote();
  };
}
