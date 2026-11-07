import { AnimatePresence } from 'motion/react';
import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import { useFocusable } from '../focus/focus.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { Dialog } from './Dialog.tsx';
import { cx, focusLift } from './primitives.tsx';

/**
 * Choice picker for settings: opens a dialog listing every option (with a preview where it
 * helps) instead of cycling through values with repeated presses.
 */
export interface Choice {
  value: string;
  label: string;
  hint?: string;
  /** Visual preview (colour swatch, background thumbnail, sample text). */
  preview?: ReactNode;
}

interface PickerSpec {
  title: string;
  subtitle?: string;
  choices: Choice[];
  value: string;
  layout?: 'list' | 'grid';
  onPick: (value: string) => void;
  /** Called when an option gains focus (e.g. play a sound sample). */
  onPreview?: (value: string) => void;
}

const usePicker = create<{ spec: PickerSpec | null }>(() => ({ spec: null }));

export function openPicker(spec: PickerSpec) {
  usePicker.setState({ spec });
}
const close = () => usePicker.setState({ spec: null });

function ListOption({ c, selected, onPick, autoFocus, onPreview }: { c: Choice; selected: boolean; onPick: () => void; autoFocus: boolean; onPreview?: () => void }) {
  const { ref, focused, pointer } = useFocusable<HTMLDivElement>(`pick-${c.value}`, { onSelect: onPick, autoFocus });
  const preview = useRef(onPreview);
  preview.current = onPreview;
  useEffect(() => { if (focused) preview.current?.(); }, [focused]);
  return (
    <div ref={ref} {...pointer} data-focused={focused || undefined} role="option" aria-selected={selected}
      className={cx('flex min-h-16 items-center gap-4 rounded-2xl px-5 py-3 transition-[background,box-shadow] duration-200',
        focused ? 'bg-white/[0.11] focus-ring' : selected ? 'bg-primary/15' : 'bg-white/[0.035]')}>
      {c.preview && <div className="shrink-0">{c.preview}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-[1.25rem] font-medium text-fg">{c.label}</div>
        {c.hint && <div className="mt-0.5 text-[1rem] leading-snug text-fg-muted">{c.hint}</div>}
      </div>
      <span className={cx('grid size-8 shrink-0 place-items-center rounded-full', selected ? 'bg-highlight text-ink-900' : 'border border-line')}>
        {selected && <Check className="size-5" strokeWidth={2.6} />}
      </span>
    </div>
  );
}

function GridOption({ c, selected, onPick, autoFocus }: { c: Choice; selected: boolean; onPick: () => void; autoFocus: boolean }) {
  const { ref, focused, pointer } = useFocusable<HTMLDivElement>(`pick-${c.value}`, { onSelect: onPick, autoFocus });
  const level = useMotion();
  return (
    <div ref={ref} {...pointer} data-focused={focused || undefined} role="option" aria-selected={selected}
      style={focusLift(focused, level, 1.03, 0.15)} className="flex flex-col gap-3">
      <div className={cx('relative aspect-video overflow-hidden rounded-2xl border-2 transition-[border-color,box-shadow] duration-200',
        focused ? 'border-transparent focus-ring' : selected ? 'border-highlight' : 'border-line')}>
        {c.preview}
        {selected && (
          <span className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-highlight text-ink-900 shadow">
            <Check className="size-5" strokeWidth={2.6} />
          </span>
        )}
      </div>
      <div className="px-1">
        <div className={cx('text-[1.15rem] font-medium', focused || selected ? 'text-fg' : 'text-fg/80')}>{c.label}</div>
        {c.hint && <div className="text-[0.95rem] text-fg-muted">{c.hint}</div>}
      </div>
    </div>
  );
}

/** Render once (in Settings); shows the active picker. */
export function PickerHost() {
  const spec = usePicker((s) => s.spec);
  return (
    <AnimatePresence>
      {spec && (
        <Dialog key={spec.title} title={spec.title} subtitle={spec.subtitle} onClose={close} width={spec.layout === 'grid' ? 'w-[64rem]' : 'w-[44rem]'}>
          <div className={spec.layout === 'grid' ? '-mx-3 grid grid-cols-3 gap-6 p-4' : 'flex flex-col gap-2.5 p-1'} role="listbox">
            {spec.choices.map((c) => {
              const pick = () => { spec.onPick(c.value); close(); };
              const props = { key: c.value, c, selected: c.value === spec.value, onPick: pick, autoFocus: c.value === spec.value };
              return spec.layout === 'grid' ? <GridOption {...props} /> : <ListOption {...props} onPreview={spec.onPreview ? () => spec.onPreview!(c.value) : undefined} />;
            })}
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}

/** Trailing "opens a picker" affordance for settings rows. */
export function PickerValue({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      {children}
      <ChevronRight className="size-5 opacity-70" strokeWidth={2} />
    </span>
  );
}
