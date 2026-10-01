/** The results screen, growth choice, level-up and the card collection. */
import { num } from './format';
import { ACHIEVEMENTS, MAX_GROWTH, RANKS, choose, rankProgress, type Growth, type SeasonOutcome } from '../core/progress';
import { type SeasonResult } from '../core/season';
import { face, show, weatherRow } from './screens';
import { nickName } from './share';
import { $, app, persist, renderer, sound, t, ui } from './state';

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

export function fillResults(r: SeasonResult, o: SeasonOutcome, animate: boolean, beforeG = app.save.co2LifetimeG) {
  const x = t();
  const fmt = (n: number) => num(n);
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
  banner.hidden = !app.challengeOutcome;
  if (app.challengeOutcome) {
    const f = (n: number) => num(n);
    const who = nickName(app.challengeOutcome.from.nick);
    banner.classList.toggle('lose', !app.challengeOutcome.won);
    banner.textContent = app.challengeOutcome.won
      ? x.challengeWin(who, f(app.challengeOutcome.mine), f(app.challengeOutcome.from.scoreG))
      : x.challengeLose(who, f(app.challengeOutcome.from.scoreG - app.challengeOutcome.mine));
  }
  if (app.forestMsg) { banner.hidden = false; banner.classList.remove('lose'); banner.textContent = app.forestMsg; }

  // XP bar fills from where it was to where it is now (to the end on a rank-up)
  const after = rankProgress(app.save.co2LifetimeG);
  const beforeP = rankProgress(beforeG);
  $('r-rank').textContent = x.ranks[RANKS[after.index].id].name;
  $('r-xp').textContent = x.xp(app.save.co2LifetimeG / 1000, after.next);
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
  if (app.current.mode === 'daily') { el.innerHTML = `<p class="note">${x.growDaily}</p>`; return; }
  const cards = (['roots', 'leaves', 'wood'] as Growth[]).map((g) => {
    const lvl = app.save.growth[g];
    const full = lvl >= MAX_GROWTH;
    const dots = '●'.repeat(lvl) + '○'.repeat(MAX_GROWTH - lvl);
    return `<button type="button" class="gcard${app.picked === g ? ' picked' : ''}" data-grow="${g}"${app.picked || full ? ' disabled' : ''}>` +
      `<b>${x.growth[g].name}</b><span class="dots">${dots}</span><span>${x.growth[g].effect}</span></button>`;
  }).join('');
  el.innerHTML = `<h3>${app.picked ? x.chosen(x.growth[app.picked].name, app.save.growth[app.picked]) : x.growTitle}</h3><div class="cards3">${cards}</div>`;
}

export function pickGrowth(g: Growth) {
  if (app.picked || app.current.mode === 'daily') return;
  const out = choose(app.save, g);
  app.save = out.save;
  app.picked = g;
  persist();
  sound.pop(3, false);
  renderGrow();
  if (out.newAchievements.length) {
    $('r-badges-wrap').hidden = false;
    $('r-badges').insertAdjacentHTML('beforeend', out.newAchievements.map((id) => leafBadge(id, true, true)).join(''));
    sound.badge();
  }
}

export function showLevelUp(rank: number) {
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

export function renderCards(selected?: string) {
  const x = t();
  const all = x.achievements as Record<string, { name: string; how: string; fact: string }>;
  $('cardgrid').innerHTML = ACHIEVEMENTS.map((a) => {
    const on = app.save.achievements.includes(a.id);
    return leafBadge(a.id, on, true);
  }).join('');
  const fact = $('fact');
  if (!selected) { fact.hidden = true; return; }
  const a = all[selected];
  const on = app.save.achievements.includes(selected);
  fact.hidden = false;
  fact.innerHTML = `<h3>${a.name}</h3><p><b>${a.how}</b></p><p>${on ? a.fact : x.locked}</p>`;
}

/** The trunk's cross-section: one ring per season, the newest drawn last. */
export function drawRing(seasons: number[]) {
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

export function countUp(el: HTMLElement, to: number) {
  if (renderer.hud.reducedMotion) { el.textContent = num(to); return; }
  const t0 = performance.now(), dur = 1100;
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = num(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
