/**
 * The Metsäni forest view, drawn in the same flat poster style as Kasva!:
 * the stand from the side, each tree at its real height and age, the season,
 * and a cut through the soil showing its texture, the water and the roots.
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
import type { Season } from './text';

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
}

export function seasonOf(p: number): { season: Season; ps: number } {
  const i = Math.min(3, Math.floor(p * 4));
  return { season: (['spring', 'summer', 'autumn', 'winter'] as const)[i], ps: p * 4 - i };
}

interface Hit { id: number; x0: number; y0: number; x1: number; y1: number }

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
  private hills: HTMLCanvasElement | null = null;
  private hillsKey = '';
  private hits: Hit[] = [];
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
    this.hillsKey = '';
  }

  /** Draw into part of the canvas only (CSS px). Call after the canvas has its size. */
  setViewport(x: number, y: number, w: number, h: number) {
    this.dpr = forestBudget.dpr();
    if (w !== this.W || h !== this.H) { this.hillsKey = ''; this.zoom = 0; }
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
    return { W, H, soilH, groundY, depthBand, px, plotW, plotX };
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
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h.id;
    }
    return null;
  }

  /** Screen position of a tree's base, for keyboard focus rings and tests. */
  treeBase(f: Forest, id: number): { x: number; y: number } | null {
    const t = f.trees.find(tr => tr.id === id);
    if (!t) return null;
    const P = this.place(this.layout(), t, 0);
    return { x: P.x + this.vx, y: P.base + this.vy };
  }

  draw(v: ForestView, dt = 0) {
    const c = this.c;
    this.updateZoom(v.forest, dt);
    const L = this.layout();
    const { season, ps } = seasonOf(v.p);
    const f = v.forest;
    const drought = !!v.rec?.weather.drought;
    c.setTransform(this.dpr, 0, 0, this.dpr, this.dpr * this.vx, this.dpr * this.vy);
    c.save();
    c.beginPath(); c.rect(0, 0, L.W, L.H); c.clip();

    // sky
    const [top, bottom] = SKIES[season];
    const g = c.createLinearGradient(0, 0, 0, L.groundY);
    g.addColorStop(0, top);
    g.addColorStop(1, drought && season === 'summer' ? '#f3dcb0' : bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, L.W, L.groundY + 2);
    this.drawSun(L, season);

    // distant hills (a fell in Lapland)
    this.paintHills(L, f.place === 'lapland');
    if (this.hills) c.drawImage(this.hills, 0, 0, L.W, L.H);
    c.fillStyle = season === 'winter' ? 'rgba(238,244,250,0.45)' : season === 'autumn' ? 'rgba(220,150,70,0.12)' : 'rgba(0,0,0,0)';
    c.fillRect(0, 0, L.W, L.groundY);

    // the forest floor: a plane going back into the plot
    const snow = snowCover(v.p, f.place);
    const floorTop = L.groundY - L.depthBand;
    const fg = c.createLinearGradient(0, floorTop, 0, L.groundY);
    fg.addColorStop(0, darken(floorColor(season, ps, drought), 0.25));
    fg.addColorStop(1, floorColor(season, ps, drought));
    c.fillStyle = fg;
    c.fillRect(0, floorTop, L.W, L.depthBand + 3);
    this.drawFloor(L, f, season, snow, drought);
    this.drawLogs(L, v, season);

    // the stand, far trees first; the same forest continues faintly at the sides
    const rd = relativeDensity(f.trees);
    const g01 = clamp01((v.p - 0.25) / 0.25);
    const all = [...f.trees, ...v.dying.filter(d => !f.trees.some(t => t.id === d.id))];
    const sorted = all.sort((a, b) => depthOf(b.id) - depthOf(a.id) || a.x - b.x);
    this.hits = [];
    const tiles = Math.ceil((L.W / Math.max(1, L.plotW)) / 2) + 1;
    for (const t of sorted) {
      for (let k = -tiles; k <= tiles; k++) if (k !== 0) this.drawOne(L, t, v, k * L.plotW, season, ps, g01, rd, false);
      this.drawOne(L, t, v, 0, season, ps, g01, rd, true);
    }

    // the soil cutaway
    this.drawSoil(L, v, season, ps);

    // animals that live here now
    if (v.animals?.length) this.drawAnimals(L, v, season);

    // falling snow or leaves
    if (!v.reducedMotion) this.drawParticles(L, season, ps, v.time);
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
    for (const a of v.animals ?? []) {
      if (a === 'moose') {
        const x = L.W * 0.28, y = L.groundY - L.depthBand * 0.35;
        drawMoose(c, x, y, 34 * k, season);
      } else if (a === 'capercaillie') {
        drawCapercaillie(c, L.W * 0.66, L.groundY - L.depthBand * 0.2, 20 * k);
      } else if (a === 'blackWoodpecker') {
        const snag = f.logs.find(l => l.standing && l.d > 20);
        const p = snag ? (() => { const P = this.place(L, { id: snag.id, x: snag.x } as Tree, 0); return { x: P.x, y: P.base - snag.h * L.px * P.s * 0.4, w: (snag.d / 100) * L.px * 1.6 }; })() : at(trunkOf(t => t.d >= 30), 0.35);
        if (p) drawWoodpecker(c, p.x + p.w / 2, p.y + bob, 14 * k, '#151515', '#d7262b', false);
      } else if (a === 'spottedWoodpecker') {
        const p = at(trunkOf(t => (t.sp === 'spruce' || t.sp === 'pine') && t.d >= 18, 1), 0.55);
        if (p) drawWoodpecker(c, p.x - p.w / 2 - 10 * k, p.y - bob, 11 * k, '#1d1d1d', '#d7262b', true);
      } else if (a === 'treecreeper') {
        const p = at(trunkOf(t => t.d >= 28, 2), 0.25);
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

  private drawSun(L: ReturnType<ForestScene['layout']>, season: Season) {
    const c = this.c;
    const span = L.groundY - this.insetTop;
    const y = this.insetTop + span * (season === 'winter' ? 0.55 : season === 'summer' ? 0.12 : 0.3);
    const x = L.W * 0.82;
    const r = Math.max(16, Math.min(34, L.W * 0.04));
    const glow = c.createRadialGradient(x, y, r * 0.3, x, y, r * 3);
    glow.addColorStop(0, 'rgba(255,236,170,0.7)');
    glow.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(x, y, r * 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffe7a0';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }

  private paintHills(L: ReturnType<ForestScene['layout']>, fell: boolean) {
    const key = `${L.W}x${L.H}:${fell}`;
    if (key === this.hillsKey) return;
    this.hillsKey = key;
    const cv = document.createElement('canvas');
    cv.width = Math.round(L.W * this.dpr);
    cv.height = Math.round(L.H * this.dpr);
    const c = cv.getContext('2d')!;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const r = makeRng('hills');
    const ridge = (base: number, amp: number, color: string, tips: string, tipH: number, bare = false) => {
      const pts: [number, number][] = [];
      const f1 = 1.4 + r(), p1 = r() * 6;
      for (let x = -10; x <= L.W + 10; x += 6) {
        const u = x / L.W;
        const bump = bare ? Math.exp(-Math.pow((u - 0.3) / 0.22, 2)) * 1.6 : 0;
        pts.push([x, base - amp * (0.5 + 0.35 * Math.sin(u * Math.PI * f1 + p1) + bump)]);
      }
      c.fillStyle = color;
      c.beginPath(); c.moveTo(-10, L.groundY + 4);
      for (const [x, y] of pts) c.lineTo(x, y);
      c.lineTo(L.W + 10, L.groundY + 4); c.closePath(); c.fill();
      c.fillStyle = tips;
      for (const [x, y] of pts) {
        if (r() < 0.45) continue;
        if (bare && y < base - amp * 1.15) continue; // bare fell top above the tree line
        const h = tipH * (0.6 + 0.7 * r());
        c.beginPath(); c.moveTo(x - h * 0.18, y + 1); c.lineTo(x, y - h); c.lineTo(x + h * 0.18, y + 1); c.fill();
      }
    };
    const gy = L.groundY;
    ridge(gy - L.H * 0.16, L.H * 0.08, '#9fb7b6', '#8aa6a4', 7, fell);
    ridge(gy - L.H * 0.08, L.H * 0.06, '#6f9086', '#5f8277', 10);
    this.hills = cv;
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
    if (x < -L.plotW * 0.3 || x > L.W + L.plotW * 0.3) return;
    const hp = Math.max(3, h * px);
    const crownW = Math.max(h * 0.45, crownWidth(t.sp, d)) * px;
    const ratio = h < 1.3 ? 0.9 : crownRatio(t.sp, rd);
    const shade = P.depth * 0.28 + (main ? 0 : 0.12);
    c.save();
    c.globalAlpha = alpha * (main ? 1 : 0.7);
    const lean = (hash(t.id) - 0.5) * 0.04;
    if (fall > 0) {
      c.translate(x, base);
      c.rotate((hash(t.id + 5) < 0.5 ? -1 : 1) * fall * Math.PI / 2);
      c.translate(-x, -base);
    }
    if (h < 1.3 && !dying) drawSeedling(c, t.sp, x, base, hp, season, ps, shade);
    else drawTree(c, t.sp, x, base, hp, Math.max(1.2, (d / 100) * px * 1.6), hp * ratio, crownW, season, ps,
      deadNow ? (cause === 'beetle' ? '#b5522f' : '#8b6a45') : null, shade, lean, t.id);
    c.restore();
    if (main && !dying) {
      const w = Math.max(crownW, 14);
      this.hits.push({ id: t.id, x0: x - w / 2, x1: x + w / 2, y0: base - hp, y1: base + 4 });
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
    const r = makeRng('floor');
    const lai = f.history.at(-1)?.stats.lai ?? 0;
    const n = Math.round((L.W / 5) * (1 - 0.5 * Math.min(1, lai / 4)));
    for (let i = 0; i < n; i++) {
      const x = r() * L.W;
      const y = L.groundY - r() * L.depthBand;
      const kind = r();
      if (kind < 0.5) {
        // blueberry and lingonberry tufts
        c.fillStyle = season === 'autumn' ? (kind < 0.25 ? '#b5452f' : '#8a5a2a') : drought && season === 'summer' ? '#7f8a45' : '#4f7d3c';
        c.beginPath(); c.ellipse(x, y - 3, 5, 3.5, 0, 0, Math.PI * 2); c.fill();
        if (season === 'summer' && kind < 0.12) { c.fillStyle = '#3b4f9a'; c.beginPath(); c.arc(x + 2, y - 3, 1.4, 0, Math.PI * 2); c.fill(); }
      } else {
        c.fillStyle = '#6f9a4a';
        c.beginPath(); c.ellipse(x, y - 1, 6, 2, 0, 0, Math.PI * 2); c.fill();
      }
    }
    if (snow > 0) {
      c.fillStyle = `rgba(246,250,253,${0.55 + 0.45 * snow})`;
      c.fillRect(0, L.groundY - L.depthBand, L.W, L.depthBand + 3);
    }
  }

  private drawSoil(L: ReturnType<ForestScene['layout']>, v: ForestView, season: Season, ps: number) {
    const c = this.c;
    const f = v.forest;
    const soil = SOILS[f.soil];
    const look = SOIL_LOOK[f.soil];
    const y0 = L.groundY + 2;
    const h = L.soilH;
    c.fillStyle = look.base;
    c.fillRect(0, y0, L.W, h);
    // humus layer on top
    c.fillStyle = f.soil === 'peat' ? '#2e2016' : '#3f2c1d';
    c.fillRect(0, y0, L.W, Math.max(5, h * 0.08));
    const r = makeRng('soil-' + f.soil);
    const soilDepth = f.soil === 'rocky' ? h * 0.32 : h;
    if (f.soil === 'rocky') {
      c.fillStyle = '#8e9296';
      for (let x = -20; x < L.W + 40; x += 34 + r() * 30) {
        const w = 40 + r() * 50;
        c.beginPath();
        c.moveTo(x, y0 + h);
        c.lineTo(x + w * 0.1, y0 + soilDepth + r() * 8);
        c.lineTo(x + w * 0.6, y0 + soilDepth - 4 + r() * 6);
        c.lineTo(x + w, y0 + soilDepth + r() * 10);
        c.lineTo(x + w, y0 + h);
        c.fill();
      }
      c.fillStyle = '#9fa3a7';
      c.fillRect(0, y0 + h * 0.75, L.W, h * 0.25);
    }
    // texture
    for (let i = 0; i < L.W * h / 140; i++) {
      const x = r() * L.W;
      const y = y0 + h * 0.1 + r() * (soilDepth - h * 0.1);
      if (f.soil === 'clay') { c.fillStyle = look.dark; c.fillRect(x, y, 10 + r() * 16, 1.4); }
      else if (f.soil === 'peat') { c.strokeStyle = look.grain; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 * (r() - 0.5), y + 5 * r()); c.stroke(); }
      else if (f.soil === 'loam' && r() < 0.06) { c.fillStyle = '#9b9690'; c.beginPath(); c.ellipse(x, y, 3 + r() * 4, 2 + r() * 3, r(), 0, Math.PI * 2); c.fill(); }
      else { c.fillStyle = r() < 0.5 ? look.grain : look.dark; c.fillRect(x, y, 1.6, 1.6); }
    }
    // water: rises in spring, sinks through a dry summer, refills in autumn
    const level = waterLevel(v, season, ps) * soilDepth * 0.92;
    const wy = y0 + soilDepth - level;
    c.fillStyle = 'rgba(52,140,215,0.55)';
    c.fillRect(0, wy, L.W, level);
    c.strokeStyle = 'rgba(160,215,245,0.85)';
    c.lineWidth = 2;
    c.beginPath();
    for (let x = 0; x <= L.W; x += 8) c.lineTo(x, wy + Math.sin(x * 0.08 + v.time * 1.5) * (v.reducedMotion ? 0 : 1.2));
    c.stroke();
    if (season === 'winter') {
      c.fillStyle = 'rgba(225,240,250,0.55)';
      c.fillRect(0, y0, L.W, h * 0.18 * clamp01(ps * 2));
    }
    // roots of the trees on the plot
    c.lineCap = 'round';
    for (const t of f.trees) {
      const x = this.place(L, t, 0).x;
      const depth = Math.min(soilDepth * (f.soil === 'peat' ? 0.35 : 0.9), (4 + Math.sqrt(t.h) * 9) * (h / 100));
      const spread = Math.min(L.plotW / 6, 4 + t.h * L.px * 0.12);
      if (x < -20 || x > L.W + 20) continue;
      c.strokeStyle = t.sp === 'birch' ? 'rgba(225,205,170,0.55)' : 'rgba(205,170,120,0.55)';
      c.lineWidth = Math.max(0.8, Math.min(3, t.d / 12));
      const rr = makeRng('root' + t.id);
      for (let k = 0; k < 2; k++) {
        const ex = x + (rr() - 0.5) * 2 * spread;
        c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x + (ex - x) * 0.3, y0 + depth * 0.5, ex, y0 + depth * (0.5 + rr() * 0.5)); c.stroke();
      }
    }
    // soil food: small pale dots, more in fertile soil
    c.fillStyle = 'rgba(255,248,220,0.55)';
    const rn = makeRng('food');
    for (let i = 0; i < (L.W / 18) * soil.nutrients; i++) c.fillRect(rn() * L.W, y0 + 6 + rn() * soilDepth * 0.6, 2, 2);
    // depth shade at the bottom edge
    const fade = c.createLinearGradient(0, y0 + h - 18, 0, y0 + h);
    fade.addColorStop(0, 'rgba(7,31,27,0)');
    fade.addColorStop(1, 'rgba(7,31,27,0.9)');
    c.fillStyle = fade;
    c.fillRect(0, y0 + h - 18, L.W, 18);
    c.fillStyle = '#071f1b';
    c.fillRect(0, y0 + h, L.W, L.H - y0 - h);
  }

  private drawParticles(L: ReturnType<ForestScene['layout']>, season: Season, ps: number, time: number) {
    const c = this.c;
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

/** Darken a colour given as #rrggbb or rgb(r,g,b). */
function darken(col: string, k: number): string {
  let r: number, g: number, b: number;
  if (col.startsWith('#')) { const n = parseInt(col.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  else [r, g, b] = (col.match(/\d+/g) ?? ['0', '0', '0']).map(Number);
  const f = (v: number) => Math.round(v * (1 - k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
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

function drawMoose(c: CanvasRenderingContext2D, x: number, y: number, s: number, season: Season) {
  c.fillStyle = '#4a3426';
  c.beginPath(); c.ellipse(x, y - s * 0.75, s * 0.6, s * 0.28, 0, 0, Math.PI * 2); c.fill(); // body
  c.beginPath(); c.ellipse(x - s * 0.3, y - s * 0.95, s * 0.22, s * 0.15, 0, 0, Math.PI * 2); c.fill(); // shoulder hump
  for (const lx of [-0.4, -0.25, 0.3, 0.45]) c.fillRect(x + lx * s, y - s * 0.6, s * 0.07, s * 0.6); // long legs
  c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.9); c.lineTo(x - s * 0.85, y - s * 0.85); c.lineTo(x - s * 0.95, y - s * 0.62); c.lineTo(x - s * 0.72, y - s * 0.6); c.closePath(); c.fill(); // long nose
  if (season !== 'spring') { // bulls carry antlers from summer to winter
    c.strokeStyle = '#d8c7a0'; c.lineWidth = Math.max(1.5, s * 0.06);
    c.beginPath(); c.moveTo(x - s * 0.6, y - s * 1.0); c.quadraticCurveTo(x - s * 0.55, y - s * 1.25, x - s * 0.35, y - s * 1.22); c.stroke();
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
