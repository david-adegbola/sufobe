/**
 * Visual states (2.5D pass): what the simulation says, turned into how the
 * forest should look. The renderer asks these small, pure functions instead
 * of deciding case by case, so every tree and every season follows the same
 * rules, and the rules can be tested without a canvas.
 *
 *   tree stage     seedling → young → mature → old (and dead), from the
 *                  tree's height, age and its species' old age
 *   environment    light colour, fog, rain, wind and how far the haze
 *                  reaches, from the season, the point in it and the year's
 *                  weather
 */
import { SPECIES, type Tree, type YearRecord } from '../../core/forest';
import type { Season } from './text';

export type TreeStage = 'seedling' | 'young' | 'mature' | 'old';

/** How grown up a tree looks. Breast height (1.3 m) is where a seedling becomes a young tree. */
export function treeStage(t: Pick<Tree, 'h' | 'age' | 'sp'>): TreeStage {
  if (t.h < 1.3) return 'seedling';
  const old = SPECIES[t.sp].oldAge;
  if (t.age >= old * 0.75) return 'old';
  if (t.h >= 12 && t.age >= 30) return 'mature';
  return 'young';
}

/** Per stage: how much the crown moves in the wind, and whether to draw lichen and moss on the trunk. */
export const STAGE_LOOK: Record<TreeStage, { sway: number; lichen: boolean; moss: boolean }> = {
  seedling: { sway: 1.6, lichen: false, moss: false },
  young: { sway: 1.2, lichen: false, moss: false },
  mature: { sway: 1, lichen: false, moss: true },
  old: { sway: 0.8, lichen: true, moss: true },
};

/**
 * Level of detail (2.5D, increment 4): how much drawing a tree gets.
 *   full    every tier, blob, twig and bark mark; lichen and moss
 *   simple  the same silhouette from fewer shapes, filled in one go
 * Copies of the forest at the sides, trees only a few pixels tall on screen
 * and trees at the back of the stand (in the haze, mostly hidden behind the
 * front ones) are simple; the rest of your own stand keeps its full detail.
 * Phones switch a little sooner, because there every shape costs more.
 * `depth` runs 0 (front of the stand) to 1 (back).
 */
export type Detail = 'full' | 'simple';

export function treeDetail(screenH: number, side: boolean, phone: boolean, depth = 0): Detail {
  if (side) return 'simple';
  if (depth > (phone ? 0.55 : 0.75)) return 'simple';
  return screenH < (phone ? 26 : 18) ? 'simple' : 'full';
}

export interface EnvLook {
  /** a colour laid lightly over the whole scene, and how strongly */
  tint: string;
  tintAlpha: number;
  /** 0..1 fog lying in the forest (autumn mornings, early spring) */
  fog: number;
  /** 0..1 rain falling (a wet summer) */
  rain: number;
  /** wind strength for swaying crowns and grass */
  wind: number;
  /** 0..1 sunbeams through the canopy */
  beams: number;
  /** haze colour for distant layers */
  haze: string;
}

/** The look of the forest at a point in the year. `ps` runs 0..1 through the season. */
export function envLook(season: Season, ps: number, rec: YearRecord | undefined): EnvLook {
  const drought = !!rec?.weather.drought;
  const wet = !!rec && !drought && rec.weather.summerRain > 1.15 * 210;
  switch (season) {
    case 'spring':
      return { tint: '#fff2c8', tintAlpha: 0.06, fog: ps < 0.25 ? 0.35 * (1 - ps / 0.25) : 0, rain: 0, wind: 1, beams: 0.5, haze: '#cfe3ea' };
    case 'summer':
      return {
        tint: drought ? '#ffd9a0' : '#fff0b8', tintAlpha: drought ? 0.12 : 0.07, fog: 0,
        rain: wet && ps > 0.3 && ps < 0.6 ? 1 : 0, wind: 0.8, beams: wet ? 0.2 : 1, haze: drought ? '#efdcb8' : '#cfe6ea',
      };
    case 'autumn':
      return { tint: '#ffb36b', tintAlpha: 0.1, fog: ps < 0.35 ? 0.55 * (1 - ps / 0.35) : 0.1, rain: ps > 0.55 && ps < 0.75 ? 0.6 : 0, wind: 1.5, beams: 0.25, haze: '#e6dccb' };
    case 'winter':
      return { tint: '#bcd4f0', tintAlpha: 0.12, fog: 0.15, rain: 0, wind: 1.2, beams: 0, haze: '#e4edf4' };
  }
}
