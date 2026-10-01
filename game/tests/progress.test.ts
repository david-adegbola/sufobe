import { describe, expect, it } from 'vitest';
import { always, makeSmart } from '../src/core/bots';
import { ACHIEVEMENTS, MAX_GROWTH, RANKS, STORY, applySeason, choose, growthMods, migrate, newSave, rankIndex, rankProgress, updateStreak, type Growth } from '../src/core/progress';
import { simulate, type SeasonResult } from '../src/core/season';

const fake = (over: Partial<SeasonResult> = {}): SeasonResult => ({
  seed: 's', caughtG: 3000, respiredG: 1000, storedG: 2000, bestCombo: 6, wilts: 1, caughtCount: 70, goldCount: 1,
  openNightSec: 0, openHeatSec: 3, nightRespShare: 0.1, weather: ['sun', 'sun', 'sun', 'heat', 'sun', 'sun'], midsummerNightCatches: 0, ...over,
});

describe('ranks', () => {
  it('follow the thresholds in kg of CO2', () => {
    expect(rankIndex(0)).toBe(0);
    expect(rankIndex(4999)).toBe(0);
    expect(rankIndex(5000)).toBe(1);
    expect(rankIndex(800000)).toBe(RANKS.length - 1);
  });
  it('report progress towards the next rank', () => {
    expect(rankProgress(2500).fraction).toBeCloseTo(0.5);
    expect(rankProgress(10_000_000).next).toBeNull();
  });
  it('the first rank-up takes a few seasons, not one', () => {
    const typical = simulate('rank', makeSmart()).storedG;
    expect(typical).toBeLessThan(RANKS[1].kg * 1000);
    expect(typical * 4).toBeGreaterThan(RANKS[1].kg * 1000);
  });
});

describe('streak', () => {
  const st = newSave().streak;
  it('counts consecutive days', () => {
    let s = updateStreak(st, '2026-10-05');
    s = updateStreak(s, '2026-10-06');
    s = updateStreak(s, '2026-10-06');
    expect(s.days).toBe(2);
  });
  it('a snow cover saves one missed day, once a week', () => {
    let s = updateStreak(st, '2026-10-05'); // Monday
    s = updateStreak(s, '2026-10-07'); // missed Tuesday, cover used
    expect(s.days).toBe(2);
    expect(s.snowCovers).toBe(0);
    s = updateStreak(s, '2026-10-09'); // missed again the same week
    expect(s.days).toBe(1);
  });
  it('a new week brings a new snow cover', () => {
    let s = updateStreak(st, '2026-10-09');
    s = updateStreak(s, '2026-10-11');
    expect(s.snowCovers).toBe(0);
    s = updateStreak(s, '2026-10-13'); // next week: new cover, and it saves the gap
    expect(s.days).toBe(3);
  });
});

describe('growth', () => {
  it('stops at the maximum', () => {
    let s = newSave();
    for (let i = 0; i < 9; i++) s = choose(s, 'wood').save;
    expect(s.growth.wood).toBe(MAX_GROWTH);
  });
  it('three Roots in a row earns Root care', () => {
    let s = newSave();
    let earned: string[] = [];
    for (const g of ['roots', 'roots', 'roots'] as Growth[]) ({ save: s, newAchievements: earned } = choose(s, g));
    expect(earned).toEqual(['root-care']);
    expect(choose(s, 'roots').newAchievements).toEqual([]);
  });
  it('each choice helps a careful player, and the science still wins', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => 'g' + i);
    const mean = (f: (s: string) => number) => seeds.reduce((a, s) => a + f(s), 0) / seeds.length;
    const smart = (m?: ReturnType<typeof growthMods>) => mean((s) => simulate(s, makeSmart(), undefined, m).storedG);
    const mash = (m?: ReturnType<typeof growthMods>) => mean((s) => simulate(s, always, undefined, m).storedG);
    const base = smart();
    for (const g of [{ roots: 5, leaves: 0, wood: 0 }, { roots: 0, leaves: 5, wood: 0 }, { roots: 0, leaves: 0, wood: 5 }]) {
      expect(smart(growthMods(g))).toBeGreaterThan(base * 1.04);
    }
    const full = growthMods({ roots: 5, leaves: 5, wood: 5 });
    expect(smart(full)).toBeGreaterThan(base * 1.15);
    expect(mash(full)).toBeLessThan(smart(full) * 0.75);
    // roots help a careless player wilt less
    expect(mean((s) => simulate(s, always, undefined, growthMods({ roots: 5, leaves: 0, wood: 0 })).wilts)).toBeLessThan(mean((s) => simulate(s, always).wilts));
  });
});

describe('applying a season', () => {
  it('adds XP, a ring, a season and moves the story on', () => {
    const o = applySeason(newSave(), fake(), 'story', '2026-10-05');
    expect(o.save.co2LifetimeG).toBe(2000);
    expect(o.save.rings).toHaveLength(1);
    expect(o.save.storyIndex).toBe(1);
    expect(o.newAchievements).toContain('first-ring');
  });
  it('daily seasons track the best score per day', () => {
    let s = applySeason(newSave(), fake({ seed: 'd2026-10-05', storedG: 1000 }), 'daily', '2026-10-05');
    expect(s.newBest).toBe(false);
    s = applySeason(s.save, fake({ seed: 'd2026-10-05', storedG: 1500 }), 'daily', '2026-10-05');
    expect(s.newBest).toBe(true);
    expect(s.save.daily['d2026-10-05']).toEqual({ bestG: 1500, tries: 2 });
    expect(s.save.storyIndex).toBe(0);
  });
  it('awards badges once, for the right reasons', () => {
    const o = applySeason(newSave(), fake({ bestCombo: 12, midsummerNightCatches: 2, openHeatSec: 0, wilts: 0 }), 'free', '2026-10-05');
    expect(o.newAchievements).toEqual(expect.arrayContaining(['breath-10', 'nightless-night', 'wise-closer', 'no-wilt']));
    const again = applySeason(o.save, fake({ bestCombo: 12 }), 'free', '2026-10-05');
    expect(again.newAchievements).not.toContain('breath-10');
  });
  it('never opening earns no skill badges', () => {
    const r = simulate('lazy', () => false);
    const o = applySeason(newSave(), r, 'free', '2026-10-05');
    expect(o.newAchievements).toEqual(['first-ring']);
  });
  it('there are ten badges and ten story seasons with Juhannus on day 3', () => {
    expect(ACHIEVEMENTS).toHaveLength(10);
    expect(STORY).toHaveLength(10);
    for (const w of STORY) { expect(w).toHaveLength(6); expect(w[0]).not.toBe('heat'); }
  });
});

describe('saves', () => {
  it('survive missing or broken fields', () => {
    expect(migrate(null)).toEqual(newSave());
    const m = migrate({ co2LifetimeG: 1234, growth: { roots: 2 }, rings: 'oops' });
    expect(m.co2LifetimeG).toBe(1234);
    expect(m.growth).toEqual({ roots: 2, leaves: 0, wood: 0 });
    expect(m.rings).toEqual([]);
  });
});
