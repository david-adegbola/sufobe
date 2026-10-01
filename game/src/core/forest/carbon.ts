/**
 * Carbon stores and flows. Carbon is never created or destroyed: every change
 * is a move from one store to another, and every move is recorded. The air is
 * a store too. It starts at 0 and goes negative when the forest takes carbon
 * out of it, so −air is the carbon the forest (and its products) removed.
 *
 * Units: kg of carbon on the plot.
 */
export const STORES = ['air', 'trees', 'litter', 'deadwood', 'soil', 'products'] as const;
export type Store = typeof STORES[number];

export type Flows = Record<string, number>;

export interface Ledger {
  stores: Record<Store, number>;
  /** flows during the current year, keyed "from>to" */
  flows: Flows;
}

export function newLedger(): Ledger {
  return { stores: { air: 0, trees: 0, litter: 0, deadwood: 0, soil: 0, products: 0 }, flows: {} };
}

export function move(l: Ledger, from: Store, to: Store, amount: number): void {
  if (!(amount > 0)) return;
  l.stores[from] -= amount;
  l.stores[to] += amount;
  const k = `${from}>${to}`;
  l.flows[k] = (l.flows[k] ?? 0) + amount;
}

export function total(l: Ledger): number {
  let s = 0;
  for (const k of STORES) s += l.stores[k];
  return s;
}

/** CO₂ mass from carbon mass. */
export { CO2_PER_C } from '../units';
