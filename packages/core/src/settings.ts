import { z } from 'zod';
import { DEFAULT_FAVORITES } from './catalog.ts';

export const ACCENTS = {
  violet: { primary: '#8B5CF6', accent: '#A855F7', highlight: '#C084FC', label: 'Violet' },
  orchid: { primary: '#A855F7', accent: '#C026D3', highlight: '#E879F9', label: 'Orchid' },
  indigo: { primary: '#6366F1', accent: '#818CF8', highlight: '#A5B4FC', label: 'Indigo' },
  rose: { primary: '#E11D74', accent: '#F43F8E', highlight: '#F9A8D4', label: 'Rose' },
  aurora: { primary: '#14B8A6', accent: '#8B5CF6', highlight: '#5EEAD4', label: 'Aurora' },
} as const;
export type AccentId = keyof typeof ACCENTS;

export const BACKGROUNDS = {
  dunes: 'Violet Dunes',
  aurora: 'Soft Aurora',
  nebula: 'Nebula',
  obsidian: 'Obsidian',
} as const;
export type BackgroundId = keyof typeof BACKGROUNDS;

export const AMBIENT_THEMES = {
  midnight: 'Midnight Purple',
  obsidian: 'Obsidian',
  aurora: 'Soft Aurora',
  minimal: 'Minimal Clock',
  photo: 'Personal Photography',
} as const;
export type AmbientThemeId = keyof typeof AMBIENT_THEMES;

export const INPUT_ICONS = ['console', 'gamepad', 'computer', 'streaming', 'tv', 'disc', 'speaker', 'camera'] as const;
export type InputIcon = (typeof INPUT_ICONS)[number];

const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const InputConfigSchema = z.object({
  label: z.string().trim().min(1).max(32),
  icon: z.enum(INPUT_ICONS),
  hidden: z.boolean().default(false),
});
export type InputConfig = z.infer<typeof InputConfigSchema>;

export const SettingsSchema = z.object({
  appearance: z.object({
    accent: z.enum(keys(ACCENTS)).default('violet'),
    background: z.enum(keys(BACKGROUNDS)).default('dunes'),
    motion: z.enum(['full', 'reduced', 'off']).default('full'),
    glass: z.boolean().default(true),
    clock24h: z.boolean().default(false),
    /** Extra overscan margin in percent of the screen, for TVs that crop edges. */
    safeArea: z.number().min(0).max(6).default(0),
    /** `auto` measures frame time and drops blur/ambient motion on slow hardware. */
    performance: z.enum(['auto', 'high', 'low']).default('auto'),
  }).default({}),
  home: z.object({
    favorites: z.array(z.string().min(1).max(64)).max(12).default([...DEFAULT_FAVORITES]),
    defaultFocus: z.string().default('youtube-tv'),
    showGreeting: z.boolean().default(true),
    showMusicWidget: z.boolean().default(true),
    showInputWidget: z.boolean().default(true),
    /** Input featured on the home widget; null = pick automatically (first HDMI source that isn't a soundbar). */
    widgetInputId: z.string().nullable().default(null),
  }).default({}),
  /** Per-input overrides. Inputs without an entry use the name the TV reports (e.g. "Roku Streaming"). */
  inputs: z.record(z.string(), InputConfigSchema).default({}),
  ambient: z.object({
    theme: z.enum(keys(AMBIENT_THEMES)).default('midnight'),
    /** Minutes of inactivity inside NOIR before ambient mode starts. 0 disables. */
    idleMinutes: z.number().int().min(0).max(240).default(10),
    showDate: z.boolean().default(true),
    showMusic: z.boolean().default(true),
    showWeather: z.boolean().default(false),
    clockStyle: z.enum(['light', 'bold', 'serif']).default('light'),
    photoIntervalSec: z.number().int().min(10).max(3600).default(60),
  }).default({}),
  music: z.object({
    provider: z.enum(['demo', 'spotify']).default('demo'),
    showArtwork: z.boolean().default(true),
  }).default({}),
  weather: z.object({
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    units: z.enum(['fahrenheit', 'celsius']).default('fahrenheit'),
  }).default({}),
  system: z.object({
    /** The TV input NOIR itself is connected to (External HDMI mode), used for "Return to NOIR". */
    noirInputId: z.string().nullable().default(null),
    /** When the TV turns on, switch it to `noirInputId` over Wi‑Fi so NOIR is the first screen. */
    autoSwitchOnPowerOn: z.boolean().default(false),
  }).default({}),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsPatch = DeepPartial<Settings>;
export type DeepPartial<T> = T extends readonly (infer _U)[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export const defaultSettings = (): Settings => SettingsSchema.parse({});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge a patch. Arrays replace; `null` values are kept (used for nullable fields). */
export function mergeDeep<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch) || !isPlainObject(base)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? mergeDeep(out[k], v) : v;
  }
  return out as T;
}

/** Apply a patch and validate the result. Throws a ZodError on invalid input. */
export function applySettingsPatch(current: Settings, patch: unknown): Settings {
  return SettingsSchema.parse(mergeDeep(current, patch));
}

/** Parse stored settings leniently: unknown/invalid sections fall back to defaults. */
export function loadSettings(raw: unknown): Settings {
  const parsed = SettingsSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  const base = defaultSettings();
  if (!isPlainObject(raw)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base) as (keyof Settings)[]) {
    const section = SettingsSchema.shape[key].safeParse(raw[key]);
    if (section.success) out[key] = section.data;
  }
  return out as Settings;
}
