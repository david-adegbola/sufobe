/**
 * Question cards (Phase 8): pick a card, guess, then watch two forests that
 * differ in one thing grow side by side with the same weather.
 *
 * Experiments run on forests of their own (core/forest/experiments.ts). The
 * child's own forest is never touched; only which cards were tried, and the
 * guesses, are kept in the forest save.
 */
import { num } from '../format';
import {
  CARDS, cardById, measureBoth, startTwin, stepTwin, verdict, type QuestionCard, type Twin, type Tree, type YearRecord,
} from '../../core/forest';
import type { Lang } from '../text';
import { ForestScene } from './scene';
import { LAB_TEXT } from './labtext';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type Guess = 'a' | 'b' | 'same';
export interface LabRecord { guess: Guess; result: Guess }

export interface LabHost {
  lang(): Lang;
  announce(text: string): void;
  reducedMotion: boolean;
  canvas: HTMLCanvasElement;
  /** what the child has tried so far, by card id */
  done(): Record<string, LabRecord>;
  record(id: string, r: LabRecord): void;
  /** leave the question cards */
  exit(): void;
}

/** About this many seconds for a whole experiment, however many years it has. */
const RUN_SECONDS = 24;

interface Side {
  twin: Twin;
  scene: ForestScene;
  prev: Map<number, { h: number; d: number }>;
  dying: Tree[];
  rec: YearRecord | undefined;
}

export class Lab {
  active = false;
  private screen: 'list' | 'card' | 'run' | 'result' = 'list';
  private card: QuestionCard | null = null;
  private guess: Guess | null = null;
  private seed = '';
  private sides: Side[] = [];
  private year = 0;
  private p = 0;
  private playing = true;
  private time = 0;
  private values = { a: 0, b: 0 };

  constructor(private host: LabHost) {}

  private get t() { return LAB_TEXT[this.host.lang()]; }

  /** Open the card list, or one card straight away (a teacher's link). */
  open(id?: string) {
    this.active = true;
    const c = id ? cardById(id) : undefined;
    if (c) this.showCard(c); else this.showList();
  }

  close() {
    this.active = false;
    $('m-lab').hidden = true;
    $('m-lab-run').hidden = true;
    this.sides = [];
  }

  /** Escape goes one step back: result → card, run → card, card → list, list → out. */
  escape() {
    if (this.screen === 'run' || this.screen === 'result') { this.showCard(this.card!); return; }
    if (this.screen === 'card') { this.showList(); return; }
    this.close();
    this.host.exit();
  }

  rerender() {
    if (this.screen === 'list') this.renderList();
    else if (this.screen === 'card') this.renderCard();
    else { this.renderRun(); if (this.screen === 'result') this.renderResult(); }
  }

  resize() { for (const s of this.sides) s.scene.resize(); }

  pause() { if (this.screen === 'run' && this.playing) { this.playing = false; this.renderRun(); } }

  // ---------- the list and one card ----------

  private showList() {
    this.screen = 'list';
    this.sides = [];
    $('m-lab-run').hidden = true;
    $('m-lab').hidden = false;
    $('m-lab-list').hidden = false;
    $('m-lab-card').hidden = true;
    this.renderList();
    requestAnimationFrame(() => $('m-lab-title').focus());
  }

  private renderList() {
    const t = this.t;
    const done = this.host.done();
    $('m-lab-title').textContent = t.title;
    $('m-lab-intro').textContent = t.intro;
    $('m-lab-cards').innerHTML = CARDS.map(c => {
      const ct = t.cards[c.id as keyof typeof t.cards];
      const mark = done[c.id] ? `<span class="done">✓ ${t.done}</span>` : '';
      return `<button type="button" class="mcard labcard" data-lab="${c.id}"><b>${ct.title}</b><span>${ct.q}</span>${mark}</button>`;
    }).join('');
    $('btn-m-lab-back').textContent = t.back;
  }

  private showCard(c: QuestionCard) {
    this.card = c;
    this.screen = 'card';
    this.sides = [];
    this.guess = null;
    this.seed = c.seed;
    $('m-lab-run').hidden = true;
    $('m-lab').hidden = false;
    $('m-lab-list').hidden = true;
    $('m-lab-card').hidden = false;
    this.renderCard();
    requestAnimationFrame(() => $('m-lab-card-title').focus());
  }

  private renderCard() {
    const c = this.card!;
    const t = this.t;
    const ct = t.cards[c.id as keyof typeof t.cards];
    const m = t.measures[c.measure];
    $('m-lab-card-title').textContent = ct.title;
    $('m-lab-q').textContent = ct.q;
    $('m-lab-a-tag').textContent = t.forestA;
    $('m-lab-b-tag').textContent = t.forestB;
    $('m-lab-a').textContent = ct.a;
    $('m-lab-b').textContent = ct.b;
    $('m-lab-setup').textContent = t.setup(c.years, c.base.grown);
    $('m-lab-measure').textContent = `${t.measure}: ${m.name} (${m.unit})`;
    $('m-lab-guess-title').textContent = t.guess;
    const opts: [Guess, string, string][] = [['a', t.forestA, ct.a], ['b', t.forestB, ct.b], ['same', t.guessSame, '']];
    $('m-lab-guess').innerHTML = opts.map(([g, head, sub]) =>
      `<button type="button" class="choice" data-guess="${g}" aria-pressed="${this.guess === g}"><b>${head}</b>${sub ? `<span>${sub}</span>` : ''}</button>`).join('');
    $('m-lab-guess-note').textContent = this.guess ? '' : t.guessNote;
    $('btn-m-lab-run').textContent = t.run;
    $<HTMLButtonElement>('btn-m-lab-run').disabled = !this.guess;
    $('btn-m-lab-list').textContent = t.another;
    $('btn-m-lab-link').textContent = t.copyLink;
  }

  private pick(g: Guess) {
    this.guess = g;
    this.renderCard();
    $('m-lab-guess').querySelector<HTMLButtonElement>(`[data-guess="${g}"]`)?.focus();
  }

  private copyLink() {
    const c = this.card;
    if (!c) return;
    const url = `${location.origin}${location.pathname}#q-${c.id}`;
    const done = () => { $('m-lab-guess-note').textContent = this.t.copied; this.host.announce(this.t.copied); };
    try {
      navigator.clipboard?.writeText(url).then(done, () => { $('m-lab-guess-note').textContent = url; });
    } catch { $('m-lab-guess-note').textContent = url; }
  }

  // ---------- the experiment ----------

  private run(seed: string) {
    const c = this.card!;
    this.seed = seed;
    this.sides = (['a', 'b'] as const).map(k => {
      const twin = startTwin(c, k, seed);
      return { twin, scene: new ForestScene(this.host.canvas), prev: new Map(), dying: [], rec: twin.f.history.at(-1) };
    });
    for (const s of this.sides) s.scene.resize();
    this.year = 0;
    this.screen = 'run';
    this.playing = true;
    $('m-lab').hidden = true;
    $('m-lab-run').hidden = false;
    $('m-lab-result').hidden = true;
    this.measureNow();
    this.renderRun();
    this.beginYear();
    requestAnimationFrame(() => $('m-lab-year').focus());
  }

  private beginYear() {
    const c = this.card!;
    for (const [i, s] of this.sides.entries()) {
      const f = s.twin.f;
      s.prev = new Map(f.trees.map(t => [t.id, { h: t.h, d: t.d }]));
      const before = f.trees.map(t => ({ ...t, c: { ...t.c } }));
      s.rec = stepTwin(s.twin, c, i === 0 ? c.a : c.b);
      const alive = new Set(f.trees.map(t => t.id));
      s.dying = before.filter(t => !alive.has(t.id));
    }
    this.year++;
    this.p = 0;
  }

  private measureNow() {
    const [a, b] = this.sides;
    this.values = measureBoth(this.card!, a.twin, b.twin);
  }

  private skip() {
    const c = this.card!;
    while (this.year < c.years) this.beginYear();
    for (const s of this.sides) { s.prev = new Map(); s.dying = []; }
    this.p = 0.999;
    this.finish();
  }

  private finish() {
    const c = this.card!;
    this.measureNow();
    const result = verdict(this.values.a, this.values.b);
    if (this.guess) this.host.record(c.id, { guess: this.guess, result });
    this.screen = 'result';
    this.renderRun();
    this.renderResult();
    $('m-lab-result').hidden = false;
    requestAnimationFrame(() => $('m-lab-result-title').focus());
  }

  private renderRun() {
    const c = this.card!;
    const t = this.t;
    const ct = t.cards[c.id as keyof typeof t.cards];
    $('btn-m-lab-stop').setAttribute('aria-label', t.back);
    $('m-lab-year').textContent = t.year(Math.min(this.year, c.years), c.years);
    $('m-lab-what').textContent = t.measures[c.measure].name;
    $('m-lab-badge-a').textContent = `A: ${ct.a}`;
    $('m-lab-badge-b').textContent = `B: ${ct.b}`;
    this.host.canvas.setAttribute('aria-label', t.canvas);
    const m = t.measures[c.measure];
    const hi = Math.max(this.values.a, this.values.b, 1e-9);
    const fmt = (v: number) => num(v, v < 10 ? 1 : 0);
    const row = (k: 'a' | 'b', name: string) =>
      `<div class="labmeter ${k}"><span>${name}</span><span class="bar"><i style="width:${Math.round(100 * this.values[k] / hi)}%"></i></span><b>${fmt(this.values[k])} ${m.unit}</b></div>`;
    $('m-lab-meters').innerHTML = row('a', t.forestA) + row('b', t.forestB);
    const play = $('btn-m-lab-play');
    play.textContent = this.playing ? 'II' : '▶';
    play.setAttribute('aria-label', this.playing ? t.pause : t.play);
    play.hidden = this.screen === 'result';
    $('btn-m-lab-skip').textContent = t.skip;
    $('btn-m-lab-skip').hidden = this.screen === 'result';
  }

  private renderResult() {
    const c = this.card!;
    const t = this.t;
    const ct = t.cards[c.id as keyof typeof t.cards];
    const result = verdict(this.values.a, this.values.b);
    const name = (g: Guess) => g === 'a' ? `${t.forestA} (${ct.a})` : g === 'b' ? `${t.forestB} (${ct.b})` : t.guessSame;
    $('m-lab-result-title').textContent = t.resultTitle;
    $('m-lab-verdict').textContent = (result === 'same' ? t.same : t.higher(name(result))) + ' ' + (this.guess === result ? t.right : t.wrong);
    $('m-lab-guessed').textContent = this.guess ? t.youGuessed(name(this.guess)) : '';
    $('m-lab-why-title').textContent = t.why;
    $('m-lab-why').textContent = ct.why;
    $('m-lab-model').textContent = t.model;
    $('btn-m-lab-again').textContent = t.again;
    $('btn-m-lab-another').textContent = t.another;
    $('m-lab-again-note').textContent = t.againNote;
  }

  /** Two forests share the screen: side by side when wide, one above the other when tall. */
  private layout() {
    const W = this.host.canvas.clientWidth || innerWidth;
    const H = this.host.canvas.clientHeight || innerHeight;
    const top = ($('m-lab-run').querySelector('.mtop')?.getBoundingClientRect().bottom ?? 60) + 6;
    const bottom = innerHeight - $('m-lab-bottom').getBoundingClientRect().top + 6;
    const [a, b] = this.sides;
    const badge = (id: string, x: number, y: number) => { const el = $(id); el.style.left = `${x}px`; el.style.top = `${y}px`; };
    if (W > H * 1.1) {
      a.scene.setViewport(0, 0, W / 2 - 1, H);
      b.scene.setViewport(W / 2 + 1, 0, W / 2 - 1, H);
      for (const s of [a, b]) { s.scene.insetTop = top + 30; s.scene.insetBottom = bottom; }
      badge('m-lab-badge-a', 12, top + 2);
      badge('m-lab-badge-b', W / 2 + 12, top + 2);
    } else {
      const mid = top + (H - top - bottom) / 2;
      a.scene.setViewport(0, 0, W, mid - 1);
      b.scene.setViewport(0, mid + 1, W, H - mid - 1);
      a.scene.insetTop = top + 30; a.scene.insetBottom = 0;
      b.scene.insetTop = 30; b.scene.insetBottom = bottom;
      badge('m-lab-badge-a', 12, top + 2);
      badge('m-lab-badge-b', 12, mid + 6);
    }
  }

  update(dt: number) {
    if (!this.active || (this.screen !== 'run' && this.screen !== 'result') || this.sides.length < 2) return;
    this.time += dt;
    const c = this.card!;
    if (this.screen === 'run' && this.playing) {
      this.p += dt * c.years / RUN_SECONDS;
      if (this.p >= 1) {
        this.measureNow();
        if (this.year >= c.years) { this.p = 0.999; this.finish(); }
        else { this.beginYear(); this.renderRun(); }
      }
    }
    this.layout();
    for (const s of this.sides) {
      s.scene.draw({
        forest: s.twin.f, prev: s.prev, dying: s.dying, p: Math.min(0.999, this.p), rec: s.rec,
        selected: null, time: this.time, reducedMotion: this.host.reducedMotion,
      }, dt);
    }
  }

  /** Buttons of the question cards; true if the click was ours. */
  click(b: HTMLElement): boolean {
    if (!this.active) return false;
    if (b.dataset.lab) { const c = cardById(b.dataset.lab); if (c) this.showCard(c); return true; }
    if (b.dataset.guess) { this.pick(b.dataset.guess as Guess); return true; }
    switch (b.id) {
      case 'btn-m-lab-back': this.close(); this.host.exit(); return true;
      case 'btn-m-lab-run': if (this.guess) this.run(this.card!.seed); return true;
      case 'btn-m-lab-list': case 'btn-m-lab-another': this.showList(); return true;
      case 'btn-m-lab-link': this.copyLink(); return true;
      case 'btn-m-lab-stop': this.showCard(this.card!); return true;
      case 'btn-m-lab-play': this.playing = !this.playing; this.renderRun(); return true;
      case 'btn-m-lab-skip': this.skip(); return true;
      case 'btn-m-lab-again': this.run(`${this.card!.seed}-${Math.floor(Math.random() * 1e6).toString(36)}`); return true;
    }
    return false;
  }

  debug() {
    return {
      open: (id?: string) => this.open(id),
      guess: (g: Guess) => this.pick(g),
      run: () => this.run(this.card!.seed),
      skip: () => this.skip(),
      state: () => ({ screen: this.screen, card: this.card?.id ?? null, year: this.year, values: this.values, guess: this.guess, seed: this.seed }),
    };
  }
}
