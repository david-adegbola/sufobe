/**
 * Carbon is never created or lost, only moved: the lesson of the whole mode.
 * These tests check it every year, through growth, death, decay, thinning,
 * clear-cutting and products, on every soil and in every place.
 */
import { describe, expect, it } from 'vitest';
import {
  PLACES, SOILS, STORES, clearcut, createForest, markKeep, plant, stepYear, thin, thinToBasalArea,
  total, treesCarbon, type Forest, type PlaceId, type SoilId, type Store,
} from '../../src/core/forest';

function check(f: Forest, start: number) {
  const s = f.ledger.stores;
  expect(Math.abs(total(f.ledger) - start)).toBeLessThan(1e-6 * Math.max(1, Math.abs(start)));
  expect(Math.abs(s.trees - treesCarbon(f))).toBeLessThan(1e-6);
  const pools = f.pools.sawn + f.pools.paper + f.pools.textile + f.pools.energy;
  expect(Math.abs(s.products - pools)).toBeLessThan(1e-6);
  // every product lot is accounted for in the products store
  expect(Math.abs(s.products - f.lots.reduce((a, l) => a + l.c, 0))).toBeLessThan(1e-6);
  for (const k of STORES) if (k !== 'air') expect(s[k]).toBeGreaterThanOrEqual(-1e-9);
  for (const t of f.trees) {
    expect(t.c.wood).toBeGreaterThanOrEqual(0);
    expect(t.c.foliage).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(t.d) && Number.isFinite(t.h)).toBe(true);
  }
}

/** A managed rotation: plant, tend, thin twice, keep some trees, clear-cut, replant. */
function rotation(place: PlaceId, soil: SoilId, seed: string) {
  const f = createForest({ seed, place, soil });
  const start = total(f.ledger);
  plant(f, { spruce: 0.5, pine: 0.3, birch: 0.2 }, 'dense');
  check(f, start);
  for (let y = 1; y <= 110; y++) {
    stepYear(f);
    if (y === 12) thin(f, 1800, 'tend');
    if (y === 35) thinToBasalArea(f, 18);
    if (y === 55) thin(f, 500);
    if (y === 79) markKeep(f, 1);
    if (y === 80) { clearcut(f); plant(f, { pine: 1 }); }
    check(f, start);
  }
  return f;
}

describe('carbon conservation', () => {
  for (const place of Object.keys(PLACES) as PlaceId[]) {
    for (const soil of Object.keys(SOILS) as SoilId[]) {
      it(`holds every year: ${place}, ${soil}`, () => {
        const f = rotation(place, soil, `${place}-${soil}`);
        expect(f.harvests.length).toBeGreaterThan(0);
      });
    }
  }

  it('each year’s recorded flows explain the change in every store', () => {
    const f = rotation('east', 'loam', 'flows');
    // replay without management so every flow is inside stepYear
    const g = createForest({ seed: 'flows2', place: 'south', soil: 'clay' });
    plant(g, { birch: 1 });
    for (let i = 0; i < 60; i++) stepYear(g);
    for (const forest of [f, g]) {
      for (let i = 1; i < forest.history.length; i++) {
        const prev = forest.history[i - 1].stores;
        const rec = forest.history[i];
        const change: Record<string, number> = {};
        for (const [k, v] of Object.entries(rec.flows ?? {})) {
          const [from, to] = k.split('>') as [Store, Store];
          change[from] = (change[from] ?? 0) - v;
          change[to] = (change[to] ?? 0) + v;
        }
        for (const k of STORES) {
          expect(rec.stores[k] - prev[k]).toBeCloseTo(change[k] ?? 0, 6);
        }
      }
    }
  });

  it('harvested carbon goes to products, litter and deadwood, not into thin air', () => {
    const f = createForest({ seed: 'cut', place: 'east', soil: 'loam' });
    plant(f, { spruce: 1 });
    for (let i = 0; i < 70; i++) stepYear(f);
    const before = { ...f.ledger.stores };
    const h = clearcut(f);
    const s = f.ledger.stores;
    expect(s.trees).toBeCloseTo(0, 9);
    expect(s.air).toBe(before.air); // the cutting itself releases nothing; burning comes later
    expect(s.products - before.products).toBeCloseTo(h.products.sawn + h.products.paper + h.products.textile + h.products.energy, 6);
    expect(h.sawlogC).toBeGreaterThan(0);
    expect(h.pulpwoodC).toBeGreaterThan(0);
  });

  it('energy wood returns to the air within the year; sawn wood lasts much longer than paper', () => {
    const f = createForest({ seed: 'prod', place: 'east', soil: 'loam' });
    plant(f, { spruce: 1 });
    f.recycle = false; // half-lives alone; recycling is tested in products.test.ts
    for (let i = 0; i < 80; i++) stepYear(f);
    clearcut(f);
    stepYear(f);
    expect(f.pools.energy).toBeCloseTo(0, 9);
    for (let i = 0; i < 10; i++) stepYear(f);
    // after 11 years: paper (half-life 2) almost gone, sawn wood (35) mostly left
    const sawnLeft = f.pools.sawn / f.harvests[0].harvest.products.sawn;
    const paperLeft = f.pools.paper / f.harvests[0].harvest.products.paper;
    expect(sawnLeft).toBeGreaterThan(0.75);
    expect(paperLeft).toBeLessThan(0.05);
  });
});
