// Painted art for the forest view (2.5D, increment 5): which files are in
// public/art. A file counts only if its name is one of the known slots, so a
// stray file never reaches the game. Shared by vite.config.ts (web build: the
// files are served and cached offline) and single-file.mjs (inlined).
import { existsSync, readdirSync } from 'node:fs';

export const ART_NAME = /^(hills|fells|treeline|ground)-(spring|summer|autumn|winter)\.(webp|png|jpg)$/;

/** [name without extension, file name] for every painted layer present. */
export function artFiles(dir = 'public/art') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => ART_NAME.test(f)).sort().map((f) => [f.replace(/\.[a-z]+$/, ''), f]);
}
