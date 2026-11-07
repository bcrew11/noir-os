/**
 * "Watch later": links saved from the phone during the day, opened later on the TV in the right app.
 */
export interface SavedItem {
  id: string;
  url: string;
  title: string;
  /** Catalog app id that opens this link (e.g. "netflix"), or null for a plain web link. */
  appId: string | null;
  /** Thumbnail URL, when the service provides one. */
  image: string | null;
  addedAt: number;
}

/** Which app opens a link, by its web address. Checked in order; the first match wins. */
const SERVICES: Array<[RegExp, string]> = [
  [/(^|\.)tv\.youtube\.com$/, 'youtube-tv'],
  [/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/, 'youtube'],
  [/(^|\.)netflix\.com$/, 'netflix'],
  [/(^|\.)disneyplus\.com$/, 'disney-plus'],
  [/(^|\.)hulu\.com$/, 'hulu'],
  [/(^|\.)(primevideo\.com|amazon\.com|amazon\.co\.uk|amzn\.to|a\.co)$/, 'prime-video'],
  [/(^|\.)(max\.com|hbomax\.com)$/, 'max'],
  [/(^|\.)peacocktv\.com$/, 'peacock'],
  [/(^|\.)paramountplus\.com$/, 'paramount-plus'],
  [/(^|\.)tv\.apple\.com$/, 'apple-tv'],
  [/(^|\.)(open\.spotify\.com|spotify\.link)$/, 'spotify'],
  [/(^|\.)(espn\.com|espn\.go\.com)$/, 'espn'],
  [/(^|\.)(plex\.tv|watch\.plex\.tv)$/, 'plex'],
  [/(^|\.)pluto\.tv$/, 'pluto-tv'],
  [/(^|\.)tubitv\.com$/, 'tubi'],
];

export function serviceForUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SERVICES.find(([re]) => re.test(host))?.[1] ?? null;
  } catch { return null; }
}

/** Pull the first http(s) link out of pasted text (share sheets often add a title before the URL). */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return null;
  try { return new URL(m[0].replace(/[).,;!?]+$/, '')).toString(); } catch { return null; }
}

/** Every distinct http(s) link in a block of text (the Shortcut sends its whole queue at once). */
export function extractUrls(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const u = extractUrl(m[0]);
    if (u) out.add(u);
  }
  return [...out];
}

/** The YouTube video id for a watch/shorts/youtu.be link, for a reliable thumbnail and title. */
export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (/youtu\.be$/.test(u.hostname)) return u.pathname.slice(1).split('/')[0] || null;
    if (!/youtube/.test(u.hostname)) return null;
    return u.searchParams.get('v') ?? u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/)?.[2] ?? null;
  } catch { return null; }
}
