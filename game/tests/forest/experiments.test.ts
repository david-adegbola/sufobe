import { describe, expect, it } from 'vitest';
import { CARDS, HA_FACTOR, SAME_MARGIN, SOILS, cardById, runCard, startTwin, total, verdict } from '../../src/core/forest';

// Every card's answer comes from the model. These seeds are the card's own
// plus eight others, so a class with different weather still gets the same answer.
const SEEDS = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8'];

describe('question cards (Phase 8)', () => {
  it('has twelve cards with unique ids, and the two forests differ in exactly one thing', () => {
    expect(CARDS).toHaveLength(12);
    expect(new Set(CARDS.map(c => c.id)).size).toBe(12);
    for (const c of CARDS) {
      const keys = new Set([...Object.keys(c.a), ...Object.keys(c.b)]);
      expect(keys.size, c.id).toBe(1);
      const k = [...keys][0] as keyof typeof c.a;
      expect(JSON.stringify(c.a[k]), c.id).not.toBe(JSON.stringify(c.b[k]));
    }
  });

  for (const c of CARDS) {
    it(`"${c.id}": the model gives "${c.answer}" for every seed`, () => {
      for (const s of [c.seed, ...SEEDS]) expect(runCard(c, s).result, `${c.id} ${s}`).toBe(c.answer);
    });
  }

  it('both forests get the same weather', () => {
    const r = runCard(cardById('thinning')!);
    expect(r.ta.f.history.map(h => h.weather)).toEqual(r.tb.f.history.map(h => h.weather));
  });

  it('is deterministic, and keeps the carbon books balanced', () => {
    const c = cardById('continuous')!;
    const r1 = runCard(c);
    const r2 = runCard(c);
    expect(r1.a).toBe(r2.a);
    expect(r1.b).toBe(r2.b);
    for (const t of [r1.ta, r1.tb]) {
      // nothing made or lost: the total is still the soil carbon the forest started with
      const start = SOILS[t.f.soil].soilC0 * 1000 / HA_FACTOR;
      expect(Math.abs(total(t.f.ledger) - start)).toBeLessThan(1e-6 * start);
    }
  });

  it('starts the experiment after the shared years, with no question waiting', () => {
    const t = startTwin(cardById('woodpecker')!, 'a');
    expect(t.start).toBe(80);
    expect(t.f.pending).toBeNull();
    const r = runCard(cardById('woodpecker')!);
    expect(r.ta.f.trees.length).toBeGreaterThan(0); // the clearcut was replanted
  });

  it('calls results within the margin "about the same"', () => {
    expect(verdict(100, 100 * (1 - SAME_MARGIN / 2))).toBe('same');
    expect(verdict(100, 80)).toBe('a');
    expect(verdict(0, 5)).toBe('b');
    expect(verdict(0, 0)).toBe('same');
  });
});
