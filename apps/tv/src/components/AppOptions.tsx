import { ArrowLeft, ArrowRight, Crosshair, ExternalLink, GraduationCap, Minus, Play, Plus, Trash2 } from 'lucide-react';
import type { AppDefinition } from '@noir/core';
import { api, patchSettings, pushToast, useNoir } from '@noir/ui';
import { READINESS_LABEL, launchApp, launchReadiness } from '../lib/apps.ts';
import { Dialog } from './Dialog.tsx';
import { FRow, Pill } from './primitives.tsx';

export function AppOptions({ app, onClose }: { app: AppDefinition; onClose: () => void }) {
  const state = useNoir((s) => s.state);
  if (!state) return null;
  const favs = state.settings.home.favorites;
  const idx = favs.indexOf(app.id);
  const onHome = idx >= 0;
  const readiness = launchReadiness(state, app.id);
  const isVizio = state.tv.adapter === 'vizio';
  const launch = state.launch[app.id];

  const move = (delta: number) => {
    const next = [...favs];
    const j = idx + delta;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    void patchSettings({ home: { favorites: next } });
  };

  const explain =
    readiness === 'demo' ? 'Demo mode: opening this app is simulated. Pair your TV to launch it for real.'
    : readiness === 'no-tv' ? 'No television is paired, so NOIR can’t open this app yet.'
    : readiness === 'needs-setup' ? `Open ${app.name} once with your TV remote, then choose “Learn from TV” so NOIR can open it next time.`
    : launch?.source === 'catalog' ? 'Using VIZIO’s published app directory. If it doesn’t open, use “Learn from TV”.'
    : 'NOIR knows how to open this app on your TV.';

  return (
    <Dialog title={app.name} subtitle={app.description} onClose={onClose}>
      <div className="mb-5 flex items-start gap-3">
        <Pill tone={readiness === 'verified' || readiness === 'ready' ? 'ok' : readiness === 'demo' ? 'demo' : 'warn'}>{READINESS_LABEL[readiness]}</Pill>
        <p className="flex-1 text-[1.05rem] leading-snug text-fg-muted">{explain}</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <FRow id="opt-open" icon={Play} title="Open" autoFocus onSelect={() => { onClose(); void launchApp(app); }} />
        {onHome ? (
          <>
            <FRow id="opt-left" icon={ArrowLeft} title="Move earlier" disabled={idx === 0} onSelect={() => move(-1)} value={`${idx + 1} of ${favs.length}`} />
            <FRow id="opt-right" icon={ArrowRight} title="Move later" disabled={idx === favs.length - 1} onSelect={() => move(1)} />
            <FRow id="opt-default" icon={Crosshair} title="Focus first when NOIR opens" value={state.settings.home.defaultFocus === app.id ? 'On' : ''}
              onSelect={() => void patchSettings({ home: { defaultFocus: app.id } })} />
            <FRow id="opt-remove" icon={Minus} title="Remove from Home" onSelect={() => { void patchSettings({ home: { favorites: favs.filter((f) => f !== app.id) } }); onClose(); }} />
          </>
        ) : (
          <FRow id="opt-add" icon={Plus} title="Add to Home" hint={favs.length >= 12 ? 'Home holds up to 12 apps.' : undefined} disabled={favs.length >= 12}
            onSelect={() => { void patchSettings({ home: { favorites: [...favs, app.id] } }); pushToast({ tone: 'success', title: `${app.name} added to Home` }); }} />
        )}
        {isVizio && (
          <FRow id="opt-learn" icon={GraduationCap} title="Learn from TV" hint={`With ${app.name} open on the TV, NOIR records how to launch it.`}
            onSelect={async () => {
              try {
                const r = await api<{ status: string; message: string }>(`/api/apps/${app.id}/learn`, { method: 'POST', body: {} });
                pushToast({ tone: r.status === 'verified' ? 'success' : 'warning', title: r.message });
              } catch (e) { pushToast({ tone: 'error', title: (e as Error).message }); }
            }} />
        )}
        {isVizio && launch && (
          <FRow id="opt-forget" icon={Trash2} title="Forget launch setup" onSelect={() => void api(`/api/apps/${app.id}/launch`, { method: 'DELETE' })} />
        )}
        {state.deployment === 'browser' && app.webUrl && (
          <FRow id="opt-web" icon={ExternalLink} title="Open website in this browser" hint="Opens the service’s website — not the TV app."
            onSelect={() => window.open(app.webUrl, '_blank', 'noopener')} />
        )}
      </div>
    </Dialog>
  );
}
