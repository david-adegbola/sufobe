/**
 * Print Metsäni runs so a person can judge whether they look plausible.
 *   npm run forest            standard scenarios, every 10 years
 *   npm run forest -- spruce loam east 100
 */
import {
  CO2_PER_C, HA_FACTOR, createForest, plant, run, stepYear, thinToBasalArea, clearcut,
  type Forest, type PlaceId, type SoilId, type SpeciesId,
} from '../src/core/forest';

const tHa = (kgPlot: number) => (kgPlot * HA_FACTOR / 1000);

function row(f: Forest): string {
  const r = f.history[f.history.length - 1];
  const s = r.stats;
  const st = r.stores;
  return [
    String(r.year + 1).padStart(4),
    String(Math.round(s.nHa)).padStart(5),
    s.dq.toFixed(1).padStart(5),
    s.domH.toFixed(1).padStart(5),
    s.G.toFixed(1).padStart(5),
    String(Math.round(s.volume)).padStart(5),
    s.lai.toFixed(1).padStart(4),
    r.water.toFixed(2).padStart(5),
    tHa(st.trees).toFixed(0).padStart(5),
    tHa(st.litter + st.deadwood).toFixed(0).padStart(5),
    tHa(st.soil).toFixed(0).padStart(5),
    tHa(st.products).toFixed(0).padStart(5),
    (tHa(-st.air) * CO2_PER_C).toFixed(0).padStart(6),
  ].join(' ');
}

const HEAD = '  yr  N/ha   dq   domH    G   m³/ha LAI water treeC  dead soilC prodC  CO2rm';

export function scenario(label: string, sp: Partial<Record<SpeciesId, number>>, soil: SoilId, place: PlaceId,
  years: number, managed = false, seed = 'calib'): Forest {
  const f = createForest({ seed, place, soil });
  plant(f, sp);
  console.log(`\n${label}  (${Object.keys(sp).join('+')}, ${soil}, ${place}${managed ? ', thinned' : ''})\n${HEAD}`);
  for (let y = 1; y <= years; y++) {
    stepYear(f);
    if (managed && (y === 35 || y === 55)) thinToBasalArea(f, 17);
    if (y % 10 === 0) console.log(row(f));
  }
  return f;
}

const args = process.argv.slice(2);
if (args.length >= 3) {
  scenario('custom', { [args[0]]: 1 }, args[1] as SoilId, args[2] as PlaceId, Number(args[3] ?? 80));
} else {
  scenario('Spruce on loam, east', { spruce: 1 }, 'loam', 'east', 100);
  scenario('Spruce on sand, east', { spruce: 1 }, 'sandy', 'east', 80);
  scenario('Pine on sand, east', { pine: 1 }, 'sandy', 'east', 100);
  scenario('Pine on loam, east', { pine: 1 }, 'loam', 'east', 80);
  scenario('Birch on loam, east', { birch: 1 }, 'loam', 'east', 80);
  scenario('Spruce on loam, south', { spruce: 1 }, 'loam', 'south', 80);
  scenario('Pine on sand, Lapland', { pine: 1 }, 'sandy', 'lapland', 100);
  scenario('Pine on rocky, east', { pine: 1 }, 'rocky', 'east', 80);
  scenario('Pine on peat, east', { pine: 1 }, 'peat', 'east', 80);
  scenario('Spruce on clay, future', { spruce: 1 }, 'clay', 'future', 80);
  const f = scenario('Spruce on loam, east, thinned + clear-cut at 80', { spruce: 1 }, 'loam', 'east', 80, true);
  clearcut(f);
  plant(f, { spruce: 1 });
  run(f, 20);
  console.log(row(f));
  for (const h of f.harvests) {
    console.log(`  harvest y${h.year} ${h.kind}: ${h.harvest.count * HA_FACTOR}/ha, ${(h.harvest.volume * HA_FACTOR).toFixed(0)} m³/ha`);
  }
}
