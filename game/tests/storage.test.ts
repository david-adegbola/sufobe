import { beforeEach, describe, expect, it } from 'vitest';
import { WORLD_KEY, forgetCache, getPart, removePart, setPart } from '../src/app/storage';

/** A small stand-in for the browser's localStorage. */
class Mem {
  m = new Map<string, string>();
  full = false;
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.full) throw new Error('QuotaExceededError'); this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
let mem: Mem;

beforeEach(() => {
  mem = new Mem();
  (globalThis as { localStorage?: unknown }).localStorage = mem;
  forgetCache();
});

describe('the world save', () => {
  it('keeps every part under one key', () => {
    setPart('lang', 'en');
    setPart('save', { seasons: 3 });
    expect([...mem.m.keys()]).toEqual([WORLD_KEY]);
    forgetCache();
    expect(getPart('lang', 'fi')).toBe('en');
    expect(getPart<{ seasons: number }>('save', { seasons: 0 }).seasons).toBe(3);
    removePart('lang');
    expect(getPart('lang', 'fi')).toBe('fi');
  });

  it('moves the Phase 1–4 keys in once, then removes them', () => {
    mem.setItem('kasva-save', JSON.stringify({ seasons: 7 }));
    mem.setItem('kasva-lang', '"en"');
    mem.setItem('kasva-quiz-on', 'true');
    mem.setItem('kasva-forest', JSON.stringify({ v: 1, past: [] }));
    mem.setItem('kasva-dbg', '1');
    expect(getPart<{ seasons: number }>('save', { seasons: 0 }).seasons).toBe(7);
    expect(getPart('lang', 'fi')).toBe('en');
    expect(getPart('quiz-on', false)).toBe(true);
    expect([...mem.m.keys()].sort()).toEqual(['kasva-dbg', WORLD_KEY]);
  });

  it('keeps the old keys if the new save cannot be written', () => {
    mem.setItem('kasva-save', JSON.stringify({ seasons: 7 }));
    mem.full = true;
    expect(getPart<{ seasons: number }>('save', { seasons: 0 }).seasons).toBe(7);
    expect(mem.getItem('kasva-save')).not.toBeNull();
    expect(mem.getItem(WORLD_KEY)).toBeNull();
  });

  it('works without storage at all', () => {
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    forgetCache();
    expect(getPart('lang', 'fi')).toBe('fi');
    expect(setPart('lang', 'en')).toBe(false);
  });
});
