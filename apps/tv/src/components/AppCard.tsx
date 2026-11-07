import { Plus } from 'lucide-react';
import type { AppDefinition } from '@noir/core';
import { BrandMark, useNoir } from '@noir/ui';
import { useFocusable } from '../focus/focus.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { cx, fade, focusLift } from './primitives.tsx';

interface Props {
  app: AppDefinition;
  focusId: string;
  group?: string;
  onSelect: () => void;
  onLongSelect?: () => void;
  size?: 'hero' | 'grid';
  badge?: React.ReactNode;
  autoFocus?: boolean;
  scrollAlign?: 'nearest' | 'start';
}

/**
 * Primary app card. On focus: scale to ~105%, lift, brighten the border, bloom a soft
 * lavender glow and tint with the app's own brand glow. 220ms, no bounce.
 */
export function AppCard({ app, focusId, group, onSelect, onLongSelect, size = 'hero', badge, autoFocus, scrollAlign }: Props) {
  const { ref, focused, pointer } = useFocusable<HTMLDivElement>(focusId, { group, onSelect, onLongSelect, autoFocus, scrollAlign });
  const logo = useNoir((s) => s.state?.logos[app.id]);
  const level = useMotion();
  return (
    <div
      ref={ref}
      {...pointer}
      role="button"
      aria-label={app.name}
      data-focused={focused || undefined}
      data-app={app.id}
      // Hero tiles keep a fixed size; when there are more apps than fit, the row scrolls.
      className={cx('relative shrink-0 cursor-pointer', size === 'hero' ? 'h-40 w-72' : 'h-36 w-full')}
      style={{ ...focusLift(focused, level), zIndex: focused ? 2 : 1 }}
    >
      {/* bloom behind the card */}
      <div
        aria-hidden
        data-heavy-fx
        className="pointer-events-none absolute -inset-6 rounded-[2.5rem]"
        style={{ background: `radial-gradient(60% 60% at 50% 55%, ${app.brand.glow ?? 'rgba(192,132,252,0.3)'}, color-mix(in srgb, var(--noir-accent) 22%, transparent) 55%, transparent 75%)`, filter: 'blur(14px)', ...fade(focused, level, 300) }}
      />
      <div
        className={cx(
          'relative flex h-full w-full items-center justify-center overflow-hidden rounded-[1.6rem] border transition-[border-color,box-shadow] duration-200',
          focused ? 'border-transparent focus-ring' : 'border-line',
        )}
        style={{ background: app.brand.background, boxShadow: focused ? undefined : 'inset 0 1px 0 rgba(255,255,255,0.07), 0 1.2rem 2.4rem -1.4rem rgba(0,0,0,0.9)' }}
      >
        {/* glass sheen */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 38%, transparent 60%)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(90% 70% at 50% 0%, rgba(255,255,255,0.12), transparent 60%)', ...fade(focused, level, 220) }} />
        {logo?.startsWith('data:image/png')
          // The app's own TV banner from the device: full-bleed artwork, like the system launcher.
          ? <img src={logo} alt={app.name} draggable={false} className="absolute inset-0 size-full object-cover" />
          : <div className="relative px-4"><BrandMark app={app} logoUrl={logo} scale={size === 'hero' ? 1 : 0.9} /></div>}
        {badge && <div className="absolute bottom-2.5 right-3">{badge}</div>}
      </div>
    </div>
  );
}

export function AddAppsCard({ focusId, onSelect, group }: { focusId: string; onSelect: () => void; group?: string }) {
  const { ref, focused, pointer } = useFocusable<HTMLDivElement>(focusId, { group, onSelect });
  const level = useMotion();
  return (
    <div ref={ref} {...pointer} role="button" aria-label="Add apps" data-focused={focused || undefined}
      style={focusLift(focused, level)}
      className={cx('glass relative flex h-40 w-44 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-[1.6rem] transition-[background,box-shadow] duration-200', focused && 'bg-white/10 focus-ring')}
    >
      <Plus className={cx('size-9 transition-colors', focused ? 'text-fg' : 'text-fg/85')} strokeWidth={1.6} />
      <span className="text-[1.2rem] font-medium text-fg/90">Add apps</span>
    </div>
  );
}
