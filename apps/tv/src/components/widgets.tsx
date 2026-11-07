import { ChevronRight, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { command, useMusicProgress, useNoir } from '@noir/ui';
import { useFocusable } from '../focus/focus.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { useUI } from '../store/ui.ts';
import { INPUT_ICON } from './chrome.tsx';
import { widgetInput } from '../lib/apps.ts';
import { FButton, cx, focusLift } from './primitives.tsx';

export function Artwork({ url, className, iconClass }: { url?: string; className?: string; iconClass?: string }) {
  return (
    <div className={cx('relative grid shrink-0 place-items-center overflow-hidden', className)}
      style={{ background: 'linear-gradient(150deg, color-mix(in srgb, var(--noir-primary) 55%, #2a1f3d), #1b1428)' }}>
      {url ? <img src={url} alt="" className="absolute inset-0 size-full object-cover" draggable={false} /> : <Music2 className={cx('text-fg/90', iconClass ?? 'size-10')} strokeWidth={1.6} />}
    </div>
  );
}

export function MusicWidget() {
  const music = useNoir((s) => s.state?.music);
  const go = useUI((s) => s.go);
  const info = useFocusable<HTMLDivElement>('music-widget', { group: 'widgets', onSelect: () => go('music') });
  const progress = useMusicProgress(music);
  const level = useMotion();
  const track = music?.track;
  const pct = track ? (progress / track.durationMs) * 100 : 0;
  const disabled = !music?.canControl;
  return (
    // When the track info is focused, the whole card lights up (ring on the card's own edge). An inner
    // highlight box would overflow the card's rounded, clipped corners and look broken.
    <div className={cx('glass relative flex h-[8.75rem] flex-1 items-center gap-6 overflow-hidden rounded-[1.75rem] pl-6 pr-8 transition-[background,box-shadow] duration-200', info.focused && 'bg-white/10 focus-ring')}
      style={focusLift(info.focused, level, 1.02, 0)}>
      <div ref={info.ref} {...info.pointer} data-focused={info.focused || undefined}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-6">
        <Artwork url={track?.artUrl} className="size-[6.2rem] rounded-2xl" />
        <div className="min-w-0">
          <div className="truncate text-[1.75rem] font-medium text-fg">{track?.title ?? 'Music'}</div>
          <div className="truncate text-[1.25rem] text-fg-muted">
            {track ? `${track.artist}` : music?.note && music.provider !== 'demo' ? music.note : 'Nothing playing'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <FButton id="music-prev" group="widgets" variant="ghost" iconOnly icon={SkipBack} label="Previous" className="!h-14 !w-14 !px-0 rounded-full" disabled={disabled} onSelect={() => void command({ type: 'music.previous' }, { silent: true })} />
        <FButton id="music-play" group="widgets" variant="round" size="lg" label={music?.isPlaying ? 'Pause' : 'Play'} icon={music?.isPlaying ? Pause : Play} disabled={disabled}
          onSelect={() => void command({ type: 'music.playpause' }, { silent: true })} />
        <FButton id="music-next" group="widgets" variant="ghost" iconOnly icon={SkipForward} label="Next" className="!h-14 !w-14 !px-0 rounded-full" disabled={disabled} onSelect={() => void command({ type: 'music.next' }, { silent: true })} />
      </div>
      {track && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/5">
          <div className="h-full bg-gradient-to-r from-primary to-highlight transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function InputWidget() {
  const state = useNoir((s) => s.state);
  const inputId = widgetInput(state);
  const cfg = state?.settings.inputs[inputId];
  const sys = state?.tv.inputs.find((i) => i.id === inputId);
  const active = state?.tv.currentInput === inputId;
  const unsupported = state?.tv.capabilities.inputs.level === 'unsupported';
  const { ref, focused, pointer } = useFocusable<HTMLDivElement>('input-widget', {
    group: 'widgets',
    onSelect: () => void command({ type: 'tv.input', inputId }),
  });
  const level = useMotion();
  const Icon = INPUT_ICON[cfg?.icon ?? (/roku|stream|chromecast|fire/i.test(sys?.systemName ?? '') ? 'streaming' : 'console')];
  const label = inputId.replace('-', ' ');
  return (
    <div ref={ref} {...pointer} data-focused={focused || undefined} role="button" aria-label={`Switch to ${label}`} style={focusLift(focused, level, 1.03, 0)}
      className={cx('glass relative flex h-[8.75rem] flex-1 cursor-pointer items-center gap-6 rounded-[1.75rem] pl-8 pr-9 transition-[background,box-shadow]', focused && 'bg-white/10 focus-ring')}>
      <div className="grid size-[6.2rem] shrink-0 place-items-center rounded-2xl border border-line bg-white/[0.05]">
        <Icon className="size-11 text-fg/90" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 text-[1.75rem] font-medium text-fg">
          {label}
          {active && <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[0.9rem] font-medium text-emerald-200">On now</span>}
        </div>
        <div className="truncate text-[1.25rem] text-fg-muted">{unsupported ? 'Pair your TV to switch inputs' : cfg?.label ?? sys?.systemName ?? 'HDMI input'}</div>
      </div>
      <ChevronRight className={cx('size-8 transition-transform duration-200', focused ? 'translate-x-1 text-fg' : 'text-fg/80')} strokeWidth={1.6} />
    </div>
  );
}
