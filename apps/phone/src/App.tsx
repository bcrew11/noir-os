import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, FlaskConical, Gamepad2, Menu, Pause, Play, SkipBack, SkipForward, SlidersHorizontal, Tv, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, applyAccent, command, connect, getStoredToken, pushToast, setStoredToken, useNoir } from '@noir/ui';
import { Customize } from './Customize.tsx';
import { Devices } from './Devices.tsx';
import { Remote } from './Remote.tsx';
import { Saved, flushSavedQueue } from './Saved.tsx';
import { Btn, Field, cx, haptic } from './ui.tsx';

type Tab = 'remote' | 'saved' | 'customize' | 'devices';

function Pair({ onPaired }: { onPaired: () => void }) {
  const [name, setName] = useState(() => (/iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android phone' : 'Phone'));
  const [req, setReq] = useState<{ requestId: string; displayedOnTv: boolean } | null>(null);
  const [code, setCode] = useState('');
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
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
          {ios && !installed && (
            <p className="rounded-2xl bg-primary/15 p-3 text-[0.88rem] leading-relaxed text-fg">
              Want NOIR as an app? Before pairing, tap <span className="font-medium">Share</span> → <span className="font-medium">Add to Home Screen</span>, then open NOIR from its icon and pair there. (Pairing in Safari doesn’t carry over to the Home Screen app.)
            </p>
          )}
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
  const [menu, setMenu] = useState(false);
  const [paired, setPaired] = useState(() => !!getStoredToken() || ['localhost', '127.0.0.1'].includes(location.hostname));

  useEffect(() => { if (paired) connect('phone'); }, [paired]);
  useEffect(() => { if (status === 'unauthorized') { setStoredToken(null); setPaired(false); } }, [status]);
  // Links saved while the TV was unreachable sync as soon as NOIR is back, whatever page is open.
  useEffect(() => { if (status === 'online' && paired) void flushSavedQueue(); }, [status, paired]);
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

  const onDevice = state?.deployment === 'android-tv' && state.tv.adapter === 'none';
  const tabs: Array<[Tab, string, typeof Tv]> = [
    ['remote', 'Remote', Gamepad2],
    ...(onDevice ? [['saved', 'Saved', Bookmark] as [Tab, string, typeof Tv]] : []),
    ['customize', 'Customize', SlidersHorizontal],
    ['devices', 'Devices', Tv],
  ];
  const title = tabs.find(([id]) => id === tab)?.[1] ?? 'NOIR';
  return (
    <div className="min-h-dvh pb-32">
      {toastLayer}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl" style={{ background: 'rgba(11,9,18,0.7)' }}>
        <button type="button" aria-label="Menu" onClick={() => { haptic(); setMenu(true); }} className="grid size-11 place-items-center rounded-2xl text-fg active:bg-white/10">
          <Menu className="size-6" />
        </button>
        <span className="flex-1 text-[1.15rem] font-semibold">{title}</span>
        <div className="flex items-center gap-2 text-[0.78rem]">
          {state?.mode === 'demo' && <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-2.5 py-1 text-fuchsia-100"><FlaskConical className="size-3.5" />Demo</span>}
          <span className={cx('size-2 rounded-full', status === 'online' ? 'bg-emerald-400' : 'bg-amber-400')} />
          <span className="text-fg-muted">{status === 'online' ? 'Connected' : 'Connecting…'}</span>
        </div>
      </header>
      <main className="px-5 pt-3">
        {!state ? <p className="mt-20 text-center text-fg-muted">Connecting to NOIR…</p>
          : tab === 'remote' ? <Remote /> : tab === 'saved' ? <Saved /> : tab === 'customize' ? <Customize /> : <Devices />}
      </main>

      {/* Sidebar: closed by default. */}
      <AnimatePresence>
        {menu && (
          <>
            <motion.div key="scrim" className="fixed inset-0 z-50 bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)} />
            <motion.nav key="drawer" className="fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col gap-1 px-3 pb-6 pt-[max(1rem,env(safe-area-inset-top))]"
              style={{ background: 'linear-gradient(180deg, #1b1428, #0e0b16)', boxShadow: '1rem 0 3rem -1rem rgba(0,0,0,0.8)' }}
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
              <div className="mb-5 flex items-center gap-2.5 px-2">
                <img src="/phone/icon.svg" alt="" className="size-8 rounded-lg" />
                <span className="flex-1 text-[1.1rem] font-medium tracking-[0.35em]">NOIR</span>
                <button type="button" aria-label="Close menu" onClick={() => { haptic(); setMenu(false); }} className="grid size-10 place-items-center rounded-xl text-fg-muted active:bg-white/10"><X className="size-5" /></button>
              </div>
              {tabs.map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => { haptic(); setTab(id); setMenu(false); }}
                  className={cx('flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-[1.02rem] font-medium', tab === id ? 'bg-primary/30 text-fg' : 'text-fg-muted active:bg-white/5')}>
                  <Icon className={cx('size-5', tab === id && 'text-highlight')} />{label}
                </button>
              ))}
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      <MiniPlayer />
    </div>
  );
}

/** Persistent now-playing bar at the bottom of every page. */
function MiniPlayer() {
  const music = useNoir((s) => s.state?.music);
  if (!music) return null;
  const t = music.track;
  const send = (type: 'music.previous' | 'music.playpause' | 'music.next') => { haptic(); void command({ type }, { silent: true }); };
  return (
    <div className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-[1.4rem] p-2.5 pr-3" style={{ background: 'rgba(30,23,43,0.92)' }}>
      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/25">
        {t?.artUrl ? <img src={t.artUrl} alt="" className="size-full object-cover" /> : <Play className="size-5 text-fg-muted" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.95rem] text-fg">{t?.title ?? 'Nothing playing'}</div>
        <div className="truncate text-[0.78rem] text-fg-muted">{t ? t.artist : music.providerLabel}</div>
      </div>
      <button type="button" aria-label="Previous" onClick={() => send('music.previous')} className="grid size-10 place-items-center rounded-full text-fg/85 active:bg-white/10"><SkipBack className="size-5" /></button>
      <button type="button" aria-label="Play/Pause" onClick={() => send('music.playpause')} className="grid size-11 place-items-center rounded-full bg-fg text-ink-900 active:scale-95">
        {music.isPlaying ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
      </button>
      <button type="button" aria-label="Next" onClick={() => send('music.next')} className="grid size-10 place-items-center rounded-full text-fg/85 active:bg-white/10"><SkipForward className="size-5" /></button>
    </div>
  );
}
