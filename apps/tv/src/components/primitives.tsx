import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useFocusable, type FocusableOptions } from '../focus/focus.ts';
import { useMotion } from '../hooks/useMotion.ts';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/**
 * Focus scale/lift as a CSS transition. Transform transitions run on the compositor (GPU) thread,
 * so they stay smooth on streaming-stick CPUs — unlike per-frame JavaScript animation.
 */
export function focusLift(focused: boolean, level: 'full' | 'reduced' | 'off', scale = 1.05, liftRem = 0.375, extra = ''): CSSProperties {
  return {
    transform: focused ? `translate3d(0, ${-liftRem}rem, 0) scale(${scale}) ${extra}` : 'translate3d(0, 0, 0)',
    transition: level === 'off' ? 'none' : `transform ${level === 'full' ? 220 : 140}ms cubic-bezier(0.22, 0.8, 0.24, 1)`,
  };
}

export function fade(visible: boolean, level: 'full' | 'reduced' | 'off', ms = 250): CSSProperties {
  return { opacity: visible ? 1 : 0, transition: level === 'off' ? 'none' : `opacity ${ms}ms ease` };
}

/** Standard NOIR focus transition: ~220ms, gentle ease, no bounce. */
export function focusTransition(level: 'full' | 'reduced' | 'off') {
  return level === 'full' ? { type: 'tween' as const, duration: 0.22, ease: [0.22, 0.8, 0.24, 1] as const } : { duration: 0 };
}

interface ButtonProps extends FocusableOptions {
  id: string;
  children?: ReactNode;
  icon?: LucideIcon;
  label?: string;
  variant?: 'glass' | 'ghost' | 'primary' | 'round';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
  /** Render only the icon; `label` becomes the accessible name. */
  iconOnly?: boolean;
}

/** A focusable button for remote navigation. */
export function FButton({ id, children, icon: Icon, label, variant = 'glass', className, size = 'md', title, iconOnly, ...opts }: ButtonProps) {
  const { ref, focused, pointer } = useFocusable<HTMLButtonElement>(id, opts);
  const motionLevel = useMotion();
  const pad = size === 'sm' ? 'h-11 px-4 text-[1.05rem]' : size === 'lg' ? 'h-16 px-7 text-[1.35rem]' : 'h-13 px-5 text-[1.2rem]';
  const round = variant === 'round';
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      title={title}
      aria-label={label ?? title}
      data-focused={focused || undefined}
      disabled={opts.disabled}
      {...pointer}
      style={focusLift(focused, motionLevel, 1.06, 0)}
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center gap-2.5 font-medium outline-none transition-[background,color,box-shadow,opacity] duration-200',
        round ? 'aspect-square rounded-full' : 'rounded-2xl',
        round ? (size === 'lg' ? 'h-17' : size === 'sm' ? 'h-11' : 'h-14') : pad,
        variant === 'glass' && (focused ? 'bg-white/14 text-fg' : 'glass text-fg/90'),
        variant === 'ghost' && (focused ? 'bg-white/12 text-fg' : 'bg-transparent text-fg-muted'),
        variant === 'primary' && (focused ? 'bg-highlight text-ink-900' : 'bg-primary/80 text-fg'),
        variant === 'round' && (focused ? 'bg-white/16 text-fg' : 'bg-white/[0.06] text-fg/85 border border-line'),
        focused && 'focus-ring',
        opts.disabled && 'opacity-40',
        className,
      )}
    >
      {Icon && <Icon className={size === 'lg' ? 'size-7' : size === 'sm' ? 'size-5' : 'size-6'} strokeWidth={1.75} />}
      {children ?? (label && !round && !iconOnly ? <span>{label}</span> : null)}
    </button>
  );
}

/** A focusable list row used in settings and dialogs. */
export function FRow({ id, title, value, hint, icon: Icon, onSelect, disabled, group, autoFocus, right }: {
  id: string; title: string; value?: ReactNode; hint?: string; icon?: LucideIcon; onSelect?: () => void; disabled?: boolean; group?: string; autoFocus?: boolean; right?: ReactNode;
}) {
  const { ref, focused, pointer } = useFocusable<HTMLDivElement>(id, { onSelect, disabled, group, autoFocus });
  return (
    <div
      ref={ref}
      {...pointer}
      data-focused={focused || undefined}
      className={cx(
        'flex min-h-17 items-center gap-4 rounded-2xl px-5 py-3 transition-[background,box-shadow,transform] duration-200',
        focused ? 'bg-white/[0.11] focus-ring scale-[1.015]' : 'bg-white/[0.035]',
        disabled && 'opacity-45',
      )}
    >
      {Icon && <Icon className={cx('size-6 shrink-0', focused ? 'text-highlight' : 'text-fg-muted')} strokeWidth={1.75} />}
      <div className="min-w-0 flex-1">
        <div className="text-[1.25rem] font-medium text-fg">{title}</div>
        {hint && <div className="mt-0.5 text-[1rem] leading-snug text-fg-muted">{hint}</div>}
      </div>
      {value !== undefined && <div className={cx('shrink-0 text-[1.15rem]', focused ? 'text-fg' : 'text-fg-muted')}>{value}</div>}
      {right}
    </div>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <span className={cx('relative inline-block h-8 w-14 rounded-full transition-colors duration-200', on ? 'bg-primary' : 'bg-white/15')}>
      <span className={cx('absolute top-1 size-6 rounded-full bg-white shadow transition-transform duration-200', on ? 'translate-x-7' : 'translate-x-1')} />
    </span>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[3rem] font-semibold tracking-[-0.02em] text-fg">{children}</h1>
      {sub && <p className="mt-1 text-[1.3rem] text-fg-muted">{sub}</p>}
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'ok' | 'demo' }) {
  const tones = {
    neutral: 'bg-white/8 text-fg-muted border-line',
    accent: 'bg-primary/20 text-highlight border-primary/30',
    warn: 'bg-amber-400/10 text-amber-200 border-amber-300/25',
    ok: 'bg-emerald-400/10 text-emerald-200 border-emerald-300/25',
    demo: 'bg-fuchsia-400/10 text-fuchsia-200 border-fuchsia-300/30',
  };
  return <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.95rem] font-medium', tones[tone])}>{children}</span>;
}
