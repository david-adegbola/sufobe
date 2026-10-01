# Mistä puu tulee? · Where does a tree come from?

A guided-discovery web simulation for Finnish grades 4–6. Children watch carbon dioxide travel from the air into a birch, become sugar and wood, and go back out again. Then they weigh the result, like van Helmont did.

It targets one well-documented misconception: that a tree's mass comes from the soil. Success means more children saying "mostly from the air" after one lesson than before, and still saying it weeks later.

This is **Stage 0** of the plan in the project assessment: a course prototype and the subject of the 3–5 minute assignment video.

## Run it

Open `index.html` in any browser. There is no build step and no server, and it works offline from `file://`. It is made for school Chromebooks and iPads.

To serve it locally (for example to test on a tablet on the same network):

```sh
npx http-server -c-1 .
```

## The lesson flow (about 30–45 minutes)

1. **Ennusta / Predict.** Van Helmont's story, then: "Where does most of the tree's weight come from: soil, water, air or sunlight?"
2. **Kokeile / Explore.** Watch CO₂ (O=C=O) enter the leaves by day and leave by night. Dry the soil and watch the stomata close and CO₂ bounce off. Fast-forward ten years and read the tree rings. Sliders for light, water and CO₂.
3. **Punnitse / Weigh.** The tree's dry mass against the soil's, and where every kilogram came from (about 93 % air, 6 % water, 1 % soil, 0 % sunlight).
4. **Selitä / Explain.** Why did the tree grow less in a drought? Why does carbon leave at night? Then complete the sentence. Every wrong answer gets an explanatory hint, never just a red cross.
5. **Mitä sitten? / What next?** Leaves rot, wood becomes a chair or paper, or is burned. A chart shows how long the carbon stays stored.
6. **Kysy uudelleen / Ask again.** The same question as step 1, with before and after side by side, and a prompt to explain what changed.

The **Opettajalle / For teachers** panel at the bottom counts before and after answers on that device. It stores no names, and only in the browser's local storage.

## Design rules (from the assessment)

- **Prediction and explanation are the core mechanic**, not free play. The interface itself guides children, PhET-style ("implicit scaffolding").
- **No single score.** Several indicators, never a verdict.
- **Accurate mechanisms, simplified quantities.** Mass comes from CO₂; drought works through stomata; trees breathe day and night; matter is conserved. The carbon bookkeeping on screen always balances.
- **Web-first, one lesson long, no accounts, no AI chat for children.**

## Project structure

```
index.html          page shell
css/style.css       layout and themes (light/dark)
js/model.js         the tree carbon model (no DOM; also runs in Node)
js/scene.js         canvas drawing and the moving CO₂ / sugar dots
js/app.js           the six-step guided flow
js/i18n.js          Finnish and English text
tests/              model tests (node --test)
tools/calibrate.js  prints 10-year growth under several scenarios
docs/MODEL.md       every model rule, parameter and simplification
docs/video-script.md  draft narration for the assignment video
```

## Develop

```sh
node --test tests/*.test.js    # conservation, mass budget, stress responses
node tools/calibrate.js 10     # growth under normal / shade / dry / CO₂ scenarios
```

If you change a model parameter, run both and update `docs/MODEL.md`.

## Before it goes in front of children

- [ ] **Native-speaker review of the Finnish text** (`js/i18n.js`). It was drafted carefully but not by a native speaker.
- [ ] Ask a forest scientist to check `docs/MODEL.md`. A UEF or Luke contact would do.
- [ ] Try it on the school's actual devices.
- [ ] Run think-aloud sessions PhET-style with 3–4 children, and note where they get stuck.
- [ ] Get guardian consent for any recording.

## Next (Stage 1 ideas, not built)

- A side-by-side experiment mode (two identical seedlings: shade versus sun)
- Pine and spruce, and a small stand with shading between trees
- Swedish text
- A one-page teacher guide aligned with OPS 2014 ympäristöoppi (photosynthesis, cycles of matter, climate change)
- A paper pre/post probe for a delayed post-test
