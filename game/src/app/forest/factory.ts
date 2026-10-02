/**
 * Forest to factory (F3), split out of metsani.ts in Phase 5: the sorting
 * game at the roadside, the truck and the mills, and the product shelf with
 * the trace from an item back to its tree. The forest view stays paused
 * while one of these is open; Metsäni gives access to what they need through
 * FactoryHost.
 */
import { num } from '../format';
import {
  ITEMS, applyChoice, bestBin, previewHarvest, recycledItems, shelf, traceCount, traceItem,
  type ChoiceId, type ItemId, type SortBin, type SpeciesId, type Spacing, type Tree,
} from '../../core/forest';
import { drawMills, itemIcon } from './mills';
import { drawRings, type Lane, type Overlay } from './metsani';
import type { FOREST_TEXT } from './text';
import type { Lang } from '../text';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Choices that send wood to the mills, and so start the sorting game. */
export const HARVESTS = new Set<ChoiceId>(['cutMarked', 'thin', 'thinLight', 'clearcut', 'clearcutKeep', 'cc', 'removeFallen', 'removeHalf', 'removeBeetle']);
/** How many trunks the child sorts by hand; the harvester does the rest. */
const SORT_BY_HAND = 10;

interface Sorting {
  choice: ChoiceId;
  trees: { id: number; sp: SpeciesId; d: number; h: number }[];
  /** the trunks shown to the child */
  shown: number[];
  bins: Record<number, SortBin>;
  residues: boolean;
}

/** What the factory screens need from the forest view. */
export interface FactoryHost {
  t(): (typeof FOREST_TEXT)[Lang];
  main(): Lane | undefined;
  lanes(): Lane[];
  overlay(): Overlay;
  setOverlay(o: Overlay): void;
  spacing(): Spacing;
  readonly reducedMotion: boolean;
  mix(): Partial<Record<SpeciesId, number>>;
  setPlaying(on: boolean): void;
  /** the harvest is done (or cancelled): carry on with the year */
  afterChoice(): void;
  renderSheet(): void;
  /** whether a question sheet is open behind the factory screens */
  asking(): boolean;
  /** show the felled trees falling and the truck leaving, then run `done`; `planted` pop up afterwards */
  fell(trees: Tree[], planted: number[], done: () => void): void;
}

export class Factory {
  sorting: Sorting | null = null;
  tracing: { item: ItemId; k: number } | null = null;
  private millsAnim = { t: 0, amounts: { saw: 0, pulp: 0, bio: 0 }, logs: 0 };
  private shelfIndex = 0;

  constructor(private h: FactoryHost) {}

  startSort(choice: ChoiceId) {
    const f = this.h.main()!.f;
    const trees = previewHarvest(f, choice);
    if (!trees.length) { this.finishHarvest(choice, {}, false); return; }
    // show a spread of trunk sizes, thickest first, so both bins get used
    const bySize = [...trees].sort((a, b) => b.d - a.d);
    const step = Math.max(1, bySize.length / SORT_BY_HAND);
    const shown = Array.from({ length: Math.min(SORT_BY_HAND, bySize.length) }, (_, i) => bySize[Math.floor(i * step)].id);
    this.sorting = { choice, trees, shown, bins: {}, residues: false };
    this.h.setOverlay('sort');
    $('m-decide').hidden = true;
    $('m-sort').hidden = false;
    this.renderSort();
    requestAnimationFrame(() => $('m-sort-title').focus());
  }

  renderSort() {
    const s = this.sorting;
    if (!s) return;
    const t = this.h.t();
    const n1 = (x: number) => num(x);
    $('m-sort-title').textContent = t.sortTitle;
    $('m-sort-intro').textContent = t.sortIntro;
    const maxD = Math.max(...s.trees.map(x => x.d));
    $('m-sort-list').innerHTML = s.shown.map((id, i) => {
      const tr = s.trees.find(x => x.id === id)!;
      const label = t.trunk(i + 1, t.species[tr.sp].name, n1(tr.d));
      const size = 14 + 34 * (tr.d / maxD);
      const bins = (['saw', 'pulp', 'energy'] as SortBin[]).map(bn =>
        `<button type="button" class="bin bin-${bn}" data-tree="${id}" data-bin="${bn}" aria-pressed="${s.bins[id] === bn}">${t.bins[bn]}</button>`).join('');
      return `<div class="trunk" role="group" aria-label="${label}"><span class="ring sp-${tr.sp}" style="width:${size}px;height:${size}px" aria-hidden="true"></span>` +
        `<span class="tl">${t.species[tr.sp].name}<b>${n1(tr.d)} cm</b></span><span class="bins">${bins}</span></div>`;
    }).join('');
    const left = s.shown.filter(id => !s.bins[id]).length;
    $('m-sort-rest').textContent = t.sortRest(s.trees.length - s.shown.length);
    $('m-sort-left').textContent = left ? t.sortLeft(left) : '';
    $('m-residues-label').textContent = t.residues;
    $<HTMLInputElement>('m-residues').checked = s.residues;
    $('btn-m-autosort').textContent = t.autoSort;
    $('btn-m-load').textContent = t.loadTruck;
    $<HTMLButtonElement>('btn-m-load').disabled = left > 0;
    $('btn-m-sort-cancel').textContent = t.cancel;
  }

  setBin(id: number, bin: SortBin) {
    if (!this.sorting) return;
    this.sorting.bins[id] = bin;
    this.renderSort();
    (document.querySelector(`[data-tree="${id}"][data-bin="${bin}"]`) as HTMLElement | null)?.focus();
  }

  autoSort() {
    const s = this.sorting;
    if (!s) return;
    for (const id of s.shown) { const tr = s.trees.find(x => x.id === id)!; s.bins[id] = bestBin(tr.sp, tr.d); }
    this.renderSort();
    $('btn-m-load').focus();
  }

  cancelSort() {
    this.sorting = null;
    this.h.setOverlay(null);
    $('m-sort').hidden = true;
    // cutting marked trees by hand has no question sheet to go back to
    if (!this.h.asking()) return;
    $('m-decide').hidden = false;
    this.h.renderSheet();
  }

  loadTruck() {
    const s = this.sorting;
    if (!s || s.shown.some(id => !s.bins[id])) return;
    const sort: Record<number, SortBin> = {};
    for (const tr of s.trees) sort[tr.id] = s.bins[tr.id] ?? bestBin(tr.sp, tr.d);
    this.finishHarvest(s.choice, sort, s.residues);
  }

  /** Carry out the harvest with the child's sorting, then show the trip to the mills. */
  finishHarvest(choice: ChoiceId, sort: Record<number, SortBin>, residues: boolean) {
    const lane = this.h.main()!;
    const before = new Map(ITEMS.map(i => [i, lane.f.receipts.filter(r => r.item === i).reduce((a, r) => a + r.n, 0)]));
    const was = new Map(lane.f.trees.map(tr => [tr.id, tr]));
    const h = applyChoice(lane.f, choice, { sort, residues, mix: this.h.mix(), spacing: this.h.spacing() });
    const s = this.sorting;
    $('m-sort').hidden = true;
    this.sorting = null;
    const now = new Set(lane.f.trees.map(tr => tr.id));
    const felled = [...was.values()].filter(tr => !now.has(tr.id));
    const planted = lane.f.trees.filter(tr => !was.has(tr.id)).map(tr => tr.id);
    if (!h || h.count === 0) { this.h.setOverlay(null); this.h.afterChoice(); return; }
    // 2.5D: first the trees fall and the truck drives off, then the mills
    const made = ITEMS.map(i => [i, lane.f.receipts.filter(r => r.item === i).reduce((a, r) => a + r.n, 0) - (before.get(i) ?? 0)] as const)
      .filter(([, n]) => n >= 0.5);
    this.h.setOverlay('felling');
    this.h.fell(felled, planted, () => this.openMills(h, s, made));
  }

  private openMills(h: NonNullable<ReturnType<typeof applyChoice>>, s: Sorting | null, made: (readonly [ItemId, number])[]) {
    // feedback on the trunks the child sorted
    const t = this.h.t();
    let right = 0;
    const notes = new Set<string>();
    for (const id of s?.shown ?? []) {
      const tr = s!.trees.find(x => x.id === id)!;
      const best = bestBin(tr.sp, tr.d);
      const got = s!.bins[id];
      if (got === best) right++;
      else notes.add(got === 'energy' ? t.sortEnergy : got === 'saw' ? t.sortWrongSaw : t.sortWrongPulp);
    }
    const total = h.sawlogC + h.pulpwoodC + h.energywoodC || 1;
    this.millsAnim = {
      t: 0, logs: h.count,
      amounts: { saw: h.sawlogC / total, pulp: h.pulpwoodC / total, bio: (h.energywoodC + h.residueC) / total },
    };
    $('m-mills-title').textContent = t.millsTitle;
    $('m-mills-truck').textContent = t.truck(num(h.volume, 1));
    $('m-mills-sort').textContent = s && s.shown.length ? `${right} / ${s.shown.length} ${t.sortRight} ${[...notes].join(' ')}` : '';
    $('m-mills-cards').innerHTML = (['sawmill', 'pulpmill', 'biorefinery'] as const).map(k =>
      `<div class="millcard"><b>${t.mills[k][0]}</b><span>${t.mills[k][1]}</span></div>`).join('');
    $('m-mills-made-title').textContent = t.madeNow;
    $('m-mills-made').innerHTML = made.map(([i, n]) =>
      `<div class="madeitem">${itemIcon(i, 36)}<span>${t.itemCount(Math.round(n), i)}</span></div>`).join('');
    $('btn-m-mills-back').textContent = t.backToForest;
    this.h.setOverlay('mills');
    $('m-mills').hidden = false;
    requestAnimationFrame(() => $('m-mills-title').focus());
  }

  animateMills(dt: number) {
    const a = this.millsAnim;
    a.t = this.h.reducedMotion ? 1 : (a.t + dt / 5) % 1.6;
    drawMills($<HTMLCanvasElement>('m-mills-canvas'), Math.min(1, a.t), a.amounts, a.logs);
  }

  leaveMills() {
    $('m-mills').hidden = true;
    this.h.setOverlay(null);
    this.h.afterChoice();
  }

  shelfLane() { return this.h.lanes()[this.shelfIndex] ?? this.h.main(); }

  openShelf(lane = 0) {
    this.shelfIndex = lane;
    this.tracing = null;
    this.h.setOverlay('shelf');
    this.h.setPlaying(false);
    $('m-shelf').hidden = false;
    this.renderShelf();
    requestAnimationFrame(() => $('m-shelf-title').focus());
  }

  closeShelf() {
    this.h.setOverlay(null);
    this.tracing = null;
    $('m-shelf').hidden = true;
    $('m-results').querySelector<HTMLElement>('[data-result="products"]')?.focus();
  }

  renderShelf() {
    const lane = this.shelfLane();
    if (!lane) return;
    const f = lane.f;
    const t = this.h.t();
    const fmt = (n: number) => num(Math.round(n));
    $('m-shelf-title').textContent = t.shelfTitle;
    $('btn-m-shelf-close').setAttribute('aria-label', t.close);
    const items = shelf(f);
    const tr = this.tracing ? traceItem(f, this.tracing.item, this.tracing.k) : null;
    $('m-shelf-grid').hidden = !!tr;
    $('m-trace').hidden = !tr;
    $('m-shelf-intro').textContent = items.length ? t.shelfIntro : t.shelfEmpty;
    $('m-recycle-row').hidden = !!tr;
    $('m-recycle-label').textContent = t.recycleLabel;
    $<HTMLInputElement>('m-recycle').checked = f.recycle;
    const rec = recycledItems(f);
    $('m-recycle-note').textContent = rec >= 1 ? t.recycleNote(fmt(rec)) : '';
    if (!tr) {
      $('m-shelf-grid').innerHTML = items.map(s =>
        `<button type="button" class="shelfitem" data-item="${s.item}">${itemIcon(s.item, 44)}` +
        `<b>${fmt(s.made)}</b><span>${t.items[s.item][1]}</span>` +
        `<small>${s.item === 'sauna' ? t.made : `${t.inUse}: ${fmt(s.inUse)}`}</small></button>`).join('');
      return;
    }
    const n = traceCount(f, tr.item);
    const i = ((this.tracing!.k % n) + n) % n;
    $('m-trace-title').textContent = t.traceTitle(t.items[tr.item][0]);
    $('m-trace-steps').innerHTML = tr.steps.map((st, j) =>
      `<li class="step step-${st}">${j === 0 ? itemIcon(tr.item, 28) : ''}<span>${st === 'item' ? t.items[tr.item][2] : t.steps[st]}</span></li>`).join('');
    const tree = tr.tree;
    $('m-trace-tree').textContent = t.traceTree(t.species[tree.sp].name, tree.born, tree.year, tree.age);
    $('m-trace-size').textContent = `${t.card.height} ${tree.h.toFixed(1)} m · ${t.card.diameter} ${tree.d.toFixed(1)} cm`;
    $('m-trace-made').textContent = t.traceMade(fmt(tr.count), t.items[tr.item][tr.count >= 1.5 ? 1 : 0]);
    $('m-trace-of').textContent = t.traceOf(i + 1, n);
    $('btn-m-trace-prev').textContent = t.prevTree;
    $('btn-m-trace-next').textContent = t.nextTree;
    $('btn-m-trace-prev').hidden = n < 2;
    $('btn-m-trace-next').hidden = n < 2;
    $('btn-m-trace-back').textContent = t.back;
    drawRings($<HTMLCanvasElement>('m-trace-rings'), tree.rings);
  }
}
