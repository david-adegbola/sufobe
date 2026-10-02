import { describe, expect, it } from 'vitest';
import { inClearing, placeBox, places } from '../src/app/forest/world';

// screens from a phone to a wide desktop, and stands from young (zoomed in) to old
const frames = [
  { W: 390, groundY: 470, depthBand: 40, plotW: 300 },
  { W: 390, groundY: 470, depthBand: 40, plotW: 1400 },
  { W: 1280, groundY: 470, depthBand: 70, plotW: 520 },
  { W: 1280, groundY: 470, depthBand: 70, plotW: 3000 },
  { W: 2560, groundY: 1100, depthBand: 90, plotW: 1200 },
];

describe('one world: the road from the stand to the mills and the village', () => {
  it('runs in order: stand edge, side forest, mills, village, forest again', () => {
    for (const L of frames) {
      const P = places(L, 70);
      expect(P.edge).toBeLessThan(P.forestEnd);
      expect(P.forestEnd).toBeLessThan(P.mill);
      expect(P.mill).toBeLessThan(P.village);
      expect(P.village).toBeLessThan(P.end);
    }
  });

  it('keeps the mills and the village in the clearing, apart from each other', () => {
    for (const L of frames) {
      const P = places(L, 70);
      const m = placeBox(P, 'mills'), v = placeBox(P, 'village');
      expect(m.x0).toBeGreaterThan(P.forestEnd);
      expect(m.x1).toBeLessThan(v.x0);
      expect(v.x1).toBeLessThan(P.end);
      expect(inClearing(P, P.mill) && inClearing(P, P.village)).toBe(true);
      expect(inClearing(P, P.edge)).toBe(false);
    }
  });

  it('sizes the buildings to fit a phone screen', () => {
    const P = places(frames[0], 70);
    const m = placeBox(P, 'mills');
    expect(m.x1 - m.x0).toBeLessThanOrEqual(390);
  });
});
