import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { formatClock, formatDuration } from '@noir/core';
import { useMusicProgress, useNoir, useNow } from '@noir/ui';
import { popScope, pushScope } from '../focus/focus.ts';
import { interceptNav } from '../focus/input.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { useUI } from '../store/ui.ts';
import { Artwork } from './widgets.tsx';

/**
 * Tiny version of the artwork (8×8), stretched to fill the screen: the browser's smooth upscaling
 * gives a soft, blurred colour wash for free — no blur filter, so it costs nothing on a stick.
 */
function useArtWash(url?: string): string | null {
  const [wash, setWash] = useState<string | null>(null);
  useEffect(() => {
    if (!url) { setWash(null); return; }
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        c.getContext('2d')!.drawImage(img, 0, 0, 8, 8);
        if (alive) setWash(c.toDataURL());
      } catch { if (alive) setWash(null); } // cross-origin art without CORS: fall back to the gradient
    };
    img.onerror = () => alive && setWash(null);
    img.src = url;
    return () => { alive = false; };
  }, [url]);
  return wash;
}

/** Immersive "Now Playing" view for an idle Home screen. Any button returns to Home. */
export function NowPlayingView({ onExit }: { onExit: () => void }) {
  const music = useNoir((s) => s.state?.music);
  const clock24 = useNoir((s) => s.state?.settings.appearance.clock24h ?? false);
  const progress = useMusicProgress(music);
  const now = useNow();
  const level = useMotion();
  const dark = useNoir((s) => s.state?.settings.home.nowPlayingTheme === 'dark');
  // Hold the last song through the brief gap apps leave between tracks.
  const lastTrack = useRef(music?.track);
  if (music?.track) lastTrack.current = music.track;
  const track = music?.track ?? lastTrack.current;
  const wash = useArtWash(dark ? undefined : track?.artUrl);
  const [hint, setHint] = useState(true);
  useEffect(() => { const id = setTimeout(() => setHint(false), 4000); return () => clearTimeout(id); }, []);

  useEffect(() => {
    pushScope('now-playing');
    const opened = Date.now();
    // The press that wakes Home is consumed, so it doesn't also trigger something underneath.
    const off = interceptNav(() => { if (Date.now() - opened > 300) onExit(); return true; });
    return () => { off(); popScope('now-playing'); useUI.setState({ lastActivity: Date.now() }); };
  }, [onExit]);

  if (!music || !track) return null;
  const pct = track.durationMs ? Math.min(100, (progress / track.durationMs) * 100) : 0;
  const clock = formatClock(now, clock24);

  return (
    <motion.div className={`absolute inset-0 z-30 overflow-hidden ${dark ? 'bg-black' : 'bg-ink-900'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: level === 'off' ? 0 : 0.6 }} onClick={onExit}>
      {dark ? null : wash
        ? <img src={wash} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-70" style={{ imageRendering: 'auto' }} />
        : <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(70% 70% at 30% 40%, color-mix(in srgb, var(--noir-primary) 45%, transparent), transparent 70%)' }} />}
      {!dark && <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(11,9,18,0.55), rgba(11,9,18,0.25) 50%, rgba(11,9,18,0.7)), linear-gradient(0deg, rgba(11,9,18,0.85), transparent 45%)' }} />}

      <div className={`absolute left-1/2 top-1/2 flex h-[67.5rem] w-[120rem] -translate-x-1/2 -translate-y-1/2 items-center gap-20 px-28 ${dark ? 'opacity-[0.82]' : ''}`}>
        <motion.div key={track.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: level === 'off' ? 0 : 0.7 }}
          className="shrink-0 rounded-[2.5rem] shadow-[0_3rem_7rem_-2rem_rgba(0,0,0,0.9)]">
          <Artwork url={track.artUrl} className="size-[34rem] rounded-[2.5rem]" iconClass="size-32" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="text-[1.3rem] font-medium uppercase tracking-[0.22em] text-highlight/90">Now playing · {music.providerLabel}</div>
          <motion.h1 key={`t-${track.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: level === 'off' ? 0 : 0.5 }}
            className="mt-5 line-clamp-2 text-[5.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-fg">{track.title}</motion.h1>
          <p className="mt-3 truncate text-[2.2rem] text-fg/75">{track.artist}{track.album ? ` — ${track.album}` : ''}</p>
          {track.durationMs > 0 && (
            <div className="mt-12 max-w-[50rem]">
              <div className="h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-highlight transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 flex justify-between text-[1.15rem] tabular-nums text-fg-muted">
                <span>{formatDuration(progress)}</span><span>{formatDuration(track.durationMs)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="absolute right-28 top-16 text-[2rem] font-light tabular-nums text-fg/85">{clock.time}{clock.suffix && <span className="ml-1.5 text-[1.3rem]">{clock.suffix}</span>}</div>
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 text-[1rem] text-fg-dim transition-opacity duration-[1500ms]" style={{ opacity: hint ? 1 : 0 }}>Press any button to return</div>
      </div>
    </motion.div>
  );
}
