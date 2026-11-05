import { AnimatePresence, motion } from 'motion/react';
import { Pencil, Power, Undo2, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { INPUT_ICONS, type InputIcon } from '@noir/core';
import { command, patchSettings, useNoir } from '@noir/ui';
import { INPUT_ICON } from '../components/chrome.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { Keyboard } from '../components/Keyboard.tsx';
import { FButton, FRow, Pill, SectionTitle, cx, focusTransition } from '../components/primitives.tsx';
import { useFocusable } from '../focus/focus.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { useScreenFocus } from '../hooks/useScreenFocus.ts';

const PRESETS = ['PlayStation', 'Xbox', 'Nintendo Switch', 'Computer', 'Streaming Device', 'Cable Box', 'Soundbar', 'Blu-ray Player'];

function InputCard({ id, label, sublabel, icon, active, onSelect, onLongSelect }: { id: string; label: string; sublabel: string; icon: InputIcon; active: boolean; onSelect: () => void; onLongSelect: () => void }) {
  const { ref, focused, pointer } = useFocusable<HTMLDivElement>(`in-${id}`, { group: 'inputs', onSelect, onLongSelect });
  const t = focusTransition(useMotion());
  const Icon = INPUT_ICON[icon];
  return (
    <motion.div ref={ref} {...pointer} role="button" aria-label={`${label} (${id})`} animate={{ scale: focused ? 1.05 : 1, y: focused ? -6 : 0 }} transition={t}
      className={cx('glass relative flex h-64 cursor-pointer flex-col justify-between rounded-[1.75rem] p-7 transition-[background,box-shadow]', focused && 'bg-white/10 focus-ring')}>
      <div className="flex items-start justify-between">
        <div className={cx('grid size-20 place-items-center rounded-2xl border', active ? 'border-highlight/40 bg-primary/25' : 'border-line bg-white/[0.05]')}>
          <Icon className="size-10 text-fg" strokeWidth={1.5} />
        </div>
        {active && <Pill tone="ok">On now</Pill>}
      </div>
      <div>
        <div className="text-[1.7rem] font-medium text-fg">{label}</div>
        <div className="text-[1.15rem] text-fg-muted">{sublabel}</div>
      </div>
    </motion.div>
  );
}

function EditInput({ inputId, onClose }: { inputId: string; onClose: () => void }) {
  const cfg = useNoir((s) => s.state?.settings.inputs[inputId]) ?? { label: inputId, icon: 'tv' as InputIcon, hidden: false };
  const [custom, setCustom] = useState<string | null>(null);
  const save = (patch: Partial<typeof cfg>) => void patchSettings({ inputs: { [inputId]: { ...cfg, ...patch } } });
  const nextIcon = INPUT_ICONS[(INPUT_ICONS.indexOf(cfg.icon) + 1) % INPUT_ICONS.length]!;
  const Icon = INPUT_ICON[cfg.icon];
  if (custom !== null) {
    return (
      <Dialog title={`Name ${inputId.replace('-', ' ')}`} onClose={() => { if (custom.trim()) save({ label: custom.trim() }); setCustom(null); }} width="w-[40rem]">
        <div className="mb-5 flex h-16 items-center rounded-2xl border border-line-strong bg-white/[0.05] px-5 text-[1.6rem]">{custom || <span className="text-fg-dim">Type a name</span>}<span className="ml-1 h-8 w-0.5 animate-pulse bg-highlight" /></div>
        <Keyboard value={custom} onChange={setCustom} maxLength={32} idPrefix="name" />
        <p className="mt-5 text-[1rem] text-fg-muted">Press Back to save.</p>
      </Dialog>
    );
  }
  return (
    <Dialog title={`Customize ${inputId.replace('-', ' ')}`} subtitle="Names and icons are stored in NOIR; your TV’s own input names aren’t changed." onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        <FRow id="ed-icon" icon={Icon} title="Icon" value={cfg.icon} hint="Press OK to cycle" autoFocus onSelect={() => save({ icon: nextIcon })} />
        {PRESETS.map((p) => <FRow key={p} id={`ed-${p}`} title={p} value={cfg.label === p ? 'Selected' : ''} onSelect={() => save({ label: p })} />)}
        <FRow id="ed-custom" icon={Pencil} title="Custom name…" onSelect={() => setCustom(cfg.label)} />
        <FRow id="ed-hide" title={cfg.hidden ? 'Show this input' : 'Hide this input'} onSelect={() => save({ hidden: !cfg.hidden })} />
      </div>
    </Dialog>
  );
}

export default function Inputs() {
  const state = useNoir((s) => s.state);
  const [editing, setEditing] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const firstInput = state?.tv.inputs[0]?.id ?? Object.keys(state?.settings.inputs ?? {})[0];
  useScreenFocus('inputs', firstInput ? `in-${firstInput}` : 'tv-volup');
  if (!state) return null;
  const tv = state.tv;
  const inputs = tv.inputs.length ? tv.inputs : Object.keys(state.settings.inputs).map((id) => ({ id, systemName: id }));
  const visible = inputs.filter((i) => showHidden || !state.settings.inputs[i.id]?.hidden);
  const caps = tv.capabilities;

  return (
    <div className="flex h-full flex-col pt-10">
      <SectionTitle sub={caps.inputs.level === 'unsupported' ? caps.inputs.note : 'Press OK to switch. Hold OK to rename or change the icon.'}>Inputs</SectionTitle>
      <div className="grid grid-cols-4 gap-7">
        {visible.map((i) => {
          const cfg = state.settings.inputs[i.id];
          return (
            <InputCard key={i.id} id={i.id} label={cfg?.label ?? i.systemName} sublabel={i.id.replace('-', ' ')} icon={cfg?.icon ?? 'tv'}
              active={tv.currentInput === i.id} onSelect={() => void command({ type: 'tv.input', inputId: i.id })} onLongSelect={() => setEditing(i.id)} />
          );
        })}
      </div>

      <div className="mt-12 text-[1rem] font-medium uppercase tracking-[0.16em] text-fg-muted">Television</div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <FButton id="tv-voldown" icon={Volume1} label="Volume down" iconOnly variant="round" group="tvctl" disabled={caps.volume.level === 'unsupported'} onSelect={() => void command({ type: 'tv.volumeStep', delta: -2 }, { silent: true })} />
        <div className="glass flex h-14 w-64 items-center gap-4 rounded-full px-5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-highlight transition-[width] duration-300" style={{ width: `${tv.audio.volume ?? 0}%` }} /></div>
          <span className="w-8 text-right text-[1.1rem] tabular-nums text-fg">{tv.audio.volume ?? '—'}</span>
        </div>
        <FButton id="tv-volup" icon={Volume2} label="Volume up" iconOnly variant="round" group="tvctl" disabled={caps.volume.level === 'unsupported'} onSelect={() => void command({ type: 'tv.volumeStep', delta: 2 }, { silent: true })} />
        <FButton id="tv-mute" icon={VolumeX} label={tv.audio.muted ? 'Unmute' : 'Mute'} group="tvctl" disabled={caps.mute.level === 'unsupported'} onSelect={() => void command({ type: 'tv.mute' })} />
        <FButton id="tv-power" icon={Power} label="Turn TV off" group="tvctl" disabled={caps.power.level === 'unsupported'} onSelect={() => void command({ type: 'tv.power', on: false })} />
        {state.settings.system.noirInputId && <FButton id="tv-return" icon={Undo2} label="Return to NOIR" group="tvctl" onSelect={() => void command({ type: 'tv.returnToNoir' })} />}
        <FButton id="tv-hidden" variant="ghost" label={showHidden ? 'Hide hidden inputs' : 'Show hidden inputs'} group="tvctl" onSelect={() => setShowHidden((v) => !v)} />
      </div>
      <p className="mt-6 max-w-[70rem] text-[1.05rem] text-fg-dim">
        {tv.adapter === 'mock' ? 'Demo mode: input switching and volume are simulated.' : tv.adapter === 'vizio' ? `Connected to ${tv.device?.model ?? 'your TV'} over Wi‑Fi. Results marked “verified” were read back from the TV.` : 'Pair your TV in Settings → Devices to control it over Wi‑Fi.'}
      </p>

      <AnimatePresence>{editing && <EditInput key="edit" inputId={editing} onClose={() => setEditing(null)} />}</AnimatePresence>
    </div>
  );
}
