import { describe, expect, it } from 'vitest';
import { newSave } from '../src/core/progress';
import { decodeTransfer, encodeTransfer, qrSvg, readBackup, trimForTransfer } from '../src/app/transfer';

const played = () => {
  const s = newSave();
  s.co2LifetimeG = 123_456;
  s.seasons = 9;
  s.achievements = ['first'];
  s.growth = { roots: 2, leaves: 1, wood: 0 };
  for (let i = 0; i < 200; i++) {
    const day = `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
    s.daily[day] = { bestG: 1000 + i, tries: 1 };
    s.rings.push({ day, g: 1000 + i, heat: i % 7 === 0 });
  }
  return s;
};

describe('transfer code', () => {
  it('round-trips the progress and settings', async () => {
    const save = played();
    const code = await encodeTransfer({ save, lang: 'en', sound: false });
    expect(code).toMatch(/^K1[zj]\./);
    const back = await decodeTransfer(code);
    expect(back).not.toBeNull();
    expect(back!.save.co2LifetimeG).toBe(123_456);
    expect(back!.save.seasons).toBe(9);
    expect(back!.save.nick).toBe(save.nick);
    expect(back!.save.growth).toEqual(save.growth);
    expect(back!.lang).toBe('en');
    expect(back!.sound).toBe(false);
  });

  it('stays short enough for a QR code after a long year of play', async () => {
    const code = await encodeTransfer({ save: played() });
    expect(code.length).toBeLessThan(2000);
  });

  it('keeps only recent daily scores and rings', () => {
    const t = trimForTransfer(played());
    expect(Object.keys(t.daily)).toHaveLength(60);
    expect(t.rings).toHaveLength(40);
  });

  it('rejects anything that is not a valid code', async () => {
    for (const bad of ['', 'hello', 'K1z.', 'K1z.!!!!!!!!!!', 'K2z.AAAAAAAAAAAA', 'K1z.AAAAAAAAAAAA', 'K1j.' + btoa('{"x":1}').replace(/=+$/, '')]) {
      expect(await decodeTransfer(bad)).toBeNull();
    }
  });

  it('cleans a tampered save like one loaded from storage', async () => {
    const json = JSON.stringify({ save: { co2LifetimeG: 'lots', seasons: -3 }, lang: 'xx', sound: 'yes' });
    const code = 'K1j.' + btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const back = await decodeTransfer(code);
    expect(back).not.toBeNull();
    expect(typeof back!.save.co2LifetimeG).toBe('number');
    expect(back!.lang).toBeUndefined();
    expect(back!.sound).toBeUndefined();
  });

  it('draws a labelled QR code', () => {
    const svg = qrSvg('https://example.org/#t-K1z.abc', 'QR "code"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="QR code"');
    expect(svg).toContain('<svg aria-hidden="true"');
  });
});

describe('backup file', () => {
  const file = (data: unknown, extra: object = {}) => JSON.stringify({ app: 'kasva', v: 1, at: '2026-10-01', data, ...extra });

  it('accepts a Kasva! backup', () => {
    const data = { 'kasva-save': JSON.stringify(newSave()), 'kasva-lang': '"fi"' };
    expect(readBackup(file(data))).toEqual(data);
  });

  it('rejects other files and foreign keys', () => {
    expect(readBackup('not json')).toBeNull();
    expect(readBackup(file({}, { app: 'other' }))).toBeNull();
    expect(readBackup(file({}, { v: 2 }))).toBeNull();
    expect(readBackup(file({ 'other-app': '1' }))).toBeNull();
    expect(readBackup(file({ 'kasva-dbg': '1' }))).toBeNull();
    expect(readBackup(file({ 'kasva-save': 'not json' }))).toBeNull();
    expect(readBackup(file({ 'kasva-save': 5 }))).toBeNull();
  });
});
