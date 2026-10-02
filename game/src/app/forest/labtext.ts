/**
 * Question card words (Phase 8), Finnish and English. Each "why" explains
 * what the game's model does, in words a 10–12-year-old can follow, and
 * says so where the real world is more complicated. The answers themselves
 * come from the model (core/forest/experiments.ts), never from this file.
 */
import type { MeasureId } from '../../core/forest';
import type { Lang } from '../text';

export interface CardText {
  title: string;
  q: string;
  a: string;
  b: string;
  why: string;
}

type CardId =
  | 'soil' | 'sandPine' | 'lapland' | 'climate2080' | 'beetle' | 'moose'
  | 'thinning' | 'dense' | 'mixed' | 'woodpecker' | 'peat' | 'continuous';

const fiCards: Record<CardId, CardText> = {
  soil: {
    title: 'Hiekka vai savi?',
    q: 'Kuusi hiekkamaalla tai savimaalla: kumpi sitoo puihinsa enemmän hiiltä 40 vuodessa?',
    a: 'Hiekkamaa', b: 'Savimaa',
    why: 'Savi pidättää paljon vettä, ja siinä on enemmän ravinteita. Hiekasta sadevesi valuu pois, ja ravinteita on vähän, joten kuusi kasvaa siellä hitaasti. Kuusi tarvitsee rehevän ja kostean maan.',
  },
  sandPine: {
    title: 'Kuiva kangas',
    q: 'Kuivalla hiekkamaalla: kumpi kasvattaa enemmän puuta 50 vuodessa, kuusi vai mänty?',
    a: 'Kuusi', b: 'Mänty',
    why: 'Mänty pärjää kuivalla ja karulla maalla. Sen juuret ulottuvat syvälle, ja se tarvitsee vähemmän vettä. Kuusen juuret ovat matalalla, ja se kärsii kuivina kesinä. Siksi kuivat hiekkakankaat ovat usein mäntymetsiä.',
  },
  lapland: {
    title: 'Etelä vai Lappi?',
    q: 'Sama männikkö Etelä-Suomessa ja Lapissa: kummassa on enemmän puuta 50 vuoden päästä?',
    a: 'Etelä-Suomi', b: 'Lappi',
    why: 'Lapissa kesä on lyhyt ja viileä. Puut kasvavat vain, kun on tarpeeksi lämmintä, joten Lapin mänty kasvaa paljon hitaammin. Se voi silti elää satoja vuosia.',
  },
  climate2080: {
    title: 'Ilmasto vuonna 2080',
    q: 'Männikkö nykyilmastossa ja lämpimämmässä, vuoden 2080 kaltaisessa ilmastossa: kumpi sitoo puihinsa enemmän hiiltä 60 vuodessa?',
    a: 'Nykyilmasto', b: 'Ilmasto 2080',
    why: 'Pelin 2080-ilmastossa kasvukausi on pidempi ja lämpimämpi, joten mänty kasvaa nopeammin, vaikka kuivia kesiä on enemmän. Lämpö auttaa myös tuholaisia: kokeile kirjanpainajakorttia. Tutkijat selvittävät yhä, miten Suomen metsät oikeasti muuttuvat.',
  },
  beetle: {
    title: 'Kirjanpainaja',
    q: 'Lämpimässä ilmastossa: kumpi menettää enemmän puita kirjanpainajille, kuusikko vai männikkö?',
    a: 'Kuusikko', b: 'Männikkö',
    why: 'Kirjanpainaja on kuusen kaarnakuoriainen. Se iskee kuivuuden heikentämiin isoihin kuusiin ja lisääntyy tuoreessa kuolleessa kuusessa. Lämpimät ja kuivat kesät auttavat sitä. Mänty ei ole sen ruokaa.',
  },
  moose: {
    title: 'Hirven talviruoka',
    q: 'Nuoret kuuset vai nuoret männyt ja koivut: kumpia hirvet syövät enemmän 15 vuodessa?',
    a: 'Kuusi', b: 'Mänty ja koivu',
    why: 'Talvella hirvi syö nuorten mäntyjen, koivujen, haapojen ja pajujen versoja. Kuusta se syö harvoin. Syödyltä taimelta katoaa kesän kasvu, ja siitä voi tulla mutkainen.',
  },
  thinning: {
    title: 'Harvennus',
    q: 'Tiheä 35-vuotias kuusikko: jos sitä harvennetaan, kasvavatko jäljelle jäävät puut nopeammin paksuutta?',
    a: 'Ei harvenneta', b: 'Harvennetaan',
    why: 'Harvennus vie osan puista, joten jäljelle jäävät saavat enemmän valoa, vettä ja ravinteita. Niiden vuosilustot levenevät. Mutta metsässä on nyt vähemmän puita: vertaa puun määrää kummassakin!',
  },
  dense: {
    title: 'Harva vai tiheä?',
    q: 'Istutetaanko harvaan vai tiheään: kumpi sitoo puihinsa enemmän hiiltä ensimmäisten 25 vuoden aikana?',
    a: 'Harva', b: 'Tiheä',
    why: 'Kun taimia on enemmän, ne peittävät maan nopeammin ja keräävät yhdessä enemmän valoa. Siksi tiheä nuori metsä sitoo aluksi hiiltä nopeammin. Mutta jokainen puu saa vähemmän tilaa: myöhemmin metsä pitää harventaa, tai heikoimmat puut kuolevat.',
  },
  mixed: {
    title: 'Sekametsä',
    q: 'Pelkkää kuusta vai kuusta, mäntyä ja koivua yhdessä: kummassa on enemmän elämää 60 vuoden päästä?',
    a: 'Pelkkä kuusi', b: 'Sekametsä',
    why: 'Eri puut ruokkivat ja suojaavat eri eläimiä, hyönteisiä ja sieniä. Koivun lehdet tekevät maasta ravinteikkaampaa. Sekametsässä elää enemmän lajeja kuin yhden puulajin metsässä.',
  },
  woodpecker: {
    title: 'Palokärjen koti',
    q: '80-vuotias metsä: hakataanko se, vai annetaanko sen seistä? Kummassa on enemmän lahopuuta palokärjelle 30 vuoden päästä?',
    a: 'Avohakkuu', b: 'Annetaan seistä',
    why: 'Vanhat puut kuolevat yksi kerrallaan ja muuttuvat keloiksi ja maapuiksi. Palokärki etsii hevosmuurahaisia kuolleista ja kuolevista puista ja kovertaa pesänsä isoon puuhun. Avohakkuun jälkeen isoja puita ei ole, joten lahopuuta on pitkään vähän.',
  },
  peat: {
    title: 'Suon hiili',
    q: 'Mänty suolla tai kivennäismaalla: kummassa maassa on enemmän hiiltä?',
    a: 'Suo (turve)', b: 'Kivennäismaa',
    why: 'Turve on kasveja, jotka kuolivat tuhansien vuosien aikana mutta eivät lahonneet, koska suo oli liian märkä. Siksi suossa on hehtaaria kohti paljon enemmän hiiltä kuin kivennäismaassa. Kun suo ojitetaan, ilmaa pääsee turpeeseen, ja se alkaa hitaasti lahota.',
  },
  continuous: {
    title: 'Jatkuva kasvatus',
    q: '70-vuotias metsä: avohakkuu vai vain isoimpien puiden hakkuu (jatkuva kasvatus)? Kummassa metsässä on enemmän hiiltä 20 vuoden päästä (puut, lahopuu ja maa)?',
    a: 'Avohakkuu', b: 'Jatkuva kasvatus',
    why: 'Avohakkuun jälkeen uudet taimet tarvitsevat monta vuotta, ennen kuin ne sitovat paljon hiiltä, ja maa hengittää koko ajan hiiltä ilmaan. Jatkuvassa kasvatuksessa metsässä kasvaa aina puita. Mutta hakattu puu meni myös jonnekin: tuotteetkin varastoivat hiiltä jonkin aikaa.',
  },
};

const enCards: Record<CardId, CardText> = {
  soil: {
    title: 'Sand or clay?',
    q: 'Spruce on sandy soil or on clay: which stores more carbon in its trees in 40 years?',
    a: 'Sandy soil', b: 'Clay soil',
    why: 'Clay holds a lot of water and has more nutrients. Rain drains out of sand, and it has few nutrients, so spruce grows slowly there. Spruce needs a rich, moist soil.',
  },
  sandPine: {
    title: 'Dry heath',
    q: 'On dry sandy soil: which grows more wood in 50 years, spruce or pine?',
    a: 'Spruce', b: 'Pine',
    why: 'Pine copes with dry, poor soil. Its roots reach deep, and it needs less water. Spruce has shallow roots and suffers in dry summers. That is why dry sandy heaths are often pine forests.',
  },
  lapland: {
    title: 'South or Lapland?',
    q: 'The same pine forest in Southern Finland and in Lapland: which has more wood after 50 years?',
    a: 'Southern Finland', b: 'Lapland',
    why: 'In Lapland the summer is short and cool. Trees grow only when it is warm enough, so a Lapland pine grows much more slowly. It can still live for hundreds of years.',
  },
  climate2080: {
    title: 'The climate in 2080',
    q: 'A pine forest in today\'s climate and in a warmer climate like 2080: which stores more carbon in its trees in 60 years?',
    a: 'Today\'s climate', b: '2080 climate',
    why: 'In the game\'s 2080 climate the growing season is longer and warmer, so pine grows faster, even though there are more dry summers. Warmth helps pests too: try the bark beetle card. Researchers are still finding out how Finland\'s forests will really change.',
  },
  beetle: {
    title: 'Bark beetle',
    q: 'In a warmer climate: which loses more trees to bark beetles, a spruce forest or a pine forest?',
    a: 'Spruce forest', b: 'Pine forest',
    why: 'The spruce bark beetle (kirjanpainaja) lives in spruce. It attacks big spruces weakened by drought, and breeds in fresh dead spruce. Warm, dry summers help it. Pine is not its food.',
  },
  moose: {
    title: 'The moose\'s winter food',
    q: 'Young spruces, or young pines and birches: which do moose eat more in 15 years?',
    a: 'Spruce', b: 'Pine and birch',
    why: 'In winter a moose eats the shoots of young pine, birch, aspen and willow. It rarely eats spruce. A browsed sapling loses its summer\'s growth, and can grow crooked.',
  },
  thinning: {
    title: 'Thinning',
    q: 'A crowded 35-year-old spruce forest: if we thin it, do the trees left grow thicker faster?',
    a: 'Leave it', b: 'Thin it',
    why: 'Thinning takes some trees away, so the ones left get more light, water and nutrients. Their year rings get wider. But the forest now has fewer trees: compare the wood in both!',
  },
  dense: {
    title: 'Sparse or dense?',
    q: 'Plant sparsely or densely: which stores more carbon in its trees in the first 25 years?',
    a: 'Sparse', b: 'Dense',
    why: 'More seedlings cover the ground sooner and catch more light together, so a dense young forest stores carbon faster at first. But each tree gets less room: later the forest must be thinned, or the weakest trees die.',
  },
  mixed: {
    title: 'Mixed forest',
    q: 'Only spruce, or spruce, pine and birch together: which has more life after 60 years?',
    a: 'Only spruce', b: 'Mixed forest',
    why: 'Different trees feed and shelter different animals, insects and fungi. Birch leaves make the soil richer. More species live in a mixed forest than in a forest of one kind of tree.',
  },
  woodpecker: {
    title: 'The black woodpecker\'s home',
    q: 'An 80-year-old forest: cut it all, or leave it standing? Which has more deadwood for the black woodpecker after 30 years?',
    a: 'Clearcut', b: 'Leave it standing',
    why: 'Old trees die one by one and become snags and logs. The black woodpecker (palokärki) looks for carpenter ants in dead and dying trees, and carves its nest in a big tree. After a clearcut there are no big trees, so there is little deadwood for a long time.',
  },
  peat: {
    title: 'Carbon in the bog',
    q: 'Pine on peatland or on mineral soil: which soil holds more carbon?',
    a: 'Peat', b: 'Mineral soil',
    why: 'Peat is plants that died over thousands of years but never rotted, because the bog was too wet. That is why a bog holds much more carbon per hectare than mineral soil. When a bog is drained, air gets into the peat and it slowly starts to rot.',
  },
  continuous: {
    title: 'Continuous cover',
    q: 'A 70-year-old forest: clearcut, or take only the biggest trees (continuous cover)? Which forest holds more carbon after 20 years (trees, deadwood and soil)?',
    a: 'Clearcut', b: 'Continuous cover',
    why: 'After a clearcut the new seedlings need many years before they store much carbon, and the soil keeps breathing carbon out. With continuous cover there are always trees growing. But the cut wood went somewhere too: products also store carbon for a while.',
  },
};

const fiMeasures: Record<MeasureId, { name: string; unit: string }> = {
  treeCarbon: { name: 'Hiili puissa', unit: 't CO₂/ha' },
  forestCarbon: { name: 'Hiili metsässä (puut, lahopuu, maa)', unit: 't CO₂/ha' },
  soilCarbon: { name: 'Hiili maaperässä', unit: 't CO₂/ha' },
  wood: { name: 'Puuta pystyssä', unit: 'm³/ha' },
  rings: { name: 'Vuosilustojen leveys', unit: 'mm/vuosi' },
  life: { name: 'Elämä', unit: '/ 5' },
  deadwood: { name: 'Lahopuuta', unit: 'm³/ha' },
  beetle: { name: 'Kirjanpainajan tappamia kuusia', unit: 'puuta/ha' },
  moose: { name: 'Hirven syömiä taimia', unit: 'kertaa/ha' },
};

const enMeasures: Record<MeasureId, { name: string; unit: string }> = {
  treeCarbon: { name: 'Carbon in the trees', unit: 't CO₂/ha' },
  forestCarbon: { name: 'Carbon in the forest (trees, deadwood, soil)', unit: 't CO₂/ha' },
  soilCarbon: { name: 'Carbon in the soil', unit: 't CO₂/ha' },
  wood: { name: 'Wood standing', unit: 'm³/ha' },
  rings: { name: 'Width of the year rings', unit: 'mm/year' },
  life: { name: 'Life', unit: '/ 5' },
  deadwood: { name: 'Deadwood', unit: 'm³/ha' },
  beetle: { name: 'Spruces killed by bark beetles', unit: 'trees/ha' },
  moose: { name: 'Saplings browsed by moose', unit: 'times/ha' },
};

const fi = {
  open: 'Kysymykset',
  title: 'Kysymyskortit',
  intro: 'Jokaisessa kortissa on kaksi metsää, A ja B. Ne eroavat vain yhdeltä osin, ja niillä on sama sää. Arvaa ensin, sitten katso, mitä tapahtuu.',
  back: 'Takaisin',
  done: 'tehty',
  forestA: 'Metsä A',
  forestB: 'Metsä B',
  setup: (years: number, grown: number) => grown > 0
    ? `Molemmat metsät ovat ensin kasvaneet ${grown} vuotta. Sitten koe kestää ${years} vuotta, ja sää on molemmissa sama.`
    : `Koe kestää ${years} vuotta istutuksesta, ja sää on molemmissa sama.`,
  measure: 'Mitataan',
  guess: 'Mitä arvaat?',
  guessSame: 'Suunnilleen sama',
  guessNote: 'Valitse arvaus. Sitten voit aloittaa.',
  run: 'Aloita koe',
  year: (y: number, n: number) => `Vuosi ${y} / ${n}`,
  pause: 'Tauko',
  play: 'Jatka',
  skip: 'Loppuun',
  resultTitle: 'Tulos',
  youGuessed: (g: string) => `Arvasit: ${g}.`,
  higher: (w: string) => `${w} päätyi korkeammalle.`,
  same: 'Metsät päätyivät suunnilleen samaan.',
  right: 'Oikein! Hyvin päätelty.',
  wrong: 'Ei tällä kertaa. Juuri siksi kokeita tehdään!',
  why: 'Miksi?',
  model: 'Tämä on pelin malli: yksinkertaistettu, ei tarkka ennuste.',
  again: 'Kokeile eri säällä',
  againNote: 'Toinen sää, sama kysymys. Tuleeko sama vastaus?',
  another: 'Toinen kysymys',
  close: 'Sulje',
  copyLink: 'Kopioi linkki tähän korttiin',
  copied: 'Linkki kopioitu.',
  canvas: 'Kaksi metsää vierekkäin samalla säällä',
};

const en: typeof fi = {
  open: 'Questions',
  title: 'Question cards',
  intro: 'Each card has two forests, A and B. They differ in only one thing, and they get the same weather. Guess first, then watch what happens.',
  back: 'Back',
  done: 'done',
  forestA: 'Forest A',
  forestB: 'Forest B',
  setup: (years: number, grown: number) => grown > 0
    ? `Both forests have already grown for ${grown} years. Then the experiment runs for ${years} years, with the same weather in both.`
    : `The experiment runs for ${years} years from planting, with the same weather in both.`,
  measure: 'We measure',
  guess: 'What is your guess?',
  guessSame: 'About the same',
  guessNote: 'Pick a guess. Then you can start.',
  run: 'Start the experiment',
  year: (y: number, n: number) => `Year ${y} / ${n}`,
  pause: 'Pause',
  play: 'Play',
  skip: 'To the end',
  resultTitle: 'Result',
  youGuessed: (g: string) => `You guessed: ${g}.`,
  higher: (w: string) => `${w} ended higher.`,
  same: 'The forests ended about the same.',
  right: 'Right! Well reasoned.',
  wrong: 'Not this time. That is exactly why we do experiments!',
  why: 'Why?',
  model: 'This is the game\'s model: simplified, not an exact forecast.',
  again: 'Try other weather',
  againNote: 'Different weather, the same question. Do you get the same answer?',
  another: 'Another question',
  close: 'Close',
  copyLink: 'Copy a link to this card',
  copied: 'Link copied.',
  canvas: 'Two forests side by side with the same weather',
};

export const LAB_TEXT: Record<Lang, typeof fi & { cards: Record<CardId, CardText>; measures: Record<MeasureId, { name: string; unit: string }> }> = {
  fi: { ...fi, cards: fiCards, measures: fiMeasures },
  en: { ...en, cards: enCards, measures: enMeasures },
};
