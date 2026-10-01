/**
 * The five results, always shown together and never added into one score:
 * Wood, Carbon, Life, Health and Products. Each one comes with the main
 * reason behind it, so the game can say why, not only how much.
 *
 * Life and Health are simple 0–5 indices made for the game. Their
 * ingredients (species mix, broadleaves, deadwood, big old trees; water,
 * crowding, deaths) follow Finnish forest biodiversity and health
 * indicators, but the weights are game choices (verify with a forest
 * ecologist, docs/forest-model.md).
 */
import { CO2_PER_C } from './carbon';
import { SPECIES } from './species';
import { stemVolume } from './species';
import { HA_FACTOR, relativeDensity, type Forest } from './stand';

/** kg C on the plot → tonnes per hectare */
export const tHa = (kgPlot: number) => kgPlot * HA_FACTOR / 1000;


export type LifeReason = 'young' | 'oneSpecies' | 'mixed' | 'deadwood' | 'oldTrees';
export type HealthReason = 'fine' | 'drought' | 'crowded' | 'dying';

export interface Results {
  year: number;
  wood: { standing: number; harvested: number };
  /** tonnes CO₂ per hectare */
  carbon: { trees: number; dead: number; soil: number; products: number; removed: number };
  life: { score: number; reason: LifeReason; species: number; deadwoodM3: number; bigTrees: number };
  health: { score: number; reason: HealthReason; water: number; crowding: number; deaths: number };
  /** carbon made into products so far, t CO₂ per hectare */
  products: { sawn: number; paper: number; textile: number; energy: number };
}

const round05 = (x: number) => Math.round(x * 2) / 2;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function lifeIndex(f: Forest): Results['life'] {
  const n = f.trees.length || 1;
  const counts = { pine: 0, spruce: 0, birch: 0, aspen: 0 };
  let birchVol = 0;
  let vol = 0;
  let big = 0;
  for (const t of f.trees) {
    counts[t.sp]++;
    const v = t.d * t.d * t.h;
    vol += v;
    if (t.sp === 'birch' || t.sp === 'aspen') birchVol += v;
    if (t.d >= 35 || t.age >= 120) big++;
  }
  const species = Object.values(counts).filter(c => c / n >= 0.1).length;
  // a mix only becomes a habitat as the trees grow up
  const grown = Math.min(1, (f.history.at(-1)?.stats.domH ?? 0) / 12);
  const mix = (species >= 3 ? 1.2 : species === 2 ? 0.7 : 0) * grown;
  const broadleaf = vol > 0 ? Math.min(0.6, (birchVol / vol) * 3) * grown : 0;
  // deadwood that matters for life: dead trees lying or standing, not stumps and roots
  const deadwoodM3 = logVolume(f);
  const dead = Math.min(1.5, (deadwoodM3 / 40) * 1.5);
  const bigHa = big * HA_FACTOR;
  const old = Math.min(1, bigHa / 20);
  const score = round05(clamp(0.5 + mix + broadleaf + dead + old, 0.5, 5));
  const parts: [LifeReason, number][] = [['mixed', mix + broadleaf], ['deadwood', dead], ['oldTrees', old]];
  parts.sort((a, b) => b[1] - a[1]);
  let reason: LifeReason = parts[0][1] >= 0.5 ? parts[0][0] : f.year < 25 ? 'young' : 'oneSpecies';
  if (reason === 'mixed' && species < 2) reason = 'oneSpecies';
  return { score, reason, species, deadwoodM3, bigTrees: bigHa };
}

/** Volume of visible dead trees (logs and snags), m³/ha, shrinking as they rot. */
export function logVolume(f: Forest): number {
  let v = 0;
  for (const l of f.logs) v += stemVolume(SPECIES[l.sp], l.d, l.h) * (l.c / l.c0);
  return v * HA_FACTOR;
}

export function healthIndex(f: Forest): Results['health'] {
  const last = f.history.at(-1);
  if (!last || f.trees.length === 0) return { score: 5, reason: 'fine', water: 1, crowding: 0, deaths: 0 };
  // drought stress felt by the trees that grow here
  let tol = 0;
  for (const t of f.trees) tol += SPECIES[t.sp].droughtTol;
  tol /= f.trees.length;
  const water = 1 - (1 - last.water) * (1 - tol);
  // crowding: how close the stand is to its self-thinning limit
  const crowding = clamp((relativeDensity(f.trees) - 0.5) / 0.45, 0, 1);
  const deaths = last.deaths / (f.trees.length + last.deaths);
  const deathPart = 1 - Math.min(1, deaths * 10);
  const score = round05(clamp(5 * (0.4 * water + 0.4 * (1 - crowding) + 0.2 * deathPart), 0.5, 5));
  const worst: [HealthReason, number][] = [['drought', 1 - water], ['crowded', crowding * 0.6], ['dying', 1 - deathPart]];
  worst.sort((a, b) => b[1] - a[1]);
  const reason: HealthReason = worst[0][1] > 0.15 ? worst[0][0] : 'fine';
  return { score, reason, water, crowding, deaths };
}

export function results(f: Forest): Results {
  const s = f.ledger.stores;
  const co2 = (kg: number) => tHa(kg) * CO2_PER_C;
  const standing = f.history.at(-1)?.stats.volume ?? 0;
  const harvested = f.harvests.reduce((a, h) => a + h.harvest.volume * HA_FACTOR, 0);
  const made = { sawn: 0, paper: 0, textile: 0, energy: 0 };
  for (const h of f.harvests) for (const k of ['sawn', 'paper', 'textile', 'energy'] as const) made[k] += co2(h.harvest.products[k] ?? 0);
  return {
    year: f.year,
    wood: { standing, harvested },
    carbon: {
      trees: co2(s.trees), dead: co2(s.litter + s.deadwood), soil: co2(s.soil), products: co2(s.products),
      removed: co2(-s.air),
    },
    life: lifeIndex(f),
    health: healthIndex(f),
    products: made,
  };
}
