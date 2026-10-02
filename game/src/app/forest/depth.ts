/**
 * Depth layers for the forest view (2.5D pass). Painted once into offscreen
 * canvases, wider than the screen so the camera can pan across them, and
 * redrawn only when the size, season or place changes. Each frame then only
 * copies a few images, offset by how far that layer moves with the camera
 * (parallax): the sky hardly moves, the mountains a little, the far forest
 * more, the foreground most.
 *
 *   sky · clouds · far ridge · near ridge · far forest · mid forest · haze
 *   → the stand itself (drawn by scene.ts under the camera)
 *   → foreground grass, ferns, stones and mushrooms
 *
 * Shapes follow the species rules of the rest of the scene: spruce a dark
 * narrow cone, pine a flat crown on a bare stem, birch a light rounded crown
 * that turns yellow in autumn and is bare in winter.
 */
import { makeRng } from '../../core/rng';
import type { Season } from './text';

/** How much wider than the view a layer is, so panning never shows its edge. */
export const LAYER_EXTRA = 0.6;

/** How strongly each layer follows the camera (1 = moves with the stand). */
export const PARALLAX = { clouds: 0.04, farRidge: 0.1, nearRidge: 0.2, farForest: 0.35, midForest: 0.6, foreground: 1.35 } as const;

/** A layer canvas holding only the band y0..y1 of the view, so drawing it each frame fills few pixels. */
export interface Band { cv: HTMLCanvasElement; y: number; h: number }

function canvasFor(w: number, y0: number, y1: number, dpr: number): [Band, CanvasRenderingContext2D] {
  const h = Math.max(1, y1 - y0);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, -y0 * dpr);
  return [{ cv, y: y0, h }, c];
}

/** Mix two #rrggbb colours. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + ((((pb >> s) & 255) - ((pa >> s) & 255)) * Math.max(0, Math.min(1, t))));
  return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

export interface DepthLayers {
  key: string;
  /** css width of every layer canvas (the view's width × (1 + LAYER_EXTRA)) */
  w: number;
  farRidge: Band;
  nearRidge: Band;
  farForest: Band;
  midForest: Band;
  foreground: Band;
  /** height of the foreground strip, css px */
  fgH: number;
}

/**
 * Paint every depth layer for a view `W` × `H` whose forest floor begins at
 * `floorTop` (the back of the plot) and ends at `groundY` (the front).
 */
export function paintDepth(W: number, H: number, floorTop: number, groundY: number, season: Season, fell: boolean, haze: string, dpr: number): DepthLayers {
  const w = W * (1 + LAYER_EXTRA);
  const r = makeRng('depth');
  // mountains: two ridges, the far one paler (atmospheric perspective); a bare fell in Lapland
  const ridge = (base: number, amp: number, color: string, tips: string, tipH: number, bare: boolean): Band => {
    const [cv, c] = canvasFor(w, Math.max(0, base - amp * 3.2 - tipH * 1.4), groundY + 4, dpr);
    const pts: [number, number][] = [];
    const f1 = 2.2 + r(), p1 = r() * 6;
    for (let x = -10; x <= w + 10; x += 6) {
      const u = x / w;
      const bump = bare ? Math.exp(-Math.pow((u - 0.35) / 0.12, 2)) * 1.8 : 0;
      pts.push([x, base - amp * (0.5 + 0.35 * Math.sin(u * Math.PI * f1 + p1) + 0.15 * Math.sin(u * 23 + p1) + bump)]);
    }
    c.fillStyle = color;
    c.beginPath(); c.moveTo(-10, groundY + 4);
    for (const [x, y] of pts) c.lineTo(x, y);
    c.lineTo(w + 10, groundY + 4); c.closePath(); c.fill();
    if (bare && season === 'winter') {
      // snow on the fell top
      c.fillStyle = 'rgba(250,252,255,0.85)';
      c.beginPath();
      for (const [x, y] of pts) if (y < base - amp * 1.2) { c.moveTo(x - 4, y + 6); c.lineTo(x, y); c.lineTo(x + 4, y + 6); }
      c.fill();
    }
    c.fillStyle = tips;
    for (const [x, y] of pts) {
      if (r() < 0.4) continue;
      if (bare && y < base - amp * 1.15) continue; // above the tree line
      const h = tipH * (0.6 + 0.7 * r());
      c.beginPath(); c.moveTo(x - h * 0.18, y + 1); c.lineTo(x, y - h); c.lineTo(x + h * 0.18, y + 1); c.fill();
    }
    return cv;
  };
  const span = floorTop;
  const farRidge = ridge(floorTop - span * 0.32, span * 0.16, mix('#8fa9b4', haze, 0.45), mix('#7e9aa6', haze, 0.4), 6, fell);
  const nearRidge = ridge(floorTop - span * 0.16, span * 0.12, mix('#6f9086', haze, 0.25), mix('#5f8277', haze, 0.2), 9, false);

  // forest bands: rows of tree silhouettes standing on the back of the plot
  const leaf = season === 'autumn' ? '#d9a33a' : season === 'winter' ? '#b7aea2' : season === 'spring' ? '#9cc65a' : '#6fa344';
  const band = (baseY: number, size: number, density: number, conifer: string, birchCol: string, fade: number, seed: string): Band => {
    const [cv, c] = canvasFor(w, baseY - size * 1.5, Math.min(H, baseY + size * 1.05), dpr);
    const rr = makeRng(seed);
    const n = Math.round((w / size) * density);
    const trees: { x: number; y: number; h: number; kind: number }[] = [];
    for (let i = 0; i < n; i++) trees.push({ x: rr() * w, y: baseY + rr() * size * 0.5, h: size * (0.7 + 0.7 * rr()), kind: rr() });
    trees.sort((a, b) => a.y - b.y);
    // a soft wall of canopy behind the single trees, so the band reads as forest, not a fence
    c.fillStyle = mix(conifer, haze, 0.15);
    c.beginPath(); c.moveTo(0, baseY + size);
    for (let x = 0; x <= w; x += 8) c.lineTo(x, baseY - size * (0.35 + 0.15 * Math.sin(x * 0.05) + 0.1 * Math.sin(x * 0.013 + 2)));
    c.lineTo(w, baseY + size); c.closePath(); c.fill();
    for (const t of trees) {
      const fd = mix(conifer, haze, fade * (1 - (t.y - baseY) / size));
      if (t.kind < 0.55) {
        // spruce: a narrow dark cone
        c.fillStyle = fd;
        c.beginPath(); c.moveTo(t.x, t.y - t.h); c.lineTo(t.x - t.h * 0.2, t.y); c.lineTo(t.x + t.h * 0.2, t.y); c.closePath(); c.fill();
        if (season === 'winter') { c.fillStyle = 'rgba(245,249,252,0.7)'; c.beginPath(); c.moveTo(t.x, t.y - t.h); c.lineTo(t.x - t.h * 0.06, t.y - t.h * 0.7); c.lineTo(t.x + t.h * 0.06, t.y - t.h * 0.7); c.fill(); }
      } else if (t.kind < 0.8) {
        // pine: a flat crown on a bare stem
        c.fillStyle = mix('#6e5240', haze, fade * 0.6);
        c.fillRect(t.x - 0.8, t.y - t.h * 0.8, 1.6, t.h * 0.8);
        c.fillStyle = fd;
        c.beginPath(); c.ellipse(t.x, t.y - t.h * 0.82, t.h * 0.2, t.h * 0.12, 0, 0, Math.PI * 2); c.fill();
      } else {
        // birch: a light round crown (bare and grey in winter)
        c.fillStyle = mix('#efece2', haze, fade * 0.5);
        c.fillRect(t.x - 0.7, t.y - t.h * 0.75, 1.4, t.h * 0.75);
        c.fillStyle = mix(birchCol, haze, fade);
        c.globalAlpha = season === 'winter' ? 0.45 : 1;
        c.beginPath(); c.ellipse(t.x, t.y - t.h * 0.7, t.h * 0.17, t.h * 0.22, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
      }
    }
    return cv;
  };
  const farForest = band(floorTop - 2, Math.max(10, span * 0.09), 2.2, '#4f7466', leaf, 0.55, 'far-forest');
  const midForest = band(floorTop + 2, Math.max(16, span * 0.15), 1.6, '#2f5a42', leaf, 0.3, 'mid-forest');

  // foreground: low grass, ferns, stones and mushrooms along the front edge of the plot
  const fgH = 46;
  const [fcv, f] = canvasFor(w, 0, fgH, dpr);
  const fr = makeRng('fg-' + season);
  const grass = season === 'winter' ? '#dfe8ee' : season === 'autumn' ? '#9a8a3e' : season === 'spring' ? '#8fbf5a' : '#5d9445';
  const grassDark = season === 'winter' ? '#c9d6de' : season === 'autumn' ? '#7d6a2e' : '#3f7536';
  for (let x = -10; x < w + 10; x += 3 + fr() * 6) {
    const h = 8 + fr() * 16;
    f.strokeStyle = fr() < 0.5 ? grass : grassDark;
    f.lineWidth = 1.4 + fr();
    const lean = (fr() - 0.5) * 8;
    f.beginPath(); f.moveTo(x, fgH); f.quadraticCurveTo(x + lean * 0.3, fgH - h * 0.6, x + lean, fgH - h); f.stroke();
  }
  for (let i = 0; i < w / 90; i++) {
    const x = fr() * w;
    const kind = fr();
    if (kind < 0.35) {
      // a mossy stone
      f.fillStyle = season === 'winter' ? '#e8eef2' : '#8d8f86';
      f.beginPath(); f.ellipse(x, fgH - 4, 9 + fr() * 8, 6 + fr() * 4, 0, Math.PI, 0); f.fill();
      if (season !== 'winter') { f.fillStyle = '#6f9a4a'; f.beginPath(); f.ellipse(x - 2, fgH - 9, 6, 2.5, 0, Math.PI, 0); f.fill(); }
    } else if (kind < 0.65 && season !== 'winter') {
      // a fern
      f.strokeStyle = season === 'autumn' ? '#b07a34' : '#4e8a3c';
      f.lineWidth = 1.6;
      for (let k = -2; k <= 2; k++) { f.beginPath(); f.moveTo(x, fgH); f.quadraticCurveTo(x + k * 5, fgH - 22, x + k * 12, fgH - 14 - Math.abs(k) * 2); f.stroke(); }
    } else if (kind < 0.8 && (season === 'autumn' || season === 'summer')) {
      // a mushroom (in late summer and autumn)
      f.fillStyle = '#efe6d2'; f.fillRect(x - 1.5, fgH - 9, 3, 9);
      f.fillStyle = fr() < 0.5 ? '#b9542f' : '#a8743c';
      f.beginPath(); f.ellipse(x, fgH - 9, 6, 4, 0, Math.PI, 0); f.fill();
    } else if (season === 'spring') {
      // wood anemones in spring
      f.fillStyle = '#f7f5ee';
      for (let k = 0; k < 3; k++) { f.beginPath(); f.arc(x + k * 5, fgH - 10 - (k % 2) * 4, 2.2, 0, Math.PI * 2); f.fill(); }
    }
  }
  if (season === 'winter') {
    // snow drifts along the front
    f.fillStyle = '#f4f8fb';
    f.beginPath(); f.moveTo(0, fgH);
    for (let x = 0; x <= w; x += 12) f.lineTo(x, fgH - 6 - 4 * Math.sin(x * 0.04));
    f.lineTo(w, fgH); f.closePath(); f.fill();
  }

  return { key: '', w, farRidge, nearRidge, farForest, midForest, foreground: fcv, fgH };
}

/** Drifting clouds: a few soft shapes, drawn each frame (cheap). */
export function drawClouds(c: CanvasRenderingContext2D, W: number, top: number, bottom: number, time: number, shift: number, season: Season) {
  const col = season === 'winter' ? 'rgba(255,255,255,0.75)' : season === 'autumn' ? 'rgba(250,244,236,0.8)' : 'rgba(255,255,255,0.85)';
  c.fillStyle = col;
  for (let i = 0; i < 5; i++) {
    const speed = 4 + i * 1.3;
    const span = W + 240;
    const x = ((i * 0.23 * span + time * speed + shift) % span + span) % span - 120;
    const y = top + (bottom - top) * (0.15 + 0.17 * ((i * 37) % 5) / 5);
    const s = 18 + ((i * 53) % 4) * 6;
    c.beginPath();
    c.ellipse(x, y, s * 2, s * 0.7, 0, 0, Math.PI * 2);
    c.ellipse(x - s * 1.1, y + s * 0.15, s * 1.1, s * 0.55, 0, 0, Math.PI * 2);
    c.ellipse(x + s * 1.2, y + s * 0.1, s * 1.2, s * 0.6, 0, 0, Math.PI * 2);
    c.ellipse(x + s * 0.3, y - s * 0.35, s * 0.9, s * 0.6, 0, 0, Math.PI * 2);
    c.fill();
  }
}
