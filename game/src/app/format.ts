/**
 * Numbers and CO₂ amounts as the player's language writes them, for both
 * games. Finnish: 12 345,6 · English: 12,345.6. The language is set once by
 * the shell (setFormatLang), so drawing code does not need to pass it around.
 */
import type { Lang } from './text';

let current: Lang = 'fi';

export function setFormatLang(lang: Lang): void { current = lang; }

export const locale = (lang: Lang = current) => (lang === 'fi' ? 'fi-FI' : 'en-GB');

/** A number with up to `digits` decimals. */
export function num(n: number, digits = 0, lang: Lang = current): string {
  return n.toLocaleString(locale(lang), { maximumFractionDigits: digits });
}

/**
 * An amount of CO₂ given in grams, in the unit a child can read best:
 * 850 g · 4,2 kg · 1,3 t. The same scale is used everywhere, so Kasva!'s
 * grams and Metsäni's tonnes are the same kind of number.
 */
export function co2(grams: number, lang: Lang = current): string {
  const a = Math.abs(grams);
  if (a < 1000) return `${num(Math.round(grams), 0, lang)} g`;
  if (a < 1_000_000) return `${num(grams / 1000, a < 10_000 ? 1 : 0, lang)} kg`;
  return `${num(grams / 1_000_000, a < 10_000_000 ? 1 : 0, lang)} t`;
}
