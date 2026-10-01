/**
 * Keeping long forests small enough to save. Only the latest year records
 * are read by the simulation and the year report, so years older than the
 * last FULL_YEARS keep just what a timeline needs (year, weather, carbon
 * stores, stand numbers), rounded to 4 significant figures, without the
 * year's flows. The trees, the ledger, products and receipts are untouched,
 * so a compacted forest plays on exactly as before (tests/forest/compact.test.ts).
 */
import type { Forest, YearRecord } from './stand';

export const FULL_YEARS = 20;

const r4 = (x: number) => (Number.isFinite(x) && x !== 0 ? Number(x.toPrecision(4)) : x);

function rounded<T>(v: T): T {
  if (typeof v === 'number') return r4(v) as T;
  if (Array.isArray(v)) return v.map(rounded) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rounded(x)])) as T;
  return v;
}

function slim(r: YearRecord): YearRecord {
  return {
    year: r.year, weather: r.weather, water: r4(r.water), springWater: r4(r.springWater),
    stores: rounded(r.stores), deaths: r.deaths, stats: rounded(r.stats),
    ...(r.events?.length ? { events: r.events } : {}),
    ...(r.newAnimals?.length ? { newAnimals: r.newAnimals } : {}),
  };
}

/** Slim the old year records of a forest, in place. Safe to call again. */
export function compactHistory(f: Forest): void {
  const end = f.history.length - FULL_YEARS;
  for (let i = 0; i < end; i++) if (f.history[i].flows) f.history[i] = slim(f.history[i]);
}
