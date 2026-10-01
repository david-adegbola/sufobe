/**
 * "Zoom into a tree" (F4): play one Kasva! summer as a birch from your
 * forest. The summer's weather comes from that forest year (a drought summer
 * brings heatwaves, a wet one rain), and the soil sets how much water the
 * birch can hold. How well the child plays, compared with a careful player in
 * the same weather, nudges that birch's growth this year a little up or
 * down. It links the leaf-level science of Kasva! (stomata, water, light) to
 * the forest. Optional: the forest grows fine without it.
 */
import { makeSmart } from '../bots';
import { STANDARD_TREE, simulate, type TreeMods } from '../season';
import { planWeather, type Weather } from '../weather';
import { move } from './carbon';
import { SOILS } from './soil';
import { SPECIES } from './species';
import { carbonFor, type Forest, type Tree, type YearRecord } from './stand';

/** Kasva! is a silver birch's summer, so only birches can be zoomed into. */
export function canZoom(t: Tree, rec: YearRecord | undefined): boolean {
  return t.sp === 'birch' && t.h >= 1.3 && !!rec && t.zoomed !== rec.year;
}

export interface ZoomSeason { seed: string; weather: Weather[]; mods: TreeMods; expectedG: number }

/** The Kasva! summer for this tree and forest year. */
export function zoomSeason(f: Forest, t: Tree, rec: YearRecord): ZoomSeason {
  const seed = `${f.seed}-z${rec.year}-${t.id}`;
  const weather = planWeather(seed);
  if (rec.weather.drought) { weather[2] = 'heat'; weather[4] = 'heat'; }
  else if (rec.weather.summerRain > 1.15 * 210) { weather[1] = 'rain'; weather[5] = 'rain'; }
  // a soil that holds more water lets the birch keep its stomata open longer
  const soil = SOILS[f.soil];
  const bucket = Math.min(1.25, 0.7 + 0.6 * Math.min(1, soil.waterCap / 170));
  const mods: TreeMods = { ...STANDARD_TREE, waterMax: bucket, refill: bucket };
  const expectedG = simulate(seed, makeSmart(), weather, mods).storedG;
  return { seed, weather, mods, expectedG };
}

/**
 * Grow the birch a little more (or less) this year, by how the child played:
 * up to ±40 % of this year's ring. The carbon for the extra wood comes from
 * the air (or goes back to it), so the books still balance.
 * Returns the change in this year's ring, mm.
 */
export function applyZoom(f: Forest, treeId: number, storedG: number, expectedG: number, year: number): number {
  const t = f.trees.find(x => x.id === treeId);
  if (!t || t.zoomed === year) return 0;
  t.zoomed = year;
  const ratio = expectedG > 0 ? storedG / expectedG : 1;
  const k = Math.max(-0.4, Math.min(0.4, (ratio - 1) * 0.6));
  const ring = t.rings.at(-1) ?? 0;
  const extraMm = ring * k;
  if (Math.abs(extraMm) < 0.01) return 0;
  const sp = SPECIES[t.sp];
  const before = t.c;
  t.d = Math.max(0.1, t.d + extraMm / 10);
  t.rings[t.rings.length - 1] = Math.round((ring + extraMm) * 10) / 10;
  t.c = carbonFor(sp, t.d, t.h, before.foliage / Math.max(1e-9, carbonFor(sp, t.d - extraMm / 10, t.h).foliage));
  const delta = (t.c.wood + t.c.foliage + t.c.fine) - (before.wood + before.foliage + before.fine);
  if (delta > 0) move(f.ledger, 'air', 'trees', delta);
  else move(f.ledger, 'trees', 'air', -delta);
  return extraMm;
}
