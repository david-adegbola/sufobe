/**
 * Painted art (2.5D, increment 5). The forest view can use painted layers
 * in place of its drawn ones: distant hills (or fells in Lapland), the
 * forest edge behind the stand, and the strip of grass and stones in front,
 * one painting per season. The build lists the files that exist (`__ART__`,
 * from public/art); a missing painting simply leaves the drawn layer in its
 * place, so the game always works and paintings can arrive one at a time.
 *
 * File names: `<slot>-<season>.webp`, e.g. hills-summer.webp. How to make
 * them: docs/art-prompts.md.
 */
import type { Season } from './text';

export type ArtSlot = 'hills' | 'fells' | 'treeline' | 'ground';

const SOURCES: Record<string, string> = typeof __ART__ !== 'undefined' ? __ART__ : {};
const images = new Map<string, HTMLImageElement>();
let version = 0;
let started = false;

/** Start loading every listed painting (once). Each one that arrives bumps `artVersion()`. */
export function loadArt() {
  if (started) return;
  started = true;
  for (const [name, src] of Object.entries(SOURCES)) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { images.set(name, img); version++; };
    img.src = src;
  }
}

/** The painting for a slot and season, once it has loaded; otherwise null (draw instead). */
export function art(slot: ArtSlot, season: Season): HTMLImageElement | null {
  return images.get(`${slot}-${season}`) ?? null;
}

/** Changes whenever another painting has loaded, so cached layers are painted again. */
export function artVersion(): number { return version; }

/** For tests: the paintings the build knows about. */
export function artListed(): string[] { return Object.keys(SOURCES); }
