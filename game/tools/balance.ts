// Print how different play styles score across many seeds.
// Usage: npm run balance [-- seeds]
import { always, makeExpert, makeSmart, never, sunChaser, type Bot } from '../src/core/bots';
import { simulate } from '../src/core/season';

const n = Number(process.argv[2]) || 40;
const bots: Record<string, () => Bot> = { never: () => never, always: () => always, sunChaser: () => sunChaser, smart: makeSmart, expert: makeExpert };

for (const [name, make] of Object.entries(bots)) {
  let stored = 0, caught = 0, resp = 0, wilts = 0, combo = 0, min = Infinity, max = 0;
  for (let i = 0; i < n; i++) {
    const r = simulate('seed-' + i, make());
    stored += r.storedG; caught += r.caughtG; resp += r.respiredG; wilts += r.wilts; combo += r.bestCombo;
    min = Math.min(min, r.storedG); max = Math.max(max, r.storedG);
  }
  const f = (x: number) => Math.round(x / n);
  console.log(`${name.padEnd(10)} stored ${String(f(stored)).padStart(5)} g  (min ${min}, max ${max})  caught ${f(caught)}  breathed ${f(resp)}  wilts ${(wilts / n).toFixed(1)}  bestCombo ${(combo / n).toFixed(1)}`);
}
