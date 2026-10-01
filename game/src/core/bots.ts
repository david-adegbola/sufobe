/** Simple players used to check the balance: the science-smart player must win. */
import { CROWN, catchRadius, clock, lightAt, type SeasonState } from './season';

export type Bot = (s: SeasonState) => boolean;

export const never: Bot = () => false;
export const always: Bot = () => true;

/** Holds whenever there is light, ignoring water and weather. */
export const sunChaser: Bot = (s) => lightAt(s) > 0.1;

/**
 * Plays like someone who understands stomata: breathe in good light,
 * rest at night, take short breaths in a heatwave, let the roots refill.
 */
export function makeSmart(): Bot {
  let resting = false;
  return (s) => {
    const c = clock(s);
    const light = lightAt(s);
    const heat = c.weather === 'heat' && !c.isNight;
    const low = heat ? 45 : 18;
    const resume = heat ? 75 : 45;
    if (s.water < low) resting = true;
    if (resting && s.water > resume) resting = false;
    return light > 0.25 && !resting;
  };
}

/** Smart, and also only opens when there is something to catch nearby. */
export function makeExpert(): Bot {
  const smart = makeSmart();
  return (s) => {
    if (!smart(s)) return false;
    const R = catchRadius(s) * 1.05;
    return s.molecules.some((m) => m.kind !== 'out' && Math.hypot(m.x - CROWN.x, m.y - CROWN.y) < R);
  };
}
