/**
 * Draws one frame. Reads the season state, never changes it.
 *
 * Layer order: sky → sun, stars, clouds → [landscape back, spruces, floor,
 * birch, Tikka, washed with the mood tint] → god rays → science particles →
 * foreground boughs → rain → paper grain → HUD.
 */
import { CROWN, DAY_TICKS, LIGHT_TICKS, catchRadius, clock, lightAt, TUNING, type SeasonState } from '../core/season';
import { makeRng } from '../core/rng';
import { BOX, paintBirch } from './scene/birch';
import { drawHud, newHud, type HudState } from './scene/hud';
import { paintLandscape, type Landscape, type Layout } from './scene/landscape';
import { SCIENCE, css, moodFor, type Mood } from './scene/palette';
import { drawTikka } from './scene/tikka';

type Fx =
  | { kind: 'o2' | 'sugar' | 'drop' | 'vapour'; x: number; y: number; vx: number; vy: number; life: number; max: number; tx?: number; ty?: number }
  | { kind: 'text'; x: number; y: number; life: number; text: string; gold: boolean }
  | { kind: 'ring'; x: number; y: number; life: number };

export class Renderer {
  private c: CanvasRenderingContext2D;
  private world: HTMLCanvasElement;
  private wc: CanvasRenderingContext2D;
  L!: Layout;
  private land!: Landscape;
  private birchCache = new Map<string, HTMLCanvasElement>();
  private grain: CanvasPattern | null = null;
  private fx: Fx[] = [];
  private clouds: { x: number; y: number; r: number; speed: number }[] = [];
  private waterAcc = 0;
  private vapourAcc = 0;
  private drumT = 0;
  private wiltFade = 0;
  private time = 0;
  hud: HudState = newHud();

  constructor(private canvas: HTMLCanvasElement) {
    this.c = canvas.getContext('2d')!;
    this.world = document.createElement('canvas');
    this.wc = this.world.getContext('2d')!;
    const r = makeRng('clouds');
    for (let i = 0; i < 7; i++) this.clouds.push({ x: r(), y: 0.08 + r() * 0.28, r: 0.04 + r() * 0.05, speed: 0.004 + r() * 0.006 });
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.world.width = this.canvas.width;
    this.world.height = this.canvas.height;
    const s = Math.min(W / 1000, H / 1050);
    const ox = (W - 1000 * s) / 2;
    const oy = Math.min(H * 0.8 - 900 * s, H - 1000 * s);
    const X = (x: number) => ox + x * s, Y = (y: number) => oy + y * s;
    const groundY = Y(900);
    this.L = {
      W, H, dpr, s, X, Y, groundY,
      horizonY: Y(700), lakeBottomY: Y(782), floorTopY: Y(785),
    };
    this.land = paintLandscape(this.L);
    this.birchCache.clear();
    this.grain = this.makeGrain();
  }

  private makeGrain(): CanvasPattern | null {
    const g = document.createElement('canvas');
    g.width = g.height = 128;
    const gc = g.getContext('2d')!;
    const img = gc.createImageData(128, 128);
    const r = makeRng('grain');
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + r() * 145;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gc.putImageData(img, 0, 0);
    return this.c.createPattern(g, 'repeat');
  }

  private birch(sim: SeasonState, wilted: boolean): HTMLCanvasElement {
    // each wilt costs leaves: fewer leaves when the catch zone has shrunk
    const frac = Math.round((0.45 + 0.55 * (sim.radiusScale - TUNING.minRadiusScale) / (1 - TUNING.minRadiusScale)) * 20) / 20;
    const key = `${frac}-${wilted}`;
    let cv = this.birchCache.get(key);
    if (!cv) { cv = paintBirch(this.L, { leafFraction: frac, wilted }); this.birchCache.set(key, cv); }
    return cv;
  }

  // ---------- effects triggered by game events ----------

  catchFx(x: number, y: number, g: number, gold: boolean) {
    const L = this.L;
    const sx = L.X(x), sy = L.Y(y);
    // sugar slides down to become wood; oxygen leaves the leaf
    const base = { x: L.X(500), y: L.Y(860) };
    this.fx.push({ kind: 'sugar', x: sx, y: sy, vx: 0, vy: 0, life: 1.4, max: 1.4, tx: base.x, ty: base.y });
    this.fx.push({ kind: 'o2', x: sx, y: sy, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 20, life: 2.2, max: 2.2 });
    this.fx.push({ kind: 'text', x: sx, y: sy - 10, life: 0.9, text: '+' + Math.round(g), gold });
  }
  wiltFx() { this.fx.push({ kind: 'ring', x: this.L.X(CROWN.x), y: this.L.Y(CROWN.y), life: 1 }); }
  drum() { this.drumT = 0.6; }
  showHint(text: string, secs: number) { this.hud.hint = { text, t: secs, total: secs }; this.drum(); }

  draw(sim: SeasonState, dt: number, live: boolean) {
    this.time += dt;
    const { c, L } = this;
    const { W, H, dpr } = L;
    const k = clock(sim);
    const light = lightAt(sim);
    const nightProgress = k.isNight ? (k.phase - LIGHT_TICKS) / (DAY_TICKS - LIGHT_TICKS) : 0;
    const mood = moodFor(k.weather, k.isNight, k.juhannus, k.dayProgress, nightProgress);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.drawSky(mood, k.weather, k.isNight, k.dayProgress, nightProgress, dt);

    // ---------- world layers, washed with the mood tint ----------
    const w = this.wc;
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.clearRect(0, 0, this.world.width, this.world.height);
    w.drawImage(this.land.back, 0, 0);
    w.drawImage(this.land.mid, 0, 0);
    w.drawImage(this.land.floor, 0, 0);
    w.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawBirch(w, sim, light, dt, k.weather === 'rain');
    this.drawTikka(w, dt);
    if (mood.tint[3] > 0.005) {
      w.globalCompositeOperation = 'source-atop';
      w.fillStyle = `rgba(${mood.tint.slice(0, 3).map(Math.round).join(',')},${mood.tint[3]})`;
      w.fillRect(0, 0, W, H);
      w.globalCompositeOperation = 'source-over';
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.world, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.drawRays(sim, light, k.dayProgress);
    this.drawOpenGlow(sim, light);
    this.drawWater(sim, dt, live);
    this.drawMolecules(sim);
    this.drawFx(dt);

    // foreground boughs sway a little and share the tint
    const sway = this.hud.reducedMotion ? 0 : Math.sin(this.time * 0.7) * 0.004;
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.clearRect(0, 0, this.world.width, this.world.height);
    w.setTransform(dpr, 0, 0, dpr, 0, 0);
    w.rotate(sway);
    w.drawImage(this.land.front, 0, 0, W, H);
    w.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mood.tint[3] > 0.005) {
      w.globalCompositeOperation = 'source-atop';
      w.fillStyle = `rgba(${mood.tint.slice(0, 3).map(Math.round).join(',')},${mood.tint[3]})`;
      w.fillRect(0, 0, W, H);
      w.globalCompositeOperation = 'source-over';
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.world, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (k.weather === 'rain' && !k.isNight) this.drawRain();

    // paper grain over everything painted
    if (this.grain) {
      c.save();
      c.globalAlpha = 0.07;
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = this.grain;
      c.fillRect(0, 0, W, H);
      c.restore();
    }
    if (live) drawHud(c, W, H, sim, light, dt, this.hud);
  }

  private drawSky(mood: Mood, weather: string, isNight: boolean, dayProgress: number, nightProgress: number, dt: number) {
    const { c, L } = this;
    const g = c.createLinearGradient(0, 0, 0, L.horizonY);
    g.addColorStop(0, css(mood.skyTop));
    g.addColorStop(1, css(mood.skyBottom));
    c.fillStyle = g;
    c.fillRect(0, 0, L.W, L.H);

    if (mood.stars > 0) {
      const r = makeRng('stars');
      c.fillStyle = `rgba(255,255,255,${0.8 * mood.stars})`;
      for (let i = 0; i < 70; i++) c.fillRect(r() * L.W, r() * L.horizonY * 0.75, 1.6, 1.6);
    }
    // sun arcs over the hills; on the Juhannus night it skims the horizon
    const sunR = Math.max(16, L.H * 0.03);
    let sx = -100, sy = -100, show = 0;
    if (!isNight) {
      sx = L.W * (0.08 + 0.84 * dayProgress);
      sy = L.horizonY - Math.sin(Math.PI * dayProgress) * L.horizonY * 0.8 + sunR * 0.5;
      show = weather === 'sun' || weather === 'heat' ? 1 : 0.45;
    } else if (mood.stars === 0 && mood.day > 0.3) {
      sx = L.W * (0.9 - 0.8 * nightProgress);
      sy = L.horizonY - sunR * 0.4;
      show = 0.9;
    }
    if (show > 0) {
      const glow = c.createRadialGradient(sx, sy, sunR * 0.5, sx, sy, sunR * 4);
      glow.addColorStop(0, `rgba(255, 226, 150, ${0.55 * show})`);
      glow.addColorStop(1, 'rgba(255, 226, 150, 0)');
      c.fillStyle = glow;
      c.fillRect(sx - sunR * 4, sy - sunR * 4, sunR * 8, sunR * 8);
      c.fillStyle = weather === 'heat' ? `rgba(255, 176, 80, ${show})` : `rgba(255, 228, 140, ${show})`;
      c.beginPath(); c.arc(sx, sy, sunR, 0, Math.PI * 2); c.fill();
    }
    if (isNight && mood.stars > 0.2) {
      c.fillStyle = `rgba(240, 240, 255, ${0.9 * mood.stars})`;
      c.beginPath(); c.arc(L.W * (0.2 + 0.6 * nightProgress), L.H * 0.12, 12, 0, Math.PI * 2); c.fill();
    }
    // soft painted clouds; more and greyer in cloudy and rainy weather
    const n = weather === 'sun' ? 3 : weather === 'heat' ? 1 : 7;
    const grey = weather === 'rain' ? [196, 204, 210] : [248, 250, 250];
    for (let i = 0; i < n; i++) {
      const cl = this.clouds[i];
      if (!this.hud.reducedMotion) cl.x = (cl.x + cl.speed * dt) % 1.3;
      const x = (cl.x - 0.15) * L.W, y = cl.y * L.horizonY, r = cl.r * Math.max(L.W, L.H);
      c.fillStyle = `rgba(${grey.join(',')}, ${isNight ? 0.25 : 0.85})`;
      c.beginPath();
      c.ellipse(x, y, r * 1.6, r * 0.55, 0, 0, Math.PI * 2);
      c.ellipse(x + r * 0.6, y - r * 0.35, r * 0.8, r * 0.55, 0, 0, Math.PI * 2);
      c.ellipse(x - r * 0.5, y - r * 0.2, r * 0.7, r * 0.45, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  private drawBirch(w: CanvasRenderingContext2D, sim: SeasonState, light: number, dt: number, windy: boolean) {
    const L = this.L;
    const target = sim.wiltLeft > 0 ? 1 : 0;
    this.wiltFade += (target - this.wiltFade) * Math.min(1, dt * 4);
    const healthy = this.birch(sim, false);
    const sway = this.hud.reducedMotion ? 0 : Math.sin(this.time * (windy ? 1.6 : 0.9)) * (windy ? 0.012 : 0.006);
    const bx = L.X(BOX.x0), by = L.Y(BOX.y0), bw = (BOX.x1 - BOX.x0) * L.s, bh = (BOX.y1 - BOX.y0) * L.s;
    w.save();
    // sway around the base of the trunk
    w.translate(L.X(500), L.Y(905));
    w.rotate(sway + (sim.open && light > 0.05 ? Math.sin(this.time * 3) * 0.002 : 0));
    w.translate(-L.X(500), -L.Y(905));
    w.globalAlpha = 1 - this.wiltFade;
    w.drawImage(healthy, bx, by, bw, bh);
    if (this.wiltFade > 0.01) {
      w.globalAlpha = this.wiltFade;
      w.drawImage(this.birch(sim, true), bx, by, bw, bh);
    }
    w.restore();
    w.globalAlpha = 1;
  }

  private drawTikka(w: CanvasRenderingContext2D, dt: number) {
    const L = this.L;
    this.drumT = Math.max(0, this.drumT - dt);
    const peck = this.drumT > 0 ? Math.abs(Math.sin(this.drumT * 40)) : 0;
    const bob = this.hud.reducedMotion ? 0 : Math.sin(this.time * 1.3) * 0.6;
    drawTikka(w, L.X(522), L.Y(690), 52 * L.s * 1.6, peck, bob);
  }

  /** Soft golden rays falling on the crown when the sun is strong. */
  private drawRays(sim: SeasonState, light: number, dayProgress: number) {
    if (light < 0.55) return;
    const { c, L } = this;
    const strength = (light - 0.55) / 0.45;
    const sx = L.W * (0.08 + 0.84 * dayProgress), sy = 0;
    const cx = L.X(CROWN.x), cy = L.Y(CROWN.y);
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = -2; i <= 2; i++) {
      const spread = CROWN.r * L.s * 0.9;
      const g = c.createLinearGradient(sx, sy, cx, cy);
      g.addColorStop(0, SCIENCE.sunRay + '0)');
      g.addColorStop(1, SCIENCE.sunRay + (0.1 * strength) + ')');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(sx + i * 20, sy);
      c.lineTo(cx + i * spread * 0.5 - spread * 0.18, cy);
      c.lineTo(cx + i * spread * 0.5 + spread * 0.18, cy);
      c.closePath();
      c.fill();
    }
    c.restore();
    void sim;
  }

  /** Stomata open: the catch zone glows softly; nothing in the dark. */
  private drawOpenGlow(sim: SeasonState, light: number) {
    if (!sim.open) return;
    const { c, L } = this;
    const R = catchRadius(sim) * L.s;
    const x = L.X(CROWN.x), y = L.Y(CROWN.y);
    const usable = light > 0.05;
    const g = c.createRadialGradient(x, y, R * 0.3, x, y, R);
    g.addColorStop(0, usable ? 'rgba(255, 246, 200, 0.16)' : 'rgba(200, 210, 255, 0.06)');
    g.addColorStop(1, 'rgba(255, 246, 200, 0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = usable ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.18)';
    c.lineWidth = 2;
    c.setLineDash([3, 9]);
    c.lineDashOffset = -this.time * 20;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
  }

  /** Water rises up the trunk while the roots refill; open stomata breathe out vapour. */
  private drawWater(sim: SeasonState, dt: number, live: boolean) {
    if (!live) return;
    const L = this.L;
    if (!sim.open && sim.water < 99.5) {
      this.waterAcc += dt * 3;
      while (this.waterAcc >= 1) {
        this.waterAcc -= 1;
        this.fx.push({ kind: 'drop', x: L.X(500) + (Math.random() - 0.5) * 8 * L.s, y: L.Y(880), vx: 0, vy: -90 * L.s * 1.4, life: 1.6, max: 1.6 });
      }
    }
    if (sim.open && clock(sim).weather !== 'rain') {
      const heat = clock(sim).weather === 'heat';
      this.vapourAcc += dt * (heat ? 9 : 3.5);
      while (this.vapourAcc >= 1) {
        this.vapourAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        this.fx.push({ kind: 'vapour', x: L.X(CROWN.x + Math.cos(a) * 120), y: L.Y(CROWN.y + Math.sin(a) * 90), vx: Math.cos(a) * 12, vy: -30, life: 1.2, max: 1.2 });
      }
    }
  }

  private drawMolecules(sim: SeasonState) {
    const { c, L } = this;
    const sz = Math.max(5, 7 * L.s);
    for (const m of sim.molecules) {
      const x = L.X(m.x), y = L.Y(m.y);
      const rot = (m.id * 0.7 + this.time * (m.kind === 'pulled' ? 3 : 0.4)) % (Math.PI * 2);
      const dx = Math.cos(rot) * sz * 1.35, dy = Math.sin(rot) * sz * 1.35;
      // soft grey-blue glow: this is what CO₂ looks like in Kasva
      c.fillStyle = SCIENCE.co2Glow;
      c.beginPath(); c.arc(x, y, sz * 2.6, 0, Math.PI * 2); c.fill();
      if (m.gold) {
        // a sunfleck: the molecule sits in a patch of sunlight
        c.strokeStyle = 'rgba(255, 214, 110, 0.9)';
        c.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2 + this.time;
          c.beginPath();
          c.moveTo(x + Math.cos(a) * sz * 2.4, y + Math.sin(a) * sz * 2.4);
          c.lineTo(x + Math.cos(a) * sz * 3.6, y + Math.sin(a) * sz * 3.6);
          c.stroke();
        }
      }
      c.globalAlpha = m.kind === 'out' ? 0.85 : 1;
      c.fillStyle = SCIENCE.co2Oxygen;
      c.strokeStyle = 'rgba(70, 96, 116, 0.8)';
      c.lineWidth = 1;
      for (const sgn of [-1, 1]) {
        c.beginPath(); c.arc(x + sgn * dx, y + sgn * dy, sz * 0.74, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      c.fillStyle = SCIENCE.co2Carbon;
      c.beginPath(); c.arc(x, y, sz * 0.85, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
  }

  private drawFx(dt: number) {
    const { c, L } = this;
    this.fx = this.fx.filter((f) => (f.life -= dt) > 0);
    for (const f of this.fx) {
      if (f.kind === 'ring') {
        c.globalAlpha = f.life;
        c.strokeStyle = '#d4b45a'; c.lineWidth = 4;
        c.beginPath(); c.arc(f.x, f.y, (1 - f.life) * 220 * L.s + 40 * L.s, 0, Math.PI * 2); c.stroke();
        continue;
      }
      if (f.kind === 'text') {
        c.globalAlpha = Math.min(1, f.life * 2);
        c.font = `800 ${Math.max(14, 22 * L.s)}px "Bricolage Grotesque", system-ui, sans-serif`;
        c.textAlign = 'center';
        c.lineWidth = 3; c.strokeStyle = 'rgba(15, 59, 53, 0.8)';
        const y = f.y - (0.9 - f.life) * 40;
        c.strokeText(f.text, f.x, y);
        c.fillStyle = f.gold ? '#ffd56e' : '#ffffff';
        c.fillText(f.text, f.x, y);
        continue;
      }
      const t = 1 - f.life / f.max;
      if (f.kind === 'sugar') {
        const x = f.x + (f.tx! - f.x) * Math.min(1, t * 1.8);
        const y = f.y + (f.ty! - f.y) * t;
        c.globalAlpha = Math.min(1, f.life * 2);
        const g = c.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, SCIENCE.sugar);
        g.addColorStop(1, 'rgba(242, 169, 59, 0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill();
      } else {
        f.x += f.vx * dt; f.y += f.vy * dt;
        c.globalAlpha = Math.min(1, f.life * 1.5) * (f.kind === 'vapour' ? 0.5 : 0.95);
        if (f.kind === 'o2') {
          const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, 8);
          g.addColorStop(0, SCIENCE.o2);
          g.addColorStop(1, 'rgba(246, 220, 143, 0)');
          c.fillStyle = g;
          c.beginPath(); c.arc(f.x, f.y, 8, 0, Math.PI * 2); c.fill();
        } else if (f.kind === 'drop') {
          c.fillStyle = SCIENCE.water;
          c.beginPath();
          c.moveTo(f.x, f.y - 5); c.quadraticCurveTo(f.x + 4, f.y + 1, f.x, f.y + 3); c.quadraticCurveTo(f.x - 4, f.y + 1, f.x, f.y - 5);
          c.fill();
        } else {
          c.strokeStyle = SCIENCE.water; c.lineWidth = 2;
          c.beginPath();
          c.moveTo(f.x, f.y);
          c.quadraticCurveTo(f.x + 6 * Math.sin(t * 6), f.y - 8, f.x, f.y - 16);
          c.stroke();
        }
      }
    }
    c.globalAlpha = 1;
  }

  private drawRain() {
    const { c, L } = this;
    c.strokeStyle = 'rgba(206, 228, 246, 0.55)';
    c.lineWidth = 1.4;
    const t = this.time;
    for (let i = 0; i < 90; i++) {
      const x = ((i * 97.3 + t * 60) % (L.W + 40)) - 20;
      const y = ((i * 53.7 + t * 700) % (L.H + 40)) - 20;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 5, y + 16); c.stroke();
    }
  }
}
