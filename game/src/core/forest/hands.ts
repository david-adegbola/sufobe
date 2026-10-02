/**
 * Forestry by hand (Phase 7). While the forest is paused, the child can:
 *  - mark trees to cut, then cut them all at once (choice "cutMarked"),
 *    which sends them through the same sorting and mills as any harvest;
 *  - keep a tree (säästöpuu), so no cut takes it;
 *  - plant a seedling where they tap, a few each year.
 *
 * Light in this model comes from the trees taller than you (their basal
 * area), not from where you stand, so planting has the same light anywhere
 * on the plot. groundLight() tells how much a new seedling gets: thinning
 * raises it, and spruce copes with shade far better than pine or birch.
 *
 * Tikka's questions also change: apart from "what grows here now?" after
 * a clear-cut, they are hints. If the child does not answer, the year goes
 * on as if they chose to leave the forest as it is (resolveHint).
 */
import { SEEDLING_H } from './manage';
import { addSeedling } from './events';
import { standStats, type ChoiceId, type DecisionKind, type Forest, type Tree } from './stand';
import { PLANTABLE, SPECIES, type SpeciesId } from './species';

/** Seedlings a child may plant by hand in one year. */
export const PLANT_PER_YEAR = 8;

export function toggleMark(f: Forest, id: number): boolean {
  const t = f.trees.find(x => x.id === id);
  if (!t || t.keep) return false;
  t.marked = !t.marked;
  return t.marked;
}

/** Keep a tree, or stop keeping it. Your own birch is always kept. */
export function toggleKeep(f: Forest, id: number): boolean {
  const t = f.trees.find(x => x.id === id);
  if (!t) return false;
  if (t.mine) return true;
  t.keep = !t.keep;
  if (t.keep) t.marked = false;
  return t.keep;
}

export const markedTrees = (f: Forest): Tree[] => f.trees.filter(t => t.marked && !t.keep);

/** How many more seedlings the child may plant this year. */
/** In the sandbox (Phase 10) a child can plant many more, but the plot still has room for only so many. */
export const SANDBOX_PLANT_PER_YEAR = 40;

export function plantsLeft(f: Forest): number {
  const p = f.handPlanted;
  return (f.sandbox ? SANDBOX_PLANT_PER_YEAR : PLANT_PER_YEAR) - (p && p.year === f.year ? p.n : 0);
}

/** Plant one seedling at x (0..1 across the plot). Returns it, or null if none are left this year. */
export function plantAt(f: Forest, sp: SpeciesId, x: number): Tree | null {
  if (!PLANTABLE.includes(sp) || plantsLeft(f) <= 0) return null;
  const n = f.handPlanted && f.handPlanted.year === f.year ? f.handPlanted.n : 0;
  f.handPlanted = { year: f.year, n: n + 1 };
  return addSeedling(f, sp, SEEDLING_H[sp], Math.max(0.02, Math.min(0.98, x)));
}

/** Light a new seedling of each species would get under the trees standing now, 0..1. */
export function groundLight(f: Forest): Record<SpeciesId, number> {
  const G = standStats(f.trees).G;
  return Object.fromEntries((Object.keys(SPECIES) as SpeciesId[]).map(sp => [sp, Math.exp(-SPECIES[sp].shadeComp * G)])) as Record<SpeciesId, number>;
}

/** Questions that must be answered before the forest can go on. The rest are hints. */
export const MUST_ANSWER: DecisionKind[] = ['regen'];

/** The answer that leaves the forest as it is. */
export const LEAVE_AS_IS: Record<Exclude<DecisionKind, 'regen'>, ChoiceId> = {
  young: 'nothing', crowded: 'nothing', mature: 'leaveOld', storm: 'leaveFallen', beetle: 'leaveBeetle',
};

export const isHint = (k: DecisionKind) => !MUST_ANSWER.includes(k);

/** Let an unanswered hint pass: the forest stays as it is. Returns true if one was waiting. */
export function resolveHint(f: Forest): boolean {
  const d = f.pending;
  if (!d || !isHint(d.kind)) return false;
  f.pending = null;
  return true;
}
