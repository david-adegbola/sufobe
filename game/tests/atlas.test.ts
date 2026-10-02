import { beforeEach, describe, expect, it } from 'vitest';
import { applyChoice, createForest, plant, plantMyBirch, stepYear, type ChoiceId } from '../src/core/forest';
import { simulate } from '../src/core/season';
import { always } from '../src/core/bots';
import { discover, entries, forestFinds, newCount, seasonFinds, seePage } from '../src/app/atlas';
import { forgetCache } from '../src/app/storage';

class Mem {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
beforeEach(() => { (globalThis as { localStorage?: unknown }).localStorage = new Mem(); forgetCache(); });

describe('the Forest Atlas', () => {
  it('a Kasva! summer finds the birch, and heatwaves when there was heat', () => {
    const r = simulate('atlas', always, ['sun', 'heat', 'sun', 'sun', 'sun', 'sun']);
    expect(seasonFinds(r)).toEqual(expect.arrayContaining(['sp:birch', 'ev:heatwave']));
  });

  it('a long forest finds its trees, animals, events and products', () => {
    const f = createForest({ seed: 'atlas', place: 'east', soil: 'loam' });
    plant(f, { spruce: 0.6, pine: 0.2, birch: 0.2 });
    plantMyBirch(f);
    const ANSWER: Record<string, ChoiceId> = { regen: 'plant', young: 'tend', crowded: 'thin', mature: 'clearcut', storm: 'removeFallen', beetle: 'removeBeetle' };
    for (let y = 0; y < 120; y++) { if (f.pending) applyChoice(f, ANSWER[f.pending.kind], { mix: { spruce: 0.6, pine: 0.2, birch: 0.2 } }); stepYear(f); }
    const found = forestFinds(f);
    expect(found).toEqual(expect.arrayContaining(['sp:spruce', 'sp:birch']));
    expect(found.some(id => id.startsWith('an:'))).toBe(true);
    expect(found.some(id => id.startsWith('ev:'))).toBe(true);
    expect(found.some(id => id.startsWith('it:'))).toBe(true);
  });

  it('counts new finds once, until the page is looked at', () => {
    expect(discover(['sp:birch', 'ev:storm'])).toEqual(['sp:birch', 'ev:storm']);
    expect(discover(['sp:birch'])).toEqual([]);
    expect(newCount()).toBe(2);
    const list = entries('species', 'en', []);
    expect(list.find(x => x.id === 'sp:birch')).toMatchObject({ found: true, isNew: true, name: 'Birch' });
    expect(list.find(x => x.id === 'sp:pine')).toMatchObject({ found: false });
    seePage('species', list);
    expect(newCount()).toBe(1);
  });

  it('locked entries say how to find them; badges come from Kasva!', () => {
    const [locked] = entries('animals', 'fi', []);
    expect(locked.found).toBe(false);
    expect(locked.text).toMatch(/metsääsi/);
    const badges = entries('badges', 'en', ['first-ring']);
    expect(badges.find(x => x.id === 'first-ring')!.found).toBe(true);
  });
});
