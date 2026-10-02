/**
 * The Forest Atlas (Phase 6): one collection for the whole game, in place of
 * the badge cards. Five pages: badges from Kasva!, the tree species, the
 * animals, things that happen in a forest, and products made from your own
 * trees. Entries are found by playing: Kasva! summers find heatwaves and the
 * white night, and every forest you grow finds species, animals, events and
 * products. Locked entries say how to find them.
 *
 * Found entries are kept in the world save (part "atlas"), with whether the
 * player has seen them yet, so the Atlas button can count new ones.
 */
import { ANIMALS, ITEMS, type AnimalId, type Forest, type ItemId, type SpeciesId } from '../core/forest';
import { ACHIEVEMENTS } from '../core/progress';
import type { SeasonResult } from '../core/season';
import { itemIcon } from './forest/mills';
import { FOREST_TEXT } from './forest/text';
import { getPart, setPart } from './storage';
import { TEXT, type Lang } from './text';

export type AtlasPage = 'badges' | 'species' | 'animals' | 'events' | 'products';
export const PAGES: AtlasPage[] = ['badges', 'species', 'animals', 'events', 'products'];

const SPECIES_IDS: SpeciesId[] = ['pine', 'spruce', 'birch', 'aspen'];
export const EVENTS = ['heatwave', 'whiteNight', 'drought', 'storm', 'beetle', 'moose'] as const;
export type AtlasEvent = (typeof EVENTS)[number];

export const ATLAS_TEXT = {
  fi: {
    title: 'Metsäatlas',
    button: 'Atlas',
    buttonNew: (n: number) => `Atlas (${n} uutta)`,
    pages: { badges: 'Merkit', species: 'Puut', animals: 'Eläimet', events: 'Metsässä', products: 'Tuotteet' } as Record<AtlasPage, string>,
    found: (n: number, total: number) => `Löydetty ${n} / ${total}`,
    locked: 'Ei vielä löydetty',
    isNew: 'Uusi!',
    how: {
      species: 'Kasvata tätä puulajia metsässäsi, tai odota, että se tulee itsestään.',
      animals: 'Tämä eläin tulee metsääsi, kun siellä on sille sopiva paikka.',
      events: 'Tämä tapahtuu joskus itsestään. Pelaa, niin näet sen.',
      products: 'Tee tämä tuote omista puistasi: kaada puita ja vie rungot tehtaalle.',
    },
    made: (n: string) => `Tehty omista puistasi: ${n}`,
    events: {
      heatwave: ['Helle', 'Kuumalla lehdet haihduttavat paljon vettä. Puu säästää vettä sulkemalla ilmarakonsa, ja silloin se ei myöskään saa hiilidioksidia.'],
      whiteNight: ['Yötön yö', 'Juhannuksen aikaan yöt ovat Suomessa niin valoisia, että lehdet saavat valoa vielä myöhään illalla.'],
      drought: ['Kuiva kesä', 'Kuivana kesänä puut sulkevat ilmarakojaan säästääkseen vettä, ja sen vuoden vuosilusto jää ohueksi.'],
      storm: ['Myrsky', 'Tuuli kaataa helpoimmin matalajuurisia kuusia. Kaatuneet rungot ovat ruokaa ja kotia monille hyönteisille ja sienille.'],
      beetle: ['Kirjanpainaja', 'Pieni kaarnakuoriainen, joka iskee heikentyneisiin kuusiin, usein kuivan ja lämpimän kesän jälkeen.'],
      moose: ['Hirven talvi', 'Talvella hirvi syö nuorten puiden latvoja ja oksia. Syöty taimi kasvaa hitaammin.'],
    } as Record<AtlasEvent, [string, string]>,
  },
  en: {
    title: 'Forest Atlas',
    button: 'Atlas',
    buttonNew: (n: number) => `Atlas (${n} new)`,
    pages: { badges: 'Badges', species: 'Trees', animals: 'Animals', events: 'In the forest', products: 'Products' } as Record<AtlasPage, string>,
    found: (n: number, total: number) => `Found ${n} / ${total}`,
    locked: 'Not found yet',
    isNew: 'New!',
    how: {
      species: 'Grow this tree in your forest, or wait for it to come by itself.',
      animals: 'This animal comes to your forest when there is a good place for it.',
      events: 'This happens now and then. Keep playing and you will see it.',
      products: 'Make this from your own trees: fell some and send the trunks to the mill.',
    },
    made: (n: string) => `Made from your trees: ${n}`,
    events: {
      heatwave: ['Heatwave', 'In the heat, leaves lose a lot of water. The tree saves water by closing its stomata, and then it takes in no carbon dioxide either.'],
      whiteNight: ['White night', 'Around Midsummer, Finnish nights are so light that leaves still get light late in the evening.'],
      drought: ['Dry summer', 'In a dry summer, trees close their stomata to save water, and that year’s tree ring stays thin.'],
      storm: ['Storm', 'Wind topples shallow-rooted spruces most easily. Fallen trunks become food and homes for many insects and fungi.'],
      beetle: ['Spruce bark beetle', 'A small beetle that attacks weakened spruces, often after a dry, warm summer.'],
      moose: ['Moose in winter', 'In winter, moose eat the tips and twigs of young trees. A browsed sapling grows more slowly.'],
    } as Record<AtlasEvent, [string, string]>,
  },
};

// ---------- what has been found ----------

/** Found entries: id → true once the player has seen it in the Atlas, false while new. */
type Found = Record<string, boolean>;

const load = (): Found => getPart<Found>('atlas', {});

/** Record entries as found. Returns the ones that are new. */
export function discover(ids: string[]): string[] {
  const found = load();
  const fresh = ids.filter(id => !(id in found));
  if (!fresh.length) return [];
  for (const id of fresh) found[id] = false;
  setPart('atlas', found);
  return fresh;
}

/** What a Kasva! summer shows: a heatwave, a white night, and the birch itself. */
export function seasonFinds(r: SeasonResult): string[] {
  const out = ['sp:birch'];
  if (r.weather.includes('heat')) out.push('ev:heatwave');
  if (r.midsummerNightCatches > 0) out.push('ev:whiteNight');
  return out;
}

/** What a forest has shown so far: its trees, animals, events and products. */
export function forestFinds(f: Forest): string[] {
  const out = new Set<string>();
  for (const t of f.trees) out.add('sp:' + t.sp);
  for (const s of f.seen) out.add('an:' + s.animal);
  for (const e of f.events) out.add('ev:' + e.kind);
  for (const r of f.receipts) if (r.n >= 0.5) out.add('it:' + r.item);
  return [...out];
}

/** How many found entries the player has not looked at yet (badges count as soon as earned). */
export function newCount(): number {
  return Object.values(load()).filter(seen => !seen).length;
}

function markSeen(ids: string[]) {
  const found = load();
  let changed = false;
  for (const id of ids) if (found[id] === false) { found[id] = true; changed = true; }
  if (changed) setPart('atlas', found);
}

// ---------- the screen ----------

export interface Entry { id: string; name: string; text: string; found: boolean; isNew: boolean; icon: string }

const dot = (cls: string) => `<span class="atlas-dot ${cls}" aria-hidden="true"></span>`;

/** The entries of one page, in the player's language. `badges` are the Kasva! achievements already earned. */
export function entries(page: AtlasPage, lang: Lang, badges: string[], madeCounts: Partial<Record<ItemId, number>> = {}): Entry[] {
  const a = ATLAS_TEXT[lang];
  const ft = FOREST_TEXT[lang];
  const found = load();
  const e = (id: string, name: string, text: string, how: string, icon: string): Entry => {
    const isFound = page === 'badges' ? badges.includes(id) : id in found;
    return { id, name, text: isFound ? text : how, found: isFound, isNew: found[id] === false, icon };
  };
  switch (page) {
    case 'badges': {
      const all = TEXT[lang].achievements as Record<string, { name: string; how: string; fact: string }>;
      return ACHIEVEMENTS.map(x => e(x.id, all[x.id].name, all[x.id].fact, all[x.id].how, dot('leafdot')));
    }
    case 'species':
      return SPECIES_IDS.map(sp => e('sp:' + sp, ft.species[sp].name, `${ft.species[sp].name}: ${ft.species[sp].words}.`, a.how.species, dot('sp-' + sp)));
    case 'animals':
      return ANIMALS.map((an: AnimalId) => e('an:' + an, ft.animals[an][0], ft.animals[an][1], a.how.animals, dot('an')));
    case 'events':
      return EVENTS.map(ev => e('ev:' + ev, a.events[ev][0], a.events[ev][1], a.how.events, dot('ev-' + ev)));
    case 'products':
      return ITEMS.map(it => {
        const n = madeCounts[it];
        const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
        const text = `${cap(ft.items[it][2])}.` + (n ? ' ' + a.made(String(Math.round(n))) : '');
        return e('it:' + it, cap(ft.items[it][0]), text, a.how.products, itemIcon(it, 34));
      });
  }
}

/** Looking at a page marks its new entries as seen. */
export function seePage(page: AtlasPage, list: Entry[]) {
  if (page !== 'badges') markSeen(list.filter(x => x.found).map(x => x.id));
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Draw the Atlas screen on one page, with one entry opened if `selected` is given. */
export function renderAtlas(page: AtlasPage, lang: Lang, badges: string[], madeCounts: Partial<Record<ItemId, number>>, selected?: string) {
  const a = ATLAS_TEXT[lang];
  $('t-cards').textContent = a.title;
  $('atlas-tabs').innerHTML = PAGES.map(p =>
    `<button type="button" role="tab" id="atlas-tab-${p}" data-atlas-page="${p}" aria-selected="${p === page}" tabindex="${p === page ? 0 : -1}">${a.pages[p]}</button>`).join('');
  $('cardgrid').setAttribute('aria-labelledby', `atlas-tab-${page}`);
  const list = entries(page, lang, badges, madeCounts);
  $('atlas-count').textContent = a.found(list.filter(x => x.found).length, list.length);
  $('cardgrid').innerHTML = list.map(x =>
    `<button type="button" class="atlas-entry${x.found ? '' : ' locked'}" data-atlas-entry="${x.id}" data-atlas-on="${page}" aria-pressed="${x.id === selected}">` +
    `${x.icon}<span>${x.found ? x.name : a.locked}</span>${x.found && x.isNew ? `<span class="new">${a.isNew}</span>` : ''}</button>`).join('');
  const fact = $('fact');
  const sel = list.find(x => x.id === selected);
  fact.hidden = !sel;
  if (sel) fact.innerHTML = `<h3>${sel.found ? sel.name : a.locked}</h3><p>${sel.text}</p>`;
  seePage(page, list);
}
