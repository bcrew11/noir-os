import { useEffect } from 'react';
import { applyAccent, useNoir } from '@noir/ui';
import Ambient from './screens/Ambient.tsx';

/**
 * The system screensaver (Android DreamService). Only the ambient display: no navigation, no
 * performance probe — nothing else is on screen, so the slow background drift can run even on a stick.
 * Any remote button ends the dream (handled by Android).
 */
export function DreamApp() {
  const state = useNoir((s) => s.state);
  const accent = state?.settings.appearance.accent;
  const motion = state?.settings.appearance.motion;
  useEffect(() => { if (accent) applyAccent(accent); }, [accent]);
  useEffect(() => { document.documentElement.dataset.motion = motion ?? 'full'; }, [motion]);
  if (!state) return <div className="absolute inset-0 bg-black" />;
  return <Ambient />;
}
