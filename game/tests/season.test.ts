import { describe, expect, it } from 'vitest';
import { always, makeExpert, makeSmart, never, sunChaser } from '../src/core/bots';
import { createSeason, lightAt, result, SEASON_TICKS, simulate, step, clock, LIGHT_TICKS, DAY_TICKS } from '../src/core/season';
import { dailySeed, planWeather } from '../src/core/weather';

const SEEDS = Array.from({ length: 30 }, (_, i) => 'test-' + i);
const mean = (f: (seed: string) => number) => SEEDS.reduce((a, s) => a + f(s), 0) / SEEDS.length;

describe('determinism', () => {
  it('same seed and same inputs give the same season', () => {
    const a = simulate('abc', makeSmart());
    const b = simulate('abc', makeSmart());
    expect(a).toEqual(b);
  });
  it('different seeds give different weather or molecules', () => {
    expect(simulate('abc', always)).not.toEqual(simulate('abd', always));
  });
  it('a season is exactly 90 seconds', () => {
    const s = createSeason('x');
    let n = 0;
    while (!s.done) { step(s, false); n++; }
    expect(n).toBe(SEASON_TICKS);
    expect(SEASON_TICKS / 60).toBe(90);
  });
});

describe('the science is the winning strategy', () => {
  it('never opening stores nothing: the tree only breathes out', () => {
    const r = simulate('a', never);
    expect(r.caughtG).toBe(0);
    expect(r.storedG).toBe(0);
    expect(r.respiredG).toBeGreaterThan(900);
  });
  it('smart play beats holding all the time by a clear margin', () => {
    const smart = mean((s) => simulate(s, makeSmart()).storedG);
    const mash = mean((s) => simulate(s, always).storedG);
    expect(mash).toBeLessThan(smart * 0.75);
  });
  it('smart play beats chasing the sun without watching water', () => {
    expect(mean((s) => simulate(s, makeSmart()).storedG)).toBeGreaterThan(mean((s) => simulate(s, sunChaser).storedG) * 1.2);
  });
  it('watching for nearby molecules is at least as good as smart play', () => {
    expect(mean((s) => simulate(s, makeExpert()).storedG)).toBeGreaterThanOrEqual(mean((s) => simulate(s, makeSmart()).storedG) * 0.98);
  });
  it('holding all the time wilts the tree', () => {
    expect(mean((s) => simulate(s, always).wilts)).toBeGreaterThan(4);
    expect(mean((s) => simulate(s, makeSmart()).wilts)).toBeLessThan(0.5);
  });
});

describe('rules', () => {
  it('open stomata catch nothing in the dark (except on Juhannus)', () => {
    const s = createSeason('night', ['sun', 'sun', 'sun', 'sun', 'sun', 'sun']);
    while (!(clock(s).isNight && clock(s).day === 0)) step(s, false);
    const before = s.caughtG;
    for (let i = 0; i < DAY_TICKS - LIGHT_TICKS - 1; i++) step(s, true);
    expect(s.caughtG).toBe(before);
  });
  it('Juhannus night still has light', () => {
    const s = createSeason('j');
    expect(lightAt(s, 2 * DAY_TICKS + LIGHT_TICKS + 10)).toBeGreaterThan(0.2);
    expect(lightAt(s, 1 * DAY_TICKS + LIGHT_TICKS + 10)).toBe(0);
  });
  it('a heatwave drains water faster than a sunny day', () => {
    const drain = (w: 'sun' | 'heat') => {
      const s = createSeason('w', [w, w, w, w, w, w]);
      for (let i = 0; i < 200; i++) step(s, false); // reach good light
      const w0 = s.water;
      for (let i = 0; i < 60; i++) step(s, true);
      return w0 - s.water;
    };
    expect(drain('heat')).toBeGreaterThan(drain('sun') * 2);
  });
  it('closed stomata refill water', () => {
    const s = createSeason('r');
    for (let i = 0; i < 300; i++) step(s, true);
    const low = s.water;
    for (let i = 0; i < 120; i++) step(s, false);
    expect(s.water).toBeGreaterThan(low);
  });
  it('score is caught minus breathed out', () => {
    const r = simulate('sum', makeSmart());
    expect(Math.abs(r.storedG - (r.caughtG - r.respiredG))).toBeLessThanOrEqual(1);
  });
  it('result can be read mid-season', () => {
    const s = createSeason('mid');
    for (let i = 0; i < 1000; i++) step(s, true);
    expect(result(s).caughtG).toBeGreaterThanOrEqual(0);
  });
});

describe('weather', () => {
  it('every season has one or two heatwaves and a gentle first morning', () => {
    for (const seed of SEEDS) {
      const w = planWeather(seed);
      const heats = w.filter((d) => d === 'heat').length;
      expect(heats).toBeGreaterThanOrEqual(1);
      expect(heats).toBeLessThanOrEqual(2);
      expect(w[0]).not.toBe('heat');
    }
  });
  it('the daily seed follows the Finnish date', () => {
    expect(dailySeed(new Date('2026-10-01T21:30:00Z'))).toBe('d2026-10-02'); // 00:30 in Helsinki
  });
});
