/**
 * Metsäni climate: four places, and each year's weather drawn from the seed.
 *
 * Weather depends only on (place, seed, year), never on what the player did,
 * so a "What if?" twin always gets exactly the same weather as the original.
 *
 * All numbers are rounded, simplified values marked "verify" in
 * docs/forest-model.md (to be checked against FMI climate statistics).
 */
import { makeRng } from '../rng';

export type PlaceId = 'south' | 'east' | 'lapland' | 'future';

export interface Climate {
  id: PlaceId;
  /** effective temperature sum, degree-days above +5 °C */
  tempSum: number;
  /** growing season length, days */
  seasonDays: number;
  /** June–August rain, mm */
  summerRain: number;
  /** snow water at the end of winter, mm */
  snowWater: number;
  /** chance that a summer is a drought summer */
  droughtChance: number;
}

export const PLACES: Record<PlaceId, Climate> = {
  south:   { id: 'south',   tempSum: 1400, seasonDays: 180, summerRain: 210, snowWater: 60,  droughtChance: 0.14 },
  east:    { id: 'east',    tempSum: 1250, seasonDays: 165, summerRain: 220, snowWater: 120, droughtChance: 0.10 },
  lapland: { id: 'lapland', tempSum: 850,  seasonDays: 125, summerRain: 190, snowWater: 190, droughtChance: 0.06 },
  future:  { id: 'future',  tempSum: 1600, seasonDays: 195, summerRain: 200, snowWater: 50,  droughtChance: 0.28 },
};

/** The reference place: growth rates in species.ts are for this climate. */
export const REFERENCE_TEMPSUM = PLACES.east.tempSum;

export interface YearWeather {
  tempSum: number;
  summerRain: number;
  snowWater: number;
  drought: boolean;
}

/** Roughly normal noise (mean 0, sd 1) from four uniforms. */
function noise(rng: () => number): number {
  return (rng() + rng() + rng() + rng() - 2) * 1.732;
}

export function yearWeather(c: Climate, seed: string, year: number): YearWeather {
  const rng = makeRng(`${seed}|w|${year}`);
  const drought = rng() < c.droughtChance;
  let tempSum = c.tempSum * (1 + 0.07 * noise(rng));
  let summerRain = c.summerRain * Math.max(0.3, 1 + 0.25 * noise(rng));
  const snowWater = c.snowWater * Math.max(0.2, 1 + 0.3 * noise(rng));
  if (drought) {
    summerRain *= 0.45;
    tempSum *= 1.06;
  }
  return { tempSum, summerRain, snowWater, drought };
}

/**
 * How much the warmth of a summer speeds growth, relative to eastern Finland.
 * Growth in Finland follows the temperature sum closely; below about
 * 500 degree-days trees hardly grow at all.
 */
export function warmthFactor(tempSum: number): number {
  return Math.pow(Math.max(0.02, (tempSum - 500) / (REFERENCE_TEMPSUM - 500)), 1.3);
}

/** Decomposers also work faster in warmth (gentler than growth). */
export function decayWarmth(tempSum: number): number {
  return Math.exp(0.0015 * (tempSum - REFERENCE_TEMPSUM));
}
