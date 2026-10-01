// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/model.js');

const NORMAL = { light: 1, water: 0.8, co2: 420 };
const close = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

function grow(env, years) {
  const s = M.createState();
  M.run(s, env, years * M.HOURS_PER_YEAR);
  return s;
}

test('carbon is conserved: nothing appears or vanishes', () => {
  const s = grow(NORMAL, 6);
  const now = M.treeCarbon(s) + s.litter;
  const expected = s.initialTreeC + s.cIn - s.cOutResp - s.cOutDecomp;
  close(now, expected, 1e-9, 'tree + litter');
});

test('soil minerals are conserved between soil, tree and litter', () => {
  const s0 = M.createState();
  const total0 = s0.soilMass + s0.minerals + s0.litterMinerals;
  const s = grow(NORMAL, 6);
  close(s.soilMass + s.minerals + s.litterMinerals, total0, 1e-9, 'minerals');
});

test('tree mass comes mostly from air, a little from water, very little from soil', () => {
  const s = grow(NORMAL, 10);
  const b = M.massBudget(s);
  assert.ok(b.fromAir / b.dry > 0.9, 'air > 90 %');
  assert.ok(b.fromWater / b.dry < 0.1, 'water < 10 %');
  assert.ok(b.fromSoil / b.dry < 0.02, 'soil < 2 %');
  const soilLost = s.initialSoil - s.soilMass;
  const treeGained = b.dry - s.initialDry;
  assert.ok(soilLost < 0.02 * treeGained, 'soil loses only a sliver of what the tree gains');
});

test('a sunny, watered birch grows to a plausible size in ten years', () => {
  const dry = M.massBudget(grow(NORMAL, 10)).dry;
  assert.ok(dry > 20 && dry < 60, `dry mass ${dry} kg`);
});

test('shade and drought slow growth; trees survive moderate stress', () => {
  const normal = M.massBudget(grow(NORMAL, 6)).dry;
  const shade = M.massBudget(grow({ ...NORMAL, light: 0.5 }, 6)).dry;
  const dry = M.massBudget(grow({ ...NORMAL, water: 0.3 }, 6)).dry;
  assert.ok(shade < normal * 0.7, 'shade slows growth');
  assert.ok(dry < normal * 0.7, 'drought slows growth');
  assert.ok(shade > 0.7 && dry > 0.7, 'still alive');
});

test('CO2 helps a little, not a lot (nutrients limit real trees)', () => {
  const base = M.massBudget(grow(NORMAL, 10)).dry;
  const high = M.massBudget(grow({ ...NORMAL, co2: 800 }, 10)).dry;
  const ratio = high / base;
  assert.ok(ratio > 1.05 && ratio < 1.5, `800 ppm ratio ${ratio}`);
});

test('dry soil closes stomata, so less CO2 gets in', () => {
  assert.strictEqual(M.stomatalOpening(0), 0);
  assert.strictEqual(M.stomatalOpening(1), 1);
  assert.ok(M.stomatalOpening(0.2) < M.stomatalOpening(0.6));
});

test('trees breathe at night: carbon leaves when there is no light', () => {
  const s = grow(NORMAL, 1);
  // run to a July midnight
  while (!(M.calendar(s.t).day === 190 && M.calendar(s.t).hour === 0)) M.step(s, NORMAL);
  M.step(s, { ...NORMAL, light: 0 });
  assert.strictEqual(s.rate.gpp, 0);
  assert.ok(s.rate.resp > 0);
});

test('a dry summer leaves a thin tree ring', () => {
  const s = M.createState();
  for (let y = 0; y < 6; y++) {
    for (let h = 0; h < M.HOURS_PER_YEAR; h++) {
      const d = M.calendar(s.t).day;
      const drought = y === 4 && d >= 150 && d < 240;
      M.step(s, { ...NORMAL, water: drought ? 0.1 : 0.8 });
    }
  }
  assert.ok(s.rings[4].wood < 0.5 * s.rings[3].wood, 'drought ring is thin');
});

test('carbon in products: burning releases at once, chairs keep it for decades', () => {
  assert.strictEqual(M.storedAfter('burn', 1), 0);
  close(M.storedAfter('chair', 35), 0.5, 1e-9, 'sawnwood half-life');
  assert.ok(M.storedAfter('leaves', 10) < 0.1, 'leaves mostly gone in 10 years');
});

test('after rebase the on-screen bookkeeping still balances', () => {
  const s = M.createState();
  M.runUntil(s, NORMAL, 171, 4);
  M.rebase(s);
  M.run(s, NORMAL, 3 * M.HOURS_PER_YEAR);
  const lhs = s.initialTreeC + s.cIn - s.cOutResp - s.cOutDecomp;
  close(lhs, M.treeCarbon(s) + s.litter, 1e-9, 'start + in - out = tree + litter');
});
