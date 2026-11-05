import { describe, expect, it } from 'vitest';
import { applySettingsPatch, defaultSettings, loadSettings, DEFAULT_FAVORITES, greeting } from './index.ts';

describe('settings', () => {
  it('defaults put the five primary apps first, in order, with YouTube TV focused', () => {
    const s = defaultSettings();
    expect(s.home.favorites).toEqual(['youtube-tv', 'youtube', 'espn', 'netflix', 'disney-plus']);
    expect(s.home.favorites).toEqual([...DEFAULT_FAVORITES]);
    expect(s.home.defaultFocus).toBe('youtube-tv');
  });

  it('deep-merges patches and replaces arrays', () => {
    const s = applySettingsPatch(defaultSettings(), { appearance: { accent: 'rose' }, home: { favorites: ['netflix'] } });
    expect(s.appearance.accent).toBe('rose');
    expect(s.appearance.background).toBe('dunes');
    expect(s.home.favorites).toEqual(['netflix']);
  });

  it('rejects invalid values', () => {
    expect(() => applySettingsPatch(defaultSettings(), { appearance: { accent: 'neon' } })).toThrow();
    expect(() => applySettingsPatch(defaultSettings(), { ambient: { idleMinutes: -3 } })).toThrow();
    expect(() => applySettingsPatch(defaultSettings(), { inputs: { 'HDMI-1': { label: '', icon: 'console' } } })).toThrow();
  });

  it('recovers per-section from corrupt stored settings', () => {
    const s = loadSettings({ appearance: { accent: 'bogus' }, home: { favorites: ['espn'] } });
    expect(s.appearance.accent).toBe('violet');
    expect(s.home.favorites).toEqual(['espn']);
  });

  it('greets by time of day', () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe('Good morning.');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Good afternoon.');
    expect(greeting(new Date(2026, 0, 1, 21))).toBe('Good evening.');
  });
});
