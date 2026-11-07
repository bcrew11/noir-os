import { useEffect, useState } from 'react';
import { androidBridge } from '../lib/android.ts';

/**
 * When the Android launcher plays the start-up intro natively, the page starts under a cover in the
 * intro's background colour. The intro video ends by fading to that same colour, then the launcher
 * calls window.__noirIntroDone and this cover fades away to reveal Home: a clean fade, no cut.
 */
export function IntroCover() {
  const [shown, setShown] = useState(() => {
    if (!new URLSearchParams(location.search).has('nativeintro')) return false;
    try { return !androidBridge()?.introFinished?.(); } catch { return true; }
  });
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!shown) return;
    const w = window as unknown as { __noirIntroDone?: () => void };
    const fade = () => setFading(true);
    w.__noirIntroDone = fade;
    // The intro may have ended between the first render and now; and never leave the cover stuck.
    try { if (androidBridge()?.introFinished?.()) fade(); } catch { /* older launcher */ }
    const safety = setTimeout(fade, 10_000);
    return () => { clearTimeout(safety); delete w.__noirIntroDone; };
  }, [shown]);

  if (!shown) return null;
  return (
    <div aria-hidden className="fixed inset-0 z-[90] bg-[#07060C] transition-opacity duration-[900ms] ease-out"
      style={{ opacity: fading ? 0 : 1, pointerEvents: fading ? 'none' : 'auto' }}
      onTransitionEnd={() => setShown(false)} />
  );
}
