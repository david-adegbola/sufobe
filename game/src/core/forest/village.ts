/**
 * The village (Phase 9): where the forest's wood ends up, and how it comes
 * back to the air.
 *
 * Six places in the village need things: the school needs notebooks, the
 * shop boxes, the café tables, a new house beams, the sports club shirts,
 * and the sauna heat. The child delivers items the forest has made. A
 * delivered item becomes a village object that remembers the tree it came
 * from, and it keeps its carbon for as long as it is in use: it does not
 * fade away like the forest's other products (wood.ts, half-lives).
 *
 * When an object wears out, the child chooses what happens next:
 *   repair   it stays in use for longer
 *   reuse    cascading use: a house beam becomes a café table, an old table
 *            becomes a particleboard shelf (a little is lost as dust)
 *   recycle  paper and cardboard become new cardboard (some fibre is lost)
 *   burn     heat for the sauna: all its carbon goes back to the air
 * An object nobody decides about is burned for heat after a few years.
 *
 * Carbon stays in the ledger's products store until it is lost or burned,
 * so the books always balance. Lifetimes and losses are game choices to
 * verify (docs/forest-model.md, Phase 9).
 *
 * The Carbon Thread follows one tree's carbon: caught from the air over its
 * life (with the summers the child played as that tree), cut, milled, made
 * into a thing, used in the village, and now in use or back in the air.
 */
import { move } from './carbon';
import { take, type HarvestOptions } from './manage';
import { ensureMyBirch, myBirch } from './mybirch';
import type { Forest, Played, Tree } from './stand';
import { ITEM_C, RECYCLING, itemFor, type Harvest, type ItemId, type Route, type TreeSnap } from './wood';

export type BuildingId = 'school' | 'shop' | 'cafe' | 'house' | 'club' | 'sauna';
export const BUILDINGS: BuildingId[] = ['house', 'cafe', 'school', 'shop', 'club', 'sauna'];

/** A village thing: the forest's items, plus a particleboard shelf made from old tables. */
export type ThingId = ItemId | 'shelf';

/** What each place needs first. Each time a need is met, the next one is half as big again. */
export const NEEDS: Record<BuildingId, { thing: ItemId; n: number }> = {
  house: { thing: 'beam', n: 3 },
  cafe: { thing: 'table', n: 2 },
  school: { thing: 'notebook', n: 20 },
  shop: { thing: 'box', n: 30 },
  club: { thing: 'shirt', n: 5 },
  sauna: { thing: 'sauna', n: 10 },
};

/** Carbon in one thing, kg: the forest's items, and a small particleboard shelf. */
export const THING_C: Record<ThingId, number> = { ...ITEM_C, shelf: 6 };
/** Years a thing is in use before it wears out (verify). */
export const LIFE: Record<ThingId, number> = { beam: 60, table: 25, shelf: 15, notebook: 1, box: 1, shirt: 3, sauna: 0 };
/** Years a repair (or handing a shirt down) adds, and how many times a thing can be repaired. */
export const REPAIR: Partial<Record<ThingId, number>> = { beam: 30, table: 10, shelf: 5, shirt: 2 };
export const MAX_REPAIRS = 2;
/** Cascading use: what a worn thing can become, where it goes, and the share of carbon kept. */
export const REUSE: Partial<Record<ThingId, { to: ThingId; building: BuildingId; keep: number }>> = {
  beam: { to: 'table', building: 'cafe', keep: 0.9 },
  table: { to: 'shelf', building: 'school', keep: 0.9 },
};
/** Years a worn thing waits for the child's choice before the village burns it for heat. */
export const WAIT = 5;

export type Fate = 'repair' | 'reuse' | 'recycle' | 'burn';
export type HistoryWhat = 'delivered' | 'repaired' | 'reused' | 'recycled' | 'burned' | 'autoBurned';

export interface VillageObject {
  id: number;
  building: BuildingId;
  thing: ThingId;
  /** the tree it came from, and how its wood reached the mill */
  tree: number;
  route: Route;
  /** times its fibre has been recycled */
  round: number;
  /** how many things, and their carbon, kg */
  n: number;
  c: number;
  /** year it went into use, and how many years it lasts from then */
  since: number;
  life: number;
  /** year it was burned, if it is gone */
  gone?: number;
  history: { year: number; what: HistoryWhat; thing: ThingId; n: number }[];
}

export interface Village {
  /** how many needs each place has had met */
  level: Record<BuildingId, number>;
  /** things given towards each place's current need */
  got: Record<BuildingId, number>;
  objects: VillageObject[];
  nextId: number;
  /** sauna evenings warmed by burning worn things */
  heat: number;
}

const zero = (): Record<BuildingId, number> => ({ house: 0, cafe: 0, school: 0, shop: 0, club: 0, sauna: 0 });

/** The forest's village, made the first time it is needed. */
export function village(f: Forest): Village {
  return (f.village ??= { level: zero(), got: zero(), objects: [], nextId: 1, heat: 0 });
}

/** What a place needs now: the thing, how many in all, and how many are still missing. */
export function needOf(f: Forest, b: BuildingId): { thing: ItemId; n: number; left: number } {
  const v = village(f);
  const base = NEEDS[b];
  const n = Math.round(base.n * (1 + 0.5 * v.level[b]));
  return { thing: base.thing, n, left: Math.max(0, n - v.got[b]) };
}

/** Count things towards a place's need; a met need makes way for the next one. Returns true if a need was met. */
function give(v: Village, b: BuildingId, thing: ThingId, n: number, f: Forest): boolean {
  if (NEEDS[b].thing !== thing) return false;
  v.got[b] += n;
  const need = needOf(f, b);
  if (v.got[b] + 1e-9 >= need.n) { v.level[b]++; v.got[b] = 0; return true; }
  return false;
}

/** The forest's product lots that make this item, played trees first, then the biggest. */
function lotsFor(f: Forest, item: ItemId) {
  const snaps = new Map(f.felled.map(s => [s.id, s]));
  return f.lots
    .filter(l => l.tree >= 0 && l.c > 0 && itemFor(l.kind, l.route, l.round, snaps.get(l.tree)?.d ?? 0) === item)
    .sort((a, b) => (snaps.get(b.tree)?.played?.length ?? 0) - (snaps.get(a.tree)?.played?.length ?? 0) || b.c - a.c || a.tree - b.tree);
}

/** Whole items of this kind the forest has ready to give (made and still in use). */
export function stock(f: Forest, item: ItemId): number {
  if (item === 'sauna') return 0;
  return Math.floor(lotsFor(f, item).reduce((a, l) => a + l.c, 0) / ITEM_C[item] + 1e-9);
}

/**
 * Give the forest's items to a place, up to what it still needs. The carbon
 * moves from the forest's product lots into village objects, one per tree.
 * Returns how many were given and whether the need was met.
 */
export function deliver(f: Forest, b: BuildingId): { n: number; met: boolean } {
  const v = village(f);
  const need = needOf(f, b);
  if (need.thing === 'sauna') return { n: 0, met: false };
  const n = Math.min(need.left, stock(f, need.thing));
  if (n <= 0) return { n: 0, met: false };
  let rem = n * ITEM_C[need.thing];
  for (const lot of lotsFor(f, need.thing)) {
    if (rem <= 1e-12) break;
    const x = Math.min(lot.c, rem);
    lot.c -= x;
    f.pools[lot.kind] -= x;
    rem -= x;
    const k = x / ITEM_C[need.thing];
    v.objects.push({
      id: v.nextId++, building: b, thing: need.thing, tree: lot.tree, route: lot.route, round: lot.round,
      n: k, c: x, since: f.year, life: LIFE[need.thing],
      history: [{ year: f.year, what: 'delivered', thing: need.thing, n: k }],
    });
  }
  f.lots = f.lots.filter(l => l.c > 1e-12);
  return { n, met: give(v, b, need.thing, n, f) };
}

export const isGone = (o: VillageObject) => o.gone !== undefined;
export const isWorn = (f: Forest, o: VillageObject) => !isGone(o) && f.year - o.since >= o.life;

/** What the child can do with a worn thing. */
export function fatesFor(o: VillageObject): Fate[] {
  const out: Fate[] = [];
  if (REPAIR[o.thing] && o.history.filter(h => h.what === 'repaired').length < MAX_REPAIRS) out.push('repair');
  if (REUSE[o.thing]) out.push('reuse');
  if ((o.thing === 'notebook' || o.thing === 'box') && o.round < RECYCLING.maxRounds) out.push('recycle');
  out.push('burn');
  return out;
}

function burn(f: Forest, o: VillageObject, what: HistoryWhat): number {
  const v = village(f);
  move(f.ledger, 'products', 'air', o.c);
  const evenings = o.c / ITEM_C.sauna;
  v.heat += evenings;
  give(v, 'sauna', 'sauna', evenings, f);
  o.history.push({ year: f.year, what, thing: o.thing, n: o.n });
  o.c = 0;
  o.gone = f.year;
  return evenings;
}

/** Carry out the child's choice for a worn thing. Returns false if it is not possible. */
export function decide(f: Forest, id: number, fate: Fate): boolean {
  const v = village(f);
  const o = v.objects.find(x => x.id === id);
  if (!o || !isWorn(f, o) || !fatesFor(o).includes(fate)) return false;
  const lose = (keep: number) => { const lost = o.c * (1 - keep); move(f.ledger, 'products', 'air', lost); o.c -= lost; };
  switch (fate) {
    case 'repair':
      o.life += REPAIR[o.thing]!;
      o.history.push({ year: f.year, what: 'repaired', thing: o.thing, n: o.n });
      break;
    case 'reuse': {
      const r = REUSE[o.thing]!;
      lose(r.keep);
      Object.assign(o, { thing: r.to, building: r.building, n: o.c / THING_C[r.to], since: f.year, life: LIFE[r.to] });
      o.history.push({ year: f.year, what: 'reused', thing: o.thing, n: o.n });
      give(v, r.building, r.to, o.n, f);
      break;
    }
    case 'recycle':
      lose(RECYCLING.share);
      Object.assign(o, { thing: 'box', building: 'shop', round: o.round + 1, n: o.c / THING_C.box, since: f.year, life: LIFE.box });
      o.history.push({ year: f.year, what: 'recycled', thing: o.thing, n: o.n });
      give(v, 'shop', 'box', o.n, f);
      break;
    case 'burn':
      burn(f, o, 'burned');
      break;
  }
  return true;
}

/** Once a year: worn things nobody decided about are burned for heat. */
export function ageVillage(f: Forest): void {
  if (!f.village) return;
  // this runs at the end of year f.year, so the next year is about to begin
  const next = f.year + 1;
  for (const o of f.village.objects) if (!isGone(o) && next - o.since - o.life >= WAIT) burn(f, o, 'autoBurned');
  // keep the save small: forget long-gone things, but never one from a tree the child played
  const played = new Set(f.felled.filter(s => s.played?.length).map(s => s.id));
  f.village.objects = f.village.objects.filter(o => !isGone(o) || played.has(o.tree) || f.year - o.gone! <= 30);
}

/** Carbon in the village now, kg. */
export function villageCarbon(f: Forest): number {
  return (f.village?.objects ?? []).reduce((a, o) => a + o.c, 0);
}

// ---------- your birch's gift ----------

/** Your birch can become village things once its trunk is thick enough for the mill (pulpwood); a thick one gives sawlogs too. */
export const GIFT_MIN_D = 12;
export const canGive = (t: Tree | undefined) => !!t?.mine && t.d >= GIFT_MIN_D;

/**
 * Give your birch to the village: it is cut and its trunk goes to the mill
 * that suits it best. The birch line passes on, as when it dies (mybirch.ts).
 */
export function giveMyBirch(f: Forest, opt: HarvestOptions = {}): Harvest | null {
  const t = myBirch(f);
  if (!t || !canGive(t)) return null;
  t.mine = false;
  t.keep = false;
  const h = take(f, [t], 'gift', opt);
  ensureMyBirch(f);
  return h;
}

// ---------- the Carbon Thread ----------

export interface TreeThread {
  snap: TreeSnap;
  played: Played[];
  /** where the tree's carbon is now, kg */
  now: { village: number; stock: number; forest: number; air: number };
  objects: VillageObject[];
}

/** Follow one felled tree's carbon to wherever it is now. */
export function treeThread(f: Forest, treeId: number): TreeThread | null {
  const snap = f.felled.find(s => s.id === treeId);
  if (!snap) return null;
  const objects = (f.village?.objects ?? []).filter(o => o.tree === treeId);
  const village = objects.reduce((a, o) => a + o.c, 0);
  const stockC = f.lots.filter(l => l.tree === treeId).reduce((a, l) => a + l.c, 0);
  const total = snap.c ?? village + stockC;
  const forest = Math.min(snap.left ?? 0, Math.max(0, total - village - stockC));
  return {
    snap, played: snap.played ?? [], objects,
    now: { village, stock: stockC, forest, air: Math.max(0, total - village - stockC - forest) },
  };
}

export type ThreadStep =
  | { k: 'air'; from: number; to: number }
  | { k: 'summer'; year: number; mm: number }
  | { k: 'cut'; year: number }
  | { k: 'mill'; route: Route }
  | { k: 'event'; year: number; what: HistoryWhat; thing: ThingId; n: number }
  | { k: 'now'; c: number; thing: ThingId; building: BuildingId; gone: boolean };

/** One village thing, followed from the air to where its carbon is now. */
export function objectThread(f: Forest, id: number): { o: VillageObject; snap: TreeSnap | undefined; steps: ThreadStep[] } | null {
  const o = f.village?.objects.find(x => x.id === id);
  if (!o) return null;
  const snap = f.felled.find(s => s.id === o.tree);
  const steps: ThreadStep[] = [];
  if (snap) {
    steps.push({ k: 'air', from: snap.born, to: snap.year });
    for (const p of snap.played ?? []) steps.push({ k: 'summer', year: p.year, mm: p.mm });
    steps.push({ k: 'cut', year: snap.year });
  }
  steps.push({ k: 'mill', route: o.route });
  for (const h of o.history) steps.push({ k: 'event', ...h });
  steps.push({ k: 'now', c: o.c, thing: o.thing, building: o.building, gone: isGone(o) });
  return { o, snap, steps };
}
