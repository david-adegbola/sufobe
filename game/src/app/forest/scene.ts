/**
 * The Metsäni forest view, drawn in the same poster style as Kasva!: the
 * stand from the side, each tree at its real height and age, the season, and
 * a cut through the soil showing its texture, the water and the roots.
 *
 * 2.5D: the stand sits in a deep landscape (depth.ts): clouds, two mountain
 * ridges, a far and a mid forest and haze behind it, grass and stones in
 * front, each layer moving with the camera at its own rate (parallax). A
 * camera can pan, zoom and gently focus on a chosen tree. Trees cast
 * shadows, sway in the wind, and far ones fade into the haze. How things look
 * comes from the simulation through visual.ts (tree stage, season, weather).
 *
 * Species are drawn to be recognisable at a glance (forest-sim style bible):
 * spruce a dark cone of drooping tiers; pine with orange upper bark and a
 * flat, open crown; birch white with black marks, lime in spring, yellow in
 * autumn (ruska), bare in winter.
 */
import {
  PLACES, SOILS, relativeDensity, type AnimalId, type DeathCause, type Forest, type SoilId, type SpeciesId, type Tree, type YearRecord,
} from '../../core/forest';
import { makeRng } from '../../core/rng';
import { FrameBudget } from '../scene/budget';
import { LAYER_EXTRA, PARALLAX, drawClouds, mix as mixHexStr, paintDepth, type Band, type DepthLayers } from './depth';
import type { Season } from './text';
import { STAGE_LOOK, envLook, treeStage, type EnvLook } from './visual';

export interface ForestView {
  forest: Forest;
  /** sizes at the start of the year being shown, by tree id */
  prev: Map<number, { h: number; d: number }>;
  /** trees that die (or are removed) during the year being shown */
  dying: Tree[];
  /** 0..1 through the year: spring, summer, autumn, winter */
  p: number;
  /** the record of the year being shown */
  rec: YearRecord | undefined;
  selected: number | null;
  time: number;
  reducedMotion: boolean;
  /** animals living in the forest now */
  animals?: AnimalId[];
  /** the light lens: colour each tree by the light it got last year (Phase 7) */
  lens?: boolean;
}

export function seasonOf(p: number): { season: Season; ps: number } {
  const i = Math.min(3, Math.floor(p * 4));
  return { season: (['spring', 'summer', 'autumn', 'winter'] as const)[i], ps: p * 4 - i };
}

/** Where a tree can be tapped: its trunk (checked first) and its crown. */
interface Hit { id: number; x0: number; y0: number; x1: number; y1: number; tx0: number; tx1: number; ty0: number; cx: number; base: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const SOIL_LOOK: Record<SoilId, { base: string; dark: string; grain: string }> = {
  sandy: { base: '#d8bf8a', dark: '#c3a46c', grain: '#f1e2bc' },
  clay: { base: '#8c7a6a', dark: '#776656', grain: '#a39283' },
  peat: { base: '#4a3324', dark: '#3a271b', grain: '#6b4a32' },
  loam: { base: '#6e4f33', dark: '#5b402a', grain: '#8a6845' },
  rocky: { base: '#6e5a40', dark: '#5a4834', grain: '#8d7656' },
};

const SKIES: Record<Season, [string, string]> = {
  spring: ['#8cc3e8', '#e3f1ef'],
  summer: ['#6fb0de', '#d6ecec'],
  autumn: ['#9fb4c4', '#efe1cc'],
  winter: ['#a9bfd3', '#eef3f6'],
};

/** One budget for every forest scene: they all draw on the same canvas. */
export const forestBudget = new FrameBudget();

export class ForestScene {
  private c: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  /** where this scene draws on the canvas (CSS px): the whole canvas, or half of it in "What if?" */
  private vx = 0;
  private vy = 0;
  private dpr = 1;
  private layers: DepthLayers | null = null;
  private layersKey = '';
  private soilBase: HTMLCanvasElement | null = null;
  /** sky, sun, mountains, distant forests and haze, composed once and reused while the camera is still */
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private soilKey = '';
  private hits: Hit[] = [];
  /** the camera: pan (css px), vertical shift, zoom; eased towards the target each frame */
  private cam = { pan: 0, panY: 0, s: 1 };
  private userPan = 0;
  private userZoom = 1;
  private focusId: number | null = null;
  /** this frame's look of the world, from visual.ts */
  private env: EnvLook | null = null;

  // ---------- game feel (2.5D, increment 2) ----------
  /** seconds of effects time; effects never run with reduced motion */
  private fxT = 0;
  private reduced = false;
  /** seedlings popping up out of the ground, by tree id */
  private spawns = new Map<number, { t0: number; burst: boolean }>();
  /** coloured rings bursting from a trunk (marked, kept) */
  private pops: { id: number; t0: number; color: string }[] = [];
  /** dust, soil and sparkles, in world coordinates */
  private bits: { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; r: number; g: number }[] = [];
  /** a harvest being shown: trees tipping over, a log pile, the timber truck */
  private felling: {
    trees: { t: Tree; t0: number; dir: number; landed: boolean }[];
    landedAt: number; truckAt: number; done: () => void;
  } | null = null;
  /** sounds for the effects (the host connects them) */
  onSound: ((kind: 'plant' | 'thud' | 'truck', pan: number) => void) | null = null;
  /** space kept free for the HTML bars at the top and bottom, CSS px */
  insetTop = 70;
  insetBottom = 190;

  constructor(private canvas: HTMLCanvasElement) {
    this.c = canvas.getContext('2d')!;
    this.resize();
  }

  resize() {
    this.dpr = forestBudget.dpr();
    this.W = this.canvas.clientWidth || innerWidth;
    this.H = this.canvas.clientHeight || innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.vx = 0;
    this.vy = 0;
    this.layersKey = '';
    this.soilKey = '';
    this.bgKey = '';
  }

  // ---------- game feel ----------

  /** Seedlings pop up out of the ground, one after another `stagger` seconds apart. */
  spawn(ids: number[], stagger = 0) {
    if (this.reduced) return;
    ids.forEach((id, i) => this.spawns.set(id, { t0: this.fxT + i * stagger, burst: false }));
  }

  /** A ring of colour bursts from a trunk: orange paint when marked, teal when kept. */
  pop(id: number, color: string) {
    if (!this.reduced) this.pops.push({ id, t0: this.fxT, color });
  }

  /**
   * Show a harvest: the trees (already gone from the forest) tip over one
   * after another, logs pile up at the edge of the plot, and a timber truck
   * backs in, loads them and drives away. `done` runs at the end (at once
   * with reduced motion).
   */
  fell(trees: Tree[], done: () => void) {
    if (this.reduced || !trees.length) { done(); return; }
    // the trees in front are the ones a child sees: show up to 18 falling
    const shown = [...trees].sort((a, b) => depthOf(a.id) - depthOf(b.id)).slice(0, 18).sort((a, b) => a.x - b.x);
    const stagger = Math.min(0.14, 1.4 / shown.length);
    this.felling = {
      trees: shown.map((t, i) => ({ t: { ...t, c: { ...t.c } }, t0: this.fxT + 0.25 + i * stagger, dir: t.x > 0.5 ? 1 : -1, landed: false })),
      landedAt: Infinity, truckAt: Infinity, done,
    };
  }

  /** For tests: how many effects are running. */
  fxInfo() { return { spawns: this.spawns.size, pops: this.pops.length, bits: this.bits.length, felling: this.felling?.trees.length ?? 0 }; }

  /** A harvest is being shown. */
  busy(): boolean { return this.felling !== null; }

  /** Jump to the end of a harvest being shown (Escape). */
  skipFelling() {
    const f = this.felling;
    if (!f) return;
    this.felling = null;
    f.done();
  }

  private burst(x: number, y: number, n: number, colors: string[], up: number, spread: number, gravity = 260) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const v = up * (0.5 + Math.random() * 0.7);
      this.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.5 + Math.random() * 0.5, color: colors[i % colors.length], r: 1.2 + Math.random() * 1.8, g: gravity });
    }
    if (this.bits.length > 260) this.bits.splice(0, this.bits.length - 260);
  }

  private stepFx(dt: number) {
    for (const b of this.bits) { b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += b.g * dt; b.vx *= 1 - 1.5 * dt; }
    if (this.bits.length) this.bits = this.bits.filter(b => b.age < b.life);
    if (this.pops.length) this.pops = this.pops.filter(p => this.fxT - p.t0 < 0.5);
    for (const [id, sp] of this.spawns) if (this.fxT - sp.t0 > 1) this.spawns.delete(id);
  }

  private drawBits() {
    const c = this.c;
    for (const b of this.bits) {
      c.globalAlpha = Math.max(0, 1 - b.age / b.life);
      c.fillStyle = b.color;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawPops(L: ReturnType<ForestScene['layout']>, f: Forest) {
    const c = this.c;
    for (const p of this.pops) {
      const t = f.trees.find(x => x.id === p.id);
      if (!t) continue;
      const P = this.place(L, t, 0);
      const k = (this.fxT - p.t0) / 0.5;
      const hp = t.h * L.px * P.s;
      const y = P.base - (t.h > 1.6 ? hp * (1.3 / t.h) : hp * 0.55);
      c.strokeStyle = p.color;
      c.globalAlpha = Math.max(0, 1 - k);
      c.lineWidth = 3 * (1 - k) + 1;
      c.beginPath(); c.arc(P.x, y, 6 + 26 * k, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
  }

  /** The harvest show: falling trees, then the log pile and the truck. */
  private drawFelling(L: ReturnType<ForestScene['layout']>, season: Season, ps: number, rd: number) {
    const fl = this.felling;
    if (!fl) return;
    const c = this.c;
    const T = this.fxT;
    let landed = 0;
    for (const ft of fl.trees) {
      const t = ft.t;
      const k = clamp01((T - ft.t0) / 0.8);
      const P = this.place(L, t, 0);
      const px = L.px * P.s;
      const hp = Math.max(3, t.h * px);
      if (k >= 1 && !ft.landed) {
        ft.landed = true;
        // dust where the crown hits the ground, and a thud
        this.burst(P.x + ft.dir * hp * 0.75, P.base - 2, 14, ['#b9a582', '#9c8b6c', '#d8cdb6'], 120, 1.6, 200);
        this.onSound?.('thud', Math.max(-0.8, Math.min(0.8, (P.x - L.W / 2) / L.W * 2)));
      }
      if (ft.landed) landed++;
      const fade = clamp01((T - ft.t0 - 0.8) / 0.4);
      if (fade >= 1) continue;
      const ang = ft.dir * (k * k) * Math.PI / 2;
      c.save();
      c.globalAlpha = 1 - fade;
      c.translate(P.x, P.base); c.rotate(ang); c.translate(-P.x, -P.base);
      if (t.h < 1.3) drawSeedling(c, t.sp, P.x, P.base, hp, season, ps, P.depth * 0.1);
      else drawTree(c, t.sp, P.x, P.base, hp, Math.max(1.2, (t.d / 100) * px * 1.6), hp * crownRatio(t.sp, rd),
        Math.max(t.h * 0.45, crownWidth(t.sp, t.d)) * px, season, ps, null, P.depth * 0.1, 0, t.id);
      c.restore();
    }
    if (landed === fl.trees.length && fl.landedAt === Infinity) { fl.landedAt = T; fl.truckAt = T + 0.35; this.onSound?.('truck', 0.4); }
    // the log pile by the edge of the plot, and the timber truck that fetches it
    const gy = L.groundY + 1;
    const size = Math.max(4, Math.min(10, L.px * 0.45));
    // kept on screen, so the truck has room to stop beside it on a phone too
    const pileX = Math.min(L.W / 2 + L.plotW * 0.56, L.x1 - size * 26);
    const tk = T - fl.truckAt;
    const loadK = clamp01((tk - 1.0) / 0.6);
    const onPile = Math.round(Math.min(12, landed) * (1 - loadK));
    for (let i = 0; i < onPile; i++) {
      const row = i < 5 ? 0 : i < 9 ? 1 : i < 12 ? 2 : 3;
      const col = row === 0 ? i : row === 1 ? i - 5 : i - 9;
      const x = pileX + (col + row * 0.5) * size * 1.9;
      const y = gy - size - row * size * 1.7;
      c.fillStyle = '#7a5530'; c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e2c48e'; c.beginPath(); c.arc(x, y, size * 0.68, 0, Math.PI * 2); c.fill();
    }
    if (tk >= 0) {
      // backs in (1 s), loads (0.6 s), drives away (1.1 s)
      const stop = pileX + size * 12;
      const far = Math.max(L.x1, L.W) + 260;
      const x = tk < 1 ? lerp(far, stop, easeOut(tk)) : tk < 1.6 ? stop : lerp(stop, far, easeIn(clamp01((tk - 1.6) / 1.1)));
      drawTruck(c, x, gy, Math.max(0.8, Math.min(2, L.px / 10)), Math.round(Math.min(12, landed) * loadK), season);
      if (tk > 2.7) { this.felling = null; fl.done(); }
    }
  }

  // ---------- the camera ----------

  /** Slide the view sideways (css px), as when a finger drags across the forest. */
  panBy(dx: number) {
    this.focusId = null;
    this.userPan += dx;
  }

  /** Zoom in (> 1) or out (< 1), between the whole stand and a close look. */
  zoomBy(k: number) {
    this.focusId = null;
    this.userZoom = Math.max(1, Math.min(2.6, this.userZoom * k));
    if (this.userZoom === 1) this.userPan *= 0.5;
  }

  /** Gently move to one tree (its id), or back to the whole forest (null). */
  focus(id: number | null) {
    this.focusId = id;
    if (id === null) { this.userZoom = 1; this.userPan = 0; }
  }

  /** Back to the whole stand, as it was. */
  resetCamera() { this.focusId = null; this.userZoom = 1; this.userPan = 0; }

  /** True when the camera has arrived where it is going (tests wait for this). */
  settled(): boolean {
    const t = this.camTarget;
    return Math.abs(t.pan - this.cam.pan) < 0.5 && Math.abs(t.panY - this.cam.panY) < 0.5 && Math.abs(t.s - this.cam.s) < 0.003;
  }

  private camTarget = { pan: 0, panY: 0, s: 1 };

  private updateCamera(L: ReturnType<ForestScene['layout']>, f: Forest, dt: number, reduced: boolean) {
    const avail = Math.max(80, L.groundY - this.insetTop);
    let s = this.userZoom;
    let pan = this.userPan;
    let panY = (s - 1) * avail * 0.35;
    const t = this.focusId !== null ? f.trees.find(x => x.id === this.focusId) : undefined;
    if (t) {
      const P = this.place(L, t, 0);
      const hp = Math.max(6, t.h * L.px * P.s);
      s = Math.max(1.2, Math.min(2.4, (avail * 0.55) / hp));
      // on a phone the tree card covers much of the view: move gently, zoom only a little
      if (L.W < 520) s = Math.min(s, 1.35);
      // keep the tree clear of the tree card on wide screens
      const tx = L.W > 760 ? (L.W - 340) / 2 : L.W / 2;
      pan = tx - P.x * s - (L.W / 2) * (1 - s);
      const mid = P.base - hp * 0.5;
      panY = this.insetTop + avail * 0.5 - L.groundY - (mid - L.groundY) * s;
    }
    const maxPan = L.plotW * s * 0.8 + L.W * 0.2;
    pan = Math.max(-maxPan, Math.min(maxPan, pan));
    if (!t) this.userPan = Math.max(-maxPan, Math.min(maxPan, this.userPan));
    this.camTarget = { pan, panY, s };
    // ease gently; with reduced motion, go straight there
    const k = reduced ? 1 : Math.min(1, dt * 2.6);
    this.cam.pan += (pan - this.cam.pan) * k;
    this.cam.panY += (panY - this.cam.panY) * k;
    this.cam.s += (s - this.cam.s) * k;
  }

  /** The world-to-screen offset of the stand (css px, inside the viewport). */
  private camX(L: { W: number }) { return (L.W / 2) * (1 - this.cam.s) + this.cam.pan; }
  private camY(L: { groundY: number }) { return L.groundY * (1 - this.cam.s) + this.cam.panY; }

  /** Draw into part of the canvas only (CSS px). Call after the canvas has its size. */
  setViewport(x: number, y: number, w: number, h: number) {
    this.dpr = forestBudget.dpr();
    if (w !== this.W || h !== this.H) { this.layersKey = ''; this.soilKey = ''; this.zoom = 0; }
    this.vx = x; this.vy = y; this.W = w; this.H = h;
  }

  /** pixels per metre, eased so the view zooms out smoothly as the trees grow */
  private zoom = 0;

  /** Layout in CSS pixels. */
  private layout() {
    const { W, H } = this;
    const soilH = Math.max(64, Math.min(130, H * 0.14));
    const groundY = H - this.insetBottom - soilH;
    const depthBand = Math.max(26, Math.min(90, (groundY - this.insetTop) * 0.18));
    const px = this.zoom || 20;
    const plotW = 20 * px;
    const plotX = (W - plotW) / 2;
    // the part of the world on screen (world x), set by the camera in draw()
    return { W, H, soilH, groundY, depthBand, px, plotW, plotX, x0: 0, x1: W };
  }

  /** Zoom so the tallest tree fills the space between the bars. */
  private updateZoom(f: Forest, dt: number) {
    const groundY = this.H - this.insetBottom - Math.max(64, Math.min(130, this.H * 0.14));
    const avail = Math.max(80, groundY - this.insetTop - 20);
    // dead trees still lying or standing count too, so a cleared plot does not zoom in on its old logs
    const tallest = Math.max(f.trees.reduce((m, t) => Math.max(m, t.h), 0), f.logs.reduce((m, l) => Math.max(m, l.h * 0.6), 0));
    const target = avail / Math.max(4, tallest * 1.12);
    // ease small changes; jump straight to big ones (a new forest, +10 years)
    const far = !this.zoom || Math.abs(target - this.zoom) / this.zoom > 0.25;
    this.zoom = far ? target : this.zoom + (target - this.zoom) * Math.min(1, dt * 1.5);
  }

  /** Where a tree stands on screen: depth into the plot gives a little perspective. */
  private place(L: ReturnType<ForestScene['layout']>, t: Tree, ox: number) {
    const depth = depthOf(t.id);
    const k = 1 - 0.25 * depth;
    return {
      x: L.W / 2 + ((t.x - 0.5) * L.plotW + ox) * k,
      base: L.groundY - depth * L.depthBand,
      s: 1 - 0.35 * depth,
      depth,
    };
  }

  /** The id of the tree under a point (CSS px), front trees first. */
  hit(x: number, y: number): number | null {
    x -= this.vx;
    y -= this.vy;
    if (x < 0 || y < 0 || x > this.W || y > this.H) return null;
    const L = this.layout();
    x = (x - this.camX(L)) / this.cam.s;
    y = (y - this.camY(L)) / this.cam.s;
    // a trunk under the finger wins: the one closest to the finger, so in a dense stand the tree you point at is the one you get
    let best: Hit | null = null, bestD = Infinity;
    for (const h of this.hits) {
      if (x < h.tx0 || x > h.tx1 || y < h.ty0 || y > h.y1) continue;
      const d = Math.abs(x - h.cx) + 0.25 * Math.abs(y - (h.base - 6));
      if (d < bestD) { bestD = d; best = h; }
    }
    if (best) return best.id;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h.id;
    }
    return null;
  }

  /** Where across the plot a point is (CSS px), 0..1, or null outside the plot. */
  plotFraction(x: number): number | null {
    const L = this.layout();
    const wx = (x - this.vx - this.camX(L)) / this.cam.s;
    const f = (wx - L.W / 2) / L.plotW + 0.5;
    return f >= 0 && f <= 1 ? f : null;
  }

  /** Screen position of a tree's base, for keyboard focus rings and tests. */
  treeBase(f: Forest, id: number): { x: number; y: number } | null {
    const t = f.trees.find(tr => tr.id === id);
    if (!t) return null;
    const L = this.layout();
    const P = this.place(L, t, 0);
    return { x: P.x * this.cam.s + this.camX(L) + this.vx, y: P.base * this.cam.s + this.camY(L) + this.vy };
  }

  draw(v: ForestView, dt = 0) {
    const c = this.c;
    this.updateZoom(v.forest, dt);
    const L0 = this.layout();
    const { season, ps } = seasonOf(v.p);
    const f = v.forest;
    const drought = !!v.rec?.weather.drought;
    const env = this.env = envLook(season, ps, v.rec);
    this.updateCamera(L0, f, dt, v.reducedMotion);
    this.reduced = v.reducedMotion;
    if (this.reduced) { this.spawns.clear(); this.pops = []; this.bits = []; if (this.felling) this.skipFelling(); }
    this.fxT += Math.min(0.05, dt);
    this.stepFx(Math.min(0.05, dt));
    const s = this.cam.s;
    const cx = this.camX(L0), cy = this.camY(L0);
    // the part of the world on screen
    const L = { ...L0, x0: -cx / s - 2, x1: (L0.W - cx) / s + 2 };
    const floorTop = L.groundY - L.depthBand;
    const time = v.reducedMotion ? 0 : v.time;
    c.setTransform(this.dpr, 0, 0, this.dpr, this.dpr * this.vx, this.dpr * this.vy);
    c.save();
    c.beginPath(); c.rect(0, 0, L.W, L.H); c.clip();

    // ---- far away: sky, sun, mountains, distant forests and haze (cached), then drifting clouds ----
    const groundOnScreen = L.groundY * s + cy;
    this.ensureLayers(L, season, f.place === 'lapland', env.haze);
    const bgKey = `${this.layersKey}|${this.cam.pan.toFixed(1)}|${this.cam.panY.toFixed(1)}|${s.toFixed(3)}|${drought}|${env.tint}|${this.insetTop}`;
    if (bgKey !== this.bgKey || !this.bg) { this.bgKey = bgKey; this.paintBackground(L, season, drought, env, groundOnScreen, floorTop * s + cy); }
    c.drawImage(this.bg!, 0, 0, L.W, L.H);
    drawClouds(c, L.W, this.insetTop, Math.max(this.insetTop + 40, floorTop * s + cy - L.H * 0.3), time, this.cam.pan * PARALLAX.clouds, season);

    // ---- the stand, under the camera ----
    c.save();
    c.translate(cx, cy);
    c.scale(s, s);
    const snow = snowCover(v.p, f.place);
    const fg = c.createLinearGradient(0, floorTop, 0, L.groundY);
    fg.addColorStop(0, darken(floorColor(season, ps, drought), 0.25));
    fg.addColorStop(1, floorColor(season, ps, drought));
    c.fillStyle = fg;
    c.fillRect(L.x0, floorTop, L.x1 - L.x0, L.depthBand + 3);
    this.drawFloor(L, f, season, snow, drought);
    this.drawLogs(L, v, season);

    // far trees first; the same forest continues at the sides
    const rd = relativeDensity(f.trees);
    const g01 = clamp01((v.p - 0.25) / 0.25);
    const all = [...f.trees, ...v.dying.filter(d => !f.trees.some(t => t.id === d.id))];
    const sorted = all.sort((a, b) => depthOf(b.id) - depthOf(a.id) || a.x - b.x);
    this.hits = [];
    const kMin = Math.floor((L.x0 - L.W / 2) / L.plotW) - 1;
    const kMax = Math.ceil((L.x1 - L.W / 2) / L.plotW) + 1;
    this.drawShadows(L, sorted, v, season, kMin, kMax);
    for (const t of sorted) {
      for (let k = kMin; k <= kMax; k++) if (k !== 0) this.drawOne(L, t, v, k * L.plotW, season, ps, g01, rd, false);
      this.drawOne(L, t, v, 0, season, ps, g01, rd, true);
    }

    this.drawFelling(L, season, ps, rd);
    this.drawPops(L, f);

    // the soil cutaway, and the animals that live here now
    this.drawSoil(L, v, season, ps);
    if (v.animals?.length) this.drawAnimals(L, v, season);
    this.drawBits();
    c.restore();

    // ---- close by: grass, ferns, stones; light, fog and weather ----
    this.drawLayer(L, this.layers!.foreground, PARALLAX.foreground, L.groundY + 12 - this.layers!.fgH);
    if (!v.reducedMotion) this.drawBlades(L, season, time, env.wind, groundOnScreen);
    if (env.beams > 0) this.drawBeams(L, env.beams, groundOnScreen);
    if (env.fog > 0) {
      const fy = floorTop * s + cy;
      const fogG = c.createLinearGradient(0, fy - 70, 0, groundOnScreen);
      fogG.addColorStop(0, 'rgba(236,240,238,0)');
      fogG.addColorStop(0.6, `rgba(236,240,238,${0.55 * env.fog})`);
      fogG.addColorStop(1, `rgba(236,240,238,${0.25 * env.fog})`);
      c.fillStyle = fogG;
      c.fillRect(0, fy - 70, L.W, groundOnScreen - fy + 70);
    }
    if (!v.reducedMotion) this.drawParticles(L, season, ps, v.time, env.rain, groundOnScreen);
    c.restore();
  }

  /** Compose the far background into one image: redrawn only when the camera, the view or the season changes. */
  private paintBackground(L: ReturnType<ForestScene['layout']>, season: Season, drought: boolean, env: EnvLook, groundOnScreen: number, horizon: number) {
    if (!this.bg) this.bg = document.createElement('canvas');
    const cw = Math.round(L.W * this.dpr), ch = Math.round(L.H * this.dpr);
    if (this.bg.width !== cw || this.bg.height !== ch) { this.bg.width = cw; this.bg.height = ch; }
    const main = this.c;
    const c = this.c = this.bg.getContext('2d')!;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, L.W, L.H);
    const [top, bottom] = SKIES[season];
    // the season's light is mixed into the sky itself
    const g = c.createLinearGradient(0, 0, 0, Math.max(10, groundOnScreen));
    g.addColorStop(0, mixHexStr(top, env.tint, env.tintAlpha * 2));
    g.addColorStop(1, mixHexStr(drought && season === 'summer' ? '#f3dcb0' : bottom, env.tint, env.tintAlpha * 2));
    c.fillStyle = g;
    c.fillRect(0, 0, L.W, Math.min(L.H, groundOnScreen + 4));
    this.drawSun(L, season, this.cam.pan * 0.02);
    const ly = this.layers!;
    this.drawLayer(L, ly.farRidge, PARALLAX.farRidge);
    this.drawLayer(L, ly.nearRidge, PARALLAX.nearRidge);
    this.drawLayer(L, ly.farForest, PARALLAX.farForest);
    // haze lying along the horizon, so the far layers fade into the air
    const hz = c.createLinearGradient(0, horizon - L.H * 0.14, 0, horizon + 4);
    hz.addColorStop(0, hexA(env.haze, 0));
    hz.addColorStop(1, hexA(env.haze, 0.55));
    c.fillStyle = hz;
    c.fillRect(0, horizon - L.H * 0.14, L.W, L.H * 0.14 + 4);
    this.drawLayer(L, ly.midForest, PARALLAX.midForest);
    this.c = main;
  }

  /** Paint the depth layers again when the view, the season or the place changes. */
  private ensureLayers(L: ReturnType<ForestScene['layout']>, season: Season, fell: boolean, haze: string) {
    const key = `${L.W}x${L.H}:${Math.round(L.groundY)}:${Math.round(L.depthBand)}:${season}:${fell}:${haze}:${this.dpr}`;
    if (key === this.layersKey && this.layers) return;
    this.layersKey = key;
    this.layers = paintDepth(L.W, L.H, L.groundY - L.depthBand, L.groundY, season, fell, haze, this.dpr);
  }

  /**
   * One depth layer: it moves `k` times as much as the stand when the camera
   * pans and zooms (parallax). Repeated sideways so its edge never shows.
   */
  private drawLayer(L: ReturnType<ForestScene['layout']>, band: Band, k: number, y = band.y) {
    const img = band.cv, h = band.h;
    const c = this.c;
    const ly = this.layers!;
    const s = 1 + (this.cam.s - 1) * k;
    const tx = (L.W / 2) * (1 - s) + this.cam.pan * k;
    const ty = L.groundY * (1 - s) + this.cam.panY * k;
    c.save();
    c.translate(tx, ty);
    c.scale(s, s);
    // where the layer's left edge lands, and enough copies to cover the view
    const left = -L.W * LAYER_EXTRA / 2;
    const vx0 = -tx / s, vx1 = (L.W - tx) / s;
    const n0 = Math.floor((vx0 - left) / ly.w), n1 = Math.floor((vx1 - left) / ly.w);
    for (let n = n0; n <= n1; n++) c.drawImage(img, left + n * ly.w, y, ly.w, h);
    c.restore();
  }

  /** Soft shadows on the forest floor, long and pointing away from a low sun. */
  private drawShadows(L: ReturnType<ForestScene['layout']>, trees: Tree[], v: ForestView, season: Season, kMin: number, kMax: number) {
    const c = this.c;
    const len = season === 'winter' ? 1.6 : season === 'summer' ? 0.6 : 1;
    c.fillStyle = season === 'winter' ? 'rgba(90,120,160,0.16)' : 'rgba(20,40,25,0.2)';
    c.beginPath();
    for (const t of trees) {
      if (v.dying.some(d => d.id === t.id) && v.p >= 0.8) continue;
      const prev = v.prev.get(t.id);
      const h = prev ? lerp(prev.h, t.h, clamp01((v.p - 0.25) / 0.25)) : t.h;
      for (let k = kMin; k <= kMax; k++) {
        const P = this.place(L, t, k * L.plotW);
        if (P.x < L.x0 - 60 || P.x > L.x1 + 60) continue;
        const hp = h * L.px * P.s;
        const w = Math.max(3, Math.max(h * 0.45, crownWidth(t.sp, t.d)) * L.px * P.s);
        c.moveTo(P.x + 2, P.base);
        c.ellipse(P.x - hp * 0.14 * len, P.base + 1, w * 0.45 + hp * 0.13 * len, Math.max(1.5, w * 0.08 + L.depthBand * 0.03), 0, 0, Math.PI * 2);
      }
    }
    c.fill();
  }

  /** A few tall blades of grass in front that bend in the wind (screen space). */
  private drawBlades(L: ReturnType<ForestScene['layout']>, season: Season, time: number, wind: number, groundOnScreen: number) {
    if (season === 'winter') return;
    const c = this.c;
    c.strokeStyle = season === 'autumn' ? '#a8903e' : season === 'spring' ? '#9ccb62' : '#5f9c48';
    c.lineWidth = 2;
    c.lineCap = 'round';
    const y = groundOnScreen + 12 * (1 + (this.cam.s - 1) * PARALLAX.foreground);
    for (let i = 0; i < 26; i++) {
      const x = ((hash(i + 400) * L.W * 1.2 + this.cam.pan * PARALLAX.foreground) % (L.W * 1.2) + L.W * 1.2) % (L.W * 1.2) - L.W * 0.1;
      const h = 22 + hash(i + 900) * 26;
      const bend = Math.sin(time * (1.1 + hash(i) * 0.6) + i) * 5 * wind + 4;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + bend * 0.3, y - h * 0.6, x + bend, y - h); c.stroke();
    }
  }

  /** Sunbeams slanting down through the canopy (screen space, soft). */
  private drawBeams(L: ReturnType<ForestScene['layout']>, amount: number, groundOnScreen: number) {
    const c = this.c;
    const sx = L.W * 0.82 + this.cam.pan * 0.02;
    const sy = this.insetTop + 10;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = L.W * (0.18 + i * 0.17);
      const w = 26 + i * 10;
      const gr = c.createLinearGradient(sx, sy, x, groundOnScreen);
      gr.addColorStop(0, `rgba(255,238,180,${0.07 * amount})`);
      gr.addColorStop(1, 'rgba(255,238,180,0)');
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(sx - 6, sy); c.lineTo(sx + 6, sy); c.lineTo(x + w, groundOnScreen); c.lineTo(x - w, groundOnScreen); c.closePath(); c.fill();
    }
    c.restore();
  }

  /** Dead trees: fallen logs on the floor and standing snags, greying and mossing as they rot. */
  private drawLogs(L: ReturnType<ForestScene['layout']>, v: ForestView, season: Season) {
    const c = this.c;
    for (const l of [...v.forest.logs].sort((a, b) => depthOf(b.id) - depthOf(a.id))) {
      // this year's dead appear when they die, late in the year
      if (v.rec && l.year === v.rec.year && v.p < 0.8) continue;
      const P = this.place(L, { id: l.id, x: l.x } as Tree, 0);
      const px = L.px * P.s;
      const rot = 1 - l.c / l.c0; // 0 fresh .. ~0.9 nearly gone
      const col = mixHex('#7a5a40', '#6f7f5a', rot);
      const thick = Math.max(3, (l.d / 100) * px * 2.2);
      if (l.standing) {
        const hh = l.h * px * (0.75 - 0.3 * rot);
        c.fillStyle = darken(l.sp === 'birch' || l.sp === 'aspen' ? '#d9d4c4' : '#8d8478', P.depth * 0.28);
        c.beginPath();
        c.moveTo(P.x - thick / 2, P.base); c.lineTo(P.x - thick * 0.3, P.base - hh); c.lineTo(P.x, P.base - hh - thick); c.lineTo(P.x + thick * 0.3, P.base - hh * 0.96); c.lineTo(P.x + thick / 2, P.base);
        c.fill();
        // a few dead branch stubs, and woodpecker holes in the bigger snags
        c.strokeStyle = c.fillStyle; c.lineWidth = Math.max(1, thick * 0.2);
        for (let i = 1; i <= 3; i++) { const y = P.base - hh * (0.45 + i * 0.15); c.beginPath(); c.moveTo(P.x, y); c.lineTo(P.x + (i % 2 ? 1 : -1) * thick * 1.6, y - thick * 0.6); c.stroke(); }
        if (l.d > 25) { c.fillStyle = '#2a211b'; c.beginPath(); c.ellipse(P.x, P.base - hh * 0.6, thick * 0.18, thick * 0.26, 0, 0, Math.PI * 2); c.fill(); }
      } else {
        const len = Math.min(L.plotW * 0.45, l.h * px * 0.7);
        const dir = hash(l.id + 5) < 0.5 ? -1 : 1;
        const y = P.base - thick * 0.4;
        c.fillStyle = darken(col, P.depth * 0.25);
        c.beginPath(); c.roundRect(Math.min(P.x, P.x + dir * len), y - thick / 2, len, thick, thick / 2); c.fill();
        // the cut or broken end shows rings when fresh; moss grows on old logs
        c.fillStyle = rot < 0.3 ? '#e2c48e' : '#7d6b4f';
        c.beginPath(); c.ellipse(P.x, y, thick * 0.3, thick / 2, 0, 0, Math.PI * 2); c.fill();
        if (rot > 0.35) { c.fillStyle = 'rgba(110,150,70,0.8)'; c.beginPath(); c.ellipse(P.x + dir * len * 0.5, y - thick * 0.45, len * 0.35, thick * 0.22, 0, 0, Math.PI * 2); c.fill(); }
        if (season === 'winter') { c.fillStyle = 'rgba(250,252,255,0.9)'; c.fillRect(Math.min(P.x, P.x + dir * len), y - thick / 2 - 2, len, 3); }
      }
    }
  }

  /** Small figures for the animals the forest supports, each where it would be. */
  private drawAnimals(L: ReturnType<ForestScene['layout']>, v: ForestView, season: Season) {
    const c = this.c;
    const f = v.forest;
    const k = Math.max(1.1, Math.min(2.2, L.px / 12));
    const trunkOf = (pred: (t: Tree) => boolean, n = 0) => {
      const ts = f.trees.filter(pred).sort((a, b) => depthOf(a.id) - depthOf(b.id) || b.d - a.d);
      return ts[n % Math.max(1, ts.length)];
    };
    const at = (t: Tree | undefined, frac: number) => {
      if (!t) return null;
      const P = this.place(L, t, 0);
      return { x: P.x, y: P.base - t.h * L.px * P.s * frac, w: Math.max(2, (t.d / 100) * L.px * P.s * 1.6) };
    };
    const bob = v.reducedMotion ? 0 : Math.sin(v.time * 2) * 1.5;
    // Phase 7: each animal does what it does in a forest (still when motion is reduced)
    const tt = v.reducedMotion ? 0 : v.time;
    for (const a of v.animals ?? []) {
      if (a === 'moose') {
        // it ambles about and now and then lowers its head to browse a sapling
        const x = L.W * 0.28 + Math.sin(tt * 0.08) * L.W * 0.08, y = L.groundY - L.depthBand * 0.35;
        drawMoose(c, x, y, 34 * k, season, Math.max(0, Math.sin(tt * 0.9)) ** 3);
      } else if (a === 'capercaillie') {
        drawCapercaillie(c, L.W * 0.66, L.groundY - L.depthBand * 0.2, 20 * k);
      } else if (a === 'blackWoodpecker') {
        const snag = f.logs.find(l => l.standing && l.d > 20);
        const p = snag ? (() => { const P = this.place(L, { id: snag.id, x: snag.x } as Tree, 0); return { x: P.x, y: P.base - snag.h * L.px * P.s * 0.4, w: (snag.d / 100) * L.px * 1.6 }; })() : at(trunkOf(t => t.d >= 30), 0.35);
        if (p) {
          // the black woodpecker drums on dead wood in short bursts, and chips fly
          const drumming = !v.reducedMotion && tt % 4 < 0.7;
          const jx = drumming ? Math.abs(Math.sin(tt * 55)) * 2.5 * k : 0;
          drawWoodpecker(c, p.x + p.w / 2 - jx, p.y + bob, 14 * k, '#151515', '#d7262b', false);
          if (drumming) {
            c.fillStyle = '#d9b98a';
            for (let i = 0; i < 3; i++) {
              const u = ((tt * 3 + i * 0.33) % 1);
              c.fillRect(p.x + p.w / 2 + (4 + u * 14) * k, p.y - 6 * k + u * u * 22 * k - i * 3 * k, 2 * k, 2 * k);
            }
          }
        }
      } else if (a === 'spottedWoodpecker') {
        const p = at(trunkOf(t => (t.sp === 'spruce' || t.sp === 'pine') && t.d >= 18, 1), 0.55);
        // the spotted woodpecker hops up its trunk, then flies back down
        if (p) drawWoodpecker(c, p.x - p.w / 2 - 10 * k, p.y - bob - (Math.floor(tt * 2) % 8) * 3.5 * k, 11 * k, '#1d1d1d', '#d7262b', true);
      } else if (a === 'treecreeper') {
        const p = at(trunkOf(t => t.d >= 28, 2), 0.25);
        // the treecreeper creeps up the bark looking for insects, then starts again from the foot
        if (p) p.y -= ((tt * 6) % 40) * k;
        if (p) { c.fillStyle = '#7b5a3a'; c.beginPath(); c.ellipse(p.x + p.w / 2, p.y + bob * 2, 3.2 * k, 6 * k, -0.3, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f3efe3'; c.beginPath(); c.ellipse(p.x + p.w / 2 + 1.8 * k, p.y + bob * 2, 1.5 * k, 4.5 * k, -0.3, 0, Math.PI * 2); c.fill(); }
      } else if (a === 'siberianJay') {
        const p = at(trunkOf(t => t.sp === 'spruce' || t.sp === 'pine', 3), 0.5);
        if (p) drawJay(c, p.x + p.w * 3, p.y, 12 * k);
      } else if (a === 'flyingSquirrel') {
        const p = at(trunkOf(t => t.sp === 'aspen'), 0.7);
        if (p) drawFlyingSquirrel(c, p.x + 30 * k + (v.reducedMotion ? 0 : (v.time * 20) % 60), p.y + ((v.time * 8) % 25), 9 * k);
      }
    }
  }

  private drawSun(L: ReturnType<ForestScene['layout']>, season: Season, shift = 0) {
    const c = this.c;
    const span = L.groundY - this.insetTop;
    const y = this.insetTop + span * (season === 'winter' ? 0.55 : season === 'summer' ? 0.12 : 0.3);
    const x = L.W * 0.82 + shift;
    const r = Math.max(16, Math.min(34, L.W * 0.04));
    const glow = c.createRadialGradient(x, y, r * 0.3, x, y, r * 3);
    glow.addColorStop(0, 'rgba(255,236,170,0.7)');
    glow.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(x, y, r * 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffe7a0';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }

  private drawOne(L: ReturnType<ForestScene['layout']>, t: Tree, v: ForestView, ox: number,
    season: Season, ps: number, g01: number, rd: number, main: boolean) {
    const c = this.c;
    const prev = v.prev.get(t.id);
    const h = prev ? lerp(prev.h, t.h, g01) : t.h;
    const d = prev ? lerp(prev.d, t.d, g01) : t.d;
    const dying = v.dying.some(x => x.id === t.id) && !v.forest.trees.some(x => x.id === t.id);
    const cause: DeathCause | 'cut' = dying ? (v.forest.logs.find(l => l.id === t.id)?.cause ?? (v.rec && v.forest.harvests.some(hh => hh.year === v.rec!.year) ? 'cut' : 'crowded')) : 'crowded';
    if (dying && v.p >= 0.8) return; // from now on it is a log or a snag
    // a beetle-killed spruce turns red-brown in summer; others fade in autumn; storms throw trees down in autumn
    const deadNow = dying && (cause === 'beetle' ? v.p > 0.3 : v.p > 0.55);
    const fall = dying && cause === 'storm' ? clamp01((v.p - 0.62) / 0.12) : 0;
    const alpha = 1;
    const P = this.place(L, t, ox);
    const x = P.x;
    const base = P.base;
    const px = L.px * P.s;
    if (x < L.x0 - L.plotW * 0.3 || x > L.x1 + L.plotW * 0.3) return;
    const hp = Math.max(3, h * px);
    const stage = treeStage({ h, age: t.age, sp: t.sp });
    const look = STAGE_LOOK[stage];
    const crownW = Math.max(h * 0.45, crownWidth(t.sp, d)) * px;
    const ratio = h < 1.3 ? 0.9 : crownRatio(t.sp, rd);
    // far trees fade towards the haze (atmospheric perspective); when the camera looks at one tree, the others step back
    const shade = P.depth * 0.1 + (main ? 0 : 0.08) + (this.focusId !== null && this.focusId !== t.id ? 0.14 : 0);
    hazeK = Math.min(0.55, P.depth * 0.38 + (main ? 0 : 0.18));
    hazeRGB = this.env ? rgbOf(this.env.haze) : null;
    // a seedling just planted pops up out of the ground (increment 2)
    const spn = this.spawns.size ? this.spawns.get(t.id) : undefined;
    let grow = 1;
    if (spn) {
      const k = (this.fxT - spn.t0) / 0.5;
      if (k < 0) return;
      if (!spn.burst && main) {
        spn.burst = true;
        this.burst(x, base - 1, 8, ['#6e4f33', '#8a6845', '#5b402a'], 90, 1.4);
        this.burst(x, base - hp, 4, ['#d9f59a', '#fff6c0'], 40, 2.2, -30);
        this.onSound?.('plant', Math.max(-0.8, Math.min(0.8, (x - L.W / 2) / L.W * 2)));
      }
      grow = k >= 1 ? 1 : easeOutBack(k);
    }
    c.save();
    if (grow !== 1) { c.translate(x, base); c.scale(grow, grow); c.translate(-x, -base); }
    c.globalAlpha = alpha * (main ? 1 : 0.7);
    // a slight lean of its own, and the wind: young trees bend most, old ones least
    const wind = v.reducedMotion || dying ? 0 : Math.sin(v.time * (0.7 + hash(t.id + 3) * 0.5) + t.id * 1.7) * 0.012 * (this.env?.wind ?? 1) * look.sway;
    const lean = (hash(t.id) - 0.5) * 0.04 + wind;
    if (fall > 0) {
      c.translate(x, base);
      c.rotate((hash(t.id + 5) < 0.5 ? -1 : 1) * fall * Math.PI / 2);
      c.translate(-x, -base);
    }
    if (h < 1.3 && !dying) {
      c.translate(x, base); c.rotate(wind * 3); c.translate(-x, -base);
      drawSeedling(c, t.sp, x, base, hp, season, ps, shade);
    } else {
      const trunkW = Math.max(1.2, (d / 100) * px * 1.6);
      drawTree(c, t.sp, x, base, hp, trunkW, hp * ratio, crownW, season, ps,
        deadNow ? (cause === 'beetle' ? '#b5522f' : '#8b6a45') : null, shade, lean, t.id);
      if (!deadNow && hp > 40) drawAge(c, t.sp, x, base, hp, trunkW, hp * ratio, crownW, season, look, t.id, lean);
    }
    if (main && !dying && (t.marked || (t.keep && !t.mine))) {
      // marked to cut: an orange paint stripe; kept: a teal band (your own birch has its yellow ribbon)
      const tw = Math.max(3, (d / 100) * px * 1.6) + 2;
      const y = base - (h > 1.6 ? hp * (1.3 / h) : hp * 0.55);
      c.fillStyle = t.marked ? '#ff6a2b' : '#3fd0c0';
      c.strokeStyle = 'rgba(16, 36, 28, 0.85)';
      c.lineWidth = 1;
      c.beginPath(); c.rect(x - tw / 2, y - (t.marked ? 6 : 2.5), tw, t.marked ? 12 : 5); c.fill(); c.stroke();
    }
    if (main && v.lens && !dying) {
      // how much light this tree got last year: green plenty, yellow some, red very little
      c.fillStyle = t.vigor > 0.75 ? '#7fe07a' : t.vigor > 0.45 ? '#ffd23d' : '#ff5a4a';
      c.strokeStyle = 'rgba(16, 36, 28, 0.9)';
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, base - hp - 8, Math.max(4, Math.min(9, hp * 0.06)), 0, Math.PI * 2); c.fill(); c.stroke();
    }
    if (main && t.mine && !dying) {
      // your birch wears a yellow ribbon at breast height (1.3 m), where its rings are measured
      const tw = Math.max(3, (d / 100) * px * 1.6) + 3;
      const y = base - (h > 1.6 ? hp * (1.3 / h) : hp * 0.55);
      c.fillStyle = '#ffc83d';
      c.strokeStyle = 'rgba(16, 36, 28, 0.85)';
      c.lineWidth = 1;
      c.beginPath(); c.rect(x - tw / 2, y - 2.5, tw, 5); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x + tw / 2, y - 2); c.lineTo(x + tw / 2 + 9, y + 3); c.lineTo(x + tw / 2 + 5, y + 6); c.lineTo(x + tw / 2, y + 2); c.closePath(); c.fill(); c.stroke();
    }
    c.restore();
    hazeK = 0;
    if (main && !dying) {
      const w = Math.max(crownW, 14);
      // the trunk below the crown, at least a finger wide
      const tw = Math.max(12, (d / 100) * px * 1.6 + 8);
      this.hits.push({ id: t.id, x0: x - w / 2, x1: x + w / 2, y0: base - hp, y1: base + 4, tx0: x - tw / 2, tx1: x + tw / 2, ty0: base - Math.max(14, hp * (1 - ratio)), cx: x, base });
      if (v.selected === t.id) {
        c.strokeStyle = '#ffc83d';
        c.lineWidth = 3;
        c.beginPath(); c.ellipse(x, base + 2, Math.max(10, w * 0.45), 5, 0, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(x, base - hp - 14); c.lineTo(x - 6, base - hp - 24); c.lineTo(x + 6, base - hp - 24); c.closePath();
        c.fillStyle = '#ffc83d'; c.fill();
      }
    }
  }

  private drawFloor(L: ReturnType<ForestScene['layout']>, f: Forest, season: Season, snow: number, drought: boolean) {
    const c = this.c;
    const lai = f.history.at(-1)?.stats.lai ?? 0;
    const keep = 1 - 0.5 * Math.min(1, lai / 4);
    // one tuft per 5 px of world, placed from its own hash, so the floor stays put as the camera moves
    for (let i = Math.floor(L.x0 / 5); i <= Math.ceil(L.x1 / 5); i++) {
      if (hash(i * 3 + 1) > keep) continue;
      const x = i * 5 + hash(i * 7 + 2) * 5;
      const y = L.groundY - hash(i * 11 + 3) * L.depthBand;
      const kind = hash(i * 13 + 4);
      if (kind < 0.5) {
        // blueberry and lingonberry tufts
        c.fillStyle = season === 'autumn' ? (kind < 0.25 ? '#b5452f' : '#8a5a2a') : drought && season === 'summer' ? '#7f8a45' : '#4f7d3c';
        c.beginPath(); c.ellipse(x, y - 3, 5, 3.5, 0, 0, Math.PI * 2); c.fill();
        if (season === 'summer' && kind < 0.12) { c.fillStyle = '#3b4f9a'; c.beginPath(); c.arc(x + 2, y - 3, 1.4, 0, Math.PI * 2); c.fill(); }
        if (season === 'spring' && kind < 0.06) { c.fillStyle = '#f7f5ee'; c.beginPath(); c.arc(x - 2, y - 5, 1.6, 0, Math.PI * 2); c.fill(); }
      } else {
        c.fillStyle = '#6f9a4a';
        c.beginPath(); c.ellipse(x, y - 1, 6, 2, 0, 0, Math.PI * 2); c.fill();
      }
    }
    if (snow > 0) {
      c.fillStyle = `rgba(246,250,253,${0.55 + 0.45 * snow})`;
      c.fillRect(L.x0, L.groundY - L.depthBand, L.x1 - L.x0, L.depthBand + 3);
    }
  }

  /** The soil's colour, layers, stones and grain: painted once per soil and size, wide enough to pan across. */
  private paintSoil(L: ReturnType<ForestScene['layout']>, soilId: SoilId) {
    const key = `${L.W}x${L.H}:${Math.round(L.soilH)}:${soilId}:${this.dpr}`;
    if (key === this.soilKey && this.soilBase) return;
    this.soilKey = key;
    const W3 = L.W * 3, h = L.soilH;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W3 * this.dpr);
    cv.height = Math.round((h + 4) * this.dpr);
    const c = cv.getContext('2d')!;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const soil = SOILS[soilId];
    const look = SOIL_LOOK[soilId];
    c.fillStyle = look.base;
    c.fillRect(0, 0, W3, h);
    c.fillStyle = soilId === 'peat' ? '#2e2016' : '#3f2c1d';
    c.fillRect(0, 0, W3, Math.max(5, h * 0.08));
    const r = makeRng('soil-' + soilId);
    const soilDepth = soilId === 'rocky' ? h * 0.32 : h;
    if (soilId === 'rocky') {
      c.fillStyle = '#8e9296';
      for (let x = -20; x < W3 + 40; x += 34 + r() * 30) {
        const w = 40 + r() * 50;
        c.beginPath();
        c.moveTo(x, h); c.lineTo(x + w * 0.1, soilDepth + r() * 8); c.lineTo(x + w * 0.6, soilDepth - 4 + r() * 6); c.lineTo(x + w, soilDepth + r() * 10); c.lineTo(x + w, h);
        c.fill();
      }
      c.fillStyle = '#9fa3a7';
      c.fillRect(0, h * 0.75, W3, h * 0.25);
    }
    for (let i = 0; i < W3 * h / 140; i++) {
      const x = r() * W3;
      const y = h * 0.1 + r() * (soilDepth - h * 0.1);
      if (soilId === 'clay') { c.fillStyle = look.dark; c.fillRect(x, y, 10 + r() * 16, 1.4); }
      else if (soilId === 'peat') { c.strokeStyle = look.grain; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 * (r() - 0.5), y + 5 * r()); c.stroke(); }
      else if (soilId === 'loam' && r() < 0.06) { c.fillStyle = '#9b9690'; c.beginPath(); c.ellipse(x, y, 3 + r() * 4, 2 + r() * 3, r(), 0, Math.PI * 2); c.fill(); }
      else { c.fillStyle = r() < 0.5 ? look.grain : look.dark; c.fillRect(x, y, 1.6, 1.6); }
    }
    // soil food: small pale dots, more in fertile soil
    c.fillStyle = 'rgba(255,248,220,0.55)';
    const rn = makeRng('food');
    for (let i = 0; i < (W3 / 18) * soil.nutrients; i++) c.fillRect(rn() * W3, 6 + rn() * soilDepth * 0.6, 2, 2);
    this.soilBase = cv;
  }

  private drawSoil(L: ReturnType<ForestScene['layout']>, v: ForestView, season: Season, ps: number) {
    const c = this.c;
    const f = v.forest;
    const y0 = L.groundY + 2;
    const h = L.soilH;
    const soilDepth = f.soil === 'rocky' ? h * 0.32 : h;
    this.paintSoil(L, f.soil);
    // the painted soil covers world x from -W to 2W; repeat it if the camera looks further
    const W3 = L.W * 3;
    for (let n = Math.floor((L.x0 + L.W) / W3); n <= Math.floor((L.x1 + L.W) / W3); n++) c.drawImage(this.soilBase!, -L.W + n * W3, y0, W3, h + 4);
    // water: rises in spring, sinks through a dry summer, refills in autumn
    const level = waterLevel(v, season, ps) * soilDepth * 0.92;
    const wy = y0 + soilDepth - level;
    c.fillStyle = 'rgba(52,140,215,0.55)';
    c.fillRect(L.x0, wy, L.x1 - L.x0, level);
    c.strokeStyle = 'rgba(160,215,245,0.85)';
    c.lineWidth = 2;
    c.beginPath();
    for (let x = Math.floor(L.x0 / 8) * 8; x <= L.x1; x += 8) c.lineTo(x, wy + Math.sin(x * 0.08 + v.time * 1.5) * (v.reducedMotion ? 0 : 1.2));
    c.stroke();
    if (season === 'winter') {
      c.fillStyle = 'rgba(225,240,250,0.55)';
      c.fillRect(L.x0, y0, L.x1 - L.x0, h * 0.18 * clamp01(ps * 2));
    }
    // roots of the trees on the plot
    c.lineCap = 'round';
    for (const t of f.trees) {
      const x = this.place(L, t, 0).x;
      const depth = Math.min(soilDepth * (f.soil === 'peat' ? 0.35 : 0.9), (4 + Math.sqrt(t.h) * 9) * (h / 100));
      const spread = Math.min(L.plotW / 6, 4 + t.h * L.px * 0.12);
      if (x < L.x0 - 20 || x > L.x1 + 20) continue;
      c.strokeStyle = t.sp === 'birch' ? 'rgba(225,205,170,0.55)' : 'rgba(205,170,120,0.55)';
      c.lineWidth = Math.max(0.8, Math.min(3, t.d / 12));
      const rr = makeRng('root' + t.id);
      for (let k = 0; k < 2; k++) {
        const ex = x + (rr() - 0.5) * 2 * spread;
        c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x + (ex - x) * 0.3, y0 + depth * 0.5, ex, y0 + depth * (0.5 + rr() * 0.5)); c.stroke();
      }
    }
    // depth shade at the bottom edge, and the dark below
    const fade = c.createLinearGradient(0, y0 + h - 18, 0, y0 + h);
    fade.addColorStop(0, 'rgba(7,31,27,0)');
    fade.addColorStop(1, 'rgba(7,31,27,0.9)');
    c.fillStyle = fade;
    c.fillRect(L.x0, y0 + h - 18, L.x1 - L.x0, 18);
    c.fillStyle = '#071f1b';
    c.fillRect(L.x0, y0 + h, L.x1 - L.x0, L.H * 2);
  }

  private drawParticles(L: ReturnType<ForestScene['layout']>, season: Season, ps: number, time: number, rain = 0, groundOnScreen = L.groundY) {
    const c = this.c;
    L = { ...L, groundY: Math.max(40, groundOnScreen) };
    if (rain > 0) {
      // a summer shower: thin slanting streaks
      c.strokeStyle = `rgba(200,220,240,${0.55 * rain})`;
      c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i < 90; i++) {
        const x = (hash(i + 300) * L.W + time * 60) % L.W;
        const y = (hash(i + 700) * L.groundY + time * (380 + hash(i) * 120)) % L.groundY;
        c.moveTo(x, y); c.lineTo(x - 4, y + 12);
      }
      c.stroke();
    }
    if (season === 'winter') {
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 70; i++) {
        const x = (hash(i) * L.W + Math.sin(time * 0.7 + i) * 12 + L.W) % L.W;
        const y = (hash(i + 99) * L.groundY + time * (18 + hash(i + 7) * 20)) % L.groundY;
        c.beginPath(); c.arc(x, y, 1.2 + hash(i + 3) * 1.6, 0, Math.PI * 2); c.fill();
      }
    } else if (season === 'autumn' && ps > 0.3) {
      for (let i = 0; i < 26; i++) {
        const x = (hash(i) * L.W + time * 14 + Math.sin(time + i) * 20) % L.W;
        const y = (hash(i + 50) * L.groundY * 0.8 + time * (22 + hash(i) * 14)) % (L.groundY - 4);
        c.fillStyle = i % 3 ? '#e8b83a' : '#d9822b';
        c.beginPath(); c.ellipse(x, y, 3, 1.6, time * 2 + i, 0, Math.PI * 2); c.fill();
      }
    }
  }
}

// ---------- helpers ----------

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const easeIn = (k: number) => k * k;
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
/** Overshoots a little and settles: a springy pop. */
const easeOutBack = (k: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

/** A timber truck (cab on the right) with `logs` on its bed, standing on `y`. */
function drawTruck(c: CanvasRenderingContext2D, x: number, y: number, s: number, logs: number, season: Season) {
  const w = 120 * s, h = 34 * s;
  c.fillStyle = '#1d2a24';
  for (const wx of [0.12, 0.3, 0.72, 0.88]) { c.beginPath(); c.arc(x + w * wx, y - 7 * s, 7 * s, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#3f5d73'; c.fillRect(x, y - 16 * s, w * 0.66, 5 * s);
  c.fillStyle = '#2c3e4c';
  for (const sx of [0.04, 0.32, 0.6]) c.fillRect(x + w * sx, y - h, 3 * s, h - 14 * s);
  c.fillStyle = '#d9a441'; c.beginPath(); c.roundRect(x + w * 0.7, y - h, w * 0.3, h - 9 * s, 4 * s); c.fill();
  c.fillStyle = '#bfe0f0'; c.fillRect(x + w * 0.8, y - h + 5 * s, w * 0.15, 9 * s);
  const r = 4.5 * s;
  for (let i = 0; i < logs; i++) {
    const row = Math.floor(i / 5), col = i % 5;
    const lx = x + w * 0.08 + col * r * 2.1 + (row % 2) * r;
    const ly = y - 16 * s - r - row * r * 1.8;
    c.fillStyle = '#7a5530'; c.beginPath(); c.arc(lx, ly, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e2c48e'; c.beginPath(); c.arc(lx, ly, r * 0.65, 0, Math.PI * 2); c.fill();
  }
  if (season === 'winter') { c.fillStyle = 'rgba(250,252,255,0.9)'; c.fillRect(x + w * 0.7, y - h - 2 * s, w * 0.3, 3 * s); }
}

/** #rrggbb with an alpha, as rgba(). */
function hexA(col: string, a: number): string {
  const n = parseInt(col.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Signs of age (visual.ts): moss at the foot of mature trees, and beard
 * lichen (naava) hanging from the branches of old spruces and pines, which
 * grows in clean air in old forests.
 */
function drawAge(c: CanvasRenderingContext2D, sp: SpeciesId, x: number, base: number, h: number, trunkW: number,
  crownLen: number, crownW: number, season: Season, look: { lichen: boolean; moss: boolean }, id: number, lean: number) {
  if (look.moss && season !== 'winter') {
    c.fillStyle = 'rgba(96,140,64,0.85)';
    c.beginPath(); c.ellipse(x - trunkW * 0.2, base - 2, trunkW * 0.75, Math.max(2, trunkW * 0.35), 0, Math.PI, 0); c.fill();
  }
  if (look.lichen && (sp === 'spruce' || sp === 'pine')) {
    c.strokeStyle = 'rgba(196,204,180,0.85)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const u = 0.25 + 0.6 * hash(id * 17 + i);
      const y = base - h + crownLen * u;
      const bx = x + lean * (base - y) + (hash(id * 19 + i) - 0.5) * crownW * 0.7;
      const len = 4 + 7 * hash(id * 23 + i);
      c.moveTo(bx, y); c.lineTo(bx + 0.8, y + len);
    }
    c.stroke();
  }
}

/** How far back in the plot a tree stands, 0 (front) .. 1 (back). */
const depthOf = (id: number) => hash(id * 31 + 7);

function crownWidth(sp: SpeciesId, d: number): number {
  return sp === 'spruce' ? 0.8 + 0.11 * d : sp === 'pine' ? 0.7 + 0.12 * d : 0.9 + 0.13 * d;
}

/** Crowded stands lose their lower branches: the live crown gets shorter. */
function crownRatio(sp: SpeciesId, rd: number): number {
  const r = Math.min(1, rd);
  return sp === 'spruce' ? 0.8 - 0.3 * r : sp === 'pine' ? 0.55 - 0.25 * r : 0.6 - 0.25 * r;
}

function floorColor(season: Season, ps: number, drought: boolean): string {
  if (season === 'winter') return '#e8eef2';
  if (season === 'spring') return ps < 0.4 ? '#7a7f52' : '#7da24e';
  if (season === 'autumn') return '#8a7a3e';
  return drought ? '#9a9a5a' : '#5f8f45';
}

function snowCover(p: number, place: Forest['place']): number {
  const deep = PLACES[place].snowWater / 190;
  if (p >= 0.8) return clamp01((p - 0.8) / 0.12) * Math.max(0.3, deep);
  if (p < 0.08) return (1 - p / 0.08) * Math.max(0.3, deep);
  return 0;
}

function waterLevel(v: ForestView, season: Season, ps: number): number {
  const soil = SOILS[v.forest.soil];
  const rec = v.rec;
  const spring = rec ? clamp01(rec.springWater / soil.waterCap) : 0.8;
  const end = rec ? Math.max(0.06, spring * (rec.water < 1 ? rec.water * 0.45 : 0.6)) : 0.5;
  const wet = soil.wetness > 0.5 ? 0.85 : 0;
  let l: number;
  if (season === 'spring') l = lerp(0.6, spring, ps);
  else if (season === 'summer') l = lerp(spring, end, ps);
  else if (season === 'autumn') l = lerp(end, 0.7, ps);
  else l = 0.65;
  return Math.max(wet, l);
}

/** Leaf colour of a birch through the year, and how much of the crown is in leaf. */
function birchLeaves(season: Season, ps: number): { color: string; amount: number } {
  if (season === 'spring') return { color: '#b8d86b', amount: clamp01((ps - 0.3) / 0.5) };
  if (season === 'summer') return { color: '#6fa344', amount: 1 };
  if (season === 'autumn') return { color: ps < 0.3 ? '#a8b845' : '#e8b83a', amount: 1 - clamp01((ps - 0.6) / 0.4) };
  return { color: '#e8b83a', amount: 0 };
}

/** While a tree is drawn: how far its colours fade towards the haze, and the haze colour (atmospheric perspective). */
let hazeK = 0;
let hazeRGB: [number, number, number] | null = null;
const rgbOf = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

/** Darken a colour given as #rrggbb or rgb(r,g,b), then fade it into the haze if the tree being drawn is far away. */
function darken(col: string, k: number): string {
  let r: number, g: number, b: number;
  if (col.startsWith('#')) { const n = parseInt(col.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  else [r, g, b] = (col.match(/\d+/g) ?? ['0', '0', '0']).map(Number);
  const f = (v: number, hz: number) => Math.round(v * (1 - k) * (1 - hazeK) + hz * hazeK);
  const [hr, hg, hb] = hazeK > 0 && hazeRGB ? hazeRGB : [0, 0, 0];
  return `rgb(${f(r, hr)},${f(g, hg)},${f(b, hb)})`;
}

function drawTree(c: CanvasRenderingContext2D, sp: SpeciesId, x: number, base: number, h: number, trunkW: number,
  crownLen: number, crownW: number, season: Season, ps: number, deadColor: string | null, shade: number, lean: number, id: number) {
  const dead = deadColor !== null;
  const topX = x + lean * h;
  const winter = season === 'winter';
  const deadCol = deadColor ?? '#8b6a45';

  // trunk
  if (sp === 'birch' || sp === 'aspen') {
    c.fillStyle = darken(sp === 'aspen' ? '#b9bfae' : '#efece2', shade);
    c.beginPath();
    c.moveTo(x - trunkW / 2, base); c.lineTo(topX - trunkW * 0.15, base - h * 0.96); c.lineTo(topX + trunkW * 0.15, base - h * 0.96); c.lineTo(x + trunkW / 2, base);
    c.fill();
    if (trunkW > 2.5) {
      c.fillStyle = '#26221e';
      const n = Math.floor(h / 9);
      for (let i = 1; i < n; i++) {
        const y = base - (i / n) * h * 0.8;
        const w = trunkW * (1 - (i / n) * 0.6);
        c.fillRect(x + lean * (base - y) - w * 0.4 + (hash(id * 7 + i) - 0.5) * w * 0.4, y, w * 0.5, Math.max(1, h * 0.012));
      }
      // dark rough bark at the foot of old birches
      c.fillStyle = darken('#4a443e', shade);
      c.fillRect(x - trunkW / 2, base - Math.min(h * 0.08, 18), trunkW, Math.min(h * 0.08, 18));
    }
  } else {
    c.fillStyle = darken(sp === 'pine' ? '#6e5240' : '#5b4636', shade);
    c.beginPath();
    c.moveTo(x - trunkW / 2, base); c.lineTo(topX - trunkW * 0.12, base - h); c.lineTo(topX + trunkW * 0.12, base - h); c.lineTo(x + trunkW / 2, base);
    c.fill();
    if (sp === 'pine' && h > 30) {
      // the orange "mirror bark" of the upper trunk
      c.fillStyle = darken('#d07a3c', shade);
      const y1 = base - h * 0.45;
      c.beginPath();
      c.moveTo(x + lean * h * 0.45 - trunkW * 0.38, y1); c.lineTo(topX - trunkW * 0.12, base - h); c.lineTo(topX + trunkW * 0.12, base - h); c.lineTo(x + lean * h * 0.45 + trunkW * 0.38, y1);
      c.fill();
    }
  }

  // crown
  if (sp === 'spruce') {
    const tiers = Math.max(3, Math.min(9, Math.round(crownLen / 9)));
    const col = dead ? deadCol : darken('#2c5a3c', shade);
    const dark = dead ? deadCol : darken('#1f4630', shade);
    for (let i = 0; i < tiers; i++) {
      const tTop = i / tiers;
      const yTop = base - h + crownLen * tTop;
      const yBot = base - h + crownLen * Math.min(1, (i + 1.6) / tiers);
      const w = crownW * (0.18 + 0.82 * ((i + 1) / tiers)) / 2;
      const cx = topX + (x - topX) * ((yBot - (base - h)) / h);
      c.fillStyle = i % 2 ? col : dark;
      c.beginPath();
      c.moveTo(cx, yTop);
      c.quadraticCurveTo(cx - w * 0.6, yBot - (yBot - yTop) * 0.4, cx - w, yBot + 2);
      c.lineTo(cx + w, yBot + 2);
      c.quadraticCurveTo(cx + w * 0.6, yBot - (yBot - yTop) * 0.4, cx, yTop);
      c.fill();
      if (winter && !dead) {
        c.fillStyle = 'rgba(250,252,255,0.9)';
        c.beginPath(); c.ellipse(cx, yBot - 1, w * 0.7, Math.max(1.2, (yBot - yTop) * 0.12), 0, Math.PI, 0); c.fill();
      }
    }
  } else if (sp === 'pine') {
    const col = dead ? deadCol : darken('#47703d', shade);
    const dark = dead ? deadCol : darken('#33552e', shade);
    const blobs = Math.max(3, Math.min(7, Math.round(crownW / 10) + 2));
    const top = base - h;
    for (let i = 0; i < blobs; i++) {
      const u = (hash(id * 13 + i) - 0.5);
      const bx = topX + u * crownW * 0.9;
      const by = top + crownLen * (0.15 + 0.6 * hash(id * 5 + i));
      const rw = crownW * (0.22 + 0.12 * hash(id + i));
      const rh = Math.max(2, crownLen * 0.18);
      if (h > 20) {
        c.strokeStyle = darken('#6e5240', shade);
        c.lineWidth = Math.max(1, trunkW * 0.25);
        c.beginPath(); c.moveTo(topX + (x - topX) * ((by - top) / h), by + rh * 0.5); c.lineTo(bx, by); c.stroke();
      }
      c.fillStyle = i % 2 ? col : dark;
      c.beginPath(); c.ellipse(bx, by, rw, rh, 0, 0, Math.PI * 2); c.fill();
      if (winter && !dead) { c.fillStyle = 'rgba(250,252,255,0.85)'; c.beginPath(); c.ellipse(bx, by - rh * 0.6, rw * 0.7, rh * 0.3, 0, Math.PI, 0); c.fill(); }
    }
    c.fillStyle = dark;
    c.beginPath(); c.ellipse(topX, top + crownLen * 0.12, crownW * 0.28, Math.max(2, crownLen * 0.16), 0, 0, Math.PI * 2); c.fill();
  } else {
    const leaves = dead ? { color: deadCol, amount: 0.6 } : sp === 'aspen' ? aspenLeaves(season, ps) : birchLeaves(season, ps);
    const top = base - h;
    // branches rise from the trunk and their twigs hang down (seen when bare)
    c.strokeStyle = darken('#4a3c36', shade);
    const twigs = Math.max(2, Math.min(6, Math.round(crownW / 9)));
    for (let i = 0; i < twigs; i++) {
      const by = top + crownLen * (0.2 + 0.7 * (i / twigs));
      const side = i % 2 ? 1 : -1;
      const bx = topX + (x - topX) * ((by - top) / h);
      const ex = bx + side * crownW * (0.3 + 0.15 * hash(id + i));
      const ey = by - crownLen * 0.12;
      c.lineWidth = Math.max(0.8, trunkW * 0.25);
      c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + side * crownW * 0.12, ey, ex, ey); c.stroke();
      if (leaves.amount < 0.5 && crownW > 20) {
        c.lineWidth = 0.5;
        for (let j = 1; j <= 2; j++) {
          const tx = bx + (ex - bx) * (j / 3.2);
          c.beginPath(); c.moveTo(tx, ey + (by - ey) * (1 - j / 3.2) * 0.6); c.lineTo(tx + side * 2, ey + crownLen * 0.18); c.stroke();
        }
      }
    }
    if (leaves.amount > 0.02) {
      c.globalAlpha *= leaves.amount;
      const n = Math.max(3, Math.min(8, Math.round(crownW / 8) + 2));
      for (let i = 0; i < n; i++) {
        const bx = topX + (hash(id * 3 + i) - 0.5) * crownW * 0.75;
        const by = top + crownLen * (0.12 + 0.75 * hash(id * 11 + i));
        c.fillStyle = darken(leaves.color, shade + (i % 2) * 0.1);
        c.beginPath(); c.ellipse(bx, by, crownW * 0.26, Math.max(2.5, crownLen * 0.2), 0, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha /= leaves.amount;
    }
  }
}

/** Seedlings shorter than breast height: a small tuft that still shows the species. */
function drawSeedling(c: CanvasRenderingContext2D, sp: SpeciesId, x: number, base: number, h: number, season: Season, ps: number, shade: number) {
  const w = Math.max(3, h * 0.5);
  if (sp === 'spruce') {
    c.fillStyle = darken('#2c5a3c', shade);
    c.beginPath(); c.moveTo(x, base - h); c.lineTo(x - w / 2, base); c.lineTo(x + w / 2, base); c.closePath(); c.fill();
    if (season === 'winter') { c.fillStyle = 'rgba(250,252,255,0.9)'; c.beginPath(); c.moveTo(x, base - h); c.lineTo(x - w * 0.15, base - h * 0.7); c.lineTo(x + w * 0.15, base - h * 0.7); c.fill(); }
  } else if (sp === 'pine') {
    c.strokeStyle = darken('#6e5240', shade);
    c.lineWidth = Math.max(1, w * 0.12);
    c.beginPath(); c.moveTo(x, base); c.lineTo(x, base - h); c.stroke();
    c.fillStyle = darken('#47703d', shade);
    for (let i = 0; i < 3; i++) {
      const y = base - h * (0.45 + 0.25 * i);
      c.beginPath(); c.ellipse(x, y, w * (0.45 - i * 0.1), h * 0.12, 0, 0, Math.PI * 2); c.fill();
    }
  } else {
    c.strokeStyle = darken('#7a5a4a', shade);
    c.lineWidth = Math.max(1, w * 0.1);
    c.beginPath(); c.moveTo(x, base); c.quadraticCurveTo(x + w * 0.1, base - h * 0.5, x, base - h); c.stroke();
    const leaves = birchLeaves(season, ps);
    if (leaves.amount > 0.05) {
      c.fillStyle = darken(leaves.color, shade);
      c.globalAlpha *= leaves.amount;
      for (let i = 0; i < 4; i++) {
        const y = base - h * (0.35 + 0.18 * i);
        const side = i % 2 ? 1 : -1;
        c.beginPath(); c.ellipse(x + side * w * 0.25, y, w * 0.22, w * 0.14, side * 0.5, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha /= leaves.amount;
    }
  }
}

/** Aspen leafs out a little later than birch and turns orange-red in autumn. */
function aspenLeaves(season: Season, ps: number): { color: string; amount: number } {
  if (season === 'spring') return { color: '#a9cf6a', amount: clamp01((ps - 0.45) / 0.45) };
  if (season === 'summer') return { color: '#5f9a48', amount: 1 };
  if (season === 'autumn') return { color: ps < 0.3 ? '#c9a43a' : '#d9622b', amount: 1 - clamp01((ps - 0.6) / 0.4) };
  return { color: '#d9622b', amount: 0 };
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + ((((pb >> s) & 255) - ((pa >> s) & 255)) * clamp01(t)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** `browse` 0..1 lowers the head towards a sapling. */
function drawMoose(c: CanvasRenderingContext2D, x: number, y: number, s: number, season: Season, browse = 0) {
  const hy = browse * s * 0.42;
  c.fillStyle = '#4a3426';
  c.beginPath(); c.ellipse(x, y - s * 0.75, s * 0.6, s * 0.28, 0, 0, Math.PI * 2); c.fill(); // body
  c.beginPath(); c.ellipse(x - s * 0.3, y - s * 0.95, s * 0.22, s * 0.15, 0, 0, Math.PI * 2); c.fill(); // shoulder hump
  for (const lx of [-0.4, -0.25, 0.3, 0.45]) c.fillRect(x + lx * s, y - s * 0.6, s * 0.07, s * 0.6); // long legs
  c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.9); c.lineTo(x - s * 0.85, y - s * 0.85 + hy); c.lineTo(x - s * 0.95, y - s * 0.62 + hy); c.lineTo(x - s * 0.72, y - s * 0.6 + hy * 0.6); c.closePath(); c.fill(); // long nose
  if (season !== 'spring') { // bulls carry antlers from summer to winter
    c.strokeStyle = '#d8c7a0'; c.lineWidth = Math.max(1.5, s * 0.06);
    c.beginPath(); c.moveTo(x - s * 0.6, y - s * 1.0 + hy * 0.5); c.quadraticCurveTo(x - s * 0.55, y - s * 1.25 + hy * 0.5, x - s * 0.35, y - s * 1.22 + hy * 0.5); c.stroke();
  }
}

function drawCapercaillie(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.fillStyle = '#26282b';
  c.beginPath(); c.ellipse(x, y - s * 0.5, s * 0.55, s * 0.4, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(x - s * 0.45, y - s * 0.95, s * 0.16, s * 0.2, 0, 0, Math.PI * 2); c.fill(); // head
  c.fillStyle = '#2f4a38'; c.beginPath(); c.ellipse(x - s * 0.25, y - s * 0.7, s * 0.2, s * 0.14, 0, 0, Math.PI * 2); c.fill(); // green breast sheen
  c.fillStyle = '#cf2b26'; c.fillRect(x - s * 0.52, y - s * 1.05, s * 0.1, s * 0.05); // red eyebrow
  c.fillStyle = '#26282b';
  c.beginPath(); c.moveTo(x + s * 0.4, y - s * 0.6); c.lineTo(x + s * 0.95, y - s * 1.05); c.lineTo(x + s * 0.9, y - s * 0.3); c.closePath(); c.fill(); // fanned tail
}

function drawWoodpecker(c: CanvasRenderingContext2D, x: number, y: number, s: number, body: string, red: string, spotted: boolean) {
  c.fillStyle = body;
  c.beginPath(); c.ellipse(x + s * 0.3, y, s * 0.3, s * 0.7, -0.15, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(x + s * 0.45, y - s * 0.75, s * 0.25, s * 0.22, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c9c2b0'; c.beginPath(); c.moveTo(x + s * 0.65, y - s * 0.78); c.lineTo(x + s * 1.05, y - s * 0.72); c.lineTo(x + s * 0.65, y - s * 0.68); c.fill(); // bill
  c.fillStyle = red; c.beginPath(); c.ellipse(x + s * 0.42, y - s * 0.92, s * 0.14, s * 0.1, 0, 0, Math.PI * 2); c.fill(); // red crown
  if (spotted) {
    c.fillStyle = '#f2f0ea'; c.beginPath(); c.ellipse(x + s * 0.35, y - s * 0.1, s * 0.12, s * 0.3, 0, 0, Math.PI * 2); c.fill(); // white shoulder patch
    c.fillStyle = red; c.fillRect(x + s * 0.2, y + s * 0.5, s * 0.25, s * 0.18); // red under the tail
  }
}

function drawJay(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.fillStyle = '#7d7468';
  c.beginPath(); c.ellipse(x, y, s * 0.55, s * 0.35, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#5a5249'; c.beginPath(); c.ellipse(x - s * 0.5, y - s * 0.25, s * 0.25, s * 0.22, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c66b2c'; c.beginPath(); c.moveTo(x + s * 0.4, y - s * 0.1); c.lineTo(x + s * 1.0, y + s * 0.15); c.lineTo(x + s * 0.4, y + s * 0.2); c.fill(); // rusty tail
}

function drawFlyingSquirrel(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.fillStyle = '#a8a59a';
  c.beginPath(); c.moveTo(x - s, y); c.quadraticCurveTo(x, y - s * 0.5, x + s, y); c.quadraticCurveTo(x, y + s * 0.35, x - s, y); c.fill(); // gliding skin
  c.beginPath(); c.ellipse(x + s * 0.85, y - s * 0.15, s * 0.22, s * 0.18, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#111'; c.beginPath(); c.arc(x + s * 0.92, y - s * 0.18, s * 0.06, 0, Math.PI * 2); c.fill(); // big dark eye
  c.fillStyle = '#a8a59a'; c.beginPath(); c.ellipse(x - s * 1.1, y + s * 0.05, s * 0.35, s * 0.1, 0, 0, Math.PI * 2); c.fill(); // flat tail
}
