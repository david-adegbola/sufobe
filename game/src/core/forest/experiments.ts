/**
 * Question cards (Phase 8): small experiments with an answer.
 *
 * Each card is plain data. Two forests, A and B, differ in exactly one thing
 * (the place, the soil, the trees, or one choice). Everything else is the
 * same, including the weather: both forests use the same seed. The child
 * predicts which forest will end higher on one measure, runs both side by
 * side, and sees what happened.
 *
 * The answer is never written by hand into the game. It is what the model
 * gives, and `answer` only records it so that tests can check it holds for
 * many seeds (tests/forest/experiments.test.ts). If the model changes and an
 * answer flips, the test fails and the card's text must be looked at again.
 *
 * The experiments never touch the child's own forest.
 */
import { CO2_PER_C } from './carbon';
import { HA_FACTOR, standStats, type ChoiceId, type Forest } from './stand';
import type { PlaceId } from './climate';
import type { SoilId } from './soil';
import type { SpeciesId } from './species';
import { applyChoice, plant, type Spacing } from './manage';
import { createForest } from './stand';
import { stepYear } from './year';
import { logVolume, results, tHa } from './indicators';

export type MeasureId =
  | 'treeCarbon' | 'forestCarbon' | 'soilCarbon' | 'wood' | 'rings' | 'life' | 'deadwood' | 'beetle' | 'moose';

export type Mix = Partial<Record<SpeciesId, number>>;

/** What can differ between the two forests. */
export interface Variant {
  place?: PlaceId;
  soil?: SoilId;
  mix?: Mix;
  spacing?: Spacing;
  /** done once, when the experiment starts (after `grown` years) */
  choice?: ChoiceId;
}

export interface QuestionCard {
  id: string;
  /** what both forests share */
  base: { place: PlaceId; soil: SoilId; mix: Mix; spacing: Spacing; grown: number };
  a: Variant;
  b: Variant;
  /** years the experiment runs */
  years: number;
  measure: MeasureId;
  /** the seed shown first, so a whole class sees the same weather */
  seed: string;
  /** what the model gives, checked by tests: which forest ends higher, or about the same */
  answer: 'a' | 'b' | 'same';
}

/** Results closer than this (relative) count as "about the same". */
export const SAME_MARGIN = 0.1;

export const CARDS: QuestionCard[] = [
  {
    id: 'soil', seed: 'q-soil', measure: 'treeCarbon', years: 40, answer: 'b',
    base: { place: 'east', soil: 'loam', mix: { spruce: 1 }, spacing: 'normal', grown: 0 },
    a: { soil: 'sandy' }, b: { soil: 'clay' },
  },
  {
    id: 'sandPine', seed: 'q-sandpine', measure: 'wood', years: 50, answer: 'b',
    base: { place: 'south', soil: 'sandy', mix: { spruce: 1 }, spacing: 'normal', grown: 0 },
    a: { mix: { spruce: 1 } }, b: { mix: { pine: 1 } },
  },
  {
    id: 'lapland', seed: 'q-lapland', measure: 'wood', years: 50, answer: 'a',
    base: { place: 'south', soil: 'loam', mix: { pine: 1 }, spacing: 'normal', grown: 0 },
    a: { place: 'south' }, b: { place: 'lapland' },
  },
  {
    id: 'climate2080', seed: 'q-2080', measure: 'treeCarbon', years: 60, answer: 'b',
    base: { place: 'east', soil: 'loam', mix: { pine: 1 }, spacing: 'normal', grown: 0 },
    a: { place: 'east' }, b: { place: 'future' },
  },
  {
    id: 'beetle', seed: 'q-beetle', measure: 'beetle', years: 50, answer: 'a',
    base: { place: 'future', soil: 'loam', mix: { spruce: 1 }, spacing: 'normal', grown: 40 },
    a: { mix: { spruce: 1 } }, b: { mix: { pine: 1 } },
  },
  {
    id: 'moose', seed: 'q-moose', measure: 'moose', years: 15, answer: 'b',
    base: { place: 'east', soil: 'loam', mix: { spruce: 1 }, spacing: 'normal', grown: 0 },
    a: { mix: { spruce: 1 } }, b: { mix: { pine: 1, birch: 1 } },
  },
  {
    id: 'thinning', seed: 'q-thin', measure: 'rings', years: 12, answer: 'b',
    base: { place: 'east', soil: 'loam', mix: { spruce: 1 }, spacing: 'normal', grown: 35 },
    a: { choice: 'nothing' }, b: { choice: 'thin' },
  },
  {
    id: 'dense', seed: 'q-dense', measure: 'treeCarbon', years: 25, answer: 'b',
    base: { place: 'east', soil: 'loam', mix: { spruce: 1 }, spacing: 'normal', grown: 0 },
    a: { spacing: 'sparse' }, b: { spacing: 'dense' },
  },
  {
    id: 'mixed', seed: 'q-mixed', measure: 'life', years: 60, answer: 'b',
    base: { place: 'east', soil: 'loam', mix: { spruce: 1 }, spacing: 'normal', grown: 0 },
    a: { mix: { spruce: 1 } }, b: { mix: { spruce: 1, pine: 1, birch: 1 } },
  },
  {
    id: 'woodpecker', seed: 'q-woodpecker', measure: 'deadwood', years: 30, answer: 'b',
    base: { place: 'east', soil: 'loam', mix: { spruce: 2, birch: 1 }, spacing: 'normal', grown: 80 },
    a: { choice: 'clearcut' }, b: { choice: 'leaveOld' },
  },
  {
    id: 'peat', seed: 'q-peat', measure: 'soilCarbon', years: 30, answer: 'a',
    base: { place: 'east', soil: 'loam', mix: { pine: 1 }, spacing: 'normal', grown: 0 },
    a: { soil: 'peat' }, b: { soil: 'loam' },
  },
  {
    id: 'continuous', seed: 'q-cc', measure: 'forestCarbon', years: 20, answer: 'b',
    base: { place: 'east', soil: 'loam', mix: { spruce: 2, birch: 1 }, spacing: 'normal', grown: 70 },
    a: { choice: 'clearcut' }, b: { choice: 'cc' },
  },
];

export const cardById = (id: string) => CARDS.find(c => c.id === id);

/** A forest in an experiment, and the year the experiment started. */
export interface Twin { f: Forest; start: number }

/** Tikka has no questions in an experiment: an empty plot is replanted with the same trees, everything else is left as it is. */
function quiet(f: Forest, mix: Mix, spacing: Spacing): void {
  const d = f.pending;
  if (!d) return;
  if (d.kind === 'regen') applyChoice(f, 'plant', { mix, spacing });
  else f.pending = null;
}

/** One experiment year for one forest. */
export function stepTwin(t: Twin, card: QuestionCard, v: Variant) {
  const rec = stepYear(t.f);
  quiet(t.f, v.mix ?? card.base.mix, v.spacing ?? card.base.spacing);
  return rec;
}

/** Plant one of the two forests and grow it to where the question starts. */
export function startTwin(card: QuestionCard, side: 'a' | 'b', seed = card.seed): Twin {
  const v = card[side];
  const place = v.place ?? card.base.place;
  const soil = v.soil ?? card.base.soil;
  const mix = v.mix ?? card.base.mix;
  const spacing = v.spacing ?? card.base.spacing;
  const f = createForest({ seed, place, soil });
  plant(f, mix, spacing);
  const t: Twin = { f, start: 0 };
  for (let i = 0; i < card.base.grown; i++) stepTwin(t, card, v);
  if (v.choice) applyChoice(f, v.choice, { mix, spacing });
  t.start = f.year;
  return t;
}

/**
 * The measure for one forest, in the units the card shows. `only` limits
 * tree-by-tree measures to some trees: year rings are compared on the trees
 * standing in both forests, so a cut cannot win just by taking the slow ones.
 */
export function measure(m: MeasureId, t: Twin, only?: Set<number>): number {
  const { f, start } = t;
  const since = (kind: string) => f.events.filter(e => e.kind === kind && e.year >= start).reduce((a, e) => a + e.count, 0) * HA_FACTOR;
  switch (m) {
    case 'treeCarbon': return results(f).carbon.trees;
    case 'forestCarbon': { const c = results(f).carbon; return c.trees + c.dead + c.soil; }
    case 'soilCarbon': return tHa(f.ledger.stores.soil) * CO2_PER_C;
    case 'wood': return standStats(f.trees).volume;
    case 'rings': {
      // how fast the trees that were already there grew thicker: mean ring width, mm a year
      const n = f.year - start;
      const old = f.trees.filter(x => x.born < start && x.rings.length >= n && n > 0 && (!only || only.has(x.id)));
      if (!old.length) return 0;
      return old.reduce((a, x) => a + x.rings.slice(-n).reduce((s, r) => s + r, 0) / n, 0) / old.length;
    }
    case 'life': return results(f).life.score;
    case 'deadwood': return logVolume(f);
    case 'beetle': return since('beetle');
    case 'moose': return since('moose');
  }
}

/** Which forest ended higher, or 'same' if they are within SAME_MARGIN of each other. */
export function verdict(a: number, b: number): 'a' | 'b' | 'same' {
  const hi = Math.max(Math.abs(a), Math.abs(b));
  if (hi === 0 || Math.abs(a - b) <= SAME_MARGIN * hi) return 'same';
  return a > b ? 'a' : 'b';
}

/** Run a whole experiment at once (tests, and the "skip to the end" button). */
export function runCard(card: QuestionCard, seed = card.seed): { a: number; b: number; result: 'a' | 'b' | 'same'; ta: Twin; tb: Twin } {
  const ta = startTwin(card, 'a', seed);
  const tb = startTwin(card, 'b', seed);
  for (let i = 0; i < card.years; i++) { stepTwin(ta, card, card.a); stepTwin(tb, card, card.b); }
  const { a, b } = measureBoth(card, ta, tb);
  return { a, b, result: verdict(a, b), ta, tb };
}

/** The card's measure for both forests, compared fairly. */
export function measureBoth(card: QuestionCard, ta: Twin, tb: Twin): { a: number; b: number } {
  const inA = new Set(ta.f.trees.map(t => t.id));
  const both = new Set(tb.f.trees.filter(t => inA.has(t.id)).map(t => t.id));
  return { a: measure(card.measure, ta, both), b: measure(card.measure, tb, both) };
}
