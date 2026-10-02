/**
 * Landscape map and sandbox words (Phase 10), Finnish and English.
 */
import type { LandAnimal, StandKind, Zone } from '../../core/forest';
import type { Lang } from '../text';

const fi = {
  open: 'Kartta',
  title: 'Metsäsi ja naapurit',
  intro: 'Metsäsi on yksi kuvio kartalla. Ympärillä on naapurien metsiä, järvi, tie ja kylä. Valitse jokaiselle naapurimetsälle: hoidetaanko sitä vai suojellaanko se. Jotkut eläimet tarvitsevat monta metsää vierekkäin.',
  close: 'Sulje',
  caught: (n: number) => n > 0 ? `Naapurimetsät elivät ${n} vuotta siitä, kun katsoit viimeksi.` : '',
  making: 'Kartta piirretään…',
  cells: { home: 'Sinun metsäsi', lake: 'Järvi', road: 'Tie', village: 'Kylä' },
  stands: {
    oldSpruce: 'Vanha kuusikko', pineHeath: 'Kangasmännikkö', youngSpruce: 'Nuori kuusikko', bogPine: 'Rämemännikkö',
    mixed: 'Sekametsä', oldMixed: 'Vanha sekametsä', birch: 'Koivikko', clearcut: 'Taimikko hakkuun jälkeen',
    oldPine: 'Vanha männikkö', spruceAspen: 'Kuusi-haapametsä',
  } as Record<StandKind, string>,
  zones: { managed: 'Hoidetaan', protected: 'Suojellaan' } as Record<Zone, string>,
  zoneHow: {
    managed: 'Omistaja harventaa sen, kun se on tiheä, ja hakkaa sen, kun se on varttunut. Säästöpuita jätetään, ja tilalle istutetaan uusi metsä. Metsästä saa puuta.',
    protected: 'Metsä saa kasvaa ja vanheta rauhassa. Puita ei kaadeta, ja kaatuneet puut jäävät maahan. Metsästä ei saa puuta.',
  } as Record<Zone, string>,
  standInfo: (age: number, h: number, vol: number, main: string) => `Vanhin puu ${age} v · pisin ${h} m · puuta ${vol} m³/ha${main ? ' · eniten: ' + main.toLowerCase() : ''}`,
  animalsHere: (names: string) => names ? `Eläimiä: ${names}` : 'Ei vielä isoja eläinlajeja.',
  homeNote: 'Tätä metsää hoidat itse. Naapurimetsät elävät yhtä monta vuotta kuin sinun metsäsi.',
  zoneLabel: 'Mitä tälle metsälle tehdään?',
  landTitle: 'Eläimet, jotka tarvitsevat monta metsää',
  land: {
    flyingSquirrel: 'Liito-orava liitää puusta puuhun. Se tarvitsee vähintään kaksi vierekkäistä kuusimetsää, joista yhdessä on isoja haapoja pesäpuiksi. Tie, järvi tai avoin hakkuu katkaisee sen reitin.',
    capercaillie: 'Metso tarvitsee laajan alueen varttunutta männikköä: ainakin kolme mäntymetsää kartalla.',
    siberianJay: 'Kuukkeli tarvitsee vanhaa metsää vähintään kolmessa vierekkäisessä metsässä. Se asuu idässä ja pohjoisessa.',
  } as Record<LandAnimal, string>,
  lives: 'asuu täällä',
  notHere: 'ei asu täällä',
  suitable: (n: number, big: number) => `Sopivia metsiä ${n}, suurin yhtenäinen alue ${big}.`,
  notHerePlace: 'Kuukkeli ei asu Etelä-Suomessa.',
  legend: 'Pisteet kartalla: missä nämä eläimet asuvat.',
  cellLabel: (name: string, zone: string, animals: string) => `${name}${zone ? ', ' + zone.toLowerCase() : ''}${animals ? '. Asuu: ' + animals : ''}`,
  // the sandbox
  sandbox: 'Hiekkalaatikko',
  sandboxStart: 'Kokeile hiekkalaatikossa',
  sandboxIntro: 'Hiekkalaatikossa voit kokeilla mitä tahansa: istuttaa vapaasti ja tuoda kuivuuden, myrskyn tai kirjanpainajat. Tikka ei kysy mitään, eikä tämä metsä vaikuta omaan metsääsi.',
  sandboxBadge: 'Hiekkalaatikko',
  events: { drought: 'Kuiva kesä', storm: 'Myrsky', beetle: 'Kirjanpainajat' } as Record<'drought' | 'storm' | 'beetle', string>,
  eventSet: (what: string, year: number) => `${what} tulee vuonna ${year}.`,
  backToMine: 'Takaisin omaan metsään',
  newSandbox: 'Uusi hiekkalaatikko',
};

const en: typeof fi = {
  open: 'Map',
  title: 'Your forest and its neighbours',
  intro: 'Your forest is one stand on the map. Around it are neighbours\' forests, a lake, a road and the village. Choose for each neighbouring forest: is it managed or protected? Some animals need many forests side by side.',
  close: 'Close',
  caught: (n: number) => n > 0 ? `The neighbouring forests lived ${n} years since you last looked.` : '',
  making: 'Drawing the map…',
  cells: { home: 'Your forest', lake: 'Lake', road: 'Road', village: 'Village' },
  stands: {
    oldSpruce: 'Old spruce forest', pineHeath: 'Pine heath', youngSpruce: 'Young spruce forest', bogPine: 'Pine bog',
    mixed: 'Mixed forest', oldMixed: 'Old mixed forest', birch: 'Birch forest', clearcut: 'Seedlings after a harvest',
    oldPine: 'Old pine forest', spruceAspen: 'Spruce and aspen forest',
  },
  zones: { managed: 'Managed', protected: 'Protected' },
  zoneHow: {
    managed: 'The owner thins it when it is crowded and harvests it when it is mature, keeping a few retention trees, then plants a new forest. It gives wood.',
    protected: 'The forest grows and ages in peace. No trees are cut, and fallen trees stay on the ground. It gives no wood.',
  },
  standInfo: (age: number, h: number, vol: number, main: string) => `Oldest tree ${age} years · tallest ${h} m · wood ${vol} m³/ha${main ? ' · mostly ' + main.toLowerCase() : ''}`,
  animalsHere: (names: string) => names ? `Animals: ${names}` : 'No large animal species yet.',
  homeNote: 'You look after this forest yourself. The neighbouring forests live as many years as yours.',
  zoneLabel: 'What happens to this forest?',
  landTitle: 'Animals that need many forests',
  land: {
    flyingSquirrel: 'The flying squirrel glides from tree to tree. It needs at least two neighbouring spruce forests, one with big aspens to nest in. A road, a lake or an open clearcut cuts its way.',
    capercaillie: 'The capercaillie needs a large area of mature pine forest: at least three pine forests on the map.',
    siberianJay: 'The Siberian jay needs old forest in at least three neighbouring stands. It lives in the east and the north.',
  },
  lives: 'lives here',
  notHere: 'not here',
  suitable: (n: number, big: number) => `Suitable forests: ${n}, biggest connected area: ${big}.`,
  notHerePlace: 'The Siberian jay does not live in Southern Finland.',
  legend: 'Dots on the map: where these animals live.',
  cellLabel: (name: string, zone: string, animals: string) => `${name}${zone ? ', ' + zone.toLowerCase() : ''}${animals ? '. Home to: ' + animals : ''}`,
  sandbox: 'Sandbox',
  sandboxStart: 'Try the sandbox',
  sandboxIntro: 'In the sandbox you can try anything: plant freely and bring a drought, a storm or bark beetles. Tikka asks nothing, and this forest does not change your own.',
  sandboxBadge: 'Sandbox',
  events: { drought: 'Dry summer', storm: 'Storm', beetle: 'Bark beetles' },
  eventSet: (what: string, year: number) => `${what} comes in year ${year}.`,
  backToMine: 'Back to my forest',
  newSandbox: 'New sandbox',
};

export const MAP_TEXT: Record<Lang, typeof fi> = { fi, en };
