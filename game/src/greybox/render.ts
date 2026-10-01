/**
 * Grey-box renderer: flat shapes only. It reads the season state and never
 * changes it. Art comes later; this exists to find out if the round is fun.
 */
import { CROWN, DAY_TICKS, LIGHT_TICKS, catchRadius, clock, lightAt, type SeasonState } from '../core/season';
import { DAYS } from '../core/weather';
import { WEATHER_ICON } from './text';

type Fx = { x: number; y: number; vy: number; life: number; text?: string; color: string; kind: 'text' | 'sugar' | 'ring' };

const mix = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  W = 0; H = 0; s = 1; ox = 0; oy = 0;
  private fx: Fx[] = [];
  private shownWater = 100;
  comboFlash = { n: 0, t: 0 };
  hint: { text: string; t: number } | null = null;
  labels = { water: 'WATER', stored: 'g CO₂', day: 'Day', juhannus: 'Midsummer' };
  reducedMotion = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.s = Math.min(this.W / 1000, this.H / 1050);
    this.ox = (this.W - 1000 * this.s) / 2;
    this.oy = Math.min(this.H * 0.8 - 900 * this.s, this.H - 1000 * this.s);
  }

  private X(x: number) { return this.ox + x * this.s; }
  private Y(y: number) { return this.oy + y * this.s; }

  catchFx(x: number, y: number, g: number, gold: boolean) {
    this.fx.push({ x: this.X(x), y: this.Y(y), vy: -40, life: 1, text: '+' + Math.round(g), color: gold ? '#ffc83d' : '#ffffff', kind: 'text' });
    this.fx.push({ x: this.X(x), y: this.Y(y), vy: 0, life: 1, color: '#f4a52c', kind: 'sugar' });
  }
  wiltFx() { this.fx.push({ x: this.X(CROWN.x), y: this.Y(CROWN.y), vy: 0, life: 1, color: '#c0a060', kind: 'ring' }); }

  draw(sim: SeasonState, dt: number) {
    const c = this.ctx, W = this.W, H = this.H;
    const k = clock(sim);
    const light = lightAt(sim);
    const day = Math.min(1, light * 1.6);

    // sky: weather and time of day
    const dayCol = { sun: [143, 190, 214], cloudy: [150, 162, 172], rain: [118, 132, 146], heat: [228, 170, 120] }[k.weather];
    const nightCol = k.juhannus ? [190, 150, 175] : [22, 34, 52];
    c.fillStyle = mix(nightCol, dayCol, day);
    c.fillRect(0, 0, W, H);

    // sun / moon across the sky
    const groundY = this.Y(900);
    if (!k.isNight) {
      const p = k.dayProgress;
      const sx = W * (0.1 + 0.8 * p), sy = groundY - Math.sin(Math.PI * p) * groundY * 0.85 - 20;
      c.fillStyle = k.weather === 'heat' ? '#ffb347' : '#ffe08a';
      c.globalAlpha = k.weather === 'sun' || k.weather === 'heat' ? 1 : 0.45;
      c.beginPath(); c.arc(sx, sy, 22 * Math.max(0.7, this.s * 1.4), 0, 7); c.fill();
      c.globalAlpha = 1;
    } else {
      const p = (k.phase - LIGHT_TICKS) / (DAY_TICKS - LIGHT_TICKS);
      c.fillStyle = 'rgba(240,240,255,0.85)';
      c.beginPath(); c.arc(W * (0.2 + 0.6 * p), H * 0.12, 14, 0, 7); c.fill();
    }

    // rain streaks
    if (k.weather === 'rain' && !k.isNight) {
      c.strokeStyle = 'rgba(220,235,255,0.5)'; c.lineWidth = 1.5;
      const t = performance.now() / 1000;
      for (let i = 0; i < 60; i++) {
        const x = ((i * 97 + t * 40) % W), y = ((i * 53 + t * 600) % groundY);
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y + 14); c.stroke();
      }
    }

    // ground
    c.fillStyle = mix([20, 36, 28], [86, 120, 82], day);
    c.fillRect(0, groundY, W, H - groundY);

    // trunk (birch: pale with dark marks)
    const tw = 26 * this.s;
    c.fillStyle = '#e9e5da';
    c.fillRect(this.X(500) - tw / 2, this.Y(CROWN.y + 40), tw, groundY - this.Y(CROWN.y + 40));
    c.fillStyle = '#2b2b2b';
    for (let i = 0; i < 5; i++) c.fillRect(this.X(500) - tw / 2, this.Y(560 + i * 70), tw * (0.5 + (i % 2) * 0.3), 4 * this.s);

    // catch zone while open
    const R = catchRadius(sim);
    if (sim.open) {
      c.strokeStyle = light > 0.05 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)';
      c.lineWidth = 2; c.setLineDash([8, 10]);
      c.beginPath(); c.arc(this.X(CROWN.x), this.Y(CROWN.y), R * this.s, 0, 7); c.stroke();
      c.setLineDash([]);
    }

    // crown: grows when open, droops and fades when wilted
    const wilt = sim.wiltLeft > 0;
    const breathe = sim.open ? 1.08 : 1;
    const r = CROWN.r * this.s * (0.75 + 0.25 * sim.radiusScale) * breathe;
    const cy = this.Y(CROWN.y) + (wilt ? 18 * this.s : 0);
    const green = wilt ? '#8f8a5a' : sim.open ? '#5fbf45' : '#4f9a3c';
    c.fillStyle = green;
    for (const [dx, dy, rr] of [[0, 0, 1], [-0.8, 0.35, 0.62], [0.8, 0.35, 0.62]]) {
      c.beginPath();
      c.arc(this.X(CROWN.x) + dx * r, cy + dy * r, r * rr, 0, Math.PI * 2);
      c.fill();
    }
    if (sim.open && light > 0.05) {
      c.fillStyle = 'rgba(255,255,200,0.18)';
      c.beginPath(); c.arc(this.X(CROWN.x), cy, r * 1.35, 0, 7); c.fill();
    }

    // molecules: O=C=O
    for (const m of sim.molecules) {
      const x = this.X(m.x), y = this.Y(m.y);
      const sz = Math.max(5.5, 7 * this.s); // big enough for a child's eye on a phone
      const o = m.gold ? '#ffc83d' : '#e5483b';
      c.globalAlpha = m.kind === 'out' ? 0.85 : 1;
      c.fillStyle = o;
      c.beginPath(); c.arc(x - sz * 1.45, y, sz * 0.8, 0, 7); c.arc(x + sz * 1.45, y, sz * 0.8, 0, 7); c.fill();
      c.fillStyle = '#1c1f23';
      c.beginPath(); c.arc(x, y, sz, 0, 7); c.fill();
      if (m.gold) { c.strokeStyle = '#ffe9a8'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, sz * 2.6, 0, 7); c.stroke(); }
    }
    c.globalAlpha = 1;

    // effects
    const trunkBase = { x: this.X(500), y: groundY };
    this.fx = this.fx.filter((f) => (f.life -= dt * (f.kind === 'ring' ? 1.2 : 1.4)) > 0);
    for (const f of this.fx) {
      if (f.kind === 'text') {
        f.y += f.vy * dt;
        c.globalAlpha = Math.min(1, f.life * 2);
        c.fillStyle = f.color;
        c.font = `800 ${Math.round(Math.max(13, 22 * this.s))}px system-ui, sans-serif`;
        c.textAlign = 'center';
        c.fillText(f.text!, f.x, f.y - 14);
      } else if (f.kind === 'sugar') {
        // sugar slides down the trunk to become wood
        const t = 1 - f.life;
        const x = f.x + (trunkBase.x - f.x) * Math.min(1, t * 2);
        const y = f.y + (trunkBase.y - 20 - f.y) * t;
        c.globalAlpha = f.life;
        c.fillStyle = f.color;
        c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
      } else {
        c.globalAlpha = f.life;
        c.strokeStyle = f.color; c.lineWidth = 4;
        c.beginPath(); c.arc(f.x, f.y, (1 - f.life) * 200 * this.s + 40, 0, 7); c.stroke();
      }
    }
    c.globalAlpha = 1;

    this.drawHud(sim, dt, light);
  }

  private drawHud(sim: SeasonState, dt: number, light: number) {
    const c = this.ctx, W = this.W, H = this.H;
    const k = clock(sim);
    const pad = 14;
    const small = W < 520;

    // season bar: six days, weather icons
    const barW = Math.min(W - pad * 2, 560), bx = (W - barW) / 2, by = pad + 4;
    const seg = barW / DAYS;
    for (let d = 0; d < DAYS; d++) {
      c.fillStyle = d < k.day ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)';
      c.fillRect(bx + d * seg + 2, by, seg - 4, 8);
      if (d === k.day) {
        c.fillStyle = '#ffc83d';
        c.fillRect(bx + d * seg + 2, by, (seg - 4) * (k.phase / DAY_TICKS), 8);
      }
      c.font = `${small ? 14 : 18}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.globalAlpha = d === k.day ? 1 : 0.6;
      c.fillText(WEATHER_ICON[sim.weather[d]], bx + d * seg + seg / 2, by + 30);
      c.globalAlpha = 1;
    }

    // score
    const stored = Math.max(0, Math.round(sim.caughtG - sim.respiredG));
    c.textAlign = 'left';
    c.fillStyle = '#ffffff';
    c.font = `800 ${small ? 30 : 40}px system-ui, sans-serif`;
    c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowOffsetY = 2;
    c.fillText(stored.toLocaleString('fi-FI'), pad, by + (small ? 76 : 86));
    c.shadowColor = 'transparent';
    c.font = `600 ${small ? 12 : 14}px system-ui, sans-serif`;
    c.fillText(this.labels.stored, pad, by + (small ? 94 : 106));

    // day label
    c.textAlign = 'center';
    c.font = `700 ${small ? 13 : 15}px system-ui, sans-serif`;
    c.fillText(`${this.labels.day} ${k.day + 1}${k.juhannus ? ' · ' + this.labels.juhannus : ''}`, W / 2, by + 52);

    // water meter: left edge, vertical
    this.shownWater += (sim.water - this.shownWater) * Math.min(1, dt * 12);
    const mh = Math.min(H * 0.42, 300), mw = small ? 16 : 20, mx = pad, my = H * 0.3;
    c.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(c, mx, my, mw, mh, mw / 2); c.fill();
    const low = this.shownWater < 25;
    const pulse = low && !this.reducedMotion ? 0.6 + 0.4 * Math.sin(performance.now() / 120) : 1;
    c.fillStyle = low ? `rgba(230,90,70,${pulse})` : '#2f86d6';
    const fh = mh * this.shownWater / 100;
    roundRect(c, mx, my + mh - fh, mw, fh, mw / 2); c.fill();
    c.save();
    c.translate(mx + mw / 2, my + mh + 16);
    c.fillStyle = '#ffffff'; c.font = `700 ${small ? 10 : 11}px system-ui, sans-serif`; c.textAlign = 'center';
    c.fillText(this.labels.water, 0, 0);
    c.restore();

    // light indicator under the score
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(pad, by + (small ? 102 : 116), 80, 5);
    c.fillStyle = '#ffe08a';
    c.fillRect(pad, by + (small ? 102 : 116), 80 * Math.min(1, light), 5);

    // combo stamp
    if (sim.breath >= 5 && sim.open) { this.comboFlash = { n: sim.breath, t: 1 }; }
    if (this.comboFlash.t > 0) {
      this.comboFlash.t -= dt * 1.5;
      const pop = this.reducedMotion ? 1 : 1 + Math.max(0, this.comboFlash.t - 0.7) * 1.2;
      c.save();
      c.translate(W / 2, this.Y(CROWN.y) - CROWN.r * this.s - 60);
      c.rotate(-0.08);
      c.scale(pop, pop);
      c.globalAlpha = Math.min(1, this.comboFlash.t * 2);
      c.font = `900 ${small ? 30 : 40}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.lineWidth = 6; c.strokeStyle = '#0f3b35';
      c.strokeText('×' + this.comboFlash.n, 0, 0);
      c.fillStyle = '#ffc83d';
      c.fillText('×' + this.comboFlash.n, 0, 0);
      c.restore();
    }

    // Tikka hint bubble
    if (this.hint) {
      this.hint.t -= dt;
      if (this.hint.t <= 0) this.hint = null;
      else {
        c.font = `700 ${small ? 14 : 17}px system-ui, sans-serif`;
        const maxW = Math.min(W - 40, 460);
        const lines = wrap(c, this.hint.text, maxW - 28);
        const lh = small ? 19 : 23;
        const bh = lines.length * lh + 18;
        const bx2 = (W - maxW) / 2, by2 = H - bh - (small ? 70 : 60);
        c.globalAlpha = Math.min(1, this.hint.t * 3);
        c.fillStyle = 'rgba(255,255,255,0.95)';
        roundRect(c, bx2, by2, maxW, bh, 14); c.fill();
        c.fillStyle = '#10241c'; c.textAlign = 'center';
        lines.forEach((l, i) => c.fillText(l, W / 2, by2 + 14 + lh * (i + 0.7)));
        c.globalAlpha = 1;
      }
    }
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, h / 2, w / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function wrap(c: CanvasRenderingContext2D, text: string, max: number): string[] {
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
