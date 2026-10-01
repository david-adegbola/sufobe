import { describe, expect, it } from 'vitest';
import { FULL_YEARS, applyChoice, compactHistory, createForest, plant, results, stepYear, type Forest } from '../../src/core/forest';

const ANSWER = { regen: 'plant', young: 'tend', crowded: 'thin', mature: 'clearcut', storm: 'removeFallen', beetle: 'removeBeetle' } as const;
const MIX = { spruce: 0.6, pine: 0.2, birch: 0.2 };

function run(f: Forest, years: number) {
  for (let y = 0; y < years; y++) { if (f.pending) applyChoice(f, ANSWER[f.pending.kind], { mix: MIX }); stepYear(f); }
}

describe('compacting a long forest for saving', () => {
  const grown = () => { const f = createForest({ seed: 'compact', place: 'east', soil: 'loam' }); plant(f, MIX); run(f, 200); return f; };

  it('makes the saved forest much smaller', () => {
    const f = grown();
    const before = JSON.stringify(f).length;
    compactHistory(f);
    const after = JSON.stringify(f).length;
    expect(after).toBeLessThan(before * 0.85); // history is about a third of a long save; receipts stay whole
    expect(f.history).toHaveLength(200);
    expect(f.history.slice(-FULL_YEARS).every(r => r.flows)).toBe(true);
    expect(f.history.slice(0, -FULL_YEARS).every(r => !r.flows)).toBe(true);
  });

  it('a compacted forest, saved and loaded, plays on exactly as the original', () => {
    const a = grown();
    const b = JSON.parse(JSON.stringify(a)) as Forest;
    compactHistory(b);
    const c = JSON.parse(JSON.stringify(b)) as Forest;
    run(a, 60);
    run(c, 60);
    expect(results(c)).toEqual(results(a));
    expect(c.ledger).toEqual(a.ledger);
    expect(c.trees).toEqual(a.trees);
    expect(c.receipts).toEqual(a.receipts);
  });

  it('is safe to repeat', () => {
    const f = grown();
    compactHistory(f);
    const once = JSON.stringify(f);
    compactHistory(f);
    expect(JSON.stringify(f)).toBe(once);
  });
});
