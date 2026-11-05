import { AnimatePresence, motion } from 'motion/react';
import { FlaskConical, Gamepad2, SlidersHorizontal, Tv } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, applyAccent, connect, getStoredToken, pushToast, setStoredToken, useNoir } from '@noir/ui';
import { Customize } from './Customize.tsx';
import { Devices } from './Devices.tsx';
import { Remote } from './Remote.tsx';
import { Btn, Field, cx } from './ui.tsx';

type Tab = 'remote' | 'customize' | 'devices';

function Pair({ onPaired }: { onPaired: () => void }) {
  const [name, setName] = useState(() => (/iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android phone' : 'Phone'));
  const [req, setReq] = useState<{ requestId: string; displayedOnTv: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { pushToast({ tone: 'error', title: (e as Error).message }); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-dvh flex-col justify-center px-6">
      <div className="mb-10 flex items-center gap-3">
        <img src="/phone/icon.svg" alt="" className="size-10 rounded-xl" />
        <span className="text-[1.6rem] font-medium tracking-[0.4em]">NOIR</span>
      </div>
      {!req ? (
        <div className="space-y-4">
          <h1 className="text-[1.8rem] font-semibold leading-tight">Pair this phone</h1>
          <p className="text-fg-muted">A code will appear on your TV. Enter it here to let this phone control NOIR.</p>
          <Field label="Name for this phone" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <Btn variant="primary" className="w-full !py-4" disabled={busy || !name.trim()} onClick={() => go(async () => {
            setReq(await api('/api/phone/pair/request', { body: { name: name.trim() } }));
          })}>Show code on TV</Btn>
        </div>
      ) : (
        <div className="space-y-4">
          <h1 className="text-[1.8rem] font-semibold leading-tight">Enter the code on your TV</h1>
          {!req.displayedOnTv && <p className="rounded-2xl bg-amber-400/10 p-3 text-[0.88rem] text-amber-100">No NOIR screen is open right now, so the code can’t be shown. Open NOIR on the TV and try again.</p>}
          <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center text-[1.8rem] tracking-[0.45em]" />
          <Btn variant="primary" className="w-full !py-4" disabled={busy || code.length !== 6} onClick={() => go(async () => {
            const r = await api<{ token: string }>('/api/phone/pair/confirm', { body: { requestId: req.requestId, code } });
            setStoredToken(r.token);
            onPaired();
          })}>Pair</Btn>
          <Btn variant="ghost" className="w-full" onClick={() => { setReq(null); setCode(''); }}>Start over</Btn>
        </div>
      )}
    </div>
  );
}

export function App() {
  const status = useNoir((s) => s.status);
  const state = useNoir((s) => s.state);
  const toasts = useNoir((s) => s.toasts);
  const [tab, setTab] = useState<Tab>('remote');
  const [paired, setPaired] = useState(() => !!getStoredToken() || ['localhost', '127.0.0.1'].includes(location.hostname));

  useEffect(() => { if (paired) connect('phone'); }, [paired]);
  useEffect(() => { if (status === 'unauthorized') { setStoredToken(null); setPaired(false); } }, [status]);
  useEffect(() => { if (state) applyAccent(state.settings.appearance.accent); }, [state?.settings.appearance.accent]); // eslint-disable-line react-hooks/exhaustive-deps

  const toastLayer = (
    <div className="pointer-events-none fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass rounded-2xl px-4 py-3 text-[0.9rem]" style={{ background: 'rgba(30,23,43,0.95)' }}>
            <div className="text-fg">{t.title}</div>
            {t.body && <div className="text-[0.8rem] text-fg-muted">{t.body}</div>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  if (!paired) return <>{toastLayer}<Pair onPaired={() => setPaired(true)} /></>;

  const tabs: Array<[Tab, string, typeof Tv]> = [['remote', 'Remote', Gamepad2], ['customize', 'Customize', SlidersHorizontal], ['devices', 'Devices', Tv]];
  return (
    <div className="min-h-dvh pb-28">
      {toastLayer}
      <header className="sticky top-0 z-40 flex items-center justify-between px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl" style={{ background: 'rgba(11,9,18,0.7)' }}>
        <div className="flex items-center gap-2.5">
          <img src="/phone/icon.svg" alt="" className="size-8 rounded-lg" />
          <span className="text-[1.1rem] font-medium tracking-[0.35em]">NOIR</span>
        </div>
        <div className="flex items-center gap-2 text-[0.78rem]">
          {state?.mode === 'demo' && <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-2.5 py-1 text-fuchsia-100"><FlaskConical className="size-3.5" />Demo</span>}
          <span className={cx('size-2 rounded-full', status === 'online' ? 'bg-emerald-400' : 'bg-amber-400')} />
          <span className="text-fg-muted">{status === 'online' ? 'Connected' : 'Connecting…'}</span>
        </div>
      </header>
      <main className="px-5 pt-3">
        {!state ? <p className="mt-20 text-center text-fg-muted">Connecting to NOIR…</p> : tab === 'remote' ? <Remote /> : tab === 'customize' ? <Customize /> : <Devices />}
      </main>
      <nav className="glass fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex rounded-full p-1.5" style={{ background: 'rgba(30,23,43,0.88)' }}>
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={cx('relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[0.72rem] font-medium', tab === id ? 'text-fg' : 'text-fg-muted')}>
            {tab === id && <motion.span layoutId="ptab" className="absolute inset-0 rounded-full bg-primary/35" transition={{ duration: 0.25 }} />}
            <Icon className="relative size-5" /><span className="relative">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
