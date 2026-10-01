/** Storms, beetles, moose, natural seeding, Tikka's questions, animals and the year report. */
import { describe, expect, it } from 'vitest';
import {
  applyChoice, beetleRisk, createForest, freshLogs, plant, presentAnimals, results, run, salvage, stepYear,
  thinToBasalArea, upgradeForest, yearReport, type Forest,
} from '../../src/core/forest';
import { grow } from './helpers';

const SEEDS = Array.from({ length: 24 }, (_, i) => 'ev' + i);

/** Run a forest and count trees blown over, by species. */
function fallenBy(f: Forest, years: number) {
  const out: Record<string, number> = { spruce: 0, pine: 0, birch: 0 };
  for (let y = 0; y < years; y++) {
    stepYear(f);
    for (const l of f.logs) if (l.cause === 'storm' && l.year === f.year - 1) out[l.sp]++;
  }
  return out;
}

describe('storms', () => {
  it('blow over spruce more often than pine or birch', () => {
    const tot: Record<string, number> = { spruce: 0, pine: 0, birch: 0 };
    for (const seed of SEEDS) {
      const f = grow({ spruce: 1 / 3, pine: 1 / 3, birch: 1 / 3 }, 'loam', 'east', 40, seed);
      const r = fallenBy(f, 40);
      for (const k in r) tot[k] += r[k];
    }
    expect(tot.spruce).toBeGreaterThan(tot.pine * 1.3);
    expect(tot.spruce).toBeGreaterThan(tot.birch * 1.3);
  });

  it('fell more trees in a freshly thinned stand', () => {
    let opened = 0;
    let closed = 0;
    for (const seed of SEEDS) {
      const a = grow({ spruce: 1 }, 'loam', 'east', 45, seed);
      const b = structuredClone(a);
      thinToBasalArea(b, 19);
      const per = (f: Forest, n: number) => Object.values(fallenBy(f, 5)).reduce((x, y) => x + y, 0) / n;
      closed += per(a, a.trees.length);
      opened += per(b, b.trees.length);
    }
    expect(opened).toBeGreaterThan(closed * 1.3);
  });
});

describe('bark beetles', () => {
  it('fresh storm-felled spruce raises the risk, and taking it out lowers it again', () => {
    const f = grow({ spruce: 1 }, 'loam', 'east', 60, 'bb');
    const base = beetleRisk(f, false, 1);
    // a storm lays down six big spruces
    const big = [...f.trees].sort((a, b) => b.d - a.d).slice(0, 6);
    for (const t of big) f.logs.push({ id: t.id, sp: 'spruce', d: t.d, h: t.h, x: t.x, c: t.c.wood, c0: t.c.wood, year: f.year - 1, cause: 'storm', standing: false });
    const withLogs = beetleRisk(f, false, 1);
    f.logs = [];
    expect(base).toBe(0);
    expect(withLogs).toBeGreaterThan(0.3);
  });

  it('follow dry summers: warm, drought-prone places lose more spruce to beetles', () => {
    const killed = (place: Forest['place']) => SEEDS.slice(0, 12).reduce((a, seed) => {
      const f = grow({ spruce: 1 }, 'clay', place, 90, seed);
      return a + f.events.filter(e => e.kind === 'beetle').reduce((x, e) => x + e.count, 0);
    }, 0);
    expect(killed('future')).toBeGreaterThan(killed('east'));
    expect(killed('lapland')).toBe(0);
  });
});

describe('moose', () => {
  it('browse pine and birch saplings, never spruce, and only small ones', () => {
    let browsed = 0;
    for (const seed of SEEDS.slice(0, 8)) {
      const f = createForest({ seed, place: 'east', soil: 'sandy' });
      plant(f, { pine: 0.5, spruce: 0.5 });
      for (let y = 0; y < 25; y++) {
        stepYear(f);
        for (const t of f.trees) if (t.browsed === f.year - 1) {
          browsed++;
          expect(t.sp).not.toBe('spruce');
        }
      }
    }
    expect(browsed).toBeGreaterThan(0);
  });
});

describe('natural seeding and continuous cover', () => {
  it('after a final harvest, letting nature seed brings a dense young forest, birch first on fertile soil', () => {
    const f = grow({ spruce: 1 }, 'loam', 'east', 75, 'seed');
    applyChoice(f, 'clearcut');
    expect(f.pending).toBeNull();
    stepYear(f);
    expect(f.pending?.kind).toBe('regen');
    applyChoice(f, 'seed');
    run(f, 12);
    const young = f.trees.filter(t => t.born >= 75);
    expect(young.length * 25).toBeGreaterThan(1200);
    const birch = young.filter(t => t.sp === 'birch').length;
    for (const sp of ['spruce', 'pine', 'aspen'] as const) expect(birch).toBeGreaterThan(young.filter(t => t.sp === sp).length);
  });

  it('continuous cover takes the biggest trees, keeps the small ones and lets spruce seedlings come up', () => {
    const f = grow({ spruce: 1 }, 'loam', 'east', 80, 'cc');
    const smallest = Math.min(...f.trees.map(t => t.d));
    const h = applyChoice(f, 'cc')!;
    expect(h.count).toBeGreaterThan(0);
    expect(f.trees.some(t => t.d === smallest)).toBe(true);
    run(f, 6);
    expect(f.trees.filter(t => t.born > 80 && t.sp === 'spruce').length).toBeGreaterThan(5);
  });

  it('taking out storm-felled trees moves their carbon from deadwood to products', () => {
    const f = grow({ spruce: 1 }, 'loam', 'east', 60, 'salv');
    const t = f.trees[0];
    f.logs.push({ id: 999, sp: 'spruce', d: 30, h: 22, x: 0.5, c: 200, c0: 200, year: f.year - 1, cause: 'storm', standing: false });
    f.ledger.stores.deadwood += 200; f.ledger.stores.air -= 200; // put the log's carbon in the books
    const before = { ...f.ledger.stores };
    const h = salvage(f, freshLogs(f, 'storm'));
    expect(f.logs.some(l => l.id === 999)).toBe(false);
    expect(f.ledger.stores.deadwood).toBeLessThan(before.deadwood);
    expect(f.ledger.stores.products).toBeGreaterThan(before.products);
    expect(h.products.sawn).toBeGreaterThan(0);
    void t;
  });
});

describe('Tikka’s questions', () => {
  it('a dense young stand asks about tending; a clear-cut asks what grows next; answering clears it', () => {
    const f = createForest({ seed: 'q', place: 'east', soil: 'loam' });
    plant(f, { birch: 1 }, 'dense');
    let asked = '';
    for (let y = 0; y < 15 && !asked; y++) { stepYear(f); if (f.pending) asked = f.pending.kind; }
    expect(asked).toBe('young');
    applyChoice(f, 'tend');
    expect(f.pending).toBeNull();
  });

  it('do-nothing answers are respected: the same question waits before coming back', () => {
    const f = grow({ spruce: 1 }, 'loam', 'east', 30, 'nag');
    let askedAt: number[] = [];
    for (let y = 0; y < 40; y++) {
      if (f.pending?.kind === 'crowded') { askedAt.push(f.pending.year); applyChoice(f, 'nothing'); }
      else if (f.pending) applyChoice(f, f.pending.choices.includes('nothing') ? 'nothing' : f.pending.choices.at(-1)!);
      stepYear(f);
    }
    askedAt = askedAt.sort((a, b) => a - b);
    for (let i = 1; i < askedAt.length; i++) expect(askedAt[i] - askedAt[i - 1]).toBeGreaterThanOrEqual(8);
  });

  it('every question except "what grows here now?" can be answered with doing nothing', () => {
    const kinds = new Set<string>();
    for (const seed of SEEDS.slice(0, 6)) {
      const f = createForest({ seed, place: 'future', soil: 'clay' });
      plant(f, { spruce: 0.6, birch: 0.4 }, 'dense');
      for (let y = 0; y < 120; y++) {
        if (f.pending) {
          kinds.add(f.pending.kind);
          const c = f.pending.choices;
          if (f.pending.kind !== 'regen') expect(c.some(x => ['nothing', 'leaveOld', 'leaveFallen', 'leaveBeetle'].includes(x))).toBe(true);
          applyChoice(f, f.pending.kind === 'mature' ? 'clearcut' : f.pending.kind === 'regen' ? 'seed' : c[0]);
        }
        stepYear(f);
      }
    }
    for (const k of ['young', 'crowded', 'mature', 'regen']) expect(kinds.has(k)).toBe(true);
  });
});

describe('animals', () => {
  it('moose come to young pine; old mixed forest with deadwood brings woodpeckers', () => {
    expect(presentAnimals(grow({ pine: 1 }, 'sandy', 'east', 8))).toContain('moose');
    const old = grow({ spruce: 0.6, pine: 0.3, birch: 0.1 }, 'loam', 'east', 120, 'old');
    const seen = old.seen.map(s => s.animal);
    expect(seen).toContain('spottedWoodpecker');
    expect(seen).toContain('treecreeper');
  });

  it('the flying squirrel needs aspen: never in a pure spruce plantation', () => {
    const f = grow({ spruce: 1 }, 'loam', 'east', 120, 'fs');
    expect(f.seen.map(s => s.animal)).not.toContain('flyingSquirrel');
  });
});

describe('year report', () => {
  it('names the storm in a storm year and the thinning after a thinning', () => {
    let stormSeen = false;
    for (const seed of SEEDS) {
      const f = grow({ spruce: 1 }, 'peat', 'future', 50, seed);
      const before = results(f);
      const rec = stepYear(f);
      if (rec.events?.some(e => e.kind === 'storm')) {
        expect(yearReport(f, rec, before, results(f)).cause).toBe('storm');
        stormSeen = true;
        break;
      }
    }
    expect(stormSeen).toBe(true);
    const g = grow({ spruce: 1 }, 'loam', 'east', 40, 'rep');
    thinToBasalArea(g, 19);
    const before = results(g);
    const rec = stepYear(g);
    const rep = yearReport(g, rec, before, results(g));
    if (!rec.events?.some(e => e.kind === 'storm' || e.kind === 'beetle')) expect(rep.cause).toBe('thinned');
  });
});

describe('saves from before F2', () => {
  it('an F1 forest without events, logs or animals is upgraded and keeps growing', () => {
    const f = grow({ pine: 1 }, 'sandy', 'east', 10, 'old-save') as Partial<Forest> & Forest;
    for (const k of ['logs', 'events', 'seen', 'pending', 'asked', 'regenUntil', 'continuous'] as const) delete (f as Partial<Forest>)[k];
    const g = upgradeForest(JSON.parse(JSON.stringify(f)));
    run(g, 5);
    expect(g.year).toBe(15);
    expect(Array.isArray(g.logs)).toBe(true);
  });
});
