/**
 * The landscape map (Phase 10): your forest among ten neighbouring stands, a
 * lake, a road and the village. Tap a stand to see it and to choose whether
 * it is managed or protected; see which animals that need many forests live
 * here, and why.
 */
import {
  LAND_ANIMALS, createLandscape, landHabitat, setZone, syncLandscape,
  type Cell, type Forest, type LandAnimal, type LandHabitat, type Landscape, type StandLook, type Zone,
} from '../../core/forest';
import { getPart, setPart } from '../storage';
import type { Lang } from '../text';
import { MAP_TEXT } from './maptext';
import type { FOREST_TEXT } from './text';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface MapHost {
  lang(): Lang;
  t(): (typeof FOREST_TEXT)['fi'];
  forest(): Forest | undefined;
  setOverlay(on: boolean): void;
  announce(text: string): void;
}

const DOT: Record<LandAnimal, string> = { flyingSquirrel: '#c98f52', capercaillie: '#1d2a24', siberianJay: '#9fb3c8' };
const CROWN: Record<string, string> = { spruce: '#2c5a3c', pine: '#5f8a3e', birch: '#9cc65a', aspen: '#b9c94a' };

export function loadLandscape(): Landscape | null {
  const l = getPart<Landscape | null>('landscape', null);
  return l && l.v === 1 && Array.isArray(l.cells) ? l : null;
}

export class MapView {
  open_ = false;
  private land: Landscape | null = null;
  private habitat: LandHabitat | null = null;
  private sel: { x: number; y: number } | null = null;
  private msg = '';

  constructor(private h: MapHost) {}

  private get t() { return MAP_TEXT[this.h.lang()]; }

  open() {
    const f = this.h.forest();
    if (!f) return;
    this.open_ = true;
    this.h.setOverlay(true);
    $('m-map').hidden = false;
    let land = this.land ?? loadLandscape();
    if (!land || land.home !== f.seed) land = createLandscape(f);
    const n = syncLandscape(land, f.year);
    this.land = land;
    this.msg = this.t.caught(n);
    this.save();
    this.sel = this.sel ?? { x: land.cells.find(c => c.kind === 'home')!.x, y: land.cells.find(c => c.kind === 'home')!.y };
    this.render();
    this.zoomOut();
    requestAnimationFrame(() => $('m-map-title').focus());
  }

  /** 2.5D, one world: start close on your own stand and zoom out to the whole landscape. */
  private zoomOut() {
    const grid = $('m-map-grid');
    const home = grid.querySelector<HTMLElement>('.mapcell.home');
    if (!home) return;
    const g = grid.getBoundingClientRect(), h = home.getBoundingClientRect();
    grid.style.transformOrigin = `${h.left - g.left + h.width / 2}px ${h.top - g.top + h.height / 2}px`;
    grid.style.setProperty('--mapz', String(Math.max(1.5, Math.min(4, g.width / Math.max(1, h.width)))));
    grid.classList.remove('zoomout');
    void grid.offsetWidth;
    grid.classList.add('zoomout');
  }

  close() {
    this.open_ = false;
    $('m-map').hidden = true;
    this.h.setOverlay(false);
    $('btn-m-map').focus();
  }

  escape() { this.close(); }

  private save() { if (this.land) setPart('landscape', this.land); }

  render() {
    if (!this.open_ || !this.land) return;
    const t = this.t;
    const ft = this.h.t();
    const land = this.land;
    const f = this.h.forest() ?? null;
    const hab = this.habitat = landHabitat(land, f);
    const looks = new Map(hab.looks.map(l => [`${l.x},${l.y}`, l]));
    const livesAt = (x: number, y: number) => LAND_ANIMALS.filter(a => hab.animals[a].stands.some(s => s.x === x && s.y === y));
    $('m-map-title').textContent = t.title;
    $('btn-m-map-close').setAttribute('aria-label', t.close);
    $('m-map-intro').textContent = t.intro;
    $('m-map-msg').textContent = this.msg;
    $('m-map-legend').innerHTML = `${t.legend} ` + LAND_ANIMALS.map(a => `<span class="mdot" style="background:${DOT[a]}"></span>${ft.animals[a][0]}`).join(' ');
    const name = (c: Cell) => c.stand ? t.stands[c.stand.kind] : t.cells[c.kind as 'home' | 'lake' | 'road' | 'village'];
    $('m-map-grid').style.gridTemplateColumns = `repeat(${land.cols}, minmax(0, 1fr))`;
    $('m-map-grid').innerHTML = land.cells.map(c => {
      const here = livesAt(c.x, c.y);
      const dots = here.map(a => `<span class="mdot" style="background:${DOT[a]}"></span>`).join('');
      const zone = c.stand ? t.zones[c.stand.zone] : '';
      const canvas = `<canvas width="120" height="80" data-tile="${c.x},${c.y}" aria-hidden="true"></canvas>`;
      if (c.kind === 'home' || c.stand) {
        const picked = this.sel?.x === c.x && this.sel?.y === c.y;
        const label = t.cellLabel(name(c), zone, here.map(a => ft.animals[a][0]).join(', '));
        return `<button type="button" class="mapcell${c.kind === 'home' ? ' home' : ''}${c.stand?.zone === 'protected' ? ' protected' : ''}" data-cell="${c.x},${c.y}" aria-pressed="${picked}" aria-label="${label}">` +
          `${canvas}<span class="mname">${name(c)}</span>${zone ? `<span class="mzone">${zone}</span>` : ''}<span class="mdots" aria-hidden="true">${dots}</span></button>`;
      }
      return `<div class="mapcell static">${canvas}<span class="mname">${name(c)}</span></div>`;
    }).join('');
    for (const cv of $('m-map-grid').querySelectorAll<HTMLCanvasElement>('canvas[data-tile]')) {
      const [x, y] = cv.dataset.tile!.split(',').map(Number);
      const c = land.cells.find(k => k.x === x && k.y === y)!;
      drawTile(cv, c, looks.get(`${x},${y}`), c.kind === 'home' ? f : c.stand?.forest ?? null);
    }
    // the chosen stand
    const c = this.sel ? land.cells.find(k => k.x === this.sel!.x && k.y === this.sel!.y) : undefined;
    const l = c ? looks.get(`${c.x},${c.y}`) : undefined;
    let detail = '';
    if (c && l) {
      const animals = l.animals.map(a => ft.animals[a][0]).join(', ');
      detail += `<h4>${name(c)}</h4><p>${t.standInfo(l.oldest, Math.round(l.height), Math.round(l.volume), l.main ? ft.species[l.main as 'pine'].name : '')}</p><p class="note">${t.animalsHere(animals)}</p>`;
      if (c.stand) {
        detail += `<p class="mstep" id="m-map-zone-label">${t.zoneLabel}</p><div class="segs" role="group" aria-labelledby="m-map-zone-label">` +
          (['managed', 'protected'] as Zone[]).map(z => `<button type="button" class="seg" data-zone="${z}" aria-pressed="${c.stand!.zone === z}">${t.zones[z]}</button>`).join('') +
          `</div><p class="note">${t.zoneHow[c.stand.zone]}</p>`;
      } else detail += `<p class="note">${t.homeNote}</p>`;
    }
    $('m-map-detail').innerHTML = detail;
    $('m-map-land-title').textContent = t.landTitle;
    $('m-map-land').innerHTML = LAND_ANIMALS.map(a => {
      const s = hab.animals[a];
      const status = s.lives ? t.lives : t.notHere;
      const extra = a === 'siberianJay' && land.place !== 'east' && land.place !== 'lapland' ? t.notHerePlace : t.suitable(s.suitable, s.biggest);
      return `<div class="vrow${s.lives ? ' played' : ''}"><span class="mdot big" style="background:${DOT[a]}" aria-hidden="true"></span>` +
        `<span><b>${ft.animals[a][0]}</b>: ${status}</span><small class="note" style="grid-column:2">${t.land[a]} ${extra}</small></div>`;
    }).join('');
  }

  click(b: HTMLElement): boolean {
    if (b.id === 'btn-m-map') { this.open(); return true; }
    if (!this.open_) return false;
    if (b.id === 'btn-m-map-close') { this.close(); return true; }
    if (b.dataset.cell) {
      const [x, y] = b.dataset.cell.split(',').map(Number);
      this.sel = { x, y };
      this.msg = '';
      this.render();
      $('m-map-grid').querySelector<HTMLElement>(`[data-cell="${x},${y}"]`)?.focus();
      return true;
    }
    if (b.dataset.zone && this.land && this.sel) {
      setZone(this.land, this.sel.x, this.sel.y, b.dataset.zone as Zone);
      this.save();
      this.render();
      $('m-map-detail').querySelector<HTMLElement>(`[data-zone="${b.dataset.zone}"]`)?.focus();
      this.h.announce(this.t.zones[b.dataset.zone as Zone]);
      return true;
    }
    return false;
  }

  /** Forget the map (a new forest gets a new one). */
  reset() { this.land = null; this.sel = null; }

  debug() {
    return {
      land: () => this.land,
      habitat: () => this.habitat,
    };
  }
}

/** One map square from above: tree crowns for a forest, water, the road, the village. */
function drawTile(cv: HTMLCanvasElement, c: Cell, look: StandLook | undefined, f: Forest | null) {
  const g = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  if (c.kind === 'lake') {
    g.fillStyle = '#3f7fa8'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(14 + i * 22, 20 + (i % 2) * 30); g.quadraticCurveTo(22 + i * 22, 14 + (i % 2) * 30, 30 + i * 22, 20 + (i % 2) * 30); g.stroke(); }
    return;
  }
  if (c.kind === 'road') {
    g.fillStyle = '#86b04f'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#8a8f8c'; g.fillRect(W * 0.35, 0, W * 0.3, H);
    g.fillStyle = '#d9d4c4'; for (let y = 4; y < H; y += 20) g.fillRect(W / 2 - 1.5, y, 3, 10);
    return;
  }
  if (c.kind === 'village') {
    g.fillStyle = '#9fc37a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#8a8f8c'; g.fillRect(W * 0.35, 0, W * 0.3, H * 0.4);
    const roofs = ['#c9744f', '#d9a441', '#3f5d73', '#7a5530'];
    roofs.forEach((r, i) => { const x = 8 + (i % 2) * 60, y = 28 + Math.floor(i / 2) * 26; g.fillStyle = r; g.fillRect(x, y, 44, 20); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y + 10, 44, 10); });
    return;
  }
  // forest floor: lighter where the stand is young or open
  const open = !look || look.height < 3;
  g.fillStyle = f?.soil === 'peat' ? '#8a8a5a' : f?.soil === 'sandy' ? '#b8b07a' : open ? '#9fbf6a' : '#5b7d4a';
  g.fillRect(0, 0, W, H);
  if (f) {
    const trees = [...f.trees].sort((a, b) => b.h - a.h).slice(0, 40).sort((a, b) => a.h - b.h);
    trees.forEach((t, i) => {
      const x = 6 + t.x * (W - 12);
      const y = 8 + ((t.id * 37) % 100) / 100 * (H - 16);
      const r = Math.max(2, Math.min(11, 2 + t.h * 0.35));
      g.fillStyle = CROWN[t.sp] ?? '#2c5a3c';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (i % 3 === 0) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); g.fill(); }
    });
    // fallen trees in a protected stand stay on the ground
    g.strokeStyle = '#7a5530'; g.lineWidth = 2;
    f.logs.slice(0, 6).forEach(l => { const x = 8 + l.x * (W - 16), y = 10 + ((l.id * 53) % 100) / 100 * (H - 20); g.beginPath(); g.moveTo(x - 7, y - 2); g.lineTo(x + 7, y + 2); g.stroke(); });
  }
  if (c.kind === 'home') {
    // your birch's yellow ribbon marks your forest
    g.fillStyle = '#ffc83d'; g.fillRect(W - 18, 6, 10, 14);
  }
}
