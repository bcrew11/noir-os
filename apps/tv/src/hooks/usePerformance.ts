import { useEffect, useState } from 'react';
import { isStandalone } from '../lib/android.ts';

/**
 * In `auto` mode, sample ~90 animation frames shortly after start. If the median frame
 * takes longer than ~28ms (<35 fps), switch to low-performance mode: no backdrop blur,
 * no ambient background drift. `high`/`low` force the choice.
 */
export function usePerformanceProbe(mode: 'auto' | 'high' | 'low'): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (mode !== 'auto') return;
    let raf = 0;
    let last = 0;
    const samples: number[] = [];
    const start = setTimeout(() => {
      const tick = (t: number) => {
        if (last) samples.push(t - last);
        last = t;
        if (samples.length < 90) raf = requestAnimationFrame(tick);
        else {
          const sorted = [...samples].sort((a, b) => a - b);
          setSlow((sorted[Math.floor(sorted.length / 2)] ?? 16) > 28);
        }
      };
      raf = requestAnimationFrame(tick);
    }, 1500);
    return () => { clearTimeout(start); cancelAnimationFrame(raf); };
  }, [mode]);
  // Streaming sticks: default to the lightweight path; Settings → Appearance → Performance → High overrides.
  return mode === 'low' || (mode === 'auto' && (slow || isStandalone()));
}
