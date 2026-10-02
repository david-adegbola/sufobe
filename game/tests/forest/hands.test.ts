import { describe, expect, it } from 'vitest';
import {
  PLANT_PER_YEAR, applyChoice, createForest, groundLight, markedTrees, plant, plantAt, plantMyBirch, plantsLeft,
  previewHarvest, resolveHint, stepYear, toggleKeep, toggleMark, total, type Forest,
} from '../../src/core/forest';

const grown = (years = 35): Forest => {
  const f = createForest({ seed: 'hands', place: 'east', soil: 'loam' });
  plant(f, { spruce: 0.6, pine: 0.2, birch: 0.2 });
  plantMyBirch(f);
  for (let y = 0; y < years; y++) { resolveHint(f); stepYear(f); }
  return f;
};

describe('forestry by hand', () => {
  it('cuts exactly the marked trees, never a kept one, with the carbon books balanced', () => {
    const f = grown();
    const big = [...f.trees].filter(t => !t.keep && t.d > 12).slice(0, 6);
    for (const t of big) toggleMark(f, t.id);
    const kept = big[0];
    toggleKeep(f, kept.id);
    expect(kept.marked).toBe(false);
    const ids = markedTrees(f).map(t => t.id);
    expect(ids).toHaveLength(5);
    expect(previewHarvest(f, 'cutMarked').map(t => t.id).sort()).toEqual([...ids].sort());
    const t0 = total(f.ledger);
    const h = applyChoice(f, 'cutMarked');
    expect(h!.count).toBe(5);
    expect(f.trees.some(t => ids.includes(t.id))).toBe(false);
    expect(f.trees.some(t => t.id === kept.id)).toBe(true);
    expect(f.trees.some(t => t.marked)).toBe(false);
    expect(total(f.ledger)).toBeCloseTo(t0, 6);
  });

  it('your own birch stays kept, and cannot be marked', () => {
    const f = grown(5);
    const mine = f.trees.find(t => t.mine)!;
    expect(toggleKeep(f, mine.id)).toBe(true);
    expect(toggleMark(f, mine.id)).toBe(false);
  });

  it(`plants up to ${PLANT_PER_YEAR} seedlings a year where the child taps`, () => {
    const f = grown(10);
    const t0 = total(f.ledger);
    for (let i = 0; i < PLANT_PER_YEAR; i++) expect(plantAt(f, 'spruce', i / PLANT_PER_YEAR)).not.toBeNull();
    expect(plantsLeft(f)).toBe(0);
    expect(plantAt(f, 'spruce', 0.5)).toBeNull();
    expect(plantAt(f, 'aspen', 0.5)).toBeNull(); // aspen comes by itself, it is not planted
    expect(total(f.ledger)).toBeCloseTo(t0, 6);
    stepYear(f);
    expect(plantsLeft(f)).toBe(PLANT_PER_YEAR);
  });

  it('a seedling gets more light after thinning, and spruce copes with shade best', () => {
    const f = grown();
    const before = groundLight(f);
    expect(before.spruce).toBeGreaterThan(before.pine);
    expect(before.spruce).toBeGreaterThan(before.birch);
    applyChoice(f, 'thin');
    expect(groundLight(f).pine).toBeGreaterThan(before.pine);
  });

  it('hints pass on their own; "what grows here now?" waits for an answer', () => {
    const f = grown(0);
    f.pending = { kind: 'crowded', year: f.year, choices: ['thin', 'thinLight', 'nothing'] };
    expect(resolveHint(f)).toBe(true);
    expect(f.pending).toBeNull();
    f.pending = { kind: 'regen', year: f.year, choices: ['plant', 'seed'] };
    expect(resolveHint(f)).toBe(false);
    expect(f.pending).not.toBeNull();
  });
});
