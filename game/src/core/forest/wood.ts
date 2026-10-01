/**
 * From a felled tree to products. F0 keeps this small: sort the stem into
 * sawlog and pulpwood, send each to its mill, and keep the carbon in three
 * product pools that release it to the air at their own pace. The mill
 * mini-game, trace-back and recycling come in F3.
 *
 * Shares are simplified (verify against Luke wood-flow statistics);
 * half-lives are IPCC 2019 defaults, as in the classroom sim.
 */
import { move, type Ledger } from './carbon';
import { BRANCH_SHARE, ROOT_SHARE, type SpeciesId } from './species';

export type ProductKind = 'sawn' | 'paper' | 'energy';

/** Years until half of the product's carbon is back in the air. 0 = at once. */
export const HALF_LIFE: Record<ProductKind, number> = { sawn: 35, paper: 2, energy: 0 };

/** Smallest trunk (cm at breast height) that gives any sawlog. */
const SAW_MIN_D: Record<SpeciesId, number> = { pine: 17, spruce: 17, birch: 20 };
/** Largest share of a stem that can become sawlog. */
const SAW_MAX: Record<SpeciesId, number> = { pine: 0.7, spruce: 0.7, birch: 0.5 };
/** Tops and pieces left in the forest. */
const STEM_WASTE = 0.05;

/** What each mill makes from its wood (shares of carbon). */
export const SAWMILL = { sawn: 0.47, toPulp: 0.33, energy: 0.2 };
export const PULPMILL = { paper: 0.5, energy: 0.5 };

export interface Harvest {
  sawlogC: number;
  pulpwoodC: number;
  /** carbon in sawn wood, paper and energy that came from this harvest */
  products: Record<ProductKind, number>;
  /** trees taken */
  count: number;
  /** stem volume taken, m³ on the plot */
  volume: number;
}

export function newHarvest(): Harvest {
  return { sawlogC: 0, pulpwoodC: 0, products: { sawn: 0, paper: 0, energy: 0 }, count: 0, volume: 0 };
}

/** Share of a stem that becomes sawlog, growing with trunk size. */
export function sawShare(sp: SpeciesId, d: number): number {
  if (d < SAW_MIN_D[sp]) return 0;
  return Math.min(SAW_MAX[sp], (d - SAW_MIN_D[sp] + 3) / 14);
}

export interface FelledTree {
  sp: SpeciesId;
  d: number;
  volume: number;
  wood: number;
  foliage: number;
  fine: number;
}

/**
 * Fell one tree. Its stem goes to the mills, branches, needles and fine roots
 * stay as litter, and the stump and coarse roots become deadwood.
 */
export function fell(l: Ledger, pools: Record<ProductKind, number>, t: FelledTree, out: Harvest): void {
  const parts = 1 + BRANCH_SHARE + ROOT_SHARE;
  const stem = t.wood / parts;
  const branches = t.wood * BRANCH_SHARE / parts;
  const roots = t.wood * ROOT_SHARE / parts;

  move(l, 'trees', 'litter', branches + t.foliage + t.fine);
  move(l, 'trees', 'deadwood', roots);

  const saw = stem * sawShare(t.sp, t.d);
  const waste = stem * STEM_WASTE;
  const pulp = stem - saw - waste;
  move(l, 'trees', 'litter', waste);

  const toPulp = pulp + saw * SAWMILL.toPulp;
  const made: Record<ProductKind, number> = {
    sawn: saw * SAWMILL.sawn,
    paper: toPulp * PULPMILL.paper,
    energy: saw * SAWMILL.energy + toPulp * PULPMILL.energy,
  };
  for (const k of ['sawn', 'paper', 'energy'] as const) {
    move(l, 'trees', 'products', made[k]);
    pools[k] += made[k];
    out.products[k] += made[k];
  }
  out.sawlogC += saw;
  out.pulpwoodC += pulp;
  out.count++;
  out.volume += t.volume;
}

/** One year of products wearing out, burning or rotting. */
export function decayProducts(l: Ledger, pools: Record<ProductKind, number>): void {
  for (const k of ['sawn', 'paper', 'energy'] as const) {
    const hl = HALF_LIFE[k];
    const lost = hl === 0 ? pools[k] : pools[k] * (1 - Math.pow(0.5, 1 / hl));
    pools[k] -= lost;
    move(l, 'products', 'air', lost);
  }
}
