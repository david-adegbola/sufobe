import { beforeEach, describe, expect, it } from 'vitest';
import { FrameBudget } from '../src/app/scene/budget';

/** Feed frames of a fixed length for some seconds; return how often the resolution dropped. */
const run = (b: FrameBudget, frameMs: number, secs: number, t0 = { t: 0 }) => {
  let drops = 0;
  for (let i = 0; i < (secs * 1000) / frameMs; i++) { t0.t += frameMs; if (b.tick(t0.t)) drops++; }
  return drops;
};

describe('frame budget', () => {
  beforeEach(() => { (globalThis as { window?: unknown }).window = { devicePixelRatio: 2 }; });

  it('keeps full resolution while frames are fast, or at a 30 fps cap', () => {
    const b = new FrameBudget();
    expect(run(b, 1000 / 60, 20)).toBe(0);
    expect(run(b, 1000 / 30, 20)).toBe(0);
    expect(b.dpr()).toBe(2);
  });

  it('ignores one slow moment', () => {
    const b = new FrameBudget();
    const clock = { t: 0 };
    run(b, 16, 1, clock);
    run(b, 100, 2.5, clock);
    run(b, 16, 10, clock);
    expect(b.dpr()).toBe(2);
  });

  it('steps down one level per four slow seconds, never below 0.75', () => {
    const b = new FrameBudget();
    const clock = { t: 0 };
    expect(run(b, 60, 4.1, clock)).toBe(1);
    expect(b.dpr()).toBe(1.5);
    run(b, 60, 60, clock);
    expect(b.dpr()).toBe(0.75);
  });

  it('starts from the screen\'s own density when it is lower', () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const b = new FrameBudget();
    expect(b.dpr()).toBe(1);
    run(b, 60, 4.1);
    expect(b.dpr()).toBe(0.75);
  });
});
