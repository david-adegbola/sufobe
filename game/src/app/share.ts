/** Sharing: nicknames, links, challenge texts, the share sheet and the result poster. */
import { num } from './format';
import { RANKS, STORY, challengeSent, rankIndex } from '../core/progress';
import { type SeasonResult } from '../core/season';
import { encodeChallenge, nickParts } from '../core/share';
import { renderPoster } from './poster';
import { WEATHER_EMOJI } from './text';
import { finnishDate, show } from './screens';
import { $, app, persist, sound, t } from './state';

export function nickName(code: string) {
  const p = nickParts(code) ?? [0, 0];
  return `${t().adjectives[p[0]]} ${t().animals[p[1]]}`;
}

/** Where shared links point: the published page if the build says so, else this page. */
export function shareBase(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="kasva-share-url"]')?.content;
  if (meta) return meta;
  return /^https?:/.test(location.protocol) ? location.origin + location.pathname : '';
}

export function seasonLabel(seed: string) {
  return seed.startsWith('d') ? t().theme(finnishDate(seed)) : seed.startsWith('story') ? t().story(Number(seed.slice(6)), STORY.length) : t().random;
}

function challengeLink(seed: string, g: number) {
  const base = shareBase();
  return base ? `${base}#${encodeChallenge({ nick: app.save.nick, scoreG: g, seed })}` : '';
}

export function shareText(r: SeasonResult) {
  const link = app.current.mode === 'daily' ? challengeLink(r.seed, r.storedG) : shareBase();
  return `Kasva! · ${seasonLabel(r.seed)}\n🌳 ${num(r.storedG)} g CO₂ · ×${r.bestCombo}\n${r.weather.map((w) => WEATHER_EMOJI[w]).join('')}${link ? '\n' + link : ''}`;
}

export async function copy(text: string, button: HTMLElement, done: string) {
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

export function sendChallenge(seed: string, g: number, button: HTMLElement) {
  const x = t();
  const text = `Kasva! ${x.challengeBy(nickName(app.save.nick))} ${seasonLabel(seed)} · ${num(g)} g\n${challengeLink(seed, g)}`;
  void copy(text, button, x.copiedChallenge);
  const out = challengeSent(app.save, seed, g, new Date().toISOString());
  app.save = out.save;
  persist();
  if (out.newAchievements.length) sound.badge();
}

// ---------- share sheet ----------

export function openShare() {
  if (!app.lastResult) return;
  const x = t();
  const r = app.lastResult;
  show('share');
  $('btn-copy-challenge').hidden = app.current.mode !== 'daily';
  const img = $<HTMLImageElement>('poster-preview');
  if (app.posterUrl) { img.src = app.posterUrl; return; }
  img.removeAttribute('src');
  // draw after the sheet is on screen, so the tap feels instant
  setTimeout(() => {
    const cv = renderPoster({
      scoreG: r.storedG, unit: x.posterUnit, label: seasonLabel(r.seed),
      who: `${nickName(app.save.nick)} · ${x.ranks[RANKS[rankIndex(app.save.co2LifetimeG)].id].name}`,
      weather: r.weather, rank: rankIndex(app.save.co2LifetimeG),
      callout: app.current.mode === 'daily' ? x.posterCallout : undefined,
    });
    cv.toBlob((b) => {
      if (!b) return;
      app.posterBlob = b;
      app.posterUrl = URL.createObjectURL(b);
      img.src = app.posterUrl;
      img.alt = `${x.shareTitle}: ${r.storedG} g`;
    }, 'image/png');
  }, 30);
}

/** The claude.ai viewer's own save prompt, when the game runs inside it. */
export type Downloads = { save(r: { filename: string; data: Blob }): Promise<{ status: string }> };

export async function sharePoster() {
  if (!app.posterBlob || !app.lastResult) return;
  const filename = `kasva-${app.lastResult.seed}.png`;
  const file = new File([app.posterBlob], filename, { type: 'image/png' });
  // 1. the phone's share sheet
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: shareText(app.lastResult) });
      if (app.current.mode === 'daily') { const out = challengeSent(app.save, app.lastResult.seed, app.lastResult.storedG, new Date().toISOString()); app.save = out.save; persist(); }
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return; // the player closed the sheet
  }
  // 2. inside the claude.ai viewer: its save prompt
  if (app.downloads) {
    try { await app.downloads.save({ filename, data: app.posterBlob }); } catch { $('t-savehint').classList.add('banner'); }
    return;
  }
  // 3. a plain download, then the press-and-hold hint
  const a = document.createElement('a');
  a.href = app.posterUrl!;
  a.download = filename;
  a.click();
  $('t-savehint').classList.add('banner');
}
