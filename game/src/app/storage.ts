/**
 * Everything the game keeps on this device, in one localStorage key,
 * "kasva-world" (Phase 5). One key makes the merged game's single save
 * possible, and keeps progress, forest and settings from drifting apart.
 *
 * Up to Phase 4 each part had its own key ("kasva-save", "kasva-forest", …).
 * On the first load those are moved in, and the old keys are removed only
 * after the new one was written, so nothing is lost if storage is full.
 *
 * The test hook "kasva-dbg" stays a key of its own: tests set it directly.
 */

export const WORLD_KEY = 'kasva-world';
export const WORLD_VERSION = 2;

/** The parts of the world, named after the keys they had up to Phase 4. */
export const PARTS = ['save', 'forest', 'landscape', 'atlas', 'lang', 'sound', 'testlog', 'greybox-log', 'quiz-on', 'quiz', 'install-later'] as const;
export type Part = (typeof PARTS)[number];

export interface World { v: typeof WORLD_VERSION; parts: Partial<Record<Part, unknown>> }

let world: World | null = null;

function write(w: World): boolean {
  try { localStorage.setItem(WORLD_KEY, JSON.stringify(w)); return true; } catch { return false; }
}

/** Gather the Phase 1–4 keys into a world, and remove them once it is saved. */
function fromOldKeys(): World {
  const w: World = { v: WORLD_VERSION, parts: {} };
  try {
    for (const p of PARTS) {
      const raw = localStorage.getItem('kasva-' + p);
      if (raw === null) continue;
      try { w.parts[p] = JSON.parse(raw); } catch { /* a broken value is left behind, not moved */ }
    }
  } catch { return w; }
  if (Object.keys(w.parts).length && write(w)) {
    for (const p of PARTS) { try { localStorage.removeItem('kasva-' + p); } catch { /* blocked */ } }
  }
  return w;
}

function read(): World {
  if (world) return world;
  try {
    const raw = localStorage.getItem(WORLD_KEY);
    if (raw) {
      const w = JSON.parse(raw) as Partial<World>;
      if (w && w.v === WORLD_VERSION && w.parts && typeof w.parts === 'object') return (world = w as World);
    }
  } catch { /* blocked or broken: start from the old keys or empty */ }
  return (world = fromOldKeys());
}

/** One part of the world, or `fallback` if it was never stored. */
export function getPart<T>(part: Part, fallback: T): T {
  const v = read().parts[part];
  return v === undefined || v === null ? fallback : (v as T);
}

/** Store one part. Returns false if the browser refused (storage full or blocked). */
export function setPart(part: Part, value: unknown): boolean {
  const w = read();
  w.parts[part] = value;
  return write(w);
}

export function removePart(part: Part): void {
  const w = read();
  delete w.parts[part];
  write(w);
}

/** Forget the copy held in memory, so the next read comes from storage. */
export function forgetCache(): void { world = null; }
