import { AnimatePresence } from 'motion/react';
import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, searchApps, type AppCategory, type AppDefinition } from '@noir/core';
import { useNoir } from '@noir/ui';
import { AppCard } from '../components/AppCard.tsx';
import { AppOptions } from '../components/AppOptions.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { Keyboard } from '../components/Keyboard.tsx';
import { FButton, Pill, SectionTitle, cx } from '../components/primitives.tsx';
import { useFocusable } from '../focus/focus.ts';
import { useScreenFocus } from '../hooks/useScreenFocus.ts';
import { READINESS_LABEL, allApps, launchReadiness } from '../lib/apps.ts';

type Filter = 'all' | 'home' | AppCategory;

function Chip({ id, label, active, onSelect }: { id: string; label: string; active: boolean; onSelect: () => void }) {
  const { ref, focused, pointer } = useFocusable<HTMLButtonElement>(id, { group: 'chips', onSelect });
  return (
    <button ref={ref} {...pointer} data-focused={focused || undefined} tabIndex={-1}
      className={cx('h-12 shrink-0 rounded-full px-5 text-[1.1rem] font-medium transition-[background,color,box-shadow] duration-200',
        active ? 'bg-primary/35 text-fg border border-highlight/40' : 'border border-line bg-white/[0.04] text-fg-muted',
        focused && 'focus-ring text-fg bg-white/12')}>
      {label}
    </button>
  );
}

export default function Apps() {
  const state = useNoir((s) => s.state);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [options, setOptions] = useState<AppDefinition | null>(null);
  useScreenFocus('apps', 'chip-all');

  const favorites = useMemo(() => state?.settings.home.favorites ?? [], [state?.settings.home.favorites]);
  const apps = useMemo(() => {
    let list = searchApps(query, allApps(state));
    if (filter === 'home') list = favorites.map((id) => list.find((a) => a.id === id)).filter((a): a is AppDefinition => !!a);
    else if (filter !== 'all') list = list.filter((a) => a.category === filter);
    return list;
  }, [state, query, filter, favorites]);

  const filters: Array<[Filter, string]> = [['all', 'All apps'], ['home', 'On Home'], ...(Object.entries(CATEGORY_LABELS) as Array<[AppCategory, string]>)];

  return (
    <div className="flex h-full flex-col pt-10">
      <div className="flex items-end justify-between">
        <SectionTitle sub="Shortcuts to the apps on your TV. Adding an app here doesn’t install anything.">App Library</SectionTitle>
        <FButton id="apps-search" icon={Search} label={query ? `“${query}”` : 'Search'} group="chips" onSelect={() => setSearching(true)} className="mb-6" />
      </div>
      <div className="scroll-hidden -mx-4 flex gap-3 overflow-x-auto px-4 py-3">
        {filters.map(([f, label]) => <Chip key={f} id={`chip-${f}`} label={label} active={filter === f} onSelect={() => setFilter(f)} />)}
      </div>
      <div className="scroll-hidden -mx-6 mt-4 min-h-0 flex-1 overflow-y-auto px-6 pb-40 pt-4" style={{ maskImage: 'linear-gradient(180deg, transparent 0, #000 1.5rem, #000 calc(100% - 9rem), transparent calc(100% - 5rem))', WebkitMaskImage: 'linear-gradient(180deg, transparent 0, #000 1.5rem, #000 calc(100% - 9rem), transparent calc(100% - 5rem))' }}>
        {apps.length === 0 ? (
          <p className="mt-10 text-[1.4rem] text-fg-muted">No apps match. Custom shortcuts can be added from the phone companion.</p>
        ) : (
          <div className="grid grid-cols-5 gap-x-6 gap-y-9">
            {apps.map((app) => {
              const r = launchReadiness(state, app.id);
              const onHome = favorites.includes(app.id);
              return (
                <div key={app.id} className="flex flex-col gap-3">
                  <AppCard app={app} size="grid" focusId={`lib-${app.id}`} group="library" onSelect={() => setOptions(app)}
                    badge={onHome ? <span className="grid size-8 place-items-center rounded-full bg-highlight/90 text-ink-900"><Check className="size-5" strokeWidth={2.6} /></span> : undefined} />
                  <div className="flex items-center justify-between px-1">
                    <span className="truncate text-[1.15rem] text-fg/90">{app.name}</span>
                    <Pill tone={r === 'verified' || r === 'ready' || r === 'installed' ? 'ok' : r === 'demo' ? 'demo' : 'neutral'}>{READINESS_LABEL[r]}</Pill>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {options && <AppOptions key="opts" app={options} onClose={() => setOptions(null)} />}
        {searching && (
          <Dialog key="search" title="Search apps" onClose={() => setSearching(false)} width="w-[40rem]">
            <div className="mb-5 flex h-16 items-center gap-3 rounded-2xl border border-line-strong bg-white/[0.05] px-5 text-[1.6rem]">
              <Search className="size-6 text-fg-muted" />
              <span className={query ? 'text-fg' : 'text-fg-dim'}>{query || 'Type with the remote'}</span>
              <span className="h-8 w-0.5 animate-pulse bg-highlight" />
            </div>
            <Keyboard value={query} onChange={setQuery} idPrefix="search" />
            <p className="mt-5 text-[1rem] text-fg-muted">{apps.length} result{apps.length === 1 ? '' : 's'} · press Back when done</p>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}
