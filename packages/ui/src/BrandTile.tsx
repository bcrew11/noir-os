import type { CSSProperties } from 'react';
import type { AppDefinition } from '@noir/core';

const FONT: Record<NonNullable<AppDefinition['brand']['font']>, string> = {
  condensed: 'var(--font-condensed)',
  sans: 'var(--font-sans)',
  serif: 'var(--font-serif)',
  wide: 'var(--font-wide)',
  rounded: 'var(--font-rounded)',
};

function PlayGlyph({ color, size }: { color: string; size: number }) {
  return (
    <svg viewBox="0 0 40 28" aria-hidden style={{ flexShrink: 0, width: `${size * 1.42}rem`, height: `${size}rem` }}>
      <rect x="0" y="0" width="40" height="28" rx="7" fill={color} />
      <path d="M16 8.5 L27 14 L16 19.5 Z" fill="#fff" />
    </svg>
  );
}

/**
 * Draws an app's mark. If an official logo file has been placed in assets/icons/<id>.svg|png
 * it is used; otherwise a typographic wordmark in the brand's colors is rendered.
 * `scale` is in rem relative to a 1080p layout.
 */
export function BrandMark({ app, logoUrl, scale = 1 }: { app: AppDefinition; logoUrl?: string; scale?: number }) {
  if (logoUrl) {
    return <img src={logoUrl} alt={app.name} draggable={false} style={{ maxWidth: '78%', maxHeight: `${3.2 * scale}rem`, objectFit: 'contain' }} />;
  }
  const b = app.brand;
  const text = b.wordmark ?? app.name;
  const long = text.length > 9;
  const fontSize = (b.font === 'condensed' ? 2.75 : b.font === 'serif' ? 2.6 : long ? 1.9 : 2.3) * scale * (text.length > 11 ? 0.82 : 1);
  const style: CSSProperties = {
    fontFamily: FONT[b.font],
    fontWeight: b.weight ?? 700,
    fontStyle: b.italic ? 'italic' : 'normal',
    fontStretch: b.font === 'wide' ? '125%' : undefined,
    letterSpacing: b.letterSpacing,
    color: b.color,
    fontSize: `${fontSize}rem`,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    transform: b.font === 'wide' && b.italic ? 'skewX(-8deg)' : undefined,
  };
  return (
    <span aria-label={app.name} style={{ display: 'inline-flex', alignItems: 'center', gap: `${0.4 * scale}rem` }}>
      {b.glyph === 'play' && <PlayGlyph color={b.glyphColor ?? '#ff0033'} size={fontSize * 0.74} />}
      <span style={style}>{text}</span>
    </span>
  );
}
