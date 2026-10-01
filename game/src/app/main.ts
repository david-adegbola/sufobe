/**
 * Kasva! shell: the living forest menu, play, Tikka's hints, results with
 * progression (XP, ranks, badges, growth choice), level-ups and the card
 * collection. Progress is saved in this browser only.
 */
import { makeExpert } from '../core/bots';
import {
  ACHIEVEMENTS, MAX_GROWTH, RANKS, STORY, applySeason, choose, growthMods, migrate, rankIndex, rankProgress,
  type Growth, type Save, type SeasonMode, type SeasonOutcome,
} from '../core/progress';
import { DT, LIGHT_TICKS, STANDARD_TREE, clock, createSeason, result, step, type SeasonResult, type SeasonState } from '../core/season';
import { dailySeed, planWeather, type Weather } from '../core/weather';
import { Sound } from './audio';
import { Renderer } from './render';
import { iconSvg } from './scene/icons';
import { drawTikka } from './scene/tikka';
import { TEXT, WEATHER_EMOJI, type Lang } from './text';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const LOG_KEY = 'kasva-greybox-log';
const SAVE_KEY = 'kasva-save';
const LANG_KEY = 'kasva-lang';
const SOUND_KEY = 'kasva-sound';

interface LogRow { at: string; seed: string; stored: number; caught: number; resp: number; combo: number; wilts: number }

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function store(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } }

let lang: Lang = load<Lang>(LANG_KEY, 'fi');
const t = () => TEXT[lang];
let save: Save = migrate(load<unknown>(SAVE_KEY, null));
const persist = () => store(SAVE_KEY, save);
const today = () => dailySeed().slice(1);

const canvas = $<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
renderer.hud.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
renderer.setRank(rankIndex(save.co2LifetimeG));
const sound = new Sound();
sound.muted = !load<boolean>(SOUND_KEY, true);

type Mode = 'menu' | 'play' | 'pause' | 'results';
interface SeasonConfig { mode: SeasonMode; seed: string; weather?: Weather[] }
let mode: Mode = 'menu';
let current: SeasonConfig = { mode: 'free', seed: 'menu' };
let sim: SeasonState;
let menuSim!: SeasonState;
let menuBot = makeExpert();
let menuCount = 0;
let holding = false;
let acc = 0;
let shown = new Set<string>();
let lastResult: SeasonResult | null = null;
let lastOutcome: SeasonOutcome | null = null;
let picked: Growth | null = null;
// a shared link like #s-d2026-10-02 opens that exact weather
let linkSeed: string | null = /^#s-([A-Za-z0-9._~-]{1,40})$/.exec(location.hash)?.[1] ?? null;

function newMenuSeason() {
  menuSim = createSeason('menu-' + menuCount++, ['sun', 'sun', 'sun', 'cloudy', 'sun', 'rain']);
  menuBot = makeExpert();
  for (let i = 0; i < 260; i++) step(menuSim, menuBot(menuSim)); // late morning, not dawn
}
newMenuSeason();
sim = menuSim;

/** The big button plays the next story season, then your own tree in new weather. */
function nextSeason(): SeasonConfig {
  if (save.storyIndex < STORY.length) return { mode: 'story', seed: 'story-' + (save.storyIndex + 1), weather: STORY[save.storyIndex] };
  return { mode: 'free', seed: 'r' + Math.random().toString(36).slice(2, 8) };
}
const dailyConfig = (): SeasonConfig => ({ mode: 'daily', seed: linkSeed ?? dailySeed() });

// ---------- screens ----------

const SCREENS = ['start', 'pause', 'results', 'levelup', 'cards'] as const;
type Screen = (typeof SCREENS)[number];
function show(id: Screen | null) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  $('hud-btns').hidden = mode !== 'play';
}

function weatherRow(w: Weather[]) {
  return w.map((d) => `<span title="${t().weather[d]}">${iconSvg(d, 26)}</span>`).join('');
}

function finnishDate(seed: string) {
  const m = /^d(\d{4})-(\d{2})-(\d{2})$/.exec(seed);
  return m ? `${Number(m[3])}.${Number(m[2])}.` : seed;
}

function face(cv: HTMLCanvasElement | null) {
  if (!cv) return;
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, cv.width, cv.height);
  const k = cv.width / 96;
  drawTikka(c, 66 * k, 92 * k, 116 * k, 0, 0);
}

function ringIcon(fraction: number) {
  const r = 8, len = 2 * Math.PI * r;
  return `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="${r}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="3"/>` +
    `<circle cx="11" cy="11" r="${r}" fill="none" stroke="#ffc83d" stroke-width="3" stroke-linecap="round" stroke-dasharray="${len * fraction} ${len}" transform="rotate(-90 11 11)"/></svg>`;
}

function renderHome() {
  const x = t();
  const rp = rankProgress(save.co2LifetimeG);
  $('rank-chip').innerHTML = ringIcon(rp.fraction) + x.rankChip(x.ranks[RANKS[rp.index].id].name, save.co2LifetimeG / 1000);
  const st = save.streak;
  const chip = $('streak-chip');
  chip.hidden = st.days === 0;
  chip.textContent = '☀ ' + x.streak(st.days);
  chip.classList.toggle('cover', st.snowCovers > 0);
  chip.title = st.snowCovers > 0 ? x.snowCover : '';
  const next = nextSeason();
  const daily = dailyConfig();
  if (next.mode === 'story') {
    $('t-theme').textContent = x.story(save.storyIndex + 1, STORY.length);
    $('daily-weather').innerHTML = weatherRow(next.weather!);
    $('home-bubble').querySelector('span')!.textContent = x.storyIntro[save.storyIndex];
  } else {
    $('t-theme').textContent = x.theme(finnishDate(daily.seed));
    $('daily-weather').innerHTML = weatherRow(planWeather(daily.seed));
    $('home-bubble').querySelector('span')!.textContent = x.homeFree;
  }
  face($('home-bubble').querySelector('canvas'));
}

function renderText() {
  const x = t();
  document.documentElement.lang = lang;
  $('t-title').textContent = x.play;
  $('btn-play').textContent = x.play;
  $('btn-daily').textContent = x.daily;
  $('btn-cards').textContent = x.cards;
  $('btn-radio').innerHTML = sound.muted ? '♪̸' : '♪';
  $('btn-radio').setAttribute('aria-label', x.radio(!sound.muted).replace(/<[^>]+>/g, ''));
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
  $('btn-next').textContent = x.nextSeason;
  $('btn-copy').textContent = x.result.copy;
  $('btn-home').textContent = x.result.home;
  $('t-newbadges').textContent = x.newBadges;
  $('t-levelup').textContent = x.levelUp;
  $('btn-lu-continue').textContent = x.continue;
  $('t-cards').textContent = x.cardsTitle;
  $('btn-cards-close').textContent = x.close;
  $('btn-mute').textContent = sound.muted ? '♪̸' : '♪';
  document.querySelectorAll<HTMLButtonElement>('.lang button[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  renderer.hud.labels = { water: x.water, stored: x.stored, day: x.day, juhannus: x.juhannus };
  renderHome();
  renderLog();
  if (lastResult && lastOutcome) fillResults(lastResult, lastOutcome, false);
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

function start(cfg: SeasonConfig) {
  current = cfg;
  const mods = cfg.mode === 'daily' ? STANDARD_TREE : growthMods(save.growth);
  sim = createSeason(cfg.seed, cfg.weather, mods);
  mode = 'play';
  acc = 0;
  holding = false;
  shown = new Set();
  picked = null;
  renderer.hud.shownScore = 0;
  renderer.hud.hint = null;
  show(null);
  if (save.seasons < 3) hint('start', 999);
  history.replaceState(null, '', cfg.mode === 'daily' ? '#s-' + cfg.seed : location.pathname + location.search);
}

function hint(key: keyof (typeof TEXT)['fi']['hints'], secs = 3.6) {
  const always = key === 'wilt' || key === 'heat' || key === 'juhannus';
  if (shown.has(key) || (save.seasons >= 3 && !always)) return;
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
  if (sim.open && sim.water < 25 * sim.mods.waterMax) hint('lowWater');
}

function finish() {
  mode = 'results';
  holding = false;
  sound.setBreathing(false);
  sound.end();
  const r = result(sim);
  const before = save.co2LifetimeG;
  const outcome = applySeason(save, r, current.mode, today());
  save = outcome.save;
  persist();
  const rows = load<LogRow[]>(LOG_KEY, []);
  rows.push({ at: new Date().toISOString(), seed: r.seed, stored: r.storedG, caught: r.caughtG, resp: r.respiredG, combo: r.bestCombo, wilts: r.wilts });
  store(LOG_KEY, rows.slice(-200));
  lastResult = r;
  lastOutcome = outcome;
  fillResults(r, outcome, true, before);
  renderLog();
  renderHome();
  show('results');
  countUp($('r-stored'), r.storedG);
  drawRing(save.rings.slice(-12).map((x) => x.g));
  if (outcome.newAchievements.length) setTimeout(() => sound.badge(), 900);
  if (outcome.rankAfter > outcome.rankBefore) {
    setTimeout(() => showLevelUp(outcome.rankAfter), 1700);
  }
}

function tikkaLine(r: SeasonResult) {
  const x = t().result.tikka;
  if (r.wilts >= 2) return x.wilts(r.wilts);
  if (r.openHeatSec > 6) return x.heat(r.openHeatSec);
  if (r.openNightSec > 4) return x.night(r.openNightSec);
  return x.resp(Math.round(r.nightRespShare * 100));
}

function leafBadge(id: string, unlocked = true, label = false) {
  const a = (t().achievements as Record<string, { name: string }>)[id];
  const leaf = `<button type="button" class="leaf${unlocked ? '' : ' locked'}" data-badge="${id}" aria-label="${a.name}"><span>${unlocked ? '✦' : '?'}</span></button>`;
  return label ? `<div class="badge-item">${leaf}<span>${unlocked ? a.name : ''}</span></div>` : leaf;
}

function fillResults(r: SeasonResult, o: SeasonOutcome, animate: boolean, beforeG = save.co2LifetimeG) {
  const x = t();
  const fmt = (n: number) => n.toLocaleString('fi-FI');
  $('r-weather').innerHTML = weatherRow(r.weather);
  $('r-stored').textContent = fmt(r.storedG);
  $('r-caught').textContent = fmt(r.caughtG);
  $('r-resp').textContent = fmt(r.respiredG);
  $('r-combo').textContent = '×' + r.bestCombo;
  $('r-wilts').textContent = String(r.wilts);
  $('r-tikka').textContent = tikkaLine(r);
  const best = $('r-best');
  best.hidden = !o.newBest;
  best.textContent = x.result.best;
  face($<HTMLCanvasElement>('tikka-face'));

  // XP bar fills from where it was to where it is now (to the end on a rank-up)
  const after = rankProgress(save.co2LifetimeG);
  const beforeP = rankProgress(beforeG);
  $('r-rank').textContent = x.ranks[RANKS[after.index].id].name;
  $('r-xp').textContent = x.xp(save.co2LifetimeG / 1000, after.next);
  const bar = $('r-xpbar');
  if (animate) {
    bar.style.transition = 'none';
    bar.style.width = (o.rankAfter > o.rankBefore ? 0 : beforeP.fraction * 100) + '%';
    void bar.offsetWidth;
    bar.style.transition = '';
  }
  requestAnimationFrame(() => (bar.style.width = after.fraction * 100 + '%'));

  const newOnes = o.newAchievements;
  $('r-badges-wrap').hidden = newOnes.length === 0;
  $('r-badges').innerHTML = newOnes.map((id) => leafBadge(id, true, true)).join('');
  renderGrow();
}

function renderGrow() {
  const x = t();
  const el = $('r-grow');
  if (current.mode === 'daily') { el.innerHTML = `<p class="note">${x.growDaily}</p>`; return; }
  const cards = (['roots', 'leaves', 'wood'] as Growth[]).map((g) => {
    const lvl = save.growth[g];
    const full = lvl >= MAX_GROWTH;
    const dots = '●'.repeat(lvl) + '○'.repeat(MAX_GROWTH - lvl);
    return `<button type="button" class="gcard${picked === g ? ' picked' : ''}" data-grow="${g}"${picked || full ? ' disabled' : ''}>` +
      `<b>${x.growth[g].name}</b><span class="dots">${dots}</span><span>${x.growth[g].effect}</span></button>`;
  }).join('');
  el.innerHTML = `<h3>${picked ? x.chosen(x.growth[picked].name, save.growth[picked]) : x.growTitle}</h3><div class="cards3">${cards}</div>`;
}

function pickGrowth(g: Growth) {
  if (picked || current.mode === 'daily') return;
  const out = choose(save, g);
  save = out.save;
  picked = g;
  persist();
  sound.pop(3, false);
  renderGrow();
  if (out.newAchievements.length) {
    $('r-badges-wrap').hidden = false;
    $('r-badges').insertAdjacentHTML('beforeend', out.newAchievements.map((id) => leafBadge(id, true, true)).join(''));
    sound.badge();
  }
}

function showLevelUp(rank: number) {
  const x = t();
  const r = x.ranks[RANKS[rank].id];
  $('lu-rank').textContent = r.name;
  $('lu-desc').textContent = r.desc;
  $('lu-tikka').textContent = x.levelUpTikka;
  face($<HTMLCanvasElement>('lu-face'));
  renderer.setRank(rank);
  sound.levelUp();
  show('levelup');
}

function renderCards(selected?: string) {
  const x = t();
  const all = x.achievements as Record<string, { name: string; how: string; fact: string }>;
  $('cardgrid').innerHTML = ACHIEVEMENTS.map((a) => {
    const on = save.achievements.includes(a.id);
    return leafBadge(a.id, on, true);
  }).join('');
  const fact = $('fact');
  if (!selected) { fact.hidden = true; return; }
  const a = all[selected];
  const on = save.achievements.includes(selected);
  fact.hidden = false;
  fact.innerHTML = `<h3>${a.name}</h3><p><b>${a.how}</b></p><p>${on ? a.fact : x.locked}</p>`;
}

/** The trunk's cross-section: one ring per season, the newest drawn last. */
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
  const label = r.seed.startsWith('d') ? t().theme(finnishDate(r.seed)) : r.seed.startsWith('story') ? t().story(Number(r.seed.slice(6)), STORY.length) : t().random;
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
  renderHome();
  show('start');
}

function toggleMute() {
  sound.setMuted(!sound.muted);
  store(SOUND_KEY, !sound.muted);
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
  if (b.dataset.lang) { lang = b.dataset.lang as Lang; store(LANG_KEY, lang); renderText(); return; }
  if (b.dataset.grow) { pickGrowth(b.dataset.grow as Growth); return; }
  if (b.dataset.badge) { show('cards'); renderCards(b.dataset.badge); return; }
  switch (b.id) {
    case 'btn-play': case 'btn-next': start(nextSeason()); break;
    case 'btn-daily': start(dailyConfig()); linkSeed = null; break;
    case 'btn-again': start({ ...current }); break;
    case 'btn-home': case 'btn-cards-close': toMenu(); break;
    case 'btn-cards': show('cards'); renderCards(); break;
    case 'btn-lu-continue': show('results'); break;
    case 'btn-pause': pause(true); break;
    case 'btn-resume': pause(false); break;
    case 'btn-mute': case 'btn-radio': toggleMute(); break;
    case 'btn-copy': void copyResult(); break;
    case 'btn-clear-log': store(LOG_KEY, []); renderLog(); break;
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
  const wide = innerWidth >= 900 && innerWidth / innerHeight >= 1.2;
  renderer.setFocus(mode === 'menu' && !$('start').hidden && wide ? 0.68 : 0.5, dt);
  renderer.draw(sim, mode === 'pause' ? 0 : dt, mode === 'play' || mode === 'pause');
  requestAnimationFrame(frame);
}

renderText();
show('start');
void document.fonts?.load('800 40px "Bricolage Grotesque"');
void document.fonts?.load('700 24px Caveat').then(() => renderHome());
requestAnimationFrame(frame);

// Test hook for screenshots: open with #dbg, then window.__kasva.skip(ticks, hold).
if (location.hash === '#dbg') {
  linkSeed = null;
  (window as unknown as { __kasva: unknown }).__kasva = {
    skip(ticks: number, hold = false) { for (let i = 0; i < ticks && !sim.done; i++) { step(sim, hold); if (sim.done) finish(); } },
    state: () => ({ tick: sim.tick, water: sim.water, mode, save }),
    setSave(s: unknown) { save = migrate(s); persist(); renderer.setRank(rankIndex(save.co2LifetimeG)); renderText(); },
  };
}
