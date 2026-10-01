/**
 * The product shelf and trace-back (F3). Everything the forest has made is
 * counted as items (tables, house beams, notebooks, boxes, shirts, sauna
 * evenings), and any item can be followed back, step by step, to the very
 * tree it came from.
 */
import { CO2_PER_C } from './carbon';
import { HA_FACTOR, type Forest } from './stand';
import { ITEMS, ITEM_C, itemFor, type ItemId, type Receipt, type TreeSnap } from './wood';

export interface ShelfItem {
  item: ItemId;
  /** made from this forest's wood, including from recycled fibre */
  made: number;
  /** still in use now (sauna evenings are used up at once) */
  inUse: number;
  /** how many different trees it came from */
  trees: number;
}

export function shelf(f: Forest): ShelfItem[] {
  const d = new Map(f.felled.map(s => [s.id, s.d]));
  const inUse: Record<string, number> = {};
  for (const lot of f.lots) {
    if (lot.tree < 0) continue;
    const item = itemFor(lot.kind, lot.route, lot.round, d.get(lot.tree) ?? 0);
    inUse[item] = (inUse[item] ?? 0) + lot.c / ITEM_C[item];
  }
  return ITEMS.map(item => {
    const rs = f.receipts.filter(r => r.item === item);
    return {
      item,
      made: rs.reduce((a, r) => a + r.n, 0),
      inUse: inUse[item] ?? 0,
      trees: new Set(rs.map(r => r.tree)).size,
    };
  }).filter(s => s.made >= 0.5);
}

/** Items made again from recycled fibre: what recycling saved from new trees. */
export function recycledItems(f: Forest): number {
  return f.receipts.filter(r => r.round > 0).reduce((a, r) => a + r.n, 0);
}

export type TraceStep =
  | 'item' | 'sawn' | 'paper' | 'board' | 'textile' | 'heat' | 'recycled'
  | 'sawmill' | 'pulpmill' | 'biorefinery'
  | 'sawlog' | 'pulpwood' | 'chips' | 'energywood' | 'branches'
  | 'tree' | 'forest';

export interface Trace {
  item: ItemId;
  receipt: Receipt;
  tree: TreeSnap;
  /** from the item back to the forest */
  steps: TraceStep[];
  /** how many of these items this tree made */
  count: number;
}

/** The chain from an item back to its tree. */
export function traceSteps(r: Receipt): TraceStep[] {
  const back = (route: Receipt['route']): TraceStep[] =>
    route === 'saw' ? ['sawmill', 'sawlog'] : route === 'pulp' ? ['pulpwood'] : route === 'energy' ? ['energywood'] : ['branches'];
  const recycled: TraceStep[] = Array.from({ length: r.round }, () => 'recycled' as const);
  switch (r.item) {
    case 'table': case 'beam': return ['item', 'sawn', 'sawmill', 'sawlog', 'tree', 'forest'];
    case 'notebook': case 'box': {
      const material: TraceStep = r.item === 'box' ? 'board' : 'paper';
      const fibre: TraceStep[] = r.route === 'saw' ? ['pulpmill', 'chips', 'sawmill', 'sawlog'] : ['pulpmill', 'pulpwood'];
      return ['item', material, ...recycled, ...fibre, 'tree', 'forest'];
    }
    case 'shirt': {
      const fibre: TraceStep[] = r.route === 'saw' ? ['pulpmill', 'chips', 'sawmill', 'sawlog'] : ['pulpmill', 'pulpwood'];
      return ['item', 'textile', 'biorefinery', ...fibre, 'tree', 'forest'];
    }
    case 'sauna': {
      const via: TraceStep[] = r.route === 'saw' ? ['sawmill'] : r.route === 'pulp' ? ['pulpmill'] : ['biorefinery'];
      return ['item', 'heat', ...via, ...back(r.route).filter(s => s !== 'sawmill'), 'tree', 'forest'];
    }
  }
}

/**
 * Trace one kind of item back to a tree. `k` picks which contributing tree
 * (biggest contribution first), so a child can step through all of them.
 */
export function traceItem(f: Forest, item: ItemId, k = 0): Trace | null {
  const rs = f.receipts.filter(r => r.item === item && r.tree >= 0 && r.n > 0).sort((a, b) => b.n - a.n || a.tree - b.tree);
  if (!rs.length) return null;
  const r = rs[((k % rs.length) + rs.length) % rs.length];
  const tree = f.felled.find(s => s.id === r.tree);
  if (!tree) return null;
  return { item, receipt: r, tree, steps: traceSteps(r), count: r.n };
}

/** Number of different trees that made an item, for "1 of N" in the trace view. */
export function traceCount(f: Forest, item: ItemId): number {
  return f.receipts.filter(r => r.item === item && r.tree >= 0 && r.n > 0).length;
}

/** Product carbon still in use, t CO₂ per hectare. */
export function productsCO2(f: Forest): number {
  return f.ledger.stores.products * HA_FACTOR / 1000 * CO2_PER_C;
}
