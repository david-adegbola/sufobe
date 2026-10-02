/**
 * One world (2.5D, increment 3): the forest is no longer a screen of its own.
 * A forest road leaves the stand to the right, through a clearing to the
 * mills (a log yard, the sawmill, the pulp mill and the biorefinery) and on
 * to the village. The camera travels along the road when wood goes to the
 * mills or things go to the village, and a child can also drag there.
 *
 * Everything here is drawn in world coordinates, under the forest camera.
 * Buildings are sized from the screen (`u`), not from the trees' metres, so
 * they stay readable whether the stand is young and close or old and far.
 */
import { BUILDINGS, isGone, type BuildingId, type Village } from '../../core/forest';
import type { Season } from './text';

export type PlaceName = 'mills' | 'village';

/** Where things are along the road (world x, CSS px at zoom 1). */
export interface Places {
  /** the stand's right edge */
  edge: number;
  /** where the side forest stops and the clearing begins */
  forestEnd: number;
  /** centre of the mill site */
  mill: number;
  /** centre of the village */
  village: number;
  /** where the clearing ends and the forest begins again */
  end: number;
  /** building scale: 1 when the space above the ground is about 300 px */
  u: number;
}

interface Frame { W: number; groundY: number; depthBand: number; plotW: number }

export function places(L: Frame, insetTop: number): Places {
  const edge = L.W / 2 + L.plotW / 2;
  // small enough that the whole mill site and the village fit across a phone screen
  const u = Math.max(0.5, Math.min(1.35, (L.groundY - insetTop) / 300, L.W / 620));
  const forestEnd = edge + Math.max(L.plotW * 0.25, 90);
  const mill = forestEnd + Math.max(L.W * 0.55, 430 * u);
  const village = mill + Math.max(L.W * 0.95, 760 * u);
  return { edge, forestEnd, mill, village, end: village + Math.max(L.W * 0.6, 460 * u), u };
}

/** True where the side forest gives way to the clearing with the mills and the village. */
export function inClearing(P: Places, x: number): boolean {
  return x > P.forestEnd && x < P.end;
}

/** The half-width and height of a place, for tapping it. */
export function placeBox(P: Places, name: PlaceName): { x0: number; x1: number; h: number } {
  return name === 'mills'
    ? { x0: P.mill - 300 * P.u, x1: P.mill + 240 * P.u, h: 190 * P.u }
    : { x0: P.village - 330 * P.u, x1: P.village + 330 * P.u, h: 120 * P.u };
}

/** The forest road: from the log landing at the stand's edge, past the mills and the village. */
export function drawRoad(c: CanvasRenderingContext2D, L: Frame & { x0: number; x1: number }, P: Places, season: Season, snow: number) {
  const x0 = Math.max(L.x0, P.edge - 40), x1 = Math.min(L.x1, P.end + 200);
  if (x1 <= x0) return;
  const y0 = L.groundY - L.depthBand * 0.3, y1 = L.groundY + 1;
  c.fillStyle = snow > 0.3 ? '#e6edf2' : season === 'autumn' ? '#a8987a' : '#b7a986';
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  // the verges, and two wheel ruts
  c.fillStyle = 'rgba(60,50,35,0.22)';
  c.fillRect(x0, y0, x1 - x0, 2);
  c.fillStyle = snow > 0.3 ? 'rgba(150,165,180,0.45)' : 'rgba(90,75,55,0.3)';
  const h = y1 - y0;
  c.fillRect(x0, y0 + h * 0.35, x1 - x0, Math.max(1, h * 0.08));
  c.fillRect(x0, y0 + h * 0.72, x1 - x0, Math.max(1, h * 0.08));
}

/** Puffs of steam or smoke rising from (x, y). */
function plume(c: CanvasRenderingContext2D, x: number, y: number, u: number, time: number, color: string, n = 5) {
  for (let i = 0; i < n; i++) {
    const k = ((time * 0.25 + i / n) % 1);
    c.fillStyle = color.replace('A', String(0.55 * (1 - k)));
    c.beginPath();
    c.arc(x + k * 26 * u + Math.sin(time + i) * 3 * u, y - k * 70 * u, (6 + k * 16) * u, 0, Math.PI * 2);
    c.fill();
  }
}

function snowRoof(c: CanvasRenderingContext2D, x: number, y: number, w: number, u: number) {
  c.fillStyle = 'rgba(250,252,255,0.95)';
  c.beginPath(); c.roundRect(x - 2 * u, y - 3 * u, w + 4 * u, 5 * u, 2 * u); c.fill();
}

/**
 * The mills by the road: a log yard, the sawmill with its sawn boards, the
 * pulp mill with its steam, and the round tanks of the biorefinery. `busy`
 * (0..1) makes the steam thicker after a harvest.
 */
export function drawMillSite(c: CanvasRenderingContext2D, P: Places, gy: number, season: Season, time: number, busy: number) {
  const u = P.u, x = P.mill;
  const winter = season === 'winter';
  // the log yard: piles of round logs, ends showing
  for (let p = 0; p < 3; p++) {
    const px = x - 290 * u + p * 52 * u;
    const rows = 3 - (p % 2);
    for (let r = 0; r < rows; r++) for (let i = 0; i < 4 - r; i++) {
      const lx = px + (i + r * 0.5) * 11 * u, ly = gy - 6 * u - r * 9.5 * u;
      c.fillStyle = '#7a5530'; c.beginPath(); c.arc(lx, ly, 5.5 * u, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e2c48e'; c.beginPath(); c.arc(lx, ly, 3.6 * u, 0, Math.PI * 2); c.fill();
    }
  }
  // the sawmill: a long shed, with stacks of sawn boards
  const sx = x - 120 * u, sw = 150 * u, sh = 58 * u;
  c.fillStyle = '#b5653f'; c.fillRect(sx, gy - sh, sw, sh);
  c.fillStyle = '#5b3a2a'; c.beginPath(); c.moveTo(sx - 6 * u, gy - sh); c.lineTo(sx + sw * 0.5, gy - sh - 22 * u); c.lineTo(sx + sw + 6 * u, gy - sh); c.fill();
  if (winter) { c.fillStyle = 'rgba(250,252,255,0.95)'; c.beginPath(); c.moveTo(sx - 6 * u, gy - sh); c.lineTo(sx + sw * 0.5, gy - sh - 22 * u); c.lineTo(sx + sw + 6 * u, gy - sh); c.lineTo(sx + sw * 0.5, gy - sh - 16 * u); c.fill(); }
  c.fillStyle = '#3f2c1d'; c.fillRect(sx + sw * 0.1, gy - sh * 0.62, sw * 0.24, sh * 0.62);
  c.fillStyle = '#ffd968'; c.fillRect(sx + sw * 0.5, gy - sh * 0.7, sw * 0.1, sh * 0.2); c.fillRect(sx + sw * 0.72, gy - sh * 0.7, sw * 0.1, sh * 0.2);
  // a saw blade on the gable shows what the building does
  c.fillStyle = '#d9dee2'; c.beginPath(); c.arc(sx + sw * 0.5, gy - sh - 8 * u, 6 * u, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#5b3a2a'; c.beginPath(); c.arc(sx + sw * 0.5, gy - sh - 8 * u, 2 * u, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#e8cfa0' : '#dcbf8a'; c.fillRect(sx + sw + 10 * u, gy - (i + 1) * 6 * u, 34 * u, 5 * u); }
  // the pulp mill: a tall pale block and a chimney with steam
  const px = x + 70 * u, pw = 80 * u, ph = 110 * u;
  c.fillStyle = '#d8d2c4'; c.fillRect(px, gy - ph, pw, ph);
  c.fillStyle = '#a9a294'; c.fillRect(px, gy - ph, pw, 8 * u);
  if (winter) snowRoof(c, px, gy - ph, pw, u);
  c.fillStyle = '#7d8a94';
  for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) c.fillRect(px + 12 * u + i * 22 * u, gy - ph + 20 * u + r * 22 * u, 10 * u, 10 * u);
  c.fillStyle = '#c4573f'; c.fillRect(px + pw - 22 * u, gy - ph - 60 * u, 14 * u, 60 * u);
  c.fillStyle = '#efe9dc'; c.fillRect(px + pw - 22 * u, gy - ph - 44 * u, 14 * u, 6 * u);
  plume(c, px + pw - 15 * u, gy - ph - 66 * u, u, time, 'rgba(245,248,250,A)', 4 + Math.round(busy * 3));
  // the biorefinery: round tanks joined by pipes
  const bx = x + 175 * u;
  for (const [ox, h] of [[0, 62], [34, 78]] as const) {
    c.fillStyle = '#9fb3bf'; c.beginPath(); c.roundRect(bx + ox * u, gy - h * u, 28 * u, h * u, [12 * u, 12 * u, 2 * u, 2 * u]); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(bx + ox * u + 5 * u, gy - h * u + 10 * u, 4 * u, h * u - 16 * u);
    if (winter) { c.fillStyle = 'rgba(250,252,255,0.95)'; c.beginPath(); c.ellipse(bx + ox * u + 14 * u, gy - h * u + 4 * u, 13 * u, 4 * u, 0, 0, Math.PI * 2); c.fill(); }
  }
  c.strokeStyle = '#6d7f8a'; c.lineWidth = 3 * u;
  c.beginPath(); c.moveTo(bx + 28 * u, gy - 40 * u); c.lineTo(bx + 34 * u, gy - 40 * u); c.moveTo(px + pw, gy - 30 * u); c.lineTo(bx, gy - 30 * u); c.stroke();
}

const HOUSE: Record<BuildingId, [string, string]> = {
  house: ['#c9744f', '#6e3b2a'], cafe: ['#e8c48e', '#8a4f3a'], school: ['#d9a441', '#6b4a32'],
  shop: ['#8fb6d1', '#3f5d73'], club: ['#9fc37a', '#4c6b35'], sauna: ['#7a5530', '#3f2c1d'],
};

/** The village along the road, in the same colours as the village screen: windows light up as needs are met. */
export function drawVillageSite(c: CanvasRenderingContext2D, P: Places, gy: number, season: Season, time: number, v: Village | undefined) {
  const u = P.u;
  const slot = 104 * u;
  const x0 = P.village - slot * BUILDINGS.length / 2;
  const winter = season === 'winter';
  BUILDINGS.forEach((b, i) => {
    const w = 66 * u;
    const h = (b === 'school' ? 72 : b === 'sauna' ? 40 : 56) * u;
    const x = x0 + slot * i + (slot - w) / 2;
    const top = gy - h;
    const [wall, roof] = HOUSE[b];
    c.fillStyle = 'rgba(20,40,25,0.18)'; c.beginPath(); c.ellipse(x + w * 0.4, gy + 1, w * 0.7, 4 * u, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = wall; c.fillRect(x, top, w, h);
    c.fillStyle = roof;
    c.beginPath(); c.moveTo(x - 6 * u, top); c.lineTo(x + w / 2, top - h * 0.5); c.lineTo(x + w + 6 * u, top); c.fill();
    if (winter) { c.fillStyle = 'rgba(250,252,255,0.95)'; c.beginPath(); c.moveTo(x - 6 * u, top); c.lineTo(x + w / 2, top - h * 0.5); c.lineTo(x + w + 6 * u, top); c.lineTo(x + w / 2, top - h * 0.38); c.fill(); }
    const lit = !!v && (v.level[b] > 0 || v.got[b] > 0);
    c.fillStyle = lit ? '#ffd968' : '#3b4a52';
    const ww = w * 0.2;
    c.fillRect(x + w * 0.14, top + h * 0.25, ww, ww);
    c.fillRect(x + w * 0.66, top + h * 0.25, ww, ww);
    c.fillStyle = '#3f2c1d'; c.fillRect(x + w * 0.42, gy - h * 0.48, w * 0.16, h * 0.48);
    // a little pile of the things it has from the forest
    if (v) {
      const things = v.objects.filter(o => o.building === b && !isGone(o)).length;
      c.fillStyle = '#f3d9a8';
      for (let k = 0; k < Math.min(4, things); k++) c.fillRect(x + w + 3 * u, gy - (5 + k * 5) * u, 9 * u, 4 * u);
    }
    if (b === 'sauna' && v && v.heat > 0) plume(c, x + w * 0.78, top - h * 0.3, u * 0.7, time, 'rgba(225,232,236,A)', 4);
  });
}
