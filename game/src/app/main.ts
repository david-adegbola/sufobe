/**
 * Kasva! shell: the living forest menu, play, Tikka's hints, results with
 * progression (XP, ranks, badges, growth choice), level-ups and the card
 * collection. Progress is saved in this browser only.
 */
import './fonts.css';
import { makeExpert } from '../core/bots';
import {
  ACHIEVEMENTS, MAX_GROWTH, RANKS, STORY, applySeason, challengePlayed, challengeSent, choose, growthMods, migrate, rankIndex, rankProgress,
  type Growth, type Save, type SeasonMode, type SeasonOutcome,
} from '../core/progress';
import { DT, LIGHT_TICKS, STANDARD_TREE, clock, createSeason, result, step, type SeasonResult, type SeasonState } from '../core/season';
import { decodeChallenge, encodeChallenge, nickParts, randomNick, type Challenge } from '../core/share';
import { dailySeed, planWeather, type Weather } from '../core/weather';
import { Sound } from './audio';
import { Metsani } from './forest/metsani';
import { FOREST_TEXT } from './forest/text';
import { ABOUT_UI, aboutSections } from './legal';
import { renderPoster } from './poster';
import { Renderer } from './render';
import { iconSvg } from './scene/icons';
import { drawTikka } from './scene/tikka';
import { TEXT, WEATHER_EMOJI, type Lang } from './text';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const LOG_KEY = 'kasva-greybox-log';
const SAVE_KEY = 'kasva-save';
const LANG_KEY = 'kasva-lang';
const SOUND_KEY = 'kasva-sound';
const TESTLOG_KEY = 'kasva-testlog';

interface LogRow { at: string; seed: string; stored: number; caught: number; resp: number; combo: number; wilts: number }

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function store(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } }

let lang: Lang = load<Lang>(LANG_KEY, 'fi');
const t = () => TEXT[lang];
let save: Save = migrate(load<unknown>(SAVE_KEY, null));
// the playtest log is for teachers and researchers: off unless switched on
let testLogOn = load<boolean>(TESTLOG_KEY, false);
const ui = () => ABOUT_UI[lang];
const persist = () => store(SAVE_KEY, save);
const today = () => dailySeed().slice(1);

const canvas = $<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
renderer.hud.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
renderer.setRank(rankIndex(save.co2LifetimeG));
const sound = new Sound();
sound.muted = !load<boolean>(SOUND_KEY, true);

// Metsäni: the forest mode lives in its own module and canvas
const metsani = new Metsani({
  lang: () => lang,
  announce: (s) => announce(s),
  exit: () => { canvas.hidden = false; toMenu(); },
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});
function openMetsani() {
  show(null, false);
  canvas.hidden = true;
  metsani.enter();
}

type Mode = 'menu' | 'play' | 'pause' | 'results';
interface SeasonConfig { mode: SeasonMode; seed: string; weather?: Weather[]; from?: Challenge }
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
// a challenge link like #c-3a-2840-d2026-10-02 opens the challenge card
const linkChallenge: Challenge | null = decodeChallenge(location.hash);
let challengeOutcome: { won: boolean; from: Challenge; mine: number } | null = null;
let posterUrl: string | null = null;
let posterBlob: Blob | null = null;

function nickName(code: string) {
  const p = nickParts(code) ?? [0, 0];
  return `${t().adjectives[p[0]]} ${t().animals[p[1]]}`;
}

/** Where shared links point: the published page if the build says so, else this page. */
function shareBase(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="kasva-share-url"]')?.content;
  if (meta) return meta;
  return /^https?:/.test(location.protocol) ? location.origin + location.pathname : '';
}

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

const SCREENS = ['start', 'pause', 'results', 'levelup', 'cards', 'share', 'kisat', 'challenge', 'about'] as const;
type Screen = (typeof SCREENS)[number];
let visible: Screen | null = null;
/** Show one screen. Moving focus into it keeps keyboard and screen-reader users in step. */
function show(id: Screen | null, focus = true) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  $('hud-btns').hidden = mode !== 'play';
  const changed = id !== visible;
  visible = id;
  if (id && focus && changed) {
    const el = $(id).querySelector<HTMLElement>('[tabindex="-1"], button:not([disabled])');
    requestAnimationFrame(() => el?.focus({ preventScroll: false }));
  }
  if (!id) canvas.focus({ preventScroll: true });
}

/** Read short updates to screen readers (the canvas itself is silent). */
function announce(text: string) {
  const sr = $('sr');
  sr.textContent = '';
  requestAnimationFrame(() => (sr.textContent = text));
}

function weatherRow(w: Weather[]) {
  const names = w.map((d) => t().weather[d]).join(', ');
  return `<span role="img" aria-label="${ui().weather}: ${names}" style="display:contents">${w.map((d) => `<span title="${t().weather[d]}">${iconSvg(d, 26)}</span>`).join('')}</span>`;
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
  $('btn-metsani').textContent = FOREST_TEXT[lang].homeButton;
  if (metsani.active) metsani.rerender();
  $('btn-radio').innerHTML = sound.muted ? '♪̸' : '♪';
  $('btn-radio').setAttribute('aria-label', ui().sound);
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
  $('btn-home').textContent = x.result.home;
  $('t-newbadges').textContent = x.newBadges;
  $('t-levelup').textContent = x.levelUp;
  $('btn-lu-continue').textContent = x.continue;
  $('t-cards').textContent = x.cardsTitle;
  $('btn-cards-close').textContent = x.close;
  $('btn-kisat').textContent = x.kisat;
  $('btn-share').textContent = x.share;
  $('t-share').textContent = x.shareTitle;
  $('btn-share-image').textContent = x.shareImage;
  $('btn-copy').textContent = x.copyText;
  $('btn-copy-challenge').textContent = x.copyChallenge;
  $('t-savehint').textContent = x.saveHint;
  $('btn-share-close').textContent = x.close;
  $('t-kisat').textContent = x.kisat;
  $('t-you').textContent = x.you;
  $('btn-reroll').textContent = x.reroll;
  $('t-nicknote').textContent = x.nickNote;
  $('t-today').textContent = x.todayTitle;
  $('btn-k-daily').textContent = x.play;
  $('btn-k-challenge').textContent = x.challengeFriend;
  $('t-received').textContent = x.received;
  $('t-sent').textContent = x.sent;
  $('btn-kisat-close').textContent = x.close;
  $('btn-take').textContent = x.takeChallenge;
  $('btn-c-home').textContent = x.result.home;
  if (!$('kisat').hidden) renderKisat();
  if (!$('challenge').hidden && linkChallenge) renderChallenge(linkChallenge);
  $('btn-mute').textContent = sound.muted ? '♪̸' : '♪';
  $('btn-mute').setAttribute('aria-label', ui().sound);
  $('btn-mute').setAttribute('aria-pressed', String(!sound.muted));
  $('btn-radio').setAttribute('aria-pressed', String(!sound.muted));
  $('btn-pause').setAttribute('aria-label', ui().pause);
  canvas.setAttribute('aria-label', ui().canvas);
  $('btn-about').textContent = ui().about;
  renderAbout();
  document.querySelectorAll<HTMLButtonElement>('.lang button[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  renderer.hud.labels = { water: x.water, stored: x.stored, day: x.day, juhannus: x.juhannus };
  renderHome();
  renderLog();
  if (lastResult && lastOutcome) fillResults(lastResult, lastOutcome, false);
}

function renderLog() {
  $('log').hidden = !testLogOn;
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
  challengeOutcome = null;
  if (posterUrl) { URL.revokeObjectURL(posterUrl); posterUrl = null; posterBlob = null; }
  renderer.hud.shownScore = 0;
  renderer.hud.hint = null;
  show(null);
  if (save.seasons < 3) hint('start', 999);
  history.replaceState(null, '', cfg.from ? '#' + encodeChallenge(cfg.from) : cfg.mode === 'daily' ? '#s-' + cfg.seed : location.pathname + location.search);
}

function hint(key: keyof (typeof TEXT)['fi']['hints'], secs = 3.6) {
  const always = key === 'wilt' || key === 'heat' || key === 'juhannus';
  if (shown.has(key) || (save.seasons >= 3 && !always)) return;
  shown.add(key);
  renderer.showHint(t().hints[key], secs);
  announce(t().hints[key]);
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
        announce(ui().dayStart(e.day + 1, t().weather[e.weather]));
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
  if (current.from) {
    const c = challengePlayed(save, current.from, r.storedG, new Date().toISOString());
    save = c.save;
    outcome.newAchievements.push(...c.newAchievements);
    challengeOutcome = { won: c.won, from: current.from, mine: Math.max(r.storedG, save.challenges.received[0]?.myBestG ?? 0) };
  }
  persist();
  if (testLogOn) {
    const rows = load<LogRow[]>(LOG_KEY, []);
    rows.push({ at: new Date().toISOString(), seed: r.seed, stored: r.storedG, caught: r.caughtG, resp: r.respiredG, combo: r.bestCombo, wilts: r.wilts });
    store(LOG_KEY, rows.slice(-200));
  }
  announce(ui().seasonEnd(r.storedG.toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-GB')));
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
  const leaf = `<button type="button" class="leaf${unlocked ? '' : ' locked'}" data-badge="${id}" aria-label="${unlocked ? a.name : ui().lockedBadge}"><span aria-hidden="true">${unlocked ? '✦' : '?'}</span></button>`;
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
  const banner = $('r-challenge');
  banner.hidden = !challengeOutcome;
  if (challengeOutcome) {
    const f = (n: number) => n.toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-GB');
    const who = nickName(challengeOutcome.from.nick);
    banner.classList.toggle('lose', !challengeOutcome.won);
    banner.textContent = challengeOutcome.won
      ? x.challengeWin(who, f(challengeOutcome.mine), f(challengeOutcome.from.scoreG))
      : x.challengeLose(who, f(challengeOutcome.from.scoreG - challengeOutcome.mine));
  }

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

function seasonLabel(seed: string) {
  return seed.startsWith('d') ? t().theme(finnishDate(seed)) : seed.startsWith('story') ? t().story(Number(seed.slice(6)), STORY.length) : t().random;
}

function challengeLink(seed: string, g: number) {
  const base = shareBase();
  return base ? `${base}#${encodeChallenge({ nick: save.nick, scoreG: g, seed })}` : '';
}

function shareText(r: SeasonResult) {
  const link = current.mode === 'daily' ? challengeLink(r.seed, r.storedG) : shareBase();
  return `Kasva! · ${seasonLabel(r.seed)}\n🌳 ${r.storedG.toLocaleString('fi-FI')} g CO₂ · ×${r.bestCombo}\n${r.weather.map((w) => WEATHER_EMOJI[w]).join('')}${link ? '\n' + link : ''}`;
}

async function copy(text: string, button: HTMLElement, done: string) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  button.textContent = done;
  setTimeout(() => (button.textContent = label), 1600);
}

function sendChallenge(seed: string, g: number, button: HTMLElement) {
  const x = t();
  const text = `Kasva! ${x.challengeBy(nickName(save.nick))} ${seasonLabel(seed)} · ${g.toLocaleString('fi-FI')} g\n${challengeLink(seed, g)}`;
  void copy(text, button, x.copiedChallenge);
  const out = challengeSent(save, seed, g, new Date().toISOString());
  save = out.save;
  persist();
  if (out.newAchievements.length) sound.badge();
}

// ---------- share sheet ----------

function openShare() {
  if (!lastResult) return;
  const x = t();
  const r = lastResult;
  show('share');
  $('btn-copy-challenge').hidden = current.mode !== 'daily';
  const img = $<HTMLImageElement>('poster-preview');
  if (posterUrl) { img.src = posterUrl; return; }
  img.removeAttribute('src');
  // draw after the sheet is on screen, so the tap feels instant
  setTimeout(() => {
    const cv = renderPoster({
      scoreG: r.storedG, unit: x.posterUnit, label: seasonLabel(r.seed),
      who: `${nickName(save.nick)} · ${x.ranks[RANKS[rankIndex(save.co2LifetimeG)].id].name}`,
      weather: r.weather, rank: rankIndex(save.co2LifetimeG),
      callout: current.mode === 'daily' ? x.posterCallout : undefined,
    });
    cv.toBlob((b) => {
      if (!b) return;
      posterBlob = b;
      posterUrl = URL.createObjectURL(b);
      img.src = posterUrl;
      img.alt = `${x.shareTitle}: ${r.storedG} g`;
    }, 'image/png');
  }, 30);
}

/** The claude.ai viewer's own save prompt, when the game runs inside it. */
type Downloads = { save(r: { filename: string; data: Blob }): Promise<{ status: string }> };
let downloads: Downloads | null = null;
(window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude?.use?.('downloads')
  .then((d) => { downloads = d as Downloads | null; })
  .catch(() => { /* not available here */ });

async function sharePoster() {
  if (!posterBlob || !lastResult) return;
  const filename = `kasva-${lastResult.seed}.png`;
  const file = new File([posterBlob], filename, { type: 'image/png' });
  // 1. the phone's share sheet
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: shareText(lastResult) });
      if (current.mode === 'daily') { const out = challengeSent(save, lastResult.seed, lastResult.storedG, new Date().toISOString()); save = out.save; persist(); }
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return; // the player closed the sheet
  }
  // 2. inside the claude.ai viewer: its save prompt
  if (downloads) {
    try { await downloads.save({ filename, data: posterBlob }); } catch { $('t-savehint').classList.add('banner'); }
    return;
  }
  // 3. a plain download, then the press-and-hold hint
  const a = document.createElement('a');
  a.href = posterUrl!;
  a.download = filename;
  a.click();
  $('t-savehint').classList.add('banner');
}

// ---------- about, privacy and data ----------

function renderAbout() {
  const u = ui();
  $('t-about').textContent = u.title;
  $('about-sections').innerHTML = aboutSections(lang).map((sec) =>
    `<details id="about-${sec.id}"><summary>${sec.title}</summary>${sec.body.map((p) => `<p>${p}</p>`).join('')}</details>`).join('');
  $('t-data').textContent = u.dataTitle;
  $('t-testlog').textContent = u.testlog;
  $<HTMLInputElement>('opt-testlog').checked = testLogOn;
  $('btn-delete').textContent = u.del;
  $('t-delconfirm').textContent = u.delConfirm;
  $('btn-del-yes').textContent = u.delYes;
  $('btn-del-no').textContent = u.delNo;
  $('btn-about-close').textContent = t().close;
}

/** Delete everything this game stored in this browser, then start fresh. */
function deleteAllData() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('kasva-')) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* storage blocked: nothing was stored either */ }
  announce(ui().deleted);
  location.hash = '';
  location.reload();
}

// ---------- contests ----------

function renderKisat() {
  const x = t();
  const f = (n: number) => n.toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-GB');
  $('k-nick').textContent = nickName(save.nick);
  const seed = dailySeed();
  const d = save.daily[seed];
  $('k-today').textContent = d ? x.todayBest(d.bestG, d.tries) : x.todayNone;
  $('btn-k-challenge').hidden = !d;
  const rec = save.challenges.received;
  $('k-received').innerHTML = rec.length ? rec.map((c) =>
    `<div class="r"><span><b>${nickName(c.nick)}</b> · ${seasonLabel(c.seed)}<br>${f(c.myBestG)} g – ${f(c.theirG)} g</span><span class="tag${c.won ? ' won' : ''}">${c.won ? x.won : x.lost}</span></div>`).join('')
    : `<p class="note">${x.noneYet}</p>`;
  const sent = save.challenges.sent;
  $('k-sent').innerHTML = sent.length ? sent.map((c) => `<div class="r"><span>${seasonLabel(c.seed)}</span><b>${f(c.g)} g</b></div>`).join('')
    : `<p class="note">${x.noneYet}</p>`;
}

function renderChallenge(c: Challenge) {
  const x = t();
  const who = nickName(c.nick);
  const g = c.scoreG.toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-GB');
  $('c-label').textContent = seasonLabel(c.seed);
  $('c-title').textContent = x.challengeBy(who);
  $('c-weather').innerHTML = weatherRow(planWeather(c.seed));
  $('c-score').textContent = g + ' g';
  $('c-line').textContent = x.challengeLine(who, g);
  face($<HTMLCanvasElement>('c-face'));
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
  if (metsani.active) return;
  if (e.code === 'Space') { e.preventDefault(); sound.unlock(); if (!e.repeat) press(true); }
  if (e.code === 'KeyP') pause(mode === 'play');
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') press(false); });
// Escape always goes one step back
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (metsani.active) { metsani.escape(); return; }
  if (mode === 'play') pause(true);
  else if (mode === 'pause') pause(false);
  else if (visible === 'share' || visible === 'levelup') show('results');
  else if (visible === 'cards' || visible === 'kisat' || visible === 'about' || visible === 'challenge') {
    if (lastResult && mode === 'results') show('results'); else toMenu();
  }
});
document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === 'opt-testlog') {
    testLogOn = el.checked;
    store(TESTLOG_KEY, testLogOn);
    if (!testLogOn) store(LOG_KEY, []); // switching it off also clears it
    renderLog();
  }
});
window.addEventListener('blur', () => { press(false); pause(true); metsani.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(true); metsani.pause(); } });
window.addEventListener('resize', () => { renderer.resize(); metsani.resize(); });

document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  sound.unlock();
  if (b.dataset.lang) { lang = b.dataset.lang as Lang; store(LANG_KEY, lang); renderText(); return; }
  if (metsani.active) return; // Metsäni handles its own buttons
  if (b.dataset.grow) { pickGrowth(b.dataset.grow as Growth); return; }
  if (b.dataset.badge) { show('cards'); renderCards(b.dataset.badge); return; }
  switch (b.id) {
    case 'btn-play': case 'btn-next': start(nextSeason()); break;
    case 'btn-daily': start(dailyConfig()); linkSeed = null; break;
    case 'btn-metsani': openMetsani(); break;
    case 'btn-again': start({ ...current }); break;
    case 'btn-home': case 'btn-cards-close': toMenu(); break;
    case 'btn-cards': show('cards'); renderCards(); break;
    case 'btn-lu-continue': show('results'); break;
    case 'btn-pause': pause(true); break;
    case 'btn-resume': pause(false); break;
    case 'btn-mute': case 'btn-radio': toggleMute(); break;
    case 'btn-about': show('about'); break;
    case 'btn-about-close': toMenu(); break;
    case 'btn-delete': $('del-confirm').hidden = false; $('btn-del-no').focus(); break;
    case 'btn-del-no': $('del-confirm').hidden = true; $('btn-delete').focus(); break;
    case 'btn-del-yes': deleteAllData(); break;
    case 'btn-share': openShare(); break;
    case 'btn-share-image': void sharePoster(); break;
    case 'btn-copy': if (lastResult) void copy(shareText(lastResult), b, t().result.copied); break;
    case 'btn-copy-challenge': if (lastResult) sendChallenge(lastResult.seed, lastResult.storedG, b); break;
    case 'btn-share-close': show('results'); break;
    case 'btn-kisat': show('kisat'); renderKisat(); break;
    case 'btn-kisat-close': case 'btn-c-home': toMenu(); break;
    case 'btn-k-daily': start(dailyConfig()); break;
    case 'btn-k-challenge': { const sd = dailySeed(); const d = save.daily[sd]; if (d) { sendChallenge(sd, d.bestG, b); renderKisat(); } break; }
    case 'btn-reroll': save = { ...save, nick: randomNick() }; persist(); renderKisat(); sound.pop(2, false); break;
    case 'btn-take': if (linkChallenge) { const c = linkChallenge; start({ mode: 'daily', seed: c.seed, from: c }); } break;
    case 'btn-clear-log': store(LOG_KEY, []); renderLog(); break;
  }
});

// ---------- loop ----------

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (metsani.active) {
    metsani.update(dt);
    requestAnimationFrame(frame);
    return;
  }
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
if (linkChallenge) { renderChallenge(linkChallenge); show('challenge', false); } else show('start', false);
void document.fonts?.load('800 40px "Bricolage Grotesque"');
void document.fonts?.load('700 24px Caveat').then(() => renderHome());
requestAnimationFrame(frame);

// Test hook for screenshots: open with #dbg (or set localStorage kasva-dbg = 1),
// then window.__kasva.skip(ticks, hold).
if (location.hash === '#dbg' || load<number>('kasva-dbg', 0) === 1) {
  if (location.hash === '#dbg') linkSeed = null;
  (window as unknown as { __kasva: unknown }).__kasva = {
    skip(ticks: number, hold = false) { for (let i = 0; i < ticks && !sim.done; i++) { step(sim, hold); if (sim.done) finish(); } },
    state: () => ({ tick: sim.tick, water: sim.water, mode, save }),
    setSave(s: unknown) { save = migrate(s); persist(); renderer.setRank(rankIndex(save.co2LifetimeG)); renderText(); },
    metsani: { open: openMetsani, ...metsani.debug() },
  };
}
