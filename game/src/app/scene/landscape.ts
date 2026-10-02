/**
 * The Finnish lake landscape behind the tree, painted once per screen size
 * into offscreen canvases: forested hills (vaara), a lake with a red cottage,
 * Norway spruces, the forest floor, and dark foreground boughs that frame
 * the scene like the Forest Landscape posters.
 *
 * 2.5D (increment 6): the layers are kept apart, not flattened, so the
 * game can move them at different rates (parallax). The back, mid and floor
 * layers can be painted wider than the screen (`margin`, a share of the
 * width on each side) so they can slide without showing an edge.
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

export interface Landscape {
  back: HTMLCanvasElement; mid: HTMLCanvasElement; floor: HTMLCanvasElement; front: HTMLCanvasElement;
  /** css px painted beyond each side of the screen on the back, mid and floor layers */
  margin: number;
}

/** A layer canvas; `M` css px wider on each side, with x = 0 still at the screen's left edge. */
function layer(L: Layout, M = 0): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil((L.W + 2 * M) * L.dpr);
  c.height = Math.ceil(L.H * L.dpr);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(L.dpr, 0, 0, L.dpr, M * L.dpr, 0);
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

/**
 * A forested ridge. With `M` > 0 the same curve runs on into the margins
 * beyond the screen; the trees there take their chances from `rm`, so the
 * part on screen is the same as without margins.
 */
function ridge(c: CanvasRenderingContext2D, L: Layout, r: Rng, baseY: number, amp: number, color: string, treeColor: string, treeH: number, seedShift: number, M = 0, rm: Rng = r) {
  const pts: [number, number, boolean][] = [];
  const f1 = rand(r, 1.2, 2.2), f2 = rand(r, 3, 5), p1 = rand(r, 0, 6), p2 = rand(r, 0, 6);
  for (let x = -10 - Math.ceil(M / 4) * 4; x <= L.W + 10 + M; x += 4) {
    const u = x / L.W + seedShift;
    const y = baseY - amp * (0.55 + 0.3 * Math.sin(u * Math.PI * f1 + p1) + 0.15 * Math.sin(u * Math.PI * f2 + p2));
    pts.push([x, y, x >= -10 && x <= L.W + 10]);
  }
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-10 - M, L.H);
  for (const [x, y] of pts) c.lineTo(x, y);
  c.lineTo(L.W + 10 + M, L.H);
  c.closePath();
  c.fill();
  // forested ridge line: tiny spruce tips
  c.fillStyle = treeColor;
  for (let i = 0; i < pts.length; i++) {
    const [x, y, onScreen] = pts[i];
    const q = onScreen ? r : rm;
    if (q() < 0.55) continue;
    const h = treeH * rand(q, 0.6, 1.3), w = h * 0.32;
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

export function paintLandscape(L: Layout, rank = 0, margin = 0): Landscape {
  const r = makeRng('landscape-v1');
  // the back, mid and floor layers run on M css px beyond each side of the screen; what is drawn there
  // takes its chances from its own generator, so the part on screen stays as it always was
  const M = Math.round(L.W * margin);
  const rm = makeRng('landscape-margins');
  const inMargin = () => (rm() < 0.5 ? -M + rm() * M : L.W + rm() * M);

  // ---------- back: hills, lake, far shore ----------
  const [back, b] = layer(L, M);
  const hz = L.horizonY;
  ridge(b, L, r, hz - 4, L.H * 0.11, '#a8c0c4', '#9ab5ba', L.H * 0.012, 0.1, M, rm);
  ridge(b, L, r, hz, L.H * 0.075, '#7fa3a3', '#6f9595', L.H * 0.016, 0.6, M, rm);
  ridge(b, L, r, hz + 2, L.H * 0.04, '#52807a', '#46726c', L.H * 0.02, 1.3, M, rm);
  // haze lying along the far hills (atmospheric perspective), only over the hills themselves
  b.globalCompositeOperation = 'source-atop';
  const haze = b.createLinearGradient(0, hz - L.H * 0.16, 0, hz + 2);
  haze.addColorStop(0, 'rgba(227, 241, 239, 0.45)');
  haze.addColorStop(1, 'rgba(227, 241, 239, 0.08)');
  b.fillStyle = haze;
  b.fillRect(-M, hz - L.H * 0.16, L.W + 2 * M, L.H * 0.16 + 2);
  b.globalCompositeOperation = 'source-over';
  // lake
  const lake = b.createLinearGradient(0, hz, 0, L.lakeBottomY);
  lake.addColorStop(0, '#8cbcc4');
  lake.addColorStop(1, '#4f8f9c');
  b.fillStyle = lake;
  b.fillRect(-M, hz, L.W + 2 * M, L.lakeBottomY - hz + 2);
  // reflections of the hills, then shimmer strokes
  b.fillStyle = 'rgba(82, 128, 122, 0.35)';
  b.fillRect(-M, hz, L.W + 2 * M, (L.lakeBottomY - hz) * 0.18);
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
  // the lake goes on beyond the screen
  for (let i = 0; i < Math.round(90 * M / L.W); i++) {
    const y = rand(rm, hz + 3, L.lakeBottomY - 2);
    const len = rand(rm, 8, 46) * (0.5 + (y - hz) / (L.lakeBottomY - hz));
    b.strokeStyle = `rgba(232, 246, 246, ${rand(rm, 0.15, 0.5)})`;
    b.lineWidth = 1.2;
    const x = inMargin();
    b.beginPath(); b.moveTo(x, y); b.lineTo(x + len, y); b.stroke();
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

  // ---------- things that appear as your tree ranks up ----------
  if (rank >= 2) {
    // Taimi: a small sailboat on the lake
    const bx2 = L.W * 0.36, by2 = hz + (L.lakeBottomY - hz) * 0.45, bs = Math.max(10, L.H * 0.022);
    b.fillStyle = '#f6f3ea';
    b.beginPath(); b.moveTo(bx2, by2 - bs * 1.6); b.lineTo(bx2 + bs * 0.9, by2 - bs * 0.15); b.lineTo(bx2, by2 - bs * 0.15); b.closePath(); b.fill();
    b.fillStyle = '#e9e1cf';
    b.beginPath(); b.moveTo(bx2 - bs * 0.1, by2 - bs * 1.2); b.lineTo(bx2 - bs * 0.6, by2 - bs * 0.15); b.lineTo(bx2 - bs * 0.1, by2 - bs * 0.15); b.closePath(); b.fill();
    b.fillStyle = '#8a3b2a';
    b.beginPath(); b.moveTo(bx2 - bs * 0.8, by2 - bs * 0.1); b.lineTo(bx2 + bs, by2 - bs * 0.1); b.lineTo(bx2 + bs * 0.7, by2 + bs * 0.2); b.lineTo(bx2 - bs * 0.55, by2 + bs * 0.2); b.closePath(); b.fill();
    b.fillStyle = 'rgba(246, 243, 234, 0.3)'; b.fillRect(bx2 - bs * 0.6, by2 + bs * 0.3, bs * 1.4, bs * 0.25);
  }
  if (rank >= 3) {
    // Vesa: an elk (hirvi) bull wading at the near shore of the lake
    const ex = L.W * 0.6, ey = L.lakeBottomY - 2, es = Math.max(14, L.H * 0.04);
    b.fillStyle = '#4a3326';
    b.beginPath(); b.ellipse(ex, ey - es * 0.95, es * 0.75, es * 0.35, 0, 0, Math.PI * 2); b.fill();      // body
    b.beginPath(); b.ellipse(ex - es * 0.35, ey - es * 1.22, es * 0.35, es * 0.18, 0, 0, Math.PI * 2); b.fill(); // shoulder hump
    for (const lx of [-0.5, -0.3, 0.35, 0.55]) b.fillRect(ex + lx * es, ey - es * 0.75, es * 0.09, es * 0.75); // legs
    b.save(); b.translate(ex - es * 0.85, ey - es * 1.15); b.rotate(0.5);
    b.beginPath(); b.ellipse(0, 0, es * 0.32, es * 0.14, 0, 0, Math.PI * 2); b.fill(); b.restore();          // long head
    b.fillStyle = '#c7b79a';                                                                                   // pale palmate antlers
    b.beginPath(); b.ellipse(ex - es * 0.95, ey - es * 1.5, es * 0.3, es * 0.1, -0.4, 0, Math.PI * 2); b.fill();
    b.beginPath(); b.ellipse(ex - es * 0.6, ey - es * 1.52, es * 0.28, es * 0.1, 0.4, 0, Math.PI * 2); b.fill();
    b.fillStyle = 'rgba(232, 246, 246, 0.45)'; b.fillRect(ex - es * 0.8, ey - es * 0.05, es * 1.6, 2);       // ripple
  }


  const [mid, m] = layer(L, M);
  // more spruces stand beyond the screen, behind the ones on it
  for (let i = 0; i < Math.round(16 * M / L.W * 2); i++) {
    const back = rm() < 0.5;
    const h = L.H * (back ? rand(rm, 0.16, 0.24) : rand(rm, 0.22, 0.34));
    spruce(m, rm, inMargin(), L.floorTopY + (back ? 0 : L.H * 0.012), h,
      back ? '#2f5a4e' : '#1f4a40', back ? '#3c6a5a' : '#2a5a4a', back ? '#5f8a72' : '#4f7f62');
  }
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
  const [floor, f] = layer(L, M);
  const g = f.createLinearGradient(0, L.floorTopY, 0, L.H);
  g.addColorStop(0, '#6d9450');
  g.addColorStop(0.5, '#4f7a3e');
  g.addColorStop(1, '#335a2c');
  f.fillStyle = g;
  f.beginPath();
  f.moveTo(-M, L.floorTopY + 6);
  for (let x = -Math.ceil(M / 20) * 20; x <= L.W + M; x += 20) f.lineTo(x, L.floorTopY + Math.sin(x * 0.02) * 3);
  f.lineTo(L.W + M, L.H); f.lineTo(-M, L.H); f.closePath(); f.fill();
  const mosses = ['#5e8a42', '#7aa354', '#4a7536', '#8bb35e', '#3f6a33'];
  const span = L.H - L.floorTopY;
  for (let i = 0; i < 1400; i++) {
    const y = L.floorTopY + Math.pow(r(), 0.8) * span;
    const k = (y - L.floorTopY) / span;
    dab(f, rand(r, 0, L.W), y, rand(r, 2, 7) * (0.6 + k), rand(r, 1, 3) * (0.6 + k), rand(r, -0.4, 0.4), mosses[i % mosses.length]);
  }
  for (let i = 0; i < Math.round(1400 * M / L.W * 2); i++) {
    const y = L.floorTopY + Math.pow(rm(), 0.8) * span;
    const k = (y - L.floorTopY) / span;
    dab(f, inMargin(), y, rand(rm, 2, 7) * (0.6 + k), rand(rm, 1, 3) * (0.6 + k), rand(rm, -0.4, 0.4), mosses[i % mosses.length]);
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

  if (rank >= 4) {
    // Riukupuu: young birch saplings sprouting from your tree's seeds
    for (const [px, ph] of [[0.36, 0.11], [0.66, 0.08]] as const) {
      const x = L.W * px, base = L.floorTopY + span * 0.18, h = L.H * ph;
      f.fillStyle = '#f1eee6'; f.fillRect(x - 2, base - h, 4, h);
      f.fillStyle = '#2a2622'; for (let i = 1; i < 4; i++) f.fillRect(x - 2, base - h * i / 4, 3, 1.5);
      for (let i = 0; i < 26; i++) dab(f, x + rand(r, -h * 0.28, h * 0.28), base - h + rand(r, -h * 0.2, h * 0.35), h * 0.05, h * 0.03, rand(r, 0, 3), i % 2 ? '#74b347' : '#5f9e3a');
    }
  }
  if (rank >= 5) {
    // Tukkipuu: a capercaillie (metso) displaying on the forest floor
    const cx = L.W * 0.86, cy = L.floorTopY + span * 0.3, cs = Math.max(14, L.H * 0.035);
    f.fillStyle = '#2b2e30';
    for (let i = -3; i <= 3; i++) { f.save(); f.translate(cx + cs * 0.4, cy - cs * 0.4); f.rotate(-1.2 + i * 0.16); f.beginPath(); f.ellipse(0, -cs * 0.55, cs * 0.12, cs * 0.6, 0, 0, Math.PI * 2); f.fill(); f.restore(); } // fanned tail
    f.beginPath(); f.ellipse(cx, cy - cs * 0.3, cs * 0.55, cs * 0.38, 0, 0, Math.PI * 2); f.fill();        // body
    f.fillStyle = '#1f3a2c'; f.beginPath(); f.ellipse(cx - cs * 0.3, cy - cs * 0.45, cs * 0.22, cs * 0.25, 0, 0, Math.PI * 2); f.fill(); // green breast sheen
    f.fillStyle = '#2b2e30'; f.beginPath(); f.ellipse(cx - cs * 0.48, cy - cs * 0.9, cs * 0.16, cs * 0.3, -0.3, 0, Math.PI * 2); f.fill(); // raised neck
    f.fillStyle = '#d42b2b'; f.fillRect(cx - cs * 0.56, cy - cs * 1.14, cs * 0.1, cs * 0.06);               // red eyebrow
    f.fillStyle = '#e8dcc0'; f.beginPath(); f.moveTo(cx - cs * 0.6, cy - cs * 1.06); f.lineTo(cx - cs * 0.78, cy - cs * 1.0); f.lineTo(cx - cs * 0.6, cy - cs * 0.98); f.fill(); // pale bill
  }


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
  return { back, mid, floor, front, margin: M };
}
