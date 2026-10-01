/*
 * Mistä puu tulee? — tree carbon model
 *
 * A deliberately small, transparent model of one young silver birch
 * (Betula pendula) growing in a pot of soil on a scale, in the spirit of
 * van Helmont's willow experiment. Every rule is written so it can be
 * explained to a 10-year-old and checked by a forester. See docs/MODEL.md.
 *
 * Units: carbon pools in kg C, time step = 1 simulated hour.
 * Dry biomass is ~50 % carbon, so dry mass = carbon / 0.5.
 *
 * No DOM access here, so the same file runs in the browser and in Node tests.
 */
(function (root) {
  'use strict';

  var HOURS_PER_YEAR = 8760;
  var LATITUDE = 62.6; // Joensuu

  // Composition of dry wood by mass and where each part came from.
  // Carbon and (in the textbook photosynthesis equation) the oxygen in sugar
  // come from CO2 in the air; hydrogen comes from water; minerals and
  // nitrogen come from the soil.
  var COMPOSITION = {
    carbon: 0.50,   // from air (CO2)
    oxygen: 0.43,   // from air (CO2)
    hydrogen: 0.06, // from water
    soil: 0.01      // minerals + nitrogen from soil
  };

  var P = {
    eps: 0.0022,         // kg C per m2 of crown per hour, full sun, all light caught, 420 ppm
    sla: 30,             // m2 leaf area per kg leaf carbon (15 m2 per kg dry leaf)
    extinction: 0.5,     // how quickly leaves shade each other (Beer's law)
    crownCoef: 1.2,      // crown area (m2) = crownCoef * (stem+root)^crownExp
    crownExp: 0.6,
    targetLAI: 4,        // leaf layers the tree aims for under its crown
    co2K: 80,            // half-saturation of CO2 response (ppm)
    // maintenance respiration at 10 °C, fraction of pool per hour
    respLeaf: 0.00040,
    respStem: 0.000004,  // most wood is dead heartwood; only sapwood breathes
    respRoot: 0.00010,
    respSugar: 0.00005,
    growthRespFraction: 0.25, // a quarter of sugar used for building is burned for energy
    growthRate: 0.004,   // fraction of spare sugar turned into new tissue per hour
    reserveLeaf: 1.8,    // sugar saved for next spring, as a multiple of the leaf target
    reserveRoot: 0.05,   // ... plus this share of root carbon for winter breathing
    rootShare: 0.30,     // of new wood growth, share to roots
    rootTurnover: 0.25,  // fraction of roots that die per year (fine roots)
    resorption: 0.15,    // share of leaf carbon pulled back as sugar before leaf fall
    litterK: 0.35,       // decomposition rate of litter per year at 10 °C, moist
    leafOutStart: 135,   // mid May
    leafOutEnd: 150,
    leafFallStart: 262,  // late September
    leafFallEnd: 285
  };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  // Day of year (0-364) and hour (0-23) from simulated hour count.
  function calendar(t) {
    var hourOfYear = ((t % HOURS_PER_YEAR) + HOURS_PER_YEAR) % HOURS_PER_YEAR;
    return {
      year: Math.floor(t / HOURS_PER_YEAR),
      day: Math.floor(hourOfYear / 24),
      hour: hourOfYear % 24
    };
  }

  // Sun height above horizon (0..1 as sine of elevation) for Joensuu.
  function sunHeight(day, hour) {
    var rad = Math.PI / 180;
    var decl = 23.44 * Math.sin(2 * Math.PI * (day - 80) / 365) * rad;
    var lat = LATITUDE * rad;
    var ha = (hour + 0.5 - 12) * 15 * rad;
    var s = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
    return Math.max(0, s);
  }

  // Air temperature (°C): Joensuu-like seasons plus a day/night swing.
  function temperature(day, hour) {
    var seasonal = 3.5 + 13.5 * Math.sin(2 * Math.PI * (day - 115) / 365);
    var daily = 4 * Math.sin(2 * Math.PI * (hour - 9) / 24);
    return seasonal + daily;
  }

  // Respiration and decomposition speed up with warmth (doubling per 10 °C).
  function q10(T) { return Math.pow(2, (T - 10) / 10); }

  // How open the stomata are, from soil water (0 = dust dry, 1 = soaked).
  function stomatalOpening(water) { return clamp((water - 0.05) / 0.45, 0, 1); }

  // CO2 response, normalised so that today's 420 ppm gives 1.
  function co2Factor(ppm) {
    return (ppm / (ppm + P.co2K)) / (420 / (420 + P.co2K));
  }

  // Photosynthesis slows in cold and stops below freezing.
  function tempFactor(T) { return clamp(T / 15, 0, 1); }

  function crownArea(s) { return P.crownCoef * Math.pow(s.stem + s.root, P.crownExp); }

  function leafTarget(s) { return P.targetLAI * crownArea(s) / P.sla; }

  // Share of sunlight the crown catches. Extra leaves help less and less,
  // because they sit in the shade of the leaves above them.
  function lightCaught(s) {
    var ca = crownArea(s);
    return 1 - Math.exp(-P.extinction * s.leaf * P.sla / ca);
  }

  function createState(opts) {
    opts = opts || {};
    var s = {
      t: (opts.startDay != null ? opts.startDay : 121) * 24, // 1 May of year 0
      // a three-year-old birch sapling, ~0.7 kg dry mass, leafless in spring
      sugar: 0.08,
      leaf: 0,
      stem: 0.22,
      root: 0.09,
      litter: 0,
      // minerals + nitrogen (kg), taken from the soil when tissue is built
      minerals: 0.31 / 0.5 * COMPOSITION.soil,
      litterMinerals: 0,
      soilMass: 90, // kg dry soil, like van Helmont's 200 lb
      // cumulative flows (kg C)
      cIn: 0,        // taken from air by photosynthesis
      cOutResp: 0,   // returned to air by the tree's own breathing
      cOutDecomp: 0, // returned to air by decomposers eating litter
      cLitterFall: 0,
      waterH: 0,     // kg of hydrogen built in from water (dry-mass accounting)
      // per-year wood growth, for tree rings
      rings: [],
      ringNow: 0,
      // instantaneous rates for the display (kg C per hour)
      rate: { gpp: 0, resp: 0, decomp: 0, opening: 1, light: 0, T: 0 },
      stress: 0 // hours of the current year with closed stomata during growing season
    };
    s.initialTreeC = treeCarbon(s);
    s.initialDry = massBudget(s).dry;
    s.initialSoil = s.soilMass;
    return s;
  }

  function treeCarbon(s) { return s.sugar + s.leaf + s.stem + s.root; }

  // Move tissue carbon onto the soil as litter, minerals travelling with it.
  function toLitter(s, c) {
    var m = Math.min(s.minerals, c / COMPOSITION.carbon * COMPOSITION.soil);
    s.minerals -= m;
    s.litterMinerals += m;
    s.litter += c;
    s.cLitterFall += c;
  }

  // Dry mass of the tree (kg) and where it came from.
  function massBudget(s) {
    var c = treeCarbon(s);
    var dry = c / COMPOSITION.carbon;
    return {
      dry: dry,
      fromAir: dry - dry * COMPOSITION.hydrogen - s.minerals,
      fromWater: dry * COMPOSITION.hydrogen,
      fromSoil: s.minerals,
      carbon: c
    };
  }

  /*
   * Advance one hour.
   * env: { light: 0..1 (shade..full sun), water: 0..1, co2: ppm }
   */
  function step(s, env) {
    var cal = calendar(s.t);
    var T = temperature(cal.day, cal.hour);
    var sun = sunHeight(cal.day, cal.hour);
    var light = sun * env.light;
    var opening = stomatalOpening(env.water);
    var growing = cal.day >= P.leafOutStart && cal.day < P.leafFallEnd && T > 5;

    // 1. Photosynthesis: CO2 + water + light -> sugar. Only leaves do it.
    var leafArea = s.leaf * P.sla;
    var gpp = P.eps * light * crownArea(s) * lightCaught(s) *
              opening * co2Factor(env.co2) * tempFactor(T);
    s.sugar += gpp;
    s.cIn += gpp;

    // 2. Respiration: every living part burns sugar, day and night.
    var f = q10(T);
    var resp = (P.respLeaf * s.leaf + P.respStem * s.stem + P.respRoot * s.root +
                P.respSugar * s.sugar) * f;

    // 3. Growth: spare sugar becomes leaves, wood and roots.
    var grow = 0, toLeaf = 0, toStem = 0, toRoot = 0;
    var lt = leafTarget(s);
    var inLeafOut = cal.day >= P.leafOutStart && cal.day < P.leafOutEnd;
    if (inLeafOut && s.leaf < lt) {
      // Spring: new leaves are built from sugar stored last summer.
      var need = (lt - s.leaf) / Math.max(1, (P.leafOutEnd - cal.day) * 24);
      grow = Math.min(need / (1 - P.growthRespFraction), s.sugar * 0.05);
      toLeaf = grow * (1 - P.growthRespFraction);
    } else if (growing && cal.day < P.leafFallStart) {
      var reserve = P.reserveLeaf * lt + P.reserveRoot * s.root;
      var spare = s.sugar - reserve;
      if (spare > 0) {
        grow = spare * P.growthRate * clamp(T / 15, 0, 1);
        var build = grow * (1 - P.growthRespFraction);
        // top up leaves lost to drought, otherwise wood and roots
        if (s.leaf < lt) {
          toLeaf = Math.min(build * 0.3, lt - s.leaf);
          build -= toLeaf;
        }
        toRoot = build * P.rootShare;
        toStem = build - toRoot;
      }
    }
    s.sugar -= grow + resp; // resp so far is maintenance only
    resp += grow * P.growthRespFraction;
    s.leaf += toLeaf;
    s.stem += toStem;
    s.root += toRoot;
    s.ringNow += toStem;
    s.cOutResp += resp;
    var takeUp = (toLeaf + toStem + toRoot) / COMPOSITION.carbon * COMPOSITION.soil;
    s.minerals += takeUp;
    s.soilMass -= takeUp;

    // Starvation: if sugar runs out, the tree sheds leaves to survive.
    if (s.sugar < 0) {
      var deficit = -s.sugar;
      s.sugar = 0;
      var shed = Math.min(s.leaf, deficit * 4);
      s.leaf -= shed;
      toLitter(s, shed);
      // the remaining deficit is burned from living wood; if even that is
      // gone, the breathing simply could not happen
      var take = Math.min(deficit, Math.max(0, s.stem - 0.01));
      s.stem -= take;
      s.cOutResp -= deficit - take;
      resp -= deficit - take;
    }

    // 4. Autumn: leaves turn yellow and fall onto the soil.
    if (cal.day >= P.leafFallStart && cal.day < P.leafFallEnd && s.leaf > 0) {
      var hoursLeft = Math.max(1, (P.leafFallEnd - cal.day) * 24 - cal.hour);
      var falling = s.leaf / hoursLeft;
      s.leaf -= falling;
      s.sugar += falling * P.resorption;
      toLitter(s, falling * (1 - P.resorption));
    }

    // Fine roots die and become litter too.
    var rootDeath = s.root * P.rootTurnover / HOURS_PER_YEAR;
    s.root -= rootDeath;
    toLitter(s, rootDeath);

    // 5. Decomposers (fungi, bacteria, worms) eat litter and breathe out CO2.
    var moist = 0.3 + 0.7 * clamp(env.water / 0.5, 0, 1);
    var frozen = T < 0 ? 0.1 : 1;
    var decomp = s.litter * (P.litterK / HOURS_PER_YEAR) * f * moist * frozen;
    var minBack = s.litter > 0 ? s.litterMinerals * decomp / s.litter : 0;
    s.litter -= decomp;
    s.cOutDecomp += decomp;
    s.litterMinerals -= minBack;
    s.soilMass += minBack; // minerals go back into the soil

    if (growing && opening < 0.5 && light > 0.05) s.stress += 1;

    s.rate.gpp = gpp;
    s.rate.resp = resp;
    s.rate.decomp = decomp;
    s.rate.opening = opening;
    s.rate.light = light;
    s.rate.T = T;
    s.rate.leafArea = leafArea;

    s.t += 1;
    if (calendar(s.t).year !== cal.year) {
      s.rings.push({ wood: s.ringNow, stress: s.stress });
      s.ringNow = 0;
      s.stress = 0;
    }
    return s;
  }

  function run(s, env, hours) {
    for (var i = 0; i < hours; i++) step(s, env);
    return s;
  }

  // Where harvested or fallen carbon goes next: fraction still stored after
  // `years`. Half-lives for wood products follow IPCC 2019 defaults
  // (sawnwood 35 y, paper 2 y); litter follows this model's decomposition.
  function storedAfter(fate, years) {
    if (fate === 'burn') return years <= 0 ? 1 : 0;
    var halfLife = { leaves: Math.LN2 / P.litterK, chair: 35, paper: 2 }[fate];
    return Math.pow(0.5, years / halfLife);
  }

  var api = {
    P: P,
    COMPOSITION: COMPOSITION,
    HOURS_PER_YEAR: HOURS_PER_YEAR,
    createState: createState,
    step: step,
    run: run,
    calendar: calendar,
    sunHeight: sunHeight,
    temperature: temperature,
    stomatalOpening: stomatalOpening,
    co2Factor: co2Factor,
    treeCarbon: treeCarbon,
    massBudget: massBudget,
    leafTarget: leafTarget,
    crownArea: crownArea,
    storedAfter: storedAfter
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TreeModel = api;
})(this);
