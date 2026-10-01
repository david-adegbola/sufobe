/** Heads-up display: score, season strip, water and light gauges, combo stamp, Tikka's bubble. */
import { DAY_TICKS, clock, type SeasonState } from '../../core/season';
import { DAYS, JUHANNUS_DAY } from '../../core/weather';
import { drawIcon } from './icons';
import { drawTikka } from './tikka';
import { UI } from './palette';

export const FONT_DISPLAY = '"Bricolage Grotesque", "Arial Rounded MT Bold", system-ui, sans-serif';
export const FONT_HAND = 'Caveat, "Segoe Print", "Comic Sans MS", cursive';

export interface HudState {
  labels: { water: string; stored: string; day: string; juhannus: string };
  shownWater: number;
  shownScore: number;
  combo: { n: number; t: number };
  hint: { text: string; t: number; total: number } | null;
  reducedMotion: boolean;
}

export function newHud(): HudState {
  return {
    labels: { water: 'WATER', stored: 'g CO₂', day: 'Day', juhannus: 'Midsummer' },
    shownWater: 100, shownScore: 0, combo: { n: 0, t: 0 }, hint: null, reducedMotion: false,
  };
}

function pill(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.beginPath(); c.roundRect(x, y, w, h, h / 2);
}

export function drawHud(c: CanvasRenderingContext2D, W: number, H: number, sim: SeasonState, light: number, dt: number, st: HudState) {
  const k = clock(sim);
  const small = W < 560;
  const pad = small ? 12 : 18;
  const top = pad + 2;

  // ---------- season strip: six days with weather icons ----------
  const stripW = Math.min(W - pad * 2 - (small ? 96 : 0), 520);
  const sx = small ? pad : (W - stripW) / 2;
  const seg = stripW / DAYS;
  c.fillStyle = UI.glass;
  pill(c, sx - 6, top - 6, stripW + 12, small ? 46 : 52); c.fill();
  for (let d = 0; d < DAYS; d++) {
    const x = sx + d * seg;
    const past = d < k.day, now = d === k.day;
    c.fillStyle = past ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
    pill(c, x + 3, top + (small ? 28 : 32), seg - 6, 6); c.fill();
    if (now) {
      c.fillStyle = UI.sun;
      pill(c, x + 3, top + (small ? 28 : 32), Math.max(6, (seg - 6) * (k.phase / DAY_TICKS)), 6); c.fill();
    }
    const icon = d === JUHANNUS_DAY && sim.weather[d] === 'sun' ? 'midsummer' : sim.weather[d];
    drawIcon(c, icon, x + seg / 2, top + (small ? 12 : 14), small ? 18 : 22, now ? 1 : past ? 0.45 : 0.8);
  }

  // ---------- score ----------
  const target = Math.max(0, sim.caughtG - sim.respiredG);
  st.shownScore += (target - st.shownScore) * Math.min(1, dt * 10);
  const scoreY = top + (small ? 76 : 96);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.font = `800 ${small ? 34 : 46}px ${FONT_DISPLAY}`;
  c.lineWidth = small ? 5 : 6;
  c.strokeStyle = UI.deep;
  c.lineJoin = 'round';
  const score = Math.round(st.shownScore).toLocaleString('fi-FI');
  c.strokeText(score, pad, scoreY);
  c.fillStyle = '#fff';
  c.fillText(score, pad, scoreY);
  c.font = `700 ${small ? 12 : 14}px ${FONT_DISPLAY}`;
  c.lineWidth = 3;
  c.strokeText(st.labels.stored, pad, scoreY + (small ? 16 : 20));
  c.fillText(st.labels.stored, pad, scoreY + (small ? 16 : 20));

  // day label
  c.textAlign = small ? 'right' : 'center';
  c.font = `700 ${small ? 12 : 14}px ${FONT_DISPLAY}`;
  const dayText = `${st.labels.day} ${k.day + 1}${k.juhannus ? ' · ' + st.labels.juhannus : ''}`;
  const dx = small ? sx + stripW : W / 2, dy = small ? top + 60 : top + 66;
  c.lineWidth = 3; c.strokeStyle = UI.deep;
  c.strokeText(dayText, dx, dy); c.fillStyle = '#fff'; c.fillText(dayText, dx, dy);

  // ---------- water: a capsule that fills like a stem full of water ----------
  const waterPct = 100 * sim.water / (100 * sim.mods.waterMax);
  st.shownWater += (waterPct - st.shownWater) * Math.min(1, dt * 12);
  // deeper roots: a taller water capsule
  const mw = small ? 18 : 22, mh = Math.min(H * 0.36, 260) * Math.min(1.5, sim.mods.waterMax), mx = pad + 2, my = Math.max(scoreY + 44, H * 0.34);
  c.fillStyle = UI.glass;
  pill(c, mx - 4, my - 4, mw + 8, mh + 8); c.fill();
  const low = st.shownWater < 25;
  const pulse = low && !st.reducedMotion ? 0.65 + 0.35 * Math.sin(performance.now() / 110) : 1;
  const fh = mh * st.shownWater / 100;
  c.save();
  pill(c, mx, my, mw, mh); c.clip();
  c.fillStyle = low ? `rgba(242, 113, 28, ${pulse})` : '#3d9ad8';
  c.beginPath();
  const surface = my + mh - fh;
  c.moveTo(mx, surface);
  const t = performance.now() / 400;
  for (let x = 0; x <= mw; x += 2) c.lineTo(mx + x, surface + Math.sin(t + x * 0.5) * 1.5);
  c.lineTo(mx + mw, my + mh); c.lineTo(mx, my + mh); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(mx + 3, my, 3, mh);
  c.restore();
  drawIcon(c, 'drop', mx + mw / 2, my + mh + 18, small ? 16 : 18);

  // ---------- light: how much sun the leaves get ----------
  const lx = mx + mw / 2, ly = my - 22;
  drawIcon(c, 'sun', lx, ly, small ? 16 : 18, 0.25 + 0.75 * Math.min(1, light));

  // ---------- combo stamp ----------
  if (sim.breath >= 5 && sim.open && sim.breath !== st.combo.n) st.combo = { n: sim.breath, t: 1 };
  if (st.combo.t > 0) {
    st.combo.t -= dt * 1.4;
    const pop = st.reducedMotion ? 1 : 1 + Math.max(0, st.combo.t - 0.75) * 1.6;
    c.save();
    c.translate(W / 2, H * 0.2 + (small ? 40 : 30));
    c.rotate(-0.07);
    c.scale(pop, pop);
    c.globalAlpha = Math.min(1, st.combo.t * 2.5);
    c.textAlign = 'center';
    c.font = `800 ${small ? 38 : 52}px ${FONT_DISPLAY}`;
    c.lineWidth = 8; c.strokeStyle = UI.deep;
    c.strokeText('×' + st.combo.n, 0, 0);
    c.fillStyle = UI.sun;
    c.fillText('×' + st.combo.n, 0, 0);
    c.restore();
  }

  // ---------- Tikka's bubble ----------
  if (st.hint) {
    st.hint.t -= dt;
    if (st.hint.t <= 0) st.hint = null;
    else {
      const appear = Math.min(1, (st.hint.total - st.hint.t) * 5, st.hint.t * 3);
      c.font = `700 ${small ? 20 : 25}px ${FONT_HAND}`;
      const maxW = Math.min(W - pad * 2, 480);
      const lines = wrap(c, st.hint.text, maxW - 84);
      const lh = small ? 22 : 27;
      const bh = Math.max(64, lines.length * lh + 22);
      const bx = (W - maxW) / 2, by = H - bh - (small ? 26 : 30) + (1 - appear) * 20;
      c.globalAlpha = appear;
      c.fillStyle = '#fffdf6';
      c.beginPath(); c.roundRect(bx, by, maxW, bh, 18); c.fill();
      c.fillStyle = 'rgba(15, 59, 53, 0.25)';
      c.fillRect(bx + 12, by + bh, maxW - 24, 3);
      // Tikka's head on the left of the bubble
      c.save();
      c.beginPath(); c.roundRect(bx + 10, by + bh / 2 - 26, 52, 52, 26); c.fillStyle = '#e8f1e9'; c.fill();
      c.clip();
      drawTikka(c, bx + 44, by + bh / 2 + 22, 56, 0, 0);
      c.restore();
      c.fillStyle = UI.ink; c.textAlign = 'left';
      lines.forEach((l, i) => c.fillText(l, bx + 74, by + 14 + lh * (i + 0.8)));
      c.globalAlpha = 1;
    }
  }
}

export function wrap(c: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (c.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
