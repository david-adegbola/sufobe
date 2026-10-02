/**
 * Village and Carbon Thread words (Phase 9), Finnish and English.
 * Years are shown the way the forest clock shows them (forest year + 1).
 */
import type { BuildingId, Fate, HistoryWhat, ThingId } from '../../core/forest';
import type { Route } from '../../core/forest';
import type { Lang } from '../text';

const fiThing: Record<ThingId, [string, string]> = {
  beam: ['hirsi', 'hirttä'], table: ['pöytä', 'pöytää'], shelf: ['lastulevyhylly', 'lastulevyhyllyä'],
  notebook: ['vihko', 'vihkoa'], box: ['pahvilaatikko', 'pahvilaatikkoa'], shirt: ['paita', 'paitaa'], sauna: ['saunailta', 'saunailtaa'],
};
const enThing: Record<ThingId, [string, string]> = {
  beam: ['house beam', 'house beams'], table: ['table', 'tables'], shelf: ['particleboard shelf', 'particleboard shelves'],
  notebook: ['notebook', 'notebooks'], box: ['cardboard box', 'cardboard boxes'], shirt: ['shirt', 'shirts'], sauna: ['sauna evening', 'sauna evenings'],
};

/** Whole things where there is at least one; a part of one only when there is less. */
const roundN = (n: number) => n >= 1 ? Math.round(n) : Math.round(n * 10) / 10;
const fiCount = (n: number, th: ThingId) => `${String(roundN(n)).replace('.', ',')} ${roundN(n) === 1 ? fiThing[th][0] : fiThing[th][1]}`;
const enCount = (n: number, th: ThingId) => `${roundN(n)} ${roundN(n) === 1 ? enThing[th][0] : enThing[th][1]}`;

const fi = {
  open: 'Kylä',
  title: 'Kylä',
  intro: 'Kylä tarvitsee tavaroita, ja ne voivat tulla sinun metsästäsi. Vie metsän tuotteita sinne, missä niitä tarvitaan. Kun jokin kuluu loppuun, sinä päätät, mitä sille tapahtuu.',
  close: 'Sulje',
  buildings: {
    house: 'Uusi talo', cafe: 'Kahvila', school: 'Koulu', shop: 'Kauppa', club: 'Urheiluseura', sauna: 'Sauna',
  } as Record<BuildingId, string>,
  to: {
    house: 'uuteen taloon', cafe: 'kahvilaan', school: 'kouluun', shop: 'kauppaan', club: 'urheiluseuralle', sauna: 'saunaan',
  } as Record<BuildingId, string>,
  at: {
    house: 'uudessa talossa', cafe: 'kahvilassa', school: 'koulussa', shop: 'kaupassa', club: 'urheiluseurassa', sauna: 'saunassa',
  } as Record<BuildingId, string>,
  needs: (n: string) => `Tarvitsee: ${n}`,
  ready: (n: string) => `Metsäsi varastossa: ${n}`,
  noneReady: 'Metsästäsi ei ole vielä näitä. Harvenna tai hakkaa, niin puusta tulee tuotteita.',
  give: (n: string) => `Vie ${n}`,
  saunaNeed: (got: string, n: string) => `Lämmitetty polttamalla vanhoja tavaroita: ${got} / ${n} iltaa`,
  saunaHow: 'Kun jokin tavara kuluu loppuun, voit polttaa sen saunan lämmöksi.',
  level: (k: number) => k > 1 ? `${k} tarvetta täytetty` : k === 1 ? '1 tarve täytetty' : '',
  met: (b: string) => `${b} kiittää! Seuraava tarve on vähän isompi.`,
  gave: (n: string, to: string) => `Veit ${to} ${n}.`,
  inUse: 'Käytössä kylässä',
  worn: 'Kulunut loppuun: mitä nyt?',
  wornWait: (y: number) => y > 0 ? `Jos et päätä, kylä polttaa sen lämmöksi ${y} vuoden päästä.` : 'Kylä polttaa sen lämmöksi pian.',
  objectLine: (n: string, at: string, tree: string) => `${n} ${at} · ${tree}`,
  fromTree: (sp: string, year: number) => `puusta (${sp.toLowerCase()}), joka kaadettiin vuonna ${year}`,
  yearsLeft: (y: number) => `kestää vielä noin ${y} vuotta`,
  more: (n: number) => `ja ${n} muuta`,
  fates: {
    repair: 'Korjaa', reuse: 'Käytä uudelleen', recycle: 'Kierrätä', burn: 'Polta saunassa',
  } as Record<Fate, string>,
  fateHow: {
    repair: (th: ThingId): string => th === 'shirt' ? 'Anna eteenpäin: joku muu käyttää sitä vielä.' : 'Korjattu tavara on käytössä pidempään, ja hiili pysyy siinä.',
    reuse: (th: ThingId): string => th === 'beam' ? 'Vanhasta hirrestä tehdään kahvilaan pöytä. Vähän puuta menee pölyksi.' : 'Vanhasta pöydästä tehdään lastulevyhylly koululle.',
    recycle: (): string => 'Kuitu kierrätetään uudeksi pahviksi. Osa kuidusta menee hukkaan.',
    burn: (): string => 'Lämpöä saunaan. Kaikki sen hiili palaa ilmaan.',
  },
  followThread: 'Seuraa hiilen lankaa',
  mineTitle: 'Puita, joiden kesän pelasit:',
  mineTree: (sp: string, n: number) => `${sp} · ${n === 1 ? '1 pelattu kesä' : `${n} pelattua kesää`}`,
  // the Carbon Thread
  threadTitle: (th: string) => `Hiilen lanka: ${th}`,
  threadTreeTitle: (sp: string) => `Hiilen lanka: ${sp}`,
  tree: (sp: string, born: number, cut: number, age: number, d: string) => `${sp}, joka alkoi kasvaa vuonna ${born} ja kaadettiin vuonna ${cut}, ${age}-vuotiaana. Rungon paksuus ${d} cm.`,
  played: (n: number) => n ? `Kultaiset lustot ovat kesiä, jotka pelasit tänä puuna (${n}).` : 'Et pelannut tämän puun kesiä. Koivun kortista voit pelata koivun kesän Kasva!-pelissä.',
  steps: {
    air: (from: number, to: number) => `Vuodet ${from}–${to}: puu sitoi hiilen ilmasta hiilidioksidina ja rakensi siitä puuta, lusto lustolta.`,
    summer: (year: number, mm: string) => `Vuosi ${year}: sinä pelasit tämän kesän. Siitä jäi ${mm} mm:n lusto.`,
    cut: (year: number) => `Vuosi ${year}: puu kaadettiin.`,
    mill: {
      saw: 'Tukki meni sahalle.', pulp: 'Kuitupuu meni sellutehtaalle.', energy: 'Energiapuu meni biojalostamoon.', residue: 'Oksat ja latvat menivät biojalostamoon.',
    } as Record<Route, string>,
    event: {
      delivered: (y: number, n: string, to: string) => `Vuosi ${y}: ${n} vietiin ${to}.`,
      repaired: (y: number, n: string) => `Vuosi ${y}: ${n} korjattiin.`,
      reused: (y: number, n: string, to: string) => `Vuosi ${y}: siitä tehtiin ${n} ${to}.`,
      recycled: (y: number, n: string) => `Vuosi ${y}: kuitu kierrätettiin, ja siitä tuli ${n}.`,
      burned: (y: number, n: string) => `Vuosi ${y}: ${n} poltettiin saunan lämmöksi. Hiili palasi ilmaan.`,
      autoBurned: (y: number, n: string) => `Vuosi ${y}: kukaan ei päättänyt, joten kylä poltti ${n} lämmöksi. Hiili palasi ilmaan.`,
    } as Record<HistoryWhat, (y: number, n: string, b: string) => string>,
    nowIn: (n: string, kg: string, at: string) => `Nyt: hiili on yhä tallessa ${at} (${n}, ${kg} kg CO₂).`,
    nowAir: 'Nyt: hiili on taas ilmassa. Ehkä jokin puu sitoo sen uudelleen.',
  },
  nowTitle: 'Missä tämän puun hiili on nyt?',
  now: { village: 'kylässä', stock: 'tuotteissa muualla', forest: 'metsässä (kanto, juuret, oksat)', air: 'ilmassa' },
  back: 'Takaisin kylään',
  // your birch's gift
  giveButton: 'Anna koivusi kylälle',
  giveQ: 'Koivusi on iso. Haluatko, että siitä tehdään jotain kylään? Se kaadetaan, ja lähin nuori koivu jatkaa sen paikalla. Pelaamasi kesät kulkevat puun mukana.',
  giveYes: 'Kyllä, anna se',
  giveNo: 'Ei vielä',
  gaveBirch: (list: string) => `Koivustasi tuli: ${list}. Vie ne kylään!`,
  count: fiCount,
};

const en: typeof fi = {
  open: 'Village',
  title: 'The village',
  intro: 'The village needs things, and they can come from your forest. Take your forest\'s products where they are needed. When something wears out, you decide what happens to it.',
  close: 'Close',
  buildings: {
    house: 'New house', cafe: 'Café', school: 'School', shop: 'Shop', club: 'Sports club', sauna: 'Sauna',
  },
  to: { house: 'to the new house', cafe: 'to the café', school: 'to the school', shop: 'to the shop', club: 'to the sports club', sauna: 'to the sauna' },
  at: { house: 'in the new house', cafe: 'at the café', school: 'at the school', shop: 'at the shop', club: 'at the sports club', sauna: 'at the sauna' },
  needs: (n: string) => `Needs: ${n}`,
  ready: (n: string) => `In your forest's stock: ${n}`,
  noneReady: 'Your forest has none of these yet. Thin or harvest, and the wood becomes products.',
  give: (n: string) => `Take ${n}`,
  saunaNeed: (got: string, n: string) => `Warmed by burning old things: ${got} / ${n} evenings`,
  saunaHow: 'When something wears out, you can burn it to heat the sauna.',
  level: (k: number) => k > 1 ? `${k} needs met` : k === 1 ? '1 need met' : '',
  met: (b: string) => `Thank you from the ${b.toLowerCase()}! The next need is a little bigger.`,
  gave: (n: string, to: string) => `You took ${n} ${to}.`,
  inUse: 'In use in the village',
  worn: 'Worn out: what now?',
  wornWait: (y: number) => y > 0 ? `If you don't decide, the village burns it for heat in ${y} years.` : 'The village will burn it for heat soon.',
  objectLine: (n: string, at: string, tree: string) => `${n} ${at} · ${tree}`,
  fromTree: (sp: string, year: number) => `from a ${sp.toLowerCase()} cut in year ${year}`,
  yearsLeft: (y: number) => `lasts about ${y} more years`,
  more: (n: number) => `and ${n} more`,
  fates: { repair: 'Repair', reuse: 'Reuse', recycle: 'Recycle', burn: 'Burn in the sauna' },
  fateHow: {
    repair: (th: ThingId) => th === 'shirt' ? 'Hand it down: someone else wears it for a while.' : 'A repaired thing stays in use for longer, and its carbon stays in it.',
    reuse: (th: ThingId) => th === 'beam' ? 'The old beam becomes a café table. A little wood is lost as dust.' : 'The old table becomes a particleboard shelf for the school.',
    recycle: () => 'The fibre is recycled into new cardboard. Some fibre is lost.',
    burn: () => 'Heat for the sauna. All its carbon goes back to the air.',
  },
  followThread: 'Follow the carbon thread',
  mineTitle: 'Trees whose summers you played:',
  mineTree: (sp: string, n: number) => `${sp} · ${n === 1 ? '1 summer' : `${n} summers`} played`,
  threadTitle: (th: string) => `The carbon thread: ${th}`,
  threadTreeTitle: (sp: string) => `The carbon thread: ${sp}`,
  tree: (sp: string, born: number, cut: number, age: number, d: string) => `A ${sp.toLowerCase()} that began to grow in year ${born} and was cut in year ${cut}, at ${age} years old. Its trunk was ${d} cm thick.`,
  played: (n: number) => n ? `The gold rings are summers you played as this tree (${n}).` : 'You did not play this tree\'s summers. From a birch\'s card you can play its summer in Kasva!.',
  steps: {
    air: (from: number, to: number) => `Years ${from}–${to}: the tree took carbon from the air as carbon dioxide and built wood from it, ring by ring.`,
    summer: (year: number, mm: string) => `Year ${year}: you played this summer. It left a ring ${mm} mm wide.`,
    cut: (year: number) => `Year ${year}: the tree was cut.`,
    mill: { saw: 'The sawlog went to the sawmill.', pulp: 'The pulpwood went to the pulp mill.', energy: 'The energy wood went to the biorefinery.', residue: 'The branches and tops went to the biorefinery.' },
    event: {
      delivered: (y: number, n: string, to: string) => `Year ${y}: ${n} went ${to}.`,
      repaired: (y: number, n: string) => `Year ${y}: ${n} repaired.`,
      reused: (y: number, n: string, to: string) => `Year ${y}: it became ${n}, ${to.replace(/^to /, 'for ')}.`,
      recycled: (y: number, n: string) => `Year ${y}: the fibre was recycled into ${n}.`,
      burned: (y: number, n: string) => `Year ${y}: ${n} burned to heat the sauna. The carbon went back to the air.`,
      autoBurned: (y: number, n: string) => `Year ${y}: nobody decided, so the village burned ${n} for heat. The carbon went back to the air.`,
    },
    nowIn: (n: string, kg: string, at: string) => `Now: the carbon is still kept ${at} (${n}, ${kg} kg CO₂).`,
    nowAir: 'Now: the carbon is back in the air. Maybe a tree will catch it again.',
  },
  nowTitle: 'Where is this tree\'s carbon now?',
  now: { village: 'in the village', stock: 'in products elsewhere', forest: 'in the forest (stump, roots, branches)', air: 'in the air' },
  back: 'Back to the village',
  giveButton: 'Give your birch to the village',
  giveQ: 'Your birch is big. Would you like something to be made from it for the village? It will be cut, and the nearest young birch takes its place. The summers you played go with its wood.',
  giveYes: 'Yes, give it',
  giveNo: 'Not yet',
  gaveBirch: (list: string) => `Your birch became: ${list}. Take them to the village!`,
  count: enCount,
};

export const VILLAGE_TEXT: Record<Lang, typeof fi> = { fi, en };
