/**
 * What the player can do to the forest between years: plant, let nature
 * seed, tend seedlings, thin, keep trees forever (säästöpuut), final harvest,
 * continuous cover (cut the biggest, let small ones grow), and take storm-felled
 * or beetle-killed trees out of the forest. `applyChoice` carries out the
 * answer to one of Tikka's questions (decisions.ts).
 */
import { makeRng } from '../rng';
import { move } from './carbon';
import { BRANCH_SHARE, ROOT_SHARE } from './species';
import { HA_FACTOR, carbonFor, standStats, type ChoiceId, type Forest, type HarvestEvent, type Log, type Tree } from './stand';
import { DISTURBANCE } from './events';
import { SPECIES, stemVolume, type SpeciesId } from './species';
import { toGround } from './year';
import { fell, mill, newHarvest, type Harvest } from './wood';

/** Planting densities, trees per hectare (verify against Tapio guidance). */
export const SPACING = { sparse: 1600, normal: 2000, dense: 2600 } as const;
export type Spacing = keyof typeof SPACING;

/** Trees smaller than this (cm) are not worth taking to a mill and stay on the ground. */
const MILL_MIN_D = 7;

/** Seedling height when planted, m. */
export const SEEDLING_H: Record<SpeciesId, number> = { pine: 0.2, spruce: 0.3, birch: 0.4, aspen: 0.4 };

/**
 * Plant seedlings. `mix` gives shares per species, e.g. { spruce: 0.7, birch: 0.3 }.
 * Seedlings come from a nursery, where they took their small amount of carbon
 * from the air, so planting moves that carbon from the air into the trees.
 */
export function plant(f: Forest, mix: Partial<Record<SpeciesId, number>>, spacing: Spacing = 'normal'): number {
  const n = Math.round(SPACING[spacing] / HA_FACTOR);
  const entries = (Object.entries(mix) as [SpeciesId, number][]).filter(([, s]) => s > 0);
  const totalShare = entries.reduce((a, [, s]) => a + s, 0);
  if (!entries.length || totalShare <= 0) return 0;
  const rng = makeRng(`${f.seed}|p|${f.year}`);
  // spread species evenly through the rows, not in blocks
  const acc = entries.map(() => 0);
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let k = 0; k < entries.length; k++) {
      acc[k] += entries[k][1] / totalShare;
      if (acc[k] > acc[best]) best = k;
    }
    acc[best] -= 1;
    const sp = entries[best][0];
    const h = SEEDLING_H[sp] * (0.85 + 0.3 * rng());
    const t: Tree = {
      id: f.nextId++, sp, born: f.year, age: 2, h, d: 0,
      c: carbonFor(SPECIES[sp], 0, h), x: (i + 0.2 + 0.6 * rng()) / n,
      vigor: 1, rings: [], keep: false,
    };
    move(f.ledger, 'air', 'trees', t.c.wood + t.c.foliage + t.c.fine);
    f.trees.push(t);
  }
  return n;
}

function take(f: Forest, chosen: Tree[], kind: HarvestEvent['kind']): Harvest {
  const out = newHarvest();
  const ids = new Set(chosen.map(t => t.id));
  for (const t of chosen) {
    if (t.d < MILL_MIN_D) {
      toGround(f.ledger, t);
      continue;
    }
    fell(f.ledger, f.pools, {
      sp: t.sp, d: t.d, volume: stemVolume(SPECIES[t.sp], t.d, t.h),
      wood: t.c.wood, foliage: t.c.foliage, fine: t.c.fine,
    }, out);
    t.c = { wood: 0, foliage: 0, fine: 0 };
  }
  f.trees = f.trees.filter(t => !ids.has(t.id));
  f.harvests.push({ year: f.year, kind, harvest: out });
  return out;
}

/** Thin from below: remove the smallest trees until `perHa` remain. */
export function thin(f: Forest, perHa: number, kind: 'thin' | 'tend' = 'thin'): Harvest {
  const keepN = Math.round(perHa / HA_FACTOR);
  const sorted = [...f.trees].sort((a, b) => b.d - a.d || b.h - a.h || a.id - b.id);
  const marked = sorted.filter(t => t.keep);
  const rest = sorted.filter(t => !t.keep);
  const remove = rest.slice(Math.max(0, keepN - marked.length));
  return take(f, remove, kind);
}

/** Thin by basal area: remove the smallest trees until the stand is at `targetG` m²/ha. */
export function thinToBasalArea(f: Forest, targetG: number): Harvest {
  const sorted = [...f.trees].sort((a, b) => b.d - a.d || b.h - a.h || a.id - b.id);
  let G = 0;
  const remove: Tree[] = [];
  for (const t of sorted) {
    const g = Math.PI * (t.d / 200) ** 2 * HA_FACTOR;
    if (t.keep || G + g <= targetG) G += g;
    else remove.push(t);
  }
  return take(f, remove, 'thin');
}

/** Mark the biggest `n` trees on the plot to be kept forever (säästöpuut). */
export function markKeep(f: Forest, n: number): void {
  const sorted = [...f.trees].sort((a, b) => b.d - a.d || a.id - b.id);
  sorted.slice(0, n).forEach(t => { t.keep = true; });
}

/** Final harvest: everything except the trees marked to keep. */
export function clearcut(f: Forest): Harvest {
  return take(f, f.trees.filter(t => !t.keep), 'clearcut');
}

/** Keep a couple of trees forever, preferring aspen, then pine and the biggest (säästöpuut). */
export function keepRetention(f: Forest, n = 2): void {
  const rank = (t: Tree) => (t.sp === 'aspen' ? 2 : t.sp === 'pine' ? 1 : 0) * 100 + t.d;
  [...f.trees].filter(t => !t.keep && t.d > 0).sort((a, b) => rank(b) - rank(a) || a.id - b.id).slice(0, n).forEach(t => { t.keep = true; });
}

/**
 * Continuous cover (jatkuva kasvatus): cut the biggest trees until the stand
 * is at `targetG` m²/ha, and let the small ones and new seedlings grow on.
 */
export function continuousCover(f: Forest, targetG = 12): Harvest {
  const G = () => standStats(f.trees.filter(t => !chosen.has(t.id))).G;
  const chosen = new Set<number>();
  for (const t of [...f.trees].sort((a, b) => b.d - a.d || a.id - b.id)) {
    if (G() <= targetG) break;
    if (!t.keep) chosen.add(t.id);
  }
  f.continuous = true;
  return take(f, f.trees.filter(t => chosen.has(t.id)), 'cc');
}

/** Let the forest seed itself over the next years (luontainen uudistuminen). */
export function seedNaturally(f: Forest): void {
  f.regenUntil = f.year + DISTURBANCE.regenYears;
}

/**
 * Take dead trees out of the forest to the mills. Only the stem goes; its
 * carbon moves from the deadwood store to products, and the log leaves the
 * view. Fresh logs still give some sawlogs; older ones only pulp and energy.
 */
export function salvage(f: Forest, logs: Log[]): Harvest {
  const out = newHarvest();
  const ids = new Set(logs.map(l => l.id));
  for (const l of logs) {
    const stem = Math.min(l.c / (1 + BRANCH_SHARE + ROOT_SHARE), f.ledger.stores.deadwood);
    if (stem <= 0) continue;
    const fresh = f.year - l.year <= 1;
    mill(f.ledger, 'deadwood', f.pools, l.sp, l.d, stem, out, fresh && l.cause === 'storm' ? 0.7 : 0);
    out.count++;
    out.volume += stemVolume(SPECIES[l.sp], l.d, l.h);
  }
  f.logs = f.logs.filter(l => !ids.has(l.id));
  f.harvests.push({ year: f.year, kind: 'salvage', harvest: out });
  return out;
}

/** Recently fallen or killed trees of one kind, still worth taking out. */
export function freshLogs(f: Forest, cause: 'storm' | 'beetle'): Log[] {
  return f.logs.filter(l => l.cause === cause && f.year - l.year <= 2);
}

export interface ChoiceOptions {
  mix?: Partial<Record<SpeciesId, number>>;
  spacing?: Spacing;
}

/** Carry out the answer to Tikka's question. */
export function applyChoice(f: Forest, choice: ChoiceId, opt: ChoiceOptions = {}): Harvest | null {
  f.pending = null;
  switch (choice) {
    case 'plant':
      f.regenUntil = null;
      plant(f, opt.mix ?? { spruce: 1 }, opt.spacing ?? 'normal');
      return null;
    case 'seed': seedNaturally(f); return null;
    case 'tend': return thin(f, 1800, 'tend');
    case 'thin': return thinToBasalArea(f, 19);
    case 'thinLight': return thinToBasalArea(f, 23);
    case 'clearcut': f.continuous = false; return clearcut(f);
    case 'clearcutKeep': f.continuous = false; keepRetention(f); return clearcut(f);
    case 'cc': return continuousCover(f);
    case 'removeFallen': return salvage(f, freshLogs(f, 'storm'));
    case 'removeHalf': { const l = freshLogs(f, 'storm'); return salvage(f, l.filter((_, i) => i % 2 === 0)); }
    case 'removeBeetle': return salvage(f, freshLogs(f, 'beetle'));
    case 'nothing': case 'leaveOld': case 'leaveFallen': case 'leaveBeetle': return null;
  }
}
