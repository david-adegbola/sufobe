/**
 * Privacy notice, terms, science notes and credits, shown on the About screen.
 * Every statement here must match what the code really does: if storage,
 * hosting or features change, update this file in the same commit.
 */
import type { Lang } from './text';

/**
 * Operator details. These are deliberately empty: they must come from the
 * person publishing the game, not be invented. See docs/LEGAL.md.
 */
export const OPERATOR = {
  name: '',     // e.g. the person or organisation responsible for the game
  contact: '',  // an email address or web form for privacy questions
};

interface Section { id: string; title: string; body: string[] }

const missing = { fi: '[puuttuu – ylläpitäjä täydentää ennen julkista käyttöä]', en: '[missing – the operator fills this in before public use]' };

export function aboutSections(lang: Lang): Section[] {
  const op = OPERATOR.name || missing[lang];
  const contact = OPERATOR.contact || missing[lang];
  if (lang === 'fi') return [
    { id: 'privacy', title: 'Tietosuoja', body: [
      'Lyhyesti: Kasva! ei kerää sinusta tietoja. Ei tilejä, nimiä, sähköposteja, evästeitä, analytiikkaa eikä mainoksia. Mitään ei lähetetä palvelimelle.',
      'Mitä tallennetaan ja missä: pelin edistyminen tallentuu vain tämän laitteen selaimeen (localStorage). Siihen kuuluu: kerätyn hiilen määrä, pelatut kesät, merkit, kasvuvalinnat, päiväputki, päivän sään parhaat tulokset, arvottu nimimerkki (kaksi merkkiä), haasteiden historia sekä kieli- ja ääniasetus. Pelitestin loki tallentuu vain, jos opettaja kytkee sen päälle.',
      'Miksi: jotta peli muistaa edistymisesi ja asetuksesi, kun palaat. Tallennusta käytetään vain pelin omaan toimintaan, ei seurantaan eikä mainontaan.',
      'Kolmannet osapuolet: peli ei lataa ulkopuolisia palveluita; myös fontit ovat pelin sisällä. Sivua palveleva verkkopalvelu (nyt claude.ai) käsittelee tavalliset verkkopyynnöt omien tietosuojaehtojensa mukaan.',
      'Haastelinkit ja kuvat: kun jaat haastelinkin tai tulosjulisteen, siinä näkyvät nimimerkkisi, tuloksesi ja sää. Se menee vain sinne, minne itse sen lähetät, ja sen sovelluksen ehdot koskevat jakoa.',
      'Säilytys ja poistaminen: tiedot säilyvät, kunnes poistat ne alla olevalla napilla tai tyhjennät selaimen tiedot. Koska emme saa mitään tietoja, meillä ei ole sinusta mitään poistettavaa tai luovutettavaa.',
      'Lapset: peli on tehty lapsille, ja juuri siksi se ei kysy nimeä, ikää tai muita henkilötietoja. Nimimerkit arvotaan, joten omaa nimeä ei voi kirjoittaa.',
      `Ylläpitäjä: ${op}. Yhteydenotot: ${contact}.`,
    ] },
    { id: 'terms', title: 'Käyttöehdot', body: [
      'Kasva! on ilmainen oppimispeli. Sitä saa pelata kotona ja koulussa. Peli ei sisällä maksuja, ostoksia tai tilauksia.',
      'Pelaa reilusti: älä muokkaa haastelinkkejä tai tuloksia huijataksesi. Nimimerkit arvotaan, joten peliin ei voi kirjoittaa omaa tekstiä muille.',
      'Pelin luvut ovat yksinkertaistettuja (katso “Tiede ja peli”). Peli on tarkoitettu oppimiseen, ei tarkkoihin laskelmiin.',
      'Peli tarjotaan sellaisenaan. Se voi muuttua tai sen tarjoaminen voi päättyä. Muutokset näkyvät tällä sivulla.',
      `Pelin koodi ja grafiikka: ${op}. Fontit ovat omien lisenssiensä alaisia (katso “Tekijät ja lisenssit”).`,
    ] },
    { id: 'science', title: 'Tiede ja peli', body: [
      'Totta: puut ottavat hiilidioksidia lehtien ilmarakojen kautta, ja samalla vettä haihtuu. Kuumalla ja kuivalla säällä puut sulkevat ilmarakojaan. Yhteyttäminen tarvitsee valoa. Puut hengittävät hiilidioksidia ulos päivin ja öin. Puun kuivapainosta noin puolet on hiiltä, joka on peräisin ilmasta. Juhannuksen aikaan yöt ovat Suomessa hyvin valoisia.',
      'Pelin sääntöjä, ei mittauksia: pelin grammat ovat pelin omia lukuja. Oikean koivun luvut riippuvat sen koosta, kasvupaikasta ja vuodesta. Yksi kesä kestää pelissä 90 sekuntia. Jokainen piste kuvaa valtavaa joukkoa molekyylejä. Kultaisen molekyylin ×5 on pelin sääntö, vaikka auringonpilkut ovat oikeasti olemassa. Kasvuvalinnat ja nuupahtaminen on yksinkertaistettu.',
      '“Päivän sää” on pelin arpoma sää kaikille pelaajille, ei oikea sääennuste.',
    ] },
    { id: 'credits', title: 'Tekijät ja lisenssit', body: [
      'Grafiikka on piirretty koodilla tätä peliä varten, ja äänet syntyvät selaimessa (kantele, linnut, tuuli ja sade). Valmiita kuvia tai äänitiedostoja ei käytetä.',
      'Fontit (SIL Open Font License 1.1): Bricolage Grotesque © 2022 The Bricolage Grotesque Project Authors. Caveat © 2014 The Caveat Project Authors. Atkinson Hyperlegible Next © 2020–2024 The Atkinson Hyperlegible Next Project Authors. Lisenssiteksti: game/licenses/fonts-OFL.txt.',
      'Peli on kehitetty tekoälyavusteisesti (Claude, Anthropic).',
    ] },
  ];
  return [
    { id: 'privacy', title: 'Privacy', body: [
      'In short: Kasva! does not collect data about you. No accounts, names, emails, cookies, analytics or ads. Nothing is sent to a server.',
      'What is stored, and where: your progress is kept only in this device\'s browser (localStorage). That means: carbon stored, seasons played, badges, growth choices, daily streak, best scores for each day\'s weather, a random nickname (two characters), your challenge history, and your language and sound settings. A playtest log is stored only if a teacher switches it on.',
      'Why: so the game remembers your progress and settings when you come back. It is used only for the game itself, never for tracking or advertising.',
      'Third parties: the game loads no outside services; even the fonts are built in. The website serving the page (currently claude.ai) handles normal web requests under its own privacy policy.',
      'Challenge links and pictures: when you share a challenge link or poster, it shows your nickname, score and weather. It only goes where you send it, and that app\'s terms apply.',
      'Keeping and deleting: the data stays until you delete it with the button below or clear your browser data. Because we receive nothing, we hold nothing about you to delete or hand over.',
      'Children: the game is made for children, which is exactly why it never asks for a name, age or other personal details. Nicknames are picked at random, so nobody can type their real name.',
      `Operator: ${op}. Contact: ${contact}.`,
    ] },
    { id: 'terms', title: 'Terms of use', body: [
      'Kasva! is a free learning game. You may play it at home and at school. There are no payments, purchases or subscriptions.',
      'Play fair: don\'t edit challenge links or scores to cheat. Nicknames are random, so nobody can write their own text for others to see.',
      'The numbers in the game are simplified (see "Science and the game"). The game is for learning, not for exact calculations.',
      'The game is provided as it is. It may change, or stop being offered. Changes will appear on this page.',
      `Game code and graphics: ${op}. The fonts have their own licences (see "Credits and licences").`,
    ] },
    { id: 'science', title: 'Science and the game', body: [
      'True: trees take in carbon dioxide through stomata in their leaves, and lose water at the same time. In hot, dry weather trees close their stomata. Photosynthesis needs light. Trees breathe carbon dioxide out day and night. About half of a tree\'s dry mass is carbon that came from the air. Around Midsummer, Finnish nights are very light.',
      'Game rules, not measurements: the grams in the game are game numbers. A real birch\'s numbers depend on its size, where it grows and the year. A summer lasts 90 seconds in the game. Each dot stands for a huge number of molecules. The golden molecule\'s ×5 is a game rule, although sunflecks are real. Growth choices and wilting are simplified.',
      '"Today\'s weather" is weather the game picks for every player, not a real forecast.',
    ] },
    { id: 'credits', title: 'Credits and licences', body: [
      'All graphics are drawn in code for this game, and all sounds are synthesised in the browser (kantele, birds, wind, rain). No ready-made images or sound files are used.',
      'Fonts (SIL Open Font License 1.1): Bricolage Grotesque © 2022 The Bricolage Grotesque Project Authors. Caveat © 2014 The Caveat Project Authors. Atkinson Hyperlegible Next © 2020–2024 The Atkinson Hyperlegible Next Project Authors. Licence text: game/licenses/fonts-OFL.txt.',
      'The game was developed with AI assistance (Claude, Anthropic).',
    ] },
  ];
}

export const ABOUT_UI = {
  fi: {
    about: 'Tietoa',
    title: 'Tietoa pelistä',
    dataTitle: 'Tiedot tällä laitteella',
    testlog: 'Pelitestin loki (opettajalle): tallentaa jokaisen kesän tuloksen tälle laitteelle. Pois päältä oletuksena.',
    del: 'Poista kaikki tiedot tältä laitteelta',
    delConfirm: 'Poistetaanko varmasti? Edistyminen, merkit, nimimerkki ja haasteet katoavat, eikä niitä voi palauttaa.',
    delYes: 'Kyllä, poista',
    delNo: 'Peruuta',
    deleted: 'Tiedot poistettu.',
    sound: 'Ääni päälle tai pois',
    pause: 'Tauko',
    canvas: 'Pelialue: koivu, hiilidioksidimolekyylit ja sää. Pidä välilyöntiä tai sormea pohjassa avataksesi ilmaraot.',
    weather: 'Kesän sää',
    lockedBadge: 'Lukittu merkki',
    dayStart: (n: number, w: string) => `Päivä ${n}: ${w}`,
    seasonEnd: (g: string) => `Kesä päättyi. ${g} g hiilidioksidia muuttui puuksi.`,
  },
  en: {
    about: 'About',
    title: 'About the game',
    dataTitle: 'Data on this device',
    testlog: 'Playtest log (for teachers): stores the result of every season on this device. Off by default.',
    del: 'Delete all data from this device',
    delConfirm: 'Delete for sure? Progress, badges, nickname and challenges will be gone and cannot be restored.',
    delYes: 'Yes, delete',
    delNo: 'Cancel',
    deleted: 'Data deleted.',
    sound: 'Sound on or off',
    pause: 'Pause',
    canvas: 'Game area: a birch, carbon dioxide molecules and the weather. Hold the space bar or your finger down to open the stomata.',
    weather: "The summer's weather",
    lockedBadge: 'Locked badge',
    dayStart: (n: number, w: string) => `Day ${n}: ${w}`,
    seasonEnd: (g: string) => `The summer is over. ${g} g of carbon dioxide became wood.`,
  },
} as const;
