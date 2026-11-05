import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerUpLeft, Home, Play, X } from 'lucide-react';
import type { NavKey } from '@noir/core';
import { dispatchNav } from '../focus/input.ts';
import { useUI } from '../store/ui.ts';

/** Development remote: toggle with ` (backtick) or Shift+R. Mouse-only, outside the focus engine. */
export function RemoteSimulator() {
  const btn = (key: NavKey, Icon: typeof Home, cls = '') => (
    <button key={key} type="button" tabIndex={-1} onClick={() => dispatchNav(key)} aria-label={key}
      className={`grid size-14 place-items-center rounded-full bg-white/[0.07] text-fg transition active:scale-90 active:bg-primary/50 hover:bg-white/15 ${cls}`}>
      <Icon className="size-6" strokeWidth={1.8} />
    </button>
  );
  return (
    <div className="glass absolute bottom-10 right-10 z-50 w-[15rem] rounded-[2rem] p-5" style={{ background: 'rgba(24,19,34,0.95)' }}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[0.95rem] font-medium uppercase tracking-[0.18em] text-fg-muted">Remote</span>
        <button type="button" tabIndex={-1} onClick={() => useUI.setState({ remoteSimulator: false })} className="text-fg-muted hover:text-fg" aria-label="Close"><X className="size-5" /></button>
      </div>
      <div className="grid grid-cols-3 place-items-center gap-2">
        <span />{btn('up', ArrowUp)}<span />
        {btn('left', ArrowLeft)}
        <button type="button" tabIndex={-1} onClick={() => dispatchNav('ok')} className="grid size-16 place-items-center rounded-full bg-primary/70 text-[1.05rem] font-semibold transition active:scale-90">OK</button>
        {btn('right', ArrowRight)}
        <span />{btn('down', ArrowDown)}<span />
      </div>
      <div className="mt-4 flex justify-between">{btn('back', CornerUpLeft)}{btn('home', Home)}{btn('playpause', Play)}</div>
      <p className="mt-3 text-center text-[0.8rem] text-fg-dim">Arrows · Enter · Esc · H · Space</p>
    </div>
  );
}
