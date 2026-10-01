/**
 * Metsäni F1: choose a place, a soil and the trees, then watch the forest
 * live through the years. Tap a tree for its card. Five results are always
 * shown together, each with its main reason.
 *
 * The model steps a whole year at once (core/forest); this view then plays
 * that year back through spring, summer, autumn and winter, growing each tree
 * from last year's size to this year's during the summer.
 */
import {
  CO2_PER_C, SOILS, SPACING, SPECIES, createForest, plant, results, stemVolume, stepYear,
  type Forest, type PlaceId, type Results, type SoilId, type SpeciesId, type Spacing, type Tree, type YearRecord,
} from '../../core/forest';
import type { Lang } from '../text';
import { ForestScene, seasonOf } from './scene';
import { addPast, loadForest, storeForest, type ForestSave } from './save';
import { FOREST_TEXT } from './text';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Seconds per year at normal speed: four seasons of about ten seconds. */
export const YEAR_SECONDS = 40;
const SPEEDS = { normal: 1, fast: 10 } as const;
type Speed = keyof typeof SPEEDS;
type ResultKey = 'wood' | 'carbon' | 'life' | 'health' | 'products';

export interface MetsaniHost {
  lang(): Lang;
  announce(text: string): void;
  exit(): void;
  reducedMotion: boolean;
}

const PLACE_IDS: PlaceId[] = ['south', 'east', 'lapland', 'future'];
const SOIL_IDS: SoilId[] = ['loam', 'sandy', 'clay', 'peat', 'rocky'];
const SPECIES_IDS: SpeciesId[] = ['pine', 'spruce', 'birch'];

export class Metsani {
  active = false;
  private scene: ForestScene;
  private save: ForestSave = loadForest();
  private place: PlaceId = 'east';
  private soil: SoilId = 'loam';
  private species = new Set<SpeciesId>(['spruce']);
  private spacing: Spacing = 'normal';
  private forest: Forest | null = null;
  private prev = new Map<number, { h: number; d: number }>();
  private dying: Tree[] = [];
  private rec: YearRecord | undefined;
  private p = 0;
  private playing = true;
  private speed: Speed = 'normal';
  private shown: Results | null = null;
  private open: ResultKey | null = null;
  private selected: number | null = null;
  private time = 0;
  private screen: 'setup' | 'view' = 'setup';
  private empty: Forest | null = null;

  constructor(private host: MetsaniHost) {
    this.scene = new ForestScene($<HTMLCanvasElement>('forest'));
    const s = this.save;
    if (s.current) { this.place = s.current.place; this.soil = s.current.soil; }
    this.species = new Set(s.species);
    this.spacing = s.spacing;
    this.bind();
  }

  private get t() { return FOREST_TEXT[this.host.lang()]; }

  // ---------- entering and leaving ----------

  enter() {
    this.active = true;
    $('forest').hidden = false;
    this.scene.resize();
    if (this.save.current) this.showView(this.save.current); else this.showSetup();
  }

  exit() {
    this.persist();
    this.active = false;
    $('forest').hidden = true;
    $('m-setup').hidden = true;
    $('m-view').hidden = true;
    this.host.exit();
  }

  /** Escape goes one step back: card → view → setup → home. */
  escape() {
    if (this.selected !== null) { this.select(null); return; }
    if (this.screen === 'view') { this.persist(); this.showSetup(); return; }
    this.exit();
  }

  /** Redraw the words after a language change. */
  rerender() { if (this.screen === 'setup') this.renderSetup(); else this.renderView(); }

  pause() { if (this.active && this.screen === 'view') this.setPlaying(false); }

  resize() { this.scene.resize(); }

  // ---------- setup ----------

  private showSetup() {
    this.screen = 'setup';
    $('m-view').hidden = true;
    $('m-setup').hidden = false;
    this.renderSetup();
    requestAnimationFrame(() => $('m-setup-title').focus());
  }

  private renderSetup() {
    const t = this.t;
    $('m-setup-title').textContent = t.title;
    $('m-tagline').textContent = t.tagline;
    $('m-step-place').textContent = t.stepPlace;
    $('m-step-soil').textContent = t.stepSoil;
    $('m-step-trees').textContent = t.stepTrees;
    $('m-spacing-title').textContent = t.spacingTitle;
    $('m-places').innerHTML = PLACE_IDS.map(id =>
      `<button type="button" class="mcard" data-place="${id}" aria-pressed="${this.place === id}"><b>${t.places[id].name}</b><span>${t.places[id].words}</span></button>`).join('');
    $('m-soils').innerHTML = SOIL_IDS.map(id => {
      const s = SOILS[id];
      const water = Math.round(Math.min(1, s.waterCap / 200) * 5);
      const food = Math.round(s.nutrients * 5);
      const dots = (n: number) => '●'.repeat(n) + '○'.repeat(5 - n);
      return `<button type="button" class="mcard soil" data-soil="${id}" aria-pressed="${this.soil === id}">` +
        `<i class="swatch s-${id}" aria-hidden="true"></i><b>${t.soils[id].name}</b><span>${t.soils[id].words}</span>` +
        `<span class="meters"><span>${t.meterWater} <em class="w">${dots(water)}</em></span><span>${t.meterFood} <em>${dots(food)}</em></span></span></button>`;
    }).join('');
    $('m-species').innerHTML = SPECIES_IDS.map(id =>
      `<button type="button" class="mcard sp" data-species="${id}" aria-pressed="${this.species.has(id)}"><i class="sp-icon sp-${id}" aria-hidden="true"></i><b>${t.species[id].name}</b><span>${t.species[id].words}</span></button>`).join('');
    $('m-spacing').innerHTML = (Object.keys(SPACING) as Spacing[]).map(id =>
      `<button type="button" class="seg" data-spacing="${id}" aria-pressed="${this.spacing === id}">${t.spacing[id]}<small>${t.perHa(SPACING[id])}</small></button>`).join('');
    $('btn-m-plant').textContent = t.plant;
    $('m-pick-note').textContent = this.species.size ? '' : t.pickOne;
    $<HTMLButtonElement>('btn-m-plant').disabled = this.species.size === 0;
    const cur = this.save.current;
    $('btn-m-continue').hidden = !cur;
    if (cur) $('btn-m-continue').textContent = t.continueForest(cur.year);
    $('m-replace').textContent = cur ? t.replaceWarn : '';
    $('btn-m-setup-back').textContent = t.back;
    $('m-earlier-title').textContent = t.earlier;
    const past = this.save.past;
    $('m-earlier').innerHTML = past.length
      ? `<p class="note">${t.earlierNote}</p>` + past.map(p =>
        `<div class="r"><span><b>${t.soils[p.soil].name}</b> · ${t.places[p.place].name}<br><small>${t.speciesList(p.species.map(s => t.species[s].name))} · ${t.spacing[p.spacing]}</small></span>` +
        `<span class="tag">${t.summary(p.years, p.volume, p.co2)}</span></div>`).join('')
      : `<p class="note">${t.noEarlier}</p>`;
  }

  private plantNew() {
    if (!this.species.size) return;
    const old = this.save.current;
    if (old && old.year > 0) this.save = addPast(this.save, this.summary(old));
    const f = createForest({ seed: 'm' + Math.random().toString(36).slice(2, 9), place: this.place, soil: this.soil });
    const sp = [...this.species];
    plant(f, Object.fromEntries(sp.map(s => [s, 1])), this.spacing);
    this.save = { ...this.save, current: f, species: sp, spacing: this.spacing };
    this.persist();
    this.showView(f);
  }

  private summary(f: Forest) {
    const r = results(f);
    return {
      place: f.place, soil: f.soil, species: this.save.species, spacing: this.save.spacing, years: f.year,
      volume: Math.round(r.wood.standing), co2: Math.round(r.carbon.removed), life: r.life.score, health: r.health.score,
    };
  }

  // ---------- the forest view ----------

  private showView(f: Forest) {
    this.screen = 'view';
    this.forest = f;
    this.selected = null;
    this.open = null;
    this.shown = f.year > 0 ? results(f) : null;
    $('m-setup').hidden = true;
    $('m-view').hidden = false;
    this.beginYear();
    this.setPlaying(true);
    this.renderView();
    requestAnimationFrame(() => $('m-year').focus());
  }

  /** Step the model one year, and get ready to play it back from spring. */
  private beginYear() {
    const f = this.forest!;
    this.prev = new Map(f.trees.map(t => [t.id, { h: t.h, d: t.d }]));
    const before = f.trees.map(t => ({ ...t, c: { ...t.c } }));
    this.rec = stepYear(f);
    const alive = new Set(f.trees.map(t => t.id));
    this.dying = before.filter(t => !alive.has(t.id));
    if (this.selected !== null && !alive.has(this.selected)) this.select(null);
    this.p = 0;
  }

  /** The year has been played back: show its results and save. */
  private endYear() {
    const f = this.forest!;
    this.shown = results(f);
    this.persist();
    this.host.announce(this.t.yearDone(f.year, Math.round(this.shown.wood.standing)));
    this.renderView();
  }

  private jump(years: number) {
    if (!this.forest) return;
    // the year now playing counts as the first of the jump
    this.endYear();
    for (let i = 0; i < years - 2; i++) stepYear(this.forest);
    this.beginYear();
    this.endYear();
    this.beginYear();
  }

  private setPlaying(on: boolean) {
    this.playing = on;
    const b = $('btn-m-play');
    b.textContent = on ? 'II' : '▶';
    b.setAttribute('aria-label', on ? this.t.pause : this.t.play);
    b.setAttribute('aria-pressed', String(!on));
  }

  private setSpeed(s: Speed) {
    this.speed = s;
    this.setPlaying(true);
    this.renderControls();
  }

  update(dt: number) {
    if (!this.active) return;
    this.time += dt;
    if (this.screen === 'view' && this.forest) {
      // keep the trees clear of the bars at the top and bottom
      this.scene.insetTop = ($('m-view').querySelector('.mtop')?.getBoundingClientRect().bottom ?? 60) + 6;
      this.scene.insetBottom = innerHeight - $('m-bottom').getBoundingClientRect().top + 6;
      if (this.playing) {
        this.p += (dt / YEAR_SECONDS) * SPEEDS[this.speed];
        if (this.p >= 1) {
          this.p = 1;
          this.endYear();
          this.beginYear();
        }
      }
      this.renderClock();
      this.scene.draw({
        forest: this.forest, prev: this.prev, dying: this.dying, p: Math.min(0.999, this.p), rec: this.rec,
        selected: this.selected, time: this.time, reducedMotion: this.host.reducedMotion,
      }, dt);
    } else if (this.forest || this.save.current) {
      // the setup screen shows the forest faintly behind it
      const f = this.forest ?? this.save.current!;
      this.scene.draw({ forest: f, prev: new Map(), dying: [], p: 0.4, rec: f.history.at(-1), selected: null, time: this.time, reducedMotion: true }, dt);
    } else {
      if (this.empty?.place !== this.place || this.empty.soil !== this.soil) {
        this.empty = createForest({ seed: 'setup', place: this.place, soil: this.soil });
      }
      this.scene.draw({ forest: this.empty, prev: new Map(), dying: [], p: 0.4, rec: undefined, selected: null, time: this.time, reducedMotion: true }, dt);
    }
  }

  private lastClock = '';
  private renderClock() {
    const f = this.forest!;
    const { season } = seasonOf(Math.min(0.999, this.p));
    const yearN = (this.rec?.year ?? f.year - 1) + 1;
    const label = `${this.t.year(yearN)} · ${this.t.seasons[season]}`;
    if (label !== this.lastClock) {
      this.lastClock = label;
      $('m-year').textContent = label;
      $('m-drought').hidden = !(this.rec?.weather.drought && season !== 'spring');
    }
    $('m-marker').style.left = `${Math.min(99.5, this.p * 100)}%`;
  }

  private renderControls() {
    const t = this.t;
    $('btn-m-normal').textContent = '1×';
    $('btn-m-normal').setAttribute('aria-label', t.speedNormal);
    $('btn-m-normal').setAttribute('aria-pressed', String(this.speed === 'normal'));
    $('btn-m-fast').textContent = '10×';
    $('btn-m-fast').setAttribute('aria-label', t.speedFast);
    $('btn-m-fast').setAttribute('aria-pressed', String(this.speed === 'fast'));
    $('btn-m-jump').textContent = t.jump10;
    this.setPlaying(this.playing);
  }

  renderView() {
    if (!this.forest) return;
    const t = this.t;
    const f = this.forest;
    $('btn-m-back').setAttribute('aria-label', t.back);
    $('m-where').textContent = `${t.places[f.place].name} · ${t.soils[f.soil].name}`;
    $('m-drought').textContent = t.drought;
    $('m-seasons').innerHTML = (['spring', 'summer', 'autumn', 'winter'] as const).map(s => `<span>${t.seasons[s]}</span>`).join('');
    $<HTMLCanvasElement>('forest').setAttribute('aria-label', t.canvasLabel);
    this.lastClock = '';
    this.renderControls();
    this.renderResults();
    this.renderCard();
  }

  private renderResults() {
    const t = this.t;
    const r = this.shown;
    const fmt = (n: number) => Math.round(n).toLocaleString(this.host.lang() === 'fi' ? 'fi-FI' : 'en-GB');
    const leaves = (s: number) => '<span class="leaves" aria-hidden="true">' + Array.from({ length: 5 }, (_, i) =>
      `<i class="${s >= i + 1 ? 'on' : s >= i + 0.5 ? 'half' : ''}"></i>`).join('') + '</span>';
    const tiles: [ResultKey, string, string][] = [
      ['wood', r ? fmt(r.wood.standing) : '0', 'm³/ha'],
      ['carbon', r ? fmt(r.carbon.removed) : '0', 't CO₂/ha'],
      ['life', r ? leaves(r.life.score) : leaves(0.5), r ? t.scoreOf(r.life.score) : ''],
      ['health', r ? leaves(r.health.score) : leaves(5), r ? t.scoreOf(r.health.score) : ''],
      ['products', r && (r.products.sawn + r.products.paper + r.products.energy) > 0 ? fmt(r.products.sawn + r.products.paper) : '–', r && r.products.sawn > 0 ? 't CO₂' : t.productsNone],
    ];
    $('m-results').innerHTML = tiles.map(([k, v, unit]) =>
      `<button type="button" class="res res-${k}" data-result="${k}" aria-expanded="${this.open === k}" aria-controls="m-explain">` +
      `<span class="rl">${t.results[k]}</span><b>${v}</b><small>${unit}</small></button>`).join('');
    const ex = $('m-explain');
    ex.hidden = !this.open;
    if (!this.open) return;
    ex.innerHTML = this.explain(this.open, r);
  }

  private explain(k: ResultKey, r: Results | null): string {
    const t = this.t;
    const fmt = (n: number) => Math.round(n).toLocaleString(this.host.lang() === 'fi' ? 'fi-FI' : 'en-GB');
    if (!r) return `<p>${k === 'products' ? t.explain.products : t.explain.life.young}</p>`;
    switch (k) {
      case 'wood': return `<p>${t.explain.wood(fmt(r.wood.standing))}</p>`;
      case 'carbon': {
        const c = r.carbon;
        const total = Math.max(1, c.trees + c.dead + c.soil + c.products);
        const bar = (['trees', 'dead', 'soil', 'products'] as const).map(s =>
          `<span class="cb cb-${s}" style="width:${(c[s] / total) * 100}%"></span>`).join('');
        return `<p>${t.explain.carbon(fmt(c.removed), fmt(c.trees), fmt(c.soil))}</p>` +
          (c.removed < 0 ? `<p>${t.explain.carbonNeg}</p>` : '') +
          `<div class="cbar" aria-hidden="true">${bar}</div>`;
      }
      case 'life': return `<p>${t.explain.life[r.life.reason]}</p>`;
      case 'health': return `<p>${t.explain.health[r.health.reason]}</p>`;
      case 'products': return `<p>${t.explain.products}</p>`;
    }
  }

  // ---------- trees ----------

  private select(id: number | null) {
    this.selected = id;
    this.renderCard();
  }

  private renderCard() {
    const card = $('m-card');
    const tree = this.forest?.trees.find(t => t.id === this.selected);
    card.hidden = !tree;
    $('m-tap-hint').textContent = this.t.tapTree;
    $('m-tap-hint').hidden = !!tree || (this.forest?.year ?? 0) > 3;
    if (!tree) return;
    const t = this.t;
    const sp = SPECIES[tree.sp];
    const lang = this.host.lang();
    const n1 = (x: number) => x.toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-GB', { maximumFractionDigits: 1 });
    const carbon = tree.c.wood + tree.c.foliage + tree.c.fine;
    const vol = stemVolume(sp, tree.d, tree.h);
    const light = tree.vigor > 0.75 ? t.card.light.good : tree.vigor > 0.45 ? t.card.light.some : t.card.light.poor;
    $('m-card-title').textContent = t.species[tree.sp].name;
    $('m-card-sub').textContent = `${t.card.planted(tree.born + 1, tree.age)} · ${light}`;
    const rows: [string, string][] = [
      [t.card.height, `${n1(tree.h)} m`],
      [t.card.diameter, tree.d > 0 ? `${n1(tree.d)} cm` : '–'],
      [t.card.wood, vol >= 0.1 ? `${n1(vol)} m³` : `${Math.round(vol * 1000)} l`],
      [t.card.carbon, `${n1(carbon)} kg`],
      [t.card.co2, `${n1(carbon * CO2_PER_C)} kg`],
    ];
    $('m-card-stats').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    $('m-card-note').textContent = tree.d > 0 ? t.card.rings : t.card.seedling;
    $('btn-m-card-close').setAttribute('aria-label', t.card.close);
    drawRings($<HTMLCanvasElement>('m-rings'), tree.rings);
  }

  /** Arrow keys move between trees when the forest has focus. */
  private cycle(dir: number) {
    const trees = [...(this.forest?.trees ?? [])].sort((a, b) => a.x - b.x);
    if (!trees.length) return;
    const i = trees.findIndex(t => t.id === this.selected);
    const next = trees[(i + dir + trees.length) % trees.length];
    this.select(next.id);
    this.host.announce(`${this.t.species[next.sp].name}, ${next.h.toFixed(1)} m`);
  }

  private persist() {
    if (this.forest) this.save = { ...this.save, current: this.forest };
    storeForest(this.save);
  }

  /** Forget everything in memory (the save itself is removed by the host). */
  reset() {
    this.save = loadForest();
    this.forest = null;
  }

  // ---------- events ----------

  private bind() {
    document.addEventListener('click', (e) => {
      if (!this.active) return;
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.place) { this.place = b.dataset.place as PlaceId; this.renderSetup(); return; }
      if (b.dataset.soil) { this.soil = b.dataset.soil as SoilId; this.renderSetup(); return; }
      if (b.dataset.species) {
        const s = b.dataset.species as SpeciesId;
        if (this.species.has(s)) this.species.delete(s); else this.species.add(s);
        this.renderSetup();
        return;
      }
      if (b.dataset.spacing) { this.spacing = b.dataset.spacing as Spacing; this.renderSetup(); return; }
      if (b.dataset.result) {
        const k = b.dataset.result as ResultKey;
        this.open = this.open === k ? null : k;
        this.renderResults();
        (document.querySelector(`[data-result="${k}"]`) as HTMLElement | null)?.focus();
        return;
      }
      switch (b.id) {
        case 'btn-m-plant': this.plantNew(); break;
        case 'btn-m-continue': if (this.save.current) this.showView(this.save.current); break;
        case 'btn-m-setup-back': this.exit(); break;
        case 'btn-m-back': this.persist(); this.showSetup(); break;
        case 'btn-m-play': this.setPlaying(!this.playing); break;
        case 'btn-m-normal': this.setSpeed('normal'); break;
        case 'btn-m-fast': this.setSpeed('fast'); break;
        case 'btn-m-jump': this.jump(10); break;
        case 'btn-m-card-close': this.select(null); $('forest').focus(); break;
      }
    });
    const cv = $<HTMLCanvasElement>('forest');
    cv.addEventListener('pointerdown', (e) => {
      if (!this.active || this.screen !== 'view') return;
      const r = cv.getBoundingClientRect();
      const id = this.scene.hit(e.clientX - r.left, e.clientY - r.top);
      this.select(id);
    });
    cv.addEventListener('keydown', (e) => {
      if (!this.active || this.screen !== 'view') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); this.cycle(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.cycle(-1); }
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active || this.screen !== 'view') return;
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); this.setPlaying(!this.playing); }
    });
  }

  /** For automated tests and screenshots only. */
  debug() {
    return {
      enter: () => this.enter(),
      plant: (place: PlaceId, soil: SoilId, species: SpeciesId[], spacing: Spacing = 'normal') => {
        this.place = place; this.soil = soil; this.species = new Set(species); this.spacing = spacing; this.plantNew();
      },
      jump: (n: number) => this.jump(n),
      at: (p: number) => { this.p = p; this.setPlaying(false); },
      select: (id: number | null) => this.select(id),
      state: () => ({ year: this.forest?.year, p: this.p, trees: this.forest?.trees.map(t => t.id) ?? [], results: this.shown }),
      treeBase: (id: number) => this.forest ? this.scene.treeBase(this.forest, id) : null,
    };
  }
}

/** The trunk's cross-section with one ring per year (widths from the model). */
function drawRings(cv: HTMLCanvasElement, rings: number[]) {
  const c = cv.getContext('2d')!;
  const S = cv.width;
  c.clearRect(0, 0, S, S);
  const R = S / 2 - 4;
  if (!rings.length) {
    c.fillStyle = '#7da24e';
    c.beginPath(); c.arc(S / 2, S / 2, 10, 0, Math.PI * 2); c.fill();
    return;
  }
  const total = rings.reduce((a, b) => a + Math.max(0.2, b), 0);
  c.fillStyle = '#5b4636';
  c.beginPath(); c.arc(S / 2, S / 2, R + 3, 0, Math.PI * 2); c.fill();
  let r = R;
  for (let i = rings.length - 1; i >= 0; i--) {
    c.fillStyle = i % 2 ? '#e9c88e' : '#f3d9a8';
    c.beginPath(); c.arc(S / 2, S / 2, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#a57a45';
    c.lineWidth = 1;
    c.stroke();
    r -= (Math.max(0.2, rings[i]) / total) * R;
  }
  c.fillStyle = '#7a5530';
  c.beginPath(); c.arc(S / 2, S / 2, 2.5, 0, Math.PI * 2); c.fill();
}

