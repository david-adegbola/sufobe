import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ART_NAME, artFiles } from '../tools/art-files.mjs';
import { art, artListed } from '../src/app/forest/art';

describe('painted art (2.5D, increment 5)', () => {
  it('accepts only the known slots and seasons', () => {
    for (const ok of ['hills-summer.webp', 'fells-winter.png', 'treeline-autumn.jpg', 'ground-spring.webp']) expect(ART_NAME.test(ok)).toBe(true);
    for (const no of ['hills-summer.gif', 'sky-summer.webp', 'hills-july.webp', 'readme.md', 'hills-summer.webp.bak']) expect(ART_NAME.test(no)).toBe(false);
  });

  it('lists the paintings in a folder by name, skipping anything else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'art-'));
    for (const f of ['hills-summer.webp', 'ground-winter.png', 'notes.txt']) writeFileSync(join(dir, f), '');
    expect(artFiles(dir)).toEqual([['ground-winter', 'ground-winter.png'], ['hills-summer', 'hills-summer.webp']]);
    expect(artFiles(join(dir, 'missing'))).toEqual([]);
  });

  it('draws instead when no painting has loaded', () => {
    expect(Array.isArray(artListed())).toBe(true);
    expect(art('hills', 'summer')).toBeNull();
  });
});
