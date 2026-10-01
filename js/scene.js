/*
 * Draws the birch, its pot on a scale, the sky and the moving carbon.
 * Every CO2 dot looks the same wherever it came from: the carbon a tree
 * breathes out is the same kind of carbon it took in.
 */
(function () {
  'use strict';
  var M = window.TreeModel;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(c1, c2, t) {
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(lerp(c1[i], c2[i], t)); }).join(',') + ')';
  }

  // Small seeded random generator so the tree has the same shape every time.
  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  /*
   * Tree skeleton in units of tree height: trunk from (0,0) up to (0,-1).
   * Each branch has `born` (0..1): it appears once the tree is that grown.
   */
  function buildSkeleton() {
    var r = rng(7);
    var segs = [], tips = [];
    var trunkPts = [];
    var x = 0;
    for (var i = 0; i <= 10; i++) {
      trunkPts.push({ x: x, y: -i / 10 });
      x += (r() - 0.5) * 0.02;
    }
    function branch(x0, y0, ang, len, depth, born) {
      var x1 = x0 + Math.sin(ang) * len, y1 = y0 - Math.cos(ang) * len;
      segs.push({ x0: x0, y0: y0, x1: x1, y1: y1, depth: depth, born: born });
      if (depth >= 3) {
        // birch twigs hang down (Betula pendula = "hanging birch")
        var hang = 0.05 + r() * 0.06;
        segs.push({ x0: x1, y0: y1, x1: x1 + Math.sin(ang) * 0.02, y1: y1 + hang, depth: 4, born: born });
        tips.push({ x: x1, y: y1 + hang * 0.6, born: born });
        tips.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 + 0.02, born: born + 0.02 });
        return;
      }
      var n = depth === 1 ? 3 : 2;
      for (var k = 0; k < n; k++) {
        var f = 0.45 + 0.45 * (k + r() * 0.5) / n;
        var bx = lerp(x0, x1, f), by = lerp(y0, y1, f);
        var side = k % 2 === 0 ? 1 : -1;
        branch(bx, by, ang + side * (0.35 + r() * 0.4), len * (0.45 + r() * 0.2), depth + 1,
               born + 0.04 + r() * 0.08);
      }
      tips.push({ x: x1, y: y1, born: born });
    }
    var N = 13;
    for (var j = 0; j < N; j++) {
      var h = 0.32 + 0.64 * j / N;
      var side = j % 2 === 0 ? 1 : -1;
      var ang = side * (0.55 + r() * 0.35) * (1 - 0.35 * h);
      var len = 0.42 * Math.pow(1 - h, 0.55) + 0.06;
      // lower branches appear only once the tree has grown taller
      var born = clamp((1 - h) * 0.55 + r() * 0.08 - 0.1, 0, 0.6);
      var ti = Math.round(h * 10);
      branch(trunkPts[ti].x, -h, ang, len, 1, born);
    }
    // crown top
    branch(trunkPts[10].x, -1, 0.1, 0.12, 2, 0);
    return { segs: segs, tips: tips, trunk: trunkPts };
  }

  function Scene(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.skel = buildSkeleton();
    this.particles = [];
    this.acc = { gpp: 0, resp: 0, decomp: 0, bounce: 0 };
    this.labels = { soil: 'SOIL', rings: 'Tree rings', tree: 'Tree {m}' };
    this.leafPts = [];
    this.woodPts = [];
    this.rootPts = [];
    this.litterPts = [];
    this.resize();
    for (var i = 0; i < 34; i++) this.spawnAmbient(true);
  }

  Scene.prototype.resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(280, rect.width), h = w * 0.78;
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w; this.H = h;
    this.groundY = h * 0.86;
    this.scaleH = h * 0.04;
    this.potH = h * 0.13;
    this.potTop = this.groundY - this.scaleH - this.potH;
    this.soilY = this.potTop + h * 0.012;
    this.cx = w * 0.56;
    this.potW = Math.min(w * 0.22, h * 0.26);
  };

  // ---------- particles ----------

  Scene.prototype.spawnAmbient = function (anywhere) {
    var W = this.W, H = this.H;
    this.particles.push({
      kind: 'co2',
      x: anywhere ? Math.random() * W : (Math.random() < 0.5 ? -8 : W + 8),
      y: anywhere ? H * (0.05 + Math.random() * 0.62) : H * (0.05 + Math.random() * 0.55),
      vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 8,
      rot: Math.random() * Math.PI, life: 0
    });
  };

  Scene.prototype.pick = function (pts) {
    return pts.length ? pts[Math.floor(Math.random() * pts.length)] : { x: this.cx, y: this.soilY - 40 };
  };

  // Take a CO2 dot from the air (the nearest one to the target) and send it in.
  Scene.prototype.sendIn = function (kind) {
    var target = this.pick(this.leafPts);
    var best = null, bd = Infinity;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.kind !== 'co2' || p.fade) continue;
      var d = Math.hypot(p.x - target.x, p.y - target.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) { this.spawnAmbient(false); best = this.particles[this.particles.length - 1]; }
    best.kind = kind; // 'in' or 'bounce'
    best.tx = target.x; best.ty = target.y; best.life = 0;
  };

  Scene.prototype.sendOut = function (from) {
    var src = this.pick(from);
    this.particles.push({ kind: 'out', x: src.x, y: src.y, vx: (Math.random() - 0.5) * 50,
                          vy: -30 - Math.random() * 25, rot: Math.random() * Math.PI, life: 0,
                          ceil: this.H * (0.06 + Math.random() * 0.4) });
  };

  /*
   * flows: carbon (kg C) that moved since the last frame.
   * One dot always stands for the same amount of carbon, whichever way it moves.
   */
  Scene.prototype.feed = function (sim, flows, realDt, fast) {
    var unit = M.P.eps * M.crownArea(sim) * 0.6;
    var a = this.acc;
    var gIn = flows.gpp / unit, gResp = flows.resp / unit, gDec = flows.decomp / unit;
    // When time runs fast there are too many dots to draw. Thin them all by
    // the same factor, so the ratio of carbon in to carbon out stays true.
    var budget = (fast ? 14 : 40) * realDt;
    var total = gIn + gResp + gDec;
    if (total > budget && total > 0) {
      var k = budget / total;
      gIn *= k; gResp *= k; gDec *= k;
    }
    a.gpp = Math.min(a.gpp + gIn, 3);
    a.resp = Math.min(a.resp + gResp, 3);
    a.decomp = Math.min(a.decomp + gDec, 3);
    var cap = 4, n = 0;
    while (a.gpp >= 1 && n++ < cap) { a.gpp -= 1; this.sendIn('in'); }
    n = 0;
    while (a.resp >= 1 && n++ < cap) {
      a.resp -= 1;
      var r = Math.random();
      // leaves breathe most, then roots, then the thin living layer of wood
      this.sendOut(sim.leaf > 0.001 && r < 0.6 ? this.leafPts : r < 0.85 ? this.rootPts : this.woodPts);
    }
    n = 0;
    while (a.decomp >= 1 && n++ < cap) { a.decomp -= 1; this.sendOut(this.litterPts); }
    // Closed stomata: CO2 reaches the leaf but cannot get in.
    var rt = sim.rate;
    if (!fast && sim.leaf > 0.001 && rt.light > 0.1) {
      a.bounce += (1 - rt.opening) * rt.light * realDt * 3;
      if (a.bounce >= 1) { a.bounce -= 1; this.sendIn('bounce'); }
    } else a.bounce = 0;
  };

  Scene.prototype.updateParticles = function (dt) {
    var W = this.W, H = this.H, ps = this.particles, keep = [];
    var ambient = 0;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      p.life += dt;
      if (p.kind === 'co2') {
        if (!p.fade) ambient++;
        p.vx += (Math.random() - 0.5) * 20 * dt;
        p.vy += (Math.random() - 0.5) * 20 * dt;
        p.vx = clamp(p.vx, -18, 18); p.vy = clamp(p.vy, -12, 12);
        if (p.y > this.potTop - 30) p.vy -= 30 * dt;
        if (p.y < H * 0.04) p.vy += 30 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += dt * 0.5;
        if (p.x < -12) p.x = W + 10;
        if (p.x > W + 12) p.x = -10;
      } else if (p.kind === 'in' || p.kind === 'bounce') {
        var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        var sp = 90 + p.life * 60;
        if (d < 5) {
          if (p.kind === 'in') {
            // inside the leaf, carbon becomes sugar and travels to where the tree grows
            p.kind = 'sugar'; p.life = 0;
            var dest = Math.random() < 0.7 ? this.pick(this.woodPts) : this.pick(this.rootPts);
            p.tx = dest.x; p.ty = dest.y;
          } else {
            p.kind = 'co2';
            p.vx = -dx / (d || 1) * 40 + (Math.random() - 0.5) * 30;
            p.vy = -30 - Math.random() * 20;
            p.flash = 0.5;
          }
        } else {
          p.x += dx / d * Math.min(sp * dt, d);
          p.y += dy / d * Math.min(sp * dt, d);
        }
        p.rot += dt * 3;
      } else if (p.kind === 'sugar') {
        var sx = p.tx - p.x, sy = p.ty - p.y, sd = Math.hypot(sx, sy);
        if (sd < 3 || p.life > 3) continue; // built into wood or roots
        p.x += sx / sd * Math.min(70 * dt, sd);
        p.y += sy / sd * Math.min(70 * dt, sd);
      } else if (p.kind === 'out') {
        p.vy -= 4 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += dt;
        if (p.y < p.ceil) p.kind = 'co2'; // back in the open air
      }
      if (p.flash) p.flash = Math.max(0, p.flash - dt);
      keep.push(p);
    }
    // Keep the air from filling up or emptying: surplus dots drift away
    // (the atmosphere is huge), lowest first so the sky stays evenly filled.
    var excess = ambient - 44;
    if (excess > 0) {
      var olds = keep.filter(function (q) { return q.kind === 'co2' && !q.fade; })
                     .sort(function (x, y) { return y.y - x.y; });
      for (var j = 0; j < excess && j < olds.length; j++) olds[j].fade = 1;
    }
    keep = keep.filter(function (q) {
      if (!q.fade) return true;
      q.fade -= dt * 0.8;
      q.y -= dt * 25;
      return q.fade > 0;
    });
    this.particles = keep;
    if (ambient < 28 && Math.random() < dt * 4) this.spawnAmbient(false);
  };

  // ---------- drawing ----------

  Scene.prototype.drawCO2 = function (x, y, rot, alpha) {
    var c = this.ctx, k = this.W / 700;
    var dx = Math.cos(rot) * 5.4 * k, dy = Math.sin(rot) * 5.4 * k;
    c.globalAlpha = alpha;
    c.fillStyle = '#d6453a';
    c.beginPath(); c.arc(x - dx, y - dy, 2.9 * k, 0, 7); c.fill();
    c.beginPath(); c.arc(x + dx, y + dy, 2.9 * k, 0, 7); c.fill();
    c.fillStyle = '#2b2d31';
    c.beginPath(); c.arc(x, y, 3.4 * k, 0, 7); c.fill();
    c.globalAlpha = 1;
  };

  Scene.prototype.drawSky = function (sim) {
    var c = this.ctx, W = this.W, H = this.H;
    var cal = M.calendar(sim.t);
    var sun = M.sunHeight(cal.day, cal.hour);
    var dayness = clamp(sun * 5, 0, 1);
    var winter = cal.day < 90 || cal.day > 300 ? 1 : 0;
    var g = c.createLinearGradient(0, 0, 0, this.groundY);
    g.addColorStop(0, mix([14, 27, 56], winter ? [150, 175, 200] : [86, 166, 226], dayness));
    g.addColorStop(1, mix([40, 62, 100], winter ? [214, 224, 232] : [200, 232, 248], dayness));
    c.fillStyle = g;
    c.fillRect(0, 0, W, this.groundY);
    // sun moves across the sky with the hour of the day
    if (sun > 0) {
      var sx = W * (0.08 + 0.84 * ((cal.hour + 0.5) / 24));
      var sy = this.groundY - 20 - sun * H * 0.85;
      c.fillStyle = 'rgba(255, 214, 90, 0.25)';
      c.beginPath(); c.arc(sx, sy, 26, 0, 7); c.fill();
      c.fillStyle = '#ffd54a';
      c.beginPath(); c.arc(sx, sy, 15, 0, 7); c.fill();
    } else {
      c.fillStyle = 'rgba(255,255,255,0.7)';
      for (var i = 0; i < 25; i++) {
        var r = rng(i + 3);
        c.fillRect(r() * W, r() * this.groundY * 0.6, 1.5, 1.5);
      }
    }
    // ground
    var snowy = M.temperature(cal.day, 12) < -1;
    c.fillStyle = snowy ? '#eef3f7' : (cal.day > 120 && cal.day < 290 ? '#6f9a4a' : '#8a8a5c');
    c.fillRect(0, this.groundY, W, H - this.groundY);
    c.fillStyle = 'rgba(0,0,0,' + (0.45 * (1 - dayness)) + ')';
    c.fillRect(0, this.groundY, W, H - this.groundY);
    return { dayness: dayness, snowy: snowy, cal: cal };
  };

  Scene.prototype.drawPotAndScale = function (sim, env) {
    var c = this.ctx, cx = this.cx, pw = this.potW;
    var sy = this.groundY - this.scaleH;
    // scale
    c.fillStyle = '#5b6470';
    c.fillRect(cx - pw * 0.75, sy, pw * 1.5, this.scaleH);
    c.fillStyle = '#c9ff9e';
    var dw = pw * 0.78, dh = this.scaleH * 0.66;
    c.fillStyle = '#1d2a1d';
    c.fillRect(cx - dw / 2, sy + this.scaleH * 0.17, dw, dh);
    c.fillStyle = '#9cff7a';
    c.font = '600 ' + Math.round(dh * 0.72) + 'px ui-monospace, Menlo, monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(this.labels.soil + ' ' + sim.soilMass.toFixed(2) + ' kg', cx, sy + this.scaleH * 0.5);
    // pot (front is see-through so we can watch the roots)
    var top = this.potTop, bot = sy, tw = pw, bw = pw * 0.78;
    c.beginPath();
    c.moveTo(cx - tw / 2, top); c.lineTo(cx + tw / 2, top);
    c.lineTo(cx + bw / 2, bot); c.lineTo(cx - bw / 2, bot); c.closePath();
    var wet = clamp(env.water, 0, 1);
    c.fillStyle = mix([176, 140, 98], [92, 64, 44], wet);
    c.fill();
    this.potPath = [cx - tw / 2, top, cx + tw / 2, top, cx + bw / 2, bot, cx - bw / 2, bot];
  };

  Scene.prototype.drawRoots = function (sim) {
    var c = this.ctx, cx = this.cx, pw = this.potW, p = this.potPath;
    c.save();
    c.beginPath();
    c.moveTo(p[0], p[1]); c.lineTo(p[2], p[3]); c.lineTo(p[4], p[5]); c.lineTo(p[6], p[7]); c.closePath();
    c.clip();
    var g = 1 - Math.exp(-sim.root / 2);
    var n = 4 + Math.round(g * 10);
    var r = rng(11);
    c.strokeStyle = '#e8dcc0';
    this.rootPts = [];
    for (var i = 0; i < n; i++) {
      var ang = (r() - 0.5) * 2.4;
      var len = (0.3 + 0.7 * g) * (this.potH * (0.6 + r() * 0.5));
      var x0 = cx, y0 = this.soilY;
      var x1 = x0 + Math.sin(ang) * len * 0.9, y1 = y0 + Math.abs(Math.cos(ang)) * len;
      c.lineWidth = 1 + 2.5 * g * (1 - i / n);
      c.beginPath(); c.moveTo(x0, y0);
      c.quadraticCurveTo(x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.6, x1, y1); c.stroke();
      this.rootPts.push({ x: lerp(x0, x1, 0.7), y: lerp(y0, y1, 0.7) });
    }
    c.restore();
    // pot rim
    c.fillStyle = '#a5532e';
    c.fillRect(cx - pw * 0.53, this.potTop - 4, pw * 1.06, 9);
    c.strokeStyle = '#8a4426'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[6], p[7]); c.moveTo(p[2], p[3]); c.lineTo(p[4], p[5]); c.stroke();
    void pw;
  };

  Scene.prototype.drawLitter = function (sim, snowy) {
    var c = this.ctx, cx = this.cx, pw = this.potW;
    var lt = Math.max(M.leafTarget(sim), 0.02);
    var n = Math.min(40, Math.round(18 * sim.litter / lt));
    var r = rng(21);
    this.litterPts = [];
    for (var i = 0; i < n; i++) {
      var x = cx + (r() - 0.5) * pw * 0.9, y = this.soilY - 1 - r() * 3;
      c.fillStyle = ['#b8862f', '#9c6b2a', '#c99a3a', '#7d5a2b'][i % 4];
      c.beginPath(); c.ellipse(x, y, 4, 2, r() * 3, 0, 7); c.fill();
      this.litterPts.push({ x: x, y: y });
    }
    if (!n) this.litterPts.push({ x: cx + pw * 0.2, y: this.soilY - 2 });
    if (snowy) {
      c.fillStyle = '#f4f8fb';
      c.fillRect(cx - pw * 0.5, this.soilY - 4, pw, 5);
    }
  };

  Scene.prototype.drawTree = function (sim, info) {
    var c = this.ctx, cal = info.cal;
    var g = 0.18 + 0.82 * (1 - Math.exp(-sim.stem / 6));
    var maxH = this.soilY - this.H * 0.07;
    var Ht = maxH * (0.22 + 0.78 * (1 - Math.exp(-sim.stem / 5)));
    var bx = this.cx, by = this.soilY;
    var X = function (x) { return bx + x * Ht; };
    var Y = function (y) { return by + y * Ht; };
    var skel = this.skel;
    var trunkW = Math.max(4, this.potW * (0.06 + 0.22 * (1 - Math.exp(-sim.stem / 8))));

    // branches
    c.lineCap = 'round';
    this.woodPts = [];
    for (var i = 0; i < skel.segs.length; i++) {
      var s = skel.segs[i];
      if (g < s.born) continue;
      var grow = clamp((g - s.born) / 0.15, 0, 1);
      var x1 = lerp(s.x0, s.x1, grow), y1 = lerp(s.y0, s.y1, grow);
      c.strokeStyle = s.depth >= 3 ? '#5a4636' : '#d9d4c6';
      c.lineWidth = Math.max(0.8, trunkW * [0, 0.32, 0.18, 0.09, 0.05][s.depth]);
      c.beginPath(); c.moveTo(X(s.x0), Y(s.y0)); c.lineTo(X(x1), Y(y1)); c.stroke();
      if (s.depth === 1) this.woodPts.push({ x: X(lerp(s.x0, x1, 0.5)), y: Y(lerp(s.y0, y1, 0.5)) });
    }
    // trunk: white birch bark with dark marks
    var tp = skel.trunk;
    c.fillStyle = '#efece3';
    c.beginPath();
    for (var k = 0; k < tp.length; k++) c.lineTo(X(tp[k].x) - trunkW / 2 * (1 - k / 11), Y(tp[k].y));
    for (k = tp.length - 1; k >= 0; k--) c.lineTo(X(tp[k].x) + trunkW / 2 * (1 - k / 11), Y(tp[k].y));
    c.closePath(); c.fill();
    c.strokeStyle = '#b9b4a6'; c.lineWidth = 1; c.stroke();
    var r = rng(5);
    c.fillStyle = '#2f2b26';
    for (k = 0; k < 16; k++) {
      var f = r() * 0.85, w = trunkW * (1 - f) * (0.3 + r() * 0.4);
      c.fillRect(X(tp[Math.floor(f * 10)].x) - w / 2 + (r() - 0.5) * trunkW * 0.3, Y(-f), w, 1.5 + r() * 1.5);
    }
    for (k = 1; k < 10; k++) this.woodPts.push({ x: X(tp[k].x), y: Y(tp[k].y) });

    // leaves
    var lt = Math.max(M.leafTarget(sim), 1e-6);
    var full = clamp(sim.leaf / lt, 0, 1);
    var tips = skel.tips.filter(function (t) { return g >= t.born; });
    var showN = Math.round(tips.length * full);
    var fallStart = M.P.leafFallStart, fallEnd = M.P.leafFallEnd;
    var autumn = clamp((cal.day - fallStart + 18) / (fallEnd - fallStart), 0, 1);
    var green = sim.rate.opening < 0.45 ? [128, 140, 70] : [72, 150, 58];
    var spring = cal.day < M.P.leafOutEnd + 10 ? [138, 196, 76] : green;
    var leafCol = cal.day > fallStart - 18 ? mix(green, [226, 182, 52], autumn) : mix(spring, green, 0.5);
    this.leafPts = [];
    var lr = rng(9);
    var leafSize = this.W / 700 * (3.2 + 2 * g);
    for (i = 0; i < tips.length; i++) {
      var t = tips[i];
      var on = i * 7919 % tips.length < showN;
      var jx = (lr() - 0.5) * 0.05, jy = (lr() - 0.5) * 0.05;
      if (!on) continue;
      var px = X(t.x + jx), py = Y(t.y + jy);
      c.fillStyle = leafCol;
      for (var q = 0; q < 3; q++) {
        c.beginPath();
        c.ellipse(px + (q - 1) * leafSize * 1.2, py + (q % 2) * leafSize, leafSize * 1.4, leafSize, q, 0, 7);
        c.fill();
      }
      this.leafPts.push({ x: px, y: py });
    }
    this.treeTop = Y(-1);
    this.trunkW = trunkW;
  };

  Scene.prototype.drawRings = function (sim) {
    var c = this.ctx, H = this.H, R = H * 0.1;
    var ox = R + 14, oy = this.groundY - R - 26;
    var widths = [sim.initialRingBase || 0.22];
    for (var i = 0; i < sim.rings.length; i++) widths.push(sim.rings[i].wood);
    widths.push(sim.ringNow);
    var total = widths.reduce(function (a, b) { return a + b; }, 0);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.arc(ox, oy, R + 8, 0, 7); c.fill();
    // bark
    c.fillStyle = '#efece3';
    c.beginPath(); c.arc(ox, oy, R + 3, 0, 7); c.fill();
    c.strokeStyle = '#2f2b26'; c.lineWidth = 1; c.stroke();
    var cum = total;
    for (i = widths.length - 1; i >= 0; i--) {
      var rad = R * Math.sqrt(cum / total);
      var stressed = i > 0 && i <= sim.rings.length && sim.rings[i - 1].stress > 300;
      c.fillStyle = i === widths.length - 1 ? '#f3d9a8' : stressed ? '#c99a62' : '#ecc98f';
      c.beginPath(); c.arc(ox, oy, rad, 0, 7); c.fill();
      c.strokeStyle = '#9d7442'; c.lineWidth = i === 0 ? 0 : 1.2;
      if (i > 0) c.stroke();
      cum -= widths[i];
    }
    c.fillStyle = '#7a5530';
    c.beginPath(); c.arc(ox, oy, 2, 0, 7); c.fill();
    c.fillStyle = '#1d2433';
    c.font = '600 ' + Math.round(H * 0.03) + 'px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText(this.labels.rings, ox, oy + R + 11);
  };

  Scene.prototype.drawTreeTag = function (sim) {
    var c = this.ctx;
    var dry = M.massBudget(sim).dry;
    var txt = this.labels.tree.replace('{m}', dry < 10 ? dry.toFixed(1) + ' kg' : Math.round(dry) + ' kg');
    c.font = '600 ' + Math.round(this.H * 0.03) + 'px system-ui, sans-serif';
    var w = c.measureText(txt).width + 14, h = this.H * 0.05;
    var x = this.cx + this.potW * 0.6 + 6, y = this.potTop + this.potH * 0.45;
    if (x + w > this.W - 4) x = this.W - w - 4;
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(x, y - h / 2, w, h);
    c.fillStyle = '#1d2433'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(txt, x + 7, y);
  };

  Scene.prototype.draw = function (sim, env) {
    var c = this.ctx;
    c.clearRect(0, 0, this.W, this.H);
    var info = this.drawSky(sim);
    this.drawPotAndScale(sim, env);
    this.drawRoots(sim);
    this.drawLitter(sim, info.snowy);
    this.drawTree(sim, info);
    // particles on top
    var ps = this.particles;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.kind === 'sugar') {
        c.fillStyle = '#f4a52c';
        c.beginPath(); c.arc(p.x, p.y, 3 * this.W / 700, 0, 7); c.fill();
      } else {
        var a = p.kind === 'out' ? Math.min(1, p.life * 3) : p.fade ? 0.95 * p.fade : 0.95;
        this.drawCO2(p.x, p.y, p.rot, a);
        if (p.flash) {
          c.strokeStyle = 'rgba(214,69,58,' + p.flash * 2 + ')';
          c.lineWidth = 2;
          c.beginPath(); c.arc(p.x, p.y, 9, 0, 7); c.stroke();
        }
      }
    }
    this.drawRings(sim);
    this.drawTreeTag(sim);
  };

  window.Scene = Scene;
})();
