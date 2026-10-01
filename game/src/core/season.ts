/**
 * One growing season (90 s) as a pure, fixed-step simulation.
 *
 * The rules are the science:
 *  - open stomata let CO2 in, but only light turns it into sugar
 *  - open stomata lose water, more in sun and much more in a heatwave
 *  - closed stomata keep water; roots and rain refill it
 *  - the tree breathes CO2 out all the time, day and night
 *  - score = grams of CO2 stored = caught − breathed out
 *
 * The world is a 1000 × 1000 square; renderers scale it to the screen.
 */
import { makeRng, range, type Rng } from './rng';
import { DAYS, JUHANNUS_DAY, WEATHER, planWeather, type Weather } from './weather';

export const HZ = 60;
export const DT = 1 / HZ;
export const DAY_TICKS = 15 * HZ;
export const LIGHT_TICKS = 11 * HZ;
export const SEASON_TICKS = DAYS * DAY_TICKS;

export const CROWN = { x: 500, y: 430, r: 110 };

export const TUNING = {
  moleculeG: 40, // grams of CO2 per molecule dot at full light
  goldMultiplier: 5, // sunfleck molecules
  spawnPerSec: 2.1,
  goldChance: 0.06,
  catchRadius: 300,
  pull: 950, // units/s² towards the crown while open
  maxPullSpeed: 430,
  comboRadiusPerCatch: 0.035, // a long breath widens the catch zone...
  comboRadiusMax: 0.45, // ...up to +45 %
  waterMax: 100,
  drainPerSec: 16, // while open, at full light
  nightDrainShare: 0.35, // open stomata still lose some water in the dark
  rootRefillPerSec: 5.5, // while closed
  wiltTicks: 5 * HZ,
  wiltRadiusLoss: 0.85, // each wilt costs leaves: smaller catch zone
  minRadiusScale: 0.55,
  respGPerSec: 11,
  juhannusNightLight: 0.32,
};

export interface Molecule {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gold: boolean;
  /** free: drifting · pulled: being drawn in · out: breathed out by the tree */
  kind: 'free' | 'pulled' | 'out';
}

export type SeasonEvent =
  | { type: 'catch'; id: number; g: number; gold: boolean; combo: number; x: number; y: number }
  | { type: 'bounce'; id: number; x: number; y: number } // reached a leaf in the dark
  | { type: 'breathe-out'; id: number }
  | { type: 'wilt' }
  | { type: 'dawn'; day: number; weather: Weather }
  | { type: 'dusk'; day: number }
  | { type: 'end' };

export interface SeasonState {
  seed: string;
  tick: number;
  weather: Weather[];
  holding: boolean;
  open: boolean;
  water: number;
  wiltLeft: number;
  radiusScale: number;
  breath: number; // molecules caught in the current breath
  molecules: Molecule[];
  nextId: number;
  respAcc: number;
  caughtG: number;
  respiredG: number;
  stats: {
    bestCombo: number;
    wilts: number;
    caughtCount: number;
    goldCount: number;
    openNightTicks: number; // stomata open in the dark: wasted water
    openHeatTicks: number;
    respiredNightG: number;
    bounces: number;
  };
  /** events produced by the last step, for sound and effects */
  events: SeasonEvent[];
  done: boolean;
  rng: Rng;
}

export function createSeason(seed: string, weather: Weather[] = planWeather(seed)): SeasonState {
  return {
    seed,
    tick: 0,
    weather,
    holding: false,
    open: false,
    water: TUNING.waterMax,
    wiltLeft: 0,
    radiusScale: 1,
    breath: 0,
    molecules: [],
    nextId: 1,
    respAcc: 0,
    caughtG: 0,
    respiredG: 0,
    stats: { bestCombo: 0, wilts: 0, caughtCount: 0, goldCount: 0, openNightTicks: 0, openHeatTicks: 0, respiredNightG: 0, bounces: 0 },
    events: [],
    done: false,
    rng: makeRng('season:' + seed),
  };
}

export interface Clock {
  day: number;
  phase: number; // ticks into the day
  isNight: boolean;
  weather: Weather;
  juhannus: boolean;
  dayProgress: number; // 0..1 through the daylight part
  seasonProgress: number; // 0..1
}

export function clock(s: SeasonState, tick = s.tick): Clock {
  const day = Math.min(DAYS - 1, Math.floor(tick / DAY_TICKS));
  const phase = tick - day * DAY_TICKS;
  const isNight = phase >= LIGHT_TICKS;
  return {
    day,
    phase,
    isNight,
    weather: s.weather[day],
    juhannus: day === JUHANNUS_DAY,
    dayProgress: Math.min(1, phase / LIGHT_TICKS),
    seasonProgress: Math.min(1, tick / SEASON_TICKS),
  };
}

/** Sunlight reaching the leaves, 0..1. */
export function lightAt(s: SeasonState, tick = s.tick): number {
  const c = clock(s, tick);
  if (c.isNight) return c.juhannus ? TUNING.juhannusNightLight : 0;
  // morning → noon → evening, never fully dark at the edges of the day
  const sun = Math.sin(Math.PI * (c.phase + 40) / (LIGHT_TICKS + 80));
  return Math.max(0, sun) * WEATHER[c.weather].light;
}

export function catchRadius(s: SeasonState): number {
  const combo = Math.min(TUNING.comboRadiusMax, s.breath * TUNING.comboRadiusPerCatch);
  return TUNING.catchRadius * s.radiusScale * (1 + combo);
}

function spawn(s: SeasonState, light: number) {
  const r = s.rng;
  const side = r();
  let x: number, y: number;
  if (side < 0.38) { x = -30; y = range(r, 60, 720); }
  else if (side < 0.76) { x = 1030; y = range(r, 60, 720); }
  else { x = range(r, 0, 1000); y = -30; }
  const tx = range(r, 120, 880), ty = range(r, 140, 640);
  const sp = range(r, 55, 105);
  const d = Math.hypot(tx - x, ty - y) || 1;
  const gold = light > 0.6 && r() < TUNING.goldChance;
  s.molecules.push({ id: s.nextId++, x, y, vx: (tx - x) / d * sp, vy: (ty - y) / d * sp, gold, kind: 'free' });
}

/** Advance one tick (1/60 s). `holding` is the player's input for this tick. */
export function step(s: SeasonState, holding: boolean): SeasonState {
  s.events = [];
  if (s.done) return s;
  const c = clock(s);
  const fx = WEATHER[c.weather];
  const light = lightAt(s);

  if (c.phase === 0) s.events.push({ type: 'dawn', day: c.day, weather: c.weather });
  if (c.phase === LIGHT_TICKS) s.events.push({ type: 'dusk', day: c.day });

  // --- stomata ---
  const wasOpen = s.open;
  s.holding = holding;
  if (s.wiltLeft > 0) s.wiltLeft--;
  s.open = holding && s.wiltLeft === 0;
  if (wasOpen && !s.open) s.breath = 0;

  // --- water ---
  if (s.open) {
    const sunShare = TUNING.nightDrainShare + (1 - TUNING.nightDrainShare) * Math.min(1, light);
    s.water -= TUNING.drainPerSec * fx.drain * sunShare * DT;
    if (light < 0.05) s.stats.openNightTicks++;
    if (c.weather === 'heat' && !c.isNight) s.stats.openHeatTicks++;
  } else {
    s.water += TUNING.rootRefillPerSec * DT;
  }
  s.water += fx.rain * DT;
  if (s.water <= 0 && s.open) {
    s.water = 0;
    s.open = false;
    s.breath = 0;
    s.wiltLeft = TUNING.wiltTicks;
    s.radiusScale = Math.max(TUNING.minRadiusScale, s.radiusScale * TUNING.wiltRadiusLoss);
    s.stats.wilts++;
    s.events.push({ type: 'wilt' });
  }
  s.water = Math.min(TUNING.waterMax, Math.max(0, s.water));

  // --- respiration: day and night ---
  const resp = TUNING.respGPerSec * fx.resp * DT;
  s.respiredG += resp;
  if (c.isNight) s.stats.respiredNightG += resp;
  s.respAcc += resp;
  if (s.respAcc >= TUNING.moleculeG) {
    s.respAcc -= TUNING.moleculeG;
    const a = range(s.rng, -2.4, -0.7); // upwards, spread out
    const sp = range(s.rng, 60, 95);
    const id = s.nextId++;
    s.molecules.push({
      id, kind: 'out', gold: false,
      x: CROWN.x + range(s.rng, -70, 70), y: CROWN.y + range(s.rng, -50, 60),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    });
    s.events.push({ type: 'breathe-out', id });
  }

  // --- molecules ---
  if (s.rng() < TUNING.spawnPerSec * DT) spawn(s, light);
  const R = catchRadius(s);
  const keep: Molecule[] = [];
  for (const m of s.molecules) {
    const dx = CROWN.x - m.x, dy = CROWN.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    if (m.kind !== 'out' && s.open && d < R) {
      m.kind = 'pulled';
      m.vx += dx / d * TUNING.pull * DT;
      m.vy += dy / d * TUNING.pull * DT;
      const v = Math.hypot(m.vx, m.vy);
      if (v > TUNING.maxPullSpeed) { m.vx *= TUNING.maxPullSpeed / v; m.vy *= TUNING.maxPullSpeed / v; }
    } else if (m.kind === 'pulled') {
      m.kind = 'free';
    }
    m.x += m.vx * DT;
    m.y += m.vy * DT;
    if (m.kind === 'pulled' && Math.hypot(CROWN.x - m.x, CROWN.y - m.y) < CROWN.r * 0.75) {
      if (light > 0.05) {
        const g = TUNING.moleculeG * (m.gold ? TUNING.goldMultiplier : 1) * (0.35 + 0.65 * Math.min(1, light));
        s.caughtG += g;
        s.breath++;
        s.stats.caughtCount++;
        if (m.gold) s.stats.goldCount++;
        s.stats.bestCombo = Math.max(s.stats.bestCombo, s.breath);
        s.events.push({ type: 'catch', id: m.id, g, gold: m.gold, combo: s.breath, x: m.x, y: m.y });
        continue;
      }
      // no light: the leaf can't use it, so it drifts away again
      m.kind = 'free';
      m.vx = -m.vx * 0.6 + range(s.rng, -30, 30);
      m.vy = -Math.abs(m.vy) * 0.6 - 40;
      s.stats.bounces++;
      s.events.push({ type: 'bounce', id: m.id, x: m.x, y: m.y });
    }
    if (m.x < -80 || m.x > 1080 || m.y < -80 || m.y > 1000) continue;
    keep.push(m);
  }
  s.molecules = keep;

  s.tick++;
  if (s.tick >= SEASON_TICKS) {
    s.done = true;
    s.events.push({ type: 'end' });
  }
  return s;
}

export interface SeasonResult {
  seed: string;
  caughtG: number;
  respiredG: number;
  storedG: number;
  bestCombo: number;
  wilts: number;
  caughtCount: number;
  goldCount: number;
  openNightSec: number;
  openHeatSec: number;
  nightRespShare: number; // share of caught carbon breathed out at night
  weather: Weather[];
}

export function result(s: SeasonState): SeasonResult {
  return {
    seed: s.seed,
    caughtG: Math.round(s.caughtG),
    respiredG: Math.round(s.respiredG),
    storedG: Math.max(0, Math.round(s.caughtG - s.respiredG)),
    bestCombo: s.stats.bestCombo,
    wilts: s.stats.wilts,
    caughtCount: s.stats.caughtCount,
    goldCount: s.stats.goldCount,
    openNightSec: s.stats.openNightTicks / HZ,
    openHeatSec: s.stats.openHeatTicks / HZ,
    nightRespShare: s.caughtG > 0 ? s.stats.respiredNightG / s.caughtG : 0,
    weather: s.weather,
  };
}

/** Run a whole season with an input function (used by tests, bots and score checks). */
export function simulate(seed: string, input: (s: SeasonState) => boolean, weather?: Weather[]): SeasonResult {
  const s = createSeason(seed, weather);
  while (!s.done) step(s, input(s));
  return result(s);
}
