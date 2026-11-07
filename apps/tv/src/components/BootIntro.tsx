import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { interceptNav } from '../focus/input.ts';
import type { MotionLevel } from '../hooks/useMotion.ts';

/** Sparks that drift in and gather into the first point of light (angle in degrees, distance in rem). */
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  angle: (i * 360) / 14 + (i % 2 ? 9 : -6),
  dist: 26 + ((i * 7) % 5) * 6,
  delay: (i * 53) % 420,
  size: 0.35 + ((i * 3) % 4) * 0.12,
}));

/**
 * Start-up sequence (~6.5 s), played once per launch on top of the already-rendered Home screen.
 * Told as a small story: sparks gather into a point of light → it ignites into the NOIR mark with a
 * soft shockwave and bloom → faint orbits turn → the wordmark rises → a light sweeps across → the
 * intro lifts away. Pure CSS keyframes on transform/opacity, so it stays smooth on a streaming
 * stick. Any button skips it. Reduced motion gets a short, calm fade instead.
 */
export function BootIntro({ level, onDone }: { level: MotionLevel; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const full = level === 'full';
  const total = full ? 6200 : 900;
  const slide = useRef<HTMLDivElement>(null);

  // The mark ignites exactly where the point of light was (the screen centre), then glides into
  // its place beside the wordmark: measure how far that is.
  useLayoutEffect(() => {
    const el = slide.current;
    const row = el?.parentElement;
    if (!el || !row) return;
    const natural = row.getBoundingClientRect().left + el.offsetWidth / 2;
    el.style.setProperty('--mark-x', `${window.innerWidth / 2 - natural}px`);
  }, []);

  useEffect(() => {
    const leave = setTimeout(() => setLeaving(true), total);
    const done = setTimeout(onDone, total + 550);
    // A press during the intro skips it (and isn't passed on to Home).
    const off = interceptNav(() => { setLeaving(true); setTimeout(onDone, 300); return true; });
    return () => { clearTimeout(leave); clearTimeout(done); off(); };
  }, [total, onDone]);

  return (
    <div className={`boot ${full ? '' : 'boot-reduced'} ${leaving ? 'boot-leave' : ''}`} aria-hidden>
      <div className="boot-glow" />
      {full && (
        <>
          <div className="boot-orbit boot-orbit-a" />
          <div className="boot-orbit boot-orbit-b" />
          <div className="boot-wave" />
          <div className="boot-sparks">
            {SPARKS.map((s, i) => (
              <span key={i} style={{
                '--a': `${s.angle}deg`, '--d': `${s.dist}rem`, width: `${s.size}rem`, height: `${s.size}rem`, animationDelay: `${s.delay}ms`,
              } as React.CSSProperties} />
            ))}
          </div>
          <div className="boot-core" />
        </>
      )}
      <div className="boot-mark-row">
        <div ref={slide} className="boot-mark-slide">
          <svg viewBox="0 0 24 32" className="boot-mark">
            <defs>
              <linearGradient id="boot-g" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="var(--noir-primary)" />
                <stop offset="1" stopColor="var(--noir-highlight)" />
              </linearGradient>
            </defs>
            <rect x="8" y="1" width="8.5" height="30" rx="4.25" transform="rotate(30 12 16)" fill="url(#boot-g)" />
          </svg>
        </div>
        <div className="boot-word">
          {'NOIR'.split('').map((ch, i) => <span key={i} style={{ animationDelay: `${full ? 3550 + i * 170 : 0}ms` }}>{ch}</span>)}
          {/* A glowing copy of the wordmark that fades in and out: the letters "light up". */}
          <span className="boot-shine" aria-hidden>NOIR</span>
          <span className="boot-sweep" aria-hidden />
        </div>
      </div>
    </div>
  );
}
