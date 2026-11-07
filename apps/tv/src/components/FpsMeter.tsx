import { useEffect, useState } from 'react';

/**
 * Live frame-rate readout (Settings → System → Show frame rate). Reports the average and worst
 * frame over the last second, plus the rendering resolution, so smoothness can be tuned on the
 * real device instead of an emulator.
 */
export function FpsMeter() {
  const [stats, setStats] = useState({ fps: 0, worst: 0 });
  useEffect(() => {
    let raf = 0, last = performance.now(), frames = 0, worst = 0, windowStart = last;
    const tick = (t: number) => {
      const dt = t - last; last = t; frames++; worst = Math.max(worst, dt);
      if (t - windowStart >= 1000) {
        setStats({ fps: Math.round((frames * 1000) / (t - windowStart)), worst: Math.round(worst) });
        frames = 0; worst = 0; windowStart = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const good = stats.fps >= 55 && stats.worst < 40;
  return (
    <div className="pointer-events-none fixed left-4 top-4 z-[60] rounded-xl bg-black/70 px-3 py-2 font-mono text-[14px] leading-tight text-white">
      <div className={good ? 'text-emerald-300' : 'text-amber-300'}>{stats.fps} fps · worst {stats.worst} ms</div>
      <div className="text-white/60">{Math.round(innerWidth * devicePixelRatio)}×{Math.round(innerHeight * devicePixelRatio)} @{devicePixelRatio.toFixed(2)}x</div>
    </div>
  );
}
