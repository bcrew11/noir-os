import { useNoir } from '@noir/ui';

export type MotionLevel = 'full' | 'reduced' | 'off';

/** Effective motion level: user setting, further reduced by the OS preference. */
export function useMotion(): MotionLevel {
  const setting = useNoir((s) => s.state?.settings.appearance.motion ?? 'full');
  const osReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return osReduced && setting === 'full' ? 'reduced' : setting;
}

/** Screen transition timing (250–400ms) per motion level. */
export function screenTransition(level: MotionLevel) {
  if (level === 'off') return { duration: 0 };
  return { duration: level === 'full' ? 0.32 : 0.2, ease: [0.22, 0.8, 0.24, 1] as const };
}
