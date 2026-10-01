/**
 * Thinning and rotation check, for the forest scientist (Phase 5).
 *
 * 1. Release: the same 40-year stand, thinned to 19 m²/ha or left alone,
 *    grown for 15 more years. How much of the unthinned growth does the
 *    thinned stand keep?
 * 2. Long run: 300 years of each way of managing, so the answer does not
 *    depend on where a 100-year window ends. Gross growth counts every tree
 *    that grew (cut, died or standing); usable wood leaves out trees that died
 *    and rotted in the forest.
 *
 * Run: npm run rotation-check [-- place soil]
 */
import {
  HA_FACTOR, SPECIES, applyChoice, clearcut, createForest, plant, standStats, stemVolume, stepYear, thinToBasalArea,
  type ChoiceId, type Forest, type Tree,
} from '../src/core/forest';

const [place = 'east', soil = 'loam'] = process.argv.slice(2) as [Forest['place'], Forest['soil']];
const SEEDS = ['s1', 's2', 's3', 's4', 's5', 's6'];
const MIX = { spruce: 0.6, pine: 0.2, birch: 0.2 };
const vol = (t: Tree) => stemVolume(SPECIES[t.sp], t.d, t.h) * HA_FACTOR;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const forest = (seed: string) => { const f = createForest({ seed, place, soil }); plant(f, MIX); return f; };

/** Step one year and return the volume of trees that died in it. */
function step(f: Forest): number {
  const before = f.trees.slice();
  stepYear(f);
  const alive = new Set(f.trees);
  return before.reduce((a, t) => a + (alive.has(t) ? 0 : vol(t)), 0);
}

// ---------- 1. release after thinning ----------
const release = SEEDS.map(seed => [false, true].map(thinned => {
  const f = forest(seed);
  while (f.year < 40) { f.pending = null; step(f); }
  if (thinned) thinToBasalArea(f, 19);
  const v0 = standStats(f.trees).volume;
  let died = 0;
  for (let y = 0; y < 15; y++) { f.pending = null; died += step(f); }
  return (standStats(f.trees).volume - v0 + died) / 15;
}));
const un = mean(release.map(r => r[0]));
const th = mean(release.map(r => r[1]));
console.log(`${place}/${soil}, mean of ${SEEDS.length} seeds\n`);
console.log(`1. Growth at age 40–55 (m³/ha/yr): unthinned ${un.toFixed(2)}, thinned to 19 m²/ha ${th.toFixed(2)}, ratio ${(th / un).toFixed(2)}\n`);

// ---------- 2. 300 years of each way of managing ----------
interface Way { name: string; thin: ChoiceId; cutWhen?: (f: Forest) => boolean }
const WAYS: Way[] = [
  { name: 'thinned, cut when mature', thin: 'thin' },
  { name: 'never thinned, cut when mature', thin: 'nothing' },
  { name: 'thinned, cut at 60 years', thin: 'thin', cutWhen: f => f.trees.some(t => t.age >= 60) },
  { name: 'short rotation (dq 15 cm)', thin: 'nothing', cutWhen: f => f.trees.length > 0 && standStats(f.trees).dq >= 15 },
];
console.log('2. 300 years (m³/ha/yr)        gross  usable  died  rotation');
for (const w of WAYS) {
  const r = SEEDS.map(seed => {
    const f = forest(seed);
    let removed = 0, died = 0, cuts = 0;
    for (let y = 0; y < 300; y++) {
      const before = f.trees.slice();
      if (f.pending) {
        const k = f.pending.kind;
        const c: ChoiceId = k === 'regen' ? 'plant' : k === 'young' ? 'tend' : k === 'crowded' ? w.thin
          : k === 'mature' ? (w.cutWhen ? 'leaveOld' : 'clearcut') : k === 'storm' ? 'removeFallen' : 'removeBeetle';
        if (c === 'clearcut') cuts++;
        applyChoice(f, c, { mix: MIX });
      }
      if (w.cutWhen && !f.pending && w.cutWhen(f)) { clearcut(f); plant(f, MIX); cuts++; }
      const left = new Set(f.trees);
      removed += before.reduce((a, t) => a + (left.has(t) ? 0 : vol(t)), 0);
      died += step(f);
    }
    const standing = standStats(f.trees).volume;
    return { gross: (removed + standing + died) / 300, usable: (removed + standing) / 300, died: died / 300, rot: 300 / Math.max(1, cuts) };
  });
  console.log(`${w.name.padEnd(31)} ${mean(r.map(x => x.gross)).toFixed(2).padStart(5)}  ${mean(r.map(x => x.usable)).toFixed(2).padStart(6)}  ${mean(r.map(x => x.died)).toFixed(2).padStart(4)}  ~${mean(r.map(x => x.rot)).toFixed(0)} y`);
}
