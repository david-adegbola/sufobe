/**
 * Silver birch (rauduskoivu, Betula pendula): white bark with black
 * horizontal lenticels and dark diamond marks under old branch scars,
 * branches that arch up then let their twigs hang down, small triangular
 * double-toothed leaves. Painted once into an offscreen canvas.
 */
import { makeRng } from '../../core/rng';
import type { Layout } from './landscape';

export const BOX = { x0: 290, y0: 225, x1: 710, y1: 912 };

interface Leaf { x: number; y: number; a: number; k: number; tone: number }
interface Branch { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; w: number }
interface Twig { x0: number; y0: number; x1: number; y1: number }

function plan() {
  const r = makeRng('birch-v1');
  const branches: Branch[] = [];
  const twigs: Twig[] = [];
  const leaves: Leaf[] = [];
  const inCrown = (x: number, y: number) => ((x - 500) / 176) ** 2 + ((y - 418) / 178) ** 2 < 1;
  const N = 11;
  for (let i = 0; i < N; i++) {
    const y0 = 575 - i * 24;
    const side = i % 2 ? 1 : -1;
    const reach = 95 + r() * 60 - i * 3;
    const b: Branch = {
      x0: 500 + side * 4, y0,
      cx: 500 + side * reach * 0.55, cy: y0 - 70 - r() * 50,
      x1: 500 + side * reach, y1: y0 - 30 + r() * 50,
      w: 7 - i * 0.4,
    };
    branches.push(b);
    for (let j = 0; j < 11; j++) {
      const t = 0.22 + j * 0.075 + r() * 0.04;
      const x = (1 - t) ** 2 * b.x0 + 2 * (1 - t) * t * b.cx + t * t * b.x1;
      const y = (1 - t) ** 2 * b.y0 + 2 * (1 - t) * t * b.cy + t * t * b.y1;
      const len = 30 + r() * 55;
      const tw: Twig = { x0: x, y0: y, x1: x + side * (6 + r() * 10), y1: y + len };
      twigs.push(tw);
      const n = 9 + Math.floor(r() * 6);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const lx = tw.x0 + (tw.x1 - tw.x0) * u + (k % 2 ? 5 : -5);
        const ly = tw.y0 + (tw.y1 - tw.y0) * u;
        if (inCrown(lx, ly)) leaves.push({ x: lx, y: ly, a: (k % 2 ? 0.5 : -0.5) + (r() - 0.5) * 0.6, k: r(), tone: r() });
      }
    }
  }
  // leaves around the leader and filling the crown, densest at the top
  for (let i = 0; i < 520; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = 500 + Math.cos(a) * d * 170, y = 405 + Math.sin(a) * d * 165 - 25 * (1 - d);
    if (inCrown(x, y)) leaves.push({ x, y, a: (r() - 0.5) * 1.8, k: r(), tone: r() });
  }
  return { branches, twigs, leaves, r };
}

const PLAN = plan();

export interface BirchOptions { leafFraction: number; wilted: boolean }

export function paintBirch(L: Layout, opt: BirchOptions): HTMLCanvasElement {
  const sc = L.s * L.dpr;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil((BOX.x1 - BOX.x0) * sc);
  cv.height = Math.ceil((BOX.y1 - BOX.y0) * sc);
  const c = cv.getContext('2d')!;
  c.setTransform(sc, 0, 0, sc, -BOX.x0 * sc, -BOX.y0 * sc);
  const r = makeRng('birch-paint');

  // trunk: slightly curving, tapering, white with shading on the right
  const trunk = (y: number) => 500 + Math.sin((900 - y) / 160) * 4;
  const width = (y: number) => 6 + (y - 290) / 610 * 24;
  c.beginPath();
  for (let y = 905; y >= 290; y -= 10) c.lineTo(trunk(y) - width(y) / 2, y);
  for (let y = 290; y <= 905; y += 10) c.lineTo(trunk(y) + width(y) / 2, y);
  c.closePath();
  const bark = c.createLinearGradient(486, 0, 516, 0);
  bark.addColorStop(0, '#fbfaf5');
  bark.addColorStop(0.55, '#ece8dd');
  bark.addColorStop(1, '#c4bfb2');
  c.fillStyle = bark;
  c.fill();
  // rough dark bark at the base of the trunk
  for (let i = 0; i < 14; i++) {
    const y = 868 + r() * 38, w = width(y);
    c.fillStyle = 'rgba(40, 36, 32, 0.55)';
    c.beginPath();
    c.ellipse(trunk(y) + (r() - 0.5) * w * 0.6, y, w * (0.12 + r() * 0.18), 2 + r() * 4, 0, 0, Math.PI * 2);
    c.fill();
  }
  // lenticels: thin horizontal dark dashes
  for (let i = 0; i < 46; i++) {
    const y = 300 + r() * 560, w = width(y);
    c.fillStyle = 'rgba(48, 44, 40, 0.8)';
    c.fillRect(trunk(y) - w / 2 + r() * w * 0.4, y, w * (0.2 + r() * 0.4), 1.4 + r() * 1.2);
  }
  // black diamond marks below branch scars
  for (const b of PLAN.branches) {
    const y = b.y0 + 10, w = width(y);
    c.fillStyle = '#26221e';
    c.beginPath();
    c.moveTo(trunk(y), y - 6);
    c.lineTo(trunk(y) + w * 0.32, y + 2);
    c.lineTo(trunk(y), y + 9);
    c.lineTo(trunk(y) - w * 0.32, y + 2);
    c.closePath();
    c.fill();
  }

  // branches: pale near the trunk, darker twigs
  for (const b of PLAN.branches) {
    c.strokeStyle = '#8f8576';
    c.lineWidth = Math.max(1.5, b.w);
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(b.x0, b.y0); c.quadraticCurveTo(b.cx, b.cy, b.x1, b.y1); c.stroke();
  }
  c.strokeStyle = 'rgba(70, 56, 46, 0.85)';
  c.lineWidth = 1.2;
  for (const t of PLAN.twigs) {
    const extra = opt.wilted ? 14 : 0;
    c.beginPath(); c.moveTo(t.x0, t.y0); c.quadraticCurveTo(t.x0 + (t.x1 - t.x0) * 0.2, t.y0 + 12, t.x1, t.y1 + extra); c.stroke();
  }

  // leaves: small triangular-ovate, toothed edge suggested by a darker rim
  const greens = ['#5f9e3a', '#74b347', '#4f8a33', '#8cc152', '#679f3e'];
  const wilts = ['#a8a052', '#b8a24a', '#8f8a4a', '#c0a84e', '#9c9a50'];
  const tones = opt.wilted ? wilts : greens;
  for (const lf of PLAN.leaves) {
    if (lf.k > opt.leafFraction) continue;
    const droop = opt.wilted ? 0.9 : 0;
    const y = lf.y + (opt.wilted ? 10 : 0);
    c.save();
    c.translate(lf.x, y);
    c.scale(1.35, 1.35);
    c.rotate(Math.PI / 2 + lf.a * (1 - droop * 0.6));
    c.fillStyle = tones[Math.floor(lf.tone * tones.length)];
    c.beginPath();
    c.moveTo(-8, 0);
    c.quadraticCurveTo(-1, -6.2, 6, -0.6);
    c.lineTo(7.5, 0);
    c.lineTo(6, 0.6);
    c.quadraticCurveTo(-1, 6.2, -8, 0);
    c.fill();
    c.strokeStyle = 'rgba(40, 70, 30, 0.35)';
    c.lineWidth = 0.6;
    c.beginPath(); c.moveTo(-7, 0); c.lineTo(6, 0); c.stroke();
    c.restore();
  }
  return cv;
}
