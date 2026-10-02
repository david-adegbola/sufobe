# The 2.5D forest: analysis and plan

The brief: turn the Metsäni forest view from a flat 2D side view into a deep, living 2.5D world, without replacing the simulation. Increment 1 (depth and camera) is done. This file records the analysis and the remaining steps.

## 1. How the forest was rendered

- **Engine.** One Canvas 2D context, redrawn every frame from the simulation (`app/forest/scene.ts`, class `ForestScene`). There are no image assets. Every tree, animal, log and soil grain is drawn with paths.
- **Depth before.** Each tree had a hashed "depth" (0 front, 1 back). Back trees were drawn a little smaller, a little higher and darker.
- **Camera before.** There was none. The view zoomed out automatically as the trees grew, and copies of the stand continued faintly at both sides.
- **Background before.** Two hill ridges, painted once into an offscreen canvas, and a seasonal sky.
- **Performance tools already there.** A frame budget (`scene/budget.ts`) lowers canvas resolution on slow devices, and hills were cached.

## 2. How the world is built

The simulation (`core/forest`) has no DOM:
- trees with species, height, diameter, age and vigour;
- logs, the soil, the weather and the year record;
- animals, which are derived from the stand.

`ForestScene.draw(view)` reads a `ForestView`: the forest, last year's sizes for growth playback, dying trees, the point in the year (`p`), the year record and the selection. Hit-testing, `treeBase` and `plotFraction` serve the tools, cards and tests. The question cards (two scenes on one canvas) and the What-if view reuse the same class.

## 3. What could become 2.5D without major rewrites

These only needed new drawing around the existing code:
- the sky and backgrounds;
- parallax layers;
- haze;
- shadows;
- wind;
- the foreground;
- light and weather;
- the camera, as one transform around the stand.

Trees, logs, the soil and animals keep their code; they are drawn inside the camera transform.

## 4. What needed architectural change

- **Input.** A tap used to be pointer-down. It is now pointer-up without movement, so a drag can pan and two fingers (or the wheel) can zoom.
- **Hit-testing.** Taps must go through the camera transform. It is also trunk-first now: before, a wide front crown covered the trunks of the trees behind it. In a test tapping just above twelve trees' feet, the old rule picked the tree under the finger once; trunk-first, closest-trunk picking gets all twelve.
- **Floor and soil drawing.** These assumed the screen was the whole world. They are now drawn across the visible part of the world, and the floor uses world-fixed positions so it does not slide when the camera moves.

## 5. Depth and parallax (done)

Back to front:

| Layer | How much it follows the camera |
|---|---|
| sky | not at all |
| clouds | 0.04 |
| far ridge | 0.1 |
| near ridge | 0.2 |
| far forest band | 0.35 |
| horizon haze | |
| mid forest band | 0.6 |
| **the stand** (floor, logs, shadows, trees, soil, animals) | 1, under the camera |
| foreground grass, ferns, stones, mushrooms | 1.35 |
| wind-bent blades, sunbeams, fog, rain, snow and leaves | screen space |

Layers are painted once (`app/forest/depth.ts`) into canvases cropped to their own band. They are wider than the screen and repeated sideways, so panning never shows an edge. Far trees in the stand fade into the season's haze colour (atmospheric perspective) instead of getting darker.

## 6. The camera (done)

- **Pan:** drag with a finger or the mouse, clamped to the stand and its continuation.
- **Zoom:** two fingers, the mouse wheel, the − / + buttons, or + / − keys. Range 1–2.6×, pivoting on the ground.
- **Home:** the ⌂ button or the 0 key goes back to the whole stand.
- **Focus:** choosing a tree eases the camera to it.
  - The zoom depends on the tree's height: 1.2–2.4×, gentler on phones.
  - The other trees step back slightly.
  - Closing the card returns to the whole forest.

Movement is eased, slow and never automatic beyond a focus the child asked for. With reduced motion it jumps instead of gliding, and wind, grass and weather particles stop. The What-if view and the question cards keep a fixed camera.

## 7. Simulation data driving the visuals (done, `app/forest/visual.ts`)

- **`treeStage(tree)`:** seedling (< 1.3 m), young, mature (≥ 12 m and ≥ 30 years), or old (≥ ¾ of the species' old age). The stage sets:
  - how much the crown sways (young trees most);
  - moss at the foot of mature and old trees;
  - beard lichen (naava) on old spruces and pines.
- **`envLook(season, ps, yearRecord)`:** the light tint, fog (autumn mornings, early spring), rain (a wet summer, late autumn), wind (strongest in autumn), sunbeams, and the haze colour. A drought summer is warmer and hazier.
- Growth playback, deaths (beetle-red, storm fall), snow and leaf colours already came from the simulation, and still do.

Tests: `tests/visual.test.ts`.

## 8. Assets to redesign (not done: needs the art decision)

The code-drawn style carries the depth pass. A commercial-quality look needs painted assets in one style (`docs/art-bible.md` has the style rules and prompts):
- tree sprites per species and stage (seedling → old, with seasonal variants);
- ground textures and foreground plants;
- background panoramas per place (south, east, Lapland);
- animals with a few animation frames;
- the mill, truck and village buildings.

The layer system takes images as well as drawn shapes, so painted sprites can replace drawn ones layer by layer.

## 9. Performance risks

- **Fill rate** is the main cost on phones and tablets. Background layers are composed into one cached image that is redrawn only when the camera, the season or the place changes. The soil texture is cached too. Timing single features in this container was within measurement noise (±3 fps), so only the totals below are reported.
- **Measured** in a headless browser with no GPU:
  - phone size: about 60 fps before and after;
  - desktop: about 27.5 fps against 30 before (−9 %).

  Real devices draw the canvas on the GPU, and the frame budget lowers resolution if a device struggles.
- **Ahead:**
  - painted sprites, which need a texture atlas and pre-scaled sizes per zoom level;
  - many particles, which need a fixed pool (already capped);
  - the What-if view, which draws two stands;
  - very dense young stands (100 trees × side copies), which may need a cheaper far level of detail (blobs instead of tiered spruces).

## 10. The recommended path

1. **Depth and camera (done):** layers, parallax, haze, shadows, wind, foreground, light, fog, rain, camera with focus, and trunk-first hit-testing.
2. **Juice:**
   - planting: seedling pop-in, soil particles and a soft sound;
   - harvest: the tree tips and falls, logs appear and a truck leaves along the road;
   - recycling: a short machine animation.
3. **Forest → mill → village as one world:** the road leads out of the stand. Opening the mills or the village pans the camera along the road instead of switching screens, and the map zooms out from the stand to the landscape.
4. **Level of detail for dense stands and small screens:** simplified far trees, fewer copies at the sides, and fewer foreground items on phones.
5. **Painted art:** replace drawn shapes with painted sprites in the same layers, once the art direction is decided.
6. **Kasva!'s birch season scene:** give it the same layered depth.
