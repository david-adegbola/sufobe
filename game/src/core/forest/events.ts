/**
 * Things that happen to a forest: storms, bark beetles, moose, and new trees
 * arriving on their own. Each is a few clear causes and effects, simplified
 * from common Finnish forest damage (verify: docs/forest-model.md).
 *
 *  - Storms blow over tall trees. Shallow-rooted spruce falls most, and more
 *    so on wet or thin soils, in a stand thinned in the last few years, or
 *    when only a few trees are left standing.
 *  - The spruce bark beetle (kirjanpainaja) breeds in fresh dead spruce and
 *    attacks living spruces weakened by drought. Removing fresh storm-felled
 *    or beetle-killed spruce lowers the risk; leaving it raises the risk but
 *    feeds the many species that live in deadwood.
 *  - Moose browse young pine, birch and aspen; a browsed sapling grows less.
 *  - Natural seeding and continuous cover bring new seedlings.
 *
 * Every random draw comes from (seed, year, what), so it is deterministic.
 */
import { makeRng } from '../rng';
import { move } from './carbon';
import { warmthFactor } from './climate';
import { SPECIES, type SpeciesId } from './species';
import { HA_FACTOR, carbonFor, type DeathCause, type Forest, type Tree } from './stand';

export const DISTURBANCE = {
  /** chance of a damaging storm per year, by place (a game rate, verify) */
  stormChance: { south: 0.08, east: 0.07, lapland: 0.05, future: 0.11 } as Record<string, number>,
  /** how easily each species is blown over */
  windfall: { spruce: 1, pine: 0.45, birch: 0.5, aspen: 0.6 } as Record<SpeciesId, number>,
  /** fresh spruce deadwood (t C/ha) that makes beetle risk high */
  beetleFood: 3,
  mooseChance: { south: 0.55, east: 0.6, lapland: 0.45, future: 0.6 } as Record<string, number>,
  /** natural seeding: years it takes, and seedlings it aims for per hectare */
  regenYears: 10,
  regenTarget: 2400,
};

const rngFor = (f: Forest, what: string) => makeRng(`${f.seed}|${what}|${f.year}`);
const draw = (f: Forest, what: string, id: number) => makeRng(`${f.seed}|${what}|${f.year}|${id}`)();

function recentlyOpened(f: Forest): boolean {
  return f.harvests.some(h => (h.kind === 'thin' || h.kind === 'cc') && f.year - h.year <= 5);
}

/** Trees blown over this year (ids), or none. Returns the storm strength too. */
export function storm(f: Forest): { fallen: Set<number>; strength: number } {
  const r = rngFor(f, 'storm');
  const fallen = new Set<number>();
  if (r() >= DISTURBANCE.stormChance[f.place]) return { fallen, strength: 0 };
  const strength = 0.3 + 0.7 * r();
  const soilF = f.soil === 'peat' || f.soil === 'rocky' ? 1.4 : f.soil === 'clay' ? 1.1 : 1;
  const openF = recentlyOpened(f) ? 2 : 1;
  const fewF = f.trees.length < 10 ? 2.5 : 1;
  for (const t of f.trees) {
    if (t.h < 8) continue;
    const p = Math.min(0.6, strength * 0.035 * DISTURBANCE.windfall[t.sp] * (t.h / 20) ** 2 * soilF * openF * fewF);
    if (draw(f, 'fall', t.id) < p) fallen.add(t.id);
  }
  return { fallen, strength };
}

/** Fresh spruce deadwood (t C/ha): what bark beetles breed in. */
export function beetleFood(f: Forest): number {
  let c = 0;
  for (const l of f.logs) if (l.sp === 'spruce' && f.year - l.year <= 1 && l.d >= 12) c += l.c;
  return c * HA_FACTOR / 1000;
}

/** 0..1 bark beetle risk this year. */
export function beetleRisk(f: Forest, drought: boolean, warmth: number): number {
  const big = f.trees.filter(t => t.sp === 'spruce' && t.d >= 15).length;
  if (big < 3 || warmth < 0.6) return 0;
  const lastDrought = f.history.at(-1)?.weather.drought ?? false;
  const food = beetleFood(f);
  // beetles need either drought-weakened spruces or fresh dead spruce to breed in
  if (!drought && !lastDrought && food < 0.3) return 0;
  let risk = 0;
  if (drought) risk += 0.25;
  if (lastDrought) risk += 0.15;
  risk += Math.min(0.5, (food / DISTURBANCE.beetleFood) * 0.5);
  return Math.min(1, risk * Math.min(1.4, warmth));
}

/** Spruces killed by bark beetles this year. */
export function beetles(f: Forest, drought: boolean, tempSum: number): Set<number> {
  const killed = new Set<number>();
  const risk = beetleRisk(f, drought, warmthFactor(tempSum));
  const r = rngFor(f, 'beetle');
  if (risk <= 0 || r() > risk * 0.5) return killed;
  const share = 0.02 + 0.1 * risk * r();
  for (const t of f.trees) {
    if (t.sp !== 'spruce' || t.d < 15 || t.keep) continue;
    // drought-stressed and big spruces are hit first
    if (draw(f, 'bb', t.id) < share * (0.6 + t.d / 40)) killed.add(t.id);
  }
  return killed;
}

/** Saplings a moose browses this year. */
export function moose(f: Forest): Set<number> {
  const browsed = new Set<number>();
  const food = f.trees.filter(t => t.sp !== 'spruce' && t.h >= 0.5 && t.h <= 3.5);
  if (food.length < f.trees.length * 0.1 || food.length < 4) return browsed;
  if (rngFor(f, 'moose')() >= DISTURBANCE.mooseChance[f.place]) return browsed;
  for (const t of food) if (draw(f, 'mb', t.id) < 0.35) browsed.add(t.id);
  return browsed;
}

/** Seed mix that arrives on its own, by soil: birch first, then conifers. */
function naturalMix(f: Forest): [SpeciesId, number][] {
  const dry = f.soil === 'sandy' || f.soil === 'rocky';
  const base: [SpeciesId, number][] = dry
    ? [['pine', 0.5], ['birch', 0.4], ['spruce', 0.1]]
    : f.soil === 'peat'
      ? [['birch', 0.5], ['pine', 0.4], ['spruce', 0.1]]
      : [['birch', 0.5], ['spruce', 0.3], ['pine', 0.1], ['aspen', 0.1]];
  // kept seed trees (säästöpuut) add their own species
  for (const t of f.trees) if (t.keep) base.push([t.sp, 0.15]);
  return base;
}

function pick(mix: [SpeciesId, number][], u: number): SpeciesId {
  const tot = mix.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  for (const [s, w] of mix) { acc += w / tot; if (u < acc) return s; }
  return mix[mix.length - 1][0];
}

export function addSeedling(f: Forest, sp: SpeciesId, h: number, x: number): Tree {
  const t: Tree = {
    id: f.nextId++, sp, born: f.year, age: 1, h, d: 0,
    c: carbonFor(SPECIES[sp], 0, h), x, vigor: 1, rings: [], keep: false,
  };
  // a seedling builds its tiny body from the air
  move(f.ledger, 'air', 'trees', t.c.wood + t.c.foliage + t.c.fine);
  f.trees.push(t);
  return t;
}

/** New trees arriving on their own this year. Returns how many came. */
export function ingrowth(f: Forest, G: number): number {
  const r = rngFor(f, 'regen');
  let n = 0;
  if (f.regenUntil !== null && f.year < f.regenUntil && G < 10) {
    const target = Math.round(DISTURBANCE.regenTarget / HA_FACTOR);
    const young = f.trees.filter(t => t.h < 1.3).length;
    n = Math.max(0, Math.min(Math.ceil(target / 5), target - young));
    // a few good seed years bring most of the seedlings
    n = Math.round(n * (0.4 + 0.9 * r()));
    const mix = naturalMix(f);
    for (let i = 0; i < n; i++) addSeedling(f, pick(mix, r()), 0.1 + 0.2 * r(), r());
  } else if (f.continuous && G < 22) {
    // under a thinned canopy, shade-tolerant spruce and some birch come up
    n = G < 12 ? 4 : 2;
    for (let i = 0; i < n; i++) addSeedling(f, i % 3 === 2 && G < 14 ? 'birch' : 'spruce', 0.1 + 0.2 * r(), r());
  }
  if (f.regenUntil !== null && f.year >= f.regenUntil) f.regenUntil = null;
  return n;
}

/** Make a visible log or snag for a tree that died (only trees big enough to see). */
export function addLog(f: Forest, t: Tree, cause: DeathCause): void {
  if (t.d < 8) return;
  f.logs.push({
    id: t.id, sp: t.sp, d: t.d, h: t.h, x: t.x, c: t.c.wood, c0: t.c.wood, year: f.year, cause,
    born: t.born, age: t.age, rings: t.rings.slice(-150), ...(t.played ? { played: t.played } : {}),
    // storms lay trees down; others die standing and fall later
    standing: cause !== 'storm',
  });
}

/** Logs rot at the deadwood pace; snags fall after some years; small remains vanish from view. */
export function ageLogs(f: Forest, k: number): void {
  for (const l of f.logs) {
    l.c *= 1 - k;
    if (l.standing && f.year - l.year >= 6 + (l.id % 6)) l.standing = false;
  }
  f.logs = f.logs.filter(l => l.c > 0.12 * l.c0);
}
