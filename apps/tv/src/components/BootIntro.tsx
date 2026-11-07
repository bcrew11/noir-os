import { useEffect, useState } from 'react';
import { interceptNav } from '../focus/input.ts';
import type { MotionLevel } from '../hooks/useMotion.ts';

/**
 * Start-up animation (~1.6s), played once per launch on top of the already-rendered Home screen:
 * a glow blooms, the NOIR mark draws in, the letters rise one by one, the wordmark briefly lights up, then the whole intro lifts away. Pure CSS keyframes on transform/opacity, so it runs on
 * the GPU even on a streaming stick. Any button skips it.
 */
export function BootIntro({ level, onDone }: { level: MotionLevel; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const total = level === 'full' ? 1600 : 700;

  useEffect(() => {
    const leave = setTimeout(() => setLeaving(true), total);
    const done = setTimeout(onDone, total + 450);
    // A press during the intro skips it (and isn't passed on to Home).
    const off = interceptNav(() => { setLeaving(true); setTimeout(onDone, 250); return true; });
    return () => { clearTimeout(leave); clearTimeout(done); off(); };
  }, [total, onDone]);

  const reduced = level !== 'full';
  return (
    <div className={`boot ${reduced ? 'boot-reduced' : ''} ${leaving ? 'boot-leave' : ''}`} aria-hidden>
      <div className="boot-glow" />
      <div className="boot-mark-row">
        <svg viewBox="0 0 24 32" className="boot-mark">
          <defs>
            <linearGradient id="boot-g" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="var(--noir-primary)" />
              <stop offset="1" stopColor="var(--noir-highlight)" />
            </linearGradient>
          </defs>
          <rect x="8" y="1" width="8.5" height="30" rx="4.25" transform="rotate(30 12 16)" fill="url(#boot-g)" />
        </svg>
        <div className="boot-word">
          {'NOIR'.split('').map((ch, i) => <span key={i} style={{ animationDelay: `${reduced ? 0 : 380 + i * 90}ms` }}>{ch}</span>)}
          {/* A glowing copy of the wordmark that fades in and out: the letters "light up". */}
          <span className="boot-shine" aria-hidden>NOIR</span>
        </div>
      </div>
    </div>
  );
}
