/**
 * Colour for every moment of the season. The landscape is painted once in
 * neutral daylight; the sky and a multiply tint recolour it live.
 *
 * Science colour code (shared with the illustration style bible):
 *   CO₂ pale grey-blue glow · O₂ pale gold · water light blue ·
 *   sugar / stored carbon warm amber · sunlight soft golden rays
 */
import type { Weather } from '../../core/weather';

export type RGB = [number, number, number];

export const SCIENCE = {
  co2Glow: 'rgba(196, 218, 236, 0.42)',
  co2Carbon: '#2f3944',
  co2Oxygen: '#eef4f8',
  o2: '#f6dc8f',
  water: '#7cc4ec',
  sugar: '#f2a93b',
  sunRay: 'rgba(255, 226, 140, ',
};

export const UI = {
  deep: '#0f3b35',
  sun: '#ffc83d',
  paper: '#f3f6f1',
  ink: '#10241c',
  glass: 'rgba(10, 40, 34, 0.74)',
};

const SKY: Record<Weather | 'dusk' | 'night' | 'midsummer', [RGB, RGB]> = {
  sun: [[112, 176, 222], [214, 236, 236]],
  cloudy: [[150, 172, 186], [222, 229, 228]],
  rain: [[118, 138, 152], [184, 198, 202]],
  heat: [[226, 172, 116], [247, 226, 186]],
  dusk: [[104, 116, 176], [244, 184, 140]],
  night: [[12, 24, 50], [34, 50, 88]],
  midsummer: [[104, 102, 166], [242, 182, 160]],
};

/** Translucent wash laid over the painted landscape: [r, g, b, alpha]. */
type RGBA = [number, number, number, number];
const TINT: Record<Weather | 'dusk' | 'night' | 'midsummer', RGBA> = {
  sun: [255, 255, 255, 0],
  cloudy: [120, 136, 150, 0.12],
  rain: [86, 106, 128, 0.22],
  heat: [255, 168, 90, 0.13],
  dusk: [255, 138, 78, 0.2],
  night: [10, 20, 52, 0.62],
  midsummer: [118, 80, 140, 0.26],
};

const mix4 = (a: RGBA, b: RGBA, t: number): RGBA =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];

export const mixRGB = (a: RGB, b: RGB, t: number): RGB =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c: RGB, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;

export interface Mood {
  skyTop: RGB;
  skyBottom: RGB;
  tint: RGBA;
  /** 0 = night, 1 = full day */
  day: number;
  /** 0..1, how close the sun is to the horizon (warm light) */
  lowSun: number;
  stars: number;
}

/**
 * dayProgress: 0..1 through daylight; nightProgress: 0..1 through the night.
 */
export function moodFor(weather: Weather, isNight: boolean, midsummer: boolean, dayProgress: number, nightProgress: number): Mood {
  if (isNight) {
    // fade in and out of night so dusk and dawn are smooth
    const edge = Math.min(1, Math.min(nightProgress, 1 - nightProgress) * 4);
    const nightKey = midsummer ? 'midsummer' : 'night';
    const sky = SKY[nightKey], dusk = SKY.dusk;
    return {
      skyTop: mixRGB(dusk[0], sky[0], edge),
      skyBottom: mixRGB(dusk[1], sky[1], edge),
      tint: mix4(TINT.dusk, TINT[nightKey], edge),
      day: midsummer ? 0.45 : 1 - edge,
      lowSun: midsummer ? 0.8 : 1 - edge,
      stars: midsummer ? 0 : edge,
    };
  }
  const elevation = Math.sin(Math.PI * dayProgress);
  const lowSun = Math.max(0, 1 - elevation * 2.4);
  const sky = SKY[weather];
  const warm = weather === 'rain' || weather === 'cloudy' ? lowSun * 0.5 : lowSun;
  return {
    skyTop: mixRGB(sky[0], SKY.dusk[0], warm),
    skyBottom: mixRGB(sky[1], SKY.dusk[1], warm),
    tint: mix4(TINT[weather], TINT.dusk, warm),
    day: 1,
    lowSun,
    stars: 0,
  };
}
