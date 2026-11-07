import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { formatLongDate, greeting, type AppDefinition } from '@noir/core';
import { useNoir, useNow } from '@noir/ui';
import { AddAppsCard, AppCard } from '../components/AppCard.tsx';
import { AppOptions } from '../components/AppOptions.tsx';
import { InputWidget, MusicWidget } from '../components/widgets.tsx';
import { SmartHomeWidget } from '../components/SmartHome.tsx';
import { Pill } from '../components/primitives.tsx';
import { launchApp, launchReadiness, useFavorites } from '../lib/apps.ts';
import { useScreenFocus } from '../hooks/useScreenFocus.ts';
import { useUI } from '../store/ui.ts';

export default function Home() {
  const now = useNow();
  const settings = useNoir((s) => s.state?.settings);
  const state = useNoir((s) => s.state);
  const favorites = useFavorites();
  const go = useUI((s) => s.go);
  const [options, setOptions] = useState<AppDefinition | null>(null);
  const defaultFocus = settings?.home.defaultFocus;
  useScreenFocus('home', favorites.some((f) => f.id === defaultFocus) ? `app-${defaultFocus}` : favorites[0] ? `app-${favorites[0].id}` : 'home-add');

  const showWidgets = settings && (settings.home.showMusicWidget || settings.home.showInputWidget || (settings.smartHome.showOnHome && settings.smartHome.devices.length > 0));

  return (
    <div className="flex h-full flex-col">
      {settings?.home.showGreeting !== false && (
        <section className="mt-20">
          <div className="text-[1.45rem] font-medium uppercase tracking-[0.2em] text-highlight/90">{formatLongDate(now)}</div>
          <h1 className="text-gradient mt-4 pb-2 text-[6.75rem] font-semibold leading-[1.02] tracking-[-0.035em]">{greeting(now)}</h1>
          <div className="mt-7 h-[0.3rem] w-[4.5rem] rounded-full bg-gradient-to-r from-primary to-highlight shadow-[0_0_1rem_var(--noir-accent)]" />
        </section>
      )}

      <section className={settings?.home.showGreeting === false ? 'mt-28' : 'mt-[8.5rem]'}>
        <div className="scroll-hidden -mx-8 -my-10 flex items-center gap-5 overflow-x-auto px-8 py-10"
          style={{
            // Keep the focused tile (and its glow) fully on screen when the row scrolls, and fade
            // tiles that are only partly visible instead of slicing them at the edge.
            scrollPaddingInline: '2.5rem',
            maskImage: 'linear-gradient(90deg, transparent 0, #000 2rem, #000 calc(100% - 2rem), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 2rem, #000 calc(100% - 2rem), transparent 100%)',
          }}>
          {favorites.map((app) => {
            const r = launchReadiness(state, app.id);
            return (
              <AppCard key={app.id} app={app} focusId={`app-${app.id}`} group="apps"
                onSelect={() => void launchApp(app)} onLongSelect={() => setOptions(app)}
                badge={r === 'needs-setup' ? <Pill tone="warn">Setup</Pill> : r === 'not-installed' ? <Pill tone="neutral">Get</Pill> : undefined} />
            );
          })}
          <AddAppsCard focusId="home-add" group="apps" onSelect={() => go('apps')} />
        </div>
      </section>

      {showWidgets && (
        <section className="mt-9 flex gap-8">
          {settings.home.showMusicWidget && <MusicWidget />}
          {settings.home.showInputWidget && <InputWidget />}
          <SmartHomeWidget />
        </section>
      )}
      <div className="flex-1" />

      <AnimatePresence>{options && <AppOptions app={options} onClose={() => setOptions(null)} />}</AnimatePresence>
    </div>
  );
}

export function HomeHint() {
  return (
    <motion.p className="text-center text-[0.95rem] text-fg-dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      Hold OK on an app for options
    </motion.p>
  );
}
