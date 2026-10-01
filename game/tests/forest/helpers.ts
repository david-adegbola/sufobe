import {
  createForest, plant, run, type Forest, type PlaceId, type SoilId, type SpeciesId,
} from '../../src/core/forest';

export function grow(sp: Partial<Record<SpeciesId, number>>, soil: SoilId, place: PlaceId, years: number, seed = 'test'): Forest {
  const f = createForest({ seed, place, soil });
  plant(f, sp);
  return run(f, years);
}

/** Average of a stat over several seeds, so one stormy or dry run can't decide a test. */
export function mean(seeds: string[], fn: (seed: string) => number): number {
  return seeds.reduce((a, s) => a + fn(s), 0) / seeds.length;
}

export const SEEDS = ['a', 'b', 'c', 'd'];
