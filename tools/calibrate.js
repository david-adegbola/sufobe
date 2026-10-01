// Run the model for N years under a few scenarios and print a summary.
// Usage: node tools/calibrate.js [years]
const M = require('../js/model.js');
const years = +process.argv[2] || 10;
const scenarios = {
  normal:   { light: 1, water: 0.8, co2: 420 },
  shade:    { light: 0.35, water: 0.8, co2: 420 },
  dry:      { light: 1, water: 0.25, co2: 420 },
  co2_280:  { light: 1, water: 0.8, co2: 280 },
  co2_800:  { light: 1, water: 0.8, co2: 800 },
};
for (const [name, env] of Object.entries(scenarios)) {
  const s = M.createState();
  const rows = [];
  for (let y = 0; y < years; y++) {
    M.run(s, env, M.HOURS_PER_YEAR);
    rows.push(M.massBudget(s).dry.toFixed(1));
  }
  const b = M.massBudget(s);
  const resp = s.cOutResp / s.cIn;
  console.log(`${name.padEnd(8)} dry/yr: ${rows.join(' ')}`);
  console.log(`         in=${s.cIn.toFixed(1)} respFrac=${resp.toFixed(2)} litterFall=${s.cLitterFall.toFixed(1)} decomp=${s.cOutDecomp.toFixed(1)} litter=${s.litter.toFixed(2)}`);
  console.log(`         leaf=${s.leaf.toFixed(2)} sugar=${s.sugar.toFixed(2)} stem=${s.stem.toFixed(1)} root=${s.root.toFixed(1)} soil ${s.initialSoil.toFixed(3)}->${s.soilMass.toFixed(3)} air%=${(100*b.fromAir/b.dry).toFixed(1)} rings=${s.rings.map(r=>r.wood.toFixed(2)).join(',')}`);
}
