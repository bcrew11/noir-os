import { describe, expect, it } from 'vitest';
import { extractUrls, serviceForUrl } from '@noir/core';
import { netflixId, openSteps } from './saved.ts';

describe('watch later links', () => {
  it('reads Netflix title ids from the shapes share links come in', () => {
    expect(netflixId('https://www.netflix.com/title/80057281?s=i&trkid=1234')).toBe('80057281');
    expect(netflixId('https://www.netflix.com/watch/80057281?trackId=5')).toBe('80057281');
    expect(netflixId('https://www.netflix.com/gb/title/80057281')).toBe('80057281');
    expect(netflixId('https://www.netflix.com/browse?jbv=80057281')).toBe('80057281');
    expect(netflixId('https://www.netflix.com/browse')).toBeNull();
  });

  it('opens Netflix titles on their page first, with plain links as fallbacks', () => {
    const steps = openSteps('https://www.netflix.com/title/80057281?s=i', 'netflix', 'com.netflix.ninja');
    expect(steps[0]).toMatchObject({ data: 'netflix://title/80057281', pkg: 'com.netflix.ninja', extras: { source: '30' } });
    expect(steps.at(-1)).toEqual({ data: 'https://www.netflix.com/title/80057281?s=i' });
  });

  it('opens other services with their app, then anything', () => {
    expect(openSteps('https://youtu.be/abc123def45', 'youtube', 'com.google.android.youtube.tv'))
      .toEqual([{ data: 'https://youtu.be/abc123def45', pkg: 'com.google.android.youtube.tv' }, { data: 'https://youtu.be/abc123def45' }]);
  });

  it('maps links to services and pulls every link out of a queue file', () => {
    expect(serviceForUrl('https://tv.youtube.com/watch/x')).toBe('youtube-tv');
    expect(serviceForUrl('https://www.disneyplus.com/video/abc')).toBe('disney-plus');
    expect(extractUrls('Watch this! https://youtu.be/a1b2c3d4e5f,\nhttps://www.hulu.com/series/x\nhttps://youtu.be/a1b2c3d4e5f'))
      .toEqual(['https://youtu.be/a1b2c3d4e5f', 'https://www.hulu.com/series/x']);
  });
});
