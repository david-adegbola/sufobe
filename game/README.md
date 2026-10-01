# Kasva!

A one-thumb forest game for grades 4–6. You are a silver birch: hold to open your stomata and catch CO₂, save water through heatwaves and nights, and turn carbon into wood.

**Status: Phase 1.** The 90-second season has real art and sound. The forest is the menu, and every season ends with a tree-ring results screen. Progression, sharing and PWA come in Phases 2–4. See `docs/art-bible.md` for the style, the science colour code, Tikka's character sheet and prompts for painted layers.

## Play

```sh
npm install
npm run dev            # open the printed URL on a phone on the same Wi-Fi
```

Hold anywhere (or the space bar) to open the stomata. P pauses, M mutes. A link ending in `#s-<seed>` replays the exact same weather.

## How it's built

- `src/core/`: the deterministic game. `season.ts` is a pure fixed-step (60 Hz) simulation. The same seed and the same inputs always give the same score, which later makes challenge links and server-side score checks possible. `weather.ts` plans six days per seed, and `dailySeed()` follows the Finnish date.
- `src/app/`: the game shell (`main.ts`), the renderer (`render.ts`), synthesised sound (`audio.ts`), and text in FI/EN (`text.ts`).
- `src/app/scene/`: the code-drawn world: palette and moods, landscape layers, silver birch, Tikka, weather icons, HUD.
- `tests/season.test.ts`: determinism, the rules (no catching in the dark, heat drains water faster, score = caught − breathed out) and balance. **The science-smart bot must beat holding all the time by more than 25%.**

```sh
npm test               # vitest
npm run balance        # average score of never / always / sunChaser / smart / expert bots
npm run bundle:single  # dist/kasva.html, one self-contained file (about 60 KB)
```

Current balance (40 seeds): never 0 g · always 1,859 g · sunChaser 2,005 g · smart 2,862 g · expert 2,973 g.

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
