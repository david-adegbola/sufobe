/**
 * The share poster: a 1080 × 1350 portrait in the Forest Landscape style,
 * your birch in warm evening light, with the season's result on a glass card.
 * Drawn with the same scene code as the game, so it always matches.
 */
import { num } from './format';
import type { Weather } from '../core/weather';
import { paintBirch } from './scene/birch';
import { drawIcon } from './scene/icons';
import { paintLandscape, type Layout } from './scene/landscape';
import { css, moodFor, UI } from './scene/palette';
import { drawTikka } from './scene/tikka';
import { FONT_DISPLAY } from './scene/hud';

export interface PosterInfo {
  scoreG: number;
  unit: string;          // "g CO₂ muuttui puuksi"
  label: string;         // "Päivän sää · 2.10."
  who: string;           // "Utelias Ilves · Vesa"
  weather: Weather[];
  rank: number;
  callout?: string;      // "Voitatko minut?"
}

export const POSTER = { W: 1080, H: 1350 };

export function renderPoster(info: PosterInfo): HTMLCanvasElement {
  const { W, H } = POSTER;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const s = 1.0, ox = (W - 1000 * s) / 2, oy = H * 0.74 - 900 * s;
  const L: Layout = {
    W, H, dpr: 1, s,
    X: (x) => ox + x * s, Y: (y) => oy + y * s,
    groundY: oy + 900 * s, horizonY: oy + 700 * s, lakeBottomY: oy + 782 * s, floorTopY: oy + 785 * s,
  };

  // warm late-afternoon light: the most flattering moment of a Finnish summer day
  const mood = moodFor('sun', false, false, 0.86, 0);
  const sky = c.createLinearGradient(0, 0, 0, L.horizonY);
  sky.addColorStop(0, css(mood.skyTop));
  sky.addColorStop(1, css(mood.skyBottom));
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  const sx = W * 0.8, sy = L.horizonY - 170;
  const glow = c.createRadialGradient(sx, sy, 20, sx, sy, 260);
  glow.addColorStop(0, 'rgba(255, 226, 150, 0.7)');
  glow.addColorStop(1, 'rgba(255, 226, 150, 0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255, 228, 140, 1)';
  c.beginPath(); c.arc(sx, sy, 46, 0, Math.PI * 2); c.fill();

  const land = paintLandscape(L, info.rank);
  const world = document.createElement('canvas');
  world.width = W; world.height = H;
  const w = world.getContext('2d')!;
  w.drawImage(land.back, 0, 0);
  w.drawImage(land.mid, 0, 0);
  w.drawImage(land.floor, 0, 0);
  w.drawImage(paintBirch(L, { leafFraction: 1, wilted: false }), L.X(290), L.Y(225), 420 * s, 687 * s);
  drawTikka(w, L.X(522), L.Y(690), 52 * s * 1.6, 0, 0);
  w.globalCompositeOperation = 'source-atop';
  w.fillStyle = `rgba(${mood.tint.slice(0, 3).map(Math.round).join(',')},${mood.tint[3]})`;
  w.fillRect(0, 0, W, H);
  w.globalCompositeOperation = 'source-over';
  w.drawImage(land.front, 0, 0);
  c.drawImage(world, 0, 0);

  // soft golden rays on the crown
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = -2; i <= 2; i++) {
    const g = c.createLinearGradient(sx, sy, L.X(500), L.Y(430));
    g.addColorStop(0, 'rgba(255, 226, 140, 0)');
    g.addColorStop(1, 'rgba(255, 226, 140, 0.09)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(sx + i * 18, sy); c.lineTo(L.X(470 + i * 55), L.Y(430)); c.lineTo(L.X(530 + i * 55), L.Y(430)); c.closePath(); c.fill();
  }
  c.restore();

  // ---------- type ----------
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  (c as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = 'condensed';
  c.save();
  c.translate(W / 2, 205);
  c.rotate(-0.07);
  c.font = `800 190px ${FONT_DISPLAY}`;
  c.lineJoin = 'round';
  c.lineWidth = 22; c.strokeStyle = '#071f1b'; c.strokeText('KASVA!', 0, 14);
  c.lineWidth = 14; c.strokeStyle = UI.deep; c.strokeText('KASVA!', 0, 0);
  c.fillStyle = UI.sun; c.fillText('KASVA!', 0, 0);
  c.restore();
  (c as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = 'normal';
  pill(c, W / 2, 290, info.label.toUpperCase(), 30);

  // result card
  const cx = 70, cy = H - 360, cw = W - 140, ch = 300;
  c.fillStyle = 'rgba(10, 40, 34, 0.82)';
  c.beginPath(); c.roundRect(cx, cy, cw, ch, 34); c.fill();
  c.strokeStyle = 'rgba(255, 255, 255, 0.4)'; c.lineWidth = 3; c.stroke();
  c.font = `800 120px ${FONT_DISPLAY}`;
  c.lineWidth = 10; c.strokeStyle = '#071f1b';
  const score = `${num(info.scoreG)} g`;
  c.strokeText(score, W / 2, cy + 128);
  c.fillStyle = UI.sun; c.fillText(score, W / 2, cy + 128);
  c.font = `700 38px ${FONT_DISPLAY}`;
  c.fillStyle = UI.paper; c.fillText(info.unit, W / 2, cy + 180);
  info.weather.forEach((wd, i) => drawIcon(c, wd, W / 2 + (i - 2.5) * 62, cy + 232, 44));
  c.font = `700 32px ${FONT_DISPLAY}`;
  c.fillStyle = '#c4d6cc';
  c.fillText(info.who, W / 2, cy + 286);
  if (info.callout) pill(c, W / 2, cy - 40, info.callout, 40, UI.sun, UI.deep);
  return cv;
}

function pill(c: CanvasRenderingContext2D, x: number, y: number, text: string, size: number, bg = 'rgba(10, 40, 34, 0.82)', fg = UI.sun) {
  c.font = `800 ${size}px ${FONT_DISPLAY}`;
  const w = c.measureText(text).width + size * 1.4, h = size * 1.7;
  c.fillStyle = bg;
  c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, h / 2); c.fill();
  c.fillStyle = fg;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x, y + 2);
  c.textBaseline = 'alphabetic';
}
