# The tree carbon model

`js/model.js` is a deliberately small model: one young silver birch (*Betula pendula*) in a pot of soil on a scale, repeating van Helmont's willow experiment. Every rule should be something you can explain to a 10-year-old and defend to a forester. Where the model simplifies, this file says so.

The time step is **1 hour**. Carbon pools are in **kg C**. Dry biomass is taken to be 50 % carbon.

## State

| Pool | Meaning |
|---|---|
| `sugar` | Non-structural carbohydrate: the tree's working sugar and its stored reserve |
| `leaf`, `stem`, `root` | Structural carbon in leaves, wood (stem + branches) and roots |
| `litter` | Dead leaves and roots lying on or in the soil |
| `minerals`, `litterMinerals`, `soilMass` | Soil-derived matter (kg) in the tree, in the litter, and left in the pot |
| `cIn`, `cOutResp`, `cOutDecomp` | Cumulative carbon taken from the air, breathed out by the tree, and released by decomposers |
| `rings` | Wood added to the stem each year, plus hours of drought stress |

## Rules, in the order they run each hour

1. **Sun and weather.** Sun height comes from solar geometry at Joensuu (62.6° N). Temperature follows a Joensuu-like seasonal curve (about −10 °C in January, about +17 °C in July) plus a ±4 °C day/night swing.
2. **Photosynthesis.**
   `GPP = eps × light × crownArea × lightCaught × stomata × co2Factor × tempFactor`
   - `lightCaught = 1 − exp(−0.5 × LAI)` (Beer's law: extra leaves shade each other, so each new leaf helps less)
   - `stomata = clamp((water − 0.05) / 0.45, 0, 1)`: dry soil closes stomata, which cuts CO₂ uptake. *This is the mechanism the drought question in the classroom flow tests.*
   - `co2Factor`: a saturating response, normalised to 1 at 420 ppm. It is deliberately flat (see calibration).
   - `tempFactor`: no photosynthesis below 0 °C, full at 15 °C and above.
3. **Maintenance respiration**, day and night, in leaves, living wood, roots and sugar, doubling per 10 °C (Q10 = 2).
4. **Growth.**
   - In spring (15–30 May), new leaves are built from sugar stored the previous summer.
   - In summer, sugar above a reserve (enough to rebuild next spring's leaves, plus winter breathing) is turned into tissue. 25 % of that sugar is burned as growth respiration.
   - The rest tops up leaves lost to stress, then goes 70 % to wood and 30 % to roots.
5. **Starvation.** If sugar runs out, the tree sheds leaves and burns living wood.
6. **Autumn.** Leaves fall between late September and mid October. 15 % of their carbon is pulled back as sugar (resorption); the rest becomes litter.
7. **Root turnover.** 25 % of root carbon dies each year and becomes litter.
8. **Decomposition.** Litter loses 35 %/year at 10 °C in moist soil (slower when cold, dry or frozen). Its carbon goes to the air and its minerals go back into the soil. This is a one-pool, Yasso-inspired simplification.

## Where the tree's mass comes from

Dry wood is about 50 % C, 43 % O, 6 % H and about 1 % minerals and nitrogen. The model credits:

- **carbon and oxygen → air** (CO₂). In the textbook photosynthesis equation, the O₂ released comes from water and the oxygen in sugar comes from CO₂. Later biochemistry swaps some oxygen atoms with water; we ignore that.
- **hydrogen → water**
- **minerals → soil**, tracked as an explicit pool, so the soil really does lose that mass and gets it back when litter decomposes.

The result is about **93 % air, 6 % water, 1 % soil, 0 % sunlight**. Sunlight provides energy, not matter.

The scale shows **dry** mass. A living tree also holds a lot of water that comes and goes. Van Helmont weighed his willow fresh.

## Calibration (default settings: full sun, moist soil, 420 ppm)

Run `node tools/calibrate.js 10`:

| Scenario | Dry mass after 10 years |
|---|---|
| Normal | ≈ 31 kg (from 0.7 kg) |
| Shade, 35 % light | ≈ 1 kg (birch is shade-intolerant) |
| Dry soil, water 0.25 | ≈ 2 kg |
| 280 ppm CO₂ | ≈ 25 kg (−21 %) |
| 800 ppm CO₂ | ≈ 40 kg (+28 %) |

Over the run, respiration is about 55 % of photosynthesis (real trees: roughly 40–60 %). The soil loses about 1 % of what the tree gains.

**Choices worth flagging:**

- The CO₂ response is intentionally weak (half-saturation 80 ppm). A stronger response compounds year after year and would teach "more CO₂ simply makes trees grow much more", which overstates real responses. FACE experiments show modest increases that are often limited by nutrients.
- 31 kg at age about 13 is in the plausible range for an open-grown birch. It is not calibrated against measured data. Stage 2 should calibrate growth curves against PREBAS or Motti outputs, with the model owners' permission.

## Tests

`node --test tests/*.test.js` checks:

- carbon conservation to 1e-9 kg: start + in − out = tree + litter, including after `rebase`
- mineral conservation
- the from-air share of mass
- plausible growth
- that stress slows growth without killing moderately stressed trees
- the size of the CO₂ effect
- stomatal closure
- night respiration
- thin rings in a drought year
- wood-product half-lives

If you change a parameter, rerun the tests and the calibration script.

## Known simplifications

- One tree, no competition, no nutrient cycle beyond a mineral tally, no seasonal hardening, no hydraulics.
- Light is a single "fraction of full sun" multiplier. Cloud cover isn't modelled separately.
- Leaf-out and leaf-fall dates are fixed, not driven by temperature sums.
- Litter is one pool. Real soil carbon (Yasso) has several pools with different decay speeds.
- Product fates in step 5 use IPCC 2019 default half-lives (sawn wood 35 y, paper 2 y). They are an illustration, not a life-cycle assessment.
