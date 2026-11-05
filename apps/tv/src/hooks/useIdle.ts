import { useEffect } from 'react';
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
