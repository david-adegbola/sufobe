/**
 * Animals appear when the forest gives them what they need. The rules are
 * simplified from what each species is known to depend on in Finnish forests;
 * the thresholds are game choices (verify with a forest ecologist).
 *
 *  moose (hirvi)                 young stands with pine, birch or aspen saplings to browse
 *  black woodpecker (palokärki)  big trees to nest in and deadwood with carpenter ants
 *  great spotted woodpecker      cone-bearing conifers (käpytikka)
 *  capercaillie (metso)          older pine-rich forest with a blueberry floor
 *  Siberian jay (kuukkeli)       old spruce or pine forest in the east and north
 *  treecreeper (puukiipijä)      big old trees with rough bark
 *  flying squirrel (liito-orava) big aspens for nest holes beside old spruce
 */
import { logVolume } from './indicators';
import type { AnimalId, Forest } from './stand';

export const ANIMALS: AnimalId[] = ['moose', 'spottedWoodpecker', 'capercaillie', 'treecreeper', 'blackWoodpecker', 'siberianJay', 'flyingSquirrel'];

/** Which animals the forest supports right now. */
export function presentAnimals(f: Forest): AnimalId[] {
  const n = f.trees.length || 1;
  const count = (fn: (t: Forest['trees'][number]) => boolean) => f.trees.filter(fn).length;
  const tall = f.trees.reduce((m, t) => Math.max(m, t.h), 0);
  const oldest = f.trees.reduce((m, t) => Math.max(m, t.age), 0);
  const pineShare = count(t => t.sp === 'pine') / n;
  const dead = logVolume(f);
  const out: AnimalId[] = [];
  if (count(t => t.sp !== 'spruce' && t.h >= 0.5 && t.h <= 4) >= Math.max(4, n * 0.15)) out.push('moose');
  if (count(t => (t.sp === 'spruce' || t.sp === 'pine') && t.d >= 18) >= 8) out.push('spottedWoodpecker');
  if (pineShare >= 0.35 && tall >= 15 && oldest >= 50) out.push('capercaillie');
  if (count(t => t.d >= 28) >= 4) out.push('treecreeper');
  if (count(t => t.d >= 30) >= 2 && dead >= 10) out.push('blackWoodpecker');
  if ((f.place === 'east' || f.place === 'lapland') && oldest >= 80 && count(t => t.sp !== 'birch' && t.sp !== 'aspen' && t.d >= 20) >= 8) out.push('siberianJay');
  if (count(t => t.sp === 'aspen' && t.d >= 20) >= 1 && count(t => t.sp === 'spruce' && t.d >= 20) >= 5) out.push('flyingSquirrel');
  return out;
}

/** Record animals seen for the first time; returns them. */
export function spotAnimals(f: Forest): AnimalId[] {
  const fresh = presentAnimals(f).filter(a => !f.seen.some(s => s.animal === a));
  for (const a of fresh) f.seen.push({ animal: a, year: f.year });
  return fresh;
}
