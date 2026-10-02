/**
 * Metsäni's part of the world save (storage.ts, part "forest"), in this
 * browser only, removed by "Delete all data". Old years are compacted
 * before saving (core/forest/compact.ts).
 * It holds the current forest and short summaries of earlier ones, so a child
 * can compare which place and soil grew the best forest.
 */
import { getPart, setPart } from '../storage';
import { compactHistory, upgradeForest, type Forest, type PlaceId, type SoilId, type SpeciesId, type Spacing } from '../../core/forest';

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
  /** Tikka's tips already shown (each is shown once) */
  tips?: string[];
  /** the sandbox forest (Phase 10): free to try anything, never the child's own forest */
  sandbox?: Forest | null;
  /** question cards tried, by card id: the child's guess and what the forests did (Phase 8) */
  lab?: Record<string, { guess: 'a' | 'b' | 'same'; result: 'a' | 'b' | 'same' }>;
}

export function emptySave(): ForestSave {
  return { v: 1, current: null, species: ['spruce'], spacing: 'normal', past: [] };
}

export function loadForest(): ForestSave {
  try {
    const s = getPart<Partial<ForestSave> | null>('forest', null);
    if (!s || s.v !== 1 || !Array.isArray(s.past)) return emptySave();
    const current = s.current && s.current.version === 1 ? upgradeForest(s.current) : null;
    const sandbox = s.sandbox && s.sandbox.version === 1 ? upgradeForest(s.sandbox) : null;
    return { ...emptySave(), ...s, current, sandbox } as ForestSave;
  } catch {
    return emptySave();
  }
}

export function storeForest(s: ForestSave): void {
  if (s.current) compactHistory(s.current);
  if (s.sandbox) compactHistory(s.sandbox);
  setPart('forest', s); // storage full or blocked: the forest lives on in memory
}

export function addPast(s: ForestSave, sum: ForestSummary): ForestSave {
  return { ...s, past: [sum, ...s.past].slice(0, MAX_PAST) };
}
