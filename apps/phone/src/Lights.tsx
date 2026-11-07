import { Lamp, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, pushToast } from '@noir/ui';
import { Section, cx, haptic } from './ui.tsx';

interface Light { device: string; sku: string; name: string; on: boolean | null }
interface PowerResult { status: 'verified' | 'sent' | 'failed'; on: boolean | null; message: string }

/** Govee lights set up on the TV (Settings → Smart Home). The TV holds the API key. */
export function Lights() {
  const [lights, setLights] = useState<Light[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => api<Light[]>('/api/lights').then(setLights).catch(() => setLights([])), []);
  useEffect(() => {
    void load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (!lights?.length) return null;

  const toggle = async (l: Light) => {
    haptic(12);
    setBusy(l.device);
    try {
      const r = await api<PowerResult>(`/api/lights/${encodeURIComponent(l.device)}`, { body: l.on == null ? {} : { on: !l.on } });
      if (r.status === 'failed') pushToast({ tone: 'error', title: r.message });
      setLights((cur) => cur?.map((x) => (x.device === l.device ? { ...x, on: r.on ?? x.on } : x)) ?? cur);
    } catch (e) {
      pushToast({ tone: 'error', title: (e as Error).message });
    } finally { setBusy(null); }
  };

  return (
    <Section title="Lights">
      <div className="grid grid-cols-2 gap-2.5">
        {lights.map((l) => (
          <button key={l.device} type="button" disabled={busy === l.device} onClick={() => void toggle(l)}
            className={cx('flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition active:scale-95',
              l.on ? 'border-highlight/50 bg-primary/35 text-fg shadow-[0_0_1.2rem_-0.4rem_var(--noir-accent)]' : 'border-line bg-white/[0.04] text-fg-muted')}>
            {busy === l.device ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <Lamp className={cx('size-5 shrink-0', l.on && 'text-highlight')} />}
            <span className="min-w-0">
              <span className="block truncate text-[0.95rem]">{l.name}</span>
              <span className="block text-[0.75rem] opacity-70">{l.on == null ? 'Tap to toggle' : l.on ? 'On' : 'Off'}</span>
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}
