/**
 * Offline play and "add to home screen" (Phase 4). Only in the normal web
 * build: the single-file artifact has no service worker, so nothing here runs.
 *
 *  - The service worker (sw.js, written by vite.config.ts) keeps the game on
 *    the device after the first visit.
 *  - The install offer appears on the home screen only after the second
 *    finished season, never in the installed app, and "Not now" waits
 *    another 10 seasons. Android and desktop use the browser's own install
 *    prompt; iPad and iPhone get a short "Share → Add to Home Screen" card.
 *  - When a new version has been downloaded, the home screen offers "Update".
 */
import { getPart, setPart } from './storage';
const TEXT = {
  fi: {
    install: 'Asenna Kasva! – toimii ilman nettiä',
    later: 'Ei nyt',
    iosTitle: 'Lisää Kasva! kotivalikkoon',
    iosSteps: 'Napauta Safarin Jaa-painiketta ja valitse “Lisää Koti-valikkoon”. Sen jälkeen peli aukeaa omasta kuvakkeestaan ja toimii ilman nettiä.',
    ok: 'Selvä',
    update: 'Kasva!-pelistä on uusi versio.',
    updateBtn: 'Päivitä',
  },
  en: {
    install: 'Install Kasva! – works offline',
    later: 'Not now',
    iosTitle: 'Add Kasva! to your Home Screen',
    iosSteps: 'Tap Safari’s Share button and choose “Add to Home Screen”. The game then opens from its own icon and works without the internet.',
    ok: 'OK',
    update: 'A new version of Kasva! is ready.',
    updateBtn: 'Update',
  },
};

const enabled = typeof __PWA__ !== 'undefined' && __PWA__ && 'serviceWorker' in navigator;

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallPrompt | null = null;
let waiting: ServiceWorker | null = null;
let ctx = { seasons: () => 0, lang: (): 'fi' | 'en' => 'fi' };

const $ = (id: string) => document.getElementById(id)!;
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function laterUntil(): number {
  return Number(getPart<unknown>('install-later', 0)) || 0;
}

/** Update the home screen's install offer and update notice. Call whenever the home screen is drawn. */
export function renderPwa() {
  if (!enabled) return;
  const x = TEXT[ctx.lang()];
  const seasons = ctx.seasons();
  const offer = !standalone() && seasons >= 2 && seasons >= laterUntil() && (deferred !== null || ios());
  $('install').hidden = !offer;
  $('btn-install').textContent = x.install;
  $('btn-install-later').textContent = x.later;
  $('t-ios-title').textContent = x.iosTitle;
  $('t-ios-steps').textContent = x.iosSteps;
  $('btn-ios-ok').textContent = x.ok;
  $('update').hidden = waiting === null;
  $('t-update').textContent = x.update;
  $('btn-update').textContent = x.updateBtn;
}

function watch(reg: ServiceWorkerRegistration) {
  const found = (sw: ServiceWorker | null) => {
    // Only an update counts: on the very first visit there is no older version to replace.
    if (sw && navigator.serviceWorker.controller) { waiting = sw; renderPwa(); }
  };
  found(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    sw?.addEventListener('statechange', () => { if (sw.state === 'installed') found(sw); });
  });
}

export function initPwa(c: typeof ctx) {
  if (!enabled) return;
  ctx = c;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPrompt; renderPwa(); });
  window.addEventListener('appinstalled', () => { deferred = null; renderPwa(); });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(watch).catch(() => { /* no offline copy: the game still plays online */ });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (waiting && !reloading) { reloading = true; location.reload(); }
  });

  $('btn-install').addEventListener('click', async () => {
    if (deferred) {
      const d = deferred;
      deferred = null;
      await d.prompt();
      await d.userChoice.catch(() => null);
      renderPwa();
    } else if (ios()) {
      $('ios-install').hidden = false;
      $('btn-ios-ok').focus();
    }
  });
  $('btn-install-later').addEventListener('click', () => {
    setPart('install-later', ctx.seasons() + 10);
    renderPwa();
    $('btn-play').focus();
  });
  $('btn-ios-ok').addEventListener('click', () => { $('ios-install').hidden = true; $('btn-install').focus(); });
  $('ios-install').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); $('btn-ios-ok').click(); } });
  $('btn-update').addEventListener('click', () => waiting?.postMessage('skip-waiting'));
}
