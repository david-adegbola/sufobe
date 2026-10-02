# Painted art for the forest view: prompts and how to add them

Increment 5 of the 2.5D plan (`two-point-five-d.md`). The game can now use **painted layers** in place of its drawn ones, one painting per layer and season. Nothing needs to change in the code to add them: put a file with the right name in `game/public/art/`, build, and it appears. A painting that is missing leaves the drawn layer in its place, so they can arrive one at a time.

The trees of the stand stay drawn by the game. They grow, sway, get cut and change with the simulation every frame, and a painting cannot do that. The paintings are the world around them.

## The slots

| File | What it shows | Moves with the camera | Replaces |
| --- | --- | --- | --- |
| `hills-<season>.webp` | distant forested hills | slowly (far away) | both drawn mountain ridges |
| `fells-<season>.webp` | Lapland fells (used for the Lapland place) | slowly | the same, in Lapland |
| `treeline-<season>.webp` | the forest edge right behind the stand | more | the far and the mid forest bands |
| `ground-<season>.webp` | grass, berry shrubs, ferns, stones in front | most (in front of the stand) | the foreground strip |

`<season>` is `spring`, `summer`, `autumn` or `winter`: 16 files in all. Start with the four `summer` ones to see the look; the other seasons keep their drawn layers until their paintings exist.

### Each file

- **Transparent above the subject** (the sky must be see-through: the game draws its own sky, sun, clouds and seasonal light behind the painting).
- **Wide:** `hills` and `fells` about 3:1 (e.g. 3072 × 1024 px), `treeline` about 4:1 (3072 × 768), `ground` about 6:1 (3072 × 512).
- **The subject reaches the bottom edge**, which sits on the forest floor (`hills`, `treeline`) or at the front of the view (`ground`).
- **WebP with transparency, under about 300 KB each.** Every file is also packed into the one-file version of the game.
- The game repeats each painting sideways, every other copy mirrored, so the joins always match. It does not need to be seamless, but avoid one very distinctive feature (a single big rock, one lone tall tree) that would show up again and again.
- The game lays a little haze over `hills` and `treeline` itself, so paint them clear, not faded.

## How to make one

1. Generate the image from the prompt below at 16:9 (most generators stop there).
2. Widen it to the slot's shape with generative expand, extending left and right (Firefly's own Generative Expand, or another editor). If that isn't available, crop it to the slot's shape instead; the game's mirrored repeat covers the width.
3. Remove the sky: generate with a plain flat sky as the prompts ask, then *image_remove_background*, or select the sky and delete it.
4. Crop so the subject touches the bottom edge, resize to the width above, and export as WebP with transparency.
5. Name it exactly as in the table, put it in `game/public/art/`, then run `npm run build` (website) and `npm run bundle:single` (one-file version).
6. Check it against the science rules below in the game, in that season. If something is wrong, regenerate or fix it with the editing tools; don't ship it with a note.
7. Add a credit for the tool that made the paintings to the Credits section of the About screen, and check that tool's terms for use in a free educational game.

### Tools available in this project's sessions

- **Adobe for creativity (connected):** in this session it offered no text-to-image tool, and its notes said generative editing was not available. Its background removal and crop/resize tools can do steps 3 and 4. Step 1 (and step 2, if wanted) happens in Firefly itself (firefly.adobe.com) or another generator.
- **Figma Weave (connected):** runs image models, but your Figma account must be linked to Weave first: open https://app.weavy.ai/settings?section=profile, sign in, and link Figma under the profile settings. Each run spends Weave credits and is quoted for your approval first.

## The prompts

Every prompt ends with the same style anchor and the same negative prompt, word for word, so all 16 look like one world (from the forest-sim illustrations style bible).

**Style anchor** (already in each prompt below):
> gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate

**Negative prompt** (use with every prompt):
> photorealistic, 3D render, plastic, glossy, neon colours, cartoon outlines, anime, text, letters, watermark, logo, scary, gore, tropical plants, palm trees, deformed branches, extra limbs, distorted hands

### hills

**hills-spring**
> A wide, low panorama of gently rolling forested hills in eastern Finland in late spring, seen from far away across a valley: dark Norway spruce and Scots pine covering the slopes, with bright fresh lime-green young birch leaves in patches along the lower slopes, a few last thin snow patches only in the deepest shade on the far ridge. Finnish boreal landscape, late May, soft morning light from the left. Side view, the hills fill the lower two-thirds and touch the bottom edge across the whole width, no single feature stands out, above the hills a plain flat pale blue sky with no clouds and no sun. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 3:1.

**hills-summer**
> A wide, low panorama of gently rolling forested hills in eastern Finland in high summer, seen from far away: deep green Norway spruce and Scots pine forests, lighter green birch groves, a glimpse of a calm blue lake between two hills. Finnish boreal landscape, July, bright long evening light. Side view, the hills fill the lower two-thirds and touch the bottom edge across the whole width, no single feature stands out, above the hills a plain flat pale blue sky with no clouds and no sun. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 3:1.

**hills-autumn**
> A wide, low panorama of gently rolling forested hills in eastern Finland in autumn colour (ruska), seen from far away: dark green Norway spruce and Scots pine, with golden-yellow birches and orange-red aspens scattered through the forest, a pale mist lying in the valley. Finnish boreal landscape, late September, low golden sun. Side view, the hills fill the lower two-thirds and touch the bottom edge across the whole width, no single feature stands out, above the hills a plain flat pale blue-grey sky with no clouds and no sun. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 3:1.

**hills-winter**
> A wide, low panorama of gently rolling forested hills in eastern Finland in deep winter, seen from far away: snow-laden Norway spruce and Scots pine, bare grey-purple birch crowns, white snow on every open slope and frozen lake. Finnish boreal landscape, January, low pale pink-blue light of a short day. Side view, the hills fill the lower two-thirds and touch the bottom edge across the whole width, no single feature stands out, above the hills a plain flat pale blue sky with no clouds and no sun. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 3:1.

### fells (Lapland)

**fells-spring**
> A wide panorama of rounded treeless fells in Finnish Lapland in late spring: smooth fell tops still white with snow, lower slopes covered with dark Norway spruce and Scots pine and low mountain birch with fresh light green leaves, the tree line clearly visible below the bare tops. Finnish Lapland, early June, bright midnight-sun light. Side view, the fells fill the lower two-thirds and touch the bottom edge across the whole width, above them a plain flat pale blue sky with no clouds and no sun. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 3:1.

**fells-summer**
> A wide panorama of rounded treeless fells in Finnish Lapland in summer: grey-green bare fell tops with lichen and low heath, lower slopes covered with Norway spruce, Scots pine and low mountain birch, the tree line clearly visible below the bare tops. Finnish Lapland, July, soft midnight-sun light. Side view, the fells fill the lower two-thirds and touch the bottom edge across the whole width, above them a plain flat pale blue sky with no clouds and no sun. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 3:1.

**fells-autumn**
> A wide panorama of rounded treeless fells in Finnish Lapland in autumn colour (ruska): fell slopes glowing red and orange with dwarf birch and blueberry leaves, golden mountain birch below, dark green Norway spruce and Scots pine on the lowest slopes, bare grey fell tops. Finnish Lapland, early September, low golden sun. Side view, the fells fill the lower two-thirds and touch the bottom edge across the whole width, above them a plain flat pale blue-grey sky with no clouds and no sun. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 3:1.

**fells-winter**
> A wide panorama of rounded fells in Finnish Lapland in deep winter: fell tops completely white with snow, lower slopes with snow-crowned Norway spruce standing like white columns, bare mountain birch. Finnish Lapland, December, blue polar-night twilight with a pale pink glow low on the horizon. Side view, the fells fill the lower two-thirds and touch the bottom edge across the whole width, above them a plain flat pale blue sky with no clouds, no moon and no stars. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 3:1.

### treeline

**treeline-spring**
> The edge of a mixed Finnish boreal forest seen from a small clearing in late spring, a continuous wall of trees from left to right: dark conical Norway spruce with drooping branches, Scots pine with orange upper bark and flat crowns, white silver birches with black markings and fresh lime-green young leaves, the trees all standing on the same flat ground line. Finnish forest, late May, soft morning light. Side view at eye level, the tree wall fills the lower half and touches the bottom edge across the whole width, above the treetops a plain flat pale blue sky with no clouds. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 4:1.

**treeline-summer**
> The edge of a mixed Finnish boreal forest seen from a small clearing in summer, a continuous wall of trees from left to right: dark conical Norway spruce with drooping branches, Scots pine with orange upper bark and flat crowns, white silver birches with black markings and full green leaves, the trees all standing on the same flat ground line. Finnish forest, July, bright warm light. Side view at eye level, the tree wall fills the lower half and touches the bottom edge across the whole width, above the treetops a plain flat pale blue sky with no clouds. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 4:1.

**treeline-autumn**
> The edge of a mixed Finnish boreal forest seen from a small clearing in autumn, a continuous wall of trees from left to right: dark green conical Norway spruce, Scots pine with orange upper bark and flat green crowns, white silver birches with black markings and golden-yellow leaves, one or two aspens with orange-red leaves, the trees all standing on the same flat ground line. Finnish forest, late September, low golden sun. Side view at eye level, the tree wall fills the lower half and touches the bottom edge across the whole width, above the treetops a plain flat pale blue sky with no clouds. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 4:1.

**treeline-winter**
> The edge of a mixed Finnish boreal forest seen from a small clearing in deep winter, a continuous wall of trees from left to right: Norway spruce heavy with snow on every drooping branch, Scots pine with snow on flat crowns, bare white silver birches with black markings and fine purple-grey twigs, the trees all standing on the same flat snowy ground line. Finnish forest, January, low pale light of a short day. Side view at eye level, the tree wall fills the lower half and touches the bottom edge across the whole width, above the treetops a plain flat pale blue sky with no clouds. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 4:1.

### ground

**ground-spring**
> A low close-up strip of Finnish boreal forest floor in spring, seen from the side at ground level: young grass blades, small blueberry and lingonberry shrubs with new leaves, white wood anemone flowers, green moss on a few low rounded stones, last year's brown needles. Finnish forest, May, soft morning light. Side view, the plants form a low band along the bottom edge across the whole width and are about as tall as a fifth of the image, everything above them a plain flat pale background. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 6:1.

**ground-summer**
> A low close-up strip of Finnish boreal forest floor in summer, seen from the side at ground level: green grass, ferns, blueberry shrubs with a few ripe dark blue berries, lingonberry shrubs, mossy low rounded stones, a fallen pine cone. Finnish forest, July, warm light. Side view, the plants form a low band along the bottom edge across the whole width and are about as tall as a fifth of the image, everything above them a plain flat pale background. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 6:1.

**ground-autumn**
> A low close-up strip of Finnish boreal forest floor in autumn, seen from the side at ground level: yellowing grass, rusty brown ferns, blueberry shrubs with red autumn leaves, lingonberry shrubs with bright red berries, a few brown-capped forest mushrooms, fallen yellow birch leaves, mossy low rounded stones. Finnish forest, late September, low golden light. Side view, the plants form a low band along the bottom edge across the whole width and are about as tall as a fifth of the image, everything above them a plain flat pale background. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 6:1.

**ground-winter**
> A low close-up strip of Finnish boreal forest floor in deep winter, seen from the side at ground level: soft rounded snow drifts, a few dry grass stalks and the tips of lingonberry shrubs poking through, snow-capped low stones, small blue shadows in the snow. Finnish forest, January, low pale light. Side view, the snow and plants form a low band along the bottom edge across the whole width and are about as tall as a fifth of the image, everything above them a plain flat pale background. gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate
>
> Aspect ratio: 16:9, then widen to 6:1.

## Science check for every painting

From the forest-sim illustrations style bible; check each one in the game, in its season:

- **Species recognisable and not mixed:**
  - Norway spruce: conical, drooping branches, hanging cones.
  - Scots pine: orange upper bark, flat open crown.
  - Silver birch: white bark with black marks, small toothed leaves, drooping twigs.
- **Only Finnish boreal plants:** blueberry, lingonberry, mosses, lichens, ferns, needles, mushrooms. No garden or tropical plants.
- **One season per painting:** no autumn birch leaves beside spring flowers, no green birches in a snowy winter.
- **Lapland:** fell tops above the tree line are bare. Mountain birch is low.
- **No text, letters or logos anywhere.** Generators misspell, and labels belong in the game.
