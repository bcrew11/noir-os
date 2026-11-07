import type { ReactNode } from 'react';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/**
 * A light tap of haptic feedback. Android: the Vibration API. iPhone (iOS 18+): Safari has no
 * vibration API, but toggling a native switch control gives a system haptic tick, so a hidden one
 * is flipped. Must run inside a tap handler.
 */
let iosSwitch: HTMLLabelElement | null = null;
export function haptic(ms = 8) {
  try {
    if (typeof navigator.vibrate === 'function' && navigator.vibrate(ms)) return;
    if (!iosSwitch) {
      iosSwitch = document.createElement('label');
      iosSwitch.setAttribute('aria-hidden', 'true');
      iosSwitch.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      iosSwitch.appendChild(input);
      document.body.appendChild(iosSwitch);
    }
    iosSwitch.click();
  } catch { /* no haptics available */ }
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('glass rounded-3xl p-4', className)}>{children}</div>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-fg-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Btn({ children, onClick, variant = 'glass', className, disabled, label }: {
  children: ReactNode; onClick?: () => void; variant?: 'glass' | 'primary' | 'ghost' | 'danger'; className?: string; disabled?: boolean; label?: string;
}) {
  return (
    <button type="button" aria-label={label} disabled={disabled}
      onClick={() => { haptic(); onClick?.(); }}
      className={cx('inline-flex select-none items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[0.95rem] font-medium transition active:scale-[0.96] disabled:opacity-40',
        variant === 'glass' && 'glass text-fg active:bg-white/15',
        variant === 'primary' && 'bg-primary text-white shadow-[0_0_1.5rem_-0.4rem_var(--noir-accent)] active:bg-accent',
        variant === 'ghost' && 'text-fg-muted active:bg-white/10',
        variant === 'danger' && 'bg-rose-500/15 text-rose-200 active:bg-rose-500/25',
        className)}>
      {children}
    </button>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => { haptic(); onChange(!on); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left active:bg-white/5">
      <div className="min-w-0 flex-1">
        <div className="text-[0.98rem] text-fg">{label}</div>
        {hint && <div className="text-[0.82rem] leading-snug text-fg-muted">{hint}</div>}
      </div>
      <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', on ? 'bg-primary' : 'bg-white/15')}>
        <span className={cx('absolute top-1 size-5 rounded-full bg-white transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => { haptic(); onChange(v); }}
          className={cx('rounded-full border px-3.5 py-2 text-[0.88rem] transition', v === value ? 'border-highlight/50 bg-primary/30 text-fg' : 'border-line bg-white/[0.04] text-fg-muted')}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-[0.82rem] text-fg-muted">{label}</span>
      <input {...props} className={cx('w-full rounded-2xl border border-line bg-white/[0.05] px-4 py-3 text-[1rem] text-fg outline-none placeholder:text-fg-dim focus:border-highlight/60', props.className)} />
    </label>
  );
}
