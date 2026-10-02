# Kasva!

A one-thumb forest game for grades 4–6. You are a silver birch: hold to open your stomata and catch CO₂, save water through heatwaves and nights, and turn carbon into wood.

**2.5D in Kasva! (increment 6).** The birch's summer now has depth too:
- **Parallax:** the hills, groves and floor move at their own rates as the menu slides the tree aside, and drift slowly around it while you play. The tree and everything you catch stay put.
- **Light:** haze lies along the far hills, and the birch casts a soft shadow away from the sun.
- **Reduced motion:** turns the drift off.

**2.5D painted art: ready for paintings (increment 5).** The forest view can show painted layers (distant hills or Lapland fells, the forest edge, the grass in front) in place of its drawn ones, one per season. Put `<slot>-<season>.webp` files in `public/art/` and build; any missing painting keeps its drawn layer. The 16 prompts, file specs and science checklist are in `docs/art-prompts.md`; no paintings are included yet.

**2.5D level of detail (increment 4).** The forest draws faster, mostly on phones:
- **Simpler shapes where nobody looks closely:** the copies of the forest at the sides, tiny far trees and the back of the stand are drawn from fewer shapes with the same silhouette and colours. Your own trees up front, and any tree you choose, keep full detail.
- **Phones:** fewer foreground grass blades.
- **Measured:** about 37–39 % faster on a slow phone and 22–24 % faster on desktop, in a test browser (`docs/two-point-five-d.md`).

**2.5D one world (increment 3).** The forest, the mills and the village are now one place:
- **The road:** a forest road leaves your stand through a clearing to the mills (log yard, sawmill, pulp mill, biorefinery) and on to the village, whose windows light up as its needs are met.
- **Travel:** after a harvest the loaded truck drives to the mills and the camera follows; the Village and products buttons, and giving your birch, travel the same way. Closing the screen brings you back to the forest. Escape or any button skips the trip.
- **Explore:** drag along the road and tap the mills or the village to go in.
- **Map:** opens by zooming out from your forest to the landscape.
- **Reduced motion:** no glide or zoom; screens open straight away.

**2.5D game feel (increment 2).** Actions now feel like they happen in the world:
- **Planting:** seedlings pop up out of the soil one after another, with a puff of earth and a soft sound.
- **Harvest:** the felled trees fall, logs pile up and a timber truck fetches them before the mills open. Escape or any button skips the show. Giving your birch plays the same scene before the village.
- **Marking and keeping:** a ring of paint and a note.
- **Village:** a short picture strip shows what you delivered, or what an old thing became (recycled, reused, repaired or burned), with a sound.
- **Reduced motion** turns all of it off.

**2.5D forest view (increment 1 of the 2.5D plan, `docs/two-point-five-d.md`).** The forest now sits in a deep landscape:
- **Depth layers:** drifting clouds, two mountain ridges, a far and a mid forest and horizon haze behind the stand, with grass, ferns, stones and mushrooms in front. Each layer moves with the camera at its own rate (parallax).
- **Camera:** drag to move through the forest; zoom with two fingers, the wheel, the − / + buttons or keys; ⌂ or 0 for the whole forest. Choosing a tree eases the camera to it, and the other trees step back a little.
- **Life:** trees cast shadows, which are long in winter. Crowns sway in the wind, young trees most. Far trees fade into the haze. Autumn mornings are foggy, wet summers and late autumn bring rain, and summer sunbeams fall through the canopy. Old spruces and pines carry beard lichen, and mature trees have moss at their foot.
- **The simulation drives the look** through `app/forest/visual.ts`: tree stage, light, fog, rain and wind.
- **Fixed:** tapping a tree in a dense stand now picks the trunk closest to the finger, not a wide crown in front.

**Phase 10 (the landscape: many forests, one map).** Your forest now has neighbours:
- **The map** (bottom bar, *Map*) shows your forest as one stand among ten neighbouring forests, with a lake, a road and the village. Every neighbour is a full forest from the same model, grown to its own age, and lives as many years as yours.
- **Zoning.** Choose for each neighbouring forest: *managed* (an owner thins it, harvests it when mature with retention trees, and replants) or *protected* (left to grow old; fallen trees stay).
- **Connected habitat.** The flying squirrel needs two or more neighbouring spruce forests with aspens; the capercaillie needs at least three mature pine forests; the Siberian jay needs three neighbouring old forests, in the east or north. The road and the lake cut connections. Dots on the map show where they live.
- **The sandbox** (setup screen, *Try the sandbox*): a forest of its own where you can bring a dry summer, a storm or bark beetles, plant freely (40 a year), and Tikka asks nothing. It never touches your own forest.
- **Not in this phase: the WebGL painted art upgrade.** It needs the painted illustration set (the art bible and prompts are ready in `docs/art-bible.md`), which is a decision for the project owner; the code-drawn art carries the landscape for now.

**Phase 9 (the village: closing the loop).** The forest's wood now goes somewhere you can see:
- **The village** (bottom bar, *Village*) has six places with needs: a new house (beams), the café (tables), the school (notebooks), the shop (cardboard boxes), the sports club (shirts) and the sauna (heat). Give them items your forest has made. Each met need makes way for a bigger one.
- **Village things keep their carbon** while they are in use. When one wears out, you choose: repair it, reuse it (a house beam becomes a café table, an old table a particleboard shelf), recycle it (paper and cardboard become new cardboard), or burn it to heat the sauna. Nobody deciding means the village burns it after a few years.
- **The Carbon Thread** follows a village thing back to its tree: the years the tree caught carbon from the air, the summers you played as that tree (gold rings), the cut, the mill, the village, and where the carbon is now. For any felled tree it shows how much is in the village, in products elsewhere, left in the forest, and back in the air.
- **Give your birch to the village.** Once your birch's trunk is thick enough for the mill, its card offers this. It is cut, the nearest young birch takes its place, and the summers you played go with its wood.
- Fixed: *+10 years* no longer gets stuck while one of Tikka's hints is showing.

**Phase 8 (experiments with an answer).** Metsäni has 12 question cards:
- Each card has two forests, A and B, that differ in one thing (place, soil, trees, planting density or one choice) and get the same weather.
- The child guesses first, then watches both forests grow side by side and sees the result and why. *Try other weather* repeats the experiment with a new seed.
- Cards are data (`src/core/forest/experiments.ts`). The answer comes from the model, and `tests/forest/experiments.test.ts` checks it holds for nine seeds per card.
- Teacher links such as `#q-thinning` open a card directly (list in `docs/metsani-teacher-guide.md`). The experiments never touch the child's own forest.

**Phase 7 (forestry by hand).** In Metsäni you now work the forest yourself:
- **Tools:** Look, Mark, Keep and Plant. Tap trees to mark them for cutting (orange stripe) or to keep them (teal band), then press *Cut marked*. Plant up to 8 seedlings a year where you tap, or let *Plant one* find the biggest gap.
- **Light lens:** a dot on each tree shows how well it is doing (green, yellow, red), so crowding is visible before you thin.
- **Tikka's hints no longer stop the year.** Only regeneration after a clearcut must be answered; other questions are hints you can open, act on with the Mark tool, or leave. A hint fades after a year.
- **Animals behave:** the moose browses, the black woodpecker drums, the spotted woodpecker hops and the treecreeper climbs (still when reduced motion is on).

**Phase 6 (one world).** The Kasva! birch is now the first tree of your forest:
- After the ten story summers, the home screen's big button plays your birch's summer. Each summer is one year in your forest, and how you play nudges that year's ring.
- Your birch wears a yellow ribbon in the forest and is never cut. If it dies, its line passes to the nearest birch.
- The Forest Atlas (badges, trees, animals, events in the forest, products) replaces the badge cards.

Still open from Phase 5: the expert review of the model, a native-speaker check of the Finnish, and tests on real tablets (`docs/metsani-review-packet.md`).

**Phase 2, progression:** the season has real art and sound, and:

- **10 story seasons**, each introducing one idea, with Tikka's intro line on the home screen
- **XP = lifetime kg of CO₂ stored**, across 7 ranks named after real tree stages (Siemen → Itu → Taimi → Vesa → Riukupuu → Tukkipuu → Aarnipuu)
- **A level-up moment**, and the lake landscape gains a sailboat, an elk, young birches and a capercaillie as you rank up
- **A growth choice after each season:** Roots (more water), Leaves (more CO₂ per catch, more water lost) or Trunk (taller, more light). Every level also adds respiration, because bigger trees breathe out more.
- **A gentle daily streak** with one snow cover per week
- **10 badges with fact cards.** The 2 social ones arrive with challenge links in Phase 3.
- **Today's weather** uses a standard birch for everyone, so comparisons are fair

Progress is saved in this browser only (`localStorage`, key `kasva-save`).

**Phase 3, sharing (no accounts, no server):**

- **Generated nicknames** from Finnish forest animals ("Utelias Ilves"), rerollable. They are stored as two hex digits, so they show in each player's language and contain no free text.
- **Challenge links:** `#c-<nick>-<grams>-<seed>` replays the exact same Today's weather on the standard birch. The challenge card shows who to beat, and the results say who won. Challenges only use Today's weather, so everyone has the same tree.
- **A result poster** (1080 × 1350) in the Forest Landscape style, drawn with the game's own scene code. Shared through the system share sheet where the browser allows it, otherwise press and hold (or right-click) to save.
- **Kisat (Contests) screen:** your nickname, today's best, and challenges received and sent.
- **Badges:** Challenger (send a challenge) and Overtake (beat one).

Scores in links are not verified, so a determined player could edit one. The deterministic core makes server-side replay checks possible later.

Kasva! installs as an app and plays offline (see *Publish*). See `docs/art-bible.md` for the style, the science colour code, Tikka's character sheet and prompts for painted layers.

## Play

```sh
npm install
npm run dev            # open the printed URL on a phone on the same Wi-Fi
```

Hold anywhere (or the space bar) to open the stomata. P pauses, M mutes. A link ending in `#s-<seed>` replays the exact same weather.

## How it's built

- `src/core/`: the deterministic game. `season.ts` is a pure fixed-step (60 Hz) simulation. The same seed and the same inputs always give the same score, which later makes challenge links and server-side score checks possible. `weather.ts` plans six days per seed, and `dailySeed()` follows the Finnish date.
- `src/app/`: the Kasva! shell, split by screen in Phase 5:
  - `main.ts`: start-up, the menu forest, playing a season, input and the frame loop
  - `state.ts`: the shared `app` state, the renderer and sound
  - `screens.ts`, `results.ts`, `share.ts`, `kisat.ts`, `about.ts`: one module per group of screens
  - `storage.ts`: everything saved on the device, in one key (`kasva-world`), moved in from the older keys on first load
  - `format.ts`: numbers and CO₂ amounts in the player's language
  - `atlas.ts`: the Forest Atlas (what has been found, and the Atlas screen)
  - `render.ts`, `audio.ts`, `text.ts`: the renderer, synthesised sound, and text in FI/EN
- `src/core/forest/`: the Metsäni forest model: climate, soils, species, a stand of trees that compete for light and water, carbon stores that always add up, thinning and harvest, and wood products. See `docs/forest-model.md`, and `tests/forest/` for the conservation, calibration and determinism tests.
- `src/app/forest/`: the Metsäni screens: setup (place, soil, trees, spacing), the forest view drawn side-on with seasons and a soil cutaway, the tree card, the five results, and decisions (`metsani.ts`); sorting, mills and the product shelf (`factory.ts`). Your birch lives in `core/forest/mybirch.ts`. Saved as the `forest` part of the world save; old years are compacted before saving (`core/forest/compact.ts`).
- `src/app/transfer.ts`: the transfer code, its QR code and the backup file (About screen). `src/app/pwa.ts`: offline copy, install offer and update notice.
- `docs/metsani-teacher-guide.md` (a one-page lesson guide) and `docs/metsani-review-packet.md` (what the forest scientist, teacher and ecologist should check, and the classroom playtest protocol).
- `src/app/scene/`: the code-drawn world: palette and moods, landscape layers, silver birch, Tikka, weather icons, HUD.
- `tests/season.test.ts`: determinism, the rules (no catching in the dark, heat drains water faster, score = caught − breathed out) and balance. **The science-smart bot must beat holding all the time by more than 25%.**

```sh
npm test               # vitest
npm run balance        # average score of never / always / sunChaser / smart / expert bots
npm run forest         # Metsäni: print 80–100-year forest runs
npm run rotation-check # thinning response and 300-year production of each way of managing (for the reviewers)
npm run bundle:single  # dist/kasva.html, one self-contained file (about 490 KB)
# SHARE_URL=https://... npm run bundle:single  # challenge links point at the published page
```

Current balance (40 seeds): never 0 g · always 1,859 g · sunChaser 2,005 g · smart 2,862 g · expert 2,973 g.

Growth balance (`tests/progress.test.ts`): each choice at full level gives a careful player +7–10%, a fully grown tree +25%, and holding all the time never reaches 75% of smart play. Two first designs failed this test and were changed:
- Bigger roots made holding all the time nearly optimal.
- A wider catch zone made careful play worse. Leaves now give more CO₂ per catch instead, which is also closer to how leaf area works.

## Publish

There are two builds.

**Offline web app** (for a school's own website, GitHub Pages, or any static host):

```sh
npm run build          # writes dist/: index.html, assets/, icons/, manifest.webmanifest, sw.js
```

The public site is published by `.github/workflows/pages.yml`: every push to `main` runs all checks, builds the game, adds the classroom simulation under `mista-puu-tulee/`, and deploys to GitHub Pages (`https://david-adegbola.github.io/sufobe/`). To use another host instead, copy everything in `dist/` there, in any folder (paths are relative). It must be served over HTTPS (or `localhost`), or the browser will not start the service worker. On the first visit `sw.js` stores the whole game, about 500 KB, so it then plays without the internet. Each build gets a new cache name, so after you publish a new version, open copies show "A new version is ready – Update" on the home screen.

After the second finished season the home screen offers to install the game: Android and desktop Chrome or Edge show the browser's own install prompt, and iPad and iPhone get a short "Share → Add to Home Screen" card. "Not now" waits another 10 seasons.

**One-file page** (the claude.ai artifact): `npm run bundle:single` writes `dist/kasva.html` with fonts and script inside. It has no service worker or install offer. Run it after `npm run build`, which empties `dist/`.

Before publishing either one, fill in the operator and host in `src/app/legal.ts` (see `../docs/LEGAL.md`).

**Moving progress:** About → *Move your progress to another device* shows a code and a QR code. Scanning the QR with the other device's camera opens the game there and asks before bringing the progress over. *Save a backup* writes a small JSON file with everything, including a Metsäni forest.

## Playtest checklist (3 children, about 10 minutes each)

1. Hand over the phone with the start screen open. Say only "try it".
2. Note: seconds until the first hold, whether they read the hints, and what they say out loud.
3. After the first season, ask: "Why did your tree wilt?" and "What happens at night?"
4. Count how many more seasons they play without being asked. The **Test log** on the start screen keeps every run on that device.

For screenshots, open the page with `#dbg`. Then `window.__kasva.skip(ticks, hold)` jumps ahead in the current season.

## Known limits

- Install and offline play were tested in headless Chromium (desktop, and with an iPhone browser identity for the iOS card), not yet on a real iPad, iPhone or Android tablet.
- Slow devices: when frames stay below about 28 fps for four seconds, the game lowers its canvas resolution one step (2 → 1.5 → 1 → 0.75), see `src/app/scene/budget.ts`. In headless Chromium with software rendering on a 390 × 844 phone screen, the season settles at about 35 fps with the CPU slowed 4× (6 fps before this) and about 22 fps slowed 6×. The Metsäni view settles at about 50 fps slowed 4×. Real devices draw canvases on the GPU, so these are worst-case numbers.
- A transfer code carries Kasva! progress but not a Metsäni forest (too big for a QR code). Use the backup file for that.
- Safari on iPad and iPhone may clear a website's storage after several weeks without a visit. Installing to the Home Screen avoids that, and the backup file is a safety net.
- Finnish text needs a native-speaker check.
