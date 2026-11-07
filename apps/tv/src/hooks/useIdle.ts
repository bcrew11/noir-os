import { useCallback, useEffect, useState } from 'react';
import { useNoir } from '@noir/ui';
import { useUI } from '../store/ui.ts';

/** Enter ambient mode after the configured inactivity inside NOIR. */
export function useIdle() {
  const minutes = useNoir((s) => s.state?.settings.ambient.idleMinutes ?? 0);
  useEffect(() => {
    if (!minutes) return;
    const id = setInterval(() => {
      const ui = useUI.getState();
      if (ui.screen !== 'ambient' && Date.now() - ui.lastActivity > minutes * 60_000) ui.go('ambient');
    }, 15_000);
    return () => clearInterval(id);
  }, [minutes]);
}

/**
 * The music view: true when music is playing, Home or Music is showing, and the remote has been idle for
 * `home.nowPlayingAfterSec`. Returns [active, exit]. Exits once the music has stopped for 12 s.
 */
export function useNowPlayingIdle(): [boolean, () => void] {
  const after = useNoir((s) => s.state?.settings.home.nowPlayingAfterSec ?? 0);
  const playing = useNoir((s) => !!(s.state?.music.isPlaying && s.state.music.track));
  const screen = useUI((s) => s.screen);
  const [active, setActive] = useState(false);
  const exit = useCallback(() => setActive(false), []);
  useEffect(() => {
    if (!after || (screen !== 'home' && screen !== 'music')) { setActive(false); return; }
    // Between songs, apps briefly report nothing playing: stay open unless it lasts a while.
    if (!playing) { const id = setTimeout(() => setActive(false), 12_000); return () => clearTimeout(id); }
    const id = setInterval(() => {
      if (Date.now() - useUI.getState().lastActivity > after * 1000) setActive(true);
    }, 1000);
    return () => clearInterval(id);
  }, [after, playing, screen]);
  return [active, exit];
}
