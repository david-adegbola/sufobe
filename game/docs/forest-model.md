# Metsäni forest model (F0–F4)

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
| `wood.ts` | Felled stems → sorting → sawmill, pulp mill, biorefinery → product lots that remember their tree; recycling. |
| `products.ts` | The product shelf (items made and in use) and trace-back from any item to its tree. |

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

| Check (80 years, no management, 2000 planted/ha, one seed, with storms and beetles) | Range | Model now |
|---|---|---|
| Spruce on loam, east: volume | 350–600 m³/ha | ≈ 410 |
| Spruce on loam, east: dominant height | 20–28 m | ≈ 24 |
| Spruce on loam, east: basal area | 30–50 m²/ha | ≈ 36 |
| Spruce on loam, east: trees left | < 1200/ha | ≈ 650 |
| Pine on sand, east: volume | 200–420 m³/ha | ≈ 300 |
| Pine on sand, east: dominant height | 15–22 m | ≈ 19 |
| Pine on sand, Lapland: volume | 40–180 m³/ha | ≈ 60 |
| Spruce on loam, east: tree carbon | 80–220 t C/ha | ≈ 136 |

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

## F2: disturbances, choices, animals

### Things that happen (`events.ts`)

| Event | Rule in the game | Verify |
|---|---|---|
| Storm | A damaging storm comes with a small yearly chance per place (south 8 %, east 7 %, Lapland 5 %, warmer future 11 %). Each tree taller than 8 m may fall. The chance grows with height² and the storm's strength, and depends on species (spruce 1, aspen 0.6, birch 0.5, pine 0.45). It is higher on peat and rocky soil (× 1.4) and clay (× 1.1), for 5 years after a thinning or continuous-cover cut (× 2), and when fewer than 10 trees are left standing (× 2.5). | storm frequency, species and soil factors (Luke, FMI) |
| Spruce bark beetle (kirjanpainaja) | Needs at least 3 spruces ≥ 15 cm and enough summer warmth (none in Lapland). Breeds only after a drought this year or last, or in fresh dead spruce (storm-felled or beetle-killed in the last year). Risk rises with each of these; an outbreak kills a share of the big spruces, bigger ones first. | risk factors, outbreak sizes (Luke) |
| Moose (hirvi) | In a moose year (about every other year), each pine, birch or aspen sapling 0.5–3.5 m tall has a 35 % chance of being browsed. A browsed sapling keeps only 30 % of that summer's height growth, and 5 % of browsed saplings die. Spruce is not browsed. | browsing rates |
| Natural seeding | After "let nature seed", seedlings arrive for 10 years while the stand is open (G < 10 m²/ha), aiming at 2400 per ha. The mix depends on soil: on loam and clay, birch 50 %, spruce 30 %, pine 10 %, aspen 10 %; on sand and rock, pine first; kept trees add their own species. | regeneration densities and mixes (Tapio) |
| Continuous cover | After cutting the biggest trees, 2–4 seedlings a year (mostly spruce) come up while G < 22. | ingrowth rates |

Dead trees of 8 cm or more stay visible as **logs** (storm) or **standing snags** (other causes). Snags fall after 6–11 years. Their carbon is part of the deadwood store and rots at the same pace. A fresh log can be taken to the mills: its stem carbon moves from deadwood to products. Storm-felled logs taken out within a year still give some sawlogs.

### Tikka's questions (`decisions.ts`)

At most one question a year, in this order:
1. **What grows here next?** (after a final harvest; plant or let nature seed). This is the only question without a do-nothing answer. The game tells the child that the Forest Act requires a new forest after a final harvest (**verify** wording with a forestry teacher).
2. **Storm** (2 or more trees fell): take out, take half, or leave as deadwood.
3. **Beetles**: cut out the beetle trees or leave them.
4. **Dense young stand** (dominant height 2.5–8 m, 2100 or more saplings per ha; asked once): tend or do nothing.
5. **Mature** (mean diameter ≥ 28 cm or trees ≥ 85 years, dominant height ≥ 18 m; every 15 years): final harvest; final harvest keeping 2 trees on the plot; continuous cover; or let it grow old.
6. **Crowded** (relative density ≥ 0.65, dominant height ≥ 11 m, mean diameter ≥ 12 cm, 15 years since the last cut; every 8 years): thin to 19 m²/ha, thin lightly to 23, or do nothing.

**Verify:**
- The thinning thresholds and targets against Tapio's thinning models.
- Keeping 2 trees on the 20 × 20 m plot equals 50 trees/ha, more than the usual 5–10/ha. It was chosen so the kept trees are visible.

### Animals (`animals.ts`)

Each animal appears when its rule is met, and is listed as seen from then on. The thresholds are game choices for an ecologist to check:

| Animal | Rule |
|---|---|
| moose (hirvi) | pine, birch or aspen saplings 0.5–4 m are at least 15 % of the trees |
| great spotted woodpecker (käpytikka) | 8 or more spruces or pines ≥ 18 cm |
| capercaillie (metso) | pine ≥ 35 % of trees, tallest ≥ 15 m, oldest ≥ 50 years |
| treecreeper (puukiipijä) | 4 or more trees ≥ 28 cm |
| black woodpecker (palokärki) | 2 or more trees ≥ 30 cm and ≥ 10 m³/ha of visible dead trees |
| Siberian jay (kuukkeli) | east or Lapland, oldest ≥ 80 years, 8 or more conifers ≥ 20 cm |
| flying squirrel (liito-orava) | an aspen ≥ 20 cm and 5 or more spruces ≥ 20 cm |

**Life** counts visible dead trees (logs and snags, not stumps and roots). It gives credit for a species mix only as the stand grows up to about 12 m.

### Trade-offs (from `tests/forest/tradeoffs.test.ts`, 100 years, mean of 4 seeds)

```
east/loam    wood m³/ha  carbon t CO₂/ha  life  health  products t CO₂/ha
never        443         732              2.89  3.35    0
rotation     500         148              2.11  4.42    331
early        573         158              2.05  4.44    335
continuous   473         236              2.31  4.44    261
retention    468         195              2.64  4.18    295
```

The managers:
- **never:** leaves the forest alone.
- **rotation:** tends, thins and harvests at maturity, then replants.
- **early:** clear-cuts as soon as the mean diameter reaches 15 cm.
- **continuous:** cuts the biggest trees, with natural seeding.
- **retention:** thins lightly, keeps trees and deadwood, and lets nature seed.

The tests check:
- No manager is best on all five results, on fertile loam in the east or on sand in the south.
- Leaving the forest alone stores the most carbon and makes no products.
- A short rotation gives less life than leaving trees, deadwood or continuous cover.
- A normal rotation gives more than twice the sawn wood of a short one.
- Carbon stays conserved through every manager.

**Known issue, diagnosed in Phase 5: thinned stands do not speed up enough.** Run `npm run rotation-check` to reproduce (east/loam, mean of 6 seeds):

```
1. Growth at age 40–55 (m³/ha/yr): unthinned 9.83, thinned to 19 m²/ha 6.88, ratio 0.70

2. 300 years (m³/ha/yr)        gross  usable  died
thinned, cut when mature         6.10    5.58  0.52
never thinned, cut when mature   7.46    5.01  2.46
thinned, cut at 60 years         6.43    6.03  0.40
short rotation (dq 15 cm)        6.19    5.96  0.23
```

*Gross* counts every tree that grew, cut, dead or standing. *Usable* leaves out trees that died and rotted in the forest.

What this shows:
- **Part of the old "short rotation wins" result came from the 100-year window.** Over 300 years, total growth of the short rotation and the thinned rotation is about equal.
- **The direction of usable wood is right.** Thinning collects wood that would otherwise die (5.58 against 5.01).
- **Thinned stands lose too much growth.** In the 15 years after a thinning to 19 m²/ha, the stand grows 70% as much as an unthinned one. Finnish thinning trials report a much smaller loss after moderate thinning; the reviewers should give the source and the target. As a result:
  - the thinned rotation grows 18% less in total than the unthinned one;
  - a 60-year rotation beats an 80–100-year one;
  - the short rotation is nearly as good as either.

**The cause.** In `growTree`, each tree's diameter growth depends on its own light (the basal area of taller trees) and a weak shared crowding factor, e^(−0.015·G). Thinning from below removes shorter trees. That barely changes the light reaching the dominant trees, and the crowding factor gains only about 18%. Real residual trees grow bigger crowns and roots into the freed space.

**Candidate fixes, for the reviewers to choose and calibrate against Luke yield and thinning-trial data:**
1. **A stronger crowding factor** with a higher base growth `g0`.
   - Tried: k = 0.04 lifts the ratio to 0.82; k = 0.06 lifts it to 0.93.
   - But both lower growth in mid-aged stands and break two species-ranking calibration tests ("pine copes with sand better than spruce", "birch is the fast starter"). Each species' `g0` would need recalibrating.
2. **A stand-level growth budget.** The site sets the stand's total growth for a given leaf area, and trees share it by size and light. Langsæter's plateau, where total growth is nearly the same across a wide range of densities, then emerges by itself. This is a larger change to `growTree` and `year.ts`.
3. **Crown recovery after release.** Trees freed by a thinning grow faster for some years. This is closest to the biology, but it adds state to every tree.

Until this is fixed, the game makes no claim about which way gives "more wood". It shows the numbers, and the sawlog/pulpwood split shows the difference in what the wood becomes.

## F3: from forest to factory

### The roadside, the truck and the mills (`wood.ts`)

When the child thins, harvests or clears up after a storm or beetles, the trunks that go to the mills are shown first. The child sorts up to 10 of them, and the harvester sorts the rest. Each trunk can go to one of three places:

- **sawlog:** used as a sawlog if it's thick enough. A trunk below the sawlog size (pine and spruce 17 cm, birch 20 cm, aspen 22 cm) is chipped, and 10 % of it is lost to fuel.
- **pulpwood:** a sawlog-sized trunk sent here gives no boards.
- **energy wood:** burned for heat at once.

Branches and tops can also be collected for the biorefinery. That gives heat now, but leaves less litter to feed the soil.

| Mill | Shares of the carbon it receives (verify, Luke wood-flow statistics) |
|---|---|
| Sawmill | sawn wood 0.47 · chips to the pulp mill 0.33 · sawdust and bark to energy 0.20 |
| Pulp mill | paper and cardboard 0.45 · textile fibre 0.05 · the rest burned for the mill's energy 0.50 |
| Biorefinery | branches, tops and energy wood → heat |

### Products that remember their tree

- Every felled or salvaged tree is kept as a snapshot: species, year it arrived, age, height, diameter and its last 150 rings.
- Its products are **lots**, each pointing to its tree and route. A lot keeps its carbon until the product wears out. Half-lives:
  - sawn wood 35 years (IPCC 2019)
  - paper and cardboard 2 years (IPCC 2019)
  - textile 3 years (a game choice, **verify**)
  - energy 0 years
- **Recycling:** when paper or cardboard wears out, 60 % is collected and made into new fibre, up to 6 rounds. Both numbers are **verify** (Finnish recovery rates and the number of times fibre can be reused). Recycled fibre stays in the products store and becomes cardboard boxes. It counts as items made without new trees. The child can switch recycling off on the product shelf.
- **Receipts** count the items each tree made. Carbon per item (**verify**):

  | Item | kg C |
  |---|---|
  | table (about 16 kg of wood) | 8 |
  | house wall beam (sawn wood from trunks ≥ 28 cm) | 25 |
  | notebook (100 g) | 0.04 |
  | cardboard box (300 g) | 0.13 |
  | shirt (200 g) | 0.09 |
  | evening of firewood for a wood-heated sauna | 5 |

- **Trace-back** follows an item back to its tree, for example notebook ← paper ← pulp mill ← pulpwood ← spruce ← your forest. Recycled boxes add a recycled-fibre step for each round. The child can step through every tree that made that item.

### Tests (`tests/forest/products.test.ts`)

- **The F3 goal:** every product lot and every receipt, through whole rotations of every strategy (with storms, salvage, recycling and seeding), points at a tree that grew in that forest, and the trace view finds it.
- **Sorting:** good sorting gives boards; sending everything to pulp gives none; a thin trunk sent to the sawmill is partly lost to fuel.
- **Branches:** collecting them gives more sauna heat and less soil carbon 20 years later.
- **Recycling:** it keeps paper carbon in use longer and makes boxes without new trees; fibre is never reused more than 6 times.
- **Item counts:** they add up exactly to the carbon in products made.
- **Carbon:** conservation also checks that product lots add up to the products store.

## F4: zooming into a birch (`zoom.ts`)

From a birch's tree card, the child can play one Kasva! summer as that birch:
- The summer's weather comes from that forest year: a drought summer brings two heatwave days, and a wet one brings two rain days.
- The soil sets the birch's water store, from 0.7 on rocky soil up to 1.25 times a standard tree.
- The child's score is compared with a careful scripted player in the same summer. The difference changes that birch's ring for the year by up to ±40 %. The carbon for the extra wood comes from the air (or goes back to it), so conservation holds.
- It can be done once per birch per year, and only for birches, because Kasva! is a birch's summer.

The tests are in `tests/forest/zoom.test.ts`.

## Known simplifications (on purpose, from the plan)

- One "soil food" value instead of nitrogen, phosphorus and potassium. Soil water does not carry over from one year to the next.
- About 100 trees stand in for a hectare, so single runs are noisy, which is why the tests average over seeds.
- The model tracks net growth (NPP). Photosynthesis and the trees' own respiration are not separate flows here; Kasva! teaches those at the leaf scale.
- Height does not depend on stand density. Diameter does.

## Not yet in the game (later phases)

- Drainage of peat, and snow damage.
- The mill mini-game, recycling and trace-back (F3).
- All UI.

## Phase 6: your birch (`mybirch.ts`)

The silver birch from Kasva! is a real tree in the player's forest.
- **New forests** plant it as a sapling in the middle of the plot (x = 0.5). It is marked to keep, so no thinning, harvest or continuous-cover cut takes it. It still grows, competes and can die like any tree.
- **If it dies,** the line passes to the nearest living birch. If no birch is left, a birch seedling comes up where it stood. `f.birch.generation` counts the hand-overs, and the year record notes the change (`rec.birch`).
- **Older forests** adopt their tallest birch, or get a sapling if they have none.
- **Only forests with `f.birch` take part.** The trade-off, calibration and conservation tests use forests without it, so their numbers are unchanged (`tests/forest/mybirch.test.ts` checks this).

**Your birch's summer.** From the home screen, after the story, one Kasva! summer equals one forest year:
1. `stepYear` runs.
2. `zoomSeason` builds that year's summer for the player's own grown birch: the Kasva! growth choices, with water scaled by the soil.
3. `applyZoom` nudges the ring by at most ±40 % of that year's growth, with the carbon moved to or from the air.

Rings are measured at breast height (1.3 m), so a birch below that height only grows taller.

## Phase 7: forestry by hand (`hands.ts`)

The player's own decisions, tree by tree, use the same harvest code as the menu choices.
- **Mark and cut.** `toggleMark` flags a tree (kept trees cannot be marked). The choice `cutMarked` takes every marked, unkept tree through `take(..., 'thin')`, so sorting, mills and the carbon ledger work as for a thinning.
- **Keep.** `toggleKeep` sets `keep`, which every cut respects. The player's birch always stays kept.
- **Plant.** `plantAt(f, species, x)` adds a seedling of a plantable species at plot position x, at most `PLANT_PER_YEAR` (8) a year, counted in `f.handPlanted`.
- **Light lens.** `groundLight(f)` gives the light reaching the ground for each species, `exp(−shadeComp · G)`, from the same competition term the growth model uses. The lens colours each tree by its vigour: green above 0.75, yellow above 0.45, red below.
- **Hints.** Only kinds in `MUST_ANSWER` (`regen`) stop the year. Other questions are hints: they show on a card, never block playback, and `resolveHint` clears them after one year of playback or when the player starts their birch's summer.

None of this changes the growth model; the tools only add cuts and seedlings through existing paths. `tests/forest/hands.test.ts` checks that marked cuts balance the carbon books, kept trees are never cut, planting is capped, and hints pass on their own.

## Phase 8: question cards (`experiments.ts`)

A question card is an experiment with two forests, A and B. They share a place, soil, tree mix, spacing and seed, and differ in exactly one thing: the place, the soil, the mix, the spacing, or one choice made after `grown` shared years. Both use the same seed, so they get the same weather (for different places, the same draws through each place's climate).

- **Running.** `startTwin` plants and grows a forest to where the question starts, then makes the variant's choice. `stepTwin` runs one year. Tikka asks nothing during an experiment: an empty plot is replanted with the same trees, and any other question is left unanswered.
- **Measures.** Carbon in the trees, in the forest (trees, deadwood, soil) or in the soil (t CO₂/ha); standing wood and deadwood (m³/ha); the Life index; spruces killed by bark beetles and saplings browsed by moose (per ha, summed over the run); and year-ring width (mm a year). Ring width is compared only on trees standing in both forests at the end, so a cut cannot win just by removing slow-growing trees.
- **The answer.** `verdict` calls the higher forest the winner, or "about the same" within 10 %. The `answer` field only records what the model gives. The tests run every card with its own seed and eight more, and fail if any answer changes. In development every card also gave the same answer for 31 seeds.

| Card | A vs B | Measure | Years | Model's answer |
|---|---|---|---|---|
| soil | spruce on sandy vs clay | tree carbon | 40 | clay |
| sandPine | spruce vs pine on sandy (south) | wood | 50 | pine |
| lapland | pine in the south vs Lapland | wood | 50 | south |
| climate2080 | pine, today (east) vs 2080 | tree carbon | 60 | 2080 |
| beetle | spruce vs pine, 2080 climate (after 40 years) | beetle kills | 50 | spruce |
| moose | spruce vs pine + birch | moose browsing | 15 | pine + birch |
| thinning | 35-year spruce: leave vs thin | ring width | 12 | thin |
| dense | 1600 vs 2600 seedlings/ha | tree carbon | 25 | dense |
| mixed | spruce vs spruce + pine + birch | Life | 60 | mixed |
| woodpecker | 80-year forest: clearcut vs leave | deadwood | 30 | leave |
| peat | pine on peat vs loam | soil carbon | 30 | peat |
| continuous | 70-year forest: clearcut vs continuous cover | forest carbon (no products) | 20 | continuous cover |

For reviewers:
- The thinning card measures the trees left, not the whole stand. The stand-level thinning result is the open issue described above.
- In this model, pine in Lapland stands at about a tenth of the southern volume after 50 years (35 vs 329 m³/ha). That gap looks too large and should be checked with the calibration.
- The continuous-cover card counts the forest only. The wood taken out goes to products, which the card's text says.

## Phase 9: the village and the Carbon Thread (`village.ts`)

**Played summers.** Every Kasva! summer played as a tree (zoom-in, or your birch's summer from the home screen) is recorded on the tree as `{ year, mm }`, the ring it left. Felled trees and dead logs carry the record into their snapshot, which now also stores the tree's carbon at the cut (`c`) and how much of it stayed in the forest (`left`: stump, roots, branches, needles, tops).

**Village needs.** Six places each need one kind of thing. A met need makes way for the next, half as big again.

| Place | Needs first | Lifetime in use | When worn out |
|---|---|---|---|
| New house | 3 house beams | 60 years | repair (+30 years, twice), reuse as café table (90 % kept), burn |
| Café | 2 tables | 25 years | repair (+10, twice), reuse as a particleboard shelf for the school (90 % kept), burn |
| School | 20 notebooks | 1 year | recycle into cardboard (60 % kept, at most 6 rounds), burn |
| Shop | 30 cardboard boxes | 1 year | recycle (60 % kept), burn |
| Sports club | 5 shirts | 3 years | hand down (+2, twice), burn |
| Sauna | 10 evenings of heat | – | filled by burning worn things |

The lifetimes, repair years and reuse losses are game choices to verify. The recycling share is the one used for the forest's other products (wood.ts).

**Carbon.** Giving things to the village moves their carbon out of the forest's product lots, which fade with half-lives, into village objects. Village objects keep their carbon until the child decides; the carbon stays in the ledger's products store throughout. Losses (dust, lost fibre) and burning move carbon to the air. A worn object nobody decides about is burned for heat after 5 years. The ledger stays balanced (tests/forest/village.test.ts). Forests whose village was never opened behave exactly as before.

**Where a felled tree's carbon is now** (`treeThread`): in the village, in the forest's other products, left in the forest (the share at the cut; it slowly rots into the soil and air), and the rest back in the air.

**Your birch's gift.** Once your birch is 12 cm thick (pulpwood size), its card offers to give it to the village. It is cut (harvest kind `gift`), its trunk goes to the mill that suits it (sawlogs from 20 cm), and the birch line passes on as when it dies. In tests, a birch on fertile southern soil reaches 12 cm in about 15 years and 20 cm in about 35; in Lapland 12 cm takes about 50 years.

## Phase 10: the landscape (`landscape.ts`) and the sandbox

**The map.** A 5 × 3 grid: the child's forest, ten neighbouring stands, a lake, the village, and a road running between them. Each neighbouring stand is a full forest from the same model, with its own seed, soil and tree mix:

| Stand | Trees | Soil | Age at start | Zone at start |
|---|---|---|---|---|
| Old spruce forest | spruce 5 : aspen 1 | loam | 90 | managed |
| Pine heath | pine | sandy | 70 | managed |
| Young spruce forest | spruce | loam | 12 | managed |
| Pine bog | pine 2 : birch 1 | peat | 60 | protected |
| Mixed forest | spruce, pine, birch | loam | 40 | managed |
| Old mixed forest | spruce 4 : pine, birch, aspen 1 each | loam | 110 | protected |
| Birch forest | birch | clay | 25 | managed |
| Seedlings after a harvest | pine | sandy | 2 | managed |
| Old pine forest | pine | sandy | 100 | managed |
| Spruce and aspen forest | spruce 4 : aspen 1 | clay | 60 | managed |

The starting stands are grown without thinning (self-thinning only). The model's thinning from below removes the smallest trees, and in a young mixed stand those are the spruces under faster birch and aspen, so a thinned "old spruce forest" ended up pure aspen. Reviewers should look at this: real thinnings choose trees by species and quality as well as size.

**Managed and protected.** After the start, a managed stand's owner answers Tikka's questions as follows:
- young stand: tend it
- crowded: thin it
- mature: final harvest with retention trees
- storm or beetle damage: take the dead trees out
- empty after a harvest: replant

A protected stand gets the opposite answers: leave it, leave old trees, leave fallen trees, and let nature seed it.

**Keeping pace.** When the map is opened, every stand lives the years the child's forest has lived since the last look (at most 100 at a time).

**Saving.** Neighbouring stands keep only their last 3 year records, their last 6 harvests, and one product lot per kind of product. They have no trace-back. That keeps the carbon accounting identical, and the whole map at about 300 KB.

**Landscape animals.** These are game rules to verify with an ecologist. A stand suits:
- the flying squirrel if the model's own flying squirrel rule holds there (aspens for nests and spruces), or if it is a spruce forest (≥ 40 % spruce, ≥ 50 years, ≥ 15 m tall) to move through;
- the capercaillie if it is pine-rich (≥ 35 % pine, ≥ 50 years, ≥ 14 m);
- the Siberian jay if it is old (oldest tree ≥ 80 years, at least 4 trees ≥ 25 cm).

Each animal also needs enough of that forest:
- **Flying squirrel:** at least two neighbouring suitable stands (sharing a side), one with its nest trees.
- **Capercaillie:** at least three suitable stands anywhere on the map.
- **Siberian jay:** at least three neighbouring old stands, and only in eastern Finland or Lapland.

The road, the lake and the village are never habitat, so they cut groups apart. In tests over 60 years, protecting every stand keeps more landscape animals than managing every stand (`tests/forest/landscape.test.ts`).

**The sandbox.** A separate forest (`f.sandbox`). The child can force a drought, a storm or a bark beetle year (`f.force`) for the next year:
- a forced drought is a dry, warm summer like the model's own;
- a forced storm always comes, and is strong, but it only fells trees taller than 8 m, as any storm does;
- a forced beetle year attacks big spruces.

Hand planting allows 40 seedlings a year. Tikka's hints pass silently. In a forest with nothing forced, every random draw is exactly as before, and a test checks this.
