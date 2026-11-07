import { motion } from 'motion/react';
import { Pause, Play, SkipBack, SkipForward, Speaker } from 'lucide-react';
import { formatDuration, type PlaybackDevice } from '@noir/core';
import { command, useMusicProgress, useNoir } from '@noir/ui';
import { FButton, Pill, cx } from '../components/primitives.tsx';
import { Artwork } from '../components/widgets.tsx';
import { useFocusable } from '../focus/focus.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { useScreenFocus } from '../hooks/useScreenFocus.ts';
import { AppCard } from '../components/AppCard.tsx';
import { allApps, launchApp, launchReadiness } from '../lib/apps.ts';
import { useUI } from '../store/ui.ts';

function DeviceChip({ device }: { device: PlaybackDevice }) {
  const { ref, focused, pointer } = useFocusable<HTMLButtonElement>(`dev-${device.id}`, { group: 'devices', onSelect: () => void command({ type: 'music.transfer', deviceId: device.id }) });
  return (
    <button ref={ref} {...pointer} data-focused={focused || undefined} tabIndex={-1} className={cx('flex h-12 items-center gap-2.5 rounded-full border px-5 text-[1.05rem] transition',
      device.active ? 'border-highlight/40 bg-primary/25 text-fg' : 'border-line bg-white/[0.04] text-fg-muted', focused && 'focus-ring bg-white/12 text-fg')}>
      <Speaker className="size-5" strokeWidth={1.7} />{device.name}
    </button>
  );
}

export default function Music() {
  const music = useNoir((s) => s.state?.music);
  const state = useNoir((s) => s.state);
  // Music apps you can open from here: installed music apps first, then Spotify (to get it) if missing.
  const musicApps = (() => {
    const all = allApps(state);
    const isMusic = (a: (typeof all)[number]) => a.category === 'music' || /music|spotify|pandora|sirius|tidal|deezer|soundcloud|iheart|tunein|audible|podcast/i.test(a.name);
    const ready = all.filter((a) => isMusic(a) && ['installed', 'ready', 'verified', 'demo'].includes(launchReadiness(state, a.id)));
    const spotify = all.find((a) => a.id === 'spotify');
    return spotify && !ready.some((a) => a.id === 'spotify') ? [...ready, spotify] : ready;
  })();
  const settings = useNoir((s) => s.state?.settings);
  const go = useUI((s) => s.go);
  const progress = useMusicProgress(music);
  const level = useMotion();
  useScreenFocus('music', 'mus-play');
  if (!music) return null;
  const track = music.track;
  const pct = track ? Math.min(100, (progress / track.durationMs) * 100) : 0;
  const disabled = !music.canControl;

  return (
    <div className="relative flex h-full items-center gap-20 pb-28">
      {/* immersive color wash from the artwork */}
      {track?.artUrl && (
        <div aria-hidden data-heavy-fx className="pointer-events-none absolute -left-40 top-0 h-[44rem] w-[60rem] opacity-50" style={{ backgroundImage: `url("${track.artUrl}")`, backgroundSize: 'cover', filter: 'blur(90px) saturate(140%)' }} />
      )}
      <motion.div key={track?.id ?? 'none'} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: level === 'off' ? 0 : 0.4 }}
        className="relative shrink-0">
        <Artwork url={settings?.music.showArtwork === false ? undefined : track?.artUrl} className="size-[30rem] rounded-[2.25rem] shadow-[0_3rem_6rem_-2rem_rgba(0,0,0,0.9)]" iconClass="size-28" />
        {music.isPlaying && <div aria-hidden className="absolute -inset-3 -z-10 rounded-[2.75rem] opacity-70 blur-2xl" style={{ background: 'var(--noir-accent)' }} />}
      </motion.div>

      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <Pill tone={music.provider === 'demo' ? 'demo' : music.connected ? 'accent' : 'warn'}>{music.providerLabel}</Pill>
          {music.isPlaying && <Pill tone="ok">Playing</Pill>}
        </div>
        <h1 className="mt-6 truncate text-[4.25rem] font-semibold leading-tight tracking-[-0.025em] text-fg">{track?.title ?? 'Nothing playing'}</h1>
        <p className="mt-1 truncate text-[1.9rem] text-fg/75">{track ? `${track.artist}${track.album ? ` — ${track.album}` : ''}` : music.note ?? 'Start music on a connected device.'}</p>
        {track && music.note && <p className="mt-3 text-[1.05rem] text-fg-muted">{music.note}</p>}

        <div className="mt-10 max-w-[52rem]">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-highlight shadow-[0_0_1rem_var(--noir-accent)] transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2.5 flex justify-between text-[1.05rem] tabular-nums text-fg-muted">
            <span>{formatDuration(progress)}</span><span>{track ? formatDuration(track.durationMs) : '0:00'}</span>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-6">
          <FButton id="mus-prev" variant="round" icon={SkipBack} label="Previous" disabled={disabled} onSelect={() => void command({ type: 'music.previous' }, { silent: true })} />
          <FButton id="mus-play" variant="round" size="lg" icon={music.isPlaying ? Pause : Play} label={music.isPlaying ? 'Pause' : 'Play'} disabled={disabled}
            className="!h-22 !border-highlight/50 !bg-primary/40" onSelect={() => void command({ type: 'music.playpause' }, { silent: true })} />
          <FButton id="mus-next" variant="round" icon={SkipForward} label="Next" disabled={disabled} onSelect={() => void command({ type: 'music.next' }, { silent: true })} />
          {!music.connected && music.provider === 'spotify' && (
            <FButton id="mus-setup" label="Connect Spotify" onSelect={() => { useUI.setState({ settingsSection: 'music' }); go('settings'); }} />
          )}
        </div>

        {music.devices.length > 0 && (
          <div className="mt-10">
            <div className="mb-3 text-[1rem] font-medium uppercase tracking-[0.16em] text-fg-muted">Playing on</div>
            <div className="flex flex-wrap gap-3">{music.devices.map((d) => <DeviceChip key={d.id} device={d} />)}</div>
          </div>
        )}

        {musicApps.length > 0 && (
          <div className="mt-10">
            <div className="mb-3 text-[1rem] font-medium uppercase tracking-[0.16em] text-fg-muted">Music apps</div>
            <div className="scroll-hidden -mx-6 -my-6 flex gap-5 overflow-x-auto px-6 py-6" style={{ scrollPaddingInline: '1.5rem' }}>
              {musicApps.map((app) => (
                <div key={app.id} className="w-56 shrink-0">
                  <AppCard app={app} size="grid" focusId={`music-app-${app.id}`} group="music-apps" onSelect={() => void launchApp(app)}
                    badge={launchReadiness(state, app.id) === 'not-installed' ? <Pill tone="neutral">Get</Pill> : undefined} />
                </div>
              ))}
            </div>
          </div>
        )}

        {music.recent.length > 0 && (
          <div className="mt-10">
            <div className="mb-3 text-[1rem] font-medium uppercase tracking-[0.16em] text-fg-muted">Recently played</div>
            <div className="flex gap-5">
              {music.recent.slice(0, 5).map((t) => (
                <div key={t.id} className="w-36">
                  <Artwork url={t.artUrl} className="size-36 rounded-2xl" />
                  <div className="mt-2 truncate text-[1rem] text-fg/90">{t.title}</div>
                  <div className="truncate text-[0.9rem] text-fg-muted">{t.artist}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
