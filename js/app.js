/* Guided flow: predict → explore → weigh → explain → what next → ask again. */
(function () {
  'use strict';
  var M = window.TreeModel;
  var NORMAL = { light: 1, water: 0.8, co2: 420 };
  var SPEEDS = { hours: 3, days: 40, years: 2400 }; // simulated hours per real second
  var FF_HOURS_PER_SEC = M.HOURS_PER_YEAR * 10 / 7; // ten years in about seven seconds
  var ANSWERS = ['soil', 'water', 'air', 'sun'];
  var FATES = ['leaves', 'chair', 'paper', 'burn'];
  var FATE_COLORS = { leaves: '#b8862f', chair: '#2f7d4a', paper: '#4a7bd0', burn: '#d6453a' };
  var TALLY_KEY = 'mista-puu-tulee-tally';

  var $ = function (sel) { return document.querySelector(sel); };
  var lang = 'fi';
  var S; // per-student state
  var scene;

  function T() { return window.I18N[lang]; }
  function fmt(str, vals) {
    return str.replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; });
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function kg(x) {
    var a = Math.abs(x);
    if (a < 1) return Math.round(x * 1000) + ' g';
    return (a < 10 ? x.toFixed(1) : Math.round(x)) + ' kg';
  }

  function freshSim() {
    var s = M.createState();
    s.initialRingBase = s.stem;
    // start on a June morning with leaves out, then zero the bookkeeping
    M.runUntil(s, NORMAL, 171, 4);
    M.rebase(s);
    s.startYear = M.calendar(s.t).year;
    s.startT = s.t;
    return s;
  }

  function newStudent() {
    S = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      step: 0,
      maxStep: 0,
      sim: freshSim(),
      env: { light: NORMAL.light, water: NORMAL.water, co2: NORMAL.co2 },
      playing: false,
      speed: 'hours',
      ffTarget: null,
      acc: 0,
      before: null,
      after: null,
      tasks: { day: 0, dry: false, decade: false },
      q1: null, q2: null,
      blanks: [-1, -1, -1], checked: false,
      fate: 'chair',
      reflection: ''
    };
  }

  // ---------- tally (anonymous, this browser only) ----------

  function readTally() {
    try { return JSON.parse(localStorage.getItem(TALLY_KEY)) || []; } catch { return []; }
  }
  function saveTally() {
    if (!S.before || !S.after) return;
    var t = readTally().filter(function (r) { return r.id !== S.id; });
    t.push({ id: S.id, b: S.before, a: S.after });
    try { localStorage.setItem(TALLY_KEY, JSON.stringify(t)); } catch { /* storage blocked */ }
    renderTeacher();
  }

  // ---------- static chrome ----------

  function renderChrome() {
    var t = T();
    document.documentElement.lang = lang;
    document.title = t.title;
    $('#title').textContent = t.title;
    $('#subtitle').textContent = t.subtitle;
    document.querySelectorAll('.lang button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    });
    $('#steps').innerHTML = t.steps.map(function (name, i) {
      return '<button type="button" data-step="' + i + '"' +
        (i === S.step ? ' aria-current="step"' : '') +
        (i > S.maxStep ? ' disabled' : '') +
        '><span class="n">' + (i + 1) + '</span>' + esc(name) + '</button>';
    }).join('');
    $('#scene').setAttribute('aria-label', t.sceneLabel);
    scene.labels = { soil: t.soilShort, rings: t.ringsLabel, tree: t.treeTag };
    $('#teacher-summary').textContent = t.teacher;
    $('#steps').setAttribute('aria-label', t.stepsLabel);
    $('#privacy-summary').textContent = t.privacyTitle;
    $('#privacy-body').innerHTML = t.privacyBody.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    renderControls();
    renderTeacher();
  }

  function renderControls() {
    var t = T(), el = $('#controls');
    el.hidden = S.step === 0 || S.step === 4 || S.step === 5;
    if (el.hidden) return;
    var e = S.env;
    el.innerHTML =
      '<div class="row">' +
        '<button type="button" class="btn primary" id="play">' + (S.playing ? t.pause : t.play) + '</button>' +
        '<span class="muted small">' + t.speed + '</span>' +
        '<div class="seg" role="group" aria-label="' + t.speed + '">' +
          ['hours', 'days', 'years'].map(function (k) {
            return '<button type="button" data-speed="' + k + '" aria-pressed="' + (S.speed === k && !S.ffTarget) + '">' + t.speeds[k] + '</button>';
          }).join('') +
        '</div>' +
        '<button type="button" class="btn" id="reset" style="margin-left:auto">' + t.reset + '</button>' +
      '</div>' +
      '<div class="sliders">' +
        slider('light', t.light, 0.1, 1, 0.05, e.light, t.lightEnds[0], t.lightEnds[1], Math.round(e.light * 100) + ' %') +
        slider('water', t.water, 0, 1, 0.05, e.water, t.waterEnds[0], t.waterEnds[1], Math.round(e.water * 100) + ' %') +
        slider('co2', t.co2, 200, 800, 10, e.co2, '200', '800', co2Text(e.co2)) +
      '</div>' +
      '<div class="legend">' +
        '<span><span class="mol"><i class="o"></i><i class="c"></i><i class="o"></i></span>' + t.legendCo2 + '</span>' +
        '<span><span class="sugar-dot"></span>' + t.legendSugar + '</span>' +
        '<span>' + t.legendNote + '</span>' +
      '</div>';
  }

  function co2Text(v) {
    var m = T().co2Marks[v];
    return v + ' ppm' + (m ? ' (' + m + ')' : '');
  }

  function slider(id, label, min, max, step, val, lo, hi, valueText) {
    return '<div class="slider"><label for="s-' + id + '">' + label + ': <span id="v-' + id + '">' + valueText + '</span></label>' +
      '<input type="range" id="s-' + id + '" data-env="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '">' +
      '<div class="ends"><span>' + lo + '</span><span>' + hi + '</span></div></div>';
  }

  // ---------- panels ----------

  function choiceList(items, selected, name) {
    return '<div class="choices">' + items.map(function (it, i) {
      var pressed = selected === i;
      return '<button type="button" class="choice' + (it.ok === false ? ' wrong' : '') + '" data-' + name + '="' + i +
        '" aria-pressed="' + pressed + '">' + esc(it.text) + '</button>';
    }).join('') + '</div>';
  }

  function nav(nextOk) {
    var t = T();
    return '<div class="navrow">' +
      (S.step > 0 ? '<button type="button" class="btn" data-go="' + (S.step - 1) + '">' + t.back + '</button>' : '<span></span>') +
      (S.step < 5 ? '<button type="button" class="btn primary" data-go="' + (S.step + 1) + '"' + (nextOk ? '' : ' disabled') + '>' + t.next + '</button>' : '') +
      '</div>';
  }

  function answerChoices(selected, attr) {
    var t = T();
    return choiceList(ANSWERS.map(function (k) { return { text: t.answers[k] }; }),
      ANSWERS.indexOf(selected), attr);
  }

  var panels = [
    function predict() {
      var t = T();
      return '<h2>' + t.steps[0] + '</h2><p>' + t.predictIntro + '</p>' +
        '<p><strong>' + t.question + '</strong></p>' + answerChoices(S.before, 'before') +
        (S.before ? '<p role="status" class="feedback">' + t.predictSaved + '</p>' : '') + nav(!!S.before);
    },
    function explore() {
      var t = T(), k = S.tasks;
      var tick = function (done) { return '<span class="tick' + (done ? ' done' : '') + '">' + (done ? '✓' : '') + '</span>'; };
      return '<h2>' + t.steps[1] + '</h2><p>' + t.exploreIntro + '</p>' +
        '<h3 style="margin:0">' + t.tasks + '</h3><ol class="tasks">' +
        '<li>' + tick(k.day >= 24) + '<span>' + t.task1 + '</span></li>' +
        '<li>' + tick(k.dry) + '<span>' + t.task2 + '</span></li>' +
        '<li>' + tick(k.decade) + '<span>' + t.task3 + '<br><button type="button" class="btn" id="ff10" style="margin-top:6px">' + t.ff10 + '</button></span></li>' +
        '</ol>' + flowsHtml() + nav(true);
    },
    function weigh() {
      var t = T(), s = S.sim, b = M.massBudget(s);
      var yearsRun = (s.t - (s.startT || 0)) / M.HOURS_PER_YEAR;
      var gained = b.dry - s.initialDry, lost = s.initialSoil - s.soilMass;
      var pct = function (x) { return Math.round(100 * x / b.dry); };
      var src = [['air', b.fromAir], ['water', b.fromWater], ['soil', b.fromSoil], ['sun', 0]];
      return '<h2>' + t.steps[2] + '</h2><p>' + t.weighIntro + '</p>' +
        (yearsRun < 3 ? '<p role="status" class="feedback warn">' + t.needYears + ' <button type="button" class="btn" id="ff10">' + t.ff10 + '</button></p>' : '') +
        '<div class="compare">' +
          '<span></span><span class="h">' + t.atStart + '</span><span class="h">' + t.now + '</span>' +
          '<span>' + t.treeDry + '</span><span class="v">' + kg(s.initialDry) + '</span><span class="v" data-live="tree">' + kg(b.dry) + '</span>' +
          '<span>' + t.soil + '</span><span class="v">' + s.initialSoil.toFixed(2) + ' kg</span><span class="v" data-live="soil">' + s.soilMass.toFixed(2) + ' kg</span>' +
        '</div>' +
        '<p><strong>' + fmt(t.treeGained, { x: kg(gained) }) + ' ' + fmt(t.soilLost, { y: kg(Math.max(0, lost)) }) + '</strong></p>' +
        '<h3 style="margin:0">' + t.sourcesTitle + '</h3><div class="bars">' +
        src.map(function (r) {
          return '<div class="bar-row"><span class="bar-label">' + t.src[r[0]] + (r[0] === 'sun' ? ' – <span class="muted">' + t.sunNote + '</span>' : '') +
            '</span><span class="bar-pct">' + pct(r[1]) + ' %</span><div class="bar"><span style="width:' + pct(r[1]) + '%"></span></div></div>';
        }).join('') + '</div>' +
        '<p role="status" class="feedback">' + t.weighSummary + '</p>' + nav(true);
    },
    function explain() {
      var t = T();
      var q1 = t.q1opts.map(function (o, i) { return { text: o.text, ok: S.q1 === i ? !!o.ok : undefined }; });
      var q2 = t.q2opts.map(function (o, i) { return { text: o.text, ok: S.q2 === i ? !!o.ok : undefined }; });
      var fb = function (opts, sel) {
        if (sel == null) return '';
        return '<p role="status" class="feedback' + (opts[sel].ok ? '' : ' warn') + '">' + opts[sel].fb + '</p>';
      };
      var sentence = '<p class="sentence">' + t.sentence[0] + ' ' + blank(0) + t.sentence[1] + ' ' + blank(1) + ' ' +
        t.sentence[2] + ' ' + blank(2) + t.sentence[3] + '</p>';
      var allOk = S.blanks.every(function (v) { return v === 0; });
      return '<h2>' + t.steps[3] + '</h2><p class="muted">' + t.explainIntro + '</p>' +
        '<p><strong>1. ' + t.q1 + '</strong> <button type="button" class="btn" id="drought">' + t.showDrought + '</button></p>' +
        choiceList(q1, S.q1, 'q1') + fb(t.q1opts, S.q1) +
        '<p><strong>2. ' + t.q2 + '</strong></p>' + choiceList(q2, S.q2, 'q2') + fb(t.q2opts, S.q2) +
        '<p><strong>3. ' + t.q3 + '</strong></p>' + sentence +
        '<div><button type="button" class="btn" id="check">' + t.check + '</button></div>' +
        (S.checked ? '<p role="status" class="feedback' + (allOk ? '' : ' warn') + '">' + (allOk ? t.allRight : t.almost) + '</p>' : '') +
        nav(true);
    },
    function fates() {
      var t = T();
      return '<h2>' + t.steps[4] + '</h2><p>' + t.fatesIntro + '</p><div class="fates">' +
        FATES.map(function (f) {
          return '<button type="button" class="choice" data-fate="' + f + '" aria-pressed="' + (S.fate === f) + '">' +
            '<span style="color:' + FATE_COLORS[f] + '">●</span> ' + esc(t.fates[f].name) + '</button>';
        }).join('') + '</div>' +
        '<p role="status" class="feedback">' + t.fates[S.fate].desc + '</p>' +
        '<div><strong id="chart-title">' + t.chartTitle + '</strong><canvas id="fate-chart" role="img" aria-labelledby="chart-title" aria-describedby="chart-desc"></canvas><p class="sr-only" id="chart-desc">' + t.chartAlt + '</p></div>' +
        '<p>' + t.fatesTakeaway + '</p><p class="muted small">' + t.fatesSource + '</p>' + nav(true);
    },
    function again() {
      var t = T();
      var html = '<h2>' + t.steps[5] + '</h2><p>' + t.againIntro + '</p><p><strong>' + t.question + '</strong></p>' +
        answerChoices(S.after, 'after');
      if (S.after) {
        html += '<div class="compare" style="grid-template-columns:1fr 1fr">' +
          '<span class="h">' + t.firstAnswer + '</span><span class="h">' + t.answerNow + '</span>' +
          '<span class="v">' + t.answers[S.before] + '</span><span class="v">' + t.answers[S.after] + '</span></div>' +
          '<p>' + (S.after !== S.before ? t.changed : t.same) + '</p>' +
          '<textarea id="reflection" placeholder="' + t.reflect + '">' + esc(S.reflection) + '</textarea>';
      }
      return html + '<div class="navrow"><button type="button" class="btn" data-go="4">' + t.back + '</button>' +
        '<button type="button" class="btn primary" id="next-student">' + t.nextStudent + '</button></div>';
    }
  ];

  function blank(i) {
    var t = T();
    var cls = S.checked ? (S.blanks[i] === 0 ? ' class="good"' : ' class="bad"') : '';
    return '<select data-blank="' + i + '"' + cls + ' aria-label="' + esc(t.blankLabels[i]) + '">' +
      '<option value="-1">' + t.choose + '</option>' +
      // show options in a fixed shuffled order so the right one is not always first
      [1, 0, 2].map(function (o) {
        return '<option value="' + o + '"' + (S.blanks[i] === o ? ' selected' : '') + '>' + esc(t.blanks[i][o]) + '</option>';
      }).join('') + '</select>';
  }

  function flowsHtml() {
    var t = T();
    return '<div><h3 style="margin:0 0 4px">' + t.flowsTitle + '</h3><div class="flows">' +
      '<span>' + t.flowStart + '</span><span class="v" data-live="start"></span>' +
      '<span>+ ' + t.flowIn + '</span><span class="v" data-live="in"></span>' +
      '<span>− ' + t.flowResp + '</span><span class="v" data-live="resp"></span>' +
      '<span>− ' + t.flowDecomp + '</span><span class="v" data-live="decomp"></span>' +
      '<span class="total">= ' + t.flowTree + '</span><span class="v total" data-live="treeC"></span>' +
      '<span>' + t.flowLitter + '</span><span class="v" data-live="litter"></span>' +
      '</div></div>';
  }

  function renderPanel() {
    $('#panel').innerHTML = panels[S.step]();
    if (S.step === 4) drawFateChart();
    updateLive(true);
  }

  function renderAll() { renderChrome(); renderPanel(); }

  function goTo(step) {
    S.step = Math.max(0, Math.min(5, step));
    S.maxStep = Math.max(S.maxStep, S.step);
    if (S.step === 0 || S.step >= 4) S.playing = false;
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- fate chart ----------

  function drawFateChart() {
    var cv = $('#fate-chart');
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var css = getComputedStyle(document.documentElement);
    var ink = css.getPropertyValue('--muted').trim() || '#555';
    var L = 46, R = 10, Tp = 10, B = 26, years = 100;
    var X = function (y) { return L + (w - L - R) * y / years; };
    var Y = function (f) { return Tp + (h - Tp - B) * (1 - f); };
    c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1;
    c.font = '12px system-ui, sans-serif';
    c.beginPath(); c.moveTo(L, Tp); c.lineTo(L, h - B); c.lineTo(w - R, h - B); c.stroke();
    c.textAlign = 'right'; c.textBaseline = 'middle';
    [0, 50, 100].forEach(function (p) { c.fillText(p + ' %', L - 4, Y(p / 100)); });
    c.textAlign = 'center'; c.textBaseline = 'top';
    [0, 25, 50, 75, 100].forEach(function (y) { c.fillText(String(y), X(y), h - B + 4); });
    c.textAlign = 'right';
    c.fillText(T().years, w - R, h - B - 16);
    FATES.forEach(function (f) {
      var sel = f === S.fate;
      c.strokeStyle = FATE_COLORS[f];
      c.globalAlpha = sel ? 1 : 0.3;
      c.lineWidth = sel ? 3.5 : 2;
      c.beginPath();
      if (f === 'burn') {
        c.moveTo(X(0), Y(1)); c.lineTo(X(0), Y(0)); c.lineTo(X(years), Y(0));
      } else {
        for (var y = 0; y <= years; y += 0.5) {
          var v = M.storedAfter(f, y);
          if (y === 0) c.moveTo(X(y), Y(v)); else c.lineTo(X(y), Y(v));
        }
      }
      c.stroke();
    });
    c.globalAlpha = 1;
  }

  // ---------- live readouts ----------

  var last = {};
  function setText(el, txt) { if (el && el.textContent !== txt) el.textContent = txt; }

  function updateLive(force) {
    var t = T(), s = S.sim, cal = M.calendar(s.t);
    var month = monthOf(cal.day);
    var date = fmt(t.year, { n: cal.year - s.startYear + 1 }) + ' · ' + t.months[month] + ' · ' +
      fmt(t.clock, { h: cal.hour }) + ' · ' + Math.round(s.rate.T) + ' °C';
    setText($('#hud-date'), date);
    var st, color;
    if (s.leaf < 0.001) { st = t.stomataState.none; color = '#9aa0a6'; }
    else if (s.rate.opening > 0.7) { st = t.stomataState.open; color = '#2f7d4a'; }
    else if (s.rate.opening > 0.3) { st = t.stomataState.half; color = '#e0a526'; }
    else { st = t.stomataState.closed; color = '#d6453a'; }
    var key = st + color + lang;
    if (force || last.st !== key) {
      $('#hud-stomata').innerHTML = '<span class="dot" style="background:' + color + '"></span>' + t.stomata + ': ' + st;
      last.st = key;
    }
    var live = function (k) { return document.querySelector('[data-live="' + k + '"]'); };
    setText(live('start'), kg(s.initialTreeC) + ' C');
    setText(live('litter'), kg(s.litter) + ' C');
    setText(live('in'), kg(s.cIn) + ' C');
    setText(live('resp'), kg(s.cOutResp) + ' C');
    setText(live('decomp'), kg(s.cOutDecomp) + ' C');
    setText(live('treeC'), kg(M.treeCarbon(s)) + ' C');
    if (S.step === 2 && (force || cal.hour === 0)) {
      var b = M.massBudget(s);
      setText(live('tree'), kg(b.dry));
      setText(live('soil'), s.soilMass.toFixed(2) + ' kg');
    }
  }

  var MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  function monthOf(day) {
    for (var m = 11; m >= 0; m--) if (day >= MONTH_START[m]) return m;
    return 0;
  }

  // ---------- simulation loop ----------

  var prevTime = null;
  function frame(now) {
    var dt = prevTime == null ? 0 : Math.min(0.1, (now - prevTime) / 1000);
    prevTime = now;
    var s = S.sim;
    var flows = { gpp: 0, resp: 0, decomp: 0 };
    var fast = !!S.ffTarget || S.speed === 'years';
    if (S.playing) {
      var rate = S.ffTarget ? FF_HOURS_PER_SEC : SPEEDS[S.speed];
      S.acc += rate * dt;
      var n = Math.floor(S.acc);
      S.acc -= n;
      if (S.ffTarget) n = Math.min(n, S.ffTarget - s.t);
      var in0 = s.cIn, r0 = s.cOutResp, d0 = s.cOutDecomp;
      for (var i = 0; i < n; i++) {
        M.step(s, S.env);
        trackTasks(s);
      }
      flows.gpp = s.cIn - in0; flows.resp = s.cOutResp - r0; flows.decomp = s.cOutDecomp - d0;
      if (S.ffTarget && s.t >= S.ffTarget) {
        S.ffTarget = null;
        S.playing = false;
        S.tasks.decade = true;
        renderControls();
        renderPanel();
      }
    }
    scene.feed(s, flows, dt, fast);
    scene.updateParticles(dt);
    scene.draw(s, S.env);
    updateLive(false);
    requestAnimationFrame(frame);
  }

  function trackTasks(s) {
    var cal = M.calendar(s.t), k = S.tasks, changed = false;
    if (k.day < 24 && S.speed === 'hours' && !S.ffTarget && cal.day > 140 && cal.day < 250) {
      k.day++;
      changed = k.day === 24;
    }
    if (!k.dry && S.env.water <= 0.2 && s.leaf > 0.001 && s.rate.light > 0.1) { k.dry = true; changed = true; }
    if (!k.decade && (s.t - s.startT) >= 10 * M.HOURS_PER_YEAR) { k.decade = true; changed = true; }
    if (changed && S.step === 1) renderPanel();
  }

  function fastForward() {
    S.ffTarget = S.sim.t + 10 * M.HOURS_PER_YEAR;
    S.playing = true;
    renderControls();
  }

  // ---------- events ----------

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b) return;
    var d = b.dataset;
    if (d.lang) { lang = d.lang; renderAll(); return; }
    if (d.step != null) { goTo(+d.step); return; }
    if (d.go != null) { goTo(+d.go); return; }
    if (d.before != null) { S.before = ANSWERS[+d.before]; renderAll(); return; }
    if (d.after != null) { S.after = ANSWERS[+d.after]; saveTally(); renderPanel(); return; }
    if (d.q1 != null) { S.q1 = +d.q1; renderPanel(); return; }
    if (d.q2 != null) { S.q2 = +d.q2; renderPanel(); return; }
    if (d.fate) { S.fate = d.fate; renderPanel(); return; }
    if (d.speed) { S.speed = d.speed; S.ffTarget = null; renderControls(); return; }
    switch (b.id) {
      case 'play': S.playing = !S.playing; if (!S.playing) S.ffTarget = null; renderControls(); break;
      case 'reset':
        S.sim = freshSim();
        S.env = { light: NORMAL.light, water: NORMAL.water, co2: NORMAL.co2 };
        S.playing = false; S.ffTarget = null;
        renderControls(); renderPanel();
        break;
      case 'ff10': fastForward(); break;
      case 'drought':
        // jump to a July morning, dry the soil, and watch at hour speed
        S.ffTarget = null;
        M.runUntil(S.sim, S.env, 190, 7);
        S.env.water = 0.1;
        S.speed = 'hours';
        S.playing = true;
        renderControls();
        break;
      case 'check': S.checked = true; renderPanel(); break;
      case 'next-student':
        saveTally();
        newStudent();
        renderAll();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'clear-tally':
        try { localStorage.removeItem(TALLY_KEY); } catch { /* ignore */ }
        renderTeacher();
        break;
    }
  }

  function onInput(e) {
    var el = e.target;
    if (el.dataset.env) {
      var v = parseFloat(el.value);
      S.env[el.dataset.env] = v;
      var txt = el.dataset.env === 'co2' ? co2Text(v) : Math.round(v * 100) + ' %';
      setText($('#v-' + el.dataset.env), txt);
    } else if (el.dataset.blank != null) {
      S.blanks[+el.dataset.blank] = parseInt(el.value, 10);
      if (S.checked) { S.checked = false; renderPanel(); }
    } else if (el.id === 'reflection') {
      S.reflection = el.value;
    }
  }

  function renderTeacher() {
    var t = T(), rows = readTally();
    var count = function (field, k) { return rows.filter(function (r) { return r[field] === k; }).length; };
    $('#teacher-body').innerHTML =
      '<p><strong>' + t.tallyTitle + '</strong> · ' + fmt(t.tallyN, { n: rows.length }) + '</p>' +
      '<table><tr><th></th><th>' + t.tallyBefore + '</th><th>' + t.tallyAfter + '</th></tr>' +
      ANSWERS.map(function (k) {
        return '<tr><td>' + t.answers[k] + '</td><td>' + count('b', k) + '</td><td>' + count('a', k) + '</td></tr>';
      }).join('') + '</table>' +
      '<p class="small">' + t.tallyNote + '</p>' +
      '<button type="button" class="btn" id="clear-tally">' + t.clear + '</button>';
  }

  // ---------- start ----------

  function init() {
    newStudent();
    scene = new window.Scene($('#scene'));
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput);
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { scene.resize(); if (S.step === 4) drawFateChart(); }, 120);
    });
    renderAll();
    requestAnimationFrame(frame);
  }

  init();
})();
