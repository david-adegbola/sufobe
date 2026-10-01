/** Grey-box season: input, fixed-step loop, hints, results and a local test log. */
import { DT, createSeason, result, step, type SeasonResult, type SeasonState } from '../core/season';
import { dailySeed, planWeather, type Weather } from '../core/weather';
import { Sound } from './audio';
import { Renderer } from './render';
import { TEXT, WEATHER_ICON, type Lang } from './text';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const LOG_KEY = 'kasva-greybox-log';
const LANG_KEY = 'kasva-greybox-lang';

interface LogRow { at: string; seed: string; stored: number; caught: number; resp: number; combo: number; wilts: number }

function store<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } }

let lang: Lang = store<Lang>(LANG_KEY, 'fi');
const t = () => TEXT[lang];

const canvas = $<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
renderer.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sound = new Sound();

let sim: SeasonState = createSeason('idle');
let mode: 'menu' | 'play' | 'pause' | 'results' = 'menu';
let holding = false;
let acc = 0;
let shown = new Set<string>();
let everHeld = false;
let lastResult: SeasonResult | null = null;
// a shared link like #s-d2026-10-02 opens that exact weather
let linkSeed: string | null = /^#s-([A-Za-z0-9._~-]{1,40})$/.exec(location.hash)?.[1] ?? null;

// ---------- screens ----------

function show(id: 'start' | 'pause' | 'results' | null) {
  for (const s of ['start', 'pause', 'results']) $(s).hidden = s !== id;
  $('hud-btns').hidden = mode !== 'play';
}

function weatherRow(w: Weather[]) {
  return w.map((d) => `<span title="${t().weather[d]}">${WEATHER_ICON[d]}</span>`).join('');
}

function renderText() {
  const x = t();
  document.documentElement.lang = lang;
  $('t-title').textContent = x.title;
  $('t-tagline').textContent = x.tagline;
  $('btn-daily').textContent = x.daily;
  $('btn-random').textContent = x.random;
  $('t-howto').innerHTML = x.howto.map((h, i) => `<span><b>${i + 1}</b>${h}</span>`).join('');
  $('t-keys').textContent = x.keys;
  $('t-paused').textContent = x.paused;
  $('btn-resume').textContent = x.resume;
  $('t-log').textContent = x.log;
  $('daily-weather').innerHTML = weatherRow(planWeather(dailySeed()));
  $('t-r-stored').textContent = x.result.stored;
  $('t-r-caught').textContent = x.result.caught;
  $('t-r-resp').textContent = x.result.breathed;
  $('t-r-combo').textContent = x.result.combo;
  $('t-r-wilts').textContent = x.result.wilts;
  $('btn-again').textContent = x.result.again;
  $('btn-next').textContent = x.result.next;
  $('btn-copy').textContent = x.result.copy;
  document.querySelectorAll<HTMLButtonElement>('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  renderer.labels = { water: x.water, stored: x.stored, day: x.day, juhannus: x.juhannus };
  renderLog();
  if (lastResult) fillResults(lastResult, false);
}

function renderLog() {
  const rows = store<LogRow[]>(LOG_KEY, []);
  const x = t();
  $('log-body').innerHTML = rows.length
    ? `<p class="muted">${x.runs(rows.length)}</p><table><tr><th>🕒</th><th>g</th><th>×</th><th>💧</th></tr>${rows.slice(-12).reverse().map((r) =>
        `<tr><td>${new Date(r.at).toLocaleTimeString(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</td><td>${r.stored}</td><td>${r.combo}</td><td>${r.wilts}</td></tr>`).join('')}</table>
       <button type="button" class="btn ghost" id="btn-clear-log" style="font-size:0.8rem;padding:8px 14px;margin-top:8px">${x.logClear}</button>`
    : `<p class="muted">${x.logEmpty}</p>`;
}

// ---------- play ----------

function start(seed: string) {
  sim = createSeason(seed);
  mode = 'play';
  acc = 0;
  holding = false;
  shown = new Set();
  everHeld = false;
  show(null);
  const runs = store<LogRow[]>(LOG_KEY, []).length;
  if (runs < 3) hint('start', 999);
  location.hash = 's-' + seed;
}

function hint(key: keyof (typeof TEXT)['fi']['hints'], secs = 3.2) {
  const runs = store<LogRow[]>(LOG_KEY, []).length;
  const always = key === 'wilt' || key === 'heat' || key === 'juhannus';
  if (shown.has(key) || (runs >= 3 && !always)) return;
  shown.add(key);
  renderer.hint = { text: t().hints[key], t: secs };
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
  const rows = store<LogRow[]>(LOG_KEY, []);
  const prevBest = rows.filter((x) => x.seed === r.seed).reduce((m, x) => Math.max(m, x.stored), -1);
  rows.push({ at: new Date().toISOString(), seed: r.seed, stored: r.storedG, caught: r.caughtG, resp: r.respiredG, combo: r.bestCombo, wilts: r.wilts });
  save(LOG_KEY, rows.slice(-200));
  lastResult = r;
  fillResults(r, prevBest >= 0 && r.storedG > prevBest);
  renderLog();
  show('results');
  countUp($('r-stored'), r.storedG);
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
}

function countUp(el: HTMLElement, to: number) {
  if (renderer.reducedMotion) { el.textContent = to.toLocaleString('fi-FI'); return; }
  const t0 = performance.now(), dur = 900;
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('fi-FI');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function shareText(r: SeasonResult) {
  const label = r.seed.startsWith('d') ? `${t().daily} ${r.seed.slice(1)}` : t().random;
  return `Kasva! · ${label}\n🌳 ${r.storedG.toLocaleString('fi-FI')} g CO₂ · ×${r.bestCombo}\n${r.weather.map((w) => WEATHER_ICON[w]).join('')}`;
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

// ---------- input ----------

function press(down: boolean) {
  if (mode !== 'play') return;
  holding = down;
  if (down && !everHeld) { everHeld = true; if (renderer.hint && shown.has('start')) renderer.hint = null; }
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

function toggleMute() {
  sound.muted = !sound.muted;
  $('btn-mute').textContent = sound.muted ? '🔇' : '🔊';
  sound.setBreathing(holding && !sound.muted);
}

document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  sound.unlock();
  if (b.dataset.lang) { lang = b.dataset.lang as Lang; save(LANG_KEY, lang); renderText(); return; }
  switch (b.id) {
    case 'btn-daily': start(linkSeed ?? dailySeed()); linkSeed = null; break;
    case 'btn-random': case 'btn-next': start('r' + Math.random().toString(36).slice(2, 8)); break;
    case 'btn-again': start(sim.seed); break;
    case 'btn-pause': pause(true); break;
    case 'btn-resume': pause(false); break;
    case 'btn-mute': toggleMute(); break;
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
    sound.setBreathing(sim.open);
  }
  renderer.draw(sim, mode === 'play' ? dt : 0);
  requestAnimationFrame(frame);
}

renderText();
show('start');
requestAnimationFrame(frame);
