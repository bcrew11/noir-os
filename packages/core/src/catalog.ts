/**
 * The NOIR app directory.
 *
 * This is data, not code: adding an entry here (or in the server's custom-app table)
 * makes an app appear in the library with no UI changes.
 *
 * IMPORTANT: no platform launch IDs live here. VIZIO app IDs/namespaces differ between
 * firmware versions, so NOIR learns them from the user's own TV (see docs/VIZIO_COMPATIBILITY.md).
 * An app is only launchable once a LaunchConfig exists for it in the server store.
 */

export type AppCategory = 'streaming' | 'live-tv' | 'sports' | 'music' | 'entertainment' | 'utilities';

export const CATEGORY_LABELS: Record<AppCategory, string> = {
  streaming: 'Streaming',
  'live-tv': 'Live TV',
  sports: 'Sports',
  music: 'Music',
  entertainment: 'Entertainment',
  utilities: 'Utilities',
};

/**
 * Visual descriptor used to draw a typographic tile when no official logo file is present
 * in assets/icons/<id>.svg|png. These are text treatments in brand colors, not logo copies.
 */
export interface BrandStyle {
  /** Tile background (CSS). */
  background: string;
  /** Wordmark color. */
  color: string;
  /** Typeface family token. */
  font: 'condensed' | 'sans' | 'serif' | 'rounded' | 'wide';
  weight?: number;
  /** Optional glyph drawn before the wordmark. */
  glyph?: 'play' | 'plus' | 'none';
  glyphColor?: string;
  /** Text to render; defaults to app name. */
  wordmark?: string;
  italic?: boolean;
  letterSpacing?: string;
  /** Soft glow color behind the tile on focus. */
  glow?: string;
}

export interface AppDefinition {
  id: string;
  name: string;
  category: AppCategory;
  description: string;
  brand: BrandStyle;
  /** Public website, used only in browser mode as a clearly-labelled fallback. */
  webUrl?: string;
  /** Lowercase strings matched against VIZIO's reported app names when learning/looking up configs. */
  aliases?: string[];
}

export const APP_CATALOG: AppDefinition[] = [
  {
    id: 'youtube-tv',
    name: 'YouTube TV',
    category: 'live-tv',
    description: 'Live TV from 100+ channels',
    webUrl: 'https://tv.youtube.com',
    aliases: ['youtube tv', 'youtubetv'],
    brand: { background: 'linear-gradient(160deg,#2a2233,#17121f)', color: '#ffffff', font: 'condensed', weight: 600, glyph: 'play', glyphColor: '#ff0033', wordmark: 'YouTube TV', letterSpacing: '-0.01em', glow: 'rgba(255,0,51,0.25)' },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'streaming',
    description: 'Videos, creators and music',
    webUrl: 'https://www.youtube.com',
    aliases: ['youtube'],
    brand: { background: 'linear-gradient(160deg,#241e2c,#16121c)', color: '#ffffff', font: 'condensed', weight: 600, glyph: 'play', glyphColor: '#ff0033', letterSpacing: '-0.01em', glow: 'rgba(255,0,51,0.2)' },
  },
  {
    id: 'espn',
    name: 'ESPN',
    category: 'sports',
    description: 'Live sports, scores and highlights',
    webUrl: 'https://www.espn.com/watch',
    aliases: ['espn'],
    brand: { background: 'linear-gradient(160deg,#2b1c22,#170f14)', color: '#e5202e', font: 'wide', weight: 900, italic: true, letterSpacing: '0.02em', glow: 'rgba(229,32,46,0.22)' },
  },
  {
    id: 'netflix',
    name: 'Netflix',
    category: 'streaming',
    description: 'Series, films and originals',
    webUrl: 'https://www.netflix.com',
    aliases: ['netflix'],
    brand: { background: 'linear-gradient(160deg,#221a24,#120d14)', color: '#e50914', font: 'condensed', weight: 700, wordmark: 'NETFLIX', letterSpacing: '0.02em', glow: 'rgba(229,9,20,0.22)' },
  },
  {
    id: 'disney-plus',
    name: 'Disney+',
    category: 'streaming',
    description: 'Disney, Pixar, Marvel, Star Wars',
    webUrl: 'https://www.disneyplus.com',
    aliases: ['disney+', 'disney plus', 'disneyplus'],
    brand: { background: 'linear-gradient(160deg,#122148,#0b1230 60%,#08102a)', color: '#ffffff', font: 'serif', weight: 600, italic: true, wordmark: 'Disney+', glow: 'rgba(56,120,255,0.3)' },
  },
  {
    id: 'hulu',
    name: 'Hulu',
    category: 'streaming',
    description: 'Current TV and Hulu originals',
    webUrl: 'https://www.hulu.com',
    aliases: ['hulu'],
    brand: { background: 'linear-gradient(160deg,#10231a,#0b1510)', color: '#1ce783', font: 'rounded', weight: 800, wordmark: 'hulu', glow: 'rgba(28,231,131,0.2)' },
  },
  {
    id: 'prime-video',
    name: 'Prime Video',
    category: 'streaming',
    description: 'Amazon originals and rentals',
    webUrl: 'https://www.primevideo.com',
    aliases: ['prime video', 'amazon prime video', 'amazon'],
    brand: { background: 'linear-gradient(160deg,#0f2433,#0a1620)', color: '#ffffff', font: 'sans', weight: 700, wordmark: 'prime video', glow: 'rgba(0,168,225,0.22)' },
  },
  {
    id: 'max',
    name: 'Max',
    category: 'streaming',
    description: 'HBO, Max originals and more',
    webUrl: 'https://www.max.com',
    aliases: ['max', 'hbo max', 'hbo'],
    brand: { background: 'linear-gradient(160deg,#101a3c,#090f26)', color: '#ffffff', font: 'wide', weight: 800, wordmark: 'max', letterSpacing: '-0.02em', glow: 'rgba(0,47,255,0.25)' },
  },
  {
    id: 'peacock',
    name: 'Peacock',
    category: 'streaming',
    description: 'NBC, sports and originals',
    webUrl: 'https://www.peacocktv.com',
    aliases: ['peacock', 'peacock tv'],
    brand: { background: 'linear-gradient(160deg,#1b1b1f,#0e0e12)', color: '#ffffff', font: 'sans', weight: 800, wordmark: 'peacock', glow: 'rgba(255,200,0,0.18)' },
  },
  {
    id: 'paramount-plus',
    name: 'Paramount+',
    category: 'streaming',
    description: 'CBS, live sports and originals',
    webUrl: 'https://www.paramountplus.com',
    aliases: ['paramount+', 'paramount plus'],
    brand: { background: 'linear-gradient(160deg,#0d2160,#081440)', color: '#ffffff', font: 'sans', weight: 700, wordmark: 'Paramount+', glow: 'rgba(0,100,255,0.25)' },
  },
  {
    id: 'apple-tv',
    name: 'Apple TV',
    category: 'streaming',
    description: 'Apple TV+ originals',
    webUrl: 'https://tv.apple.com',
    aliases: ['apple tv', 'apple tv+'],
    brand: { background: 'linear-gradient(160deg,#26262b,#121214)', color: '#ffffff', font: 'sans', weight: 600, wordmark: 'Apple TV', glow: 'rgba(255,255,255,0.12)' },
  },
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'music',
    description: 'Music and podcasts',
    webUrl: 'https://open.spotify.com',
    aliases: ['spotify'],
    brand: { background: 'linear-gradient(160deg,#0f2418,#0a140e)', color: '#1ed760', font: 'rounded', weight: 800, wordmark: 'Spotify', glow: 'rgba(30,215,96,0.2)' },
  },
  {
    id: 'plex',
    name: 'Plex',
    category: 'entertainment',
    description: 'Your personal media library',
    webUrl: 'https://app.plex.tv',
    aliases: ['plex'],
    brand: { background: 'linear-gradient(160deg,#2a2412,#16130a)', color: '#e5a00d', font: 'wide', weight: 800, wordmark: 'PLEX', glow: 'rgba(229,160,13,0.2)' },
  },
  {
    id: 'pluto-tv',
    name: 'Pluto TV',
    category: 'live-tv',
    description: 'Free live channels',
    webUrl: 'https://pluto.tv',
    aliases: ['pluto tv', 'pluto'],
    brand: { background: 'linear-gradient(160deg,#1d1a2c,#100e1a)', color: '#fff200', font: 'sans', weight: 800, wordmark: 'pluto tv', glow: 'rgba(255,242,0,0.15)' },
  },
  {
    id: 'tubi',
    name: 'Tubi',
    category: 'entertainment',
    description: 'Free movies and TV',
    webUrl: 'https://tubitv.com',
    aliases: ['tubi'],
    brand: { background: 'linear-gradient(160deg,#2a1240,#170a24)', color: '#ffff13', font: 'rounded', weight: 900, wordmark: 'tubi', glow: 'rgba(122,30,255,0.25)' },
  },
  {
    id: 'pandora',
    name: 'Pandora',
    category: 'music',
    description: 'Personalized radio',
    webUrl: 'https://www.pandora.com',
    aliases: ['pandora'],
    brand: { background: 'linear-gradient(160deg,#141a35,#0b0f20)', color: '#ffffff', font: 'sans', weight: 700, wordmark: 'pandora', glow: 'rgba(54,85,255,0.22)' },
  },
  {
    id: 'watchfree',
    name: 'WatchFree+',
    category: 'live-tv',
    description: 'VIZIO’s free channel guide',
    aliases: ['watchfree+', 'watchfree', 'watch free'],
    brand: { background: 'linear-gradient(160deg,#1e1830,#120e1d)', color: '#c084fc', font: 'sans', weight: 700, wordmark: 'WatchFree+', glow: 'rgba(168,85,247,0.22)' },
  },
  {
    id: 'web-browser',
    name: 'Web Browser',
    category: 'utilities',
    description: 'Only available in External HDMI mode',
    brand: { background: 'linear-gradient(160deg,#1f1b29,#121019)', color: '#d9d4e6', font: 'sans', weight: 600, wordmark: 'Browser', glow: 'rgba(192,132,252,0.18)' },
  },
];

export const DEFAULT_FAVORITES = ['youtube-tv', 'youtube', 'espn', 'netflix', 'disney-plus'] as const;

export function findApp(id: string, extra: AppDefinition[] = []): AppDefinition | undefined {
  return APP_CATALOG.find((a) => a.id === id) ?? extra.find((a) => a.id === id);
}

export function searchApps(query: string, apps: AppDefinition[] = APP_CATALOG): AppDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return apps;
  return apps.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.category.includes(q) ||
      CATEGORY_LABELS[a.category].toLowerCase().includes(q) ||
      a.aliases?.some((al) => al.includes(q)),
  );
}

/** Match a TV-reported app name against the catalog. */
export function matchAppByName(name: string): AppDefinition | undefined {
  const n = name.trim().toLowerCase();
  return APP_CATALOG.find((a) => a.name.toLowerCase() === n || a.aliases?.includes(n));
}
