/** "Zoom into a tree": a Kasva! summer that nudges one birch's growth, with carbon still balanced. */
import { describe, expect, it } from 'vitest';
import { applyZoom, canZoom, createForest, plant, run, total, treesCarbon, zoomSeason } from '../../src/core/forest';

function birches() {
  const f = createForest({ seed: 'zoom', place: 'east', soil: 'loam' });
  plant(f, { birch: 0.5, spruce: 0.5 });
  run(f, 20);
  return f;
}

describe('zoom into a tree', () => {
  it('only birches can be zoomed into, once a year', () => {
    const f = birches();
    const rec = f.history.at(-1)!;
    const b = f.trees.find(t => t.sp === 'birch')!;
    const s = f.trees.find(t => t.sp === 'spruce')!;
    expect(canZoom(b, rec)).toBe(true);
    expect(canZoom(s, rec)).toBe(false);
    applyZoom(f, b.id, 3000, 2500, rec.year);
    expect(canZoom(b, rec)).toBe(false);
  });

  it('a drought year brings heatwaves; a wetter soil gives the birch more water', () => {
    const f = birches();
    const rec = structuredClone(f.history.at(-1)!);
    rec.weather.drought = true;
    const b = f.trees.find(t => t.sp === 'birch')!;
    const z = zoomSeason(f, b, rec);
    expect(z.weather.filter(w => w === 'heat').length).toBeGreaterThanOrEqual(2);
    expect(z.expectedG).toBeGreaterThan(0);
    const sandy = { ...f, soil: 'sandy' as const };
    expect(zoomSeason(sandy, b, rec).mods.waterMax).toBeLessThan(z.mods.waterMax);
  });

  it('playing well grows a thicker ring, playing badly a thinner one, and carbon still balances', () => {
    const f = birches();
    const start = total(f.ledger);
    const year = f.history.at(-1)!.year;
    const [a, b] = f.trees.filter(t => t.sp === 'birch');
    const ringA = a.rings.at(-1)!, ringB = b.rings.at(-1)!;
    const up = applyZoom(f, a.id, 4000, 2500, year);
    const down = applyZoom(f, b.id, 1000, 2500, year);
    expect(up).toBeGreaterThan(0);
    expect(down).toBeLessThan(0);
    expect(a.rings.at(-1)!).toBeGreaterThan(ringA);
    expect(b.rings.at(-1)!).toBeLessThan(ringB);
    // never more than 40 % of the ring either way
    expect(up).toBeLessThanOrEqual(ringA * 0.4 + 1e-9);
    expect(Math.abs(total(f.ledger) - start)).toBeLessThan(1e-6);
    expect(Math.abs(f.ledger.stores.trees - treesCarbon(f))).toBeLessThan(1e-6);
    run(f, 5);
    expect(Math.abs(f.ledger.stores.trees - treesCarbon(f))).toBeLessThan(1e-6);
  });
});
