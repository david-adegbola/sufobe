/**
 * From a felled tree to products (F3). A stem is sorted into sawlog,
 * pulpwood or energy wood, goes to its mill, and becomes product "lots" that
 * remember which tree they came from. Each lot keeps its carbon until the
 * product wears out, burns or rots; paper and cardboard can be recycled a few
 * times. A receipt for every tree records how many of each item it made, so
 * a child can trace a notebook (or a sauna evening) back to their own tree.
 *
 * Mills:
 *   sawmill      sawlogs → sawn wood; chips → pulp mill; sawdust and bark → energy
 *   pulp mill    pulpwood and chips → paper and cardboard, a little textile
 *                fibre; the rest of the wood (lignin) is burned for the mill's energy
 *   biorefinery  branches and tops (if collected) and energy wood → heat
 *
 * Shares are simplified (verify against Luke wood-flow statistics);
 * half-lives are IPCC 2019 defaults for sawn wood and paper, as in the
 * classroom sim. The textile half-life and recycling numbers are game
 * choices to verify.
 */
import { move, type Store } from './carbon';
import { BRANCH_SHARE, ROOT_SHARE, type SpeciesId } from './species';
import type { Forest, HarvestEvent } from './stand';

export type ProductKind = 'sawn' | 'paper' | 'textile' | 'energy';
export const PRODUCT_KINDS: ProductKind[] = ['sawn', 'paper', 'textile', 'energy'];

/** Years until half of the product's carbon is back in the air. 0 = at once. */
export const HALF_LIFE: Record<ProductKind, number> = { sawn: 35, paper: 2, textile: 3, energy: 0 };

/** Smallest trunk (cm at breast height) that gives any sawlog. */
const SAW_MIN_D: Record<SpeciesId, number> = { pine: 17, spruce: 17, birch: 20, aspen: 22 };
/** Largest share of a stem that can become sawlog. */
const SAW_MAX: Record<SpeciesId, number> = { pine: 0.7, spruce: 0.7, birch: 0.5, aspen: 0.4 };
/** Tops and pieces left in the forest. */
const STEM_WASTE = 0.05;

/** What each mill makes from its wood (shares of carbon). */
export const SAWMILL = { sawn: 0.47, toPulp: 0.33, energy: 0.2 };
export const PULPMILL = { paper: 0.45, textile: 0.05, energy: 0.5 };
/** A thin trunk wrongly sent to the sawmill is chipped, losing this share to fuel. */
export const REJECT_LOSS = 0.1;
/** Paper and cardboard at the end of their life: share collected and made into new fibre, and how many times fibre can be reused. */
export const RECYCLING = { share: 0.6, maxRounds: 6 };

/** Where a stem is sent at the roadside: the child's sorting. */
export type SortBin = 'saw' | 'pulp' | 'energy';
/** The way a lot's carbon took to become a product. */
export type Route = 'saw' | 'pulp' | 'energy' | 'residue';

export interface Lot {
  tree: number;
  kind: ProductKind;
  route: Route;
  /** 0 = new fibre; 1, 2, … = times recycled */
  round: number;
  /** year the first of this lot was made */
  year: number;
  c: number;
}

/** What a felled (or salvaged) tree was like, kept so products can be traced to it. */
export interface TreeSnap {
  id: number;
  sp: SpeciesId;
  born: number;
  age: number;
  h: number;
  d: number;
  rings: number[];
  year: number;
  how: HarvestEvent['kind'];
}

export type ItemId = 'table' | 'beam' | 'notebook' | 'box' | 'shirt' | 'sauna';
export const ITEMS: ItemId[] = ['beam', 'table', 'notebook', 'box', 'shirt', 'sauna'];

/**
 * Carbon in one item, kg (verify): a small wooden table (about 16 kg of wood),
 * a house wall beam, a 100 g notebook, a 300 g cardboard box, a 200 g shirt,
 * and one evening's firewood for a wood-heated sauna.
 */
export const ITEM_C: Record<ItemId, number> = { table: 8, beam: 25, notebook: 0.04, box: 0.13, shirt: 0.09, sauna: 5 };

/** A tree's contribution to one kind of item: the receipt for trace-back. */
export interface Receipt { tree: number; item: ItemId; route: Route; round: number; n: number }

export interface Harvest {
  sawlogC: number;
  pulpwoodC: number;
  energywoodC: number;
  residueC: number;
  /** carbon in each kind of product that came from this harvest */
  products: Record<ProductKind, number>;
  /** trees taken */
  count: number;
  /** stem volume taken, m³ on the plot */
  volume: number;
}

export function newHarvest(): Harvest {
  return {
    sawlogC: 0, pulpwoodC: 0, energywoodC: 0, residueC: 0,
    products: { sawn: 0, paper: 0, textile: 0, energy: 0 }, count: 0, volume: 0,
  };
}

/** Share of a stem that becomes sawlog, growing with trunk size. */
export function sawShare(sp: SpeciesId, d: number): number {
  if (d < SAW_MIN_D[sp]) return 0;
  return Math.min(SAW_MAX[sp], (d - SAW_MIN_D[sp] + 3) / 14);
}

/** The best place for a trunk: a sawlog if it is thick enough, else pulpwood. */
export function bestBin(sp: SpeciesId, d: number): SortBin {
  return sawShare(sp, d) > 0 ? 'saw' : 'pulp';
}

/** Which item a lot of carbon becomes. */
export function itemFor(kind: ProductKind, route: Route, round: number, d: number): ItemId {
  if (kind === 'sawn') return d >= 28 ? 'beam' : 'table';
  if (kind === 'textile') return 'shirt';
  if (kind === 'energy') return 'sauna';
  // recycled fibre and sawmill chips mostly become cardboard; fresh pulpwood fibre becomes paper
  return round > 0 || route === 'saw' ? 'box' : 'notebook';
}

export interface FelledTree {
  id: number;
  sp: SpeciesId;
  d: number;
  volume: number;
  wood: number;
  foliage: number;
  fine: number;
}

export interface CutOptions {
  /** where the child sent this trunk; default: the best place for it */
  bin?: SortBin;
  /** collect branches and tops for the biorefinery instead of leaving them */
  residues?: boolean;
}

function addLot(f: Forest, lot: Lot, d: number): void {
  if (!(lot.c > 0)) return;
  const same = f.lots.find(x => x.tree === lot.tree && x.kind === lot.kind && x.route === lot.route && x.round === lot.round);
  if (same) same.c += lot.c; else f.lots.push({ ...lot });
  f.pools[lot.kind] += lot.c;
  f.made[lot.kind] += lot.c;
  const item = itemFor(lot.kind, lot.route, lot.round, d);
  const r = f.receipts.find(x => x.tree === lot.tree && x.item === item && x.route === lot.route && x.round === lot.round);
  const n = lot.c / ITEM_C[item];
  if (r) r.n += n; else f.receipts.push({ tree: lot.tree, item, route: lot.route, round: lot.round, n });
}

/**
 * Fell one tree. Its stem goes to the mills; branches stay as litter unless
 * collected for energy; needles and fine roots stay as litter; the stump and
 * coarse roots become deadwood.
 */
export function fell(f: Forest, t: FelledTree, out: Harvest, opt: CutOptions = {}): void {
  const l = f.ledger;
  const parts = 1 + BRANCH_SHARE + ROOT_SHARE;
  const stem = t.wood / parts;
  const branches = t.wood * BRANCH_SHARE / parts;
  const roots = t.wood * ROOT_SHARE / parts;
  move(l, 'trees', 'litter', t.foliage + t.fine);
  move(l, 'trees', 'deadwood', roots);
  if (opt.residues) {
    move(l, 'trees', 'products', branches);
    addLot(f, { tree: t.id, kind: 'energy', route: 'residue', round: 0, year: f.year, c: branches }, t.d);
    out.products.energy += branches;
    out.residueC += branches;
  } else {
    move(l, 'trees', 'litter', branches);
  }
  mill(f, 'trees', t.id, t.sp, t.d, stem, out, 1, opt.bin);
  out.count++;
  out.volume += t.volume;
}

/**
 * Send a stem to the mills. `from` is where its carbon is now: the living
 * trees, or the deadwood store for storm-felled and beetle-killed trees.
 * `sawFactor` < 1 for damaged wood, which gives fewer sawlogs; `bin` is the
 * child's sorting (default: the best place for this trunk).
 */
export function mill(f: Forest, from: Store, tree: number, sp: SpeciesId, d: number,
  stem: number, out: Harvest, sawFactor = 1, bin: SortBin = bestBin(sp, d)): void {
  const l = f.ledger;
  const waste = stem * STEM_WASTE;
  // tops stay in the forest: as litter from a living tree; a dead log's simply stays deadwood
  if (from === 'trees') move(l, 'trees', 'litter', waste);
  const usable = stem - waste;
  const put = (kind: ProductKind, route: Route, c: number) => {
    if (!(c > 0)) return;
    move(l, from, 'products', c);
    addLot(f, { tree, kind, route, round: 0, year: f.year, c }, d);
    out.products[kind] += c;
  };
  if (bin === 'energy') {
    put('energy', 'energy', usable);
    out.energywoodC += usable;
    return;
  }
  const share = sawShare(sp, d);
  let saw = 0;
  let reject = 0;
  if (bin === 'saw') {
    if (share > 0) saw = stem * share * sawFactor;
    else reject = usable * REJECT_LOSS; // too thin: the sawmill chips it, and some is lost to fuel
  }
  const pulp = usable - saw - reject;
  put('sawn', 'saw', saw * SAWMILL.sawn);
  put('paper', 'saw', saw * SAWMILL.toPulp * PULPMILL.paper);
  put('textile', 'saw', saw * SAWMILL.toPulp * PULPMILL.textile);
  put('energy', 'saw', saw * (SAWMILL.energy + SAWMILL.toPulp * PULPMILL.energy) + reject);
  put('paper', 'pulp', pulp * PULPMILL.paper);
  put('textile', 'pulp', pulp * PULPMILL.textile);
  put('energy', 'pulp', pulp * PULPMILL.energy);
  out.sawlogC += saw;
  out.pulpwoodC += pulp + reject;
}

/** One year of products wearing out, burning or rotting; paper and cardboard partly recycled. */
export function decayProducts(f: Forest): void {
  const l = f.ledger;
  const again: Lot[] = [];
  for (const lot of f.lots) {
    const hl = HALF_LIFE[lot.kind];
    const lost = hl === 0 ? lot.c : lot.c * (1 - Math.pow(0.5, 1 / hl));
    lot.c -= lost;
    f.pools[lot.kind] -= lost;
    // collected paper and cardboard become new fibre and stay in the products store
    const back = lot.kind === 'paper' && f.recycle && lot.round < RECYCLING.maxRounds ? lost * RECYCLING.share : 0;
    if (back > 0) again.push({ tree: lot.tree, kind: 'paper', route: lot.route, round: lot.round + 1, year: f.year, c: back });
    move(l, 'products', 'air', lost - back);
  }
  // tiny remains are counted as gone
  for (const lot of f.lots) if (lot.c > 0 && lot.c < 1e-6) { move(l, 'products', 'air', lot.c); f.pools[lot.kind] -= lot.c; lot.c = 0; }
  f.lots = f.lots.filter(x => x.c > 0);
  // recycling makes new items (not counted again as products made from the forest)
  for (const lot of again) { addLot(f, lot, 0); f.made.paper -= lot.c; f.recycled += lot.c; }
}
