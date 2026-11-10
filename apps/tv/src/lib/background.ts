/**
 * NOIR in the background (another app, e.g. YouTube or Netflix, is in front).
 *
 * The launcher calls window.__noirBackground(true/false) from onStop/onStart. Right away the audio
 * output is closed; after a short grace period (so quick hops stay instant) the whole interface is
 * unmounted, freeing its memory, images and timers for the streaming app. Everything outside the
 * interface keeps running: the phone remote and lights (phoneHost), Saved, weather, now-playing.
 */
import { setAudioActive } from './sound.ts';
import { useUI } from '../store/ui.ts';

const SLEEP_AFTER_MS = 20_000;
let timer: ReturnType<typeof setTimeout> | undefined;

export function setBackground(bg: boolean) {
  clearTimeout(timer);
  if (bg) {
    setAudioActive(false);
    timer = setTimeout(() => useUI.setState({ asleep: true }), SLEEP_AFTER_MS);
  } else {
    setAudioActive(true);
    if (useUI.getState().asleep) useUI.setState({ asleep: false, lastActivity: Date.now() });
  }
}

export function installBackgroundHandling() {
  (window as unknown as { __noirBackground?: (bg: boolean) => void }).__noirBackground = setBackground;
  // Browsers / older launchers: page visibility is a good stand-in.
  document.addEventListener('visibilitychange', () => setBackground(document.visibilityState === 'hidden'));
}
