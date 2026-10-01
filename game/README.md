# Kasva!

A one-thumb forest game for grades 4–6. You are a silver birch: hold to open your stomata and catch CO₂, save water through heatwaves and nights, and turn carbon into wood.

**Status: Phase 2.** The season has real art and sound, and now real progression:

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

PWA and offline play come in Phase 4. See `docs/art-bible.md` for the style, the science colour code, Tikka's character sheet and prompts for painted layers.

## Play

```sh
npm install
npm run dev            # open the printed URL on a phone on the same Wi-Fi
```

Hold anywhere (or the space bar) to open the stomata. P pauses, M mutes. A link ending in `#s-<seed>` replays the exact same weather.

## How it's built

- `src/core/`: the deterministic game. `season.ts` is a pure fixed-step (60 Hz) simulation. The same seed and the same inputs always give the same score, which later makes challenge links and server-side score checks possible. `weather.ts` plans six days per seed, and `dailySeed()` follows the Finnish date.
- `src/app/`: the game shell (`main.ts`), the renderer (`render.ts`), synthesised sound (`audio.ts`), and text in FI/EN (`text.ts`).
- `src/core/forest/`: the Metsäni forest model (F0, no UI yet): climate, soils, species, a stand of trees that compete for light and water, carbon stores that always add up, thinning and harvest, and wood products. See `docs/forest-model.md`, and `tests/forest/` for the conservation, calibration and determinism tests.
- `src/app/forest/`: the Metsäni screens (F1): setup (place, soil, trees, spacing), the forest view drawn side-on with seasons and a soil cutaway, the tree card, and the five results. Saved under `kasva-forest`.
- `docs/metsani-teacher-guide.md` (a one-page lesson guide) and `docs/metsani-review-packet.md` (what the forest scientist, teacher and ecologist should check, and the classroom playtest protocol).
- `src/app/scene/`: the code-drawn world: palette and moods, landscape layers, silver birch, Tikka, weather icons, HUD.
- `tests/season.test.ts`: determinism, the rules (no catching in the dark, heat drains water faster, score = caught − breathed out) and balance. **The science-smart bot must beat holding all the time by more than 25%.**

```sh
npm test               # vitest
npm run balance        # average score of never / always / sunChaser / smart / expert bots
npm run forest         # Metsäni: print 80–100-year forest runs
npm run bundle:single  # dist/kasva.html, one self-contained file (about 100 KB)
# SHARE_URL=https://... npm run bundle:single  # challenge links point at the published page
```

Current balance (40 seeds): never 0 g · always 1,859 g · sunChaser 2,005 g · smart 2,862 g · expert 2,973 g.

Growth balance (`tests/progress.test.ts`): each choice at full level gives a careful player +7–10%, a fully grown tree +25%, and holding all the time never reaches 75% of smart play. Two first designs failed this test and were changed:
- Bigger roots made holding all the time nearly optimal.
- A wider catch zone made careful play worse. Leaves now give more CO₂ per catch instead, which is also closer to how leaf area works.

## Playtest checklist (3 children, about 10 minutes each)

1. Hand over the phone with the start screen open. Say only "try it".
2. Note: seconds until the first hold, whether they read the hints, and what they say out loud.
3. After the first season, ask: "Why did your tree wilt?" and "What happens at night?"
4. Count how many more seasons they play without being asked. The **Test log** on the start screen keeps every run on that device.

For screenshots, open the page with `#dbg`. Then `window.__kasva.skip(ticks, hold)` jumps ahead in the current season.

## Known limits

- No progression, sharing or PWA yet (Phases 2–4).
- Fonts load from Google Fonts. Offline play will bundle them in Phase 4.
- Finnish text needs a native-speaker check.
