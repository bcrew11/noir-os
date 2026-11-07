import { Bookmark, CloudOff, Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { extractUrl, findApp, serviceForUrl, type SavedItem } from '@noir/core';
import { api, pushToast, useNoir } from '@noir/ui';
import { ShortcutSetup } from './ShortcutSetup.tsx';
import { Btn, Card, Section, haptic } from './ui.tsx';

/**
 * Watch later: paste links during the day; they appear on the TV's Saved screen and open in the
 * right app. Links saved while the TV can't be reached wait on this phone and sync on reconnect.
 */
const QUEUE_KEY = 'noir.savedQueue';
type Queued = { url: string; at: number };

const readQueue = (): Queued[] => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as Queued[]; } catch { return []; } };
const writeQueue = (q: Queued[]) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage unavailable */ } };

/** True when the failure means "TV not reachable right now" (worth retrying), not "bad link". */
const unreachable = (e: unknown) => {
  const m = (e as Error).message ?? '';
  return e instanceof TypeError || /\((502|503|504)\)|didn.t answer|starting|Failed to fetch|Load failed|NetworkError/i.test(m);
};

let flushing = false;
/** Send queued links to the TV. Safe to call any time; stops at the first unreachable error. */
export async function flushSavedQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const q of readQueue()) {
      try { await api('/api/saved', { body: { url: q.url } }); }
      catch (e) { if (unreachable(e)) break; }
      writeQueue(readQueue().filter((x) => x.url !== q.url)); // sent, or rejected for good
      sent++;
    }
  } finally { flushing = false; }
  return sent;
}

function serviceName(url: string) {
  const id = serviceForUrl(url);
  return id ? findApp(id)?.name ?? 'Link' : (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Link'; } })();
}

export function Saved() {
  const saved = useNoir((s) => s.state?.saved ?? []);
  const status = useNoir((s) => s.status);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [queue, setQueue] = useState(readQueue);

  const flush = useCallback(async () => {
    const n = await flushSavedQueue();
    setQueue(readQueue());
    if (n) pushToast({ tone: 'success', title: `Synced ${n} saved link${n === 1 ? '' : 's'} to the TV` });
  }, []);
  useEffect(() => { if (status === 'online') void flush(); }, [status, flush]);

  const save = async () => {
    const url = extractUrl(text);
    if (!url) { pushToast({ tone: 'error', title: 'Paste a link', body: 'Copy the link from the app’s Share button, then paste it here.' }); return; }
    haptic(12);
    setBusy('add');
    try {
      await api('/api/saved', { body: { url } });
      setText('');
      pushToast({ tone: 'success', title: 'Saved to watch later' });
    } catch (e) {
      if (unreachable(e)) {
        writeQueue([...readQueue().filter((q) => q.url !== url), { url, at: Date.now() }]);
        setQueue(readQueue());
        setText('');
        pushToast({ tone: 'info', title: 'Saved on this phone', body: 'It will sync to the TV when NOIR is reachable.' });
      } else pushToast({ tone: 'error', title: (e as Error).message });
    } finally { setBusy(null); }
  };

  const watch = async (item: SavedItem) => {
    haptic(12);
    setBusy(item.id);
    try {
      const r = await api<{ status: string; message: string }>(`/api/saved/${encodeURIComponent(item.id)}/open`, { body: {} });
      pushToast({ tone: r.status === 'verified' ? 'success' : r.status === 'failed' ? 'error' : 'warning', title: r.message });
    } catch (e) { pushToast({ tone: 'error', title: (e as Error).message }); }
    finally { setBusy(null); }
  };
  const remove = async (item: SavedItem) => {
    haptic();
    try { await api(`/api/saved/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); }
    catch (e) { pushToast({ tone: 'error', title: (e as Error).message }); }
  };

  return (
    <div>
      <Card className="space-y-3">
        <p className="text-[0.88rem] leading-relaxed text-fg-muted">
          Found something to watch later? In YouTube, Netflix, Disney+, Hulu, Max, Prime Video and others, tap <span className="text-fg">Share → Copy link</span>, then paste it here.
        </p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Paste a link"
          className="w-full resize-none rounded-2xl border border-line bg-white/[0.05] px-4 py-3 text-[1rem] text-fg outline-none placeholder:text-fg-dim focus:border-highlight/60" />
        <Btn variant="primary" className="w-full !py-3.5" disabled={!text.trim() || busy === 'add'} onClick={() => void save()}>
          {busy === 'add' ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}Save for later
        </Btn>
      </Card>

      <ShortcutSetup />

      {queue.length > 0 && (
        <Section title="Waiting to sync">
          <Card className="!p-2">
            {queue.map((q) => (
              <div key={q.url} className="flex items-center gap-3 px-2 py-2">
                <CloudOff className="size-5 shrink-0 text-amber-300/90" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.95rem]">{serviceName(q.url)}</div>
                  <div className="truncate text-[0.75rem] text-fg-muted">{q.url}</div>
                </div>
                <Btn variant="ghost" label="Discard" className="!p-2" onClick={() => { writeQueue(readQueue().filter((x) => x.url !== q.url)); setQueue(readQueue()); }}><Trash2 className="size-4.5" /></Btn>
              </div>
            ))}
            <Btn className="mt-1 w-full !py-2.5" onClick={() => void flush()}>Try syncing now</Btn>
          </Card>
        </Section>
      )}

      <Section title={`Saved on the TV${saved.length ? ` · ${saved.length}` : ''}`}>
        {saved.length === 0 ? (
          <Card className="flex items-center gap-3 text-[0.9rem] text-fg-muted"><Bookmark className="size-5 text-highlight" />Nothing saved yet.</Card>
        ) : (
          <div className="space-y-2.5">
            {saved.map((item) => (
              <Card key={item.id} className="flex items-center gap-3 !p-2.5">
                <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-xl bg-primary/20">
                  {item.image && <img src={item.image} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="absolute inset-0 size-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[0.92rem] leading-snug text-fg">{item.title}</div>
                  <div className="mt-0.5 truncate text-[0.75rem] text-fg-muted">{serviceName(item.url)}</div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Btn variant="primary" label={`Watch ${item.title} on TV`} className="!px-3 !py-2" disabled={busy === item.id} onClick={() => void watch(item)}>
                    {busy === item.id ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  </Btn>
                  <Btn variant="ghost" label={`Remove ${item.title}`} className="!px-3 !py-2" onClick={() => void remove(item)}><Trash2 className="size-4" /></Btn>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
