import { motion } from 'motion/react';
import { useEffect, useId, type ReactNode } from 'react';
import { ScopeContext, popScope, pushScope } from '../focus/focus.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { pushBack } from '../store/ui.ts';
import { cx } from './primitives.tsx';

/**
 * Modal dialog with focus trapping: it pushes its own focus scope so the D-pad can't
 * leave it, and registers a Back handler that closes it.
 */
export function Dialog({ title, subtitle, onClose, children, width = 'w-[44rem]', align = 'center' }: {
  title?: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; width?: string; align?: 'center' | 'right';
}) {
  const scope = `dialog-${useId()}`;
  const level = useMotion();
  useEffect(() => {
    pushScope(scope);
    const off = pushBack(() => { onClose(); return true; });
    return () => { off(); popScope(scope); };
  }, [scope, onClose]);

  return (
    <ScopeContext.Provider value={scope}>
      <motion.div className="absolute inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: level === 'off' ? 0 : 0.22 }}
        style={{ background: 'radial-gradient(80% 80% at 50% 50%, rgba(11,9,18,0.55), rgba(11,9,18,0.85))' }}>
        <div className={cx('flex h-full w-full px-24 py-10', align === 'center' ? 'items-center justify-center' : 'items-stretch justify-end')}>
          <motion.div
            role="dialog" aria-modal="true"
            initial={{ opacity: 0, y: align === 'center' ? 16 : 0, x: align === 'right' ? 32 : 0, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: level === 'off' ? 0 : 0.28, ease: [0.22, 0.8, 0.24, 1] }}
            className={cx('glass flex max-h-full flex-col rounded-[2rem] p-9', width)}
            style={{ background: 'linear-gradient(180deg, rgba(44,34,62,0.94), rgba(22,17,32,0.96))' }}
          >
            {title && <h2 className="text-[2.1rem] font-semibold tracking-tight text-fg">{title}</h2>}
            {subtitle && <p className="mt-1.5 text-[1.15rem] leading-snug text-fg-muted">{subtitle}</p>}
            {/* Padding (offset by negative margin) gives focus rings and the focused item's scale room,
                so nothing is clipped by the scroll area; scroll-padding keeps the focused item clear of the edges. */}
            <div className={cx('scroll-hidden -mx-4 -mb-4 min-h-0 overflow-y-auto px-4 pb-4 pt-2', !!title && 'mt-5')} style={{ scrollPadding: '1rem' }}>{children}</div>
          </motion.div>
        </div>
      </motion.div>
    </ScopeContext.Provider>
  );
}
