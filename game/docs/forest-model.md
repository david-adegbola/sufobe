# Metsäni forest model (F0)

The forest core behind the Metsäni mode. It runs without the DOM, is deterministic, and is checked by `tests/forest/`. There is no user interface yet. The screens come in F1.

```
npm test             # includes the 44 forest tests
npm run forest       # prints standard 80–100-year runs to judge by eye
npm run forest -- pine sandy lapland 100
```

**Status:** a teaching model, not a forestry tool. Every number marked **verify** is a rounded first estimate. Before release it gets a source, a rewording as uncertain, or a cut. Calibration against Luke's growth and yield tables, and a review by a forest scientist, are planned (Metsäni plan, section 13).

## Structure

| File | Job |
|---|---|
| `climate.ts` | Four places. Each year's weather comes from (place, seed, year) only. |
| `soil.ts` | Five soils. Each has a water bucket, drainage, one "soil food" value, root room, wetness and starting soil carbon. |
| `species.ts` | Pine, spruce and birch. Height curves and allometry (size → wood, foliage, carbon). |
| `stand.ts` | The trees on a 20 × 20 m plot (each tree stands for 25 trees/ha), light competition, the growth of one tree, and stand statistics. |
| `year.ts` | One year in four seasonal sub-steps. Mortality, self-thinning, decomposition. |
| `carbon.ts` | Stores and flows. Every change is a recorded move. |
| `manage.ts` | Plant, tend, thin, keep trees (säästöpuut), final harvest. |
| `wood.ts` | Felled stems → sawlog / pulpwood → sawn wood, paper, energy → back to the air. |

The forest is plain JSON. It can be saved as it is, and copied with `structuredClone` for a "What if?" twin.

## One year

1. **Spring.** Snowmelt fills the soil bucket: `springWater = min(cap, 0.4·cap + snow·(1 − 0.5·drainage))`.
2. **Summer.** Water factor = `min(1, (springWater + rain·(1 − 0.6·drainage)) / demand)`. Demand grows with the warmth of the summer and the leaf area, up to a closed canopy (LAI 3). Each tree then grows:
   - **Height** moves along the species' site curve `h(t) = hMax·(1 − e^(−k·t))^c`. The curve's top depends on soil food, wetness and root room. The time step is the summer's warmth (Lapland years count for less). Height is slowed a little by drought and by shade (`light^0.6`).
   - **Diameter** grows `g0 · warmth · soil food · wetness · drought · e^(−d/dScale) · light · crowding`.
   - **Light** = `e^(−shadeComp · basal area of taller trees)`. Spruce has a small `shadeComp` and copes with shade; pine and birch need light. **Crowding** = `e^(−0.015·G)` is the shared competition for water and soil food, which is why thinning helps the remaining trees.
3. **Autumn.** Litterfall: the foliage share for the species (birch 100 %, pine 30 %, spruce 15 %), 70 % of fine roots, and a little of the branches. Ground plants (blueberry, mosses, grasses) add litter too, less under a closed canopy. In a dry summer trees carry up to 35 % less foliage, which grows back later.
4. **Winter.**
   - **Deaths.** Trees whose crowns get too little light (vigor < 0.35) may starve. There is also a small background rate, plus old age.
   - **Self-thinning.** The canopy (trees taller than half the dominant height) cannot exceed a Reineke density limit; the smallest canopy trees die first.
   - **Decay.** Dead trees become deadwood and litter. Decomposers return litter, deadwood and soil carbon to the air, faster in warmth and slower in wet soil, and pass a share into lasting soil carbon.
   - **Products** wear out at their half-lives.

Randomness (weather, deaths, planting positions) comes from seeded hashes of (seed, year, tree id). The same choices therefore always give the same forest, and a twin gets the same weather.

## Carbon

Stores: **air, trees, litter, deadwood, soil, products**. The air starts at 0 and goes negative as the forest removes carbon. `−air × 44/12` is the CO₂ the forest and its products have taken out of the atmosphere. The soil starts with its own carbon from earlier forests.

The tests check, every year, on all 20 place × soil combinations through a full managed rotation, that:

- the total of all stores never changes,
- the trees store equals the sum over the trees,
- the products store equals the sum of the product pools,
- every store change is explained by that year's recorded flows.

Harvesting: stems go to the mills. Branches, needles, fine roots and stem tops stay as litter, and stumps and coarse roots become deadwood. Trees under 7 cm are left on the ground.

## Parameters to verify

| What | Value now | Source to check |
|---|---|---|
| Temperature sums (south / east / Lapland / future) | 1400 / 1250 / 850 / 1600 °Cd | FMI climate statistics |
| Season length, summer rain, snow water, drought chance per place | `climate.ts` | FMI |
| Warmth → growth: `((T − 500)/750)^1.3` | Lapland ≈ 0.37 of east | Luke growth by region |
| Soil water capacity, drainage, soil food, wetness, root room | `soil.ts` | forest soil science, UEF review |
| Starting soil carbon (sand 35, clay 90, loam 70, rocky 15, peat 600 t C/ha) | `soil.ts` | Luke / SYKE soil carbon inventories |
| Height curves (`hMax`, `hK`, `hC`) | `species.ts` | Luke site-index curves |
| Diameter growth `g0`, `dScale` | `species.ts` | Luke growth and yield tables |
| Wood density (pine 410, spruce 390, birch 490 kg/m³) and form factors | `species.ts` | Luke / Repola biomass models |
| Foliage mass and turnover, fine-root ratio | `species.ts` | Finnish biomass studies |
| Branch and root shares (0.25, 0.35 of stem) | `species.ts` | Repola biomass models |
| Reineke limits (pine 750, spruce 850, birch 650 trees/ha at 25 cm) | `year.ts` | Finnish self-thinning studies |
| Litter, deadwood and humus decay rates and humified shares | `year.ts`, `soil.ts` | Yasso model parameters |
| Ground-plant litter (700 kg C/ha/yr in the open) | `year.ts` | Finnish understorey studies |
| Planting densities (1600 / 2000 / 2600 per ha) | `manage.ts` | Tapio forest management recommendations |
| Sawlog limits and stem shares, sawmill and pulp-mill splits | `wood.ts` | Luke wood-flow statistics |
| Product half-lives (sawn 35, paper 2 years) | `wood.ts` | IPCC 2019 defaults (already cited) |

## Calibration ranges in the tests

These ranges are wide on purpose. They check direction and rough size, and they get narrowed once Luke tables are in.

| Check (80 years, no management, 2000 planted/ha) | Range | Model now |
|---|---|---|
| Spruce on loam, east: volume | 350–600 m³/ha | ≈ 490 |
| Spruce on loam, east: dominant height | 20–28 m | ≈ 24 |
| Spruce on loam, east: basal area | 30–50 m²/ha | ≈ 43 |
| Spruce on loam, east: trees left | < 1200/ha | ≈ 750 |
| Pine on sand, east: volume | 200–420 m³/ha | ≈ 310 |
| Pine on sand, east: dominant height | 15–22 m | ≈ 19 |
| Pine on sand, Lapland: volume | 40–180 m³/ha | ≈ 110 |
| Spruce on loam, east: tree carbon | 80–220 t C/ha | ≈ 165 |

Directions tested, averaged over four seeds:

- Spruce: loam > 1.8 × sand.
- On sand: pine > 1.5 × spruce.
- For pine, rocky soil and undrained peat give less than sand.
- South > east > 2.5 × Lapland.
- Birch is the fast starter.
- Spruce seedlings survive under an old forest where pine seedlings die.
- Drought slows spruce more than pine.
- Thinning to 18 m²/ha makes the remaining trees grow > 20 % thicker.
- Crowded trees end up thinner but not shorter.
- A growing forest removes carbon from the air.
- 100 years simulate in well under half a second.

## A printed run (spruce on loam, eastern Finland, thinned at 35 and 55, clear-cut at 80)

```
  yr  N/ha   dq   domH    G   m³/ha LAI water treeC  dead soilC prodC  CO2rm
  20  1900   9.7   8.4  14.0    56  2.2  0.94    21     3    61     0     55
  30  1875  13.8  12.2  28.2   165  4.2  1.00    58     6    59     0    196
  40   875  17.3  15.4  20.6   152  3.0  1.00    52    16    62     2    226
  60   425  23.9  20.6  19.0   188  2.6  1.00    63    18    64     9    308
  80   425  29.6  24.0  29.3   338  3.8  1.00   111    10    62     5    436
 100  1950   9.5   8.3  13.7    54  2.2  1.00    21    14    63    18    169
  harvests: y35 thin 950/ha 119 m³/ha · y55 thin 450/ha 161 m³/ha · y80 clear-cut 425/ha 338 m³/ha
```

(carbon columns in t C/ha; CO2rm = t CO₂/ha removed from the air so far.) After the clear-cut, CO₂ removed falls from 436 to 169. Most of the harvest went to paper and energy, which return to the air within a few years. Only the sawn wood keeps its carbon for decades. That is the trade-off the "Carbon" result will show the child.

## Known simplifications (on purpose, from the plan)

- One "soil food" value instead of nitrogen, phosphorus and potassium. Soil water does not carry over from one year to the next.
- About 100 trees stand in for a hectare, so single runs are noisy, which is why the tests average over seeds.
- The model tracks net growth (NPP). Photosynthesis and the trees' own respiration are not separate flows here; Kasva! teaches those at the leaf scale.
- Height does not depend on stand density. Diameter does.

## Not in F0 (later phases)

- Natural seeding, storms, bark beetles, moose and drainage of peat (F2).
- Continuous-cover harvesting (F2).
- The five results and animals (F1/F2).
- The mill mini-game, recycling and trace-back (F3).
- All UI.
