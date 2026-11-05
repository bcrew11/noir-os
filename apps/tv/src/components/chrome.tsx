import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, FlaskConical, Gamepad2, Grid2x2, Home, Info, Monitor, MountainSnow, Music2, Settings, Tv, Wifi, WifiOff, XCircle } from 'lucide-react';
import { formatClock, type InputIcon } from '@noir/core';
import { useNoir, useNow } from '@noir/ui';
import { Camera, Disc3, Laptop, Speaker, Cast } from 'lucide-react';
import { setGroupPreferred, useFocusable } from '../focus/focus.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { useUI, type Screen } from '../store/ui.ts';
import { cx, focusTransition } from './primitives.tsx';
import { useEffect } from 'react';

export const INPUT_ICON: Record<InputIcon, typeof Tv> = {
  console: Monitor, gamepad: Gamepad2, computer: Laptop, streaming: Cast, tv: Tv, disc: Disc3, speaker: Speaker, camera: Camera,
};

export function NoirMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="nm" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--noir-primary)" />
          <stop offset="1" stopColor="var(--noir-highlight)" />
        </linearGradient>
      </defs>
      <rect x="8" y="1" width="8.5" height="30" rx="4.25" transform="rotate(30 12 16)" fill="url(#nm)" />
    </svg>
  );
}

export function Header() {
  const now = useNow();
  const settings = useNoir((s) => s.state?.settings);
  const tv = useNoir((s) => s.state?.tv);
  const conn = useNoir((s) => s.status);
  const go = useUI((s) => s.go);
  const clock = formatClock(now, settings?.appearance.clock24h ?? false);
  const gear = useFocusable<HTMLButtonElement>('header-settings', { group: 'header', onSelect: () => go('settings') });
  const t = focusTransition(useMotion());

  const linkOk = conn === 'online';
  const tvOk = tv?.adapter === 'mock' || (tv?.adapter === 'vizio' && tv.reachable);
  const statusLabel = !linkOk ? 'NOIR server offline' : tv?.adapter === 'none' ? 'No TV paired' : tvOk ? (tv?.adapter === 'mock' ? 'Simulated TV' : 'TV connected') : 'TV unreachable';

  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <NoirMark className="h-9 w-7" />
        <span className="text-[1.7rem] font-medium tracking-[0.42em] text-fg">NOIR</span>
      </div>
      <div className="flex items-center gap-6">
        <DemoBadge />
        <div className="flex items-center gap-2.5 text-fg-muted" title={statusLabel}>
          {linkOk && tvOk ? <Wifi className="size-6" strokeWidth={1.75} /> : <WifiOff className="size-6 text-amber-300/90" strokeWidth={1.75} />}
          <span className="text-[1rem]">{statusLabel}</span>
        </div>
        <span className="text-[1.75rem] font-normal tabular-nums tracking-tight text-fg">
          {clock.time}{clock.suffix && <span className="ml-1.5">{clock.suffix}</span>}
        </span>
        <span className="h-9 w-px bg-line-strong" />
        <motion.button ref={gear.ref} {...gear.pointer} data-focused={gear.focused || undefined} tabIndex={-1} aria-label="Settings" animate={{ scale: gear.focused ? 1.12 : 1, rotate: gear.focused ? 30 : 0 }} transition={t}
          className={cx('grid size-13 place-items-center rounded-full transition-colors', gear.focused ? 'bg-white/14 focus-ring text-fg' : 'text-fg/90')}>
          <Settings className="size-8" strokeWidth={1.6} />
        </motion.button>
      </div>
    </header>
  );
}

/** Always-visible indicator when anything is simulated. */
export function DemoBadge() {
  const state = useNoir((s) => s.state);
  if (!state || state.mode !== 'demo') return null;
  const parts = [state.tv.adapter === 'mock' && 'TV', state.music.provider === 'demo' && 'music'].filter(Boolean).join(' & ');
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-3.5 py-1.5 text-[0.95rem] font-medium text-fuchsia-100" title="Demo mode: simulated hardware/data">
      <FlaskConical className="size-4.5" strokeWidth={2} />
      Demo · simulated {parts}
    </span>
  );
}

const NAV: Array<{ id: Screen; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'apps', label: 'Apps', icon: Grid2x2 },
  { id: 'music', label: 'Music', icon: Music2 },
  { id: 'inputs', label: 'Inputs', icon: Monitor },
  { id: 'ambient', label: 'Ambient', icon: MountainSnow },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function NavItem({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  const go = useUI((s) => s.go);
  const { ref, focused, pointer } = useFocusable<HTMLButtonElement>(`nav-${item.id}`, { group: 'nav', onSelect: () => go(item.id) });
  const level = useMotion();
  const Icon = item.icon;
  return (
    <button ref={ref} {...pointer} data-focused={focused || undefined} tabIndex={-1} aria-current={active ? 'page' : undefined}
      className={cx('relative flex h-14 items-center gap-3 rounded-full px-6 text-[1.2rem] font-medium outline-none transition-colors duration-200',
        active || focused ? 'text-fg' : 'text-fg-muted')}>
      {active && (
        <motion.span layoutId="nav-active" transition={level === 'full' ? { type: 'tween', duration: 0.3, ease: [0.22, 0.8, 0.24, 1] } : { duration: 0 }}
          className="absolute inset-0 rounded-full border border-highlight/35"
          style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--noir-primary) 48%, transparent), color-mix(in srgb, var(--noir-primary) 26%, transparent))', boxShadow: '0 0 1.6rem -0.2rem color-mix(in srgb, var(--noir-accent) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.15)' }} />
      )}
      {focused && <span className={cx('absolute inset-0 rounded-full', active ? 'focus-ring' : 'bg-white/10 focus-ring')} />}
      <Icon className="relative size-6" strokeWidth={1.7} />
      <span className="relative">{item.label}</span>
    </button>
  );
}

export function NavBar() {
  const screen = useUI((s) => s.screen);
  useEffect(() => { const off = setGroupPreferred('nav', () => `nav-${useUI.getState().screen}`); return () => void off(); }, []);
  return (
    <nav className="glass mx-auto flex w-max items-center gap-1 rounded-full p-2" style={{ boxShadow: '0 1.5rem 3rem -1rem rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
      {NAV.map((n) => <NavItem key={n.id} item={n} active={screen === n.id} />)}
    </nav>
  );
}

export function Toasts() {
  const toasts = useNoir((s) => s.toasts);
  const level = useMotion();
  const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle, demo: FlaskConical };
  const tones = { info: 'text-sky-200', success: 'text-emerald-200', warning: 'text-amber-200', error: 'text-rose-300', demo: 'text-fuchsia-200' };
  return (
    <div className="pointer-events-none absolute right-24 top-28 z-50 flex w-[34rem] flex-col items-end gap-3">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <motion.div key={t.id} layout={level === 'full'} initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }}
              transition={{ duration: level === 'off' ? 0 : 0.25 }} className="glass flex w-full items-start gap-3.5 rounded-2xl px-5 py-4" style={{ background: 'rgba(30,23,43,0.92)' }}>
              <Icon className={cx('mt-0.5 size-6 shrink-0', tones[t.tone])} strokeWidth={1.8} />
              <div className="min-w-0">
                <div className="text-[1.15rem] font-medium leading-snug text-fg">{t.title}</div>
                {t.body && <div className="mt-1 text-[1rem] leading-snug text-fg-muted">{t.body}</div>}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
