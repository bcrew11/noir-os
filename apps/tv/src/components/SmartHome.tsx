import { AnimatePresence } from 'motion/react';
import { KeyRound, Lightbulb, LightbulbOff, Loader2, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { patchSettings, pushToast, useNoir } from '@noir/ui';
import { useFocusable } from '../focus/focus.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { getPower, goveeAvailable, goveeHasKey, goveeSetKey, listDevices, setPower, type GoveeDevice } from '../lib/govee.ts';
import { Dialog } from './Dialog.tsx';
import { Keyboard } from './Keyboard.tsx';
import { FButton, FRow, Toggle, cx, focusLift } from './primitives.tsx';

type Light = { device: string; sku: string; name: string };

/* ------------------------------- Home widget ------------------------------- */

function LightButton({ light, on, busy, onToggle }: { light: Light; on: boolean | null; busy: boolean; onToggle: () => void }) {
  const { ref, focused, pointer } = useFocusable<HTMLButtonElement>(`light-${light.device}`, { group: 'widgets', onSelect: onToggle });
  const level = useMotion();
  const Icon = on === false ? LightbulbOff : Lightbulb;
  return (
    <button ref={ref} {...pointer} data-focused={focused || undefined} tabIndex={-1} aria-label={`${light.name}: ${on ? 'on' : on === false ? 'off' : 'unknown'}`}
      style={focusLift(focused, level, 1.05, 0)}
      className={cx('flex h-[6.2rem] min-w-[11rem] flex-col items-start justify-center gap-1 rounded-2xl px-5 text-left transition-[background,box-shadow] duration-200',
        focused ? 'bg-white/14 focus-ring' : on ? 'bg-amber-300/15' : 'bg-white/[0.05]')}>
      <span className="flex items-center gap-2.5">
        {busy ? <Loader2 className="size-6 animate-spin text-fg-muted" /> : <Icon className={cx('size-6', on ? 'text-amber-200' : 'text-fg-muted')} strokeWidth={1.8} />}
        <span className={cx('text-[1.05rem] font-medium', on ? 'text-amber-100' : 'text-fg-muted')}>{on === null ? '—' : on ? 'On' : 'Off'}</span>
      </span>
      <span className="max-w-[12rem] truncate text-[1.2rem] font-medium text-fg">{light.name}</span>
    </button>
  );
}

/** One-press light toggles on Home. Reads state when shown; never polls in the background. */
export function SmartHomeWidget() {
  const sh = useNoir((s) => s.state?.settings.smartHome);
  // Stable list: re-fetch light states only when the chosen lights actually change.
  const lights = useMemo(() => (sh?.showOnHome ? sh.devices : []), [sh?.showOnHome, sh?.devices]);
  const [state, setState] = useState<Record<string, boolean | null>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!goveeAvailable() || !goveeHasKey()) return;
    for (const l of lights) void getPower(l).then((on) => setState((s) => ({ ...s, [l.device]: on }))).catch(() => undefined);
  }, [lights]);

  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  if (!lights.length || !goveeAvailable()) return null;

  const toggle = async (l: Light) => {
    setBusy(l.device);
    const want = !(state[l.device] ?? false);
    const r = await setPower(l, want);
    setBusy(null);
    if (r.status === 'verified') setState((s) => ({ ...s, [l.device]: r.on }));
    else setState((s) => ({ ...s, [l.device]: null }));
    pushToast({ tone: r.status === 'verified' ? 'success' : r.status === 'sent' ? 'info' : 'error', title: r.message });
  };

  return (
    <div className="glass flex h-[8.75rem] shrink-0 items-center gap-3 rounded-[1.75rem] px-4">
      {lights.map((l) => <LightButton key={l.device} light={l} on={state[l.device] ?? null} busy={busy === l.device} onToggle={() => void toggle(l)} />)}
    </div>
  );
}

/* ----------------------------- Settings section ---------------------------- */

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <div className="mb-3 px-1 text-[0.95rem] font-medium uppercase tracking-[0.16em] text-fg-muted">{title}</div>
    <div className="flex flex-col gap-2.5">{children}</div>
  </div>
);

export function SmartHomeSettings() {
  const sh = useNoir((s) => s.state?.settings.smartHome);
  const [hasKey, setHasKey] = useState(goveeHasKey());
  const [entering, setEntering] = useState(false);
  const [found, setFound] = useState<GoveeDevice[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = () => setHasKey(goveeHasKey());
    window.addEventListener('noir-smart-home', onKey);
    return () => window.removeEventListener('noir-smart-home', onKey);
  }, []);

  if (!goveeAvailable()) {
    return (
      <Group title="Govee lights">
        <FRow id="sh-na" icon={Lightbulb} title="Available on the NOIR Google TV launcher" hint="Smart-light control runs on the streaming stick, where your Govee API key is stored." />
      </Group>
    );
  }
  const chosen = sh?.devices ?? [];
  const isChosen = (d: GoveeDevice) => chosen.some((c) => c.device === d.device);
  const toggleDevice = (d: GoveeDevice) => {
    const next = isChosen(d) ? chosen.filter((c) => c.device !== d.device) : [...chosen, { device: d.device, sku: d.sku, name: d.name }].slice(0, 8);
    void patchSettings({ smartHome: { devices: next } });
  };
  const search = async () => {
    setSearching(true);
    try {
      const list = await listDevices();
      setFound(list);
      if (!list.length) pushToast({ tone: 'warning', title: 'No Govee devices found on this account' });
    } catch (e) {
      pushToast({ tone: 'error', title: (e as Error).message });
    } finally { setSearching(false); }
  };

  return (
    <>
      <Group title="Govee lights">
        <FRow id="sh-key" icon={KeyRound} title={hasKey ? 'Govee API key saved' : 'Add your Govee API key'}
          hint={hasKey ? 'Stored only on this device.' : 'In the Govee Home app: Profile → Settings (gear) → Apply for API Key. Govee emails it to you.'}
          value={hasKey ? 'Change' : 'Enter'} onSelect={() => setEntering(true)} />
        {hasKey && (
          <FRow id="sh-find" icon={Search} title="Find my lights" hint="Lists the devices on your Govee account." value={searching ? 'Searching…' : ''} onSelect={() => void search()} />
        )}
        {found?.filter((d) => d.canPower).map((d) => (
          <FRow key={d.device} id={`sh-dev-${d.device}`} icon={Lightbulb} title={d.name} hint={`${d.sku} · show on Home`} right={<Toggle on={isChosen(d)} />} onSelect={() => toggleDevice(d)} />
        ))}
        {!found && chosen.map((c) => (
          <FRow key={c.device} id={`sh-dev-${c.device}`} icon={Lightbulb} title={c.name} hint={`${c.sku} · on Home`} right={<Toggle on />} onSelect={() => toggleDevice({ ...c, canPower: true })} />
        ))}
      </Group>
      {hasKey && (
        <Group title="Home screen">
          <FRow id="sh-home" title="Show lights on Home" right={<Toggle on={sh?.showOnHome ?? true} />} onSelect={() => void patchSettings({ smartHome: { showOnHome: !(sh?.showOnHome ?? true) } })} />
          <FRow id="sh-remove" icon={Trash2} title="Remove Govee API key" onSelect={() => { goveeSetKey(''); setHasKey(false); setFound(null); }} />
        </Group>
      )}
      <AnimatePresence>{entering && <KeyDialog key="govee-key" onClose={() => { setEntering(false); setHasKey(goveeHasKey()); }} />}</AnimatePresence>
    </>
  );
}

function KeyDialog({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState('');
  return (
    <Dialog title="Govee API key" subtitle="Type the key from Govee’s email. Or, from a computer: adb shell am start -n app.noir.launcher/.MainActivity --es govee_key YOUR-KEY" onClose={onClose} width="w-[48rem]">
      <div className="mb-5 flex h-16 items-center overflow-hidden rounded-2xl border border-line-strong bg-white/[0.05] px-5 font-mono text-[1.35rem]">
        <span className="truncate">{key || <span className="font-sans text-fg-dim">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</span>}</span>
        <span className="ml-1 h-8 w-0.5 shrink-0 animate-pulse bg-highlight" />
      </div>
      <Keyboard value={key} onChange={setKey} maxLength={64} idPrefix="govee" />
      <FButton id="govee-save" variant="primary" className="mt-5 w-full" label="Save key" disabled={key.trim().length < 20}
        onSelect={() => { goveeSetKey(key); pushToast({ tone: 'success', title: 'Govee key saved' }); onClose(); }} />
    </Dialog>
  );
}
