import { describe, expect, it } from 'vitest';
import {
  HA_FACTOR, LAND_ANIMALS, SOILS, createForest, createLandscape, landHabitat, lookAt, plant, setZone, stepYear, syncLandscape, total,
  type Forest, type Landscape,
} from '../../src/core/forest';

const home = (seed = 'land'): Forest => {
  const f = createForest({ seed, place: 'east', soil: 'loam' });
  plant(f, { spruce: 1 });
  for (let i = 0; i < 10; i++) { f.pending = null; stepYear(f); }
  return f;
};
const stand = (land: Landscape, x: number, y: number) => land.cells.find(c => c.x === x && c.y === y)!.stand!;

describe('the landscape (Phase 10)', () => {
  it('lays out your forest, ten stands, a lake, a road and the village', () => {
    const land = createLandscape(home());
    expect(land.cells).toHaveLength(15);
    const kinds = land.cells.map(c => c.kind);
    expect(kinds.filter(k => k === 'stand')).toHaveLength(10);
    expect(kinds.filter(k => k === 'home')).toHaveLength(1);
    expect(kinds).toContain('lake');
    expect(kinds).toContain('village');
    expect(kinds.filter(k => k === 'road')).toHaveLength(2);
    // stands are grown to their ages, and old ones were not harvested on the way
    expect(lookAt(stand(land, 4, 1).forest, 4, 1).oldest).toBeGreaterThanOrEqual(100);
    expect(stand(land, 4, 1).forest.harvests.some(h => h.kind === 'clearcut')).toBe(false);
  });

  it('is deterministic, and small enough to save', () => {
    const a = createLandscape(home());
    const b = createLandscape(home());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a).length).toBeLessThan(800_000);
  });

  it('stands keep pace with your forest, and their carbon books balance', () => {
    const f = home();
    const land = createLandscape(f);
    const ages = land.cells.filter(c => c.stand).map(c => c.stand!.forest.year);
    for (let i = 0; i < 15; i++) stepYear(f);
    expect(syncLandscape(land, f.year)).toBe(15);
    expect(land.cells.filter(c => c.stand).map(c => c.stand!.forest.year)).toEqual(ages.map(a => a + 15));
    expect(syncLandscape(land, f.year)).toBe(0);
    for (const c of land.cells) if (c.stand) {
      const g = c.stand.forest;
      const start = SOILS[g.soil].soilC0 * 1000 / HA_FACTOR;
      expect(Math.abs(total(g.ledger) - start)).toBeLessThan(1e-6 * start);
    }
  });

  it('a managed old stand is harvested; a protected one is left standing', () => {
    const f = home();
    const a = createLandscape(f);
    const b = createLandscape(f);
    setZone(b, 0, 0, 'protected');
    syncLandscape(a, f.year + 40);
    syncLandscape(b, f.year + 40);
    expect(stand(a, 0, 0).forest.harvests.some(h => h.kind === 'clearcut')).toBe(true);
    expect(stand(b, 0, 0).forest.harvests.some(h => h.kind === 'clearcut')).toBe(false);
    // the harvested stand keeps a few retention trees, but far less standing wood
    expect(lookAt(stand(b, 0, 0).forest, 0, 0).volume).toBeGreaterThan(2 * lookAt(stand(a, 0, 0).forest, 0, 0).volume);
  });

  it('the flying squirrel needs neighbouring stands: the road cuts them apart', () => {
    const land = createLandscape(home());
    const h = landHabitat(land, null);
    for (const a of LAND_ANIMALS) expect(h.animals[a]).toBeDefined();
    const sq = h.animals.flyingSquirrel;
    // every stand it lives in has a neighbour it also lives in, on the same side of the road
    for (const s of sq.stands) {
      expect(sq.stands.some(o => Math.abs(o.x - s.x) + Math.abs(o.y - s.y) === 1)).toBe(true);
      expect(s.x).not.toBe(2);
    }
  });

  it('protecting old forest keeps more landscape animals over the years than managing it all', () => {
    const f = home();
    const managed = createLandscape(f);
    const kept = createLandscape(f);
    for (const c of managed.cells) if (c.stand) c.stand.zone = 'managed';
    for (const c of kept.cells) if (c.stand) c.stand.zone = 'protected';
    syncLandscape(managed, f.year + 60);
    syncLandscape(kept, f.year + 60);
    const lives = (l: Landscape) => LAND_ANIMALS.filter(a => landHabitat(l, null).animals[a].lives).length;
    expect(lives(kept)).toBeGreaterThan(lives(managed));
  });
});

describe('the sandbox (Phase 10)', () => {
  const grown = () => {
    const f = createForest({ seed: 'sand', place: 'east', soil: 'loam' });
    plant(f, { spruce: 1 });
    for (let i = 0; i < 50; i++) { f.pending = null; stepYear(f); }
    return f;
  };
  it('a drought, a storm or a bark beetle year happens when the child asks for it', () => {
    const a = grown();
    const b = structuredClone(a);
    b.force = { drought: [b.year], storm: [b.year + 1], beetle: [b.year + 2] };
    const ra = [stepYear(a), stepYear(a), stepYear(a)];
    const rb = [stepYear(b), stepYear(b), stepYear(b)];
    expect(rb[0].weather.drought).toBe(true);
    expect(rb[1].events?.some(e => e.kind === 'storm')).toBe(true);
    expect(rb[2].events?.some(e => e.kind === 'beetle')).toBe(true);
    expect(ra.filter(r => r.events?.some(e => e.kind === 'storm')).length).toBeLessThanOrEqual(rb.filter(r => r.events?.some(e => e.kind === 'storm')).length);
  });
  it('forests with nothing forced are unchanged', () => {
    const a = grown();
    const b = structuredClone(a);
    b.force = {};
    for (let i = 0; i < 10; i++) { stepYear(a); stepYear(b); }
    expect(JSON.stringify({ ...b, force: undefined })).toBe(JSON.stringify({ ...a, force: undefined }));
  });
});
