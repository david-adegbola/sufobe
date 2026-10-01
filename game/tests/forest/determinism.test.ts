/**
 * Same seed + same choices = same forest. The "What if?" twin depends on it:
 * a copy of the forest must get exactly the same weather, so the only
 * difference between the two is the one thing the child changed.
 */
import { describe, expect, it } from 'vitest';
import { PLACES, createForest, plant, run, thin, yearWeather } from '../../src/core/forest';
import { grow } from './helpers';

describe('determinism', () => {
  it('the same seed and choices give an identical forest', () => {
    const a = grow({ spruce: 0.6, birch: 0.4 }, 'clay', 'south', 70, 'same');
    const b = grow({ spruce: 0.6, birch: 0.4 }, 'clay', 'south', 70, 'same');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a different seed gives different weather and a different forest', () => {
    const a = grow({ pine: 1 }, 'sandy', 'east', 40, 'one');
    const b = grow({ pine: 1 }, 'sandy', 'east', 40, 'two');
    expect(a.history.map(r => r.weather.summerRain)).not.toEqual(b.history.map(r => r.weather.summerRain));
    expect(a.ledger.stores.trees).not.toBe(b.ledger.stores.trees);
  });

  it('a twin copied mid-way continues exactly like the original', () => {
    const f = grow({ spruce: 1 }, 'loam', 'east', 30, 'twin');
    const twin = structuredClone(f);
    run(f, 25);
    run(twin, 25);
    expect(JSON.stringify(twin)).toBe(JSON.stringify(f));
  });

  it('a twin with one change gets the same weather, so only the change differs', () => {
    const f = grow({ spruce: 1 }, 'loam', 'east', 30, 'whatif');
    const twin = structuredClone(f);
    thin(twin, 1000);
    run(f, 20);
    run(twin, 20);
    expect(twin.history.map(r => r.weather)).toEqual(f.history.map(r => r.weather));
    expect(twin.trees.length).toBeLessThan(f.trees.length);
  });

  it('weather depends only on the place, seed and year', () => {
    const w1 = yearWeather(PLACES.east, 's', 12);
    const w2 = yearWeather(PLACES.east, 's', 12);
    expect(w1).toEqual(w2);
    // each place has drought summers, and the warmer future has the most
    const share = (p: keyof typeof PLACES) => {
      let n = 0;
      for (let y = 0; y < 400; y++) if (yearWeather(PLACES[p], 'drought', y).drought) n++;
      return n / 400;
    };
    expect(share('future')).toBeGreaterThan(share('east'));
    expect(share('lapland')).toBeGreaterThan(0);
  });

  it('planting is reproducible too, including where each tree stands', () => {
    const a = createForest({ seed: 'p', place: 'east', soil: 'loam' });
    const b = createForest({ seed: 'p', place: 'east', soil: 'loam' });
    plant(a, { pine: 0.5, spruce: 0.3, birch: 0.2 });
    plant(b, { pine: 0.5, spruce: 0.3, birch: 0.2 });
    expect(a.trees).toEqual(b.trees);
    const count = (sp: string) => a.trees.filter(t => t.sp === sp).length;
    expect(count('pine')).toBe(40);
    expect(count('spruce')).toBe(24);
    expect(count('birch')).toBe(16);
  });
});
