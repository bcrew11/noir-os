import { ACCENTS, type AccentId } from '@noir/core';

export function applyAccent(id: AccentId) {
  const a = ACCENTS[id] ?? ACCENTS.violet;
  const r = document.documentElement.style;
  r.setProperty('--noir-primary', a.primary);
  r.setProperty('--noir-accent', a.accent);
  r.setProperty('--noir-highlight', a.highlight);
}

export function loadFonts() {
  return Promise.all([
    import('@fontsource-variable/inter'),
    import('@fontsource/oswald/500.css'),
    import('@fontsource/oswald/600.css'),
    import('@fontsource/oswald/700.css'),
    import('@fontsource/dm-serif-display/400-italic.css'),
    import('@fontsource-variable/archivo/wdth-italic.css'),
    import('@fontsource-variable/archivo/wdth.css'),
    import('@fontsource-variable/nunito'),
  ]);
}
