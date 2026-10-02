import { describe, expect, it } from 'vitest';
import {
  STORES, applyChoice, createForest, ensureMyBirch, myBirch, plant, plantMyBirch, stepYear, total, zoomSeason, applyZoom,
  type ChoiceId, type Forest,
} from '../../src/core/forest';
import { growthMods } from '../../src/core/progress';

const MIX = { spruce: 0.6, pine: 0.2, birch: 0.2 };
const ANSWER: Record<string, ChoiceId> = { regen: 'plant', young: 'tend', crowded: 'thin', mature: 'clearcut', storm: 'removeFallen', beetle: 'removeBeetle' };
const run = (f: Forest, years: number) => { for (let y = 0; y < years; y++) { if (f.pending) applyChoice(f, ANSWER[f.pending.kind], { mix: MIX }); stepYear(f); } };
const newForest = (seed = 'birch') => { const f = createForest({ seed, place: 'east', soil: 'loam' }); plant(f, MIX); plantMyBirch(f); return f; };

describe('your birch in the forest', () => {
  it('stands in the middle of a new forest, marked as yours and kept', () => {
    const f = newForest();
    const b = myBirch(f)!;
    expect(b.sp).toBe('birch');
    expect(b.keep).toBe(true);
    expect(b.x).toBe(0.5);
    expect(f.birch).toEqual({ since: 0, x: 0.5, generation: 1 });
  });

  it('thinning and clear-cutting never take it', () => {
    const f = newForest('cuts');
    const id = myBirch(f)!.id;
    let cuts = 0;
    for (let y = 0; y < 140 && cuts < 4; y++) {
      if (f.pending) { if (['thin', 'clearcut'].includes(ANSWER[f.pending.kind])) cuts++; applyChoice(f, ANSWER[f.pending.kind], { mix: MIX }); }
      const before = myBirch(f);
      stepYear(f);
      // if it is gone, it died naturally inside stepYear, never in a cut
      if (before && before.id === id && !f.trees.some(t => t.id === id)) break;
    }
    expect(cuts).toBeGreaterThan(0);
    expect(f.harvests.every(h => h.harvest.count >= 0)).toBe(true);
    // the birch line goes on whatever happened
    expect(myBirch(f)).toBeDefined();
  });

  it('when your birch dies, the line passes to the nearest birch or a seedling', () => {
    const f = newForest('passes');
    run(f, 20);
    const old = myBirch(f)!;
    f.trees = f.trees.filter(t => t !== old); // as if a storm took it
    const change = ensureMyBirch(f);
    expect(['passed', 'seeded']).toContain(change);
    expect(myBirch(f)).toBeDefined();
    expect(f.birch!.generation).toBe(2);
  });

  it('an older forest adopts its tallest birch, or gets a sapling', () => {
    const a = createForest({ seed: 'old', place: 'east', soil: 'loam' });
    plant(a, MIX);
    run(a, 15);
    const tallest = a.trees.filter(t => t.sp === 'birch').sort((x, y) => y.h - x.h)[0];
    expect(ensureMyBirch(a)).toBe('adopted');
    expect(myBirch(a)!.id).toBe(tallest.id);
    const b = createForest({ seed: 'nobirch', place: 'east', soil: 'loam' });
    plant(b, { spruce: 1 });
    expect(ensureMyBirch(b)).toBe('planted');
    expect(myBirch(b)!.sp).toBe('birch');
  });

  it('forests without a birch line are unchanged (the model tests stay valid)', () => {
    const a = createForest({ seed: 'same', place: 'east', soil: 'loam' }); plant(a, MIX);
    const b = createForest({ seed: 'same', place: 'east', soil: 'loam' }); plant(b, MIX);
    run(a, 30); run(b, 30);
    expect(a.trees.some(t => t.mine)).toBe(false);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a summer of your grown birch keeps the carbon books balanced', () => {
    const f = newForest('summer');
    run(f, 12);
    const rec = stepYear(f);
    const b = myBirch(f)!;
    const z = zoomSeason(f, b, rec, growthMods({ roots: 2, leaves: 1, wood: 1 }));
    expect(z.mods.waterMax).toBeGreaterThan(0);
    const t0 = total(f.ledger);
    applyZoom(f, b.id, z.expectedG * 1.5, z.expectedG, rec.year);
    expect(total(f.ledger)).toBeCloseTo(t0, 6);
    expect(STORES.length).toBeGreaterThan(0);
  });
});
