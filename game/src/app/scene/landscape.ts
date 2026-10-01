/**
 * The Finnish lake landscape behind the tree, painted once per screen size
 * into offscreen canvases: forested hills (vaara), a lake with a red cottage,
 * Norway spruces, the forest floor, and dark foreground boughs that frame
 * the scene like the Forest Landscape posters.
 *
 * Accuracy notes: low rounded hills, not mountains. Spruces are conical with
 * drooping branch tiers. The floor has moss, blueberry and lingonberry,
 * a glacial boulder, and a fallen log with boletes.
 */
import { makeRng, type Rng } from '../../core/rng';

export interface Layout {
  W: number; H: number; dpr: number; s: number;
  X: (x: number) => number; Y: (y: number) => number;
  groundY: number; horizonY: number; lakeBottomY: number; floorTopY: number;
}

export interface Landscape { back: HTMLCanvasElement; mid: HTMLCanvasElement; floor: HTMLCanvasElement; front: HTMLCanvasElement }

function layer(L: Layout): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(L.W * L.dpr);
  c.height = Math.ceil(L.H * L.dpr);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  return [c, ctx];
}

const rand = (r: Rng, a: number, b: number) => a + (b - a) * r();

/** A soft painted dab: rotated ellipse. */
function dab(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
}

function ridge(c: CanvasRenderingContext2D, L: Layout, r: Rng, baseY: number, amp: number, color: string, treeColor: string, treeH: number, seedShift: number) {
  const pts: [number, number][] = [];
  const f1 = rand(r, 1.2, 2.2), f2 = rand(r, 3, 5), p1 = rand(r, 0, 6), p2 = rand(r, 0, 6);
  for (let x = -10; x <= L.W + 10; x += 4) {
    const u = x / L.W + seedShift;
    const y = baseY - amp * (0.55 + 0.3 * Math.sin(u * Math.PI * f1 + p1) + 0.15 * Math.sin(u * Math.PI * f2 + p2));
    pts.push([x, y]);
  }
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-10, L.H);
  for (const [x, y] of pts) c.lineTo(x, y);
  c.lineTo(L.W + 10, L.H);
  c.closePath();
  c.fill();
  // forested ridge line: tiny spruce tips
  c.fillStyle = treeColor;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (r() < 0.55) continue;
    const h = treeH * rand(r, 0.6, 1.3), w = h * 0.32;
    c.beginPath();
    c.moveTo(x, y - h);
    c.lineTo(x + w, y + 2);
    c.lineTo(x - w, y + 2);
    c.closePath();
    c.fill();
  }
}

/** Norway spruce: conical, drooping branch tiers, light from the upper left. */
export function spruce(c: CanvasRenderingContext2D, r: Rng, x: number, baseY: number, h: number, dark: string, mid: string, light: string) {
  const w = h * 0.36;
  c.fillStyle = '#3a2c22';
  c.fillRect(x - h * 0.018, baseY - h * 0.12, h * 0.036, h * 0.14);
  const tiers = Math.max(5, Math.round(h / 14));
  for (let i = 0; i < tiers; i++) {
    const t = (i + 1) / tiers;
    const ty = baseY - h + h * t * 0.92;
    const tw = w * Math.pow(t, 0.95);
    const droop = h * 0.05 * t;
    const top = ty - h * 0.14;
    c.fillStyle = i % 2 ? dark : mid;
    c.beginPath();
    c.moveTo(x, top);
    c.quadraticCurveTo(x + tw * 0.55, top + droop * 0.6, x + tw, ty + droop);
    c.quadraticCurveTo(x + tw * 0.4, ty + droop * 0.35, x, ty);
    c.quadraticCurveTo(x - tw * 0.4, ty + droop * 0.35, x - tw, ty + droop);
    c.quadraticCurveTo(x - tw * 0.55, top + droop * 0.6, x, top);
    c.fill();
    // sunlit needle edge on the left
    c.strokeStyle = light;
    c.lineWidth = Math.max(1, h * 0.008);
    c.beginPath();
    c.moveTo(x - tw * 0.1, top + 2);
    c.quadraticCurveTo(x - tw * 0.55, top + droop * 0.6, x - tw * 0.95, ty + droop - 1);
    c.stroke();
  }
  // a few hanging cones near the top
  for (let k = 0; k < 3; k++) {
    if (r() < 0.4) continue;
    dab(c, x + rand(r, -w * 0.2, w * 0.2), baseY - h * rand(r, 0.72, 0.85), h * 0.012, h * 0.03, 0, '#6b4a2e');
  }
}

export function paintLandscape(L: Layout): Landscape {
  const r = makeRng('landscape-v1');

  // ---------- back: hills, lake, far shore ----------
  const [back, b] = layer(L);
  const hz = L.horizonY;
  ridge(b, L, r, hz - 4, L.H * 0.11, '#a8c0c4', '#9ab5ba', L.H * 0.012, 0.1);
  ridge(b, L, r, hz, L.H * 0.075, '#7fa3a3', '#6f9595', L.H * 0.016, 0.6);
  ridge(b, L, r, hz + 2, L.H * 0.04, '#52807a', '#46726c', L.H * 0.02, 1.3);
  // lake
  const lake = b.createLinearGradient(0, hz, 0, L.lakeBottomY);
  lake.addColorStop(0, '#8cbcc4');
  lake.addColorStop(1, '#4f8f9c');
  b.fillStyle = lake;
  b.fillRect(0, hz, L.W, L.lakeBottomY - hz + 2);
  // reflections of the hills, then shimmer strokes
  b.fillStyle = 'rgba(82, 128, 122, 0.35)';
  b.fillRect(0, hz, L.W, (L.lakeBottomY - hz) * 0.18);
  for (let i = 0; i < 90; i++) {
    const y = rand(r, hz + 3, L.lakeBottomY - 2);
    const len = rand(r, 8, 46) * (0.5 + (y - hz) / (L.lakeBottomY - hz));
    b.strokeStyle = `rgba(232, 246, 246, ${rand(r, 0.15, 0.5)})`;
    b.lineWidth = 1.2;
    b.beginPath();
    const x = rand(r, 0, L.W);
    b.moveTo(x, y); b.lineTo(x + len, y);
    b.stroke();
  }
  // red cottage (mökki) and sauna jetty on the far shore
  const mx = L.W * 0.74, my = hz + 1, ms = Math.max(8, L.H * 0.018);
  b.fillStyle = '#a63a2b'; b.fillRect(mx, my - ms, ms * 1.6, ms);
  b.fillStyle = '#3a2a24';
  b.beginPath(); b.moveTo(mx - ms * 0.15, my - ms); b.lineTo(mx + ms * 0.8, my - ms * 1.55); b.lineTo(mx + ms * 1.75, my - ms); b.closePath(); b.fill();
  b.fillStyle = '#f3efe4';
  b.fillRect(mx, my - ms, ms * 0.12, ms); b.fillRect(mx + ms * 1.48, my - ms, ms * 0.12, ms);
  b.fillRect(mx + ms * 0.55, my - ms * 0.7, ms * 0.35, ms * 0.35);
  b.fillStyle = '#7a5a3e'; b.fillRect(mx + ms * 1.7, my - ms * 0.15, ms * 1.6, ms * 0.15);
  b.fillStyle = 'rgba(166, 58, 43, 0.3)'; b.fillRect(mx, my + 2, ms * 1.6, ms * 0.6);

  // ---------- mid: spruce groves either side, the centre stays open ----------
  const [mid, m] = layer(L);
  const groves: [number, number][] = [[0.02, 0.3], [0.7, 1.0]];
  for (const [a, z] of groves) {
    const n = Math.round((z - a) * 16);
    for (let i = 0; i < n; i++) {
      const x = L.W * rand(r, a, z);
      const back = r() < 0.5;
      const h = L.H * (back ? rand(r, 0.16, 0.24) : rand(r, 0.22, 0.34));
      spruce(m, r, x, L.floorTopY + (back ? 0 : L.H * 0.012), h,
        back ? '#2f5a4e' : '#1f4a40', back ? '#3c6a5a' : '#2a5a4a', back ? '#5f8a72' : '#4f7f62');
    }
  }

  // ---------- floor: moss, berries, boulder, log ----------
  const [floor, f] = layer(L);
  const g = f.createLinearGradient(0, L.floorTopY, 0, L.H);
  g.addColorStop(0, '#6d9450');
  g.addColorStop(0.5, '#4f7a3e');
  g.addColorStop(1, '#335a2c');
  f.fillStyle = g;
  f.beginPath();
  f.moveTo(0, L.floorTopY + 6);
  for (let x = 0; x <= L.W; x += 20) f.lineTo(x, L.floorTopY + Math.sin(x * 0.02) * 3);
  f.lineTo(L.W, L.H); f.lineTo(0, L.H); f.closePath(); f.fill();
  const mosses = ['#5e8a42', '#7aa354', '#4a7536', '#8bb35e', '#3f6a33'];
  const span = L.H - L.floorTopY;
  for (let i = 0; i < 1400; i++) {
    const y = L.floorTopY + Math.pow(r(), 0.8) * span;
    const k = (y - L.floorTopY) / span;
    dab(f, rand(r, 0, L.W), y, rand(r, 2, 7) * (0.6 + k), rand(r, 1, 3) * (0.6 + k), rand(r, -0.4, 0.4), mosses[i % mosses.length]);
  }
  // fallen spruce needles
  f.strokeStyle = 'rgba(120, 84, 48, 0.5)'; f.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = rand(r, 0, L.W), y = rand(r, L.floorTopY + 6, L.H), a = rand(r, 0, Math.PI);
    f.beginPath(); f.moveTo(x, y); f.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); f.stroke();
  }
  // blueberry and lingonberry patches, kept away from the trunk
  const patch = (cx: number, cy: number, size: number, leaf: string, berry: string, berries: number) => {
    for (let i = 0; i < 40; i++) dab(f, cx + rand(r, -size, size), cy + rand(r, -size * 0.4, size * 0.4), size * 0.12, size * 0.07, rand(r, 0, 3), leaf);
    for (let i = 0; i < berries; i++) dab(f, cx + rand(r, -size * 0.8, size * 0.8), cy + rand(r, -size * 0.3, size * 0.3), size * 0.05, size * 0.05, 0, berry);
  };
  const S = L.H * 0.06;
  for (const [px, py] of [[0.1, 0.06], [0.3, 0.12], [0.88, 0.08], [0.68, 0.15], [0.05, 0.2], [0.95, 0.22]] as const) {
    const blue = r() < 0.6;
    patch(L.W * px, L.floorTopY + span * py * 2.4, S * rand(r, 0.8, 1.3), blue ? '#2f5a33' : '#3f6e30', blue ? '#3b3f8f' : '#c0262d', blue ? 10 : 7);
  }
  // glacial boulder with moss
  const bx = L.W * 0.2, by = L.floorTopY + span * 0.32, bw = L.H * 0.07;
  dab(f, bx, by, bw, bw * 0.55, 0, '#8d9188');
  dab(f, bx - bw * 0.2, by - bw * 0.15, bw * 0.75, bw * 0.38, -0.1, '#a3a79d');
  for (let i = 0; i < 30; i++) dab(f, bx + rand(r, -bw * 0.8, bw * 0.6), by - bw * rand(r, 0.25, 0.5), bw * 0.12, bw * 0.06, 0, '#6f9a45');
  // fallen log with boletes
  const lx = L.W * 0.8, ly = L.floorTopY + span * 0.42, lw = L.H * 0.16;
  f.save(); f.translate(lx, ly); f.rotate(-0.08);
  f.fillStyle = '#6b4a32'; f.fillRect(-lw, -lw * 0.08, lw * 2, lw * 0.16);
  f.fillStyle = '#8a6444'; f.fillRect(-lw, -lw * 0.08, lw * 2, lw * 0.05);
  dab(f, lw, 0, lw * 0.05, lw * 0.08, 0, '#c9a477');
  for (let i = 0; i < 18; i++) dab(f, rand(r, -lw, lw), -lw * 0.08, lw * 0.06, lw * 0.025, 0, '#6f9a45');
  f.restore();
  for (const dx of [-0.6, -0.45, 0.3]) {
    const mx2 = lx + lw * dx, my2 = ly + lw * 0.14;
    f.fillStyle = '#efe4c8'; f.fillRect(mx2 - 2, my2 - 7, 4, 8);
    dab(f, mx2, my2 - 8, 7, 4, 0, '#8a4f24');
  }

  // ---------- front: dark spruce boughs framing the edges ----------
  const [front, fr] = layer(L);
  const greensDark = ['#0f2e27', '#163a31', '#1f4a3c', '#12342c'];
  /** One spruce twig: a stem with short needles all round it, like a bottle brush. */
  const twig = (x0: number, y0: number, ang: number, len: number, nl: number) => {
    const ex = x0 + Math.cos(ang) * len, ey = y0 + Math.sin(ang) * len;
    fr.strokeStyle = '#3a2a1e'; fr.lineWidth = 1.4;
    fr.beginPath(); fr.moveTo(x0, y0); fr.lineTo(ex, ey); fr.stroke();
    const steps = Math.max(6, Math.round(len / 3));
    for (let i = 0; i < steps; i++) {
      const u = i / steps, x = x0 + (ex - x0) * u, y = y0 + (ey - y0) * u;
      const taper = 1 - u * 0.55;
      for (const side of [-1, 1]) {
        const a = ang + side * (1.0 + rand(r, -0.3, 0.35)) + 0.25; // needles point forward and a little down
        const l = nl * taper * rand(r, 0.75, 1.15);
        fr.strokeStyle = greensDark[Math.floor(r() * greensDark.length)];
        fr.lineWidth = 1.7;
        fr.beginPath(); fr.moveTo(x, y); fr.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); fr.stroke();
      }
    }
  };
  const bough = (x0: number, y0: number, x1: number, y1: number, len: number, dir: 1 | -1) => {
    const nl = Math.max(7, L.H * 0.014);
    fr.strokeStyle = '#2b2018'; fr.lineWidth = Math.max(2.5, L.H * 0.007);
    const mx = (x0 + x1) / 2, my = Math.max(y0, y1) + len * 0.12;
    fr.beginPath(); fr.moveTo(x0, y0); fr.quadraticCurveTo(mx, my, x1, y1); fr.stroke();
    const n = 9;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1;
      const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1;
      const tl = len * 0.28 * (1 - t * 0.5);
      const base = dir === 1 ? 0 : Math.PI;
      twig(x, y, base + dir * 0.55, tl, nl);   // hanging down-forward
      twig(x, y, base - dir * 0.35, tl * 0.7, nl * 0.9); // up-forward
    }
    twig(x1, y1, dir === 1 ? 0.25 : Math.PI - 0.25, len * 0.18, nl);
  };
  const bl = Math.max(L.W, L.H) * 0.32;
  bough(-20, L.H * 0.04, bl * 0.9, L.H * 0.1, bl, 1);
  bough(-20, L.H * 0.16, bl * 0.55, L.H * 0.22, bl * 0.7, 1);
  bough(L.W + 20, L.H * 0.5, L.W - bl * 0.5, L.H * 0.56, bl * 0.65, -1);
  // big blueberry bush in the bottom-left corner
  for (let i = 0; i < 120; i++) {
    const a = rand(r, Math.PI * 1.05, Math.PI * 1.95), d = rand(r, 0, L.H * 0.14);
    dab(fr, Math.cos(a) * d + L.W * 0.02, L.H + Math.sin(a) * d * 0.9, L.H * 0.012, L.H * 0.007, rand(r, 0, 3), i % 3 ? '#1f3f26' : '#2c5530');
  }
  for (let i = 0; i < 14; i++) dab(fr, rand(r, 0, L.H * 0.12), L.H - rand(r, 0, L.H * 0.09), 4, 4, 0, '#353a86');
  return { back, mid, floor, front };
}
