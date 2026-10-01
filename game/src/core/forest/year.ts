/**
 * One Metsäni year, in four seasonal sub-steps:
 *
 *   spring  snowmelt fills the soil bucket
 *   summer  trees grow and take carbon from the air (water and light permitting)
 *   autumn  leaves, needles, fine roots and ground plants fall as litter
 *   winter  trees that lost the competition die; decomposers and products
 *           return carbon to the air
 *
 * Deterministic: the weather comes from (place, seed, year) and each tree's
 * fate from (seed, year, tree id), so the same choices give the same forest.
 */
import { makeRng } from '../rng';
import { move, type Ledger } from './carbon';
import { PLACES, decayWarmth, warmthFactor, yearWeather } from './climate';
import { SOILS } from './soil';
import { SPECIES } from './species';
import { spotAnimals } from './animals';
import { nextDecision } from './decisions';
import { addLog, ageLogs, beetles, ingrowth, moose, storm } from './events';
import {
  HA_FACTOR, carbonFor, growTree, leafAreaIndex, sdi, sdiLimit, shadeAbove, siteResponse, standStats, treeCarbon,
  type DeathCause, type Forest, type ForestEvent, type Site, type Tree, type YearRecord,
} from './stand';
import { decayProducts } from './wood';

export const TUNING = {
  /** summer water use of a closed canopy (LAI ≥ 3) at the reference warmth, mm */
  canopyThirst: 260,
  /** water lost from the forest floor anyway, mm */
  floorThirst: 40,
  /** yearly share of litter that decomposes, at the reference warmth */
  litterK: 0.3,
  /** share of decomposed litter that becomes lasting soil carbon (humus) */
  litterHumify: 0.25,
  deadwoodK: 0.045,
  deadwoodHumify: 0.15,
  /** fine-root turnover per year */
  fineTurnover: 0.7,
  /** small branches dropped each year, share of wood carbon */
  branchTurnover: 0.004,
  /** litter from ground plants (blueberry, mosses, grasses) in the open, kg C/ha/year */
  groundPlants: 700,
  /** background mortality per year */
  baseMortality: 0.002,
  /** below this vigor a tree starts to starve in the shade */
  starveVigor: 0.35,
  starveMortality: 0.18,
};

/** Spring and summer water: how well the soil bucket meets the trees' thirst. */
export function waterBalance(f: Forest, w: { snowWater: number; summerRain: number; tempSum: number }) {
  const soil = SOILS[f.soil];
  const springWater = Math.min(soil.waterCap, 0.4 * soil.waterCap + w.snowWater * (1 - 0.5 * soil.drainage));
  const supply = springWater + w.summerRain * (1 - 0.6 * soil.drainage);
  const lai = leafAreaIndex(f.trees);
  const demand = TUNING.canopyThirst * (w.tempSum / PLACES.east.tempSum) * Math.min(1, lai / 3) + TUNING.floorThirst;
  return { springWater, water: Math.min(1, supply / demand) };
}

/** Send a dead or cut-to-ground tree's carbon to deadwood and litter. */
export function toGround(l: Ledger, t: Tree): void {
  move(l, 'trees', 'deadwood', t.c.wood);
  move(l, 'trees', 'litter', t.c.foliage + t.c.fine);
  t.c = { wood: 0, foliage: 0, fine: 0 };
}

export function stepYear(f: Forest): YearRecord {
  const place = PLACES[f.place];
  const soil = SOILS[f.soil];
  const l = f.ledger;
  const weather = yearWeather(place, f.seed, f.year);

  // spring
  const { springWater, water } = waterBalance(f, weather);

  // summer: growth and carbon uptake
  const before = standStats(f.trees);
  const site: Site = { soil, water, warmth: warmthFactor(weather.tempSum), G: before.G };
  const browsed = moose(f);
  const bal = shadeAbove(f.trees);
  let uptake = 0;
  let shed = 0;
  f.trees.forEach((t, i) => {
    const sp = SPECIES[t.sp];
    const old = t.c;
    const h0 = t.h;
    growTree(t, bal[i], site);
    // a browsed sapling loses most of this summer's new height
    if (browsed.has(t.id)) { t.h = h0 + (t.h - h0) * 0.3; t.browsed = f.year; }
    // dry summers make trees drop some foliage, which grows back later
    const { dry } = siteResponse(sp, site);
    const next = carbonFor(sp, t.d, t.h, 1 - 0.35 * (1 - dry));
    const turnover = old.foliage * sp.folTurnover + old.fine * TUNING.fineTurnover + old.wood * TUNING.branchTurnover;
    // new tissue, plus replacing what is shed this year
    for (const k of ['wood', 'foliage', 'fine'] as const) {
      const delta = next[k] - old[k];
      if (delta >= 0) uptake += delta;
      else shed -= delta;
    }
    uptake += turnover;
    shed += turnover;
    t.c = next;
  });
  move(l, 'air', 'trees', uptake);

  // autumn: litterfall, from the trees and from the ground plants under them
  move(l, 'trees', 'litter', shed);
  const ground = TUNING.groundPlants / HA_FACTOR * Math.sqrt(site.warmth) * (1 - 0.6 * Math.min(1, before.lai / 4));
  move(l, 'air', 'litter', ground);

  // winter: deaths, each with its cause
  const dead = new Map<number, DeathCause>();
  for (const t of f.trees) {
    if (t.keep && t.vigor > 0.05) continue;
    const r = makeRng(`${f.seed}|m|${f.year}|${t.id}`)();
    let p = TUNING.baseMortality;
    if (t.vigor < TUNING.starveVigor) p += TUNING.starveMortality * (1 - t.vigor / TUNING.starveVigor);
    const oldAge = SPECIES[t.sp].oldAge;
    const pOld = t.age > oldAge ? 0.02 * (t.age - oldAge) / 20 : 0;
    if (r < p + pOld) dead.set(t.id, r < pOld ? 'old' : 'crowded');
    else if (browsed.has(t.id) && makeRng(`${f.seed}|md|${f.year}|${t.id}`)() < 0.05) dead.set(t.id, 'moose');
  }
  // self-thinning: a crowded canopy cannot hold more trees of this size.
  // Saplings in the understorey are not part of it; they live or die by light.
  const canopyH = 0.5 * before.domH;
  let alive = f.trees.filter(t => !dead.has(t.id) && t.h >= canopyH);
  const limit = sdiLimit(alive);
  if (sdi(alive) > limit) {
    const weakest = alive.filter(t => t.d > 0 && !t.keep).sort((a, b) => a.d - b.d || a.vigor - b.vigor || a.id - b.id);
    for (const t of weakest) {
      if (sdi(alive) <= limit) break;
      dead.set(t.id, 'crowded');
      alive = alive.filter(a => a.id !== t.id);
    }
  }
  // disturbances: bark beetles (in this summer's drought, or last year's fresh
  // dead spruce), then autumn storms
  const events: ForestEvent[] = [];
  const bb = beetles(f, weather.drought, weather.tempSum);
  for (const id of bb) dead.set(id, 'beetle');
  const { fallen } = storm(f);
  for (const id of fallen) dead.set(id, 'storm');
  if (weather.drought) events.push({ year: f.year, kind: 'drought', count: 0 });
  if (bb.size) events.push({ year: f.year, kind: 'beetle', count: bb.size });
  if (fallen.size) events.push({ year: f.year, kind: 'storm', count: fallen.size });
  if (browsed.size) events.push({ year: f.year, kind: 'moose', count: browsed.size });
  for (const t of f.trees) {
    const cause = dead.get(t.id);
    if (!cause) continue;
    addLog(f, t, cause);
    toGround(l, t);
  }
  f.trees = f.trees.filter(t => !dead.has(t.id));

  // new trees arriving on their own
  ingrowth(f, standStats(f.trees).G);

  // all year: decomposers and products
  const warm = decayWarmth(weather.tempSum);
  const slow = 1 - 0.5 * soil.wetness;
  const litterGone = l.stores.litter * Math.min(1, TUNING.litterK * warm * slow);
  move(l, 'litter', 'soil', litterGone * TUNING.litterHumify);
  move(l, 'litter', 'air', litterGone * (1 - TUNING.litterHumify));
  const deadK = Math.min(1, TUNING.deadwoodK * warm * slow);
  const deadGone = l.stores.deadwood * deadK;
  ageLogs(f, deadK);
  move(l, 'deadwood', 'soil', deadGone * TUNING.deadwoodHumify);
  move(l, 'deadwood', 'air', deadGone * (1 - TUNING.deadwoodHumify));
  move(l, 'soil', 'air', l.stores.soil * soil.humusK * warm);
  decayProducts(l, f.pools);

  const newAnimals = spotAnimals(f);
  const rec: YearRecord = {
    year: f.year, weather, water, springWater,
    stores: { ...l.stores }, flows: l.flows, deaths: dead.size, stats: standStats(f.trees),
    events, newAnimals,
  };
  l.flows = {};
  f.history.push(rec);
  f.events.push(...events);
  f.year += 1;
  // Tikka may have a question for next year
  if (!f.pending) f.pending = nextDecision(f, rec);
  return rec;
}

export function run(f: Forest, years: number): Forest {
  for (let i = 0; i < years; i++) stepYear(f);
  return f;
}

/** Carbon in the trees, recomputed from the trees themselves. */
export function treesCarbon(f: Forest): number {
  return f.trees.reduce((s, t) => s + treeCarbon(t), 0);
}
