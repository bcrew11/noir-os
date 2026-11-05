import { Delete, Space } from 'lucide-react';
import { useFocusable } from '../focus/focus.ts';
import { cx } from './primitives.tsx';

const ALPHA = ['abcdefg', 'hijklmn', 'opqrstu', 'vwxyz12', '3456789'];
const NUMERIC = ['123', '456', '789', '.0'];

function Key({ id, label, onPress, wide, icon: Icon }: { id: string; label: string; onPress: () => void; wide?: boolean; icon?: typeof Delete }) {
  const { ref, focused, pointer } = useFocusable<HTMLButtonElement>(id, { onSelect: onPress, group: 'kbd' });
  return (
    <button ref={ref} {...pointer} data-focused={focused || undefined} tabIndex={-1} aria-label={label}
      className={cx('grid h-14 place-items-center rounded-xl text-[1.4rem] font-medium transition-[background,transform] duration-150',
        wide ? 'col-span-2' : '', focused ? 'scale-110 bg-highlight text-ink-900 shadow-[0_0_1.2rem_var(--noir-accent)]' : 'bg-white/[0.07] text-fg')}>
      {Icon ? <Icon className="size-6" /> : label}
    </button>
  );
}

/** Remote-friendly on-screen keyboard. `mode="numeric"` for PINs and IP addresses. */
export function Keyboard({ value, onChange, mode = 'alpha', maxLength = 40, idPrefix = 'kbd' }: {
  value: string; onChange: (v: string) => void; mode?: 'alpha' | 'numeric'; maxLength?: number; idPrefix?: string;
}) {
  const rows = mode === 'alpha' ? ALPHA : NUMERIC;
  const add = (c: string) => value.length < maxLength && onChange(value + c);
  return (
    <div className={cx('grid gap-2', mode === 'alpha' ? 'grid-cols-7' : 'grid-cols-3')}>
      {rows.join('').split('').map((c) => <Key key={c} id={`${idPrefix}-${c}`} label={c.toUpperCase()} onPress={() => add(c)} />)}
      {mode === 'alpha' && <Key id={`${idPrefix}-space`} label="Space" icon={Space} wide onPress={() => add(' ')} />}
      <Key id={`${idPrefix}-del`} label="Delete" icon={Delete} wide={mode === 'alpha'} onPress={() => onChange(value.slice(0, -1))} />
      {mode === 'alpha' && <Key id={`${idPrefix}-clear`} label="Clear" wide onPress={() => onChange('')} />}
    </div>
  );
}
