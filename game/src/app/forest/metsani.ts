/**
 * Metsäni: choose a place, a soil and the trees, then watch the forest live
 * through the years. Tap a tree for its card. Five results are always shown
 * together, each with its main reason. Tikka asks questions when the forest
 * calls for one (F2), a short report closes each year, and "What if?" runs
 * two copies of the forest side by side with the same weather.
 *
 * The model steps a whole year at once (core/forest); this view then plays
 * that year back through spring, summer, autumn and winter, growing each tree
 * from last year's size to this year's during the summer. A question is
 * asked at the end of the year it belongs to, before the next one is stepped.
 */
import { num } from '../format';
import { discover, forestFinds } from '../atlas';
import type { TreeMods } from '../../core/season';
import {
  CO2_PER_C, PLANTABLE, SOILS, SPACING, SPECIES, applyChoice, createForest, plant, presentAnimals,
  applyZoom, canZoom, results, standStats, stemVolume, stepYear,
  yearReport, zoomSeason, ensureMyBirch, myBirch, plantMyBirch, isHint, resolveHint, canGive, giveMyBirch, type ZoomSeason,
  type AnimalId, type ChoiceId, type Decision, type Forest, type ItemId, type PlaceId, type Results, type SoilId,
  type SortBin, type SpeciesId, type Spacing, type Tree, type YearRecord, type YearReport,
} from '../../core/forest';
import { Factory, HARVESTS } from './factory';
import { Tools } from './tools';
import { Lab } from './lab';
import { VillageView } from './villageview';
import { MapView } from './mapview';
import { MAP_TEXT } from './maptext';
import { VILLAGE_TEXT } from './villagetext';
import { LAB_TEXT } from './labtext';
import { drawTikka } from '../scene/tikka';
import type { Lang } from '../text';
import type { Sound } from '../audio';
import { artListed, artVersion } from './art';
import { ForestScene, forestBudget, seasonOf } from './scene';
import { addPast, loadForest, storeForest, type ForestSave } from './save';
import { FOREST_TEXT } from './text';
import { AFTER_YEAR, QUIZ, QUIZ_UI, loadTally, quizOn, record, saveTally } from './quiz';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Seconds per year at normal speed: four seasons of about ten seconds. */
export const YEAR_SECONDS = 40;
const SPEEDS = { normal: 1, fast: 10 } as const;
type Speed = keyof typeof SPEEDS;
type ResultKey = 'wood' | 'carbon' | 'life' | 'health' | 'products';
/** Causes worth a card even at high speed. */
const NOTABLE = new Set(['storm', 'beetle', 'thinned', 'clearcut', 'cc', 'salvaged', 'tended', 'animal', 'drought', 'moose']);

export interface MetsaniHost {
  lang(): Lang;
  announce(text: string): void;
  exit(): void;
  /** play a Kasva! summer for one birch; `done` gets the score and returns a line for the results */
  zoomIn(z: ZoomSeason, done: (storedG: number) => string): void;
  reducedMotion: boolean;
  /** forest sounds (planting, felling, the truck, the village) */
  sound: Pick<Sound, 'plant' | 'tag' | 'thud' | 'truck' | 'recycle' | 'give'>;
}

type TipKey = 'start' | 'results' | 'fast' | 'zoom' | 'whatIf' | 'shelf';

const PLACE_IDS: PlaceId[] = ['south', 'east', 'lapland', 'future'];
const SOIL_IDS: SoilId[] = ['loam', 'sandy', 'clay', 'peat', 'rocky'];

/** One forest on screen, with its own scene and playback state. */
export interface Lane {
  f: Forest;
  scene: ForestScene;
  prev: Map<number, { h: number; d: number }>;
  dying: Tree[];
  rec: YearRecord | undefined;
  before: Results | null;
  shown: Results | null;
  report: YearReport | null;
  animals: AnimalId[];
  /** the choice that made this lane different, in "What if?" */
  choice?: ChoiceId;
}

/** Screens that pause the forest while open. */
export type Overlay = 'sort' | 'felling' | 'travel' | 'mills' | 'shelf' | 'quiz' | 'village' | 'map' | null;

/** A question on screen: Tikka's, or the child's own "What if?". */
interface Asking { d: Decision | { kind: 'whatif'; year: number; choices: ChoiceId[] }; lane: number }

export class Metsani {
  active = false;
  private canvas: HTMLCanvasElement;
  private save: ForestSave = loadForest();
  private place: PlaceId = 'east';
  private soil: SoilId = 'loam';
  private species = new Set<SpeciesId>(['spruce']);
  private spacing: Spacing = 'normal';
  private lanes: Lane[] = [];
  private p = 0;
  private playing = true;
  private speed: Speed = 'normal';
  private open: { k: ResultKey; lane: number } | null = null;
  private selected: { id: number; lane: number } | null = null;
  private time = 0;
  private screen: 'setup' | 'view' | 'lab' = 'setup';
  /** where the question cards were opened from */
  private labFrom: 'setup' | 'view' = 'setup';
  /** playing the sandbox forest (Phase 10), not the child's own */
  private sandboxMode = false;
  private empty: Forest | null = null;
  private setupScene: ForestScene;
  private factory: Factory;
  private tools: Tools;
  private lab: Lab;
  private villageView: VillageView;
  private mapView: MapView;
  /** years a hint has been open (it passes after one more year) */
  private hintAge = 0;
  private asking: Asking | null = null;
  /** "What if?": the first pick waits here until the second is made */
  private compareOn = false;
  private pickA: ChoiceId | null = null;
  private planting = false;
  private reportTimer = 0;
  /** forest-to-factory screens: they pause the forest while open */
  private overlay: Overlay = null;
  private quiz: { phase: 'before' | 'after'; i: number; answers: number[]; then: () => void } | null = null;
  /** this device's class-question stage, read once when Metsäni opens */
  private quizStage: 'before' | 'after' | 'done' | 'off' = 'off';

  constructor(private host: MetsaniHost) {
    this.canvas = $<HTMLCanvasElement>('forest');
    this.setupScene = new ForestScene(this.canvas);
    this.factory = new Factory({
      t: () => this.t,
      main: () => this.main,
      lanes: () => this.lanes,
      overlay: () => this.overlay,
      setOverlay: (v) => { this.overlay = v; if (v === null) this.comeHome(); },
      spacing: () => this.spacing,
      reducedMotion: this.host.reducedMotion,
      mix: () => this.mix(),
      setPlaying: (on) => this.setPlaying(on),
      afterChoice: () => this.afterChoice(),
      renderSheet: () => this.renderSheet(),
      asking: () => !!this.asking,
      fell: (trees, planted, done) => {
        const m = this.main!;
        $('m-decide').hidden = true;
        this.tools.render();
        m.scene.focus(null);
        // the loaded truck drives out along the road and the camera goes with it to the mills
        m.scene.fell(trees, () => { m.scene.spawn(planted, 0.02); m.scene.travel('mills', 'logs', done); });
      },
    });
    this.tools = new Tools({
      t: () => this.t,
      main: () => this.main,
      comparing: () => this.comparing,
      setPlaying: (on) => this.setPlaying(on),
      persist: () => this.persist(),
      refresh: () => { this.renderCard(); this.describe(); },
      tag: (keep, pan) => this.host.sound.tag(keep, pan),
      cutMarked: () => this.factory.startSort('cutMarked'),
      announce: (s) => this.host.announce(s),
    });
    this.lab = new Lab({
      lang: () => this.host.lang(),
      announce: (s) => this.host.announce(s),
      reducedMotion: this.host.reducedMotion,
      canvas: this.canvas,
      done: () => this.save.lab ?? {},
      record: (id, r) => { this.save = { ...this.save, lab: { ...(this.save.lab ?? {}), [id]: r } }; storeForest(this.save); },
      exit: () => this.leaveLab(),
    });
    this.villageView = new VillageView({
      lang: () => this.host.lang(),
      t: () => this.t,
      forest: () => this.main?.f,
      setOverlay: (on) => { this.overlay = on ? 'village' : null; if (on) this.setPlaying(false); else this.comeHome(); },
      persist: () => this.persist(),
      refresh: () => { const m = this.main; if (m) { m.shown = results(m.f); this.renderView(); } },
      announce: (s) => this.host.announce(s),
      chime: (k) => { if (k === 'give') this.host.sound.give(); else this.host.sound.recycle(); },
    });
    this.mapView = new MapView({
      lang: () => this.host.lang(),
      t: () => this.t,
      forest: () => this.main?.f,
      setOverlay: (on) => { this.overlay = on ? 'map' : null; if (on) this.setPlaying(false); },
      announce: (s) => this.host.announce(s),
    });
    const s = this.save;
    if (s.current) { this.place = s.current.place; this.soil = s.current.soil; }
    this.species = new Set(s.species);
    this.spacing = s.spacing;
    // forests from before Phase 6 adopt a birch as the player's own
    if (s.current && !s.current.birch) { ensureMyBirch(s.current); storeForest(s); }
    this.bind();
  }

  private get t() { return FOREST_TEXT[this.host.lang()]; }
  private get main(): Lane | undefined { return this.lanes[0]; }
  private get comparing() { return this.lanes.length > 1; }

  // ---------- entering and leaving ----------

  enter() {
    this.active = true;
    this.quizStage = quizOn() ? loadTally().stage : 'off';
    this.canvas.hidden = false;
    this.setupScene.resize();
    this.sandboxMode = false;
    if (this.save.current) this.showView(this.save.current); else this.showSetup();
  }

  exit() {
    this.persist();
    if (this.lab.active) this.lab.close();
    this.active = false;
    this.canvas.hidden = true;
    $('m-setup').hidden = true;
    $('m-view').hidden = true;
    this.host.exit();
  }

  /** Open the question cards (Phase 8), or one card from a teacher's link. */
  openLab(id?: string) {
    if (!this.active) { this.active = true; this.quizStage = quizOn() ? loadTally().stage : 'off'; this.canvas.hidden = false; }
    if (this.screen !== 'lab') this.labFrom = this.screen === 'view' && this.main ? 'view' : 'setup';
    this.setPlaying(false);
    this.select(null);
    this.screen = 'lab';
    $('m-setup').hidden = true;
    $('m-view').hidden = true;
    this.lab.open(id);
  }

  /** Back from the question cards to where they were opened. */
  private leaveLab() {
    if (this.labFrom === 'view' && this.main) {
      this.screen = 'view';
      $('m-view').hidden = false;
      for (const l of this.lanes) l.scene.resize();
      this.renderView();
      this.setPlaying(true);
      requestAnimationFrame(() => $('btn-m-lab').focus());
    } else this.showSetup();
  }

  /** Step aside for a Kasva! summer, keeping everything as it is. */
  private suspend() {
    this.persist();
    this.active = false;
    this.setPlaying(false);
    this.canvas.hidden = true;
    $('m-view').hidden = true;
  }

  /** Come back from a Kasva! summer. */
  resume() {
    this.active = true;
    this.canvas.hidden = false;
    $('m-view').hidden = false;
    for (const l of this.lanes) l.scene.resize();
    this.renderView();
    requestAnimationFrame(() => $('m-card').hidden ? $('m-year').focus() : $('m-card-title').focus());
  }

  private zoom() {
    const sel = this.selected;
    const lane = sel ? this.lanes[sel.lane] : undefined;
    const tree = lane?.f.trees.find(t => t.id === sel!.id);
    if (!lane || !tree || !lane.rec || !canZoom(tree, lane.rec)) return;
    const rec = lane.rec;
    const z = zoomSeason(lane.f, tree, rec);
    this.suspend();
    this.host.zoomIn(z, (g) => {
      const mm = applyZoom(lane.f, tree.id, g, z.expectedG, rec.year);
      lane.shown = results(lane.f);
      this.persist();
      const t = this.t;
      const f = (x: number) => num(Math.abs(x), 1);
      return mm > 0.05 ? t.zoomUp(f(mm)) : mm < -0.05 ? t.zoomDown(f(mm)) : t.zoomSame;
    });
  }

  // ---------- your birch, from the home screen (Phase 6) ----------

  /** Your birch and its forest, for the home screen; null before the first forest. */
  birchStatus(): { year: number; h: number; question: boolean } | null {
    const f = this.save.current;
    const b = f && myBirch(f);
    if (!f || !b) return null;
    return { year: f.year, h: b.h, question: !!f.pending && !isHint(f.pending.kind) };
  }

  /**
   * Live one more year in your forest, then hand back your birch's Kasva!
   * summer for that year. `base` is your own grown birch (roots, leaves,
   * trunk). Null if there is no forest yet, or Tikka is waiting for an answer.
   */
  birchSummer(base: TreeMods): { z: ZoomSeason; done: (storedG: number) => string } | null {
    const f = this.save.current;
    if (!f || this.active) return null;
    resolveHint(f);
    if (f.pending) return null;
    const rec = stepYear(f);
    const b = myBirch(f)!;
    const z = zoomSeason(f, b, rec, base);
    storeForest(this.save);
    return {
      z,
      done: (g) => {
        const mm = applyZoom(f, b.id, g, z.expectedG, rec.year);
        storeForest(this.save);
        discover(forestFinds(f));
        const t = this.t;
        const lines: string[] = [];
        if (rec.birch === 'passed') lines.push(t.birchPassed);
        if (rec.birch === 'seeded' || rec.birch === 'planted') lines.push(t.birchSeeded);
        const fm = (x: number) => num(Math.abs(x), 1);
        lines.push(b.h < 1.3 ? t.birchSmall : mm > 0.05 ? t.zoomUp(fm(mm)) : mm < -0.05 ? t.zoomDown(fm(mm)) : t.zoomSame);
        return lines.join(' ');
      },
    };
  }

  // ---------- Tikka's tips and the spoken description ----------

  /** Show one of Tikka's tips, once ever. Returns false if already seen or the card is busy. */
  private tip(key: TipKey): boolean {
    const seen = this.save.tips ?? [];
    if (seen.includes(key) || !$('m-report').hidden) return false;
    this.save = { ...this.save, tips: [...seen, key] };
    storeForest(this.save);
    $('m-report-title').textContent = this.t.tikka;
    $('m-report-body').innerHTML = `<p>${this.t.tips[key]}</p>`;
    $('btn-m-report-close').textContent = this.t.reportClose;
    $('m-report').hidden = false;
    face($<HTMLCanvasElement>('m-report-face'));
    this.reportTimer = 12;
    this.host.announce(this.t.tips[key]);
    return true;
  }

  /** The tip that fits this moment, if any. */
  private maybeTip() {
    const m = this.main;
    if (!m || this.comparing || this.sandboxMode) return;
    const y = m.f.year;
    if (y <= 1) { this.tip('start'); return; }
    if (y >= 3 && this.tip('results')) return;
    if (y >= 5 && this.tip('fast')) return;
    if (m.f.harvests.some(h => h.harvest.count > 0) && this.tip('shelf')) return;
    if (y >= 6 && m.f.trees.some(t => t.sp === 'birch' && t.h >= 1.3) && this.tip('zoom')) return;
    if (y >= 15) this.tip('whatIf');
  }

  /** A short text of what the forest looks like, for screen readers. */
  private describe() {
    const m = this.main;
    if (!m) return;
    const t = this.t;
    const f = m.f;
    const counts = new Map<SpeciesId, number>();
    for (const tr of f.trees) counts.set(tr.sp, (counts.get(tr.sp) ?? 0) + 1);
    const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([sp, n]) => `${t.species[sp].name.toLowerCase()} ${n}`);
    const tallest = standStats(f.trees).domH;
    const { season } = seasonOf(Math.min(0.999, this.p));
    const animals = m.animals.map(a => t.animals[a][0].toLowerCase()).join(', ');
    $('m-desc').textContent = t.describe((m.rec?.year ?? f.year - 1) + 1, t.seasons[season].toLowerCase(),
      `${t.places[f.place].name}, ${t.soils[f.soil].name.toLowerCase()}`, t.treesOf(f.trees.length, parts),
      num(tallest), f.logs.length, animals);
  }

  /** Escape goes one step back: sheet → card → view → setup → home. */
  escape() {
    if (this.screen === 'lab') { this.lab.escape(); return; }
    if (this.overlay === 'quiz') return;
    if (this.overlay === 'village') { this.villageView.escape(); return; }
    if (this.overlay === 'map') { this.mapView.escape(); return; }
    if (this.overlay === 'shelf') { if (this.factory.tracing) { this.factory.tracing = null; this.factory.renderShelf(); } else this.factory.closeShelf(); return; }

    if (this.overlay === 'felling' || this.overlay === 'travel') { this.skipShow(); return; }
    if (this.overlay === 'mills') { this.factory.leaveMills(); return; }
    if (this.overlay === 'sort') { this.factory.cancelSort(); return; }
    if (this.asking && this.asking.d.kind === 'whatif') { this.closeSheet(); return; }
    if (this.asking && this.compareOn) { this.compareOn = false; this.pickA = null; this.renderSheet(); return; }
    if (this.planting) { this.planting = false; this.renderSheet(); return; }
    if (!$('m-report').hidden) { $('m-report').hidden = true; return; }
    if (this.selected) { this.select(null); return; }
    if (this.screen === 'view' && !this.asking) { this.persist(); this.showSetup(); return; }
    if (this.screen === 'setup') this.exit();
  }

  /** Redraw the words after a language change. */
  rerender() { if (this.screen === 'lab') this.lab.rerender(); else if (this.screen === 'setup') this.renderSetup(); else this.renderView(); }

  pause() { if (this.active && this.screen === 'view') this.setPlaying(false); if (this.screen === 'lab') this.lab.pause(); }

  resize() { this.setupScene.resize(); this.lab.resize(); }

  // ---------- setup ----------

  private showSetup() {
    this.sandboxMode = false;
    this.screen = 'setup';
    this.lanes = this.lanes.slice(0, 1);
    $('m-view').hidden = true;
    $('m-setup').hidden = false;
    this.setupScene.resize();
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
    $('m-species').innerHTML = this.speciesCards();
    $('m-spacing').innerHTML = this.spacingButtons();
    $('btn-m-plant').textContent = t.plant;
    $('m-pick-note').textContent = this.species.size ? '' : t.pickOne;
    $<HTMLButtonElement>('btn-m-plant').disabled = this.species.size === 0;
    const cur = this.save.current;
    $('btn-m-continue').hidden = !cur;
    if (cur) $('btn-m-continue').textContent = t.continueForest(cur.year);
    $('m-replace').textContent = cur ? t.replaceWarn : '';
    $('btn-m-setup-back').textContent = t.back;
    $('btn-m-setup-lab').textContent = LAB_TEXT[this.host.lang()].open;
    $('btn-m-sandbox').textContent = MAP_TEXT[this.host.lang()].sandboxStart;
    $('m-sand-intro').textContent = MAP_TEXT[this.host.lang()].sandboxIntro;
    $('m-earlier-title').textContent = t.earlier;
    const past = this.save.past;
    $('m-earlier').innerHTML = past.length
      ? `<p class="note">${t.earlierNote}</p>` + past.map(p =>
        `<div class="r"><span><b>${t.soils[p.soil].name}</b> · ${t.places[p.place].name}<br><small>${t.speciesList(p.species.map(s => t.species[s].name))} · ${t.spacing[p.spacing]}</small></span>` +
        `<span class="tag">${t.summary(p.years, p.volume, p.co2)}</span></div>`).join('')
      : `<p class="note">${t.noEarlier}</p>`;
  }

  private speciesCards() {
    const t = this.t;
    return PLANTABLE.map(id =>
      `<button type="button" class="mcard sp" data-species="${id}" aria-pressed="${this.species.has(id)}"><i class="sp-icon sp-${id}" aria-hidden="true"></i><b>${t.species[id].name}</b><span>${t.species[id].words}</span></button>`).join('');
  }

  private spacingButtons() {
    const t = this.t;
    return (Object.keys(SPACING) as Spacing[]).map(id =>
      `<button type="button" class="seg" data-spacing="${id}" aria-pressed="${this.spacing === id}">${t.spacing[id]}<small>${t.perHa(SPACING[id])}</small></button>`).join('');
  }

  private mix() { return Object.fromEntries([...this.species].map(s => [s, 1])) as Partial<Record<SpeciesId, number>>; }

  private plantNew() {
    if (!this.species.size) return;
    const old = this.save.current;
    if (old && old.year > 0) this.save = addPast(this.save, this.summary(old));
    const f = createForest({ seed: 'm' + Math.random().toString(36).slice(2, 9), place: this.place, soil: this.soil });
    plant(f, this.mix(), this.spacing);
    plantMyBirch(f);
    this.save = { ...this.save, current: f, species: [...this.species], spacing: this.spacing };
    this.persist();
    // 2.5D: the new seedlings pop up out of the ground one after another
    const go = () => { this.showView(f); this.main?.scene.spawn(f.trees.map(t => t.id), Math.min(0.05, 1.5 / f.trees.length)); };
    if (this.quizStage === 'before') this.askQuiz('before', go);
    else go();
  }

  private summary(f: Forest) {
    const r = results(f);
    return {
      place: f.place, soil: f.soil, species: this.save.species, spacing: this.save.spacing, years: f.year,
      volume: Math.round(r.wood.standing), co2: Math.round(r.carbon.removed), life: r.life.score, health: r.health.score,
    };
  }

  // ---------- lanes and years ----------

  private newLane(f: Forest): Lane {
    const scene = new ForestScene(this.canvas);
    const snd = this.host.sound;
    scene.onSound = (kind, pan) => { if (kind === 'plant') snd.plant(pan); else if (kind === 'thud') snd.thud(pan); else snd.truck(); };
    return {
      f, scene, prev: new Map(), dying: [], rec: f.history.at(-1),
      before: null, shown: f.year > 0 ? results(f) : null, report: null, animals: presentAnimals(f),
    };
  }

  private showView(f: Forest) {
    this.screen = 'view';
    this.lanes = [this.newLane(f)];
    this.lanes[0].scene.resize();
    this.selected = null;
    this.open = null;
    this.asking = null;
    $('m-setup').hidden = true;
    $('m-view').hidden = false;
    $('m-report').hidden = true;
    this.renderView();
    // a question left open when the forest was saved comes back first
    $('m-hint').hidden = true;
    if (f.pending && isHint(f.pending.kind)) { this.p = 0.999; this.showHint(); this.setPlaying(true); }
    else if (f.pending) { this.p = 0.999; this.ask({ d: f.pending, lane: 0 }); }
    else { this.beginYear(); this.setPlaying(true); this.maybeTip(); }
    requestAnimationFrame(() => $('m-year').focus());
  }

  /** Step every forest one year, and get ready to play it back from spring. */
  private beginYear() {
    // a hint stays open through one more year of the forest, then passes as "leave it as it is"
    if (this.main?.f.pending && isHint(this.main.f.pending.kind) && this.hintAge++ >= 1) {
      for (const l of this.lanes) resolveHint(l.f);
      $('m-hint').hidden = true;
    }
    for (const l of this.lanes) {
      const f = l.f;
      l.prev = new Map(f.trees.map(t => [t.id, { h: t.h, d: t.d }]));
      l.before = l.shown;
      const before = f.trees.map(t => ({ ...t, c: { ...t.c } }));
      l.rec = stepYear(f);
      const alive = new Set(f.trees.map(t => t.id));
      l.dying = before.filter(t => !alive.has(t.id));
    }
    if (this.selected && !this.lanes[this.selected.lane]?.f.trees.some(t => t.id === this.selected!.id)) this.select(null);
    this.p = 0;
  }

  /** The year has been played back: results, report, save; then a question or the next year. */
  private endYear(quiet = false) {
    for (const l of this.lanes) {
      l.shown = results(l.f);
      l.report = l.rec ? yearReport(l.f, l.rec, l.before, l.shown) : null;
      l.animals = presentAnimals(l.f);
    }
    this.persist();
    const m = this.main!;
    if (!quiet) {
      this.host.announce(this.t.yearDone(m.f.year, Math.round(m.shown!.wood.standing)));
      this.showReport();
      if ($('m-report').hidden) this.maybeTip();
    }
    this.renderView();
    const i = this.lanes.findIndex(l => l.f.pending);
    if (i >= 0) {
      const d = this.lanes[i].f.pending!;
      // Phase 7: most of Tikka's questions are hints, and the forest goes on
      if (!this.comparing && isHint(d.kind)) {
        // in the sandbox Tikka asks nothing: a hint simply passes
        if (this.sandboxMode) { for (const l of this.lanes) if (l.f.pending && isHint(l.f.pending.kind)) resolveHint(l.f); return true; }
        this.showHint(); return true;
      }
      this.ask({ d, lane: i });
      return false;
    }
    return true;
  }

  /** Tikka's suggestion, without stopping the forest. */
  private showHint() {
    const m = this.main;
    const d = m?.f.pending;
    if (!m || !d) return;
    const t = this.t;
    const n = d.kind === 'storm' || d.kind === 'beetle' ? m.rec?.events?.find(e => e.kind === d.kind)?.count ?? 0 : 0;
    $('m-hint-who').textContent = t.hint.who;
    $('m-hint-q').textContent = t.questions[d.kind](n);
    $('m-hint-note').textContent = t.hint.note;
    $('btn-m-hint-choices').textContent = t.hint.choices;
    $('btn-m-hint-mark').textContent = t.hint.mark;
    $('btn-m-hint-mark').hidden = !(d.kind === 'young' || d.kind === 'crowded' || d.kind === 'mature');
    $('btn-m-hint-later').textContent = t.hint.later;
    this.hintAge = 0;
    $('m-report').hidden = true;
    $('m-hint').hidden = false;
    face($<HTMLCanvasElement>('m-hint-face'));
    this.host.announce(`${t.hint.who}: ${$('m-hint-q').textContent}`);
  }

  // ---------- the before/after class question ----------

  private askQuiz(phase: 'before' | 'after', then: () => void) {
    this.quiz = { phase, i: 0, answers: [], then };
    this.overlay = 'quiz';
    // the questions sit inside the forest view; before the first forest only they are shown
    $('m-setup').hidden = true;
    $('m-view').hidden = false;
    $('m-view').classList.toggle('quiz-only', phase === 'before');
    $('m-quiz').hidden = false;
    this.renderQuiz();
    requestAnimationFrame(() => $('m-quiz-title').focus());
  }

  private renderQuiz() {
    const q = this.quiz;
    if (!q) return;
    const lang = this.host.lang();
    const u = QUIZ_UI[lang];
    const item = QUIZ[lang][q.i];
    $('m-quiz-title').textContent = u.title(q.phase);
    $('m-quiz-note').textContent = u.note;
    $('m-quiz-of').textContent = u.of(q.i + 1, QUIZ[lang].length);
    $('m-quiz-q').textContent = item.q;
    $('m-quiz-options').innerHTML = item.options.map((o, k) => `<button type="button" class="choice" data-qa="${k}"><b>${o}</b></button>`).join('');
  }

  private answerQuiz(k: number) {
    const q = this.quiz;
    if (!q) return;
    q.answers.push(k);
    q.i++;
    if (q.i < QUIZ.fi.length) { this.renderQuiz(); $('m-quiz-q').focus(); return; }
    const tally = record(loadTally(), q.phase, q.answers);
    saveTally(tally);
    this.quizStage = tally.stage;
    this.host.announce(QUIZ_UI[this.host.lang()].thanks);
    this.quiz = null;
    this.overlay = null;
    $('m-quiz').hidden = true;
    $('m-view').classList.remove('quiz-only');
    q.then();
  }

  private jump(years: number) {
    if (!this.main || this.asking) return;
    // the year now playing counts as the first of the jump; stop at Tikka's questions
    this.p = 1;
    if (!this.endYear(true)) { this.showReport(); return; }
    // a hint showing when the child jumps is left as it is (it never stops the forest);
    // a new question on the way stops the jump, so the child still sees it
    for (const l of this.lanes) if (l.f.pending && isHint(l.f.pending.kind)) resolveHint(l.f);
    $('m-hint').hidden = true;
    for (let i = 0; i < years - 2; i++) {
      if (this.lanes.some(l => l.f.pending)) break;
      for (const l of this.lanes) stepYear(l.f);
    }
    if (this.lanes.some(l => l.f.pending)) {
      for (const l of this.lanes) { l.shown = results(l.f); l.rec = l.f.history.at(-1); l.prev = new Map(); l.dying = []; }
      this.endYear();
      return;
    }
    this.beginYear();
    this.p = 1;
    if (this.endYear()) this.beginYear();
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
    if (forestBudget.tick()) { for (const l of this.lanes) l.scene.resize(); this.setupScene.resize(); this.lab.resize(); }
    this.time += dt;
    if (this.screen === 'lab') { this.lab.update(dt); return; }
    if (this.reportTimer > 0) {
      this.reportTimer -= dt;
      if (this.reportTimer <= 0 && !this.asking) $('m-report').hidden = true;
    }
    if (this.screen === 'view' && this.main) {
      // the "after" class question, once the forest is 30 years old and nothing else is open
      if (this.quizStage === 'after' && !this.sandboxMode && !this.overlay && !this.asking && !this.comparing && this.main.f.year >= AFTER_YEAR) {
        this.askQuiz('after', () => this.renderView());
      }
      if (this.overlay === 'mills') this.factory.animateMills(dt);
      if (this.playing && !this.asking && !this.overlay) {
        this.p += (dt / YEAR_SECONDS) * SPEEDS[this.speed];
        if (this.p >= 1) {
          this.p = 1;
          if (this.endYear(this.speed === 'fast')) this.beginYear();
          else this.p = 0.999;
        }
      }
      this.renderClock();
      this.layoutLanes();
      for (const l of this.lanes) {
        l.scene.draw({
          forest: l.f, prev: l.prev, dying: l.dying, p: Math.min(0.999, this.p), rec: l.rec,
          selected: this.selected && this.lanes[this.selected.lane] === l ? this.selected.id : null,
          time: this.time, reducedMotion: this.host.reducedMotion, animals: l.animals, lens: this.tools.lens,
        }, dt);
      }
    } else {
      // the setup screen shows the forest, or the bare ground, behind it
      const f = this.save.current ?? (this.empty?.place === this.place && this.empty.soil === this.soil
        ? this.empty : (this.empty = createForest({ seed: 'setup', place: this.place, soil: this.soil })));
      this.setupScene.draw({ forest: f, prev: new Map(), dying: [], p: 0.4, rec: f.history.at(-1), selected: null, time: this.time, reducedMotion: true }, dt);
    }
  }

  /** One forest fills the screen; two share it, side by side or one above the other. */
  private layoutLanes() {
    const W = this.canvas.clientWidth || innerWidth;
    const H = this.canvas.clientHeight || innerHeight;
    const top = ($('m-view').querySelector('.mtop')?.getBoundingClientRect().bottom ?? 60) + 6;
    const bottom = innerHeight - $('m-bottom').getBoundingClientRect().top + 6;
    if (!this.comparing) {
      const s = this.main!.scene;
      s.setViewport(0, 0, W, H);
      s.insetTop = top;
      s.insetBottom = bottom;
      $('m-lane-a').hidden = true;
      $('m-lane-b').hidden = true;
      return;
    }
    const [a, b] = this.lanes;
    const badge = (id: string, x: number, y: number) => { const el = $(id); el.hidden = false; el.style.left = `${x}px`; el.style.top = `${y}px`; };
    if (W > H * 1.1) {
      a.scene.setViewport(0, 0, W / 2 - 1, H);
      b.scene.setViewport(W / 2 + 1, 0, W / 2 - 1, H);
      for (const l of [a, b]) { l.scene.insetTop = top + 30; l.scene.insetBottom = bottom; }
      badge('m-lane-a', 12, top + 2);
      badge('m-lane-b', W / 2 + 12, top + 2);
    } else {
      const mid = top + (H - top - bottom) / 2;
      a.scene.setViewport(0, 0, W, mid - 1);
      b.scene.setViewport(0, mid + 1, W, H - mid - 1);
      a.scene.insetTop = top + 30; a.scene.insetBottom = 0;
      b.scene.insetTop = 30; b.scene.insetBottom = bottom;
      badge('m-lane-a', 12, top + 2);
      badge('m-lane-b', 12, mid + 6);
    }
  }

  private lastClock = '';
  private renderClock() {
    const m = this.main!;
    const { season } = seasonOf(Math.min(0.999, this.p));
    const yearN = (m.rec?.year ?? m.f.year - 1) + 1;
    const label = `${this.t.year(yearN)} · ${this.t.seasons[season]}`;
    if (label !== this.lastClock) {
      this.lastClock = label;
      $('m-year').textContent = label;
      $('m-drought').hidden = !(m.rec?.weather.drought && season !== 'spring');
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
    $('btn-m-whatif').textContent = t.whatIfButton;
    $('btn-m-whatif').hidden = this.comparing;
    $('btn-m-lab').textContent = LAB_TEXT[this.host.lang()].open;
    $('btn-m-village').textContent = VILLAGE_TEXT[this.host.lang()].open;
    $('btn-m-village').hidden = this.comparing;
    $('btn-m-map').textContent = MAP_TEXT[this.host.lang()].open;
    $('m-cam').setAttribute('aria-label', t.cam.label);
    $('btn-m-cam-in').setAttribute('aria-label', t.cam.zoomIn);
    $('btn-m-cam-out').setAttribute('aria-label', t.cam.zoomOut);
    $('btn-m-cam-home').setAttribute('aria-label', t.cam.home);
    $('m-cam').hidden = this.comparing;
    $('btn-m-map').hidden = this.comparing || this.sandboxMode;
    $('btn-m-village').hidden = this.comparing || this.sandboxMode;
    const mt = MAP_TEXT[this.host.lang()];
    $('m-sandbar').hidden = !this.sandboxMode;
    $('m-sand-tag').textContent = mt.sandboxBadge;
    for (const b of $('m-sandbar').querySelectorAll<HTMLButtonElement>('[data-force]')) { b.textContent = mt.events[b.dataset.force as 'drought']; b.hidden = this.comparing; }
    $('btn-m-sand-new').textContent = mt.newSandbox;
    $('btn-m-sand-back').textContent = mt.backToMine;
    $('m-keep').hidden = !this.comparing;
    $('btn-m-keep-a').textContent = t.keepA;
    $('btn-m-keep-b').textContent = t.keepB;
    $('m-lane-a').textContent = this.laneLabel(0);
    $('m-lane-b').textContent = this.laneLabel(1);
    this.setPlaying(this.playing);
  }

  private laneLabel(i: number) {
    const t = this.t;
    const l = this.lanes[i];
    const name = i === 0 ? t.forestA : t.forestB;
    return l?.choice ? `${name}: ${t.choices[l.choice][0]}` : name;
  }

  renderView() {
    const m = this.main;
    if (!m) return;
    const t = this.t;
    $('btn-m-back').setAttribute('aria-label', t.back);
    $('m-where').textContent = `${t.places[m.f.place].name} · ${t.soils[m.f.soil].name}`;
    $('m-drought').textContent = t.drought;
    $('m-seasons').innerHTML = (['spring', 'summer', 'autumn', 'winter'] as const).map(s => `<span>${t.seasons[s]}</span>`).join('');
    this.canvas.setAttribute('aria-label', t.canvasLabel);
    $('m-same-weather').hidden = !this.comparing;
    $('m-same-weather').textContent = t.sameWeather;
    this.lastClock = '';
    this.describe();
    this.renderControls();
    this.renderResults();
    this.renderCard();
    this.tools.render();
    if (this.asking) this.renderSheet();
  }

  private renderResults() {
    const t = this.t;
    const fmt = (n: number) => num(Math.round(n));
    const leaves = (s: number) => '<span class="leaves" aria-hidden="true">' + Array.from({ length: 5 }, (_, i) =>
      `<i class="${s >= i + 1 ? 'on' : s >= i + 0.5 ? 'half' : ''}"></i>`).join('') + '</span>';
    const arrow = (d: -1 | 0 | 1 | undefined) => d === 1 ? '<em class="up" aria-hidden="true">▲</em>' : d === -1 ? '<em class="down" aria-hidden="true">▼</em>' : '';
    const row = (l: Lane, li: number) => {
      const r = l.shown;
      const items = l.f.receipts.reduce((a, x) => a + x.n, 0);
      const tiles: [ResultKey, string, string][] = [
        ['wood', r ? fmt(r.wood.standing) : '0', 'm³/ha'],
        ['carbon', r ? fmt(r.carbon.removed) : '0', 't CO₂/ha'],
        ['life', r ? leaves(r.life.score) : leaves(0.5), r ? t.scoreOf(r.life.score) : ''],
        ['health', r ? leaves(r.health.score) : leaves(5), r ? t.scoreOf(r.health.score) : ''],
        ['products', items >= 1 ? fmt(items) : '–', items >= 1 ? t.itemsUnit : t.productsNone],
      ];
      const label = this.comparing ? `<span class="lane-tag">${li === 0 ? 'A' : 'B'}</span>` : '';
      return `<div class="mresults${this.comparing ? ' two' : ''}">${label}` + tiles.map(([k, v, unit]) =>
        `<button type="button" class="res res-${k}" data-result="${k}" data-lane="${li}" aria-expanded="${this.open?.k === k && this.open.lane === li}" aria-controls="m-explain">` +
        `<span class="rl">${t.results[k]}</span><b>${v}${arrow(l.report?.arrows[k])}</b><small>${unit}</small></button>`).join('') + '</div>';
    };
    $('m-results').innerHTML = this.lanes.map(row).join('');
    const ex = $('m-explain');
    ex.hidden = !this.open;
    if (!this.open) return;
    const lane = this.lanes[this.open.lane] ?? this.main!;
    ex.innerHTML = this.explain(this.open.k, lane);
  }

  private explain(k: ResultKey, l: Lane): string {
    const t = this.t;
    const r = l.shown;
    const fmt = (n: number) => num(Math.round(n));
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
      case 'life': {
        const seen = l.f.seen.map(s => t.animals[s.animal][0]);
        return `<p>${t.explain.life[r.life.reason]}</p><p><b>${t.seenTitle}:</b> ${seen.length ? seen.join(', ') : t.seenNone}</p>`;
      }
      case 'health': return `<p>${t.explain.health[r.health.reason]}</p>`;
      case 'products': {
        const p = r.products;
        const button = `<button type="button" class="btn small" data-shelf="${this.lanes.indexOf(l)}">${t.shelfButton}</button>`;
        if (p.sawn + p.paper + p.textile + p.energy <= 0) return `<p>${t.explain.products}</p>${button}`;
        return `<p>${t.productsMade(fmt(p.sawn), fmt(p.paper + p.textile), fmt(p.energy))}</p>${button}`;
      }
    }
  }

  // ---------- the year report ----------

  private showReport() {
    const t = this.t;
    const lines = this.lanes.map((l, i) => {
      const r = l.report;
      if (!r) return '';
      const head = this.comparing ? `<b>${i === 0 ? 'A' : 'B'}:</b> ` : '';
      const animal = r.animal ? `<span class="newsp">${t.newSpecies} ${t.animals[r.animal][0]}</span> ${t.animals[r.animal][1]}` : '';
      const text = r.cause === 'animal' ? animal : `${t.report[r.cause](r.n)}${animal ? ' ' + animal : ''}`;
      return `<p>${head}${text}</p>`;
    }).join('');
    const notable = this.lanes.some(l => l.report && NOTABLE.has(l.report.cause));
    if (!lines || (this.speed === 'fast' && !notable)) return;
    const m = this.main!;
    $('m-report-title').textContent = this.t.year((m.rec?.year ?? 0) + 1);
    $('m-report-body').innerHTML = lines;
    $('btn-m-report-close').textContent = t.reportClose;
    $('m-report').hidden = false;
    face($<HTMLCanvasElement>('m-report-face'));
    this.reportTimer = this.speed === 'fast' ? 3.5 : 9;
    if (notable && m.report) this.host.announce($('m-report-body').textContent ?? '');
  }

  // ---------- Tikka's questions and "What if?" ----------

  private ask(a: Asking) {
    this.asking = a;
    this.planting = false;
    this.compareOn = a.d.kind === 'whatif';
    this.pickA = null;
    this.setPlaying(false);
    this.renderSheet();
    $('m-decide').hidden = false;
    face($<HTMLCanvasElement>('m-decide-face'));
    requestAnimationFrame(() => $('m-decide-q').focus());
  }

  private closeSheet() {
    this.asking = null;
    this.compareOn = false;
    this.pickA = null;
    this.planting = false;
    $('m-decide').hidden = true;
    this.setPlaying(true);
  }

  private renderSheet() {
    const a = this.asking;
    if (!a) return;
    const t = this.t;
    const lane = this.lanes[a.lane];
    const n = a.d.kind === 'storm' ? lane.rec?.events?.find(e => e.kind === 'storm')?.count ?? 0
      : a.d.kind === 'beetle' ? lane.rec?.events?.find(e => e.kind === 'beetle')?.count ?? 0 : 0;
    const who = this.comparing ? `${a.lane === 0 ? t.forestA : t.forestB} · ` : '';
    $('m-decide-who').textContent = `${who}${t.tikkaAsks}`;
    $('m-decide-q').textContent = t.questions[a.d.kind](n);
    const hint = $('m-decide-hint');
    hint.hidden = !this.compareOn;
    hint.textContent = this.pickA ? t.comparePickedA(t.choices[this.pickA][0]) : t.compareHint;
    $('m-plant-pick').hidden = !this.planting;
    if (this.planting) {
      $('m-plant-title').textContent = t.plantTitle;
      $('m-plant-species').innerHTML = this.speciesCards();
      $('m-plant-spacing').innerHTML = this.spacingButtons();
      $('btn-m-plant-go').textContent = t.plantGo;
      $<HTMLButtonElement>('btn-m-plant-go').disabled = this.species.size === 0;
    }
    $('m-choices').hidden = this.planting;
    $('m-choices').innerHTML = a.d.choices.map(c =>
      `<button type="button" class="choice${this.pickA === c ? ' picked' : ''}" data-choice="${c}"${this.pickA === c ? ' disabled' : ''}><b>${t.choices[c][0]}</b><span>${t.choices[c][1]}</span></button>`).join('');
    const canCompare = !this.comparing && a.d.kind !== 'whatif' && a.d.kind !== 'regen';
    $('btn-m-compare').hidden = !canCompare || this.compareOn || this.planting;
    $('btn-m-compare').textContent = t.compareToggle;
    $('btn-m-decide-cancel').hidden = !(this.compareOn || this.planting || a.d.kind === 'whatif');
    $('btn-m-decide-cancel').textContent = t.cancel;
  }

  private choose(c: ChoiceId) {
    const a = this.asking;
    if (!a) return;
    if (this.compareOn) {
      if (!this.pickA) { this.pickA = c; this.renderSheet(); return; }
      this.startCompare(this.pickA, c);
      return;
    }
    if (c === 'plant' && !this.planting) { this.planting = true; this.renderSheet(); return; }
    if (HARVESTS.has(c) && !this.comparing && !this.factory.sorting) { this.factory.startSort(c); return; }
    const lane = this.lanes[a.lane];
    const had = new Set(lane.f.trees.map(t => t.id));
    applyChoice(lane.f, c, { mix: this.mix(), spacing: this.spacing });
    lane.scene.spawn(lane.f.trees.filter(t => !had.has(t.id)).map(t => t.id), 0.02);
    if (c === 'plant') this.save = { ...this.save, species: [...this.species], spacing: this.spacing };
    this.afterChoice();
  }

  /** "What if?": copy the forest, give each copy one of the two choices, and play them side by side. */
  private startCompare(ca: ChoiceId, cb: ChoiceId) {
    const a = this.main!;
    a.scene.resetCamera();
    const twin = this.newLane(structuredClone(a.f));
    twin.rec = a.rec;
    twin.shown = a.shown;
    applyChoice(a.f, ca, { mix: this.mix(), spacing: this.spacing });
    applyChoice(twin.f, cb, { mix: this.mix(), spacing: this.spacing });
    a.choice = ca;
    twin.choice = cb;
    if (!(this.save.tips ?? []).includes('whatIf')) this.save = { ...this.save, tips: [...(this.save.tips ?? []), 'whatIf'] };
    this.lanes = [a, twin];
    this.afterChoice();
  }

  private afterChoice() {
    this.persist();
    const next = this.lanes.findIndex(l => l.f.pending);
    if (next >= 0) { this.ask({ d: this.lanes[next].f.pending!, lane: next }); return; }
    for (const l of this.lanes) { l.shown = results(l.f); l.animals = presentAnimals(l.f); }
    this.closeSheet();
    this.renderView();
    if (this.p >= 0.999) this.beginYear();
    $('m-year').focus();
  }

  // ---------- the sandbox (Phase 10) ----------

  /** The sandbox: a forest of its own to try anything in, from the setup's place, soil and trees. */
  private openSandbox(fresh: boolean) {
    let f = fresh ? null : this.save.sandbox ?? null;
    if (!f) {
      if (!this.species.size) this.species = new Set(['spruce']);
      f = createForest({ seed: 's' + Math.random().toString(36).slice(2, 9), place: this.place, soil: this.soil });
      f.sandbox = true;
      plant(f, this.mix(), this.spacing);
      this.save = { ...this.save, sandbox: f };
      storeForest(this.save);
    }
    this.sandboxMode = true;
    this.showView(f);
  }

  private leaveSandbox() {
    this.persist();
    this.sandboxMode = false;
    if (this.save.current) this.showView(this.save.current); else this.showSetup();
  }

  /** Make a drought, a storm or a bark beetle year happen next year in the sandbox. */
  private force(kind: 'drought' | 'storm' | 'beetle') {
    const m = this.main;
    if (!m || !m.f.sandbox) return;
    const year = m.f.year;
    const list = (m.f.force ??= {})[kind] ??= [];
    if (!list.includes(year)) list.push(year);
    this.persist();
    const mt = MAP_TEXT[this.host.lang()];
    const note = mt.eventSet(mt.events[kind], year + 1);
    $('m-tool-note').textContent = note;
    this.host.announce(note);
  }

  // ---------- one world: along the road (2.5D, increment 3) ----------

  /** Travel along the road to the mills or the village, then open it. Two forests side by side open it at once. */
  private goTo(place: 'mills' | 'village', open: () => void) {
    const m = this.main;
    if (!m || this.comparing) { open(); return; }
    this.select(null);
    this.overlay = 'travel';
    this.setPlaying(false);
    m.scene.travel(place, null, () => { if (this.overlay === 'travel') this.overlay = null; open(); });
  }

  /** When a screen out along the road closes, the camera goes back to the stand. */
  private comeHome() {
    const m = this.main;
    if (m && !this.comparing && m.scene.away()) m.scene.travel('home', null);
  }

  /** Jump to the end of a harvest being shown, or of a trip along the road. */
  private skipShow() {
    this.main?.scene.skipFelling();
    this.main?.scene.skipTravel();
  }

  /** Your birch becomes village things (Phase 9); the line passes to the nearest birch. */
  private giveBirch() {
    const m = this.main;
    const b = m ? myBirch(m.f) : undefined;
    if (!m || !b || this.comparing) return;
    const gone = structuredClone(b);
    if (!giveMyBirch(m.f)) return;
    const vt = VILLAGE_TEXT[this.host.lang()];
    const made = new Map<ItemId, number>();
    for (const r of m.f.receipts) if (r.tree === b.id) made.set(r.item, (made.get(r.item) ?? 0) + r.n);
    const list = [...made].filter(([, n]) => n >= 0.5).sort((x, y) => (x[0] === 'sauna' ? 1 : 0) - (y[0] === 'sauna' ? 1 : 0)).map(([it, n]) => vt.count(n, it)).join(', ');
    m.shown = results(m.f);
    m.animals = presentAnimals(m.f);
    this.select(null);
    this.persist();
    this.renderView();
    // 2.5D: the birch is felled and driven away before the village opens
    this.overlay = 'felling';
    this.setPlaying(false);
    m.scene.fell([gone], () => m.scene.travel('village', 'goods', () => this.villageView.open(vt.gaveBirch(list))));
  }

  private openWhatIf() {
    if (this.asking || this.comparing || !this.main) return;
    this.ask({ d: { kind: 'whatif', year: this.main.f.year, choices: ['thin', 'cc', 'clearcutKeep', 'nothing'] }, lane: 0 });
  }

  private keep(i: number) {
    const l = this.lanes[i];
    if (!l) return;
    l.choice = undefined;
    this.lanes = [l];
    l.scene.resize();
    this.selected = null;
    this.open = null;
    this.persist();
    this.renderView();
  }

  // ---------- trees ----------

  private select(sel: { id: number; lane: number } | null) {
    this.selected = sel;
    // 2.5D: the camera gently moves to the chosen tree, and back out when it is let go
    if (!this.comparing) this.main?.scene.focus(sel ? sel.id : null);
    this.renderCard();
  }

  /** Camera buttons and keys: closer, further away, the whole forest. */
  private camera(what: 'in' | 'out' | 'home') {
    const s = this.main?.scene;
    if (!s || this.comparing) return;
    if (what === 'home') { this.select(null); s.resetCamera(); return; }
    s.zoomBy(what === 'in' ? 1.25 : 0.8);
  }

  private renderCard() {
    const card = $('m-card');
    const lane = this.selected ? this.lanes[this.selected.lane] : undefined;
    const tree = lane?.f.trees.find(t => t.id === this.selected!.id);
    card.hidden = !tree;
    $('m-tap-hint').textContent = this.t.tapTree;
    $('m-tap-hint').hidden = !!tree || (this.main?.f.year ?? 0) > 3 || this.comparing;
    if (!tree) return;
    const t = this.t;
    const sp = SPECIES[tree.sp];
    const n1 = (x: number) => num(x, 1);
    const carbon = tree.c.wood + tree.c.foliage + tree.c.fine;
    const vol = stemVolume(sp, tree.d, tree.h);
    const light = tree.vigor > 0.75 ? t.card.light.good : tree.vigor > 0.45 ? t.card.light.some : t.card.light.poor;
    $('m-card-title').textContent = tree.mine ? t.myBirch : t.species[tree.sp].name + (tree.keep ? ` · ${t.card.kept}` : '');
    $('m-card-sub').textContent = `${t.card.planted(tree.born + 1, tree.age)} · ${light}`;
    const rows: [string, string][] = [
      [t.card.height, `${n1(tree.h)} m`],
      [t.card.diameter, tree.d > 0 ? `${n1(tree.d)} cm` : '–'],
      [t.card.wood, vol >= 0.1 ? `${n1(vol)} m³` : `${Math.round(vol * 1000)} l`],
      [t.card.carbon, `${n1(carbon)} kg`],
      [t.card.co2, `${n1(carbon * CO2_PER_C)} kg`],
    ];
    $('m-card-stats').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    $('m-card-note').textContent = (tree.mine ? t.myBirchNote + ' ' : '') + (tree.d > 0 ? t.card.rings : t.card.seedling);
    $('btn-m-card-close').setAttribute('aria-label', t.card.close);
    drawRings($<HTMLCanvasElement>('m-rings'), tree.rings);
    this.tools.renderCard(tree, lane === this.main);
    const vt = VILLAGE_TEXT[this.host.lang()];
    $('btn-m-card-give').hidden = !(canGive(tree) && lane === this.main && !this.comparing);
    $('btn-m-card-give').textContent = vt.giveButton;
    $('m-give').hidden = true;
    $('m-give-q').textContent = vt.giveQ;
    $('btn-m-give-yes').textContent = vt.giveYes;
    $('btn-m-give-no').textContent = vt.giveNo;
    const zoomable = !this.comparing && lane === this.main && canZoom(tree, lane?.rec);
    $('btn-m-zoom').hidden = !zoomable;
    $('btn-m-zoom').textContent = t.zoomButton;
    $('m-zoom-note').textContent = zoomable ? '' : tree.sp !== 'birch' ? t.zoomOnlyBirch : tree.zoomed === lane?.rec?.year ? t.zoomUsed : '';
  }

  /** Arrow keys move between the trees of the first forest when the canvas has focus. */
  private cycle(dir: number) {
    const lane = this.selected?.lane ?? 0;
    const trees = [...(this.lanes[lane]?.f.trees ?? [])].sort((a, b) => a.x - b.x);
    if (!trees.length) return;
    const i = trees.findIndex(t => t.id === this.selected?.id);
    const next = trees[(i + dir + trees.length) % trees.length];
    this.select({ id: next.id, lane });
    this.host.announce(`${this.t.species[next.sp].name}, ${next.h.toFixed(1)} m`);
  }

  private persist() {
    const m = this.main;
    if (m) this.save = this.sandboxMode ? { ...this.save, sandbox: m.f } : { ...this.save, current: m.f };
    storeForest(this.save);
    if (this.save.current) discover(forestFinds(this.save.current));
  }

  /** How many of each item the current forest has made, for the Atlas. */
  madeCounts(): Partial<Record<ItemId, number>> {
    const out: Partial<Record<ItemId, number>> = {};
    for (const r of this.save.current?.receipts ?? []) out[r.item] = (out[r.item] ?? 0) + r.n;
    return out;
  }

  // ---------- events ----------

  private bind() {
    document.addEventListener('click', (e) => {
      if (!this.active) return;
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (this.screen === 'lab') { this.lab.click(b); return; }
      // while a harvest is shown, any button jumps to its end
      if (this.overlay === 'felling' || this.overlay === 'travel') { this.skipShow(); return; }
      if (b.id === 'btn-m-lab' || b.id === 'btn-m-setup-lab') { this.openLab(); return; }
      if (b.id === 'btn-m-sandbox') { this.openSandbox(false); return; }
      if (b.id === 'btn-m-sand-new') { this.persist(); this.openSandbox(true); return; }
      if (b.id === 'btn-m-sand-back') { this.leaveSandbox(); return; }
      if (b.dataset.force && this.sandboxMode) { this.force(b.dataset.force as 'drought' | 'storm' | 'beetle'); return; }
      if (b.id === 'btn-m-village' && this.screen === 'view') { this.goTo('village', () => this.villageView.open()); return; }
      if (this.screen === 'view' && this.villageView.click(b)) return;
      if (this.screen === 'view' && this.mapView.click(b)) return;
      if (this.screen === 'view' && this.tools.click(b)) return;
      if (b.id === 'btn-m-cam-in') { this.camera('in'); return; }
      if (b.id === 'btn-m-cam-out') { this.camera('out'); return; }
      if (b.id === 'btn-m-cam-home') { this.camera('home'); return; }
      if (b.id === 'btn-m-card-give') { $('m-give').hidden = false; $('btn-m-give-yes').focus(); return; }
      if (b.id === 'btn-m-give-no') { $('m-give').hidden = true; $('btn-m-card-give').focus(); return; }
      if (b.id === 'btn-m-give-yes') { this.giveBirch(); return; }
      if (b.id === 'btn-m-hint-choices' && this.main?.f.pending) { $('m-hint').hidden = true; this.ask({ d: this.main.f.pending, lane: 0 }); return; }
      if (b.id === 'btn-m-hint-mark') { $('m-hint').hidden = true; this.tools.setTool('mark'); $<HTMLButtonElement>('m-tools').querySelector<HTMLButtonElement>('[data-tool="mark"]')?.focus(); return; }
      if (b.id === 'btn-m-hint-later') { $('m-hint').hidden = true; if (this.main) resolveHint(this.main.f); this.persist(); return; }
      if (b.id === 'btn-m-card-mark' && this.selected) { this.tools.mark(this.selected.id); return; }
      if (b.id === 'btn-m-card-keep' && this.selected) { this.tools.keep(this.selected.id); return; }
      if (b.dataset.place) { this.place = b.dataset.place as PlaceId; this.renderSetup(); return; }
      if (b.dataset.soil) { this.soil = b.dataset.soil as SoilId; this.renderSetup(); return; }
      if (b.dataset.species) {
        const s = b.dataset.species as SpeciesId;
        if (this.species.has(s)) this.species.delete(s); else this.species.add(s);
        if (this.screen === 'setup') this.renderSetup(); else this.renderSheet();
        return;
      }
      if (b.dataset.spacing) {
        this.spacing = b.dataset.spacing as Spacing;
        if (this.screen === 'setup') this.renderSetup(); else this.renderSheet();
        return;
      }
      if (b.dataset.choice) { this.choose(b.dataset.choice as ChoiceId); return; }
      if (b.dataset.qa !== undefined) { this.answerQuiz(Number(b.dataset.qa)); return; }
      if (b.dataset.bin) { this.factory.setBin(Number(b.dataset.tree), b.dataset.bin as SortBin); return; }
      if (b.dataset.item) { this.factory.tracing = { item: b.dataset.item as ItemId, k: 0 }; this.factory.renderShelf(); $('m-trace-title').focus(); return; }
      if (b.dataset.shelf !== undefined) { const n = Number(b.dataset.shelf); if (n === 0) this.goTo('mills', () => this.factory.openShelf(0)); else this.factory.openShelf(n); return; }
      if (b.dataset.result) {
        const k = b.dataset.result as ResultKey;
        const lane = Number(b.dataset.lane ?? 0);
        this.open = this.open?.k === k && this.open.lane === lane ? null : { k, lane };
        this.renderResults();
        (document.querySelector(`[data-result="${k}"][data-lane="${lane}"]`) as HTMLElement | null)?.focus();
        return;
      }
      switch (b.id) {
        case 'btn-m-plant': this.plantNew(); break;
        case 'btn-m-continue': if (this.save.current) this.showView(this.save.current); break;
        case 'btn-m-setup-back': this.exit(); break;
        case 'btn-m-back': if (!this.asking) { this.persist(); this.showSetup(); } break;
        case 'btn-m-play': if (!this.asking) this.setPlaying(!this.playing); break;
        case 'btn-m-normal': if (!this.asking) this.setSpeed('normal'); break;
        case 'btn-m-fast': if (!this.asking) this.setSpeed('fast'); break;
        case 'btn-m-jump': this.jump(10); break;
        case 'btn-m-whatif': this.openWhatIf(); break;
        case 'btn-m-keep-a': this.keep(0); break;
        case 'btn-m-keep-b': this.keep(1); break;
        case 'btn-m-card-close': this.select(null); this.canvas.focus(); break;
        case 'btn-m-report-close': $('m-report').hidden = true; break;
        case 'btn-m-zoom': this.zoom(); break;
        case 'btn-m-compare': this.compareOn = true; this.pickA = null; this.renderSheet(); break;
        case 'btn-m-decide-cancel':
          if (this.asking?.d.kind === 'whatif') this.closeSheet();
          else { this.compareOn = false; this.pickA = null; this.planting = false; this.renderSheet(); }
          break;
        case 'btn-m-plant-go': if (this.species.size) { this.planting = true; this.choose('plant'); } break;
        case 'btn-m-autosort': this.factory.autoSort(); break;
        case 'btn-m-load': this.factory.loadTruck(); break;
        case 'btn-m-sort-cancel': this.factory.cancelSort(); break;
        case 'btn-m-mills-back': this.factory.leaveMills(); break;
        case 'btn-m-shelf-close': this.factory.closeShelf(); break;
        case 'btn-m-trace-prev': if (this.factory.tracing) { this.factory.tracing.k--; this.factory.renderShelf(); } break;
        case 'btn-m-trace-next': if (this.factory.tracing) { this.factory.tracing.k++; this.factory.renderShelf(); } break;
        case 'btn-m-trace-back': this.factory.tracing = null; this.factory.renderShelf(); break;
      }
    });
    document.addEventListener('change', (e) => {
      if (!this.active) return;
      const el = e.target as HTMLInputElement;
      if (el.id === 'm-residues' && this.factory.sorting) this.factory.sorting.residues = el.checked;
      if (el.id === 'm-recycle' && this.factory.shelfLane()) { this.factory.shelfLane()!.f.recycle = el.checked; this.persist(); this.factory.renderShelf(); }
    });
    // a tap picks a tree or uses a tool; a drag moves through the forest; two fingers (or the wheel) zoom
    const pointers = new Map<number, { x: number; y: number; x0: number; y0: number }>();
    let dragged = false;
    let pinch = 0;
    const tap = (x: number, y: number) => {
      if (this.tools.tap(x, y)) return;
      // the mills and the village stand in the world too: tap them to go in
      const place = this.comparing ? null : this.main?.scene.placeAt(x, y);
      if (place === 'village') { this.goTo('village', () => this.villageView.open()); return; }
      if (place === 'mills') { this.goTo('mills', () => this.factory.openShelf(0)); return; }
      for (let i = 0; i < this.lanes.length; i++) {
        const id = this.lanes[i].scene.hit(x, y);
        if (id !== null) { this.select({ id, lane: i }); return; }
      }
      this.select(null);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.active || this.screen !== 'view') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      if (pointers.size === 1) dragged = false;
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); dragged = true; }
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p || !this.active || this.screen !== 'view' || this.comparing) return;
      const dx = e.clientX - p.x;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && d > 0) this.main?.scene.zoomBy(d / pinch);
        pinch = d;
        return;
      }
      if (!dragged && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8) return;
      if (!dragged) { dragged = true; this.canvas.classList.add('dragging'); }
      this.main?.scene.panBy(dx);
    });
    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size === 0) this.canvas.classList.remove('dragging');
      if (!p || dragged || !this.active || this.screen !== 'view') return;
      const r = this.canvas.getBoundingClientRect();
      tap(p.x0 - r.left, p.y0 - r.top);
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); dragged = true; this.canvas.classList.remove('dragging'); });
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.active || this.screen !== 'view' || this.comparing) return;
      e.preventDefault();
      this.main?.scene.zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });
    this.canvas.addEventListener('keydown', (e) => {
      if (!this.active || this.screen !== 'view') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); this.cycle(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.cycle(-1); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); this.camera('in'); }
      if (e.key === '-') { e.preventDefault(); this.camera('out'); }
      if (e.key === '0') { e.preventDefault(); this.camera('home'); }
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active || this.screen !== 'view' || this.asking || this.overlay) return;
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
      select: (id: number | null) => this.select(id === null ? null : { id, lane: 0 }),
      choose: (c: ChoiceId) => this.choose(c),
      whatIf: () => this.openWhatIf(),
      village: () => this.villageView.open(),
      map: () => this.mapView.open(),
      mapState: this.mapView.debug(),
      give: () => this.giveBirch(),
      lab: this.lab.debug(),
      openLab: (id?: string) => this.openLab(id),
      sandbox: () => this.openSandbox(false),
      force: (k: 'drought' | 'storm' | 'beetle') => this.force(k),
      mode: () => (this.sandboxMode ? 'sandbox' : 'own'),
      state: () => ({
        year: this.main?.f.year, p: this.p, lanes: this.lanes.length, asking: this.asking?.d.kind ?? null,
        trees: this.main?.f.trees.map(t => t.id) ?? [], results: this.main?.shown, logs: this.main?.f.logs.length,
        seen: this.main?.f.seen, report: this.main?.report?.cause,
      }),
      treeBase: (id: number) => this.main ? this.main.scene.treeBase(this.main.f, id) : null,
      camSettled: () => this.main?.scene.settled() ?? true,
      fx: () => ({ overlay: this.overlay, ...(this.main?.scene.fxInfo() ?? {}) }),
      art: () => ({ listed: artListed(), version: artVersion() }),
      world: () => ({ overlay: this.overlay, away: this.main?.scene.away() ?? false, travelling: this.main?.scene.travelling() ?? false }),
      placeScreen: (n: 'mills' | 'village') => this.main?.scene.placeScreen(n) ?? null,
    };
  }
}

function face(cv: HTMLCanvasElement | null) {
  if (!cv) return;
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, cv.width, cv.height);
  const k = cv.width / 96;
  drawTikka(c, 66 * k, 92 * k, 116 * k, 0, 0);
}

/** The trunk's cross-section with one ring per year (widths from the model). */
/** A trunk's cross-section. `mark` holds ring indices to show in gold: the summers the child played (Phase 9). */
export function drawRings(cv: HTMLCanvasElement, rings: number[], mark?: Set<number>) {
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
    c.fillStyle = mark?.has(i) ? '#ffc83d' : i % 2 ? '#e9c88e' : '#f3d9a8';
    c.beginPath(); c.arc(S / 2, S / 2, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = mark?.has(i) ? '#b07a00' : '#a57a45';
    c.lineWidth = mark?.has(i) ? 2 : 1;
    c.stroke();
    r -= (Math.max(0.2, rings[i]) / total) * R;
  }
  c.fillStyle = '#7a5530';
  c.beginPath(); c.arc(S / 2, S / 2, 2.5, 0, Math.PI * 2); c.fill();
}
