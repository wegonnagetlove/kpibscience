(function () {
  "use strict";

  /* ================= ДАННЫЕ ================= */
  var D = window.KPIB;
  var LEVELS = D.LEVELS;
  var MIN_L = LEVELS[0].level;
  var COLORS = { "-3": "#a3acb8", "-2": "#e0b34a", "-1": "#6f95ec", "0": "#e8743b", "1": "#cfa57a",
                 "2": "#e9d391", "3": "#7fcadb", "4": "#5f84e0", "5": "#b78ce0" };
  var TYPES = {
    article:     { name: "Статья в журнале",    r: 2.1 },
    chapter:     { name: "Статья в сборнике",   r: 1.7 },
    book:        { name: "Монография, книга",   r: 2.8 },
    thesis:      { name: "Диссертация",         r: 3.6 },
    supervision: { name: "Научное руководство", r: 2.6 },
    talk:        { name: "Тезисы, доклад",      r: 1.5 },
    event:       { name: "Научное мероприятие", r: 1.8 }
  };
  var TYPE_GROUPS = [["article", "Статьи в журналах"], ["chapter", "Статьи в сборниках"], ["book", "Монографии, книги"],
                     ["thesis", "Диссертации и руководство", ["supervision"]], ["talk", "Тезисы, доклады, мероприятия", ["event"]]];

  var WORKS = D.WORKS.concat((window.KPIB_ISTINA || []).map(function (w) { w.source = "istina"; return w; }));
  var byId = {};
  WORKS.forEach(function (w) { byId[w.id] = w; });
  var people = {};
  D.PEOPLE.forEach(function (p) { people[p.id] = p; });
  var years = WORKS.map(function (w) { return w.year; }).filter(Boolean);
  var MIN_Y = Math.min.apply(null, years), MAX_Y = Math.max.apply(null, years);

  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е"); }
  function levelInfo(l) { return LEVELS.filter(function (x) { return x.level === l; })[0]; }
  function lnum(l) { return l - MIN_L + 1; }
  function shortAuthors(w) { return w.authors.map(function (id) { return people[id].short; }).join(", "); }
  function plural(n, a, b, c) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return a;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b;
    return c;
  }
  function works(n) { return n + " " + plural(n, "работа", "работы", "работ"); }
  WORKS.forEach(function (w) { w._q = norm(w.title + " " + (w.venue || "") + " " + (w.year || "") + " " + shortAuthors(w)); });
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }

  /* ---------- фильтры ---------- */
  var offPeople = {}, offTypes = {};
  function typeGroup(t) {
    for (var i = 0; i < TYPE_GROUPS.length; i++) {
      var g = TYPE_GROUPS[i];
      if (g[0] === t || (g[2] && g[2].indexOf(t) >= 0)) return g[0];
    }
    return t;
  }
  function passes(w) {
    if (offTypes[typeGroup(w.type)]) return false;
    if (Object.keys(offPeople).length && !w.authors.some(function (id) { return !offPeople[id]; })) return false;
    return true;
  }

  /* ================= СИСТЕМА ================= */
  var TILT = 0.58;
  var orbits = LEVELS.map(function (L, i) {
    var r = rng(500 + i * 31);
    return {
      L: L, i: i, color: COLORS[String(L.level)],
      R: 80 + 74 * i,
      e: 0.02 + r() * 0.06,
      w: (r() - 0.5) * 1.2,
      speed: 0.05 / Math.pow(1 + i * 0.92, 1.5),
      p0: r() * Math.PI * 2,
      works: WORKS.filter(function (w) { return w.level === L.level; }).sort(function (a, b) { return (b.year || 0) - (a.year || 0); })
    };
  });
  var orbitOf = {};
  orbits.forEach(function (o) { orbitOf[o.L.level] = o; });

  // положение на орбите (в плоскости орбиты, затем наклон к наблюдателю)
  function orbitPoint(o, theta, k) {
    k = k || 1;
    var R = o.R * k, b = R * Math.sqrt(1 - o.e * o.e);
    var x = R * Math.cos(theta) - R * o.e, y = b * Math.sin(theta);
    var c = Math.cos(o.w), s = Math.sin(o.w);
    return [x * c - y * s, (x * s + y * c) * TILT];
  }

  var bodies = [];
  orbits.forEach(function (o) {
    var r = rng(9000 + o.i * 101);
    o.works.forEach(function (w) {
      bodies.push({ w: w, o: o, th: r() * Math.PI * 2, k: 1 + (r() - 0.5) * 0.16, sp: o.speed * (0.9 + r() * 0.2), x: 0, y: 0, born: 0 });
    });
  });
  var bodyOf = {};
  bodies.forEach(function (b) { bodyOf[b.w.id] = b; });

  /* ================= ХОЛСТ И КАМЕРА ================= */
  var canvas = $("#sky"), ctx = canvas.getContext("2d");
  var W = 0, H = 0, DPR = 1, starsCanvas = null;
  var cam = { x: 0, y: 0, s: 1 }, camTarget = null, follow = null;
  var sel = null;             // {kind:"work"|"orbit"|"sun", ...}
  var hover = null;

  function panelW() { return document.body.classList.contains("panel-open") && W > 760 ? Math.min(600, W * 0.44) : 0; }
  function viewCenter() {
    var pw = panelW();
    return [(W - pw) / 2, W <= 760 && document.body.classList.contains("panel-open") ? H * 0.13 : H / 2];
  }
  function P(x, y) { var c = viewCenter(); return [c[0] + (x - cam.x) * cam.s, c[1] + (y - cam.y) * cam.s]; }
  function Pinv(sx, sy) { var c = viewCenter(); return [(sx - c[0]) / cam.s + cam.x, (sy - c[1]) / cam.s + cam.y]; }
  function fitScale() {
    var o = orbits[orbits.length - 1], R = o.R * 1.12;
    var pw = panelW();
    return Math.min((W - pw - 40) / (2 * R), (H - 120) / (2 * R * TILT + 60));
  }
  var MIN_S = 0.05, MAX_S = 40;
  function clampS(s) { return Math.max(MIN_S, Math.min(MAX_S, s)); }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildStars();
  }
  function buildStars() {
    starsCanvas = document.createElement("canvas");
    starsCanvas.width = Math.round(W * DPR); starsCanvas.height = Math.round(H * DPR);
    var c = starsCanvas.getContext("2d"); c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    // млечный путь
    var r = rng(7);
    for (var i = 0; i < 60; i++) {
      var t = r(), x = t * W, y = H * (0.15 + 0.7 * t) + (r() - 0.5) * H * 0.25, rad = 80 + r() * 220;
      var g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(120,140,190,0.035)"); g.addColorStop(1, "rgba(120,140,190,0)");
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
    }
    var n = Math.round(W * H / 1400);
    for (var j = 0; j < n; j++) {
      var a = r(); c.globalAlpha = 0.15 + a * 0.6;
      c.fillStyle = a > 0.97 ? "#dbe6ff" : "#aeb7c6";
      var sz = a > 0.985 ? 1.6 : (a > 0.8 ? 1 : 0.6);
      c.fillRect(r() * W, r() * H, sz, sz);
    }
    c.globalAlpha = 1;
  }

  /* ================= ВРЕМЯ ================= */
  var playing = true, t = 0, yearNow = MAX_Y, histRun = false, SPEEDS = [1, 2, 5, 10], speedIdx = 0;
  var last = performance.now();
  function setPlaying(v) {
    playing = v;
    $("#icoStop").style.display = v ? "" : "none"; $("#icoPlay").style.display = v ? "none" : "";
    $("#btnPlay").setAttribute("aria-label", v ? "Пауза" : "Пуск");
  }
  function timeLabel() {
    $("#year").textContent = histRun || yearNow < MAX_Y ? String(Math.floor(yearNow)) : MIN_Y + "–" + MAX_Y;
    $("#speed").textContent = histRun ? SPEEDS[speedIdx] + " " + plural(SPEEDS[speedIdx], "год", "года", "лет") + " / сек" : "все годы · орбиты движутся";
  }
  function visibleNow(w) { return !w.year || w.year <= yearNow + 0.0001; }

  /* ================= ОТРИСОВКА ================= */
  var labelRects = [];
  function freeRect(x, y, w, h) {
    for (var i = 0; i < labelRects.length; i++) {
      var r = labelRects[i];
      if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return false;
    }
    labelRects.push([x, y, w, h]); return true;
  }
  function tag(text, bx, by, color, opts) {
    opts = opts || {};
    var fs = opts.size || 12;
    ctx.font = (opts.weight || 500) + " " + fs + "px Jura, 'Segoe UI', Arial, sans-serif";
    var tw = ctx.measureText(text).width;
    var h = fs + 8, skew = 7, x0 = bx + 4, y1 = by - 3, y0 = y1 - h;
    if (!opts.force && !freeRect(x0, y0, tw + skew + 14, h)) return false;
    if (opts.force) labelRects.push([x0, y0, tw + skew + 14, h]);
    ctx.beginPath();
    ctx.moveTo(x0, y1); ctx.lineTo(x0 + skew, y0); ctx.lineTo(x0 + skew + tw + 12, y0); ctx.lineTo(x0 + skew + tw + 12, y1); ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.62)"; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = opts.sel ? 1.5 : 1; ctx.stroke();
    ctx.fillStyle = opts.textColor || color; ctx.textAlign = "left";
    ctx.fillText(text, x0 + skew + 6, y1 - 5);
    return true;
  }

  function draw() {
    ctx.drawImage(starsCanvas, 0, 0, W, H);
    labelRects = [];
    var selOrbit = sel && (sel.kind === "orbit" ? sel.o : sel.kind === "work" ? sel.b.o : null);

    // орбиты
    orbits.forEach(function (o) {
      var isSel = o === selOrbit, N = 220;
      ctx.beginPath();
      for (var i = 0; i <= N; i++) {
        var q = orbitPoint(o, i / N * Math.PI * 2), p = P(q[0], q[1]);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      if (isSel && sel.kind === "orbit") { ctx.fillStyle = hexA(o.color, 0.08); ctx.fill(); }
      ctx.strokeStyle = isSel ? o.color : hexA(o.color, 0.55);
      ctx.lineWidth = isSel ? (sel.kind === "orbit" ? 2.4 : 1.6) : 1;
      ctx.stroke();
    });

    // тела-работы
    var filt = Object.keys(offPeople).length || Object.keys(offTypes).length;
    var zoomK = Math.min(Math.max(cam.s, 0.35), 4);
    bodies.forEach(function (b) {
      var q = orbitPoint(b.o, b.th, b.k); b.x = q[0]; b.y = q[1];
      if (!visibleNow(b.w)) return;
      var p = P(b.x, b.y);
      if (p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) { b.sx = -999; return; }
      b.sx = p[0]; b.sy = p[1];
      var ok = passes(b.w);
      var r = Math.max(1, TYPES[b.w.type].r * zoomK * 0.75);
      var fresh = b.born ? Math.max(0, 1 - (performance.now() - b.born) / 1400) : 0;
      ctx.globalAlpha = ok ? 0.95 : 0.12;
      ctx.fillStyle = b.w.type === "thesis" || b.w.type === "supervision" ? "#ffffff" : hexA(b.o.color, 1);
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
      if (b.w.type === "thesis") { ctx.strokeStyle = b.o.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p[0], p[1], r + 2.5, 0, Math.PI * 2); ctx.stroke(); }
      if (fresh > 0) { ctx.globalAlpha = fresh; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p[0], p[1], r + 10 * (1 - fresh) + 2, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    });

    // солнце: кафедра
    var sp = P(0, 0), sr = Math.max(4, Math.min(14, 7 * Math.sqrt(cam.s)));
    var g = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], sr * 6);
    g.addColorStop(0, "rgba(255,170,60,0.45)"); g.addColorStop(1, "rgba(255,170,60,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sp[0], sp[1], sr * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffb347"; ctx.beginPath(); ctx.arc(sp[0], sp[1], sr, 0, Math.PI * 2); ctx.fill();

    // линия от солнца к выбранному
    var selPt = null, selColor = "#fff";
    if (sel && sel.kind === "work") { selPt = [sel.b.x, sel.b.y]; selColor = sel.b.o.color; }
    if (sel && sel.kind === "orbit") { var pq = planetPos(sel.o); selPt = pq; selColor = sel.o.color; }
    if (selPt) {
      var a = P(selPt[0], selPt[1]);
      ctx.strokeStyle = selColor; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(a[0], a[1]); ctx.stroke();
    }

    // подписи: солнце, планеты-уровни
    tag("Кафедра", sp[0], sp[1], "#ffb347", { force: true, sel: sel && sel.kind === "sun", weight: 600 });
    var edge = [];
    orbits.forEach(function (o) {
      var q = planetPos(o), p = P(q[0], q[1]);
      var on = p[0] > 4 && p[0] < W - panelW() - 4 && p[1] > 4 && p[1] < H - 4;
      if (!on) { edge.push([o, p]); return; }
      ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(p[0], p[1], 3.6, 0, Math.PI * 2); ctx.fill();
      tag(o.L.name, p[0], p[1], o.color, { force: true, sel: sel && sel.kind === "orbit" && sel.o === o });
      o.sx = p[0]; o.sy = p[1];
    });
    edge.forEach(function (e) { edgeMark(e[0], e[1]); });

    // подписи работ при приближении
    var showWorks = cam.s >= 2;
    if (sel && sel.kind === "work" && sel.b.sx > -999 && visibleNow(sel.b.w)) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(sel.b.sx, sel.b.sy, 7, 0, Math.PI * 2); ctx.stroke();
      tag(cut(sel.b.w.title, 60), sel.b.sx, sel.b.sy, sel.b.o.color, { force: true, sel: true, textColor: "#fff" });
    }
    if (hover && hover.kind === "work" && hover.b.sx > -999 && (!sel || sel.b !== hover.b)) {
      tag(cut(hover.b.w.title, 60), hover.b.sx, hover.b.sy, "#dee2e6", { force: true });
    }
    if (showWorks) {
      var n = 0;
      for (var i = 0; i < bodies.length && n < Math.round(20 + cam.s * 8); i++) {
        var b = bodies[i];
        if (b.sx === -999 || b.sx == null || !visibleNow(b.w) || !passes(b.w)) continue;
        if (b.sx < 0 || b.sx > W - panelW() || b.sy < 0 || b.sy > H) continue;
        if (tag(cut(b.w.title, Math.round(16 + cam.s * 4)), b.sx, b.sy, "rgba(222,226,230,0.3)", { size: 11, textColor: "rgba(222,226,230,0.7)" })) n++;
      }
    }
  }
  function cut(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function planetPos(o) { return orbitPoint(o, o.p0 + o.speed * t * 0.6); }
  function edgeMark(o, p) {
    var c = viewCenter(), dx = p[0] - c[0], dy = p[1] - c[1];
    var maxX = W - panelW() - 14, x, y;
    var k = Math.min(Math.abs((dx > 0 ? maxX - c[0] : c[0] - 14) / (dx || 1e-6)), Math.abs((dy > 0 ? H - 14 - c[1] : c[1] - 14) / (dy || 1e-6)));
    x = c[0] + dx * k; y = c[1] + dy * k;
    var ang = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = hexA(o.color, 0.85);
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    o.ex = x; o.ey = y; o.sx = null;
  }

  /* ================= ЦИКЛ ================= */
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) {
      t += dt;
      bodies.forEach(function (b) { b.th += b.sp * dt * 0.6; });
      if (histRun) {
        var prev = yearNow;
        yearNow = Math.min(MAX_Y, yearNow + SPEEDS[speedIdx] * dt);
        if (Math.floor(yearNow) !== Math.floor(prev)) {
          var y = Math.floor(yearNow);
          bodies.forEach(function (b) { if (b.w.year === y) b.born = now; });
        }
        if (yearNow >= MAX_Y) { histRun = false; }
        timeLabel(); updateCount();
      }
    }
    if (follow && !drag) {
      var fp = follow();
      if (fp) { cam.x += (fp[0] - cam.x) * 0.08; cam.y += (fp[1] - cam.y) * 0.08; }
    }
    if (camTarget) {
      var k = 0.12;
      cam.x += (camTarget.x - cam.x) * k; cam.y += (camTarget.y - cam.y) * k;
      cam.s *= Math.pow(camTarget.s / cam.s, k);
      if (Math.abs(Math.log(camTarget.s / cam.s)) < 0.003 && Math.hypot(camTarget.x - cam.x, camTarget.y - cam.y) * cam.s < 0.5) camTarget = null;
    }
    draw();
    requestAnimationFrame(frame);
  }

  function updateCount() {
    var n = WORKS.filter(function (w) { return visibleNow(w) && passes(w); }).length;
    $("#count").textContent = works(n) + " · 9 орбит";
  }

  /* ================= ВЫБОР ================= */
  function fitAll() { follow = null; camTarget = { x: 0, y: 0, s: fitScale() }; }
  function selectWork(w, fly) {
    var b = bodyOf[w.id]; if (!b) return;
    if (w.year && w.year > yearNow) { yearNow = MAX_Y; histRun = false; timeLabel(); updateCount(); }
    sel = { kind: "work", b: b };
    openPanel(renderWork(w), b.o.color);
    follow = function () { return [b.x, b.y]; };
    if (fly !== false) camTarget = { x: b.x, y: b.y, s: Math.max(cam.s, 3.2) };
    setHash(w.id);
  }
  function selectOrbit(o) {
    sel = { kind: "orbit", o: o };
    openPanel(renderOrbit(o), o.color);
    follow = null;
    var s = Math.min((W - panelW() - 60) / (2 * o.R * 1.1), (H - 140) / (2 * o.R * TILT * 1.1 + 40));
    camTarget = { x: 0, y: 0, s: clampS(s) };
    setHash("orbit-" + lnum(o.L.level));
  }
  function selectSun() {
    sel = { kind: "sun" };
    openPanel(renderSun(), "#ffb347");
    follow = null;
    setHash("kafedra");
  }
  function deselect() { sel = null; follow = null; closePanel(); }
  function setHash(h) { try { history.replaceState(null, "", "#" + h); } catch (e) {} }

  /* ================= ПАНЕЛЬ ================= */
  var panel = $("#panel");
  function openPanel(html, color) {
    panel.style.setProperty("--pc", color);
    $("#panelBody").innerHTML = html;
    panel.scrollTop = 0;
    panel.classList.add("is-open"); panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("panel-open");
  }
  function closePanel() {
    panel.classList.remove("is-open"); panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("panel-open");
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  $("#panelClose").addEventListener("click", deselect);

  function head(title, kind) {
    return '<div class="p-head' + (title.length > 60 ? " long" : "") + '"><h2>' + esc(title) + '</h2><span class="kind">' + esc(kind) + "</span></div>";
  }
  function orbitPill(o) {
    return '<a class="pill" data-orbit="' + o.L.level + '"><i style="background:' + o.color + '"></i>' + lnum(o.L.level) + " · " + esc(o.L.name) + "</a>";
  }
  function workRow(w) {
    return '<div class="li" data-work="' + esc(w.id) + '"><div class="ly">' + esc(w.year || "") + '</div><div><div class="lt">' + esc(w.title) +
      '</div><div class="la">' + esc(shortAuthors(w)) + " · " + esc(TYPES[w.type].name) + "</div></div></div>";
  }
  function histogram(list) {
    var counts = {}, max = 0;
    list.forEach(function (w) { if (w.year) { counts[w.year] = (counts[w.year] || 0) + 1; max = Math.max(max, counts[w.year]); } });
    var bars = "";
    for (var y = MIN_Y; y <= MAX_Y; y++) bars += '<span title="' + y + ": " + (counts[y] || 0) + '" style="height:' + ((counts[y] || 0) / (max || 1) * 100) + '%"></span>';
    return '<div class="bars">' + bars + '</div><div class="bars-x"><span>' + MIN_Y + "</span><span>" + MAX_Y + "</span></div>";
  }

  function renderWork(w) {
    var o = orbitOf[w.level];
    var authors = w.authors.map(function (id) {
      var p = people[id];
      return p.profile ? '<a class="pill" href="' + esc(p.profile) + '" target="_blank" rel="noopener">' + esc(p.name) + " ↗</a>" : '<span class="pill">' + esc(p.name) + "</span>";
    }).join("");
    var links = "";
    if (w.istina) links += '<a class="pill" href="' + esc(w.istina) + '" target="_blank" rel="noopener">' + (w.istinaKind === "record" ? "Запись в ИСТИНА МГУ" : "Профиль в ИСТИНА МГУ") + " ↗</a>";
    (w.links || []).forEach(function (l) {
      var lbl = l.kind === "doi" ? l.label : l.kind === "doi-crossref" ? l.label + " (Crossref)" : l.label;
      links += '<a class="pill" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(lbl) + " ↗</a>";
    });
    if (w.source !== "istina" && D.SOURCES[w.source]) {
      var s = D.SOURCES[w.source];
      links += '<a class="pill" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(cut(s.title, 50)) + " ↗</a>";
    }
    var near = o.works.filter(function (x) { return x !== w; })
      .sort(function (a, b) { return Math.abs((a.year || 0) - (w.year || 0)) - Math.abs((b.year || 0) - (w.year || 0)); }).slice(0, 8);
    return head(w.title, TYPES[w.type].name) +
      "<h3>Ключевые сведения</h3><dl class=\"facts\">" +
      "<dt>год</dt><dd>" + esc(w.year || "не указан") + "</dd>" +
      "<dt>авторы с кафедры</dt><dd>" + authors + "</dd>" +
      (w.coauthors ? "<dt>соавторы</dt><dd>" + esc(w.coauthors) + "</dd>" : "") +
      (w.venue ? "<dt>издание</dt><dd>" + esc(w.venue) + "</dd>" : "") +
      "<dt>орбита</dt><dd>" + orbitPill(o) + "</dd>" +
      "<dt>объект исследования</dt><dd>" + esc(o.L.hint) + "</dd>" +
      "<dt>источники</dt><dd>" + (links || "нет") + "</dd>" +
      "</dl>" +
      "<h3>Библиографическая запись</h3><div class=\"gost\">" + esc(w.gost) + '</div><button class="copy" type="button" data-copy="' + esc(w.id) + '">Скопировать</button>' +
      (w.verify ? '<h3>Требует сверки</h3><div class="warn">' + esc(w.verify) + "</div>" : "") +
      "<h3>Соседи по орбите</h3><div class=\"list\">" + near.map(workRow).join("") + "</div>";
  }

  function renderOrbit(o, all) {
    var list = o.works;
    var byAuthor = {};
    list.forEach(function (w) { w.authors.forEach(function (a) { byAuthor[a] = (byAuthor[a] || 0) + 1; }); });
    var byType = {};
    list.forEach(function (w) { var g = typeGroup(w.type); byType[g] = (byType[g] || 0) + 1; });
    var ys = list.map(function (w) { return w.year; }).filter(Boolean);
    var photos = (D.PHOTOS || []).filter(function (ph) { return ph.levels.indexOf(o.L.level) >= 0; });
    var shown = all ? list : list.slice(0, 30);
    return head(o.L.name, "орбита " + lnum(o.L.level)) +
      "<h3>Ключевые сведения</h3><dl class=\"facts\">" +
      "<dt>объект исследования</dt><dd>" + esc(o.L.hint) + "</dd>" +
      "<dt>работ на орбите</dt><dd>" + list.length + "</dd>" +
      (ys.length ? "<dt>годы</dt><dd>" + Math.min.apply(null, ys) + "–" + Math.max.apply(null, ys) + "</dd>" : "") +
      "<dt>авторы</dt><dd>" + Object.keys(byAuthor).sort(function (a, b) { return byAuthor[b] - byAuthor[a]; })
        .map(function (a) { return '<span class="pill">' + esc(people[a].short) + " · " + byAuthor[a] + "</span>"; }).join("") + "</dd>" +
      "<dt>виды работ</dt><dd>" + TYPE_GROUPS.filter(function (g) { return byType[g[0]]; })
        .map(function (g) { return '<span class="pill">' + esc(g[1]) + " · " + byType[g[0]] + "</span>"; }).join("") + "</dd>" +
      "<dt>соседние орбиты</dt><dd>" + orbits.filter(function (x) { return Math.abs(x.i - o.i) === 1; }).map(orbitPill).join("") + "</dd>" +
      "</dl>" +
      "<h3>Работы по годам</h3>" + histogram(list) +
      (photos.length ? "<h3>Галерея</h3><div class=\"gallery\">" + photos.map(function (ph) {
        return '<figure><img src="' + esc(ph.src) + '" alt="' + esc(ph.caption) + '" loading="lazy"><figcaption>' + esc(ph.caption) + "</figcaption></figure>";
      }).join("") + '</div><p class="plain" style="color:var(--dim);margin-top:8px">' + esc(D.photoCredit || "") + "</p>" : "") +
      "<h3>Работы</h3><div class=\"list\">" + shown.map(workRow).join("") + "</div>" +
      (shown.length < list.length ? '<button class="more" type="button" data-allorbit="' + o.L.level + '">Показать все ' + list.length + "</button>" : "");
  }

  function renderSun() {
    var staff = D.PEOPLE.map(function (p) {
      var n = WORKS.filter(function (w) { return w.authors.indexOf(p.id) >= 0; }).length;
      return "<dt>" + esc(p.name) + "</dt><dd>" + esc(p.role) + "<br>" + works(n) +
        (p.profile ? ' <a class="pill" href="' + esc(p.profile) + '" target="_blank" rel="noopener">ИСТИНА ↗</a>' : "") + "</dd>";
    }).join("");
    return head("Кафедра", "центр системы") +
      '<p class="plain" style="margin-top:16px">' + esc(D.department.name) + ". " + esc(D.department.faculty) + ", " + esc(D.department.university) + ".</p>" +
      "<h3>Сотрудники</h3><dl class=\"facts\">" + staff + "</dl>" +
      "<h3>Орбиты</h3><div>" + orbits.map(function (o) { return orbitPill(o).replace("</a>", " · " + o.works.length + "</a>"); }).join("") + "</div>" +
      "<h3>Все работы по годам</h3>" + histogram(WORKS) +
      '<p class="plain" style="margin-top:14px"><a class="pill" href="' + esc(D.department.url) + '" target="_blank" rel="noopener">Страница кафедры ↗</a></p>';
  }

  panel.addEventListener("click", function (e) {
    var a = e.target.closest("[data-orbit]");
    if (a) { e.preventDefault(); selectOrbit(orbitOf[a.dataset.orbit]); return; }
    var r = e.target.closest("[data-work]");
    if (r) { selectWork(byId[r.dataset.work]); return; }
    var m = e.target.closest("[data-allorbit]");
    if (m) { var o = orbitOf[m.dataset.allorbit]; $("#panelBody").innerHTML = renderOrbit(o, true); return; }
    var c = e.target.closest("[data-copy]");
    if (c) {
      var w = byId[c.dataset.copy];
      try { navigator.clipboard.writeText(w.gost).then(function () { c.textContent = "Скопировано"; }, function () { c.textContent = "Выделите текст вручную"; }); }
      catch (err) { c.textContent = "Выделите текст вручную"; }
    }
  });

  /* ================= МОДАЛЬНЫЕ ОКНА ================= */
  var modal = $("#modal"), modalKind = null;
  function openModal(kind, html) {
    modalKind = kind;
    $("#modalBody").innerHTML = html;
    modal.hidden = false;
    ["btnFilter", "btnInfo", "btnSearch"].forEach(function (id) { $("#" + id).classList.toggle("is-on", id === { filter: "btnFilter", info: "btnInfo", search: "btnSearch" }[kind]); });
  }
  function closeModal() {
    modal.hidden = true; modalKind = null;
    ["btnFilter", "btnInfo", "btnSearch"].forEach(function (id) { $("#" + id).classList.remove("is-on"); });
    canvas.focus();
  }
  $("#modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

  // поиск
  function openSearch() {
    openModal("search", head("Поиск", "по заглавию, изданию, году, автору") +
      '<input type="search" id="q" placeholder="Например: персональные данные, 2019, Стрельцов" autocomplete="off"><div id="res"></div>');
    var q = $("#q"); q.focus();
    q.addEventListener("input", function () { runSearch(q.value); });
    runSearch("");
  }
  function runSearch(v) {
    var s = norm(v.trim()), html = "";
    var os = orbits.filter(function (o) { return !s || norm(o.L.name + " " + o.L.hint).indexOf(s) >= 0; });
    if (os.length) html += '<div class="res-h">Орбиты</div><div>' + os.map(orbitPill).join("") + "</div>";
    if (s) {
      var ws = WORKS.filter(function (w) { return w._q.indexOf(s) >= 0; });
      html += '<div class="res-h">Работы: ' + ws.length + "</div><div class=\"list\">" + ws.slice(0, 80).map(workRow).join("") + "</div>";
      if (ws.length > 80) html += '<p class="plain" style="color:var(--dim)">Показаны первые 80. Уточните запрос.</p>';
    }
    $("#res").innerHTML = html;
  }
  modal.addEventListener("click", function (e) {
    var a = e.target.closest("[data-orbit]");
    if (a) { e.preventDefault(); closeModal(); selectOrbit(orbitOf[a.dataset.orbit]); return; }
    var r = e.target.closest("[data-work]");
    if (r) { closeModal(); selectWork(byId[r.dataset.work]); }
  });

  // фильтры
  function openFilter() {
    var ppl = D.PEOPLE.map(function (p) {
      var n = WORKS.filter(function (w) { return w.authors.indexOf(p.id) >= 0; }).length;
      return '<label class="chk"><input type="checkbox" data-p="' + p.id + '"' + (offPeople[p.id] ? "" : " checked") + "> " + esc(p.name) + "<small>" + n + "</small></label>";
    }).join("");
    var tps = TYPE_GROUPS.map(function (g) {
      var n = WORKS.filter(function (w) { return typeGroup(w.type) === g[0]; }).length;
      return '<label class="chk"><input type="checkbox" data-t="' + g[0] + '"' + (offTypes[g[0]] ? "" : " checked") + "> " + esc(g[1]) + "<small>" + n + "</small></label>";
    }).join("");
    openModal("filter", head("Фильтры", "что показывать на орбитах") +
      '<div class="res-h">Авторы</div>' + ppl + '<div class="res-h">Виды работ</div>' + tps);
    $("#modalBody").addEventListener("change", function (e) {
      var i = e.target;
      if (i.dataset.p) { if (i.checked) delete offPeople[i.dataset.p]; else offPeople[i.dataset.p] = true; }
      if (i.dataset.t) { if (i.checked) delete offTypes[i.dataset.t]; else offTypes[i.dataset.t] = true; }
      updateCount();
    });
  }

  // о проекте
  function openInfo() {
    var srcs = Object.keys(D.SOURCES).map(function (k) {
      var s = D.SOURCES[k];
      return "<li>" + esc(s.title) + ". — Текст : электронный. — URL: <a href=\"" + esc(s.url) + "\" target=\"_blank\" rel=\"noopener\">" + esc(s.url) +
        "</a> (дата обращения: " + esc(D.checkedAt) + ")." + (s.primary ? "" : " Вторичный источник.") + "</li>";
    }).join("");
    var withDoi = WORKS.filter(function (w) { return (w.links || []).some(function (l) { return l.kind.indexOf("doi") === 0; }); }).length;
    openModal("info", head("Атлас исследований", "о проекте") +
      '<p class="plain" style="margin-top:16px">Атлас научных работ сотрудников кафедры компьютерного права и информационной безопасности Высшей школы государственного аудита МГУ имени М.В. Ломоносова. В центре системы кафедра. Девять орбит соответствуют масштабу объекта исследования: чем крупнее объект, тем дальше орбита, от единицы данных до космоса. Каждое тело на орбите означает одну работу; крупные тела с кольцом означают диссертации.</p>' +
      '<p class="plain">Карту можно перетаскивать и приближать колесом мыши или двумя пальцами. Нажатие на тело или на название орбиты открывает карточку. Кнопки внизу слева проигрывают историю: работы появляются на орбитах в год публикации.</p>' +
      "<h3>Орбиты</h3><div>" + orbits.map(function (o) { return orbitPill(o); }).join("") + "</div>" +
      '<p class="plain" style="color:var(--dim)">Орбита присвоена работе автоматически по ключевым словам заглавия; работы без признаков другого уровня отнесены к орбите «Государство». Это навигационная классификация, а не оценка работы.</p>' +
      "<h3>Источники</h3>" +
      '<p class="plain">Списки работ выгружены из системы ИСТИНА МГУ по профилям сотрудников ' + esc(D.checkedAt) + '. Библиографические записи построены по ГОСТ Р 7.0.100-2018 из экспорта BibTeX каждой записи ИСТИНА. Ссылки DOI даны там, где они указаны в ИСТИНА или найдены по совпадению заглавия, года и издания в Crossref: ' + withDoi + " из " + WORKS.length + ".</p>" +
      '<ol class="src"><li>Кафедра компьютерного права и информационной безопасности. — Текст : электронный // Высшая школа государственного аудита МГУ имени М.В. Ломоносова : официальный сайт. — URL: <a href="' + esc(D.department.url) + '" target="_blank" rel="noopener">' + esc(D.department.url) + "</a> (дата обращения: " + esc(D.checkedAt) + ").</li>" + srcs + "</ol>" +
      '<p class="plain" style="color:var(--dim)">' + esc(D.photoCredit || "") + "</p>");
  }
  $("#btnSearch").addEventListener("click", function () { modalKind === "search" ? closeModal() : openSearch(); });
  $("#btnFilter").addEventListener("click", function () { modalKind === "filter" ? closeModal() : openFilter(); });
  $("#btnInfo").addEventListener("click", function () { modalKind === "info" ? closeModal() : openInfo(); });
  $("#btnFit").addEventListener("click", fitAll);

  // время
  $("#btnPlay").addEventListener("click", function () { setPlaying(!playing); });
  $("#btnRew").addEventListener("click", function () {
    yearNow = MIN_Y; histRun = true; setPlaying(true); timeLabel(); updateCount();
  });
  $("#btnFwd").addEventListener("click", function () {
    if (!histRun) { yearNow = Math.max(MIN_Y, yearNow < MAX_Y ? yearNow : MIN_Y); histRun = true; }
    speedIdx = (speedIdx + 1) % SPEEDS.length; setPlaying(true); timeLabel();
  });

  /* ================= УКАЗАТЕЛЬ ================= */
  var tip = $("#tip");
  function pick(sx, sy) {
    // сначала метки орбит и солнце
    var sp = P(0, 0);
    if (Math.hypot(sp[0] - sx, sp[1] - sy) < 16) return { kind: "sun" };
    for (var i = 0; i < labelHits().length; i++) { var h = labelHits()[i]; if (sx >= h[0] && sx <= h[0] + h[2] && sy >= h[1] && sy <= h[1] + h[3]) return h[4]; }
    var best = null, bd = 11;
    bodies.forEach(function (b) {
      if (b.sx == null || b.sx === -999 || !visibleNow(b.w) || !passes(b.w)) return;
      var d = Math.hypot(b.sx - sx, b.sy - sy);
      if (d < bd) { bd = d; best = b; }
    });
    if (best) return { kind: "work", b: best };
    var eb = null, ed = 14;
    orbits.forEach(function (o) {
      if (o.sx != null) { var d = Math.hypot(o.sx - sx, o.sy - sy); if (d < ed) { ed = d; eb = o; } }
      else if (o.ex != null) { var d2 = Math.hypot(o.ex - sx, o.ey - sy); if (d2 < ed) { ed = d2; eb = o; } }
    });
    return eb ? { kind: "orbit", o: eb } : null;
  }
  function labelHits() {
    // прямоугольники меток орбит (приблизительно)
    var res = [];
    ctx.font = "500 12px Jura, 'Segoe UI', Arial, sans-serif";
    orbits.forEach(function (o) {
      if (o.sx == null) return;
      var w = ctx.measureText(o.L.name).width + 26;
      res.push([o.sx, o.sy - 24, w, 26, { kind: "orbit", o: o }]);
    });
    return res;
  }

  var ptrs = {}, drag = null, pinch = null, moved = false;
  canvas.addEventListener("pointerdown", function (e) {
    canvas.setPointerCapture(e.pointerId);
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    moved = false; camTarget = null;
    var ids = Object.keys(ptrs);
    if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
    if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s }; }
  });
  canvas.addEventListener("pointermove", function (e) {
    if (ptrs[e.pointerId]) {
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(ptrs);
      if (ids.length === 2 && pinch) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]];
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, clampS(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d) / cam.s);
        moved = true;
      } else if (ids.length === 1 && drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; follow = null; }
        if (moved) { cam.x = drag.cx - dx / cam.s; cam.y = drag.cy - dy / cam.s; }
      }
      tip.hidden = true;
      return;
    }
    var h = pick(e.clientX, e.clientY);
    hover = h;
    canvas.style.cursor = h ? "pointer" : "grab";
    if (h && h.kind === "work") {
      var w = h.b.w;
      tip.innerHTML = "<b>" + esc(TYPES[w.type].name) + (w.year ? " · " + w.year : "") + "</b>" + esc(w.title) + "<span>" + esc(shortAuthors(w)) + " · " + esc(h.b.o.L.name) + "</span>";
      tip.hidden = false;
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(W - tw - 8, e.clientX + 14) + "px";
      tip.style.top = Math.max(8, Math.min(H - th - 8, e.clientY + 14)) + "px";
    } else if (h && h.kind === "orbit") {
      tip.innerHTML = "<b>Орбита " + lnum(h.o.L.level) + "</b>" + esc(h.o.L.name) + "<span>" + works(h.o.works.length) + " · " + esc(h.o.L.hint) + "</span>";
      tip.hidden = false;
      tip.style.left = Math.min(W - tip.offsetWidth - 8, e.clientX + 14) + "px"; tip.style.top = (e.clientY + 14) + "px";
    } else tip.hidden = true;
  });
  function endPtr(e) {
    var was = moved;
    delete ptrs[e.pointerId];
    if (Object.keys(ptrs).length < 2) pinch = null;
    if (!Object.keys(ptrs).length) {
      drag = null;
      if (!was && e.type === "pointerup") {
        var h = pick(e.clientX, e.clientY);
        if (!h) { if (sel) deselect(); }
        else if (h.kind === "work") selectWork(h.b.w);
        else if (h.kind === "orbit") selectOrbit(h.o);
        else if (h.kind === "sun") selectSun();
      }
    } else { var ids = Object.keys(ptrs), p = ptrs[ids[0]]; drag = { x: p.x, y: p.y, cx: cam.x, cy: cam.y }; }
  }
  canvas.addEventListener("pointerup", endPtr);
  canvas.addEventListener("pointercancel", endPtr);
  canvas.addEventListener("pointerleave", function () { hover = null; tip.hidden = true; });

  function zoomAt(sx, sy, f) {
    var before = Pinv(sx, sy);
    cam.s = clampS(cam.s * f); camTarget = null;
    var after = Pinv(sx, sy);
    if (!follow) { cam.x += before[0] - after[0]; cam.y += before[1] - after[1]; }
  }
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var d = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    zoomAt(e.clientX, e.clientY, Math.exp(-d * 0.0015));
  }, { passive: false });

  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT") { if (e.key === "Escape") closeModal(); return; }
    var step = 60 / cam.s;
    if (e.key === "Escape") { if (!modal.hidden) closeModal(); else deselect(); }
    else if (e.key === "/" ) { e.preventDefault(); openSearch(); }
    else if (e.key === "+" || e.key === "=") zoomAt(viewCenter()[0], viewCenter()[1], 1.4);
    else if (e.key === "-") zoomAt(viewCenter()[0], viewCenter()[1], 1 / 1.4);
    else if (e.key === "0") fitAll();
    else if (e.key === " ") { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === "ArrowLeft") { follow = null; cam.x -= step; }
    else if (e.key === "ArrowRight") { follow = null; cam.x += step; }
    else if (e.key === "ArrowUp") { follow = null; cam.y -= step; }
    else if (e.key === "ArrowDown") { follow = null; cam.y += step; }
  });

  /* ================= СТАРТ ================= */
  window.addEventListener("resize", function () { resize(); });
  resize();
  cam.s = fitScale();
  timeLabel(); updateCount(); setPlaying(true);
  var hsh = decodeURIComponent(location.hash.slice(1));
  if (hsh) {
    if (byId[hsh]) { var b0 = bodyOf[hsh]; var q0 = orbitPoint(b0.o, b0.th, b0.k); cam.x = q0[0]; cam.y = q0[1]; cam.s = 3.2; selectWork(byId[hsh], false); }
    else if (/^orbit-\d$/.test(hsh)) { var o0 = orbits[+hsh.slice(6) - 1]; if (o0) selectOrbit(o0); }
    else if (hsh === "kafedra") selectSun();
  }
  window.addEventListener("hashchange", function () {
    var h = decodeURIComponent(location.hash.slice(1));
    if (byId[h]) selectWork(byId[h]);
    else if (/^orbit-\d$/.test(h) && orbits[+h.slice(6) - 1]) selectOrbit(orbits[+h.slice(6) - 1]);
    else if (h === "kafedra") selectSun();
  });
  requestAnimationFrame(function (n) { last = n; frame(n); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {});
})();
