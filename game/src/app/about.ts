/** About: privacy, terms and credits, moving progress between devices, backup files and deleting data. */
import { num } from './format';
import { forgetCache } from './storage';
import { RANKS, rankIndex } from '../core/progress';
import { QUIZ_UI, quizOn, summaryHtml } from './forest/quiz';
import { decodeTransfer, encodeTransfer, makeBackup, qrSvg, restoreBackup } from './transfer';
import { aboutSections } from './legal';
import { announce } from './screens';
import { shareBase } from './share';
import { $, LANG_KEY, SOUND_KEY, app, persist, renderer, shell, sound, store, t, ui } from './state';

// ---------- about, privacy and data ----------

export function renderAbout() {
  const u = ui();
  $('t-about').textContent = u.title;
  $('about-sections').innerHTML = aboutSections(app.lang).map((sec) =>
    `<details id="about-${sec.id}"><summary>${sec.title}</summary>${sec.body.map((p) => `<p>${p}</p>`).join('')}</details>`).join('');
  $('t-data').textContent = u.dataTitle;
  $('t-testlog').textContent = u.testlog;
  $<HTMLInputElement>('opt-testlog').checked = app.testLogOn;
  $('t-quiz').textContent = QUIZ_UI[app.lang].toggle;
  $<HTMLInputElement>('opt-quiz').checked = quizOn();
  $('quiz-summary').innerHTML = `<h4 style="margin:4px 0;font:800 0.95rem/1.2 var(--display)">${QUIZ_UI[app.lang].summaryTitle}</h4>${summaryHtml(app.lang)}`;
  $('btn-quiz-clear').textContent = QUIZ_UI[app.lang].clear;
  $('btn-delete').textContent = u.del;
  $('t-transfer').textContent = u.transferTitle;
  $('t-transfer-intro').textContent = u.transferIntro;
  $('btn-show-code').textContent = u.showCode;
  $('t-code-label').textContent = u.showCode;
  $('btn-copy-code').textContent = u.copyCode;
  $('btn-copy-link').textContent = u.copyLink;
  $('btn-copy-link').hidden = !shareBase();
  $('t-paste').textContent = u.pasteLabel;
  $('btn-import').textContent = u.importButton;
  $('btn-import-yes').textContent = u.importYes;
  $('btn-import-no').textContent = u.importNo;
  $('t-backup').textContent = u.backupTitle;
  $('t-backup-intro').textContent = u.backupIntro;
  $('btn-backup-save').textContent = u.backupSave;
  $('t-backup-load').textContent = u.backupLoad;
  $('t-delconfirm').textContent = u.delConfirm;
  $('btn-del-yes').textContent = u.delYes;
  $('btn-del-no').textContent = u.delNo;
  $('btn-about-close').textContent = t().close;
}

// ---------- moving progress between devices ----------

export function transferLink(code: string) {
  const base = shareBase();
  return base ? `${base}#t-${code}` : '';
}

export async function showTransferCode() {
  const code = await encodeTransfer({ save: app.save, lang: app.lang, sound: !sound.muted });
  const link = transferLink(code);
  $<HTMLTextAreaElement>('transfer-code-text').value = code;
  $('transfer-qr').innerHTML = qrSvg(link || code, ui().qrLabel);
  $('transfer-out').hidden = false;
}

export function askImport(p: NonNullable<typeof app.pendingImport>) {
  app.pendingImport = p;
  const u = ui();
  $('transfer-msg').textContent = '';
  if (p.kind === 'code') {
    const x = t();
    $('t-importconfirm').textContent = u.importConfirm(x.ranks[RANKS[rankIndex(p.t.save.co2LifetimeG)].id].name,
      num(p.t.save.co2LifetimeG / 1000, 1));
  } else {
    $('t-importconfirm').textContent = u.backupConfirm;
  }
  $('btn-import-yes').textContent = p.kind === 'code' ? u.importYes : u.restoreYes;
  $('import-confirm').hidden = false;
  $('btn-import-no').focus();
}

export async function importCode(code: string) {
  const tr = await decodeTransfer(code);
  if (!tr) { $('transfer-msg').textContent = ui().importBad; return; }
  askImport({ kind: 'code', t: tr });
}

export function confirmImport() {
  const p = app.pendingImport;
  if (!p) return;
  app.pendingImport = null;
  $('import-confirm').hidden = true;
  if (p.kind === 'file') {
    try { restoreBackup(p.data); } catch { /* storage blocked */ }
    announce(ui().restored);
    location.hash = '';
    location.reload();
    return;
  }
  app.save = p.t.save;
  persist();
  if (p.t.lang === 'fi' || p.t.lang === 'en') { app.lang = p.t.lang; store(LANG_KEY, app.lang); }
  if (typeof p.t.sound === 'boolean') { sound.setMuted(!p.t.sound); store(SOUND_KEY, p.t.sound); }
  renderer.setRank(rankIndex(app.save.co2LifetimeG));
  history.replaceState(null, '', location.pathname + location.search);
  shell.renderText();
  $('transfer-msg').textContent = ui().imported;
  announce(ui().imported);
}

export async function saveBackup(button: HTMLElement) {
  const blob = new Blob([JSON.stringify(makeBackup())], { type: 'application/json' });
  const filename = `kasva-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (app.downloads) {
    try { await app.downloads.save({ filename, data: blob }); } catch { /* declined */ }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  void button;
}

/** Delete everything this game stored in this browser, then start fresh. */
export function deleteAllData() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('kasva-')) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* storage blocked: nothing was stored either */ }
  forgetCache();
  announce(ui().deleted);
  location.hash = '';
  location.reload();
}
