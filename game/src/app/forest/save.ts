/**
 * Metsäni keeps its own save, separate from Kasva!'s, in this browser only
 * (localStorage key "kasva-forest", removed by "Delete all data").
 * It holds the current forest and short summaries of earlier ones, so a child
 * can compare which place and soil grew the best forest.
 */
import { upgradeForest, type Forest, type PlaceId, type SoilId, type SpeciesId, type Spacing } from '../../core/forest';

export const FOREST_KEY = 'kasva-forest';
const MAX_PAST = 12;

export interface ForestSummary {
  place: PlaceId;
  soil: SoilId;
  species: SpeciesId[];
  spacing: Spacing;
  years: number;
  volume: number;
  co2: number;
  life: number;
  health: number;
}

export interface ForestSave {
  v: 1;
  current: Forest | null;
  /** what was planted in the current forest */
  species: SpeciesId[];
  spacing: Spacing;
  past: ForestSummary[];
}

export function emptySave(): ForestSave {
  return { v: 1, current: null, species: ['spruce'], spacing: 'normal', past: [] };
}

export function loadForest(): ForestSave {
  try {
    const raw = localStorage.getItem(FOREST_KEY);
    if (!raw) return emptySave();
    const s = JSON.parse(raw) as Partial<ForestSave>;
    if (s.v !== 1 || !Array.isArray(s.past)) return emptySave();
    const current = s.current && s.current.version === 1 ? upgradeForest(s.current) : null;
    return { ...emptySave(), ...s, current } as ForestSave;
  } catch {
    return emptySave();
  }
}

export function storeForest(s: ForestSave): void {
  try { localStorage.setItem(FOREST_KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}

export function addPast(s: ForestSave, sum: ForestSummary): ForestSave {
  return { ...s, past: [sum, ...s.past].slice(0, MAX_PAST) };
}
