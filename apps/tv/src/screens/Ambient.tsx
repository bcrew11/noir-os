import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { formatClock, formatLongDate, weatherLabel } from '@noir/core';
import { useNoir, useNow } from '@noir/ui';
import { Background } from '../components/Background.tsx';
import { Artwork } from '../components/widgets.tsx';
import { pushScope, popScope } from '../focus/focus.ts';
import { interceptNav } from '../focus/input.ts';
import { useMotion } from '../hooks/useMotion.ts';
import { useUI } from '../store/ui.ts';

/** Gentle position drift so a static clock never burns into OLED-like panels. */
function useBurnInShift(now: Date) {
  const m = now.getMinutes();
  return { x: Math.sin(m / 9) * 2.2, y: Math.cos(m / 7) * 1.6 }; // rem
}

function PhotoSlideshow({ photos, interval }: { photos: string[]; interval: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (photos.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % photos.length), interval * 1000);
    return () => clearInterval(id);
  }, [photos.length, interval]);
  const src = photos[i];
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <AnimatePresence>
        {src && (
          <motion.div key={src} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 2.5 }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${src}")`, animation: `kenburns ${interval + 4}s ease-out forwards` }} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.65), rgba(0,0,0,0) 45%), radial-gradient(70% 60% at 20% 80%, rgba(0,0,0,0.45), transparent)' }} />
    </div>
  );
}

export default function Ambient() {
  const state = useNoir((s) => s.state);
  const now = useNow(1000);
  const level = useMotion();
  const shift = useBurnInShift(now);

  useEffect(() => {
    pushScope('ambient');
    const openedAt = Date.now();
    // Any key wakes NOIR without also triggering an action underneath.
    const off = interceptNav(() => {
      if (Date.now() - openedAt > 400) {
        const ui = useUI.getState();
        ui.go(ui.previous === 'ambient' ? 'home' : ui.previous);
      }
      return true;
    });
    return () => { off(); popScope('ambient'); };
  }, []);

  if (!state) return null;
  const a = state.settings.ambient;
  const clock = formatClock(now, state.settings.appearance.clock24h);
  const music = state.music;
  const photos = a.theme === 'photo' ? state.photos : [];
  const weight = a.clockStyle === 'bold' ? 600 : a.clockStyle === 'serif' ? 400 : 200;
  const font = a.clockStyle === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)';

  return (
    <motion.div className="absolute inset-0 z-30 cursor-none bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: level === 'off' ? 0 : 1.2 }}
      onClick={() => useUI.getState().go('home')}>
      {a.theme === 'midnight' && <Background variant="dunes" dim={0.25} />}
      {a.theme === 'aurora' && <Background variant="aurora" />}
      {a.theme === 'nebula' && <Background variant="nebula" dim={0.1} />}
      {a.theme === 'obsidian' && <Background variant="obsidian" dim={0.35} />}
      {a.theme === 'photo' && <PhotoSlideshow photos={photos} interval={a.photoIntervalSec} />}

      <div className="absolute left-1/2 top-1/2 h-[67.5rem] w-[120rem] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute flex flex-col transition-transform duration-[4000ms]"
          style={a.theme === 'minimal'
            ? { left: '50%', top: '50%', transform: `translate(-50%, -50%) translate(${shift.x}rem, ${shift.y}rem)`, alignItems: 'center' }
            : { left: '7rem', bottom: '7rem', transform: `translate(${shift.x}rem, ${shift.y}rem)` }}>
          <div className="flex items-baseline gap-4 leading-none text-fg" style={{ fontFamily: font, fontWeight: weight }}>
            <span className="text-[13rem] tracking-[-0.04em] tabular-nums">{clock.time}</span>
            {clock.suffix && <span className="text-[3rem] text-fg/70">{clock.suffix}</span>}
          </div>
          {a.showDate && <div className="mt-4 text-[2.1rem] font-light text-fg/75">{formatLongDate(now)}</div>}
          {a.showWeather && state.weather && (
            <div className="mt-3 text-[1.7rem] font-light text-fg/65">
              {Math.round(state.settings.weather.units === 'fahrenheit' ? state.weather.tempC * 1.8 + 32 : state.weather.tempC)}°{state.settings.weather.units === 'fahrenheit' ? 'F' : 'C'} · {weatherLabel(state.weather.code)}
            </div>
          )}
        </div>

        {a.showMusic && music.track && music.isPlaying && (
          <div className="absolute bottom-[7rem] right-[7rem] flex items-center gap-5 rounded-3xl bg-black/25 p-4 pr-8 backdrop-blur-md">
            <Artwork url={music.track.artUrl} className="size-20 rounded-2xl" />
            <div className="min-w-0">
              <div className="max-w-[24rem] truncate text-[1.4rem] font-medium text-fg">{music.track.title}</div>
              <div className="max-w-[24rem] truncate text-[1.1rem] text-fg-muted">{music.track.artist}</div>
            </div>
          </div>
        )}

        {a.theme === 'photo' && photos.length === 0 && (
          <div className="absolute right-[7rem] top-[6rem] max-w-[34rem] rounded-3xl bg-white/[0.06] p-7 text-[1.15rem] leading-relaxed text-fg-muted">
            No photos yet. Put .jpg, .png or .webp files in <span className="text-fg">assets/backgrounds/photos</span> on the NOIR server, then refresh in Settings → System.
          </div>
        )}
      </div>
    </motion.div>
  );
}
