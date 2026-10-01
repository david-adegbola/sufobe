/**
 * Progression, kept pure so it can be tested and later checked on a server.
 *
 * XP is real: lifetime grams of CO₂ your tree has stored. Ranks are the
 * stages a real tree grows through. The streak is gentle: one free
 * "snow cover" per week protects a missed day.
 */
import type { SeasonResult, TreeMods } from './season';
import type { Weather } from './weather';

export const SAVE_VERSION = 1;

export type RankId = 'siemen' | 'itu' | 'taimi' | 'vesa' | 'riukupuu' | 'tukkipuu' | 'aarnipuu';
export type Growth = 'roots' | 'leaves' | 'wood';
export type SeasonMode = 'story' | 'free' | 'daily';

/** Thresholds in kg of CO₂ stored over all seasons. */
export const RANKS: { id: RankId; kg: number }[] = [
  { id: 'siemen', kg: 0 },
  { id: 'itu', kg: 5 },
  { id: 'taimi', kg: 20 },
  { id: 'vesa', kg: 60 },
  { id: 'riukupuu', kg: 150 },
  { id: 'tukkipuu', kg: 350 },
  { id: 'aarnipuu', kg: 800 },
];

export const MAX_GROWTH = 5;

export interface Save {
  version: number;
  co2LifetimeG: number;
  seasons: number;
  storyIndex: number;
  streak: { days: number; lastDay: string | null; snowCovers: number; coverWeek: number };
  achievements: string[];
  growth: Record<Growth, number>;
  choices: Growth[];
  rings: { day: string; g: number; heat: boolean }[];
  daily: Record<string, { bestG: number; tries: number }>;
}

export function newSave(): Save {
  return {
    version: SAVE_VERSION,
    co2LifetimeG: 0,
    seasons: 0,
    storyIndex: 0,
    streak: { days: 0, lastDay: null, snowCovers: 1, coverWeek: -1 },
    achievements: [],
    growth: { roots: 0, leaves: 0, wood: 0 },
    choices: [],
    rings: [],
    daily: {},
  };
}

/** Accept whatever is in storage; anything missing or broken falls back to defaults. */
export function migrate(raw: unknown): Save {
  const base = newSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Save>;
  return {
    ...base,
    ...r,
    version: SAVE_VERSION,
    streak: { ...base.streak, ...(r.streak ?? {}) },
    growth: { ...base.growth, ...(r.growth ?? {}) },
    achievements: Array.isArray(r.achievements) ? r.achievements : [],
    choices: Array.isArray(r.choices) ? r.choices : [],
    rings: Array.isArray(r.rings) ? r.rings : [],
    daily: r.daily && typeof r.daily === 'object' ? r.daily : {},
  };
}

// ---------- ranks ----------

export function rankIndex(g: number): number {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (g >= RANKS[k].kg * 1000) i = k;
  return i;
}

/** Progress towards the next rank, 0..1 (1 at the top rank). */
export function rankProgress(g: number): { index: number; next: number | null; fraction: number } {
  const i = rankIndex(g);
  if (i === RANKS.length - 1) return { index: i, next: null, fraction: 1 };
  const lo = RANKS[i].kg * 1000, hi = RANKS[i + 1].kg * 1000;
  return { index: i, next: RANKS[i + 1].kg, fraction: (g - lo) / (hi - lo) };
}

// ---------- the tree you grow ----------

/**
 * Each choice is a real trade-off, tuned with the bots (tests/progress.test.ts):
 * every level helps a careful player, but never makes holding all the time
 * a good idea. Every level also adds living tissue that breathes out CO₂.
 */
export function growthMods(g: Record<Growth, number>): TreeMods {
  const levels = g.roots + g.leaves + g.wood;
  return {
    waterMax: 1 + 0.1 * g.roots,   // deeper roots: a bigger water reserve
    refill: 1 + 0.1 * g.roots,     // ...that refills faster
    capture: 1 + 0.035 * g.leaves, // more leaf area: more CO₂ per catch
    drain: 1 + 0.05 * g.leaves,    // ...and more stomata losing water
    light: 1 + 0.06 * g.wood,      // a taller trunk lifts the crown into more light
    radius: 1,
    resp: 1 + 0.02 * levels,       // a bigger tree breathes out more
  };
}

/** Spend this season's sugar on one part of the tree. Choosing can earn a badge too. */
export function choose(save: Save, what: Growth): { save: Save; newAchievements: string[] } {
  const growth = { ...save.growth };
  if (growth[what] < MAX_GROWTH) growth[what]++;
  const next = { ...save, growth, choices: [...save.choices, what].slice(-20) };
  const earned = !next.achievements.includes('root-care') && next.choices.slice(-3).length === 3 && next.choices.slice(-3).every((x) => x === 'roots');
  if (earned) next.achievements = [...next.achievements, 'root-care'];
  return { save: next, newAchievements: earned ? ['root-care'] : [] };
}

// ---------- days and streak ----------

function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** Weeks start on Monday. */
export function weekNumber(day: string): number {
  return Math.floor((dayNumber(day) + 3) / 7);
}

export function updateStreak(st: Save['streak'], today: string): Save['streak'] {
  const week = weekNumber(today);
  let { days, snowCovers, coverWeek } = st;
  if (coverWeek !== week) { snowCovers = 1; coverWeek = week; }
  if (st.lastDay === today) return { ...st, snowCovers, coverWeek };
  const gap = st.lastDay ? dayNumber(today) - dayNumber(st.lastDay) : Infinity;
  if (gap === 1) days += 1;
  else if (gap === 2 && snowCovers > 0) { days += 1; snowCovers -= 1; }
  else days = 1;
  return { days, lastDay: today, snowCovers, coverWeek };
}

// ---------- achievements ----------

export interface AchievementCtx { result: SeasonResult; save: Save; mode: SeasonMode }

export const ACHIEVEMENTS: { id: string; check: (c: AchievementCtx) => boolean }[] = [
  { id: 'first-ring', check: (c) => c.save.seasons >= 1 },
  { id: 'nightless-night', check: (c) => c.result.midsummerNightCatches > 0 },
  { id: 'wise-closer', check: (c) => c.result.weather.includes('heat') && c.result.openHeatSec < 0.5 && c.result.caughtG >= 800 },
  { id: 'breath-10', check: (c) => c.result.bestCombo >= 10 },
  { id: 'no-wilt', check: (c) => c.result.wilts === 0 && c.result.caughtG >= 1500 },
  { id: 'week-streak', check: (c) => c.save.streak.days >= 7 },
  // awarded by choose(): three Roots choices in a row
  { id: 'root-care', check: () => false },
  { id: 'ten-rings', check: (c) => c.save.rings.length >= 10 },
  // social badges: earned through challenge links (Phase 3)
  { id: 'challenger', check: () => false },
  { id: 'overtake', check: () => false },
];

// ---------- story seasons: the first ten, hand-made ----------

/** Each one introduces one idea; Juhannus is always day 3. */
export const STORY: Weather[][] = [
  ['sun', 'sun', 'sun', 'sun', 'sun', 'sun'],
  ['sun', 'sun', 'cloudy', 'sun', 'cloudy', 'sun'],
  ['sun', 'sun', 'sun', 'heat', 'sun', 'sun'],
  ['sun', 'rain', 'sun', 'heat', 'cloudy', 'sun'],
  ['sun', 'heat', 'sun', 'heat', 'rain', 'sun'],
  ['cloudy', 'cloudy', 'sun', 'rain', 'sun', 'heat'],
  ['sun', 'sun', 'sun', 'sun', 'heat', 'heat'],
  ['rain', 'sun', 'heat', 'cloudy', 'sun', 'rain'],
  ['sun', 'heat', 'sun', 'heat', 'cloudy', 'sun'],
  ['sun', 'cloudy', 'heat', 'rain', 'heat', 'sun'],
];

// ---------- applying a finished season ----------

export interface SeasonOutcome {
  save: Save;
  rankBefore: number;
  rankAfter: number;
  newAchievements: string[];
  newBest: boolean;
}

export function applySeason(prev: Save, result: SeasonResult, mode: SeasonMode, today: string): SeasonOutcome {
  const rankBefore = rankIndex(prev.co2LifetimeG);
  const save: Save = {
    ...prev,
    co2LifetimeG: prev.co2LifetimeG + result.storedG,
    seasons: prev.seasons + 1,
    storyIndex: mode === 'story' ? Math.min(STORY.length, prev.storyIndex + 1) : prev.storyIndex,
    streak: updateStreak(prev.streak, today),
    rings: [...prev.rings, { day: today, g: result.storedG, heat: result.openHeatSec > 6 }].slice(-60),
    daily: { ...prev.daily },
  };
  let newBest = false;
  if (mode === 'daily') {
    const d = save.daily[result.seed] ?? { bestG: 0, tries: 0 };
    newBest = d.tries > 0 && result.storedG > d.bestG;
    save.daily[result.seed] = { bestG: Math.max(d.bestG, result.storedG), tries: d.tries + 1 };
  }
  const ctx: AchievementCtx = { result, save, mode };
  const newAchievements = ACHIEVEMENTS.filter((a) => !save.achievements.includes(a.id) && a.check(ctx)).map((a) => a.id);
  save.achievements = [...save.achievements, ...newAchievements];
  return { save, rankBefore, rankAfter: rankIndex(save.co2LifetimeG), newAchievements, newBest };
}
