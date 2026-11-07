import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CornerUpLeft, Home, Pause, Play, Power, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useRef, useState } from 'react';
import type { NavKey, RemoteKey } from '@noir/core';
import { BrandMark, command, send, useNoir } from '@noir/ui';
import { Btn, Section, cx, haptic } from './ui.tsx';
import { allApps } from './apps.ts';
import { Lights } from './Lights.tsx';

type Target = 'noir' | 'tv';

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
      className={cx('absolute grid place-items-center text-fg/85 transition active:scale-90 active:text-highlight', className)}>{children}</button>
  );

  const music = state?.music;
  const favorites = (state?.settings.home.favorites ?? []).map((id) => allApps(state).find((a) => a.id === id)).filter((a) => !!a);
  const inputs = state ? (state.tv.inputs.length ? state.tv.inputs : Object.keys(state.settings.inputs).map((id) => ({ id, systemName: id }))) : [];

  return (
    <div>
      {onDevice ? (
        <p className="mb-5 px-2 text-center text-[0.8rem] leading-relaxed text-fg-muted">Controls NOIR on your TV. Inside Netflix, YouTube and other apps, use the remote in the Google TV app.</p>
      ) : (
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

      {/* D-pad */}
      <div className="relative mx-auto aspect-square w-[min(78vw,20rem)] rounded-full border border-line"
        style={{ background: 'radial-gradient(circle at 50% 35%, rgba(70,52,100,0.55), rgba(24,19,34,0.9) 70%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1.5rem 3rem -1rem rgba(0,0,0,0.8)' }}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <PadBtn k="up" className="left-1/2 top-2 h-[28%] w-[34%] -translate-x-1/2"><ChevronUp className="size-9" /></PadBtn>
        <PadBtn k="down" className="bottom-2 left-1/2 h-[28%] w-[34%] -translate-x-1/2"><ChevronDown className="size-9" /></PadBtn>
        <PadBtn k="left" className="left-2 top-1/2 h-[34%] w-[28%] -translate-y-1/2"><ChevronLeft className="size-9" /></PadBtn>
        <PadBtn k="right" className="right-2 top-1/2 h-[34%] w-[28%] -translate-y-1/2"><ChevronRight className="size-9" /></PadBtn>
        <button type="button" aria-label="OK" onClick={() => press('ok')}
          className="absolute left-1/2 top-1/2 grid size-[38%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-highlight/40 text-[1.15rem] font-semibold transition active:scale-90"
          style={{ background: 'radial-gradient(circle at 50% 30%, var(--noir-accent), var(--noir-primary) 70%)', boxShadow: '0 0 2rem -0.4rem var(--noir-accent)' }}>OK</button>
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
            <button key={a.id} type="button" onClick={() => { haptic(); void command({ type: 'app.launch', appId: a.id }); }}
              className="grid h-16 place-items-center overflow-hidden rounded-2xl border border-line text-[6px] transition active:scale-95" style={{ background: a.brand.background }}>
              <BrandMark app={a} logoUrl={state?.logos[a.id]} scale={0.42} />
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

      {music?.track && (
        <Section title="Now playing">
          <div className="glass flex items-center gap-3 rounded-3xl p-3">
            {music.track.artUrl && <img src={music.track.artUrl} alt="" className="size-14 rounded-xl object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.98rem] text-fg">{music.track.title}</div>
              <div className="truncate text-[0.82rem] text-fg-muted">{music.track.artist}</div>
            </div>
            <Btn variant="ghost" label="Previous" onClick={() => void command({ type: 'music.previous' }, { silent: true })} className="!px-2"><SkipBack className="size-5" /></Btn>
            <Btn variant="ghost" label="Play/Pause" onClick={() => void command({ type: 'music.playpause' }, { silent: true })} className="!px-2">{music.isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}</Btn>
            <Btn variant="ghost" label="Next" onClick={() => void command({ type: 'music.next' }, { silent: true })} className="!px-2"><SkipForward className="size-5" /></Btn>
          </div>
        </Section>
      )}
    </div>
  );
}
