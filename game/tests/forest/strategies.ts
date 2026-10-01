/**
 * Scripted forest managers for the trade-off tests. Each answers Tikka's
 * questions in its own way; `early` also clear-cuts young stands on its own.
 */
import {
  CO2_PER_C, HA_FACTOR, applyChoice, clearcut, createForest, plant, results, standStats, stepYear,
  type ChoiceId, type Decision, type Forest,
} from '../../src/core/forest';

export interface Strategy { name: string; answer(d: Decision, f: Forest): ChoiceId; each?(f: Forest): void }

const MIX = { spruce: 0.6, pine: 0.2, birch: 0.2 };

export const STRATEGIES: Strategy[] = [
  {
    name: 'never',
    answer: d => (d.kind === 'regen' ? 'seed' : d.kind === 'storm' ? 'leaveFallen' : d.kind === 'beetle' ? 'leaveBeetle' : d.kind === 'mature' ? 'leaveOld' : 'nothing'),
  },
  {
    name: 'rotation',
    answer: d => ({ regen: 'plant', young: 'tend', crowded: 'thin', mature: 'clearcut', storm: 'removeFallen', beetle: 'removeBeetle' } as const)[d.kind],
  },
  {
    name: 'early',
    answer: d => ({ regen: 'plant', young: 'nothing', crowded: 'nothing', mature: 'clearcut', storm: 'removeFallen', beetle: 'removeBeetle' } as const)[d.kind],
    // a short rotation: clear-cut as soon as the trees make pulpwood
    each: f => {
      if (!f.pending && f.trees.length && standStats(f.trees).dq >= 15) { clearcut(f); plant(f, MIX); }
    },
  },
  {
    name: 'continuous',
    answer: d => ({ regen: 'seed', young: 'tend', crowded: 'thin', mature: 'cc', storm: 'removeHalf', beetle: 'removeBeetle' } as const)[d.kind],
  },
  {
    name: 'retention',
    answer: d => ({ regen: 'seed', young: 'tend', crowded: 'thinLight', mature: 'clearcutKeep', storm: 'leaveFallen', beetle: 'leaveBeetle' } as const)[d.kind],
  },
];

export interface Outcome { wood: number; carbon: number; life: number; health: number; products: number }

/** Play a strategy for `years` and score the five results over the whole run. */
export function play(s: Strategy, seed: string, years = 100, place: Forest['place'] = 'east', soil: Forest['soil'] = 'loam'): { f: Forest; o: Outcome } {
  const f = createForest({ seed, place, soil });
  plant(f, MIX);
  let life = 0;
  let health = 0;
  for (let y = 0; y < years; y++) {
    if (f.pending) applyChoice(f, s.answer(f.pending, f), { mix: MIX });
    s.each?.(f);
    stepYear(f);
    const r = results(f);
    life += r.life.score / years;
    health += r.health.score / years;
  }
  const r = results(f);
  const madeCO2 = f.harvests.reduce((a, h) => a + h.harvest.products.sawn + h.harvest.products.paper + h.harvest.products.energy, 0) * HA_FACTOR / 1000 * CO2_PER_C;
  return {
    f,
    o: {
      wood: r.wood.standing + r.wood.harvested,
      carbon: r.carbon.removed,
      life,
      health,
      products: madeCO2,
    },
  };
}
