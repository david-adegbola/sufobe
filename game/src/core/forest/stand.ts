/**
 * The stand: up to about 100 trees on a 20 × 20 m plot, each one with its own
 * size, age and carbon. Trees compete for light (bigger trees shade smaller
 * ones), for water (the soil bucket) and grow according to the soil, the
 * summer's warmth and their species.
 *
 * Plain JSON data only, so a forest can be saved, and copied for a
 * "What if?" twin with structuredClone.
 */
import { newLedger, type Ledger } from './carbon';
import type { PlaceId, YearWeather } from './climate';
import { SOILS, type Soil, type SoilId } from './soil';
import {
  CARBON_SHARE, SPECIES, ageAtHeight, foliageDry, heightAt, stemVolume, woodyDry,
  type Species, type SpeciesId,
} from './species';
import type { Harvest, ProductKind } from './wood';

/** Plot size, m². Each tree on the plot stands for HA_FACTOR trees per hectare. */
export const PLOT_M2 = 400;
export const HA_FACTOR = 10000 / PLOT_M2;

export interface Tree {
  id: number;
  sp: SpeciesId;
  /** year the tree arrived on the plot */
  born: number;
  age: number;
  /** height, m */
  h: number;
  /** diameter at breast height, cm (0 below 1.3 m) */
  d: number;
  /** carbon, kg: wood (stem, branches, coarse roots), foliage, fine roots */
  c: { wood: number; foliage: number; fine: number };
  /** position across the plot, 0..1 (for drawing) */
  x: number;
  /** how much light the crown got last year, 0..1 (low = starving in the shade) */
  vigor: number;
  /** yearly diameter growth, mm: the tree rings */
  rings: number[];
  /** marked to keep forever (säästöpuu) */
  keep: boolean;
  /** year a moose last browsed this sapling */
  browsed?: number;
}

/** Why a tree died. */
export type DeathCause = 'crowded' | 'old' | 'storm' | 'beetle' | 'moose';

/**
 * A dead tree you can see: a fallen log or a standing snag. Its carbon is part
 * of the deadwood store and rots away at the same pace; `c` is what is left.
 */
export interface Log {
  id: number;
  sp: SpeciesId;
  d: number;
  h: number;
  x: number;
  /** wood carbon left, kg, and at death */
  c: number;
  c0: number;
  year: number;
  cause: DeathCause;
  standing: boolean;
}

export type EventKind = 'storm' | 'beetle' | 'moose' | 'drought';
export interface ForestEvent { year: number; kind: EventKind; count: number }

export type AnimalId = 'moose' | 'blackWoodpecker' | 'spottedWoodpecker' | 'capercaillie' | 'siberianJay' | 'treecreeper' | 'flyingSquirrel';

export type DecisionKind = 'regen' | 'young' | 'crowded' | 'mature' | 'storm' | 'beetle';
export type ChoiceId =
  | 'plant' | 'seed' | 'nothing' | 'tend' | 'thin' | 'thinLight'
  | 'clearcut' | 'clearcutKeep' | 'cc' | 'leaveOld'
  | 'removeFallen' | 'leaveFallen' | 'removeHalf' | 'removeBeetle' | 'leaveBeetle';
export interface Decision { kind: DecisionKind; year: number; choices: ChoiceId[] }

export interface YearRecord {
  year: number;
  weather: YearWeather;
  /** 0..1, how well the soil bucket met the trees' summer thirst */
  water: number;
  /** water in the soil when summer starts, mm */
  springWater: number;
  stores: Ledger['stores'];
  flows: Ledger['flows'];
  deaths: number;
  stats: StandStats;
  /** what happened this year (storm, beetles, moose, drought) */
  events?: ForestEvent[];
  /** animals seen for the first time this year */
  newAnimals?: AnimalId[];
}

export interface HarvestEvent {
  year: number;
  kind: 'thin' | 'clearcut' | 'tend' | 'remove' | 'salvage' | 'cc';
  harvest: Harvest;
}

export interface Forest {
  version: 1;
  seed: string;
  place: PlaceId;
  soil: SoilId;
  /** the next year to be simulated (years already done: 0 … year − 1) */
  year: number;
  trees: Tree[];
  nextId: number;
  ledger: Ledger;
  pools: Record<ProductKind, number>;
  history: YearRecord[];
  harvests: HarvestEvent[];
  /** visible deadwood: fallen logs and standing snags */
  logs: Log[];
  events: ForestEvent[];
  /** animals and the year each was first seen */
  seen: { animal: AnimalId; year: number }[];
  /** a question waiting for the player; the forest waits too */
  pending: Decision | null;
  /** when each kind of question was last asked, so Tikka does not nag */
  asked: Partial<Record<DecisionKind, number>>;
  /** natural seeding in progress until this year */
  regenUntil: number | null;
  /** continuous cover: young trees keep arriving under the canopy */
  continuous: boolean;
}

export function createForest(opts: { seed: string; place: PlaceId; soil: SoilId }): Forest {
  const ledger = newLedger();
  // The soil already holds carbon from earlier forests. It counts as part of the
  // starting total, so conservation is checked against it.
  ledger.stores.soil = SOILS[opts.soil].soilC0 * 1000 / HA_FACTOR;
  return {
    version: 1, seed: opts.seed, place: opts.place, soil: opts.soil, year: 0,
    trees: [], nextId: 1, ledger, pools: { sawn: 0, paper: 0, energy: 0 },
    history: [], harvests: [], logs: [], events: [], seen: [], pending: null, asked: {}, regenUntil: null, continuous: false,
  };
}

/** Fill in fields added after a forest was saved (F1 saves have no events or logs). */
export function upgradeForest(f: Forest): Forest {
  const d = f as Partial<Forest> & Forest;
  d.logs ??= [];
  d.events ??= [];
  d.seen ??= [];
  d.pending ??= null;
  d.asked ??= {};
  d.regenUntil ??= null;
  d.continuous ??= false;
  return d;
}

export function treeCarbon(t: Tree): number {
  return t.c.wood + t.c.foliage + t.c.fine;
}

/** Carbon targets for a tree of this size. */
export function carbonFor(sp: Species, d: number, h: number, foliageFactor = 1): Tree['c'] {
  const foliage = foliageDry(sp, d, h) * CARBON_SHARE * foliageFactor;
  return {
    wood: woodyDry(sp, d, h) * CARBON_SHARE,
    foliage,
    fine: foliage * sp.fineRootRatio,
  };
}

export function basalArea(d: number): number {
  const r = d / 200;
  return Math.PI * r * r;
}

/** Leaf area index: square metres of leaves per square metre of ground. */
export function leafAreaIndex(trees: Tree[]): number {
  let a = 0;
  for (const t of trees) a += (t.c.foliage / CARBON_SHARE) * SPECIES[t.sp].sla;
  return a / PLOT_M2;
}

/**
 * Light competition: for each tree, the basal area (m²/ha) of the trees
 * taller than it. Returned in the same order as `trees`.
 */
export function shadeAbove(trees: Tree[]): number[] {
  const order = trees.map((_, i) => i).sort((a, b) => trees[b].h - trees[a].h || trees[a].id - trees[b].id);
  const out = new Array<number>(trees.length);
  let acc = 0;
  let i = 0;
  while (i < order.length) {
    // trees of (almost) equal height do not shade each other
    let j = i;
    let group = 0;
    while (j < order.length && trees[order[i]].h - trees[order[j]].h < 0.5) {
      group += basalArea(trees[order[j]].d) * HA_FACTOR;
      j++;
    }
    for (let k = i; k < j; k++) out[order[k]] = acc;
    acc += group;
    i = j;
  }
  return out;
}

/** Shared competition for water and soil food: growth × e^(−CROWDING·G). */
export const CROWDING = 0.015;

export interface Site {
  soil: Soil;
  /** 0..1 summer water factor for the whole stand */
  water: number;
  /** warmth factor of this summer (1 = eastern Finland average) */
  warmth: number;
  /** stand basal area, m²/ha */
  G: number;
}

/** How a species responds to the soil and this summer's water. */
export function siteResponse(sp: Species, site: Site) {
  const nut = (1 - sp.nutNeed * (1 - site.soil.nutrients)) * site.soil.depth;
  const wet = Math.pow(1 - site.soil.wetness * (1 - sp.wetTol), 1.5);
  const dry = 1 - (1 - site.water) * (1 - sp.droughtTol);
  return { nut, wet, dry };
}

/** Tallest height this species reaches on this soil. */
export function siteHeight(sp: Species, soil: Soil): number {
  const nut = (1 - sp.nutNeed * (1 - soil.nutrients)) * soil.depth;
  const wet = Math.pow(1 - soil.wetness * (1 - sp.wetTol), 1.5);
  return sp.hMax * (0.45 + 0.55 * nut * wet);
}

/**
 * Grow one tree by one year, in place, and set its vigor.
 * `bal` is the basal area of taller trees (m²/ha).
 */
export function growTree(t: Tree, bal: number, site: Site): void {
  const sp = SPECIES[t.sp];
  const { nut, wet, dry } = siteResponse(sp, site);
  const light = Math.exp(-sp.shadeComp * bal);
  const crowd = Math.exp(-CROWDING * site.G);

  // height: move along the site's height curve, slowed by shade and drought
  const hTop = siteHeight(sp, site.soil);
  const te = ageAtHeight(sp, hTop, t.h);
  const dhOpen = Math.max(0, heightAt(sp, hTop, te + site.warmth) - t.h) * Math.sqrt(dry);
  const dh = dhOpen * Math.pow(light, 0.6);

  // diameter: grows once the tree is above breast height
  const start = t.h < 1.3 ? 0 : Math.min(1, 0.2 + (t.h - 1.3) / 1.5);
  const ddOpen = sp.g0 * site.warmth * nut * wet * dry * Math.exp(-t.d / sp.dScale) * start;
  const dd = ddOpen * light * crowd;

  // vigor: how much light the crown gets, 1 = open sky (shade-tolerant spruce copes with less)
  t.vigor = Math.pow(light, 0.6);

  t.h += dh;
  if (t.h >= 1.3) {
    t.d += dd;
    t.rings.push(Math.round(dd * 10 * 10) / 10);
  }
  t.age += 1;
}

/** Reineke stand density limits (trees/ha at 25 cm mean diameter), verify. */
export const SDI_MAX: Record<SpeciesId, number> = { pine: 750, spruce: 850, birch: 650, aspen: 650 };

/** Reineke stand density index: trees/ha converted to a 25 cm mean diameter. */
export function sdi(trees: Tree[], haFactor = HA_FACTOR): number {
  let s = 0;
  for (const t of trees) if (t.d > 0) s += Math.pow(t.d / 25, 1.605);
  return s * haFactor;
}

/** The self-thinning limit for this mix of species. */
export function sdiLimit(trees: Tree[]): number {
  let sum = 0;
  let n = 0;
  for (const t of trees) if (t.d > 0) { sum += SDI_MAX[t.sp]; n++; }
  return n ? sum / n : Infinity;
}

/** How full the stand is: 0 = open, 1 = at the self-thinning limit. */
export function relativeDensity(trees: Tree[]): number {
  const lim = sdiLimit(trees);
  return Number.isFinite(lim) ? sdi(trees) / lim : 0;
}

export interface StandStats {
  /** trees per hectare (all sizes) */
  nHa: number;
  /** basal area, m²/ha */
  G: number;
  /** stem volume, m³/ha */
  volume: number;
  /** mean height of the 100 biggest trees per hectare, m */
  domH: number;
  /** quadratic mean diameter, cm */
  dq: number;
  lai: number;
  bySpecies: Record<SpeciesId, { nHa: number; volume: number }>;
}

export function standStats(trees: Tree[]): StandStats {
  let G = 0;
  let vol = 0;
  let d2 = 0;
  let nd = 0;
  const bySpecies: StandStats['bySpecies'] = {
    pine: { nHa: 0, volume: 0 }, spruce: { nHa: 0, volume: 0 }, birch: { nHa: 0, volume: 0 }, aspen: { nHa: 0, volume: 0 },
  };
  for (const t of trees) {
    const v = stemVolume(SPECIES[t.sp], t.d, t.h) * HA_FACTOR;
    G += basalArea(t.d) * HA_FACTOR;
    vol += v;
    bySpecies[t.sp].nHa += HA_FACTOR;
    bySpecies[t.sp].volume += v;
    if (t.d > 0) { d2 += t.d * t.d; nd++; }
  }
  const top = Math.max(1, Math.round(100 / HA_FACTOR));
  const tallest = trees.map(t => t.h).sort((a, b) => b - a).slice(0, top);
  const domH = tallest.length ? tallest.reduce((a, b) => a + b, 0) / tallest.length : 0;
  return {
    nHa: trees.length * HA_FACTOR, G, volume: vol, domH,
    dq: nd ? Math.sqrt(d2 / nd) : 0, lai: leafAreaIndex(trees), bySpecies,
  };
}
