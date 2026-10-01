/**
 * No dominant strategy: the forest version of Kasva!'s "holding all the time
 * must not win". Over a century, no way of managing the forest may be best
 * on all five results. If one ever is, the game would be teaching a single
 * right answer, and the tuning is wrong.
 */
import { describe, expect, it } from 'vitest';
import { STORES, total, treesCarbon } from '../../src/core/forest';
import { STRATEGIES, play, type Outcome } from './strategies';

const SEEDS = ['s1', 's2', 's3', 's4'];
const KEYS: (keyof Outcome)[] = ['wood', 'carbon', 'life', 'health', 'products'];

function averaged(place: 'east' | 'south' = 'east', soil: 'loam' | 'sandy' = 'loam') {
  return STRATEGIES.map(s => {
    const sum: Outcome = { wood: 0, carbon: 0, life: 0, health: 0, products: 0 };
    for (const seed of SEEDS) {
      const { o } = play(s, seed, 100, place, soil);
      for (const k of KEYS) sum[k] += o[k] / SEEDS.length;
    }
    return { name: s.name, o: sum };
  });
}

describe('trade-offs between ways of managing a forest', () => {
  for (const [place, soil] of [['east', 'loam'], ['south', 'sandy']] as const) {
    it(`no strategy wins all five results (${place}, ${soil})`, () => {
      const table = averaged(place, soil);
      // printed so a person can read the trade-offs (docs/forest-model.md)
      console.log(`\n${place}/${soil}\n` + table.map(r => `${r.name.padEnd(11)} ${KEYS.map(k => `${k} ${r.o[k].toFixed(k === 'life' || k === 'health' ? 2 : 0)}`).join('  ')}`).join('\n'));
      for (const a of table) {
        const beatenSomewhere = KEYS.some(k => table.some(b => b !== a && b.o[k] > a.o[k] * 1.02 + 0.01));
        expect(beatenSomewhere, `${a.name} is best on everything`).toBe(true);
      }
      // and each result has a different winner from at least one other result
      const winners = new Set(KEYS.map(k => table.reduce((m, r) => (r.o[k] > m.o[k] ? r : m)).name));
      expect(winners.size).toBeGreaterThanOrEqual(2);
    });
  }

  it('leaving the forest alone stores the most carbon and gives no products', () => {
    const t = averaged();
    const never = t.find(r => r.name === 'never')!;
    expect(never.o.products).toBe(0);
    for (const r of t) if (r !== never) expect(never.o.carbon).toBeGreaterThan(r.o.carbon);
  });

  it('a short rotation gives less life than leaving trees, deadwood or continuous cover', () => {
    const t = averaged();
    const early = t.find(r => r.name === 'early')!;
    for (const name of ['never', 'retention', 'continuous']) expect(early.o.life).toBeLessThan(t.find(r => r.name === name)!.o.life);
  });

  it('growing trees longer gives far more sawn wood (houses, tables) than a short rotation', () => {
    const sawn = (name: string) => SEEDS.reduce((a, seed) => {
      const { f } = play(STRATEGIES.find(s => s.name === name)!, seed, 100);
      return a + f.harvests.reduce((x, h) => x + h.harvest.products.sawn, 0);
    }, 0);
    expect(sawn('rotation')).toBeGreaterThan(sawn('early') * 2);
  });

  it('carbon is conserved through every strategy, with storms, beetles, salvage and seeding', () => {
    for (const s of STRATEGIES) {
      const { f } = play(s, 'cons', 120);
      const start = f.history[0] ? total({ stores: f.history[0].stores, flows: {} }) : 0;
      expect(Math.abs(total(f.ledger) - start)).toBeLessThan(1e-6 * Math.abs(start));
      expect(Math.abs(f.ledger.stores.trees - treesCarbon(f))).toBeLessThan(1e-6);
      for (const k of STORES) if (k !== 'air') expect(f.ledger.stores[k]).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});
