/**
 * Calibration ranges: the forest must behave like a Finnish forest in
 * direction and rough size. Ranges are deliberately wide. They are first
 * estimates to be narrowed against Luke growth tables (docs/forest-model.md,
 * "verify"), not measurements.
 */
import { describe, expect, it } from 'vitest';
import {
  SOILS, SPECIES, createForest, growTree, plant, run, standStats, stepYear, thinToBasalArea, type PlaceId, type SoilId, type Tree,
} from '../../src/core/forest';
import { SEEDS, grow, mean } from './helpers';

type Mix = Parameters<typeof grow>[0];
const vol = (seed: string, sp: Mix, soil: SoilId, place: PlaceId, years: number) =>
  grow(sp, soil, place, years, seed).history.at(-1)!.stats.volume;

describe('stand size after 80 years without management', () => {
  it('spruce on loam in eastern Finland', () => {
    const s = grow({ spruce: 1 }, 'loam', 'east', 80).history.at(-1)!.stats;
    expect(s.volume).toBeGreaterThan(350);
    expect(s.volume).toBeLessThan(600);
    expect(s.domH).toBeGreaterThan(20);
    expect(s.domH).toBeLessThan(28);
    expect(s.G).toBeGreaterThan(30);
    expect(s.G).toBeLessThan(50);
    // crowding killed many of the 2000 planted trees
    expect(s.nHa).toBeLessThan(1200);
  });

  it('pine on sand in eastern Finland', () => {
    const s = grow({ pine: 1 }, 'sandy', 'east', 80).history.at(-1)!.stats;
    expect(s.volume).toBeGreaterThan(200);
    expect(s.volume).toBeLessThan(420);
    expect(s.domH).toBeGreaterThan(15);
    expect(s.domH).toBeLessThan(22);
  });

  it('pine on sand in Lapland grows slowly', () => {
    const s = grow({ pine: 1 }, 'sandy', 'lapland', 80).history.at(-1)!.stats;
    expect(s.volume).toBeGreaterThan(40);
    expect(s.volume).toBeLessThan(180);
  });

  it('tree carbon is about half the dry mass of a believable stand', () => {
    const f = grow({ spruce: 1 }, 'loam', 'east', 80);
    const tC = f.ledger.stores.trees * 25 / 1000;
    expect(tC).toBeGreaterThan(80);
    expect(tC).toBeLessThan(220);
  });
});

describe('directions a child should be able to discover', () => {
  it('soil matters: spruce grows far better on loam than on sand', () => {
    const loam = mean(SEEDS, s => vol(s, { spruce: 1 }, 'loam', 'east', 60));
    const sand = mean(SEEDS, s => vol(s, { spruce: 1 }, 'sandy', 'east', 60));
    expect(loam).toBeGreaterThan(sand * 1.8);
  });

  it('pine copes with sand better than spruce does', () => {
    const pine = mean(SEEDS, s => vol(s, { pine: 1 }, 'sandy', 'east', 60));
    const spruce = mean(SEEDS, s => vol(s, { spruce: 1 }, 'sandy', 'east', 60));
    expect(pine).toBeGreaterThan(spruce * 1.5);
  });

  it('thin rocky soil and undrained peat grow less than sand', () => {
    const sand = mean(SEEDS, s => vol(s, { pine: 1 }, 'sandy', 'east', 60));
    expect(mean(SEEDS, s => vol(s, { pine: 1 }, 'rocky', 'east', 60))).toBeLessThan(sand * 0.75);
    expect(mean(SEEDS, s => vol(s, { pine: 1 }, 'peat', 'east', 60))).toBeLessThan(sand * 0.5);
  });

  it('climate matters: south > east > Lapland', () => {
    const south = mean(SEEDS, s => vol(s, { spruce: 1 }, 'loam', 'south', 60));
    const east = mean(SEEDS, s => vol(s, { spruce: 1 }, 'loam', 'east', 60));
    const lap = mean(SEEDS, s => vol(s, { spruce: 1 }, 'loam', 'lapland', 60));
    expect(south).toBeGreaterThan(east * 1.05);
    expect(east).toBeGreaterThan(lap * 2.5);
  });

  it('birch is the fast starter', () => {
    const birch = mean(SEEDS, s => vol(s, { birch: 1 }, 'loam', 'east', 20));
    const spruce = mean(SEEDS, s => vol(s, { spruce: 1 }, 'loam', 'east', 20));
    expect(birch).toBeGreaterThan(spruce * 1.5);
  });

  it('spruce copes with shade; pine seedlings under an old forest mostly die', () => {
    const survivors = (sp: 'pine' | 'spruce') => {
      const f = createForest({ seed: 'shade', place: 'east', soil: 'loam' });
      plant(f, { spruce: 1 }, 'sparse');
      run(f, 60);
      const firstNew = f.nextId;
      plant(f, { [sp]: 1 }, 'sparse');
      run(f, 20);
      return f.trees.filter(t => t.id >= firstNew).length;
    };
    expect(survivors('spruce')).toBeGreaterThan(survivors('pine') * 2);
  });

  it('a dry summer slows spruce more than pine', () => {
    const relative = (id: 'pine' | 'spruce') => {
      const tree = (): Tree => ({
        id: 1, sp: id, born: 0, age: 30, h: 12, d: 14, c: { wood: 0, foliage: 0, fine: 0 },
        x: 0.5, vigor: 1, rings: [], keep: false,
      });
      const site = { soil: SOILS.loam, warmth: 1, G: 20 };
      const wet = tree(); growTree(wet, 0, { ...site, water: 1 });
      const dry = tree(); growTree(dry, 0, { ...site, water: 0.4 });
      return (dry.d - 14) / (wet.d - 14);
    };
    expect(relative('spruce')).toBeLessThan(relative('pine'));
    expect(SPECIES.pine.droughtTol).toBeGreaterThan(SPECIES.spruce.droughtTol);
  });

  it('thinning makes the remaining trees grow thicker', () => {
    const base = createForest({ seed: 'thin', place: 'east', soil: 'loam' });
    plant(base, { spruce: 1 });
    run(base, 35);
    const twin = structuredClone(base);
    // a typical first thinning: down to about 18 m²/ha, taking the smallest trees
    thinToBasalArea(twin, 18);
    const keepers = twin.trees.map(t => t.id);
    run(base, 15);
    run(twin, 15);
    const growthOf = (f: typeof base) => {
      const ts = f.trees.filter(t => keepers.includes(t.id));
      return ts.reduce((a, t) => a + t.rings.slice(-15).reduce((x, y) => x + y, 0), 0) / ts.length;
    };
    expect(growthOf(twin)).toBeGreaterThan(growthOf(base) * 1.2);
  });

  it('crowded trees grow thin and tall: height keeps up, diameter does not', () => {
    const dense = grow({ spruce: 1 }, 'loam', 'east', 40);
    const sparseF = createForest({ seed: 'test', place: 'east', soil: 'loam' });
    plant(sparseF, { spruce: 1 }, 'sparse');
    run(sparseF, 40);
    const a = standStats(dense.trees);
    const b = standStats(sparseF.trees);
    expect(b.dq).toBeGreaterThan(a.dq);
    expect(Math.abs(a.domH - b.domH)).toBeLessThan(2);
  });

  it('a forest takes carbon out of the air over a rotation', () => {
    const f = grow({ spruce: 1 }, 'loam', 'east', 60);
    expect(f.ledger.stores.air).toBeLessThan(0);
    // and the trees hold most of what was taken
    expect(f.ledger.stores.trees).toBeGreaterThan(-f.ledger.stores.air * 0.5);
  });

  it('every year can be simulated quickly enough to jump ten years at once', () => {
    const f = createForest({ seed: 'speed', place: 'south', soil: 'loam' });
    plant(f, { spruce: 0.5, birch: 0.5 }, 'dense');
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) stepYear(f);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
