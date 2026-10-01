/** Showing screens, announcing to screen readers, and small pieces of markup used on many screens. */
import { type Weather } from '../core/weather';
import { iconSvg } from './scene/icons';
import { drawTikka } from './scene/tikka';
import { $, app, canvas, t, ui } from './state';

// ---------- screens ----------

const SCREENS = ['start', 'pause', 'results', 'levelup', 'cards', 'share', 'kisat', 'challenge', 'about'] as const;
export type Screen = (typeof SCREENS)[number];
/** Show one screen. Moving focus into it keeps keyboard and screen-reader users in step. */
export function show(id: Screen | null, focus = true) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  $('hud-btns').hidden = app.mode !== 'play';
  const changed = id !== app.visible;
  app.visible = id;
  if (id && focus && changed) {
    const el = $(id).querySelector<HTMLElement>('[tabindex="-1"], button:not([disabled])');
    requestAnimationFrame(() => el?.focus({ preventScroll: false }));
  }
  if (!id) canvas.focus({ preventScroll: true });
}

/** Read short updates to screen readers (the canvas itself is silent). */
export function announce(text: string) {
  const sr = $('sr');
  sr.textContent = '';
  requestAnimationFrame(() => (sr.textContent = text));
}

export function weatherRow(w: Weather[]) {
  const names = w.map((d) => t().weather[d]).join(', ');
  return `<span role="img" aria-label="${ui().weather}: ${names}" style="display:contents">${w.map((d) => `<span title="${t().weather[d]}">${iconSvg(d, 26)}</span>`).join('')}</span>`;
}

export function finnishDate(seed: string) {
  const m = /^d(\d{4})-(\d{2})-(\d{2})$/.exec(seed);
  return m ? `${Number(m[3])}.${Number(m[2])}.` : seed;
}

export function face(cv: HTMLCanvasElement | null) {
  if (!cv) return;
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, cv.width, cv.height);
  const k = cv.width / 96;
  drawTikka(c, 66 * k, 92 * k, 116 * k, 0, 0);
}

export function ringIcon(fraction: number) {
  const r = 8, len = 2 * Math.PI * r;
  return `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="${r}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="3"/>` +
    `<circle cx="11" cy="11" r="${r}" fill="none" stroke="#ffc83d" stroke-width="3" stroke-linecap="round" stroke-dasharray="${len * fraction} ${len}" transform="rotate(-90 11 11)"/></svg>`;
}
