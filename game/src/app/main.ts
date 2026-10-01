/** Kasva! season: living menu, fixed-step play, Tikka's hints, results and a local test log. */
import { makeExpert } from '../core/bots';
import { DT, LIGHT_TICKS, clock, createSeason, result, step, type SeasonResult, type SeasonState } from '../core/season';
import { dailySeed, planWeather, type Weather } from '../core/weather';
import { Sound } from './audio';
import { Renderer } from './render';
import { iconSvg } from './scene/icons';
import { drawTikka } from './scene/tikka';
import { TEXT, WEATHER_EMOJI, type Lang } from './text';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const LOG_KEY = 'kasva-greybox-log';
const LANG_KEY = 'kasva-lang';
const SOUND_KEY = 'kasva-sound';

interface LogRow { at: string; seed: string; stored: number; caught: number; resp: number; combo: number; wilts: number }

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } }

let lang: Lang = load<Lang>(LANG_KEY, 'fi');
const t = () => TEXT[lang];

const canvas = $<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
renderer.hud.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sound = new Sound();
sound.muted = !load<boolean>(SOUND_KEY, true);

type Mode = 'menu' | 'play' | 'pause' | 'results';
let mode: Mode = 'menu';
let sim: SeasonState;
let menuSim!: SeasonState;
let menuBot = makeExpert();
let menuCount = 0;
let holding = false;
let acc = 0;
let shown = new Set<string>();
let lastResult: SeasonResult | null = null;
// a shared link like #s-d2026-10-02 opens that exact weather
let linkSeed: string | null = /^#s-([A-Za-z0-9._~-]{1,40})$/.exec(location.hash)?.[1] ?? null;

function newMenuSeason() {
  menuSim = createSeason('menu-' + menuCount++, ['sun', 'sun', 'sun', 'cloudy', 'sun', 'rain']);
  menuBot = makeExpert();
  // start the backdrop in the late morning, not at dawn
  for (let i = 0; i < 260; i++) step(menuSim, menuBot(menuSim));
}
newMenuSeason();
sim = menuSim;

// ---------- screens ----------

function show(id: 'start' | 'pause' | 'results' | null) {
  for (const s of ['start', 'pause', 'results']) $(s).hidden = s !== id;
  $('hud-btns').hidden = mode !== 'play';
}

function weatherRow(w: Weather[], today = -1) {
  return w.map((d, i) => `<span title="${t().weather[d]}" class="${i === today ? 'today' : ''}">${iconSvg(d, 26)}</span>`).join('');
}

function finnishDate(seed: string) {
  const m = /^d(\d{4})-(\d{2})-(\d{2})$/.exec(seed);
  return m ? `${Number(m[3])}.${Number(m[2])}.` : seed;
}

function renderText() {
  const x = t();
  document.documentElement.lang = lang;
  $('t-title').textContent = x.play;
  const seed = linkSeed ?? dailySeed();
  $('t-theme').textContent = x.theme(finnishDate(seed));
  $('daily-weather').innerHTML = weatherRow(planWeather(seed));
  $('btn-daily').textContent = x.play;
  $('btn-random').textContent = x.random;
  $('btn-radio').innerHTML = x.radio(!sound.muted);
  $('t-howto').innerHTML = x.howto.map((h, i) => `<span><i>${i + 1}</i>${h}</span>`).join('');
  $('t-keys').innerHTML = x.keys.map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`).join('');
  $('t-paused').textContent = x.paused;
  $('btn-resume').textContent = x.resume;
  $('t-log').textContent = x.log;
  $('t-r-stored').textContent = x.result.stored;
  $('t-r-caught').textContent = x.result.caught;
  $('t-r-resp').textContent = x.result.breathed;
  $('t-r-combo').textContent = x.result.combo;
  $('t-r-wilts').textContent = x.result.wilts;
  $('btn-again').textContent = x.result.again;
  $('btn-next').textContent = x.result.next;
  $('btn-copy').textContent = x.result.copy;
  $('btn-home').textContent = x.result.home;
  $('btn-mute').textContent = sound.muted ? '♪̸' : '♪';
  document.querySelectorAll<HTMLButtonElement>('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  renderer.hud.labels = { water: x.water, stored: x.stored, day: x.day, juhannus: x.juhannus };
  renderLog();
  if (lastResult) fillResults(lastResult, false);
}

function renderLog() {
  const rows = load<LogRow[]>(LOG_KEY, []);
  const x = t();
  $('log-body').innerHTML = rows.length
    ? `<p>${x.runs(rows.length)}</p><table><tr><th></th><th>g CO₂</th><th>×</th><th>💧</th></tr>${rows.slice(-10).reverse().map((r) =>
        `<tr><td>${new Date(r.at).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</td><td>${r.stored}</td><td>${r.combo}</td><td>${r.wilts}</td></tr>`).join('')}</table>
       <p><button type="button" class="btn ghost small" id="btn-clear-log">${x.logClear}</button></p>`
    : `<p>${x.logEmpty}</p>`;
}

// ---------- play ----------

function start(seed: string) {
  sim = createSeason(seed);
  mode = 'play';
  acc = 0;
  holding = false;
  shown = new Set();
  renderer.hud.shownScore = 0;
  renderer.hud.hint = null;
  show(null);
  if (load<LogRow[]>(LOG_KEY, []).length < 3) hint('start', 999);
  history.replaceState(null, '', '#s-' + seed);
}

function hint(key: keyof (typeof TEXT)['fi']['hints'], secs = 3.6) {
  const runs = load<LogRow[]>(LOG_KEY, []).length;
  const always = key === 'wilt' || key === 'heat' || key === 'juhannus';
  if (shown.has(key) || (runs >= 3 && !always)) return;
  shown.add(key);
  renderer.showHint(t().hints[key], secs);
  sound.drum();
}

function handleEvents() {
  for (const e of sim.events) {
    switch (e.type) {
      case 'catch':
        sound.pop(e.combo, e.gold);
        renderer.catchFx(e.x, e.y, e.g, e.gold);
        hint('firstCatch');
        if (e.gold) { hint('gold'); navigator.vibrate?.(30); }
        break;
      case 'bounce': sound.bounce(); break;
      case 'wilt':
        sound.wilt(); renderer.wiltFx(); navigator.vibrate?.(120);
        shown.delete('wilt'); hint('wilt');
        break;
      case 'dawn':
        if (e.day > 0) sound.dawn();
        if (e.weather === 'heat') { shown.delete('heat'); hint('heat'); }
        if (e.weather === 'rain') hint('rain');
        break;
      case 'dusk':
        if (e.day === 2) hint('juhannus', 4);
        else if (shown.has('dusk')) hint('night', 4);
        else hint('dusk', 4);
        break;
      case 'end': finish(); break;
    }
  }
  if (sim.open && sim.water < 25) hint('lowWater');
}

function finish() {
  mode = 'results';
  holding = false;
  sound.setBreathing(false);
  sound.end();
  const r = result(sim);
  const rows = load<LogRow[]>(LOG_KEY, []);
  const prevBest = rows.filter((x) => x.seed === r.seed).reduce((m, x) => Math.max(m, x.stored), -1);
  rows.push({ at: new Date().toISOString(), seed: r.seed, stored: r.storedG, caught: r.caughtG, resp: r.respiredG, combo: r.bestCombo, wilts: r.wilts });
  save(LOG_KEY, rows.slice(-200));
  lastResult = r;
  fillResults(r, prevBest >= 0 && r.storedG > prevBest);
  renderLog();
  show('results');
  countUp($('r-stored'), r.storedG);
  drawRing(rows.slice(-12).map((x) => x.stored));
}

function tikkaLine(r: SeasonResult) {
  const x = t().result.tikka;
  if (r.wilts >= 2) return x.wilts(r.wilts);
  if (r.openHeatSec > 6) return x.heat(r.openHeatSec);
  if (r.openNightSec > 4) return x.night(r.openNightSec);
  return x.resp(Math.round(r.nightRespShare * 100));
}

function fillResults(r: SeasonResult, newBest: boolean) {
  const fmt = (n: number) => n.toLocaleString('fi-FI');
  $('r-weather').innerHTML = weatherRow(r.weather);
  $('r-stored').textContent = fmt(r.storedG);
  $('r-caught').textContent = fmt(r.caughtG);
  $('r-resp').textContent = fmt(r.respiredG);
  $('r-combo').textContent = '×' + r.bestCombo;
  $('r-wilts').textContent = String(r.wilts);
  $('r-tikka').textContent = tikkaLine(r);
  const best = $('r-best');
  best.hidden = !newBest;
  best.textContent = t().result.best;
  const face = $<HTMLCanvasElement>('tikka-face').getContext('2d')!;
  face.clearRect(0, 0, 96, 96);
  drawTikka(face, 66, 92, 116, 0, 0);
}

/** The trunk's cross-section: one ring per season on this device, the newest drawn last. */
function drawRing(seasons: number[]) {
  const cv = $<HTMLCanvasElement>('ring');
  const c = cv.getContext('2d')!;
  const total = seasons.reduce((a, b) => a + Math.max(150, b), 0) + 800;
  const R = 140, cx = 150, cy = 150;
  const t0 = performance.now(), dur = renderer.hud.reducedMotion ? 1 : 900;
  const frame = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    c.clearRect(0, 0, 300, 300);
    c.fillStyle = '#efece3';
    c.beginPath(); c.arc(cx, cy, R + 6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2b2b2b'; c.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) { const a = i * 0.63; c.beginPath(); c.arc(cx, cy, R + 4, a, a + 0.12); c.stroke(); }
    let cum = total;
    for (let i = seasons.length - 1; i >= -1; i--) {
      const rad = R * Math.sqrt(cum / total);
      const newest = i === seasons.length - 1;
      c.fillStyle = newest ? '#f6d9a6' : i % 2 ? '#e9c88e' : '#e3bf82';
      c.beginPath();
      if (newest) { c.moveTo(cx, cy); c.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); c.closePath(); }
      else c.arc(cx, cy, rad, 0, Math.PI * 2);
      c.fill();
      if (i >= 0) { c.strokeStyle = '#a57a45'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.stroke(); }
      cum -= i >= 0 ? Math.max(150, seasons[i]) : 0;
      if (newest && p < 1) {
        // the inner rings show through until the new ring is finished
        const inner = R * Math.sqrt((total - Math.max(150, seasons[i])) / total);
        c.fillStyle = '#e3bf82';
        c.beginPath(); c.arc(cx, cy, inner, 0, Math.PI * 2); c.fill();
      }
    }
    c.fillStyle = '#7a5530';
    c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill();
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function countUp(el: HTMLElement, to: number) {
  if (renderer.hud.reducedMotion) { el.textContent = to.toLocaleString('fi-FI'); return; }
  const t0 = performance.now(), dur = 1100;
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('fi-FI');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function shareText(r: SeasonResult) {
  const label = r.seed.startsWith('d') ? t().theme(finnishDate(r.seed)) : t().random;
  return `Kasva! · ${label}\n🌳 ${r.storedG.toLocaleString('fi-FI')} g CO₂ · ×${r.bestCombo}\n${r.weather.map((w) => WEATHER_EMOJI[w]).join('')}`;
}

async function copyResult() {
  if (!lastResult) return;
  const text = shareText(lastResult);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  $('btn-copy').textContent = t().result.copied;
  setTimeout(() => ($('btn-copy').textContent = t().result.copy), 1500);
}

function pause(on: boolean) {
  if (on && mode === 'play') { mode = 'pause'; holding = false; sound.setBreathing(false); show('pause'); }
  else if (!on && mode === 'pause') { mode = 'play'; show(null); }
}

function toMenu() {
  mode = 'menu';
  sim = menuSim;
  history.replaceState(null, '', location.pathname + location.search);
  show('start');
}

function toggleMute() {
  sound.setMuted(!sound.muted);
  save(SOUND_KEY, !sound.muted);
  renderText();
}

// ---------- input ----------

function press(down: boolean) {
  if (mode !== 'play') return;
  holding = down;
  if (down && shown.has('start') && renderer.hud.hint?.total === 999) renderer.hud.hint = null;
}

canvas.addEventListener('pointerdown', (e) => { sound.unlock(); canvas.setPointerCapture(e.pointerId); press(true); });
canvas.addEventListener('pointerup', () => press(false));
canvas.addEventListener('pointercancel', () => press(false));
canvas.addEventListener('lostpointercapture', () => press(false));
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); sound.unlock(); if (!e.repeat) press(true); }
  if (e.code === 'KeyP') pause(mode === 'play');
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') press(false); });
window.addEventListener('blur', () => { press(false); pause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
window.addEventListener('resize', () => renderer.resize());

document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  sound.unlock();
  if (b.dataset.lang) { lang = b.dataset.lang as Lang; save(LANG_KEY, lang); renderText(); return; }
  switch (b.id) {
    case 'btn-daily': start(linkSeed ?? dailySeed()); linkSeed = null; break;
    case 'btn-random': case 'btn-next': start('r' + Math.random().toString(36).slice(2, 8)); break;
    case 'btn-again': start(sim.seed); break;
    case 'btn-home': toMenu(); break;
    case 'btn-pause': pause(true); break;
    case 'btn-resume': pause(false); break;
    case 'btn-mute': case 'btn-radio': toggleMute(); break;
    case 'btn-copy': void copyResult(); break;
    case 'btn-clear-log': save(LOG_KEY, []); renderLog(); break;
  }
});

// ---------- loop ----------

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'play') {
    acc += dt;
    while (acc >= DT && mode === 'play') {
      step(sim, holding);
      handleEvents();
      acc -= DT;
    }
  } else if (mode === 'menu' || mode === 'results') {
    // the forest keeps living behind the menu: a quiet expert plays it
    acc += dt;
    while (acc >= DT) {
      step(menuSim, menuBot(menuSim));
      acc -= DT;
      if (menuSim.done) newMenuSeason();
    }
    if (mode === 'menu') sim = menuSim;
  }
  const k = clock(sim);
  sound.setBreathing(mode === 'play' && sim.open, k.weather === 'heat');
  sound.update({
    playing: mode === 'play', isNight: k.isNight, midsummer: k.juhannus,
    dusk: !k.isNight && k.phase > LIGHT_TICKS - 120, weather: k.weather,
  });
  renderer.draw(sim, mode === 'pause' ? 0 : dt, mode === 'play' || mode === 'pause');
  requestAnimationFrame(frame);
}

renderText();
show('start');
// canvas text needs the web fonts; redraw labels once they arrive
void document.fonts?.load('800 40px "Bricolage Grotesque"');
void document.fonts?.load('700 24px Caveat');
requestAnimationFrame(frame);

// Test hook for screenshots: open with #dbg, then window.__kasva.skip(ticks, hold).
if (location.hash === '#dbg') {
  (window as unknown as { __kasva: unknown }).__kasva = {
    skip(ticks: number, hold = false) { for (let i = 0; i < ticks && !sim.done; i++) { step(sim, hold); if (sim.done) finish(); } },
    state: () => ({ tick: sim.tick, water: sim.water, mode }),
  };
}
