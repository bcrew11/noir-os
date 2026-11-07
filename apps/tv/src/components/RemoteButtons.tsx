import { AnimatePresence } from 'motion/react';
import { Gamepad2, Home, Lightbulb, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pushToast, useNoir } from '@noir/ui';
import { androidBridge, awaitNative, cancelNative, installedApps, nativeCallbackId } from '../lib/android.ts';
import { Dialog } from './Dialog.tsx';
import { openPicker } from './Picker.tsx';
import { FButton, FRow } from './primitives.tsx';

/**
 * Remote button remapping (Android TV launcher). A user-enabled accessibility service sees remote
 * buttons before the system acts on them, so a shortcut button (e.g. onn's "Free TV") can toggle a
 * lamp or open an app — even while another app is in front.
 */
type Action =
  | { type: 'govee_toggle'; device: string; sku: string; name: string }
  | { type: 'launch'; pkg: string; name: string }
  | { type: 'noir_home' };
type Mapping = Action & { keyName: string };

const describe = (a: Action) => a.type === 'govee_toggle' ? `Toggle ${a.name}` : a.type === 'launch' ? `Open ${a.name}` : 'Go to NOIR Home';
const ADB_ENABLE = 'adb shell settings put secure enabled_accessibility_services app.noir.launcher/app.noir.launcher.NoirKeyService';

export const remoteButtonsAvailable = () => typeof androidBridge()?.setKeyMapping === 'function';

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <div className="mb-3 px-1 text-[0.95rem] font-medium uppercase tracking-[0.16em] text-fg-muted">{title}</div>
    <div className="flex flex-col gap-2.5">{children}</div>
  </div>
);

function readMappings(): Record<string, Mapping> {
  try { return JSON.parse(androidBridge()?.keyMappings?.() ?? '{}') as Record<string, Mapping>; } catch { return {}; }
}

export function RemoteButtonsSettings() {
  const lights = useNoir((s) => s.state?.settings.smartHome.devices ?? []);
  const [enabled, setEnabled] = useState(() => !!androidBridge()?.keyServiceEnabled?.());
  const [mappings, setMappings] = useState(readMappings);
  const [learning, setLearning] = useState(false);

  const refresh = useCallback(() => { setEnabled(!!androidBridge()?.keyServiceEnabled?.()); setMappings(readMappings()); }, []);
  useEffect(() => {
    // Coming back from Android's accessibility settings: re-check.
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  if (!remoteButtonsAvailable()) {
    return (
      <Group title="Remote buttons">
        <FRow id="rb-na" icon={Gamepad2} title="Available on the NOIR Google TV launcher" hint="Button remapping runs on the streaming stick." />
      </Group>
    );
  }

  const chooseAction = (keyCode: number, keyName: string) => {
    const apps = installedApps().sort((a, b) => a.label.localeCompare(b.label));
    const actions: Array<{ value: string; label: string; hint?: string; action: Action | null }> = [
      ...lights.map((l) => ({ value: `light:${l.device}`, label: `Toggle ${l.name}`, hint: 'Turns the light on or off, even while another app is open.', action: { type: 'govee_toggle' as const, device: l.device, sku: l.sku, name: l.name } })),
      { value: 'home', label: 'Go to NOIR Home', action: { type: 'noir_home' } },
      ...apps.map((a) => ({ value: `app:${a.pkg}`, label: `Open ${a.label}`, action: { type: 'launch' as const, pkg: a.pkg, name: a.label } })),
      { value: 'none', label: 'Remove assignment', hint: 'The button goes back to doing what it did before.', action: null },
    ];
    openPicker({
      title: `${keyName} button`,
      subtitle: lights.length ? undefined : 'Add Govee lights in Settings → Smart Home to toggle them from a button.',
      value: '', layout: 'list',
      choices: actions.map(({ value, label, hint }) => ({ value, label, hint })),
      onPick: (v) => {
        const a = actions.find((x) => x.value === v)?.action ?? null;
        const okSet = androidBridge()?.setKeyMapping?.(keyCode, a ? JSON.stringify(a) : null);
        if (okSet === false) pushToast({ tone: 'warning', title: 'That button can’t be remapped', body: 'Navigation, volume and power buttons stay as they are.' });
        else pushToast({ tone: 'success', title: a ? `${keyName} → ${describe(a)}` : `${keyName} restored` });
        setMappings(readMappings());
      },
    });
  };

  return (
    <>
      <Group title="Remote buttons">
        <FRow id="rb-perm" icon={ShieldCheck} title={enabled ? 'NOIR can read remote buttons' : 'Allow NOIR to read remote buttons'}
          hint={enabled ? 'Only buttons you assign below are affected; everything else works as normal.'
            : `Opens Android’s Accessibility settings: choose “NOIR remote buttons” and turn it on. Or from your Mac: ${ADB_ENABLE}`}
          value={enabled ? '' : 'Set up'}
          onSelect={() => { if (!enabled && !androidBridge()?.openAccessibilitySettings?.()) pushToast({ tone: 'info', title: 'Use the adb command shown here' }); else refresh(); }} />
        <FRow id="rb-assign" icon={Plus} title="Assign a button" hint="Press any shortcut button on your remote (e.g. Free TV), then choose what it does." disabled={!enabled} onSelect={() => setLearning(true)} />
      </Group>
      {Object.keys(mappings).length > 0 && (
        <Group title="Assigned">
          {Object.entries(mappings).map(([code, m]) => (
            <FRow key={code} id={`rb-map-${code}`} icon={m.type === 'govee_toggle' ? Lightbulb : m.type === 'noir_home' ? Home : Gamepad2}
              title={`${m.keyName} button`} value={describe(m)} onSelect={() => chooseAction(Number(code), m.keyName)} />
          ))}
          <FRow id="rb-clear" icon={Trash2} title="Remove all assignments" onSelect={() => {
            for (const code of Object.keys(mappings)) androidBridge()?.setKeyMapping?.(Number(code), null);
            setMappings({});
          }} />
        </Group>
      )}
      <AnimatePresence>
        {learning && <LearnDialog key="learn" onClose={() => setLearning(false)} onLearned={(code, name) => { setLearning(false); chooseAction(code, name); }} />}
      </AnimatePresence>
    </>
  );
}

function LearnDialog({ onClose, onLearned }: { onClose: () => void; onLearned: (keyCode: number, name: string) => void }) {
  // Start listening once; keep the latest callbacks in refs so re-renders don't restart it.
  const cb = useRef({ onClose, onLearned });
  cb.current = { onClose, onLearned };
  useEffect(() => {
    const { onClose } = cb.current;
    const id = nativeCallbackId('key');
    androidBridge()?.learnKey?.(id);
    let alive = true;
    void awaitNative(id, 30000).then(([code, name]) => { if (alive) cb.current.onLearned(Number(code), String(name)); }).catch(() => {
      if (!alive) return;
      pushToast({ tone: 'warning', title: 'No button detected', body: 'That button may be handled by the remote itself and not visible to apps.' });
      onClose();
    });
    return () => { alive = false; cancelNative(id); androidBridge()?.cancelLearnKey?.(); };
  }, []);
  return (
    <Dialog title="Press a button" subtitle="Press the remote button you want to use (for example, Free TV). Navigation, volume and power buttons can’t be reassigned." onClose={onClose} width="w-[40rem]">
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="grid size-24 animate-pulse place-items-center rounded-full bg-primary/25"><Gamepad2 className="size-12 text-highlight" strokeWidth={1.5} /></div>
        <FButton id="learn-cancel" label="Cancel" autoFocus onSelect={onClose} />
      </div>
    </Dialog>
  );
}
