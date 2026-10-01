/**
 * Forest to factory (F3). The phase is done when every product traces back
 * to a real tree from the child's own forest; these tests check that, and
 * that sorting, collecting branches and recycling change what a forest gives.
 */
import { describe, expect, it } from 'vitest';
import {
  ITEM_C, applyChoice, bestBin, createForest, plant, previewHarvest, recycledItems, run, shelf, stepYear,
  traceCount, traceItem, type Forest, type SortBin,
} from '../../src/core/forest';
import { STRATEGIES, play } from './strategies';

function grownSpruce(seed = 'p', years = 75): Forest {
  const f = createForest({ seed, place: 'east', soil: 'loam' });
  plant(f, { spruce: 0.7, pine: 0.2, birch: 0.1 });
  return run(f, years);
}

describe('every product traces back to a real tree', () => {
  it('through whole rotations of every strategy, with storms, salvage, recycling and seeding', () => {
    for (const s of STRATEGIES) {
      const { f } = play(s, 'trace', 110);
      const felled = new Set(f.felled.map(t => t.id));
      // every product still in use, and every item ever made, points at a felled tree
      for (const lot of f.lots) expect(felled.has(lot.tree), `${s.name}: lot of tree ${lot.tree}`).toBe(true);
      for (const r of f.receipts) expect(felled.has(r.tree), `${s.name}: receipt of tree ${r.tree}`).toBe(true);
      // and each felled tree really grew in this forest: planted or seeded here, with its rings
      for (const t of f.felled) {
        expect(t.id).toBeLessThan(f.nextId);
        expect(t.born).toBeGreaterThanOrEqual(0);
        expect(t.year).toBeGreaterThanOrEqual(t.born);
      }
      // the trace view finds a tree for every item on the shelf
      for (const it of shelf(f)) {
        const n = traceCount(f, it.item);
        for (let k = 0; k < n; k++) {
          const tr = traceItem(f, it.item, k)!;
          expect(tr.tree.id).toBe(tr.receipt.tree);
          expect(tr.steps[0]).toBe('item');
          expect(tr.steps.at(-2)).toBe('tree');
          expect(tr.steps.at(-1)).toBe('forest');
        }
      }
    }
  });

  it('a notebook leads back through paper, the pulp mill and pulpwood to a tree with its rings', () => {
    const f = grownSpruce();
    applyChoice(f, 'clearcut');
    const tr = traceItem(f, 'notebook')!;
    expect(tr.steps).toEqual(['item', 'paper', 'pulpmill', 'pulpwood', 'tree', 'forest']);
    expect(tr.tree.rings.length).toBeGreaterThan(30);
    const beam = traceItem(f, 'beam') ?? traceItem(f, 'table');
    expect(beam!.steps).toContain('sawmill');
  });
});

describe('sorting at the roadside', () => {
  it('sending thick trunks to the sawmill gives far more boards than sending everything to pulp', () => {
    const a = grownSpruce('sort');
    const b = structuredClone(a);
    const trees = previewHarvest(a, 'clearcut');
    expect(trees.length).toBeGreaterThan(10);
    const allPulp: Record<number, SortBin> = Object.fromEntries(trees.map(t => [t.id, 'pulp' as SortBin]));
    const right: Record<number, SortBin> = Object.fromEntries(trees.map(t => [t.id, bestBin(t.sp, t.d)]));
    const ha = applyChoice(a, 'clearcut', { sort: right })!;
    const hb = applyChoice(b, 'clearcut', { sort: allPulp })!;
    expect(ha.products.sawn).toBeGreaterThan(0);
    expect(hb.products.sawn).toBe(0);
    expect(hb.products.paper).toBeGreaterThan(ha.products.paper);
  });

  it('a thin trunk sent to the sawmill is rejected: no boards, and some is lost to fuel', () => {
    const f = grownSpruce('thin', 35);
    const trees = previewHarvest(f, 'thin');
    const thin = trees.find(t => bestBin(t.sp, t.d) === 'pulp')!;
    const g = structuredClone(f);
    const ha = applyChoice(f, 'thin', { sort: { [thin.id]: 'pulp' } })!;
    const hb = applyChoice(g, 'thin', { sort: { [thin.id]: 'saw' } })!;
    expect(hb.products.sawn).toBe(ha.products.sawn);
    expect(hb.products.energy).toBeGreaterThan(ha.products.energy);
  });

  it('previewing a harvest changes nothing', () => {
    const f = grownSpruce('pre');
    const before = JSON.stringify(f);
    previewHarvest(f, 'clearcut');
    expect(JSON.stringify(f)).toBe(before);
  });
});

describe('the biorefinery and recycling', () => {
  it('collecting branches gives sauna heat now, but leaves less to feed the soil', () => {
    const a = grownSpruce('res');
    const b = structuredClone(a);
    applyChoice(a, 'clearcut', { residues: true });
    applyChoice(b, 'clearcut');
    expect(a.made.energy).toBeGreaterThan(b.made.energy);
    applyChoice(a, 'plant', { mix: { spruce: 1 } });
    applyChoice(b, 'plant', { mix: { spruce: 1 } });
    run(a, 20); run(b, 20);
    expect(a.ledger.stores.soil).toBeLessThan(b.ledger.stores.soil);
    const sauna = (f: Forest) => shelf(f).find(s => s.item === 'sauna')?.made ?? 0;
    expect(sauna(a)).toBeGreaterThan(sauna(b));
  });

  it('recycling keeps paper carbon in use longer and makes boxes without new trees', () => {
    const a = grownSpruce('rec');
    const b = structuredClone(a);
    b.recycle = false;
    applyChoice(a, 'clearcut');
    applyChoice(b, 'clearcut');
    for (let i = 0; i < 8; i++) { stepYear(a); stepYear(b); }
    expect(a.pools.paper).toBeGreaterThan(b.pools.paper * 1.5);
    expect(recycledItems(a)).toBeGreaterThan(0);
    expect(recycledItems(b)).toBe(0);
    // recycled fibre traces back through its recycling rounds to the same trees
    const box = traceItem(a, 'box')!;
    expect(box.tree).toBeTruthy();
    const roundsTraced = a.receipts.filter(r => r.round > 0).every(r => a.felled.some(t => t.id === r.tree));
    expect(roundsTraced).toBe(true);
  });

  it('fibre wears out: no paper is recycled more than six times', () => {
    const f = grownSpruce('wear');
    applyChoice(f, 'clearcut');
    run(f, 40);
    expect(Math.max(...f.receipts.map(r => r.round))).toBeLessThanOrEqual(6);
  });
});

describe('items a child can picture', () => {
  it('a final harvest of a 75-year forest makes tables or beams, notebooks, boxes, shirts and sauna evenings', () => {
    const f = grownSpruce('items');
    applyChoice(f, 'clearcut');
    const s = Object.fromEntries(shelf(f).map(x => [x.item, x.made]));
    expect((s.table ?? 0) + (s.beam ?? 0)).toBeGreaterThan(5);
    expect(s.notebook).toBeGreaterThan(500);
    expect(s.box).toBeGreaterThan(50);
    expect(s.shirt).toBeGreaterThan(10);
    expect(s.sauna).toBeGreaterThan(10);
    // counts follow the carbon in each item
    const made = f.receipts.reduce((a, r) => a + r.n * ITEM_C[r.item], 0);
    const products = f.made.sawn + f.made.paper + f.made.textile + f.made.energy + f.recycled;
    expect(made).toBeCloseTo(products, 6);
  });
});
