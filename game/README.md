# Kasva! · grey box (Phase 0)

The 90-second season with flat shapes only. Its one job is to answer: **is holding to breathe fun, and do children discover that resting at night and in heatwaves wins?**

## Play

```sh
npm install
npm run dev            # open the printed URL on a phone on the same Wi-Fi
```

Hold anywhere (or the space bar) to open the stomata. P pauses, M mutes. A link ending in `#s-<seed>` replays the exact same weather.

## How it's built

- `src/core/`: the deterministic game. `season.ts` is a pure fixed-step (60 Hz) simulation. The same seed and the same inputs always give the same score, which later makes challenge links and server-side score checks possible. `weather.ts` plans six days per seed, and `dailySeed()` follows the Finnish date.
- `src/greybox/`: a throwaway canvas renderer, input handling, a tiny Web Audio synth, hints, the results screen, and a local test log.
- `tests/season.test.ts`: determinism, the rules (no catching in the dark, heat drains water faster, score = caught − breathed out) and balance. **The science-smart bot must beat holding all the time by more than 25%.**

```sh
npm test               # vitest
npm run balance        # average score of never / always / sunChaser / smart / expert bots
npm run bundle:single  # dist/kasva-greybox.html, one self-contained file
```

Current balance (40 seeds): never 0 g · always 1,859 g · sunChaser 2,005 g · smart 2,862 g · expert 2,973 g.

## Playtest checklist (3 children, about 10 minutes each)

1. Hand over the phone with the start screen open. Say only "try it".
2. Note: seconds until the first hold, whether they read the hints, and what they say out loud.
3. After the first season, ask: "Why did your tree wilt?" and "What happens at night?"
4. Count how many more seasons they play without being asked. The **Test log** on the start screen keeps every run on that device.

## Known grey-box limits

- No art, no progression, no PWA yet. Those are Phases 1–4.
- Weather icons are emoji, so they depend on the device's emoji font.
- Finnish text needs a native-speaker check.
