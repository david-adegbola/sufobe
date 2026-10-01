/** The five results respond to the things a child can change. */
import { describe, expect, it } from 'vitest';
import { createForest, plant, results, run } from '../../src/core/forest';
import { SEEDS, grow, mean } from './helpers';

describe('five results', () => {
  it('a mixed forest has more life than a single-species one', () => {
    const mixed = mean(SEEDS, s => results(grow({ spruce: 0.5, pine: 0.25, birch: 0.25 }, 'loam', 'east', 40, s)).life.score);
    const mono = mean(SEEDS, s => results(grow({ spruce: 1 }, 'loam', 'east', 40, s)).life.score);
    expect(mixed).toBeGreaterThan(mono + 0.5);
  });

  it('life grows as a forest gets old and gathers deadwood', () => {
    const young = results(grow({ spruce: 1 }, 'loam', 'east', 15));
    const old = results(grow({ spruce: 1 }, 'loam', 'east', 110));
    expect(old.life.score).toBeGreaterThan(young.life.score);
    expect(old.life.deadwoodM3).toBeGreaterThan(young.life.deadwoodM3);
    expect(young.life.reason).toBe('young');
  });

  it('a dense unthinned stand is less healthy than a sparse one, and says it is crowded', () => {
    const f = createForest({ seed: 'h', place: 'east', soil: 'loam' });
    plant(f, { spruce: 1 }, 'dense');
    run(f, 25);
    const g = createForest({ seed: 'h', place: 'east', soil: 'loam' });
    plant(g, { spruce: 1 }, 'sparse');
    run(g, 25);
    expect(results(f).health.crowding).toBeGreaterThan(results(g).health.crowding);
    expect(results(f).health.score).toBeLessThan(results(g).health.score);
    expect(results(f).health.reason).toBe('crowded');
  });

  it('spruce on dry sand shows drought stress; on loam it does not', () => {
    const sand = mean(SEEDS, s => results(grow({ spruce: 1 }, 'sandy', 'east', 70, s)).health.water);
    const loam = mean(SEEDS, s => results(grow({ spruce: 1 }, 'loam', 'east', 70, s)).health.water);
    expect(loam).toBeGreaterThan(sand);
  });

  it('wood and carbon: loam beats sand for spruce, which a child can read off the results', () => {
    const a = results(grow({ spruce: 1 }, 'loam', 'east', 30));
    const b = results(grow({ spruce: 1 }, 'sandy', 'east', 30));
    expect(a.wood.standing).toBeGreaterThan(b.wood.standing * 2);
    expect(a.carbon.trees).toBeGreaterThan(b.carbon.trees * 2);
    expect(a.products.paper).toBe(0);
  });

  it('scores stay inside 0.5–5', () => {
    for (const s of SEEDS) {
      const r = results(grow({ pine: 1 }, 'rocky', 'lapland', 20, s));
      for (const v of [r.life.score, r.health.score]) { expect(v).toBeGreaterThanOrEqual(0.5); expect(v).toBeLessThanOrEqual(5); }
    }
  });
});
