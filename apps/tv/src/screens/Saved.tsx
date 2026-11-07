import { AnimatePresence } from 'motion/react';
import { Bookmark, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { findApp, type SavedItem } from '@noir/core';
import { BrandMark, pushToast, useNoir } from '@noir/ui';
import { Dialog } from '../components/Dialog.tsx';
import { FRow, SectionTitle, cx, focusLift } from '../components/primitives.tsx';
import { useFocusable } from '../focus/focus.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { useScreenFocus } from '../hooks/useScreenFocus.ts';
import { openSaved, removeSaved } from '../lib/saved.ts';

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function open(item: SavedItem) {
  const r = openSaved(item);
  pushToast({ tone: r.status === 'verified' ? 'success' : r.status === 'failed' ? 'error' : 'warning', title: r.message });
}

function SavedCard({ item, onOptions }: { item: SavedItem; onOptions: () => void }) {
  const { ref, focused, pointer } = useFocusable<HTMLDivElement>(`saved-${item.id}`, { group: 'saved', onSelect: () => open(item), onLongSelect: onOptions, scrollAlign: 'start' });
  const level = useMotion();
  const customApps = useNoir((s) => s.state?.customApps);
  const logos = useNoir((s) => s.state?.logos);
  const app = item.appId ? findApp(item.appId, customApps) : undefined;
  const [broken, setBroken] = useState(false);
  const image = broken ? null : item.image;
  return (
    <div ref={ref} {...pointer} data-focused={focused || undefined} role="button" aria-label={item.title} style={focusLift(focused, level)}
      className={cx('glass cursor-pointer overflow-hidden rounded-[1.6rem] transition-[background,box-shadow]', focused && 'bg-white/10 focus-ring')}>
      <div className="relative grid aspect-video place-items-center overflow-hidden" style={{ background: app?.brand.background ?? 'linear-gradient(160deg,#241d33,#14101d)' }}>
        {image
          ? <img src={image} alt="" draggable={false} onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
          : app ? <BrandMark app={app} logoUrl={logos?.[app.id]} /> : <Bookmark className="size-12 text-fg/70" strokeWidth={1.5} />}
        {image && app && (
          <span className="absolute bottom-3 left-3 rounded-full bg-black/65 px-3 py-1 text-[0.95rem] font-medium text-white">{app.name}</span>
        )}
      </div>
      <div className="px-5 pb-5 pt-4">
        <div className="line-clamp-2 min-h-[3.3rem] text-[1.35rem] font-medium leading-tight text-fg">{item.title}</div>
        <div className="mt-1.5 text-[1.05rem] text-fg-muted">{app?.name ?? 'Web link'} · saved {ago(item.addedAt)}</div>
      </div>
    </div>
  );
}

/** Watch later: links saved from the phone remote. OK opens in the right app; hold OK for options. */
export default function Saved() {
  const saved = useNoir((s) => s.state?.saved ?? []);
  const standalone = useNoir((s) => s.state?.deployment === 'android-tv');
  const [options, setOptions] = useState<SavedItem | null>(null);
  useScreenFocus('saved', saved[0] ? `saved-${saved[0].id}` : undefined);

  return (
    <div className="scroll-hidden -mx-6 h-full overflow-y-auto px-6 pb-36 pt-8">
      <SectionTitle sub={saved.length ? 'Press OK to watch. Hold OK to remove.' : undefined}>Saved</SectionTitle>
      {saved.length === 0 ? (
        <div className="glass mt-4 max-w-[60rem] rounded-[2rem] p-10">
          <Bookmark className="size-12 text-highlight" strokeWidth={1.5} />
          <h2 className="mt-5 text-[2rem] font-semibold text-fg">Nothing saved yet</h2>
          <p className="mt-3 text-[1.3rem] leading-relaxed text-fg-muted">
            {standalone
              ? 'Found something to watch later? Copy its link (YouTube, Netflix, Disney+, Hulu, Max, Prime Video and more), open the NOIR phone remote → Saved, and paste it. It shows up here, and opens straight in the right app.'
              : 'Watch later works with the NOIR Google TV launcher.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-7">
          {saved.map((item) => <SavedCard key={item.id} item={item} onOptions={() => setOptions(item)} />)}
        </div>
      )}
      <AnimatePresence>
        {options && (
          <Dialog key="saved-opt" title={options.title} subtitle={options.url} onClose={() => setOptions(null)}>
            <div className="flex flex-col gap-2.5">
              <FRow id="sv-open" icon={Play} title="Watch now" autoFocus onSelect={() => { const it = options; setOptions(null); open(it); }} />
              <FRow id="sv-remove" icon={Trash2} title="Remove from Saved" onSelect={() => { removeSaved(options.id); setOptions(null); pushToast({ tone: 'info', title: 'Removed from Saved' }); }} />
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}
