# The 2.5D forest: analysis and plan

The brief: turn the Metsäni forest view from a flat 2D side view into a deep, living 2.5D world, without replacing the simulation. Increments 1 (depth and camera), 2 (game feel), 3 (one world) and 4 (level of detail) are done. This file records the analysis and the remaining steps.

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
2. **Juice (done):**
   - planting: seedlings pop up out of the ground one after another, with soil and a soft sound;
   - harvest: the felled trees tip over and land with a thud, logs pile up at the edge, and a timber truck backs in, loads and drives off before the mills open. Escape or any button skips to the end;
   - giving your birch: it is felled and driven away before the village opens;
   - marking and keeping: a ring of paint bursts from the trunk, with a note;
   - village: delivering shows the thing going to the building ("+2 → Café"); repairing, reusing, recycling and burning show the old thing turning into the new one, or into flame. Each has a short sound;
   - with reduced motion all of this is skipped: the forest changes at once and the next screen opens straight away. The village strip is hidden from screen readers, because the message line already says what happened.
   - Cost: none while nothing is happening. A burst of particles is capped at 260.
3. **Forest → mill → village as one world (done, `app/forest/world.ts`):**
   - a forest road leaves the stand to the right, through a clearing: first the mills (a log yard, the sawmill with sawn boards, the pulp mill with steam, the biorefinery's tanks), then the village, whose windows light up as its needs are met (the same data as the village screen); after the village the forest begins again. To the left the forest goes on as before;
   - after a harvest the loaded truck drives out along the road and the camera goes with it to the mills, which then open. The Village button, the products button and giving your birch travel the same way. Closing the screen brings the camera back to the stand;
   - a child can also drag along the road and tap the mills (the product shelf) or the village;
   - the map opens by zooming out from your own stand to the whole landscape;
   - buildings are sized from the screen, not from the trees' metres, so they stay readable for a young (close) or an old (far) stand and fit across a phone. A trip takes 1–2.2 s; Escape or any button arrives at once. With reduced motion there is no glide: the camera is simply there. Two forests side by side ("What if?") open screens directly.
   - Cost: the clearing replaces the side forest that used to fill the right edge of the view, so fewer trees are drawn: the desktop test ran at about 37 fps against 29 before (headless, no GPU).
4. **Level of detail (done, `treeDetail` in `app/forest/visual.ts`):**
   - Profiling showed that most of a frame is spent filling shapes, and that `drawTree` takes most of the script time. So the rule cuts shapes, not trees: every tree is still drawn where the simulation puts it.
   - **Full detail:** the trees of your own stand that are big enough to see.
   - **Simple:** the same silhouette and colours from fewer shapes, filled in one go (a spruce in 3–4 tiers, a pine or birch crown in three blobs, no bark marks, lichen or moss). This applies to:
     - copies of the forest at the sides;
     - trees under 18 px tall on screen (26 px on a phone);
     - trees at the back of the stand (depth over 0.75, or 0.55 on a phone).

     A tree you choose always keeps full detail.
   - **Phones:** 14 foreground grass blades instead of 26, all drawn as one stroke.
   - **Measured** in a headless browser with the same forest in both builds; phones at 2× pixel density with a 4× slower CPU; median of 3 runs:

     | Case | Before | After |
     | --- | --- | --- |
     | Phone, dense stand, year 12 | 11.3 fps | 15.7 fps |
     | Phone, normal stand, year 40 | 9.7 fps | 13.3 fps |
     | Desktop, dense stand, year 12 | 42 fps | 51 fps |
     | Desktop, normal stand, year 40 | 39 fps | 48 fps |
5. **Painted art:** replace drawn shapes with painted sprites in the same layers, once the art direction is decided.
6. **Kasva!'s birch season scene:** give it the same layered depth.
