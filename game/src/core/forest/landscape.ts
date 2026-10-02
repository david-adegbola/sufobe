/**
 * The landscape (Phase 10): your forest is one stand on a map, with ten
 * neighbouring stands, a lake, a road and the village.
 *
 * Every neighbouring stand is a full forest from the same model, grown to
 * its own age when the map is first made. Each one is either managed (an
 * owner thins it when crowded, harvests it when mature with a few retention
 * trees, and replants) or protected (left alone: no cutting, fallen trees
 * stay). The child chooses the zone for each stand. The stands keep pace
 * with the child's forest: when the map is opened, each one lives through
 * the years the child's forest has lived since.
 *
 * Some animals need more than one stand (simplified, verify):
 *   flying squirrel  spruce forest with aspens, in at least two neighbouring
 *                    stands: it glides from tree to tree and does not cross
 *                    open ground, a road or a lake
 *   capercaillie     mature pine-rich forest in at least three stands
 *   Siberian jay     old forest in at least three neighbouring stands, in
 *                    eastern Finland or Lapland
 * Neighbours share a side on the map. The road, the lake and the village
 * break the connection.
 *
 * Neighbouring stands keep only their last few year records, so the whole
 * landscape stays small enough to save.
 */
import { presentAnimals } from './animals';
import type { PlaceId } from './climate';
import type { Mix } from './experiments';
import { applyChoice, plant } from './manage';
import type { SoilId } from './soil';
import { createForest, standStats, type ChoiceId, type Forest } from './stand';
import { stepYear } from './year';

export type CellKind = 'home' | 'stand' | 'lake' | 'road' | 'village';
export type Zone = 'managed' | 'protected';
export type StandKind =
  | 'oldSpruce' | 'pineHeath' | 'youngSpruce' | 'bogPine' | 'mixed' | 'oldMixed'
  | 'birch' | 'clearcut' | 'oldPine' | 'spruceAspen';

export interface Stand { kind: StandKind; zone: Zone; mix: Mix; soil: SoilId; forest: Forest }
export interface Cell { x: number; y: number; kind: CellKind; stand?: Stand }

export interface Landscape {
  v: 1;
  /** the child's forest this map was made around */
  home: string;
  place: PlaceId;
  /** the child's forest year the stands have caught up with */
  year: number;
  cols: number;
  rows: number;
  cells: Cell[];
}

/** The stands around your forest: what grows there, on what soil, how old it is, and its zone at the start. */
const PRESETS: Record<StandKind, { mix: Mix; soil: SoilId; age: number; zone: Zone }> = {
  oldSpruce: { mix: { spruce: 5, aspen: 1 }, soil: 'loam', age: 90, zone: 'managed' },
  pineHeath: { mix: { pine: 1 }, soil: 'sandy', age: 70, zone: 'managed' },
  youngSpruce: { mix: { spruce: 1 }, soil: 'loam', age: 12, zone: 'managed' },
  bogPine: { mix: { pine: 2, birch: 1 }, soil: 'peat', age: 60, zone: 'protected' },
  mixed: { mix: { spruce: 1, pine: 1, birch: 1 }, soil: 'loam', age: 40, zone: 'managed' },
  oldMixed: { mix: { spruce: 4, pine: 1, birch: 1, aspen: 1 }, soil: 'loam', age: 110, zone: 'protected' },
  birch: { mix: { birch: 1 }, soil: 'clay', age: 25, zone: 'managed' },
  clearcut: { mix: { pine: 1 }, soil: 'sandy', age: 2, zone: 'managed' },
  oldPine: { mix: { pine: 1 }, soil: 'sandy', age: 100, zone: 'managed' },
  spruceAspen: { mix: { spruce: 4, aspen: 1 }, soil: 'clay', age: 60, zone: 'managed' },
};

/**
 * The map, 5 × 3. The road runs down the middle to the village, so the
 * stands west of it are cut off from those east of it.
 */
const LAYOUT: (CellKind | StandKind)[][] = [
  ['oldSpruce', 'pineHeath', 'road', 'youngSpruce', 'bogPine'],
  ['lake', 'home', 'road', 'mixed', 'oldMixed'],
  ['birch', 'clearcut', 'village', 'oldPine', 'spruceAspen'],
];

const KINDS = new Set<string>(['home', 'stand', 'lake', 'road', 'village']);

/** How many year records a neighbouring stand keeps (the model reads only the latest). */
const KEEP_YEARS = 3;

function slim(f: Forest): void {
  if (f.history.length > KEEP_YEARS) f.history = f.history.slice(-KEEP_YEARS);
  // a neighbour's wood is not traced to products: forget what the mills need for trace-back
  f.felled = [];
  f.receipts = [];
  f.events = f.events.slice(-10);
  f.harvests = f.harvests.slice(-6);
  // one product lot per kind: the same carbon, wearing out the same way, without a lot for every tree
  const merged = new Map<string, Forest['lots'][number]>();
  for (const l of f.lots) {
    const k = `${l.kind}|${l.round}`;
    const m = merged.get(k);
    if (m) m.c += l.c; else merged.set(k, { ...l, tree: -1 });
  }
  f.lots = [...merged.values()];
}

/**
 * The owner's answer to the stand's question, or a protected stand's: leave it be.
 * While a stand is grown to its starting age it is left to grow on its own
 * (self-thinning): the model's thinning from below takes the smaller trees,
 * which in a young mixed stand are the spruces under faster birch and aspen.
 */
function answer(f: Forest, zone: Zone, mix: Mix, growing: boolean): void {
  const d = f.pending;
  if (!d) return;
  const managed: Partial<Record<string, ChoiceId>> = {
    regen: 'plant', young: 'tend', crowded: 'thin', mature: growing ? 'leaveOld' : 'clearcutKeep', storm: 'removeFallen', beetle: 'removeBeetle',
  };
  const protectedC: Partial<Record<string, ChoiceId>> = {
    regen: 'seed', young: 'nothing', crowded: 'nothing', mature: 'leaveOld', storm: 'leaveFallen', beetle: 'leaveBeetle',
  };
  const c = (zone === 'managed' && !growing ? managed : protectedC)[d.kind] ?? 'nothing';
  applyChoice(f, d.choices.includes(c) ? c : d.choices.includes('nothing') ? 'nothing' : d.choices[0], { mix });
}

/** One year of a neighbouring stand. `growing`: still being grown to its starting age (no final harvest yet). */
export function stepStand(s: Stand, growing = false): void {
  answer(s.forest, s.zone, s.mix, growing);
  stepYear(s.forest);
  slim(s.forest);
}

/** Make the landscape around a forest: the same place, ten stands grown to their ages. */
export function createLandscape(home: Forest): Landscape {
  const cells: Cell[] = [];
  LAYOUT.forEach((row, y) => row.forEach((k, x) => {
    if (KINDS.has(k)) { cells.push({ x, y, kind: k as CellKind }); return; }
    const kind = k as StandKind;
    const p = PRESETS[kind];
    const forest = createForest({ seed: `${home.seed}|land|${kind}`, place: home.place, soil: p.soil });
    plant(forest, p.mix);
    // grown as a managed forest would have been, but not yet harvested
    const s: Stand = { kind, zone: 'managed', mix: p.mix, soil: p.soil, forest };
    for (let i = 0; i < p.age; i++) stepStand(s, true);
    s.zone = p.zone;
    cells.push({ x, y, kind: 'stand', stand: s });
  }));
  return { v: 1, home: home.seed, place: home.place, year: home.year, cols: LAYOUT[0].length, rows: LAYOUT.length, cells };
}

/** Let every stand live the years the child's forest has lived since the last look (at most 100 at a time). */
export function syncLandscape(land: Landscape, homeYear: number): number {
  const years = Math.max(0, Math.min(100, homeYear - land.year));
  for (let i = 0; i < years; i++) for (const c of land.cells) if (c.stand) stepStand(c.stand);
  land.year = Math.max(land.year, homeYear);
  return years;
}

export function setZone(land: Landscape, x: number, y: number, zone: Zone): boolean {
  const c = land.cells.find(c => c.x === x && c.y === y);
  if (!c?.stand) return false;
  c.stand.zone = zone;
  return true;
}

// ---------- habitat ----------

export type LandAnimal = 'flyingSquirrel' | 'capercaillie' | 'siberianJay';
export const LAND_ANIMALS: LandAnimal[] = ['flyingSquirrel', 'capercaillie', 'siberianJay'];

export interface StandLook {
  x: number;
  y: number;
  /** oldest tree, years; tallest tree, m; standing wood, m³/ha */
  oldest: number;
  height: number;
  volume: number;
  /** main tree species by count */
  main: string;
  animals: ReturnType<typeof presentAnimals>;
  /** habitat for each landscape animal */
  suits: Record<LandAnimal, boolean>;
}

export function lookAt(f: Forest, x: number, y: number): StandLook {
  const n = f.trees.length || 1;
  const share = (sp: string) => f.trees.filter(t => t.sp === sp).length / n;
  const oldest = f.trees.reduce((m, t) => Math.max(m, t.age), 0);
  const height = f.trees.reduce((m, t) => Math.max(m, t.h), 0);
  const counts = new Map<string, number>();
  for (const t of f.trees) counts.set(t.sp, (counts.get(t.sp) ?? 0) + 1);
  const main = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const animals = presentAnimals(f);
  const big = f.trees.filter(t => t.d >= 25).length;
  return {
    x, y, oldest, height, volume: standStats(f.trees).volume, main, animals,
    suits: {
      // spruce cover to move in, or the aspens it nests in
      flyingSquirrel: animals.includes('flyingSquirrel') || (share('spruce') >= 0.4 && oldest >= 50 && height >= 15),
      capercaillie: share('pine') >= 0.35 && oldest >= 50 && height >= 14,
      siberianJay: oldest >= 80 && big >= 4,
    },
  };
}

export interface LandHabitat {
  looks: StandLook[];
  /** for each landscape animal: does it live here, and the stands it lives in */
  animals: Record<LandAnimal, { lives: boolean; stands: { x: number; y: number }[]; suitable: number; biggest: number }>;
}

/** Groups of neighbouring stands that all suit an animal (road, lake and village cut them apart). */
function clusters(looks: StandLook[], ok: (l: StandLook) => boolean): StandLook[][] {
  const at = new Map(looks.map(l => [`${l.x},${l.y}`, l]));
  const seen = new Set<string>();
  const out: StandLook[][] = [];
  for (const l of looks) {
    const k0 = `${l.x},${l.y}`;
    if (seen.has(k0) || !ok(l)) continue;
    const group: StandLook[] = [];
    const queue = [l];
    seen.add(k0);
    while (queue.length) {
      const c = queue.pop()!;
      group.push(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${c.x + dx},${c.y + dy}`;
        const n = at.get(k);
        if (n && !seen.has(k) && ok(n)) { seen.add(k); queue.push(n); }
      }
    }
    out.push(group);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Which landscape animals live here, given the stands and the child's own forest. */
export function landHabitat(land: Landscape, home: Forest | null): LandHabitat {
  const looks: StandLook[] = [];
  for (const c of land.cells) {
    if (c.stand) looks.push(lookAt(c.stand.forest, c.x, c.y));
    else if (c.kind === 'home' && home) looks.push(lookAt(home, c.x, c.y));
  }
  const pos = (g: StandLook[]) => g.map(l => ({ x: l.x, y: l.y }));
  const animals = {} as LandHabitat['animals'];
  // flying squirrel: two or more neighbouring stands, at least one with its nest trees
  const sq = clusters(looks, l => l.suits.flyingSquirrel).filter(g => g.length >= 2 && g.some(l => l.animals.includes('flyingSquirrel')));
  animals.flyingSquirrel = {
    lives: sq.length > 0, stands: sq.flatMap(pos),
    suitable: looks.filter(l => l.suits.flyingSquirrel).length, biggest: clusters(looks, l => l.suits.flyingSquirrel)[0]?.length ?? 0,
  };
  // capercaillie: enough mature pine forest in the landscape, connected or not
  const cap = looks.filter(l => l.suits.capercaillie);
  animals.capercaillie = { lives: cap.length >= 3, stands: cap.length >= 3 ? pos(cap) : [], suitable: cap.length, biggest: cap.length };
  // Siberian jay: three neighbouring old stands, in the east or north
  const jayPlace = land.place === 'east' || land.place === 'lapland';
  const jay = clusters(looks, l => l.suits.siberianJay);
  const jayLives = jayPlace && (jay[0]?.length ?? 0) >= 3;
  animals.siberianJay = { lives: jayLives, stands: jayLives ? pos(jay[0]) : [], suitable: looks.filter(l => l.suits.siberianJay).length, biggest: jay[0]?.length ?? 0 };
  return { looks, animals };
}
