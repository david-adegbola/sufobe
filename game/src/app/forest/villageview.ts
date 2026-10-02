/**
 * The village screen (Phase 9): what each place needs, giving the forest's
 * products, choosing what happens to worn-out things, and the Carbon Thread
 * that follows a thing's carbon from the summers its tree grew to now.
 */
import { num } from '../format';
import {
  BUILDINGS, CO2_PER_C, NEEDS, WAIT, deliver, decide, fatesFor, isGone, isWorn, needOf, objectThread, stock,
  treeThread, village, type BuildingId, type Fate, type Forest, type ItemId, type ThingId, type TreeSnap, type Village, type VillageObject,
} from '../../core/forest';
import type { Lang } from '../text';
import { drawRings } from './metsani';
import { itemIcon } from './mills';
import type { FOREST_TEXT } from './text';
import { VILLAGE_TEXT } from './villagetext';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/**
 * Years as the forest clock shows them. A year record's number (a played
 * summer, the year a tree began) is shown + 1; something the child did
 * between years (a cut, a delivery) happened in the year the clock shows.
 */
const Y = (year: number) => year + 1;
const A = (year: number) => year;
/** How many rows of things in use to list before "and N more". */
const SHOW = 10;

export interface VillageHost {
  lang(): Lang;
  t(): (typeof FOREST_TEXT)['fi'];
  forest(): Forest | undefined;
  setOverlay(on: boolean): void;
  persist(): void;
  /** results changed: redraw the forest's numbers */
  refresh(): void;
  announce(text: string): void;
  /** a small sound: things handed over, or made again from old material */
  chime(kind: 'give' | 'recycle'): void;
}

const FLAME = '<svg width="32" height="32" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4c3 9 13 13 13 25a13 13 0 0 1-26 0c0-7 4-10 6-15 2 5 4 6 5 6-2-6 0-11 2-16z" fill="#ff8a3d"/><path d="M24 22c2 5 7 7 7 13a7 7 0 0 1-14 0c0-4 3-6 4-9 1 2 2 3 3 3z" fill="#ffd166"/></svg>';
const ARROW = '<svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true"><path d="M2 9h18M14 3l7 6-7 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const SHELF_ICON = '<rect x="8" y="6" width="32" height="36" rx="2" fill="#d9b98a"/><path d="M8 18h32M8 30h32" stroke="#a8875a" stroke-width="3"/><circle cx="14" cy="12" r="1.2" fill="#a8875a"/><circle cx="30" cy="26" r="1.2" fill="#a8875a"/><circle cx="20" cy="36" r="1.2" fill="#a8875a"/>';
export function thingIcon(th: ThingId, size = 32): string {
  return th === 'shelf' ? `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${SHELF_ICON}</svg>` : itemIcon(th as ItemId, size);
}

export class VillageView {
  open_ = false;
  private thread: { obj: number } | { tree: number } | null = null;
  private msg = '';

  constructor(private h: VillageHost) {}

  private get t() { return VILLAGE_TEXT[this.h.lang()]; }

  open(msg = '') {
    if (!this.h.forest()) return;
    this.open_ = true;
    this.msg = msg;
    this.thread = null;
    this.h.setOverlay(true);
    $('m-village').hidden = false;
    this.render();
    requestAnimationFrame(() => $('m-village-title').focus());
    if (msg) this.h.announce(msg);
  }

  close() {
    this.open_ = false;
    this.thread = null;
    $('m-village').hidden = true;
    this.h.setOverlay(false);
    $('btn-m-village').focus();
  }

  escape() {
    if (this.thread) { this.thread = null; this.render(); $('m-village-title').focus(); return; }
    this.close();
  }

  render() {
    const f = this.h.forest();
    if (!f || !this.open_) return;
    const t = this.t;
    $('m-village-title').textContent = t.title;
    $('btn-m-village-close').setAttribute('aria-label', t.close);
    $('m-village-main').hidden = !!this.thread;
    $('m-thread').hidden = !this.thread;
    if (this.thread) this.renderThread(f);
    else this.renderMain(f);
  }

  // ---------- the village ----------

  private renderMain(f: Forest) {
    const t = this.t;
    const ft = this.h.t();
    const v = village(f);
    drawVillage($<HTMLCanvasElement>('m-village-canvas'), v);
    $('m-village-intro').textContent = t.intro;
    $('m-village-msg').textContent = this.msg;
    const snaps = new Map(f.felled.map(s => [s.id, s]));
    // trees whose summers the child played, newest first
    const mine = f.felled.filter(s => s.played?.length).slice(-4).reverse();
    $('m-village-mine').innerHTML = mine.length
      ? `<span class="note" style="width:100%">${t.mineTitle}</span>` + mine.map(s =>
        `<button type="button" class="btn ghost small" data-thread-tree="${s.id}">${t.mineTree(ft.species[s.sp].name, s.played!.length)}</button>`).join('')
      : '';
    $('m-village-needs').innerHTML = BUILDINGS.map(b => {
      const need = needOf(f, b);
      const got = v.got[b];
      const head = `<h4>${thingIcon(need.thing, 26)}${t.buildings[b]}</h4>`;
      const bar = `<span class="bar" aria-hidden="true"><i style="width:${Math.min(100, Math.round(100 * got / need.n))}%"></i></span>`;
      const lvl = t.level(v.level[b]);
      if (b === 'sauna') {
        return `<div class="vneed">${head}<span>${t.saunaNeed(num(Math.floor(got)), num(need.n))}</span>${bar}<small>${t.saunaHow}${lvl ? ' · ' + lvl : ''}</small></div>`;
      }
      const have = stock(f, need.thing);
      const k = Math.min(have, need.left);
      return `<div class="vneed">${head}<span>${t.needs(t.count(need.n, need.thing))} · ${num(Math.floor(got))}/${num(need.n)}</span>${bar}` +
        `<small>${have > 0 ? t.ready(t.count(have, need.thing)) : t.noneReady}${lvl ? ' · ' + lvl : ''}</small>` +
        (k > 0 ? `<button type="button" class="btn small" data-deliver="${b}">${t.give(t.count(k, need.thing))}</button>` : '') + '</div>';
    }).join('');
    const live = v.objects.filter(o => !isGone(o))
      .sort((a, b) => (snaps.get(b.tree)?.played?.length ?? 0) - (snaps.get(a.tree)?.played?.length ?? 0) || b.since - a.since || a.id - b.id);
    const worn = live.filter(o => isWorn(f, o));
    const using = live.filter(o => !isWorn(f, o));
    $('m-village-worn-title').textContent = worn.length ? t.worn : '';
    $('m-village-worn').innerHTML = worn.map(o => this.row(f, o, snaps.get(o.tree), true)).join('');
    $('m-village-use-title').textContent = using.length ? t.inUse : '';
    $('m-village-use').innerHTML = using.slice(0, SHOW).map(o => this.row(f, o, snaps.get(o.tree), false)).join('') +
      (using.length > SHOW ? `<p class="note">${t.more(using.length - SHOW)}</p>` : '');
  }

  private row(f: Forest, o: VillageObject, snap: TreeSnap | undefined, worn: boolean): string {
    const t = this.t;
    const ft = this.h.t();
    const from = snap ? t.fromTree(ft.species[snap.sp].name, A(snap.year)) : '';
    const left = o.since + o.life - f.year;
    const sub = worn ? t.wornWait(Math.max(0, o.since + o.life + WAIT - f.year - 1)) : t.yearsLeft(Math.max(1, left));
    const fates = worn ? fatesFor(o).map(fa =>
      `<button type="button" class="btn small${fa === 'burn' ? ' ghost' : ''}" data-fate="${fa}" data-obj="${o.id}" aria-describedby="fate-${o.id}-${fa}">${t.fates[fa]}</button>` +
      `<span class="sr-only" id="fate-${o.id}-${fa}">${this.how(fa, o.thing)}</span>`).join('') : '';
    const howLine = worn ? `<small class="note" style="grid-column:2">${fatesFor(o).map(fa => `<b>${t.fates[fa]}:</b> ${this.how(fa, o.thing)}`).join(' ')}</small>` : '';
    return `<div class="vrow${snap?.played?.length ? ' played' : ''}">${thingIcon(o.thing)}` +
      `<span>${t.objectLine(t.count(o.n, o.thing), t.at[o.building], from)} · <small>${sub}</small></span>` +
      `${howLine}<span class="acts">${fates}<button type="button" class="btn ghost small" data-thread-obj="${o.id}">${t.followThread}</button></span></div>`;
  }

  /** Game feel: a short picture strip over the village of what just happened (hidden from screen readers; the text says it). */
  private fx(html: string) {
    const el = $('m-village-fx');
    el.innerHTML = html;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  private how(fa: Fate, th: ThingId) { return this.t.fateHow[fa](th); }

  // ---------- the Carbon Thread ----------

  private renderThread(f: Forest) {
    const t = this.t;
    const ft = this.h.t();
    const sel = this.thread!;
    const ot = 'obj' in sel ? objectThread(f, sel.obj) : null;
    const treeId = ot ? ot.o.tree : (sel as { tree: number }).tree;
    const tt = treeThread(f, treeId);
    const snap = tt?.snap ?? ot?.snap;
    $('m-thread-title').textContent = ot ? t.threadTitle(t.count(ot.o.n, ot.o.thing)) : t.threadTreeTitle(snap ? ft.species[snap.sp].name : '');
    $('btn-m-thread-back').textContent = t.back;
    const mark = new Set<number>();
    if (snap) {
      for (const p of snap.played ?? []) mark.add(snap.rings.length - (snap.year - p.year));
      drawRings($<HTMLCanvasElement>('m-thread-rings'), snap.rings, mark);
      $('m-thread-tree').textContent = t.tree(ft.species[snap.sp].name, Y(snap.born), A(snap.year), snap.age, snap.d.toFixed(0));
      $('m-thread-played').textContent = t.played(snap.played?.length ?? 0);
    } else {
      $('m-thread-tree').textContent = '';
      $('m-thread-played').textContent = '';
    }
    const kgCO2 = (c: number) => num(c * CO2_PER_C, c * CO2_PER_C < 10 ? 1 : 0);
    const li = (cls: string, text: string) => `<li class="${cls}">${text}</li>`;
    let steps = '';
    if (ot) {
      for (const s of ot.steps) {
        switch (s.k) {
          case 'air': steps += li('air', t.steps.air(Y(s.from), A(s.to))); break;
          case 'summer': steps += li('summer', t.steps.summer(Y(s.year), num(s.mm, 1))); break;
          case 'cut': steps += li('cut', t.steps.cut(A(s.year))); break;
          case 'mill': steps += li('mill', t.steps.mill[s.route]); break;
          case 'event': steps += li('event', t.steps.event[s.what](A(s.year), t.count(s.n, s.thing), s.what === 'delivered' || s.what === 'reused' ? t.to[ot.o.building] : '')); break;
          case 'now': steps += li('now', s.gone ? t.steps.nowAir : t.steps.nowIn(t.count(ot.o.n, s.thing), kgCO2(s.c), t.at[s.building])); break;
        }
      }
    } else if (snap) {
      steps += li('air', t.steps.air(Y(snap.born), A(snap.year)));
      for (const p of snap.played ?? []) steps += li('summer', t.steps.summer(Y(p.year), num(p.mm, 1)));
      steps += li('cut', t.steps.cut(A(snap.year)));
      for (const o of tt?.objects ?? []) {
        steps += `<li class="event">${t.objectLine(t.count(o.n, o.thing), t.at[o.building], '')}` +
          ` <button type="button" class="btn ghost small" data-thread-obj="${o.id}">${t.followThread}</button></li>`;
      }
    }
    $('m-thread-steps').innerHTML = steps;
    if (tt && tt.snap.c) {
      const total = tt.snap.c;
      const parts = (['village', 'stock', 'forest', 'air'] as const).map(k => [k, tt.now[k]] as const);
      $('m-thread-now').innerHTML = `<h4>${t.nowTitle}</h4><div class="nowbar" aria-hidden="true">` +
        parts.map(([k, c]) => `<i class="nb-${k}" style="width:${(100 * c / total).toFixed(1)}%"></i>`).join('') + '</div>' +
        `<div class="nowkey">${parts.map(([k, c]) => `<span><i class="nb-${k}"></i>${t.now[k]}: ${kgCO2(c)} kg CO₂</span>`).join('')}</div>`;
    } else $('m-thread-now').innerHTML = '';
  }

  // ---------- buttons ----------

  /** Buttons of the village; true if the click was ours. */
  click(b: HTMLElement): boolean {
    if (b.id === 'btn-m-village') { this.open(); return true; }
    if (!this.open_) return false;
    const f = this.h.forest();
    if (!f) return false;
    const t = this.t;
    if (b.id === 'btn-m-village-close') { this.close(); return true; }
    if (b.id === 'btn-m-thread-back') { this.thread = null; this.render(); $('m-village-title').focus(); return true; }
    if (b.dataset.deliver) {
      const bid = b.dataset.deliver as BuildingId;
      const r = deliver(f, bid);
      if (r.n > 0) {
        this.fx(`${thingIcon(NEEDS[bid].thing, 32)}<b>+${num(Math.round(r.n))}</b>${ARROW}<span>${t.buildings[bid]}</span>`);
        this.h.chime('give');
        this.msg = t.gave(t.count(r.n, NEEDS[bid].thing), t.to[bid]) + (r.met ? ' ' + t.met(t.buildings[bid]) : '');
        this.h.announce(this.msg);
        this.h.persist();
      }
      this.render();
      $('m-village-title').focus();
      return true;
    }
    if (b.dataset.fate && b.dataset.obj) {
      const id = Number(b.dataset.obj), fate = b.dataset.fate as Fate;
      const was = village(f).objects.find(o => o.id === id)?.thing;
      if (decide(f, id, fate)) {
        const now = village(f).objects.find(o => o.id === id)?.thing;
        if (was) this.fx(`${thingIcon(was, 32)}${ARROW}${fate === 'burn' || !now ? FLAME : thingIcon(now, 32)}<span>${t.fates[fate]}</span>`);
        if (fate !== 'burn') this.h.chime(fate === 'recycle' || fate === 'reuse' ? 'recycle' : 'give');
        this.msg = '';
        this.h.persist();
        this.h.refresh();
      }
      this.render();
      $('m-village-title').focus();
      return true;
    }
    if (b.dataset.threadObj) { this.thread = { obj: Number(b.dataset.threadObj) }; this.render(); $('m-thread-title').focus(); return true; }
    if (b.dataset.threadTree) { this.thread = { tree: Number(b.dataset.threadTree) }; this.render(); $('m-thread-title').focus(); return true; }
    return false;
  }
}

/**
 * The village, drawn in the game's flat poster style: six houses along a
 * road, lit and busier as their needs are met, with smoke from the sauna
 * when it has been warmed.
 */
export function drawVillage(cv: HTMLCanvasElement, v: Village) {
  const c = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#9cc9e6'); sky.addColorStop(1, '#e3f1ef');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  const gy = H * 0.8;
  // the forest behind the village
  c.fillStyle = '#7f9f93';
  c.beginPath(); c.moveTo(0, gy); c.quadraticCurveTo(W * 0.3, gy - H * 0.4, W * 0.6, gy - H * 0.15); c.quadraticCurveTo(W * 0.85, gy - H * 0.35, W, gy - H * 0.1); c.lineTo(W, gy); c.fill();
  c.fillStyle = '#2c5a3c';
  for (let i = 0; i < 26; i++) {
    const x = i * W / 25, h = H * (0.18 + 0.05 * ((i * 7) % 3));
    c.beginPath(); c.moveTo(x, gy - h - H * 0.12); c.lineTo(x - h * 0.22, gy - H * 0.12); c.lineTo(x + h * 0.22, gy - H * 0.12); c.fill();
  }
  c.fillStyle = '#86b04f'; c.fillRect(0, gy - H * 0.12, W, H * 0.12);
  c.fillStyle = '#8a8f8c'; c.fillRect(0, gy, W, H - gy);
  c.fillStyle = '#d9d4c4';
  for (let x = 10; x < W; x += 40) c.fillRect(x, gy + (H - gy) / 2 - 1.5, 20, 3);
  const colors: Record<BuildingId, [string, string]> = {
    house: ['#c9744f', '#6e3b2a'], cafe: ['#e8c48e', '#8a4f3a'], school: ['#d9a441', '#6b4a32'],
    shop: ['#8fb6d1', '#3f5d73'], club: ['#9fc37a', '#4c6b35'], sauna: ['#7a5530', '#3f2c1d'],
  };
  const slot = W / BUILDINGS.length;
  BUILDINGS.forEach((b, i) => {
    const x = slot * i + slot * 0.18, w = slot * 0.64;
    const h = b === 'school' ? H * 0.42 : b === 'sauna' ? H * 0.26 : H * 0.34;
    const top = gy - h;
    const [wall, roof] = colors[b];
    c.fillStyle = wall; c.fillRect(x, top, w, h);
    c.fillStyle = roof;
    c.beginPath(); c.moveTo(x - 6, top); c.lineTo(x + w / 2, top - h * 0.45); c.lineTo(x + w + 6, top); c.fill();
    // windows light up as the place's needs are met
    const lit = v.level[b] > 0 || v.got[b] > 0;
    c.fillStyle = lit ? '#ffd968' : '#3b4a52';
    const ww = w * 0.2;
    c.fillRect(x + w * 0.15, top + h * 0.25, ww, ww);
    c.fillRect(x + w * 0.65, top + h * 0.25, ww, ww);
    c.fillStyle = '#3f2c1d'; c.fillRect(x + w * 0.42, gy - h * 0.45, w * 0.16, h * 0.45);
    // a little pile of the things it has from the forest
    const things = v.objects.filter(o => o.building === b && !isGone(o)).reduce((a, o) => a + o.n, 0);
    const need = NEEDS[b].n;
    const pile = Math.min(5, Math.ceil(5 * things / Math.max(1, need)));
    c.fillStyle = '#f3d9a8';
    for (let k = 0; k < pile; k++) c.fillRect(x + w + 2, gy - 5 - k * 5, 8, 4);
    if (b === 'sauna' && v.heat > 0) {
      c.strokeStyle = 'rgba(230,240,235,0.9)'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x + w * 0.75, top - h * 0.2); c.quadraticCurveTo(x + w * 0.95, top - h * 0.6, x + w * 0.75, top - h * 0.9); c.stroke();
    }
  });
}
