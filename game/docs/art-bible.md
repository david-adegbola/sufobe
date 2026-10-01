# Kasva! art bible

## How the art is made today

The game world is drawn in code, in the flat-vector poster style approved in the design plan (v2):

- a layered Finnish lake landscape (`src/app/scene/landscape.ts`)
- a silver birch (`birch.ts`)
- Tikka (`tikka.ts`)
- weather icons (`icons.ts`)

Code-drawn layers can be recoloured live for dawn, noon, dusk, heatwave, rain, night and the light Juhannus night. A paper-grain texture sits over everything.

Painted layers can replace the drawn ones later (see "Painted layers" below). The palette module, `src/app/scene/palette.ts`, would keep recolouring them by time of day.

## Science colour code (shared with the forest-sim illustration style)

Never change these between screens or images.

| Thing | Look in the game |
|---|---|
| CO₂ | pale grey-blue glow around a small O=C=O molecule (dark carbon, pale oxygen) |
| Sunfleck CO₂ (×5) | the same molecule with soft golden rays around it: it sits in a patch of sunlight |
| O₂ | soft pale-gold particle rising from the leaf after each catch |
| Water | light-blue droplets rising up the trunk while the roots refill; light-blue vapour wisps leaving open leaves (stronger in a heatwave) |
| Sugar / stored carbon | warm amber glow sliding down the trunk into wood |
| Sunlight energy | soft golden rays falling on the crown |

The O=C=O logo in the interface keeps its bolder red and black brand colours.

## Accuracy checklist (boreal Finland)

- **Silver birch (rauduskoivu):** white bark, black horizontal lenticels, black diamond marks under branch scars, rough dark bark only at the base. Branches arch up and the twigs hang down. Small triangular, double-toothed leaves.
- **Norway spruce (kuusi):** conical, with drooping branch tiers, short needles all round the twig (bottle brush), hanging cones.
- **Landscape:** low rounded forested hills (vaara) and a lake, no mountains. A red cottage with white corners on the far shore.
- **Forest floor:** moss, blueberry (indigo), lingonberry (red), fallen needles, a glacial boulder, a fallen log with boletes. No garden or tropical plants.
- **Light:** Joensuu latitude. Day 3 is Juhannus: the sun only dips to the horizon and the night stays light.

## Character sheet: Tikka

- **Name:** Tikka (Finnish for woodpecker)
- **Species:** black woodpecker, *palokärki* (*Dryocopus martius*), Finland's largest woodpecker, about crow-sized (45 cm)
- **Look:** all black with a faint blue-black sheen on the wings, a red crown (male: the whole crown), a pale ivory dagger bill, a pale yellow eye, a stiff tail braced against the trunk, grey feet gripping the bark
- **Scale:** a small figure clinging to the lower trunk of the birch, about one tenth of the tree's height
- **Pose:** always clinging upright to the trunk and facing it, never perched on a branch like a songbird
- **Personality:** curious, cheerful, a little proud of its drumming. Speaks in one or two short sentences. Always drums on the trunk before speaking.
- **Voice in the UI:** handwritten face (Caveat) in a white bubble with Tikka's head on the left
- **Real facts for later fact cards:** drums loudly on resonant trunks; carves big oval nest holes, often in aspen; old palokärki holes become homes for flying squirrels (liito-orava), owls and goldeneye ducks

## Sound

All sound is synthesised live (`src/app/audio.ts`), so there are no files to license:

- **Catches:** kantele plucks (Karplus–Strong string synthesis) in the traditional 5-string tuning D–E–F–G–A. They climb the strings as a breath continues.
- **Day:** willow warbler (pajulintu), Finland's most common bird.
- **Dusk and Juhannus night:** song thrush (laulurastas) repeating its phrases.
- **Night:** a distant tawny owl (lehtopöllö).
- **Weather:** wind all the time, rain on rainy days.
- **Tikka:** a black-woodpecker drum roll before each hint.

## Painted layers: prompts for Firefly or another generator

No image generator was connected in the session that built Phase 1. Figma Weave needs your Figma account linked to Weave, and the Adobe tools available were edit-only. These prompts follow the forest-sim-illustrations template. Generate 2–4 variations of each and check them against the accuracy checklist above. Then remove the background from the objects (1, 3, 4, 5) and save as WebP.

**Style anchor (in every prompt):** gouache and watercolour children's storybook illustration, soft visible brush texture, gentle paper grain, Nordic natural light, calm and wonder-filled, rich but natural colours, detailed and botanically accurate

**Negative (every prompt):** photorealistic, 3D render, plastic, glossy, neon colours, cartoon outlines, anime, text, letters, watermark, logo, scary, gore, tropical plants, palm trees, deformed branches, extra limbs, distorted hands, mountains, people

1. `landscape_back_summer_v1` (16:9 and 9:16): A wide Finnish lake landscape at midday in early summer: low rounded forested hills (vaara) fading into blue haze, a calm lake with soft reflections, a small red wooden cottage with white corners and a little jetty on the far shore. The centre of the foreground is empty open forest floor, and the upper third is calm pale sky for interface. Painted in neutral daylight so it can be recoloured. *Style anchor.*
2. `forest-floor_summer_v1` (16:9): A strip of boreal forest floor seen from low eye level: green moss, blueberry shrubs with ripe indigo berries, lingonberry with red berries, fallen spruce needles, a moss-covered grey glacial boulder on the left, a fallen mossy log with two brown boletes on the right. The centre stays plain moss. *Style anchor.*
3. `birch_tree_summer_v1` (tall, isolated on a plain pale background): A young silver birch (Betula pendula), about 6 metres tall, seen whole from the side: white bark with black horizontal lenticels and black diamond marks under branch scars, rough dark bark only at the very base, branches arching upward with long thin twigs hanging down, a full oval crown of small triangular double-toothed bright green leaves. Even light, no cast shadow. *Style anchor.*
4. `tikka_black-woodpecker_v1` (square, isolated): A black woodpecker (Dryocopus martius) clinging upright to a pale birch trunk segment, facing the trunk: all-black plumage with a faint blue-black sheen, a bright red crown, a pale ivory dagger-shaped bill, a pale yellow eye, a stiff tail braced against the bark, grey feet gripping it. Friendly, curious expression, true bird anatomy (not a cartoon). *Style anchor.*
5. `spruce_bough_foreground_v1` (wide, isolated): A Norway spruce bough entering from the left edge, seen from close up and slightly below: a dark brown branch with drooping side twigs covered all round in short dark-green needles, two small hanging cones. Deep shade colours, for framing the edge of a scene. *Style anchor.*
