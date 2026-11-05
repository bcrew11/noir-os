import { useEffect, useState } from 'react';
import { liveProgress, type MusicState } from '@noir/core';

/** Re-render on the minute boundary (or every `intervalMs`). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      const wait = intervalMs >= 60_000 ? 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) : intervalMs;
      t = setTimeout(tick, wait + 5);
    };
    tick();
    return () => clearTimeout(t);
  }, [intervalMs]);
  return now;
}

/** Extrapolated track progress, updated once a second only while playing. */
export function useMusicProgress(music: MusicState | undefined): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (!music?.isPlaying) return;
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [music?.isPlaying]);
  return music ? liveProgress(music) : 0;
}
