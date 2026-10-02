import { describe, expect, it } from 'vitest';
import { STAGE_LOOK, envLook, treeDetail, treeStage } from '../src/app/forest/visual';
import { createForest, plant, stepYear } from '../src/core/forest';

describe('visual states (2.5D)', () => {
  it('a tree looks its stage: seedling, young, mature, old', () => {
    expect(treeStage({ h: 0.4, age: 3, sp: 'spruce' })).toBe('seedling');
    expect(treeStage({ h: 6, age: 15, sp: 'spruce' })).toBe('young');
    expect(treeStage({ h: 22, age: 60, sp: 'spruce' })).toBe('mature');
    expect(treeStage({ h: 28, age: 160, sp: 'spruce' })).toBe('old');
    // birch grows old sooner than pine
    expect(treeStage({ h: 24, age: 90, sp: 'birch' })).toBe('old');
    expect(treeStage({ h: 24, age: 90, sp: 'pine' })).toBe('mature');
  });
  it('young trees sway most; only old trees carry beard lichen', () => {
    expect(STAGE_LOOK.young.sway).toBeGreaterThan(STAGE_LOOK.old.sway);
    expect(STAGE_LOOK.old.lichen).toBe(true);
    expect(STAGE_LOOK.mature.lichen).toBe(false);
  });
  it("the environment follows the season and the year's weather", () => {
    const f = createForest({ seed: 'look', place: 'east', soil: 'loam' });
    plant(f, { spruce: 1 });
    const rec = stepYear(f);
    expect(envLook('autumn', 0.1, rec).fog).toBeGreaterThan(0.3);
    expect(envLook('summer', 0.5, rec).fog).toBe(0);
    expect(envLook('winter', 0.5, rec).beams).toBe(0);
    expect(envLook('autumn', 0.5, rec).wind).toBeGreaterThan(envLook('summer', 0.5, rec).wind);
    const wet = { ...rec, weather: { ...rec.weather, drought: false, summerRain: 300 } };
    const dry = { ...rec, weather: { ...rec.weather, drought: true } };
    expect(envLook('summer', 0.45, wet).rain).toBe(1);
    expect(envLook('summer', 0.45, dry).rain).toBe(0);
    expect(envLook('summer', 0.45, dry).tintAlpha).toBeGreaterThan(envLook('summer', 0.45, rec).tintAlpha);
  });
});

describe('level of detail (2.5D, increment 4)', () => {
  it('keeps full detail for trees in your own stand that are big enough to see', () => {
    expect(treeDetail(200, false, false, 0.2)).toBe('full');
    expect(treeDetail(200, false, true, 0.2)).toBe('full');
  });
  it('simplifies side copies, tiny trees and the back of the stand', () => {
    expect(treeDetail(400, true, false)).toBe('simple');
    expect(treeDetail(10, false, false, 0.1)).toBe('simple');
    expect(treeDetail(200, false, false, 0.9)).toBe('simple');
  });
  it('switches a little sooner on phones', () => {
    expect(treeDetail(22, false, false, 0.1)).toBe('full');
    expect(treeDetail(22, false, true, 0.1)).toBe('simple');
    expect(treeDetail(200, false, false, 0.65)).toBe('full');
    expect(treeDetail(200, false, true, 0.65)).toBe('simple');
  });
});
