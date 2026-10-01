/** Contests: today's best, challenges sent and received, and the challenge card. */
import { num } from './format';
import { type Challenge } from '../core/share';
import { dailySeed, planWeather } from '../core/weather';
import { face, weatherRow } from './screens';
import { nickName, seasonLabel } from './share';
import { $, app, t } from './state';

// ---------- contests ----------

export function renderKisat() {
  const x = t();
  const f = (n: number) => num(n);
  $('k-nick').textContent = nickName(app.save.nick);
  const seed = dailySeed();
  const d = app.save.daily[seed];
  $('k-today').textContent = d ? x.todayBest(d.bestG, d.tries) : x.todayNone;
  $('btn-k-challenge').hidden = !d;
  const rec = app.save.challenges.received;
  $('k-received').innerHTML = rec.length ? rec.map((c) =>
    `<div class="r"><span><b>${nickName(c.nick)}</b> · ${seasonLabel(c.seed)}<br>${f(c.myBestG)} g – ${f(c.theirG)} g</span><span class="tag${c.won ? ' won' : ''}">${c.won ? x.won : x.lost}</span></div>`).join('')
    : `<p class="note">${x.noneYet}</p>`;
  const sent = app.save.challenges.sent;
  $('k-sent').innerHTML = sent.length ? sent.map((c) => `<div class="r"><span>${seasonLabel(c.seed)}</span><b>${f(c.g)} g</b></div>`).join('')
    : `<p class="note">${x.noneYet}</p>`;
}

export function renderChallenge(c: Challenge) {
  const x = t();
  const who = nickName(c.nick);
  const g = num(c.scoreG);
  $('c-label').textContent = seasonLabel(c.seed);
  $('c-title').textContent = x.challengeBy(who);
  $('c-weather').innerHTML = weatherRow(planWeather(c.seed));
  $('c-score').textContent = g + ' g';
  $('c-line').textContent = x.challengeLine(who, g);
  face($<HTMLCanvasElement>('c-face'));
}
