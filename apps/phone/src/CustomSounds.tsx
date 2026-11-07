import { Loader2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, patchSettings, pushToast, useNoir } from '@noir/ui';
import { Btn, Card, Section } from './ui.tsx';

type Kind = 'move' | 'select' | 'back';
type Slots = Record<Kind, boolean>;
const KINDS: Array<[Kind, string, string]> = [
  ['move', 'Move', 'Each press of the arrows'],
  ['select', 'Select', 'OK'],
  ['back', 'Back', 'Back'],
];
const MAX_BYTES = 2 * 1024 * 1024;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Couldn’t read that file.'));
    r.readAsDataURL(file);
  });
}

/** Your own navigation sounds (Google TV setup): upload a clip per action; it's stored on the TV only. */
export function CustomSounds() {
  const style = useNoir((s) => s.state?.settings.sound.style);
  const [slots, setSlots] = useState<Slots | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null);
  const inputs = useRef<Partial<Record<Kind, HTMLInputElement | null>>>({});

  useEffect(() => { void api<Slots>('/api/sounds/custom').then(setSlots).catch(() => setSlots(null)); }, []);
  if (!slots) return null;

  const upload = async (kind: Kind, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { pushToast({ tone: 'error', title: 'That file is too big', body: 'Use a short clip (under 2 MB).' }); return; }
    setBusy(kind);
    try {
      const next = await api<Slots>(`/api/sounds/custom/${kind}`, { method: 'PUT', body: { data: await readBase64(file) } });
      setSlots(next);
      if (style !== 'custom') await patchSettings({ sound: { style: 'custom' } });
      pushToast({ tone: 'success', title: `${kind[0]!.toUpperCase()}${kind.slice(1)} sound set`, body: 'Playing it on the TV now.' });
    } catch (e) {
      pushToast({ tone: 'error', title: (e as Error).message });
    } finally {
      setBusy(null);
      const el = inputs.current[kind];
      if (el) el.value = '';
    }
  };
  const remove = async (kind: Kind) => {
    setBusy(kind);
    try { setSlots(await api<Slots>(`/api/sounds/custom/${kind}`, { method: 'DELETE' })); }
    catch (e) { pushToast({ tone: 'error', title: (e as Error).message }); }
    finally { setBusy(null); }
  };

  return (
    <Section title="Custom sounds">
      <Card className="space-y-1 !p-2">
        <p className="px-2 pb-1 pt-1 text-[0.82rem] leading-relaxed text-fg-muted">
          Use your own clips for the “Custom” sound style. Pick an audio file for each action (MP3, M4A or WAV; up to 2 seconds is used). They’re saved on the TV only.
        </p>
        {KINDS.map(([kind, label, hint]) => (
          <div key={kind} className="flex items-center gap-2 rounded-2xl px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="text-[0.98rem]">{label}</div>
              <div className="text-[0.78rem] text-fg-muted">{slots[kind] ? 'Custom clip set' : `Not set · ${hint}`}</div>
            </div>
            <input ref={(el) => { inputs.current[kind] = el; }} type="file" accept="audio/*" className="hidden" onChange={(e) => void upload(kind, e.target.files?.[0])} />
            {slots[kind] && <Btn variant="ghost" label={`Remove ${label} sound`} disabled={!!busy} onClick={() => void remove(kind)} className="!p-2"><X className="size-4.5" /></Btn>}
            <Btn disabled={!!busy} onClick={() => inputs.current[kind]?.click()} className="!py-2">
              {busy === kind ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{slots[kind] ? 'Replace' : 'Choose'}
            </Btn>
          </div>
        ))}
      </Card>
    </Section>
  );
}
