import { AnimatePresence, motion } from 'motion/react';
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { applyAccent, command, connect, onLaunchOnDisplay, useNoir } from '@noir/ui';
import { allApps, launchApp } from './lib/apps.ts';
import { Background } from './components/Background.tsx';
import { Header, NavBar, NoirMark, Toasts } from './components/chrome.tsx';
import { PhonePairingOverlay } from './components/PhonePairingOverlay.tsx';
import { RemoteSimulator } from './components/RemoteSimulator.tsx';
import { FpsMeter } from './components/FpsMeter.tsx';
import { BootIntro } from './components/BootIntro.tsx';
import { configureSound } from './lib/sound.ts';
import { installInput, setInputExtras } from './focus/input.ts';
import { screenTransition, useMotion } from './hooks/useMotion.ts';
import { usePerformanceProbe } from './hooks/usePerformance.ts';
import { useIdle, useNowPlayingIdle } from './hooks/useIdle.ts';
import { NowPlayingView } from './components/NowPlaying.tsx';
import Home from './screens/Home.tsx';
import { useUI } from './store/ui.ts';

// Non-essential screens are code-split so the home screen paints fast on weak TV hardware.
const Apps = lazy(() => import('./screens/Apps.tsx'));
const Music = lazy(() => import('./screens/Music.tsx'));
const Inputs = lazy(() => import('./screens/Inputs.tsx'));
const Ambient = lazy(() => import('./screens/Ambient.tsx'));
const SettingsScreen = lazy(() => import('./screens/Settings.tsx'));

export function App() {
  const status = useNoir((s) => s.status);
  const state = useNoir((s) => s.state);
  const screen = useUI((s) => s.screen);
  const sim = useUI((s) => s.remoteSimulator);
  const motionLevel = useMotion();
  const lowPerf = usePerformanceProbe(state?.settings.appearance.performance ?? 'auto');
  useIdle();
  // Boot intro: once per launch (page load), never when animation is off.
  const [booting, setBooting] = useState(() => !new URLSearchParams(location.search).has('noboot'));
  const endBoot = useCallback(() => setBooting(false), []);
  const [nowPlaying, exitNowPlaying] = useNowPlayingIdle();

  useEffect(() => {
    connect('tv');
    const off = installInput();
    setInputExtras({ onPlayPause: () => void command({ type: 'music.playpause' }, { silent: true }) });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || (e.key === 'r' && e.shiftKey)) useUI.setState((s) => ({ remoteSimulator: !s.remoteSimulator }));
    };
    window.addEventListener('keydown', onKey);
    const offLaunch = onLaunchOnDisplay((appId) => {
      const app = allApps(useNoir.getState().state).find((a) => a.id === appId);
      if (app) void launchApp(app);
    });
    return () => { off(); offLaunch(); window.removeEventListener('keydown', onKey); };
  }, []);

  const snd = state?.settings.sound;
  useEffect(() => { if (snd) configureSound(snd.style, snd.volume); }, [snd]);

  const a = state?.settings.appearance;
  useEffect(() => {
    if (!a) return;
    applyAccent(a.accent);
    const root = document.documentElement;
    root.dataset.motion = motionLevel;
    root.classList.toggle('no-glass', !a.glass || lowPerf);
    root.classList.toggle('low-perf', lowPerf);
  }, [a, motionLevel, lowPerf]);

  if (!state) return <Splash status={status} />;

  const safe = state.settings.appearance.safeArea;
  const ambient = screen === 'ambient';
  return (
    <div className="absolute inset-0 overflow-hidden bg-ink-900">
      <Background variant={state.settings.appearance.background} />
      {/* 1920×1080 canvas, centered and letterboxed for non-16:9 displays */}
      <div className="absolute left-1/2 top-1/2 h-[67.5rem] w-[120rem] -translate-x-1/2 -translate-y-1/2">
        <div className="relative flex h-full flex-col" style={{ padding: `calc(3.25rem + ${safe}vh) calc(5.5rem + ${safe}vw) calc(2.5rem + ${safe}vh)` }}>
          <Header />
          <main className="relative min-h-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              {!ambient && (
                <motion.div key={screen} className="absolute inset-0" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={screenTransition(motionLevel)}>
                  <Suspense fallback={null}>
                    {screen === 'home' && <Home />}
                    {screen === 'apps' && <Apps />}
                    {screen === 'music' && <Music />}
                    {screen === 'inputs' && <Inputs />}
                    {screen === 'settings' && <SettingsScreen />}
                  </Suspense>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
          <div className="pointer-events-none absolute inset-x-0" style={{ bottom: `calc(2.5rem + ${safe}vh)` }}>
            <div className="pointer-events-auto"><NavBar /></div>
          </div>
        </div>
        <Toasts />
      </div>
      <AnimatePresence>
        {nowPlaying && <NowPlayingView key="now-playing" onExit={exitNowPlaying} />}
      </AnimatePresence>
      <AnimatePresence>
        {ambient && (
          <Suspense fallback={null}><Ambient key="ambient" /></Suspense>
        )}
      </AnimatePresence>
      <PhonePairingOverlay />
      {sim && <RemoteSimulator />}
      {state.settings.appearance.showFps && <FpsMeter />}
      {booting && motionLevel !== 'off' && <BootIntro level={motionLevel} onDone={endBoot} />}
      {status !== 'online' && <ConnectionBanner status={status} />}
    </div>
  );
}

function Splash({ status }: { status: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 2500); return () => clearTimeout(t); }, []);
  return (
    <div className="absolute inset-0 grid place-items-center bg-ink-900">
      <Background variant="dunes" dim={0.35} />
      <div className="relative flex flex-col items-center gap-6">
        <div className="flex items-center gap-4"><NoirMark className="h-12 w-9" /><span className="text-[2.6rem] font-medium tracking-[0.45em]">NOIR</span></div>
        {slow && (
          <p className="max-w-[40rem] text-center text-[1.2rem] text-fg-muted">
            {status === 'unauthorized' ? 'This screen isn’t paired with the NOIR server.' : 'Connecting to the NOIR server… Make sure it’s running (npm run dev).'}
          </p>
        )}
      </div>
    </div>
  );
}

function ConnectionBanner({ status }: { status: string }) {
  return (
    <div className="absolute left-1/2 top-6 z-50 -translate-x-1/2 rounded-full border border-amber-300/30 bg-amber-400/10 px-6 py-2.5 text-[1.05rem] text-amber-100 backdrop-blur">
      {status === 'connecting' ? 'Reconnecting to NOIR server…' : status === 'unauthorized' ? 'Not authorized with the NOIR server' : 'NOIR server offline — showing last known state'}
    </div>
  );
}
