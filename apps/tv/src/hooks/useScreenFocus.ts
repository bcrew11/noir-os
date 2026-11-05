import { useEffect } from 'react';
import { restoreScreen } from '../focus/focus.ts';

/** Restore this screen's last focused element (or a default) when it mounts. */
export function useScreenFocus(screen: string, fallback?: string) {
  useEffect(() => {
    restoreScreen(screen, fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
}
