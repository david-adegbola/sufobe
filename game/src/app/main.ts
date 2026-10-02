/**
 * Kasva! entry point: start-up, the living forest menu, playing a season
 * (Tikka's hints, events, the end of a season), input, and the frame loop.
 * The other screens live in their own modules: results.ts (results, growth,
 * level-up, cards), share.ts, kisat.ts, about.ts; shared state is in state.ts.
 */
import { num, setFormatLang } from './format';
import './fonts.css';
import { makeExpert } from '../core/bots';
import { RANKS, STORY, applySeason, challengePlayed, growthMods, migrate, rankIndex, rankProgress, type Growth } from '../core/progress';
import { DT, LIGHT_TICKS, STANDARD_TREE, clock, createSeason, result, step, type SeasonState } from '../core/season';
import { encodeChallenge, randomNick } from '../core/share';
import { dailySeed, planWeather } from '../core/weather';
import { Metsani } from './forest/metsani';
import { cardById } from '../core/forest/experiments';
import { FOREST_TEXT } from './forest/text';
import { clearTally, setQuizOn } from './forest/quiz';
import { initPwa, renderPwa } from './pwa';
import { readBackup } from './transfer';
import { TEXT, type Lang } from './text';
import { askImport, confirmImport, deleteAllData, importCode, renderAbout, saveBackup, showTransferCode, transferLink } from './about';
import { renderChallenge, renderKisat } from './kisat';
import { countUp, drawRing, fillResults, pickGrowth, showLevelUp } from './results';
import { ATLAS_TEXT, discover, newCount, renderAtlas, seasonFinds, type AtlasPage } from './atlas';
import { announce, face, finnishDate, ringIcon, show, weatherRow } from './screens';
import { copy, openShare, sendChallenge, sharePoster, shareText, type Downloads } from './share';
import { $, LANG_KEY, LOG_KEY, SOUND_KEY, TESTLOG_KEY, app, canvas, linkChallenge, linkQuestion, linkTransfer, load, persist, renderer, shell, sound, store, t, today, ui, type LogRow, type SeasonConfig } from './state';

renderer.hud.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
renderer.setRank(rankIndex(app.save.co2LifetimeG));
sound.muted = !load<boolean>(SOUND_KEY, true);

// Metsäni: the forest mode lives in its own module and canvas
const metsani = new Metsani({
  lang: () => app.lang,
  announce: (s) => announce(s),
  exit: () => { canvas.hidden = false; toMenu(); },
  zoomIn: (z, done) => {
    canvas.hidden = false;
    start({ mode: 'free', seed: z.seed, weather: z.weather, forest: { mods: z.mods, done } });
  },
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  sound,
});
function openMetsani() {
  show(null, false);
  canvas.hidden = true;
  metsani.enter();
}
/** A question card straight from a teacher's link. */
function openQuestion(id: string) {
  show(null, false);
  canvas.hidden = true;
  metsani.openLab(id);
}
let menuSim!: SeasonState;
let menuBot = makeExpert();
let menuCount = 0;
let holding = false;
let acc = 0;
let shown = new Set<string>();

function newMenuSeason() {
  menuSim = createSeason('menu-' + menuCount++, ['sun', 'sun', 'sun', 'cloudy', 'sun', 'rain']);
  menuBot = makeExpert();
  for (let i = 0; i < 260; i++) step(menuSim, menuBot(menuSim)); // late morning, not dawn
}
newMenuSeason();
app.sim = menuSim;

/**
 * The big button plays the next story season. After the story, it plays your
 * birch's summer in your forest (Phase 6), or, before you have a forest, your
 * own tree in new weather.
 */
function nextSeason(): SeasonConfig {
  if (app.save.storyIndex < STORY.length) return { mode: 'story', seed: 'story-' + (app.save.storyIndex + 1), weather: STORY[app.save.storyIndex] };
  if (metsani.birchStatus()) return { mode: 'free', seed: 'birch', birch: true };
  return { mode: 'free', seed: 'r' + Math.random().toString(36).slice(2, 8) };
}

/** Start what the big button promises; your birch's summer first lives one year in the forest. */
function playNext() {
  const cfg = nextSeason();
  if (!cfg.birch) { start(cfg); return; }
  const s = metsani.birchSummer(growthMods(app.save.growth));
  if (!s) { openMetsani(); return; } // Tikka is waiting for an answer
  start({ mode: 'free', seed: s.z.seed, weather: s.z.weather, forest: { mods: s.z.mods, done: s.done, home: true } });
}
const dailyConfig = (): SeasonConfig => ({ mode: 'daily', seed: app.linkSeed ?? dailySeed() });

function renderHome() {
  const x = t();
  const rp = rankProgress(app.save.co2LifetimeG);
  $('rank-chip').innerHTML = ringIcon(rp.fraction) + x.rankChip(x.ranks[RANKS[rp.index].id].name, app.save.co2LifetimeG / 1000);
  const st = app.save.streak;
  const chip = $('streak-chip');
  chip.hidden = st.days === 0;
  chip.textContent = '☀ ' + x.streak(st.days);
  chip.classList.toggle('cover', st.snowCovers > 0);
  chip.title = st.snowCovers > 0 ? x.snowCover : '';
  const next = nextSeason();
  const daily = dailyConfig();
  if (next.mode === 'story') {
    $('t-theme').textContent = x.story(app.save.storyIndex + 1, STORY.length);
    $('daily-weather').innerHTML = weatherRow(next.weather!);
    $('home-bubble').querySelector('span')!.textContent = x.storyIntro[app.save.storyIndex];
  } else if (next.birch) {
    const b = metsani.birchStatus()!;
    $('t-theme').textContent = x.birchTheme(b.year + 1);
    $('daily-weather').innerHTML = weatherRow(planWeather(daily.seed));
    $('home-bubble').querySelector('span')!.textContent = b.question ? x.birchQuestion : x.birchHome(num(b.h, 1));
  } else {
    $('t-theme').textContent = x.theme(finnishDate(daily.seed));
    $('daily-weather').innerHTML = weatherRow(planWeather(daily.seed));
    $('home-bubble').querySelector('span')!.textContent = x.birchInvite;
  }
  const q = next.birch && metsani.birchStatus()!.question;
  $('btn-play').textContent = q ? x.toForest : x.play;
  face($('home-bubble').querySelector('canvas'));
  const n = newCount();
  $('btn-cards').textContent = n ? ATLAS_TEXT[app.lang].buttonNew(n) : ATLAS_TEXT[app.lang].button;
  renderPwa();
}

// ---------- the Forest Atlas (Phase 6) ----------

let atlasPage: AtlasPage = 'badges';
function openAtlas(page: AtlasPage = atlasPage, selected?: string) {
  atlasPage = page;
  show('cards');
  renderAtlas(page, app.lang, app.save.achievements, metsani.madeCounts(), selected);
}

function renderText() {
  setFormatLang(app.lang);
  const x = t();
  document.documentElement.lang = app.lang;
  $('t-title').textContent = x.play;
  $('btn-play').textContent = x.play;
  $('btn-daily').textContent = x.daily;
  $('btn-metsani').textContent = FOREST_TEXT[app.lang].homeButton;
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
  $('t-cards').textContent = ATLAS_TEXT[app.lang].title;
  if (app.visible === 'cards') openAtlas();
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
  document.querySelectorAll<HTMLButtonElement>('.lang button[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === app.lang)));
  renderer.hud.labels = { water: x.water, stored: x.stored, day: x.day, juhannus: x.juhannus };
  renderHome();
  renderLog();
  if (app.lastResult && app.lastOutcome) fillResults(app.lastResult, app.lastOutcome, false);
}

function renderLog() {
  $('log').hidden = !app.testLogOn;
  const rows = load<LogRow[]>(LOG_KEY, []);
  const x = t();
  $('log-body').innerHTML = rows.length
    ? `<p>${x.runs(rows.length)}</p><table><tr><th></th><th>g CO₂</th><th>×</th><th>💧</th></tr>${rows.slice(-10).reverse().map((r) =>
        `<tr><td>${new Date(r.at).toLocaleTimeString(app.lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</td><td>${r.stored}</td><td>${r.combo}</td><td>${r.wilts}</td></tr>`).join('')}</table>
       <p><button type="button" class="btn ghost small" id="btn-clear-log">${x.logClear}</button></p>`
    : `<p>${x.logEmpty}</p>`;
}

// ---------- play ----------

function start(cfg: SeasonConfig) {
  app.current = cfg;
  const mods = cfg.forest ? cfg.forest.mods : cfg.mode === 'daily' ? STANDARD_TREE : growthMods(app.save.growth);
  app.sim = createSeason(cfg.seed, cfg.weather, mods);
  app.mode = 'play';
  acc = 0;
  holding = false;
  shown = new Set();
  app.picked = null;
  app.challengeOutcome = null;
  app.forestMsg = null;
  if (app.posterUrl) { URL.revokeObjectURL(app.posterUrl); app.posterUrl = null; app.posterBlob = null; }
  renderer.hud.shownScore = 0;
  renderer.hud.hint = null;
  show(null);
  if (app.save.seasons < 3) hint('start', 999);
  history.replaceState(null, '', cfg.from ? '#' + encodeChallenge(cfg.from) : cfg.mode === 'daily' ? '#s-' + cfg.seed : location.pathname + location.search);
}

function hint(key: keyof (typeof TEXT)['fi']['hints'], secs = 3.6) {
  const always = key === 'wilt' || key === 'heat' || key === 'juhannus';
  if (shown.has(key) || (app.save.seasons >= 3 && !always)) return;
  shown.add(key);
  renderer.showHint(t().hints[key], secs);
  announce(t().hints[key]);
  sound.drum();
}

function handleEvents() {
  for (const e of app.sim.events) {
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
  if (app.sim.open && app.sim.water < 25 * app.sim.mods.waterMax) hint('lowWater');
}

function finish() {
  app.mode = 'results';
  holding = false;
  sound.setBreathing(false);
  sound.end();
  const r = result(app.sim);
  const before = app.save.co2LifetimeG;
  const outcome = applySeason(app.save, r, app.current.mode, today());
  app.save = outcome.save;
  if (app.current.from) {
    const c = challengePlayed(app.save, app.current.from, r.storedG, new Date().toISOString());
    app.save = c.save;
    outcome.newAchievements.push(...c.newAchievements);
    app.challengeOutcome = { won: c.won, from: app.current.from, mine: Math.max(r.storedG, app.save.challenges.received[0]?.myBestG ?? 0) };
  }
  persist();
  discover(seasonFinds(r));
  if (app.testLogOn) {
    const rows = load<LogRow[]>(LOG_KEY, []);
    rows.push({ at: new Date().toISOString(), seed: r.seed, stored: r.storedG, caught: r.caughtG, resp: r.respiredG, combo: r.bestCombo, wilts: r.wilts });
    store(LOG_KEY, rows.slice(-200));
  }
  announce(ui().seasonEnd(num(r.storedG)));
  app.lastResult = r;
  app.lastOutcome = outcome;
  fillResults(r, outcome, true, before);
  // back from a Metsäni birch: say what this summer did to it
  app.forestMsg = app.current.forest ? app.current.forest.done(r.storedG) : null;
  fillResults(r, outcome, false);
  forestReturn(!!app.current.forest && !app.current.forest.home);
  $('btn-again').hidden ||= !!app.current.forest?.home; // a summer of your birch happens once
  renderLog();
  renderHome();
  show('results');
  countUp($('r-stored'), r.storedG);
  drawRing(app.save.rings.slice(-12).map((x) => x.g));
  if (outcome.newAchievements.length) setTimeout(() => sound.badge(), 900);
  if (outcome.rankAfter > outcome.rankBefore) {
    setTimeout(() => showLevelUp(outcome.rankAfter), 1700);
  }
}
(window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude?.use?.('downloads')
  .then((d) => { app.downloads = d as Downloads | null; })
  .catch(() => { /* not available here */ });

/** After a Metsäni zoom-in, the results lead back to the forest instead of to the next season. */
function forestReturn(on: boolean) {
  $('btn-forest-back').hidden = !on;
  $('btn-forest-back').textContent = FOREST_TEXT[app.lang].backToForest;
  for (const id of ['btn-next', 'btn-again', 'btn-share']) $(id).hidden = on;
}

function backToForest() {
  forestReturn(false);
  app.lastResult = null;
  app.mode = 'menu';
  app.sim = menuSim;
  show(null, false);
  canvas.hidden = true;
  app.current = { mode: 'free', seed: 'menu' };
  metsani.resume();
}

function pause(on: boolean) {
  if (on && app.mode === 'play') { app.mode = 'pause'; holding = false; sound.setBreathing(false); show('pause'); }
  else if (!on && app.mode === 'pause') { app.mode = 'play'; show(null); }
}

function toMenu() {
  app.mode = 'menu';
  app.sim = menuSim;
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
  if (app.mode !== 'play') return;
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
  if (e.code === 'KeyP') pause(app.mode === 'play');
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') press(false); });
// the Atlas tabs: arrow keys move between pages
window.addEventListener('keydown', (e) => {
  const tab = (e.target as HTMLElement).closest?.('[data-atlas-page]') as HTMLElement | null;
  if (!tab || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
  const pages: AtlasPage[] = ['badges', 'species', 'animals', 'events', 'products'];
  const i = pages.indexOf(tab.dataset.atlasPage as AtlasPage);
  openAtlas(pages[(i + (e.key === 'ArrowRight' ? 1 : pages.length - 1)) % pages.length]);
  $(`atlas-tab-${atlasPage}`).focus();
});
// Escape always goes one step back
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (metsani.active) { metsani.escape(); return; }
  if (app.current.forest && app.mode === 'results' && app.visible === 'results') { backToForest(); return; }
  if (app.mode === 'play') pause(true);
  else if (app.mode === 'pause') pause(false);
  else if (app.visible === 'share' || app.visible === 'levelup') show('results');
  else if (app.visible === 'cards' || app.visible === 'kisat' || app.visible === 'about' || app.visible === 'challenge') {
    if (app.lastResult && app.mode === 'results') show('results'); else toMenu();
  }
});
document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === 'opt-quiz') { setQuizOn(el.checked); renderAbout(); return; }
  if (el.id === 'backup-file' && el.files?.[0]) {
    void el.files[0].text().then((text) => {
      const data = readBackup(text);
      if (!data) $('transfer-msg').textContent = ui().backupBad;
      else askImport({ kind: 'file', data });
      el.value = '';
    });
    return;
  }
  if (el.id === 'opt-testlog') {
    app.testLogOn = el.checked;
    store(TESTLOG_KEY, app.testLogOn);
    if (!app.testLogOn) store(LOG_KEY, []); // switching it off also clears it
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
  if (b.dataset.lang) { app.lang = b.dataset.lang as Lang; store(LANG_KEY, app.lang); renderText(); return; }
  if (metsani.active) return; // Metsäni handles its own buttons
  if (b.dataset.grow) { pickGrowth(b.dataset.grow as Growth); return; }
  if (b.dataset.badge) { openAtlas('badges', b.dataset.badge); return; }
  if (b.dataset.atlasPage) { openAtlas(b.dataset.atlasPage as AtlasPage); $(`atlas-tab-${atlasPage}`).focus(); return; }
  if (b.dataset.atlasEntry) { openAtlas(b.dataset.atlasOn as AtlasPage, b.dataset.atlasEntry); $('fact').focus?.(); return; }
  switch (b.id) {
    case 'btn-play': case 'btn-next': playNext(); break;
    case 'btn-daily': start(dailyConfig()); app.linkSeed = null; break;
    case 'btn-metsani': openMetsani(); break;
    case 'btn-forest-back': backToForest(); break;
    case 'btn-again': start({ ...app.current }); break;
    case 'btn-home': case 'btn-cards-close': toMenu(); break;
    case 'btn-cards': openAtlas(); break;
    case 'btn-lu-continue': show('results'); break;
    case 'btn-pause': pause(true); break;
    case 'btn-resume': pause(false); break;
    case 'btn-mute': case 'btn-radio': toggleMute(); break;
    case 'btn-about': renderAbout(); show('about'); break;
    case 'btn-about-close': toMenu(); break;
    case 'btn-delete': $('del-confirm').hidden = false; $('btn-del-no').focus(); break;
    case 'btn-del-no': $('del-confirm').hidden = true; $('btn-delete').focus(); break;
    case 'btn-del-yes': deleteAllData(); break;
    case 'btn-share': openShare(); break;
    case 'btn-share-image': void sharePoster(); break;
    case 'btn-copy': if (app.lastResult) void copy(shareText(app.lastResult), b, t().result.copied); break;
    case 'btn-copy-challenge': if (app.lastResult) sendChallenge(app.lastResult.seed, app.lastResult.storedG, b); break;
    case 'btn-share-close': show('results'); break;
    case 'btn-kisat': show('kisat'); renderKisat(); break;
    case 'btn-kisat-close': case 'btn-c-home': toMenu(); break;
    case 'btn-k-daily': start(dailyConfig()); break;
    case 'btn-k-challenge': { const sd = dailySeed(); const d = app.save.daily[sd]; if (d) { sendChallenge(sd, d.bestG, b); renderKisat(); } break; }
    case 'btn-reroll': app.save = { ...app.save, nick: randomNick() }; persist(); renderKisat(); sound.pop(2, false); break;
    case 'btn-take': if (linkChallenge) { const c = linkChallenge; start({ mode: 'daily', seed: c.seed, from: c }); } break;
    case 'btn-clear-log': store(LOG_KEY, []); renderLog(); break;
    case 'btn-quiz-clear': clearTally(); renderAbout(); break;
    case 'btn-show-code': void showTransferCode(); break;
    case 'btn-copy-code': void copy($<HTMLTextAreaElement>('transfer-code-text').value, b, ui().copied); break;
    case 'btn-copy-link': void copy(transferLink($<HTMLTextAreaElement>('transfer-code-text').value), b, ui().copied); break;
    case 'btn-import': void importCode($<HTMLTextAreaElement>('transfer-in').value); break;
    case 'btn-import-yes': confirmImport(); break;
    case 'btn-import-no': app.pendingImport = null; $('import-confirm').hidden = true; $('btn-import').focus(); break;
    case 'btn-backup-save': void saveBackup(b); break;
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
  if (app.mode === 'play') {
    acc += dt;
    while (acc >= DT && app.mode === 'play') {
      step(app.sim, holding);
      handleEvents();
      acc -= DT;
    }
  } else if (app.mode === 'menu' || app.mode === 'results') {
    // the forest keeps living behind the menu: a quiet expert plays it
    acc += dt;
    while (acc >= DT) {
      step(menuSim, menuBot(menuSim));
      acc -= DT;
      if (menuSim.done) newMenuSeason();
    }
    if (app.mode === 'menu') app.sim = menuSim;
  }
  const k = clock(app.sim);
  sound.setBreathing(app.mode === 'play' && app.sim.open, k.weather === 'heat');
  sound.update({
    playing: app.mode === 'play', isNight: k.isNight, midsummer: k.juhannus,
    dusk: !k.isNight && k.phase > LIGHT_TICKS - 120, weather: k.weather,
  });
  const wide = innerWidth >= 900 && innerWidth / innerHeight >= 1.2;
  renderer.setFocus(app.mode === 'menu' && !$('start').hidden && wide ? 0.68 : 0.5, dt);
  renderer.draw(app.sim, app.mode === 'pause' ? 0 : dt, app.mode === 'play' || app.mode === 'pause');
  requestAnimationFrame(frame);
}

shell.renderText = renderText;
initPwa({ seasons: () => app.save.seasons, lang: () => app.lang });
renderText();
if (linkChallenge) { renderChallenge(linkChallenge); show('challenge', false); }
else if (linkQuestion && cardById(linkQuestion)) { history.replaceState(null, '', location.pathname + location.search); openQuestion(linkQuestion); }
else if (linkTransfer) { history.replaceState(null, '', location.pathname + location.search); show('about', false); void importCode(linkTransfer); }
else show('start', false);
void document.fonts?.load('800 40px "Bricolage Grotesque"');
void document.fonts?.load('700 24px Caveat').then(() => renderHome());
requestAnimationFrame(frame);

// Test hook for screenshots: open with #dbg (or set localStorage kasva-dbg = 1),
// then window.__kasva.skip(ticks, hold).
if (location.hash === '#dbg' || (() => { try { return localStorage.getItem('kasva-dbg') === '1'; } catch { return false; } })()) {
  if (location.hash === '#dbg') app.linkSeed = null;
  (window as unknown as { __kasva: unknown }).__kasva = {
    skip(ticks: number, hold = false) { for (let i = 0; i < ticks && !app.sim.done; i++) { step(app.sim, hold); if (app.sim.done) finish(); } },
    state: () => ({ tick: app.sim.tick, water: app.sim.water, mode: app.mode, save: app.save }),
    setSave(s: unknown) { app.save = migrate(s); persist(); renderer.setRank(rankIndex(app.save.co2LifetimeG)); renderText(); },
    metsani: { open: openMetsani, ...metsani.debug() },
  };
}

