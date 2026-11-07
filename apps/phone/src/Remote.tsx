import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CornerUpLeft, Home, Pause, Play, Power, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useRef, useState } from 'react';
import type { NavKey, RemoteKey } from '@noir/core';
import { BrandMark, command, send, useNoir } from '@noir/ui';
import { Btn, Section, cx, haptic } from './ui.tsx';
import { allApps } from './apps.ts';
import { Lights } from './Lights.tsx';

type Target = 'noir' | 'tv';

const PAD = {
  background: 'linear-gradient(180deg, rgba(62,47,88,0.9), rgba(28,22,40,0.95))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1.2rem 2.4rem -1rem rgba(0,0,0,0.8)',
};

/**
 * Two remote targets:
 * - NOIR: drives the NOIR dashboard's focus engine.
 * - TV: sends SmartCast key presses to the television itself (useful inside Netflix etc.).
 */
export function Remote() {
  const state = useNoir((s) => s.state);
  const [target, setTarget] = useState<Target>('noir');
  const tvKeys = state?.tv.capabilities.remoteKeys.level !== 'unsupported';
  // NOIR as the Google TV launcher: no TV link, the remote drives NOIR itself.
  const onDevice = state?.deployment === 'android-tv' && state.tv.adapter === 'none';

  const press = (k: NavKey) => {
    haptic(10);
    if (target === 'noir') {
      send({ type: 'nav', key: k });
      return;
    }
    const map: Partial<Record<NavKey, RemoteKey>> = { up: 'up', down: 'down', left: 'left', right: 'right', ok: 'ok', back: 'back', home: 'home', playpause: 'playpause' };
    const key = map[k];
    if (key) void command({ type: 'tv.key', key }, { silent: true });
  };

  // Swipe on the pad: quick directional gestures.
  const start = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]!; start.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = start.current; start.current = null;
    if (!s) return;
    const t = e.changedTouches[0]!;
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };

  const PadBtn = ({ k, children, className }: { k: NavKey; children: React.ReactNode; className: string }) => (
    <button type="button" aria-label={k} onClick={() => press(k)}
      className={cx('absolute grid place-items-center text-fg/85 transition active:bg-white/10 active:text-highlight', className)}>{children}</button>
  );

  const favorites = (state?.settings.home.favorites ?? []).map((id) => allApps(state).find((a) => a.id === id)).filter((a) => !!a);
  const inputs = state ? (state.tv.inputs.length ? state.tv.inputs : Object.keys(state.settings.inputs).map((id) => ({ id, systemName: id }))) : [];

  return (
    <div>
      {onDevice ? null : (
      <div className="mb-5 flex rounded-full bg-white/[0.05] p-1">
        {(['noir', 'tv'] as const).map((t) => (
          <button key={t} type="button" disabled={t === 'tv' && !tvKeys} onClick={() => { haptic(); setTarget(t); }}
            className={cx('flex-1 rounded-full py-2.5 text-[0.9rem] font-medium transition disabled:opacity-35', target === t ? 'bg-primary/40 text-fg shadow-[0_0_1rem_-0.3rem_var(--noir-accent)]' : 'text-fg-muted')}>
            {t === 'noir' ? 'Control NOIR' : 'Control TV apps'}
          </button>
        ))}
      </div>
      )}
      {target === 'tv' && <p className="-mt-2 mb-4 px-2 text-center text-[0.8rem] text-fg-muted">Keys go straight to the TV over Wi‑Fi — use this inside Netflix, YouTube TV, etc.{state?.tv.adapter === 'mock' ? ' (Demo: simulated.)' : ''}</p>}

      {/* D-pad: a classic cross. Swipes on it work too. */}
      <div className="relative mx-auto mt-2 aspect-square w-[min(80vw,19rem)]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div aria-hidden className="absolute inset-x-0 top-1/3 h-1/3 rounded-[1.4rem] border border-line" style={PAD} />
        <div aria-hidden className="absolute inset-y-0 left-1/3 w-1/3 rounded-[1.4rem] border border-line" style={PAD} />
        <div aria-hidden className="absolute left-1/3 top-1/3 size-1/3" style={{ background: PAD.background }} />
        <PadBtn k="up" className="left-1/3 top-0 h-1/3 w-1/3 rounded-t-[1.4rem]"><ChevronUp className="size-9" /></PadBtn>
        <PadBtn k="down" className="bottom-0 left-1/3 h-1/3 w-1/3 rounded-b-[1.4rem]"><ChevronDown className="size-9" /></PadBtn>
        <PadBtn k="left" className="left-0 top-1/3 h-1/3 w-1/3 rounded-l-[1.4rem]"><ChevronLeft className="size-9" /></PadBtn>
        <PadBtn k="right" className="right-0 top-1/3 h-1/3 w-1/3 rounded-r-[1.4rem]"><ChevronRight className="size-9" /></PadBtn>
        <button type="button" aria-label="OK" onClick={() => press('ok')}
          className="absolute left-1/2 top-1/2 grid size-[26%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-highlight/40 text-[1.05rem] font-semibold transition active:scale-90"
          style={{ background: 'radial-gradient(circle at 50% 30%, var(--noir-accent), var(--noir-primary) 70%)', boxShadow: '0 0 1.6rem -0.4rem var(--noir-accent)' }}>OK</button>
      </div>

      <div className="mx-auto mt-6 grid max-w-[22rem] grid-cols-3 gap-3">
        <Btn label="Back" onClick={() => press('back')}><CornerUpLeft className="size-5" />Back</Btn>
        <Btn label="Home" onClick={() => press('home')}><Home className="size-5" />Home</Btn>
        <Btn label="Play/Pause" onClick={() => target === 'noir' ? void command({ type: 'music.playpause' }, { silent: true }) : press('playpause')}><Play className="size-5" /><Pause className="-ml-1.5 size-5" /></Btn>
      </div>

      {!onDevice && <div className="mx-auto mt-3 grid max-w-[22rem] grid-cols-4 gap-3">
        <Btn label="Volume down" onClick={() => void command({ type: 'tv.volumeStep', delta: -2 }, { silent: true })}><Volume1 className="size-5" /></Btn>
        <Btn label="Volume up" onClick={() => void command({ type: 'tv.volumeStep', delta: 2 }, { silent: true })}><Volume2 className="size-5" /></Btn>
        <Btn label="Mute" onClick={() => void command({ type: 'tv.mute' })}><VolumeX className={cx('size-5', state?.tv.audio.muted && 'text-highlight')} /></Btn>
        <Btn label="Power" variant="danger" onClick={() => void command({ type: 'tv.power', on: state?.tv.power !== 'on' })}><Power className="size-5" /></Btn>
      </div>}
      {state?.tv.audio.volume != null && <p className="mt-2 text-center text-[0.8rem] tabular-nums text-fg-muted">Volume {state.tv.audio.volume}{state.tv.audio.muted ? ' · muted' : ''}</p>}

      <Lights />

      <Section title="Apps">
        <div className="grid grid-cols-3 gap-2.5">
          {favorites.map((a) => (
            <button key={a.id} type="button" aria-label={a.name} onClick={() => { haptic(); void command({ type: 'app.launch', appId: a.id }); }}
              className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl border border-line transition active:scale-95" style={{ background: a.brand.background }}>
              {/* On the Google TV stick, logos are the apps' own TV banners: full-tile artwork. */}
              {state?.logos[a.id]
                ? <img src={state.logos[a.id]} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
                : <BrandMark app={a} scale={0.42} />}
            </button>
          ))}
        </div>
      </Section>

      {!onDevice && <Section title="Inputs">
        <div className="flex flex-wrap gap-2">
          {inputs.filter((i) => !state?.settings.inputs[i.id]?.hidden).map((i) => (
            <Btn key={i.id} variant={state?.tv.currentInput === i.id ? 'primary' : 'glass'} onClick={() => void command({ type: 'tv.input', inputId: i.id })} className="!py-2.5">
              {state?.settings.inputs[i.id]?.label ?? i.systemName}<span className="text-[0.75rem] opacity-60">{i.id.replace('-', ' ')}</span>
            </Btn>
          ))}
          {state?.settings.system.noirInputId && <Btn variant="ghost" onClick={() => void command({ type: 'tv.returnToNoir' })}>Return to NOIR</Btn>}
        </div>
      </Section>}

    </div>
  );
}
