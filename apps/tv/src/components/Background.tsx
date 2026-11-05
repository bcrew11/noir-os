import { memo } from 'react';
import type { BackgroundId } from '@noir/core';

/**
 * Cinematic backdrop. Each layer is its own composited element animated only with
 * transform/opacity, so the GPU moves pre-rasterised layers and nothing repaints.
 */

const RIDGES = [
  // far ridge with the big lit peak
  { d: 'M520 700 C700 520 900 300 1120 228 C1260 184 1360 250 1470 300 C1600 356 1720 220 1920 70 L1920 1080 L520 1080 Z', fill: 'url(#r1)', rim: 0.95, anim: 'anim-a' },
  { d: 'M700 820 C930 640 1140 560 1360 500 C1560 446 1720 330 1920 250 L1920 1080 L700 1080 Z', fill: 'url(#r2)', rim: 0.75, anim: 'anim-b' },
  { d: 'M860 930 C1080 800 1330 730 1560 650 C1720 594 1830 520 1920 480 L1920 1080 L860 1080 Z', fill: 'url(#r3)', rim: 0.6, anim: 'anim-c' },
  { d: 'M1040 1080 C1260 960 1520 880 1920 740 L1920 1080 Z', fill: 'url(#r4)', rim: 0.45, anim: 'anim-b' },
];

function rimPath(d: string) {
  // The lit edge is the top contour only: drop the closing segments.
  return d.replace(/ L1920 1080.*$/, '');
}

// All ridges share one key light (top-right, user space) so the layers read as one lit landscape.
const LIGHTS = [
  { id: 'r1', c0: '#a77bf0', o0: 0.85, c1: '#4a2a7c', mid: 0.32 },
  { id: 'r2', c0: '#9566e6', o0: 0.75, c1: '#3d2168', mid: 0.36 },
  { id: 'r3', c0: '#8251d6', o0: 0.7, c1: '#331a58', mid: 0.4 },
  { id: 'r4', c0: '#7444c4', o0: 0.65, c1: '#2a1548', mid: 0.44 },
];

const Defs = () => (
  <defs>
    {LIGHTS.map((l) => (
      <radialGradient key={l.id} id={l.id} gradientUnits="userSpaceOnUse" cx="1720" cy="40" r="1500">
        <stop offset="0" stopColor={l.c0} stopOpacity={l.o0} />
        <stop offset={l.mid} stopColor={l.c1} />
        <stop offset="0.68" stopColor="#170d27" />
        <stop offset="1" stopColor="#0b0712" />
      </radialGradient>
    ))}
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#000" stopOpacity="0" />
      <stop offset="1" stopColor="#05030a" stopOpacity="0.55" />
    </linearGradient>
    <linearGradient id="rim" gradientUnits="userSpaceOnUse" x1="500" y1="0" x2="1920" y2="0">
      <stop offset="0" stopColor="#c084fc" stopOpacity="0" />
      <stop offset="0.35" stopColor="#c084fc" stopOpacity="0.5" />
      <stop offset="0.75" stopColor="#efe4ff" stopOpacity="1" />
      <stop offset="1" stopColor="#d8c8ff" stopOpacity="0.85" />
    </linearGradient>
    <filter id="soft" x="-10%" y="-20%" width="120%" height="140%">
      <feGaussianBlur stdDeviation="14" />
    </filter>
  </defs>
);

function Dunes() {
  return (
    <>
      {RIDGES.map((r, i) => (
        <svg key={i} className={`bg-layer ${r.anim}`} viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <Defs />
          <path d={r.d} fill={r.fill} />
          <path d={r.d} fill="url(#shade)" />
          <path d={rimPath(r.d)} fill="none" stroke="url(#rim)" strokeWidth={34} opacity={r.rim * 0.45} filter="url(#soft)" />
          <path d={rimPath(r.d)} fill="none" stroke="url(#rim)" strokeWidth={1.6} opacity={r.rim} />
        </svg>
      ))}
    </>
  );
}

function Aurora() {
  return (
    <>
      <div className="bg-layer anim-aurora" style={{ background: 'radial-gradient(60% 22% at 60% 30%, rgba(94,234,212,0.28), transparent 70%)', filter: 'blur(2rem)' }} />
      <div className="bg-layer anim-aurora" style={{ animationDuration: '52s', background: 'radial-gradient(55% 26% at 70% 42%, rgba(168,85,247,0.42), transparent 70%)', filter: 'blur(2.5rem)' }} />
      <div className="bg-layer anim-b" style={{ background: 'radial-gradient(40% 30% at 85% 20%, rgba(192,132,252,0.35), transparent 70%)' }} />
    </>
  );
}

function Nebula() {
  return (
    <>
      <div className="bg-layer anim-a" style={{ background: 'radial-gradient(38% 46% at 74% 32%, rgba(139,92,246,0.45), transparent 70%)' }} />
      <div className="bg-layer anim-b" style={{ background: 'radial-gradient(30% 34% at 88% 78%, rgba(219,39,119,0.25), transparent 70%)' }} />
      <div className="bg-layer anim-c" style={{ background: 'radial-gradient(26% 30% at 52% 70%, rgba(99,102,241,0.25), transparent 70%)' }} />
    </>
  );
}

export const Background = memo(function Background({ variant, dim = 0 }: { variant: BackgroundId; dim?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden style={{ background: 'radial-gradient(120% 90% at 85% 0%, #1d1230 0%, #0f0a19 45%, #0b0912 75%)' }}>
      {/* key light, top right */}
      <div className="bg-layer anim-glow" style={{ background: 'radial-gradient(42% 40% at 82% 8%, color-mix(in srgb, var(--noir-highlight) 34%, transparent), transparent 70%)' }} />
      <div className="absolute inset-0 parallax">
        {variant === 'dunes' && <Dunes />}
        {variant === 'aurora' && <Aurora />}
        {variant === 'nebula' && <Nebula />}
        {variant === 'obsidian' && (
          <div className="bg-layer anim-a" style={{ background: 'radial-gradient(50% 50% at 80% 10%, rgba(139,92,246,0.12), transparent 70%)' }} />
        )}
      </div>
      {/* purple haze bottom-right, as in the reference */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(40% 35% at 100% 100%, color-mix(in srgb, var(--noir-accent) 26%, transparent), transparent 70%)' }} />
      {/* legibility: darken the left/top where text sits */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(11,9,18,0.92) 0%, rgba(11,9,18,0.55) 32%, rgba(11,9,18,0) 60%), linear-gradient(0deg, rgba(11,9,18,0.85) 0%, rgba(11,9,18,0) 45%)' }} />
      <div className="grain" />
      {dim > 0 && <div className="absolute inset-0 bg-ink-900 transition-opacity duration-500" style={{ opacity: dim }} />}
    </div>
  );
});
