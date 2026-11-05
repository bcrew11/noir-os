import { describe, expect, it } from 'vitest';
import { pickBest, type Rect } from './geometry.ts';

const r = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h });

// Home layout: a row of cards, a row of two widgets, a nav bar.
const cards = [0, 1, 2, 3, 4].map((i) => ({ id: `card${i}`, rect: r(100 + i * 300, 500, 280, 160) }));
const widgets = [{ id: 'music', rect: r(100, 720, 880, 140) }, { id: 'input', rect: r(1010, 720, 880, 140) }];
const nav = [{ id: 'nav-home', rect: r(600, 950, 140, 60) }, { id: 'nav-apps', rect: r(760, 950, 140, 60) }];
const all = [...cards, ...widgets, ...nav];

describe('spatial navigation', () => {
  it('moves along a row', () => {
    expect(pickBest(cards[1]!.rect, all.filter((c) => c.id !== 'card1'), 'right')).toBe('card2');
    expect(pickBest(cards[1]!.rect, all.filter((c) => c.id !== 'card1'), 'left')).toBe('card0');
  });
  it('stops at the edge', () => {
    expect(pickBest(cards[4]!.rect, all.filter((c) => c.id !== 'card4'), 'right')).toBeNull();
    expect(pickBest(cards[0]!.rect, all.filter((c) => c.id !== 'card0'), 'up')).toBeNull();
  });
  it('goes down to the widget underneath', () => {
    expect(pickBest(cards[0]!.rect, all, 'down')).toBe('music');
    expect(pickBest(cards[4]!.rect, all, 'down')).toBe('input');
  });
  it('goes up from the nav bar to the widget row, not across', () => {
    expect(pickBest(nav[0]!.rect, all.filter((c) => c.id !== 'nav-home'), 'up')).toBe('music');
    expect(pickBest(nav[0]!.rect, all.filter((c) => c.id !== 'nav-home'), 'right')).toBe('nav-apps');
  });
});
