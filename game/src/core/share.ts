/**
 * Sharing without accounts: generated nicknames and challenge links.
 *
 * A nickname is two indices (adjective, forest animal) written as two hex
 * digits, so it shows in each player's own language and can't contain
 * anything that would need moderating.
 *
 * Challenge link hash: #c-<nick>-<grams>-<seed>   e.g. #c-3a-2840-d2026-10-02
 * Only letters, digits and "-" so it survives any chat app and the
 * artifact viewer. The seed goes last because it may contain dashes.
 */

export const NICK_ADJ = 16;
export const NICK_ANIMAL = 16;
const SEED_RE = /^[A-Za-z0-9._~-]{1,40}$/;
export const MAX_SCORE_G = 20000;

export function randomNick(rand: () => number = Math.random): string {
  const a = Math.floor(rand() * NICK_ADJ), b = Math.floor(rand() * NICK_ANIMAL);
  return a.toString(16) + b.toString(16);
}

export function nickParts(code: string): [number, number] | null {
  if (!/^[0-9a-f]{2}$/.test(code)) return null;
  return [parseInt(code[0], 16), parseInt(code[1], 16)];
}

export interface Challenge { nick: string; scoreG: number; seed: string }

export function encodeChallenge(c: Challenge): string {
  return `c-${c.nick}-${Math.max(0, Math.min(MAX_SCORE_G, Math.round(c.scoreG)))}-${c.seed}`;
}

/** Parse a hash like "#c-3a-2840-d2026-10-02". Anything odd returns null. */
export function decodeChallenge(hash: string): Challenge | null {
  const m = /^#?c-([0-9a-f]{2})-(\d{1,5})-(.+)$/.exec(hash);
  if (!m) return null;
  const scoreG = Number(m[2]);
  if (!(scoreG >= 0 && scoreG <= MAX_SCORE_G) || !SEED_RE.test(m[3])) return null;
  return { nick: m[1], scoreG, seed: m[3] };
}
