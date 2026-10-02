import { describe, expect, it } from 'vitest';
import {
  HA_FACTOR, ITEM_C, LIFE, NEEDS, RECYCLING, SOILS, WAIT, applyChoice, applyZoom, canGive, createForest, decide, deliver,
  fatesFor, giveMyBirch, isWorn, myBirch, needOf, objectThread, plant, plantMyBirch, resolveHint, stepYear, stock, total,
  treeThread, village, villageCarbon, type Forest,
} from '../../src/core/forest';

const startTotal = (f: Forest) => SOILS[f.soil].soilC0 * 1000 / HA_FACTOR;
const balanced = (f: Forest) => expect(Math.abs(total(f.ledger) - startTotal(f))).toBeLessThan(1e-6 * startTotal(f));
const poolsMatch = (f: Forest) => {
  for (const k of ['sawn', 'paper', 'textile', 'energy'] as const) {
    const lots = f.lots.filter(l => l.kind === k).reduce((a, l) => a + l.c, 0);
    expect(Math.abs(f.pools[k] - lots), k).toBeLessThan(1e-6);
  }
};

/** A forest with your birch, where the child played a Kasva! summer for it every fifth year. */
function grown(years: number): Forest {
  const f = createForest({ seed: 'village', place: 'south', soil: 'loam' });
  plant(f, { spruce: 1, birch: 1 });
  plantMyBirch(f);
  for (let y = 0; y < years; y++) {
    if (f.pending?.kind === 'regen') applyChoice(f, 'plant', { mix: { spruce: 1 } });
    resolveHint(f);
    const rec = stepYear(f);
    const b = myBirch(f);
    if (b && b.h >= 1.3 && y % 5 === 0) applyZoom(f, b.id, 1.2, 1, rec.year);
  }
  return f;
}

describe('the village (Phase 9)', () => {
  it('remembers every summer the child played as a tree', () => {
    const f = grown(30);
    const b = myBirch(f)!;
    expect(b.played!.length).toBeGreaterThanOrEqual(4);
    for (const p of b.played!) expect(b.rings[b.rings.length - (f.year - p.year)]).toBeCloseTo(p.mm, 1);
  });

  it('your birch can be given to the village; its line passes on, and its summers go with its wood', () => {
    const f = grown(45);
    const b = myBirch(f)!;
    expect(canGive(b)).toBe(true);
    const played = b.played!.length;
    const h = giveMyBirch(f)!;
    expect(h.count).toBe(1);
    expect(f.trees.some(t => t.id === b.id)).toBe(false);
    expect(myBirch(f)).toBeDefined();
    expect(f.birch!.generation).toBe(2);
    const snap = f.felled.find(s => s.id === b.id)!;
    expect(snap.played!.length).toBe(played);
    expect(snap.how).toBe('gift');
    balanced(f);
  });

  it('delivering moves carbon from the forest\'s products into the village, one thing per tree, books balanced', () => {
    const f = grown(45);
    const b = myBirch(f)!;
    giveMyBirch(f);
    applyChoice(f, 'thin');
    const products = f.ledger.stores.products;
    const notebooks = stock(f, 'notebook');
    expect(notebooks).toBeGreaterThan(0);
    const r = deliver(f, 'school');
    expect(r.n).toBe(Math.min(NEEDS.school.n, notebooks));
    expect(r.met).toBe(r.n === NEEDS.school.n);
    expect(f.ledger.stores.products).toBeCloseTo(products, 9); // still in the products store
    expect(villageCarbon(f)).toBeCloseTo(r.n * ITEM_C.notebook, 9);
    poolsMatch(f);
    balanced(f);
    // the birch's own wood comes first, because the child played it
    expect(village(f).objects[0].tree).toBe(b.id);
  });

  it('a met need makes way for a bigger one', () => {
    const f = grown(45);
    giveMyBirch(f);
    applyChoice(f, 'thin');
    deliver(f, 'school');
    if (village(f).level.school === 1) expect(needOf(f, 'school').n).toBe(Math.round(NEEDS.school.n * 1.5));
  });

  it('village things keep their carbon while products elsewhere wear away', () => {
    const f = grown(45);
    giveMyBirch(f);
    applyChoice(f, 'thin');
    deliver(f, 'school');
    const c0 = villageCarbon(f);
    resolveHint(f);
    stepYear(f);
    expect(villageCarbon(f)).toBeCloseTo(c0, 9);
    poolsMatch(f);
    balanced(f);
  });

  it('end of life: recycle keeps some fibre, burning warms the sauna, reuse cascades, repair adds years', () => {
    const f = grown(45);
    giveMyBirch(f);
    applyChoice(f, 'thin');
    deliver(f, 'school');
    const o = village(f).objects[0];
    expect(isWorn(f, o)).toBe(false);
    expect(decide(f, o.id, 'burn')).toBe(false); // not worn yet
    for (let i = 0; i < LIFE.notebook; i++) { resolveHint(f); stepYear(f); }
    expect(isWorn(f, o)).toBe(true);
    expect(fatesFor(o)).toEqual(['recycle', 'burn']);
    const c = o.c;
    expect(decide(f, o.id, 'recycle')).toBe(true);
    expect(o.thing).toBe('box');
    expect(o.building).toBe('shop');
    expect(o.c).toBeCloseTo(c * RECYCLING.share, 9);
    balanced(f);
    for (let i = 0; i < LIFE.box; i++) { resolveHint(f); stepYear(f); }
    const heat = village(f).heat;
    const c2 = o.c;
    expect(decide(f, o.id, 'burn')).toBe(true);
    expect(o.c).toBe(0);
    expect(o.gone).toBe(f.year);
    expect(village(f).heat - heat).toBeCloseTo(c2 / ITEM_C.sauna, 9);
    balanced(f);
  });

  it('a house beam can become a café table, and a table a shelf', () => {
    const f = grown(45);
    const v = village(f);
    // a beam from a felled tree, as if delivered long ago
    applyChoice(f, 'thin');
    const tree = f.felled[0].id;
    f.ledger.stores.products += 25; f.ledger.stores.air -= 25; // the beam's carbon, taken from the air
    v.objects.push({ id: v.nextId++, building: 'house', thing: 'beam', tree, route: 'saw', round: 0, n: 1, c: 25, since: f.year - LIFE.beam, life: LIFE.beam, history: [] });
    const o = v.objects.at(-1)!;
    expect(fatesFor(o)).toEqual(['repair', 'reuse', 'burn']);
    expect(decide(f, o.id, 'repair')).toBe(true);
    expect(isWorn(f, o)).toBe(false);
    o.since -= 30;
    expect(decide(f, o.id, 'reuse')).toBe(true);
    expect([o.thing, o.building]).toEqual(['table', 'cafe']);
    expect(o.c).toBeCloseTo(22.5, 9);
    balanced(f);
  });

  it('a worn thing nobody decides about is burned for heat after a few years', () => {
    const f = grown(45);
    giveMyBirch(f);
    applyChoice(f, 'thin');
    deliver(f, 'school');
    const o = village(f).objects[0];
    for (let i = 0; i < LIFE.notebook + WAIT; i++) { resolveHint(f); stepYear(f); }
    expect(o.gone).toBeDefined();
    expect(o.history.at(-1)!.what).toBe('autoBurned');
    balanced(f);
  });

  it('the Carbon Thread follows a village thing back to the summers the child played', () => {
    const f = grown(45);
    const b = myBirch(f)!;
    giveMyBirch(f);
    deliver(f, 'school');
    deliver(f, 'cafe');
    const o = village(f).objects.find(x => x.tree === b.id)!;
    const t = objectThread(f, o.id)!;
    const summers = t.steps.filter(s => s.k === 'summer');
    expect(summers.length).toBe(b.played!.length);
    expect(t.steps[0]).toEqual({ k: 'air', from: b.born, to: f.felled.find(s => s.id === b.id)!.year });
    expect(t.steps.at(-1)!.k).toBe('now');
    const tt = treeThread(f, b.id)!;
    const sum = tt.now.village + tt.now.stock + tt.now.forest + tt.now.air;
    expect(sum).toBeCloseTo(tt.snap.c!, 6);
    expect(tt.now.village).toBeGreaterThan(0);
  });

  it('forests without a village are unchanged', () => {
    const a = grown(40);
    expect(a.village).toBeUndefined();
  });
});
