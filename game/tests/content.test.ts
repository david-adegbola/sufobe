/**
 * Content checks (Phase 5): Finnish and English must say the same things,
 * and every id in the game data must have its words. A missing English
 * badge name or a Finnish species without a text would otherwise only show
 * up as "undefined" on a child's screen.
 */
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, RANKS, STORY } from '../src/core/progress';
import { ANIMALS, CARDS, ITEMS, PLACES, SOILS, SPECIES } from '../src/core/forest';
import { LAB_TEXT } from '../src/app/forest/labtext';
import { TEXT } from '../src/app/text';
import { FOREST_TEXT } from '../src/app/forest/text';
import { ABOUT_UI, aboutSections } from '../src/app/legal';
import { CORRECT, QUIZ, QUIZ_UI } from '../src/app/forest/quiz';
import { ATLAS_TEXT, EVENTS } from '../src/app/atlas';

/** Every difference in shape between two text tables, as readable paths. */
function shapeDiff(a: unknown, b: unknown, path = ''): string[] {
  const kind = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  if (kind(a) !== kind(b)) return [`${path}: ${kind(a)} vs ${kind(b)}`];
  if (typeof a === 'function') return a.length === (b as (...x: unknown[]) => unknown).length ? [] : [`${path}: ${a.length} vs ${(b as () => void).length} arguments`];
  if (typeof a === 'string') return a.trim() && (b as string).trim() ? [] : [`${path}: empty text`];
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return [`${path}: ${a.length} vs ${bb.length} entries`];
    return a.flatMap((x, i) => shapeDiff(x, bb[i], `${path}[${i}]`));
  }
  if (a && typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b as object);
    const missing = [...ka.filter(k => !kb.includes(k)).map(k => `${path}.${k}: only in Finnish`), ...kb.filter(k => !ka.includes(k)).map(k => `${path}.${k}: only in English`)];
    return [...missing, ...ka.filter(k => kb.includes(k)).flatMap(k => shapeDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`))];
  }
  return [];
}

describe('Finnish and English say the same things', () => {
  it('the check itself notices differences', () => {
    expect(shapeDiff({ a: 'x', f: (n: number) => n }, { b: 'y', f: () => 1 })).toEqual(['.a: only in Finnish', '.b: only in English', '.f: 1 vs 0 arguments']);
    expect(shapeDiff({ list: ['a', 'b'] }, { list: ['a'] })).toEqual(['.list: 2 vs 1 entries']);
    expect(shapeDiff({ s: 'teksti' }, { s: ' ' })).toEqual(['.s: empty text']);
  });
  it.each([
    ['Kasva! game text', TEXT.fi, TEXT.en],
    ['Metsäni text', FOREST_TEXT.fi, FOREST_TEXT.en],
    ['About screen', ABOUT_UI.fi, ABOUT_UI.en],
    ['About sections', aboutSections('fi').map(s => ({ id: s.id, n: s.body.length })), aboutSections('en').map(s => ({ id: s.id, n: s.body.length }))],
    ['class question', QUIZ_UI.fi, QUIZ_UI.en],
    ['class question items', QUIZ.fi, QUIZ.en],
    ['Forest Atlas', ATLAS_TEXT.fi, ATLAS_TEXT.en],
    ['question cards', LAB_TEXT.fi, LAB_TEXT.en],
  ])('%s', (_, fi, en) => {
    expect(shapeDiff(fi, en)).toEqual([]);
  });
});

describe('every id in the game data has its words', () => {
  for (const lang of ['fi', 'en'] as const) {
    it(`Kasva! (${lang})`, () => {
      const x = TEXT[lang] as unknown as { ranks: Record<string, { name: string }>; achievements: Record<string, { name: string }>; storyIntro: string[] };
      for (const r of RANKS) expect(x.ranks[r.id]?.name, `rank ${r.id}`).toBeTruthy();
      for (const a of ACHIEVEMENTS) expect(x.achievements[a.id]?.name, `badge ${a.id}`).toBeTruthy();
      expect(x.storyIntro).toHaveLength(STORY.length);
    });
    it(`Metsäni (${lang})`, () => {
      const t = FOREST_TEXT[lang] as unknown as Record<'species' | 'animals' | 'items' | 'places' | 'soils', Record<string, unknown>>;
      for (const id of Object.keys(SPECIES)) expect(t.species[id], `species ${id}`).toBeTruthy();
      for (const id of ANIMALS) expect(t.animals[id], `animal ${id}`).toBeTruthy();
      for (const id of ITEMS) expect(t.items[id], `item ${id}`).toBeTruthy();
      for (const id of Object.keys(PLACES)) expect(t.places[id], `place ${id}`).toBeTruthy();
      for (const id of Object.keys(SOILS)) expect(t.soils[id], `soil ${id}`).toBeTruthy();
    });
  }
  it('every Atlas event has its words', () => {
    for (const lang of ['fi', 'en'] as const) for (const ev of EVENTS) expect(ATLAS_TEXT[lang].events[ev]?.[1], ev).toBeTruthy();
  });
  it('every question card and measure has its words, and no text is left over', () => {
    for (const lang of ['fi', 'en'] as const) {
      const t = LAB_TEXT[lang];
      expect(Object.keys(t.cards).sort()).toEqual(CARDS.map(c => c.id).sort());
      for (const c of CARDS) expect(t.measures[c.measure]?.name, `${c.id} ${c.measure}`).toBeTruthy();
    }
  });
  it('class question answers point at real options', () => {
    for (const lang of ['fi', 'en'] as const) {
      expect(QUIZ[lang]).toHaveLength(CORRECT.length);
      QUIZ[lang].forEach((q, i) => expect(CORRECT[i]).toBeLessThan(q.options.length));
    }
  });
});
