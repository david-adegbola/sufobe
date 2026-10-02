/**
 * Your birch (Phase 6): the silver birch you grow in Kasva! is a real tree in
 * your forest. It stands in the middle of the plot, is marked to keep (no
 * thinning or harvest takes it), and grows, competes and can die like any
 * other tree. If it dies, the role passes to the nearest young birch (in a
 * forest, a birch's seedlings grow up around it); if there is none, a seedling
 * from it comes up where it stood.
 *
 * Forests made before Phase 6 adopt their tallest birch, or get a sapling.
 * Only forests with `f.birch` set take part, so the model's own tests and
 * tools are unchanged.
 */
import { SEEDLING_H } from './manage';
import { addSeedling } from './events';
import type { Forest, Tree } from './stand';

export interface BirchInfo {
  /** the year this forest's birch line began */
  since: number;
  /** where it stands, 0..1 across the plot */
  x: number;
  /** 1 = the birch from Kasva!, 2 = its seedling, … */
  generation: number;
}

export type BirchChange = 'adopted' | 'planted' | 'passed' | 'seeded';

export function myBirch(f: Forest): Tree | undefined {
  return f.trees.find(t => t.mine);
}

function claim(f: Forest, t: Tree): Tree {
  t.mine = true;
  t.keep = true;
  f.birch!.x = t.x;
  return t;
}

/** Plant your birch as a sapling in the middle of a new forest. */
export function plantMyBirch(f: Forest): Tree {
  f.birch = { since: f.year, x: 0.5, generation: 1 };
  return claim(f, addSeedling(f, 'birch', SEEDLING_H.birch * 1.5, 0.5));
}

/**
 * Make sure this forest has your birch. Returns what changed, or null.
 *  - adopted: an older forest without one takes its tallest birch
 *  - planted: an older forest with no birch gets a sapling
 *  - passed:  your birch died, and the nearest birch takes over
 *  - seeded:  your birch died with no birch left, and its seedling comes up
 */
export function ensureMyBirch(f: Forest): BirchChange | null {
  if (myBirch(f)) return null;
  const birches = f.trees.filter(t => t.sp === 'birch');
  if (!f.birch) {
    f.birch = { since: f.year, x: 0.5, generation: 1 };
    const tallest = birches.sort((a, b) => b.h - a.h || a.id - b.id)[0];
    if (tallest) { claim(f, tallest); return 'adopted'; }
    claim(f, addSeedling(f, 'birch', SEEDLING_H.birch * 1.5, 0.5));
    return 'planted';
  }
  const x = f.birch.x;
  f.birch.generation += 1;
  const nearest = birches.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x) || a.id - b.id)[0];
  if (nearest) { claim(f, nearest); return 'passed'; }
  claim(f, addSeedling(f, 'birch', SEEDLING_H.birch, x));
  return 'seeded';
}
