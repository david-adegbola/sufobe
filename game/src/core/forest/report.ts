/**
 * The year report: one short card after each year. It picks the single most
 * notable cause and effect of the year (a storm, beetles, your thinning, a
 * new animal, a dry summer, fast growth…) and shows which way each of the
 * five results moved. The words live in the app; this decides what to say.
 */
import type { Results } from './indicators';
import type { AnimalId, Forest, YearRecord } from './stand';

export type ResultKey = 'wood' | 'carbon' | 'life' | 'health' | 'products';

export type CauseKey =
  | 'storm' | 'beetle' | 'thinned' | 'clearcut' | 'cc' | 'salvaged' | 'tended' | 'planted' | 'seedlings'
  | 'animal' | 'drought' | 'moose' | 'grewFast' | 'grewSlow' | 'crowded' | 'calm';

export interface YearReport {
  year: number;
  drought: boolean;
  cause: CauseKey;
  /** a number the sentence needs (trees fallen, trees killed, …) */
  n: number;
  animal?: AnimalId;
  arrows: Record<ResultKey, -1 | 0 | 1>;
  newAnimals: AnimalId[];
}

function dir(a: number, b: number, tol: number): -1 | 0 | 1 {
  return b > a + tol ? 1 : b < a - tol ? -1 : 0;
}

export function yearReport(f: Forest, rec: YearRecord, before: Results | null, after: Results): YearReport {
  const ev = (k: string) => rec.events?.find(e => e.kind === k)?.count ?? 0;
  const acted = f.harvests.filter(h => h.year === rec.year).map(h => h.kind);
  const plantedNow = f.trees.some(t => t.born === rec.year && t.age <= 3) && rec.year > 0;
  const i = f.history.indexOf(rec);
  const inc = (k: number) => k > 0 ? f.history[k].stats.volume - f.history[k - 1].stats.volume : 0;
  const thisInc = inc(i);
  const recent = [1, 2, 3, 4, 5].map(k => inc(i - k)).filter(x => x > 0);
  const avgInc = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const newAnimals = rec.newAnimals ?? [];

  let cause: CauseKey = 'calm';
  let n = 0;
  if (ev('storm')) { cause = 'storm'; n = ev('storm'); }
  else if (ev('beetle')) { cause = 'beetle'; n = ev('beetle'); }
  else if (acted.includes('clearcut')) cause = 'clearcut';
  else if (acted.includes('cc')) cause = 'cc';
  else if (acted.includes('thin')) cause = 'thinned';
  else if (acted.includes('salvage')) cause = 'salvaged';
  else if (acted.includes('tend')) cause = 'tended';
  else if (newAnimals.length) cause = 'animal';
  else if (rec.weather.drought) cause = 'drought';
  else if (ev('moose')) { cause = 'moose'; n = ev('moose'); }
  else if (plantedNow) cause = 'planted';
  else if (f.regenUntil !== null) cause = 'seedlings';
  else if (avgInc > 1 && thisInc > avgInc * 1.15) cause = 'grewFast';
  else if (avgInc > 1 && thisInc < avgInc * 0.85) cause = 'grewSlow';
  else if (after.health.reason === 'crowded') cause = 'crowded';

  const sum = (r: Results) => r.products.sawn + r.products.paper + r.products.energy;
  const arrows: YearReport['arrows'] = before
    ? {
      wood: dir(before.wood.standing, after.wood.standing, 0.5),
      carbon: dir(before.carbon.removed, after.carbon.removed, 0.5),
      life: dir(before.life.score, after.life.score, 0.01),
      health: dir(before.health.score, after.health.score, 0.01),
      products: dir(sum(before), sum(after), 0.01),
    }
    : { wood: 0, carbon: 0, life: 0, health: 0, products: 0 };
  return { year: rec.year, drought: rec.weather.drought, cause, n, animal: newAnimals[0], arrows, newAnimals };
}
