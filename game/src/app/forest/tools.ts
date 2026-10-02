/**
 * Forestry by hand (Phase 7): the toolbar under the forest. While a tool is
 * in use the forest stays paused, so the child can look, think and act:
 *  - Look: tap a tree for its card (as before)
 *  - Mark to cut: tap trees, then "Cut the marked" sends them to sorting
 *  - Keep: tap a tree to keep it forever (säästöpuu)
 *  - Plant: tap the ground to plant a seedling of the chosen species
 *  - Light: colour every tree by the light it got last year
 * Keyboard and screen-reader players get the same actions on the tree card,
 * and "Plant one" plants in the biggest gap.
 */
import {
  PLANTABLE, groundLight, markedTrees, plantAt, plantsLeft, toggleKeep, toggleMark, type SpeciesId, type Tree,
} from '../../core/forest';
import type { Lane } from './metsani';
import type { FOREST_TEXT } from './text';
import type { Lang } from '../text';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type Tool = 'look' | 'mark' | 'keep' | 'plant';

export interface ToolsHost {
  t(): (typeof FOREST_TEXT)[Lang];
  main(): Lane | undefined;
  comparing(): boolean;
  setPlaying(on: boolean): void;
  persist(): void;
  /** redraw the card and the description after a change */
  refresh(): void;
  /** send the marked trees to sorting and the mills */
  cutMarked(): void;
  announce(text: string): void;
}

export class Tools {
  tool: Tool = 'look';
  lens = false;
  sp: SpeciesId = 'spruce';
  private note = '';

  constructor(private h: ToolsHost) {}

  setTool(tool: Tool) {
    this.tool = tool;
    this.note = '';
    if (tool !== 'look') this.h.setPlaying(false);
    this.render();
  }

  toggleLens() {
    this.lens = !this.lens;
    this.note = '';
    this.render();
  }

  render() {
    const t = this.h.t().tools;
    const m = this.h.main();
    const off = !m || this.h.comparing();
    $('m-tools').hidden = off;
    $('m-tool-note').hidden = off;
    if (off) return;
    $('m-tools-label').textContent = t.label;
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      const k = b.dataset.tool as Tool;
      b.textContent = t[k];
      b.setAttribute('aria-pressed', String(k === this.tool));
    }
    $('btn-m-light').textContent = t.light;
    $('btn-m-light').setAttribute('aria-pressed', String(this.lens));
    const ft = this.h.t();
    const sp = $('m-plant-sp');
    sp.hidden = this.tool !== 'plant';
    sp.innerHTML = PLANTABLE.map(s => `<button type="button" data-plant-sp="${s}" aria-pressed="${s === this.sp}">${ft.species[s].name}</button>`).join('');
    const left = plantsLeft(m.f);
    $('btn-m-plant-one').hidden = this.tool !== 'plant' || left <= 0;
    $('btn-m-plant-one').textContent = t.plantOne;
    const n = markedTrees(m.f).length;
    $('btn-m-cut').hidden = n === 0;
    $('btn-m-cut').textContent = t.cut(n);
    $('m-tool-note').textContent = this.note || this.defaultNote(m, n, left);
  }

  private defaultNote(m: Lane, marked: number, left: number): string {
    const t = this.h.t().tools;
    const ft = this.h.t();
    if (this.lens) {
      const light = groundLight(m.f);
      return `${t.lightNote} ${PLANTABLE.map(s => t.lightFor(ft.species[s].name, Math.round(light[s] * 100))).join(' · ')}`;
    }
    switch (this.tool) {
      case 'look': return t.lookNote;
      case 'mark': return t.markNote(marked);
      case 'keep': return t.keepNote;
      case 'plant': return left > 0 ? t.plantNote(left, `${Math.round(groundLight(m.f)[this.sp] * 100)} %`) : t.plantNone;
    }
  }

  /** A tap on the forest canvas. Returns true if a tool used it (Look leaves it to the tree card). */
  tap(x: number, y: number): boolean {
    const m = this.h.main();
    if (!m || this.tool === 'look' || this.h.comparing()) return false;
    if (this.tool === 'plant') {
      const at = m.scene.plotFraction(x);
      if (at !== null) this.plant(at);
      return true;
    }
    const id = m.scene.hit(x, y);
    if (id === null) return true;
    if (this.tool === 'mark') this.mark(id);
    else this.keep(id);
    return true;
  }

  mark(id: number) {
    const m = this.h.main();
    if (!m) return;
    const tree = m.f.trees.find(tr => tr.id === id);
    if (tree?.mine) this.note = this.h.t().tools.keptMine;
    toggleMark(m.f, id);
    this.after();
  }

  keep(id: number) {
    const m = this.h.main();
    if (!m) return;
    const tree = m.f.trees.find(tr => tr.id === id);
    if (tree?.mine) this.note = this.h.t().tools.keptMine;
    toggleKeep(m.f, id);
    this.after();
  }

  /** Plant in the biggest gap between trees (keyboard and screen readers). */
  plantOne() {
    const m = this.h.main();
    if (!m) return;
    const xs = [0, ...m.f.trees.map(tr => tr.x).sort((a, b) => a - b), 1];
    let best = { gap: -1, x: 0.5 };
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > best.gap) best = { gap: xs[i] - xs[i - 1], x: (xs[i] + xs[i - 1]) / 2 };
    this.plant(best.x);
  }

  private plant(x: number) {
    const m = this.h.main();
    if (!m) return;
    const tree = plantAt(m.f, this.sp, x);
    if (!tree) { this.note = this.h.t().tools.plantNone; this.render(); return; }
    // a new seedling has no last-year size to grow from
    m.prev.set(tree.id, { h: tree.h, d: tree.d });
    this.note = this.h.t().tools.planted(this.h.t().species[this.sp].name);
    this.h.announce(this.note);
    this.after();
  }

  private after() {
    this.h.persist();
    this.h.refresh();
    this.render();
  }

  /** Buttons on the tree card: the same actions for keyboard and screen-reader players. */
  renderCard(tree: Tree | undefined, onMain: boolean) {
    const t = this.h.t().tools;
    const show = !!tree && onMain && !this.h.comparing();
    $('btn-m-card-mark').hidden = !show || !!tree?.keep;
    $('btn-m-card-keep').hidden = !show || !!tree?.mine;
    if (!tree) return;
    $('btn-m-card-mark').textContent = tree.marked ? t.unmark : t.markTree;
    $('btn-m-card-mark').setAttribute('aria-pressed', String(!!tree.marked));
    $('btn-m-card-keep').textContent = tree.keep ? t.unkeep : t.keepTree;
    $('btn-m-card-keep').setAttribute('aria-pressed', String(tree.keep));
  }

  /** Clicks inside the toolbar. Returns true if handled. */
  click(b: HTMLElement): boolean {
    if (b.dataset.tool) { this.setTool(b.dataset.tool as Tool); return true; }
    if (b.dataset.plantSp) { this.sp = b.dataset.plantSp as SpeciesId; this.note = ''; this.render(); return true; }
    switch (b.id) {
      case 'btn-m-light': this.toggleLens(); return true;
      case 'btn-m-plant-one': this.plantOne(); return true;
      case 'btn-m-cut': {
        const m = this.h.main();
        const n = m ? markedTrees(m.f).length : 0;
        this.h.setPlaying(false);
        this.h.cutMarked();
        // trees too thin for the mill are left to feed the soil, and no truck comes
        if ($('m-sort').hidden && $('m-mills').hidden) { this.note = this.h.t().tools.cutSmall(n); this.h.announce(this.note); this.render(); }
        return true;
      }
    }
    return false;
  }
}

