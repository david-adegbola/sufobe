/** The class question only ever stores answer counts, and moves each device from before → after → done. */
import { describe, expect, it } from 'vitest';
import { CORRECT, QUIZ, record } from '../src/app/forest/quiz';

describe('class question', () => {
  it('both languages ask the same questions, each with an "I don’t know" option last', () => {
    expect(QUIZ.fi.length).toBe(CORRECT.length);
    expect(QUIZ.en.length).toBe(CORRECT.length);
    QUIZ.fi.forEach((q, i) => expect(q.options.length).toBe(QUIZ.en[i].options.length));
    expect(QUIZ.fi.every(q => q.options.at(-1) === 'En tiedä')).toBe(true);
  });

  it('records counts only, and moves the device to the next stage', () => {
    const empty = { before: CORRECT.map(() => [0, 0, 0, 0, 0]), after: CORRECT.map(() => [0, 0, 0, 0, 0]), stage: 'before' as const };
    const a = record(empty, 'before', [1, 0, 4, 0]);
    expect(a.stage).toBe('after');
    expect(a.before[0]).toEqual([0, 1, 0, 0, 0]);
    expect(a.before[2]).toEqual([0, 0, 0, 0, 1]);
    const b = record(a, 'after', [1, 1, 1, 0]);
    expect(b.stage).toBe('done');
    // nothing but counts and the stage: no names, times or free text
    expect(Object.keys(b).sort()).toEqual(['after', 'before', 'stage']);
    expect(b.after.flat().every(n => Number.isInteger(n))).toBe(true);
    expect(empty.stage).toBe('before'); // the original tally is not changed
  });
});
