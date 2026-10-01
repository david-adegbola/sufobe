import { makeRng } from './rng';

export type Weather = 'sun' | 'cloudy' | 'rain' | 'heat';

export interface WeatherEffect {
  /** multiplies sunlight */
  light: number;
  /** multiplies water lost through open stomata */
  drain: number;
  /** water added per second by rain, open or closed */
  rain: number;
  /** multiplies the tree's respiration (warmer = faster) */
  resp: number;
}

export const WEATHER: Record<Weather, WeatherEffect> = {
  sun: { light: 1, drain: 1, rain: 0, resp: 1 },
  cloudy: { light: 0.55, drain: 0.75, rain: 0, resp: 0.95 },
  rain: { light: 0.45, drain: 0.5, rain: 9, resp: 0.9 },
  heat: { light: 1, drain: 2.4, rain: 0, resp: 1.5 },
};

export const DAYS = 6;
/** Day 3 (index 2) is Juhannus, midsummer: the night never gets dark. */
export const JUHANNUS_DAY = 2;

/**
 * Six days of weather from a seed. Every season has at least one heatwave
 * (the key lesson) and at most two, and no more than two of a kind in a row.
 */
export function planWeather(seed: string): Weather[] {
  const rng = makeRng('weather:' + seed);
  const weights: [Weather, number][] = [['sun', 0.45], ['cloudy', 0.2], ['rain', 0.15], ['heat', 0.2]];
  const pick = (): Weather => {
    let r = rng() * weights.reduce((a, [, w]) => a + w, 0);
    for (const [k, w] of weights) if ((r -= w) < 0) return k;
    return 'sun';
  };
  for (let attempt = 0; attempt < 100; attempt++) {
    const days = Array.from({ length: DAYS }, pick);
    days[0] = days[0] === 'heat' ? 'sun' : days[0]; // gentle first morning
    const heats = days.filter((d) => d === 'heat').length;
    const triple = days.some((d, i) => i >= 2 && d === days[i - 1] && d === days[i - 2]);
    if (heats >= 1 && heats <= 2 && !triple) return days;
  }
  return ['sun', 'sun', 'sun', 'heat', 'cloudy', 'rain'];
}

/** Today's shared seed, in Finnish local time. */
export function dailySeed(date = new Date()): string {
  const fi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' });
  return 'd' + fi.format(date);
}
