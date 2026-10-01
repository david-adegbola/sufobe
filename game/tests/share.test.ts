import { describe, expect, it } from 'vitest';
import { challengePlayed, challengeSent, migrate, newSave } from '../src/core/progress';
import { decodeChallenge, encodeChallenge, nickParts, randomNick } from '../src/core/share';

describe('nicknames', () => {
  it('are two hex digits that map to an adjective and an animal', () => {
    for (let i = 0; i < 50; i++) expect(nickParts(randomNick())).not.toBeNull();
    expect(nickParts('3a')).toEqual([3, 10]);
    expect(nickParts('zz')).toBeNull();
  });
  it('old saves get a nickname', () => {
    expect(nickParts(migrate({}).nick)).not.toBeNull();
    expect(migrate({ nick: '<b>' }).nick).toMatch(/^[0-9a-f]{2}$/);
  });
});

describe('challenge links', () => {
  it('round-trip, including seeds with dashes', () => {
    const c = { nick: '3a', scoreG: 2840, seed: 'd2026-10-02' };
    const h = encodeChallenge(c);
    expect(h).toBe('c-3a-2840-d2026-10-02');
    expect(decodeChallenge('#' + h)).toEqual(c);
  });
  it('only use characters that survive chat apps and the artifact viewer', () => {
    expect(encodeChallenge({ nick: 'ff', scoreG: 99999, seed: 'rabc12' })).toMatch(/^[A-Za-z0-9._~-]+$/);
  });
  it('reject anything odd', () => {
    for (const bad of ['#c-3a-2840-', '#c-3a-x-d2026', '#c-zz-10-d1', '#c-3a-99999-d1', '#c-3a-10-<script>', '#s-d2026-10-02', '']) {
      expect(decodeChallenge(bad)).toBeNull();
    }
  });
  it('clamp scores into range', () => {
    expect(encodeChallenge({ nick: '00', scoreG: -5, seed: 'd1' })).toBe('c-00-0-d1');
  });
});

describe('challenge badges', () => {
  it('sending one earns Challenger once', () => {
    const a = challengeSent(newSave(), 'd2026-10-02', 2000, 'now');
    expect(a.newAchievements).toEqual(['challenger']);
    const b = challengeSent(a.save, 'd2026-10-02', 2100, 'now');
    expect(b.newAchievements).toEqual([]);
    expect(b.save.challenges.sent).toHaveLength(1);
  });
  it('beating a challenge earns Overtake; losing does not', () => {
    const from = { nick: '3a', seed: 'd2026-10-02', scoreG: 2500 };
    const lose = challengePlayed(newSave(), from, 2400, 'now');
    expect(lose.won).toBe(false);
    expect(lose.newAchievements).toEqual([]);
    const win = challengePlayed(lose.save, from, 2600, 'now');
    expect(win.won).toBe(true);
    expect(win.newAchievements).toEqual(['overtake']);
    expect(win.save.challenges.received).toHaveLength(1);
    expect(win.save.challenges.received[0].myBestG).toBe(2600);
  });
  it('a worse retry keeps your best', () => {
    const from = { nick: '3a', seed: 'd1', scoreG: 2500 };
    const a = challengePlayed(newSave(), from, 2600, 'now');
    const b = challengePlayed(a.save, from, 1000, 'now');
    expect(b.won).toBe(true);
    expect(b.save.challenges.received[0].myBestG).toBe(2600);
  });
});
