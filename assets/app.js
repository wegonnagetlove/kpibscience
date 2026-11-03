(function () {
  "use strict";

  var D = window.KPIB;
  var LEVELS = D.LEVELS;
  var MIN_L = LEVELS[0].level;
  var TYPES = {
    article:     { name: "Статья в журнале",    color: "#ffffff", r: 2.6 },
    chapter:     { name: "Статья в сборнике",   color: "#cfd8e6", r: 2.1, ring: true },
    book:        { name: "Монография, книга",   color: "#e3b873", r: 3.6 },
    thesis:      { name: "Диссертация",         color: "#d4343a", r: 4.4 },
    supervision: { name: "Научное руководство", color: "#d4343a", r: 3.2 },
    talk:        { name: "Тезисы, доклад",      color: "#9cc8ee", r: 2.3 },
    event:       { name: "Научное мероприятие", color: "#9cc8ee", r: 2.6 }
  };

  var WORKS = D.WORKS.concat((window.KPIB_ISTINA || []).map(function (w) { w.source = "istina"; return w; }));
  var byId = {};
  WORKS.forEach(function (w) { byId[w.id] = w; });
  var people = {};
  D.PEOPLE.forEach(function (p) { people[p.id] = p; });
  var activePeople = {}, query = "";

  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е"); }
  function levelInfo(l) { return LEVELS.filter(function (x) { return x.level === l; })[0]; }
  function shortAuthors(w) { return w.authors.map(function (id) { return people[id].short; }).join(", "); }
  function authorsLine(w) { return w.coauthors ? shortAuthors(w) + "; " + w.coauthors : shortAuthors(w); }
  WORKS.forEach(function (w) { w._q = norm(w.title + " " + (w.venue || "") + " " + (w.year || "") + " " + shortAuthors(w)); });
  function isActive(w) {
    var keys = Object.keys(activePeople);
    if (keys.length && !w.authors.some(function (id) { return activePeople[id]; })) return false;
    if (query && w._q.indexOf(query) < 0) return false;
    return true;
  }
  function filtering() { return !!query || Object.keys(activePeople).length > 0; }

  // детерминированный генератор случайных чисел
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

  /* ================= ВСЕЛЕННАЯ ================= */
  // Каждый уровень шкалы: созвездие. Созвездия лежат на спиральном рукаве
  // от центра (кафедра) наружу; чем крупнее уровень, тем больше и дальше созвездие.
  var SPACING = 15;                     // расстояние между звёздами в мировых единицах
  var systems = [];
  (function buildSystems() {
    var dist = 0, angle = -2.3, prevR = 70;
    LEVELS.forEach(function (L, i) {
      var works = WORKS.filter(function (w) { return w.level === L.level; })
        .sort(function (a, b) { return (a.year || 0) - (b.year || 0); });
      var core = Math.max(58, Math.sqrt(works.length) * SPACING * 0.62);
      var R = core * (1 + i * 0.07) + 40;
      dist += prevR + R + 26;
      angle += 0.95 - i * 0.025;
      var sys = { L: L, works: works, R: R, core: core, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, stars: [] };
      var rnd = rng(1000 + i * 77);
      works.forEach(function (w, k) {
        var rr = core * Math.sqrt((k + 0.5) / Math.max(works.length, 1));
        var th = k * 2.39996 + rnd() * 0.5;
        var jitter = SPACING * 0.22;
        sys.stars.push({
          w: w,
          x: sys.x + rr * Math.cos(th) + (rnd() - 0.5) * jitter,
          y: sys.y + rr * Math.sin(th) + (rnd() - 0.5) * jitter,
          tw: rnd() * Math.PI * 2
        });
      });
      systems.push(sys);
      prevR = R;
    });
  })();
  var allStars = [];
  systems.forEach(function (s) { allStars = allStars.concat(s.stars); });
  var starOf = {};
  allStars.forEach(function (s) { starOf[s.w.id] = s; });

  // фоновые звёзды (три слоя для параллакса)
  var bgStars = [];
  (function () {
    var r = rng(42);
    for (var i = 0; i < 900; i++) {
      bgStars.push({ x: r(), y: r(), m: r() < 0.08 ? 1.6 : (r() < 0.4 ? 1 : 0.6), a: 0.25 + r() * 0.6, layer: i % 3 });
    }
  })();

  var canvas = $("#sky"), ctx = canvas.getContext("2d");
  var mapwrap = $("#map"), tip = $("#tip");
  var W = 0, H = 0, DPR = 1;
  var cam = { x: 0, y: 0, s: 1 }, target = null;
  var hover = null, selected = null;

  function bounds() {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    systems.forEach(function (s) {
      minX = Math.min(minX, s.x - s.R); maxX = Math.max(maxX, s.x + s.R);
      minY = Math.min(minY, s.y - s.R); maxY = Math.max(maxY, s.y + s.R);
    });
    minX = Math.min(minX, -90); minY = Math.min(minY, -90); maxX = Math.max(maxX, 90); maxY = Math.max(maxY, 90);
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
  }
  function margins() {
    return W < 700 ? { t: 110, b: 170, l: 60, r: 60 } : { t: 86, b: 96, l: 330, r: 150 };
  }
  function fitView(b, pad) {
    pad = pad || 1.08;
    var m = margins(), aw = Math.max(100, W - m.l - m.r), ah = Math.max(100, H - m.t - m.b);
    var sc = Math.min(aw / (b.w * pad), ah / (b.h * pad));
    var cx = m.l + aw / 2, cy = m.t + ah / 2;
    return { x: b.x - (cx - W / 2) / sc, y: b.y - (cy - H / 2) / sc, s: sc };
  }
  function overview() { return fitView(bounds(), 1.1); }
  function systemView(s) { return fitView({ x: s.x, y: s.y, w: s.R * 2, h: s.R * 2 }, 1.25); }

  function resize() {
    var r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    draw();
  }
  function toScreen(x, y) { return [(x - cam.x) * cam.s + W / 2, (y - cam.y) * cam.s + H / 2]; }
  function toWorld(sx, sy) { return [(sx - W / 2) / cam.s + cam.x, (sy - H / 2) / cam.s + cam.y]; }

  var MIN_S = 0.05, MAX_S = 9;
  function clampS(s) { return Math.max(MIN_S, Math.min(MAX_S, s)); }

  /* ---------- отрисовка ---------- */
  var t0 = performance.now();
  function draw() {
    if (!W) return;
    var now = (performance.now() - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#03050a"; ctx.fillRect(0, 0, W, H);

    // далёкие звёзды с параллаксом
    bgStars.forEach(function (b) {
      var par = [0.02, 0.05, 0.1][b.layer];
      var x = ((b.x * 2600 - cam.x * par) % 2600 + 2600) % 2600 / 2600 * W;
      var y = ((b.y * 2600 - cam.y * par) % 2600 + 2600) % 2600 / 2600 * H;
      ctx.globalAlpha = b.a * 0.75;
      ctx.fillStyle = "#cfd9ea";
      ctx.fillRect(x, y, b.m, b.m);
    });
    ctx.globalAlpha = 1;

    // туманности созвездий
    systems.forEach(function (s, i) {
      var p = toScreen(s.x, s.y), r = s.R * cam.s;
      if (p[0] + r * 1.6 < 0 || p[0] - r * 1.6 > W || p[1] + r * 1.6 < 0 || p[1] - r * 1.6 > H) return;
      var hue = [212, 220, 228, 205, 38, 0, 196, 250, 30][i % 9];
      var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 1.5);
      g.addColorStop(0, "hsla(" + hue + ",60%,55%,0.16)");
      g.addColorStop(0.55, "hsla(" + hue + ",60%,45%,0.06)");
      g.addColorStop(1, "hsla(" + hue + ",60%,40%,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p[0], p[1], r * 1.5, 0, Math.PI * 2); ctx.fill();
    });

    // спиральный рукав: путь от данных к космосу
    ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    ctx.beginPath();
    var c0 = toScreen(0, 0); ctx.moveTo(c0[0], c0[1]);
    systems.forEach(function (s) { var p = toScreen(s.x, s.y); ctx.lineTo(p[0], p[1]); });
    ctx.stroke(); ctx.setLineDash([]);

    // орбиты созвездий
    systems.forEach(function (s) {
      var p = toScreen(s.x, s.y);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath(); ctx.arc(p[0], p[1], s.R * cam.s, 0, Math.PI * 2); ctx.stroke();
    });

    // центр: кафедра
    var c = toScreen(0, 0), cr = Math.max(5, 16 * cam.s);
    var cg = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], cr * 4);
    cg.addColorStop(0, "rgba(212,52,58,0.55)"); cg.addColorStop(1, "rgba(212,52,58,0)");
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(c[0], c[1], cr * 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d4343a"; ctx.beginPath(); ctx.arc(c[0], c[1], cr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, cr * 0.18);
    ctx.beginPath(); ctx.arc(c[0], c[1], cr * 0.35, 0, Math.PI * 2); ctx.stroke();
    label("КАФЕДРА", c[0], c[1] + cr + 16, 13, "#fff", "center", "display");

    // звёзды-работы
    var filt = filtering();
    var showTitles = cam.s >= 1.6;
    var rects = [];
    function free(x, y, w, h) {
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return false;
      }
      rects.push([x, y, w, h]); return true;
    }
    allStars.forEach(function (st) {
      var p = toScreen(st.x, st.y);
      if (p[0] < -40 || p[0] > W + 300 || p[1] < -40 || p[1] > H + 40) return;
      var T = TYPES[st.w.type], act = isActive(st.w);
      var r = Math.max(1.3, T.r * Math.min(Math.max(cam.s, 0.5), 3.2) * 0.9);
      var twinkle = 0.85 + 0.15 * Math.sin(now * 1.6 + st.tw);
      var alpha = (filt && !act) ? 0.12 : twinkle;
      ctx.globalAlpha = alpha;
      if (!(filt && !act) && r > 1.6) {
        var gg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 3.2);
        gg.addColorStop(0, hexA(T.color, filt && act ? 0.55 : 0.32)); gg.addColorStop(1, hexA(T.color, 0));
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p[0], p[1], r * 3.2, 0, Math.PI * 2); ctx.fill();
      }
      if (T.ring) {
        ctx.strokeStyle = T.color; ctx.lineWidth = Math.max(1, r * 0.35);
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = T.color; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
      }
      if (st === hover || st === selected) {
        ctx.globalAlpha = 1; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p[0], p[1], r + 6, 0, Math.PI * 2); ctx.stroke();
      }
      if (showTitles && !(filt && !act) && p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < H) {
        var txt = (st.w.year ? st.w.year + "  " : "") + st.w.title;
        var maxc = Math.round(26 + cam.s * 8);
        if (txt.length > maxc) txt = txt.slice(0, maxc - 1) + "…";
        ctx.font = "12px 'PT Serif', Georgia, serif";
        var tw = ctx.measureText(txt).width;
        if (free(p[0] + r + 6, p[1] - 9, tw + 6, 15)) {
          ctx.globalAlpha = Math.min(1, (cam.s - 1.6) / 0.8) * 0.92;
          label(txt, p[0] + r + 7, p[1] + 4, 12, "#e9eef6", "left", "serif");
        }
      }
      ctx.globalAlpha = 1;
    });

    // подписи созвездий (крупные первыми, без наложений)
    var cc = toScreen(0, 0), ccr = Math.max(5, 16 * cam.s);
    var lrects = [[cc[0] - 40, cc[1] + ccr + 2, 80, 18]];
    systems.slice().sort(function (a, b) { return b.R - a.R; }).forEach(function (s) {
      var p = toScreen(s.x, s.y), r = s.R * cam.s;
      if (p[0] + r < -100 || p[0] - r > W + 100 || p[1] + r < -100 || p[1] - r > H + 100) return;
      var fs = Math.max(12, Math.min(34, r * 0.16));
      var y = p[1] - r - fs * 0.6;
      var n = s.L.level - MIN_L + 1;
      var txt = n + "  " + s.L.name.toUpperCase();
      ctx.font = "500 " + fs + "px Oswald, 'Arial Narrow', Arial, sans-serif";
      var tw = ctx.measureText(txt).width, box = [p[0] - tw / 2 - 4, y - fs, tw + 8, fs * 1.3];
      if (lrects.some(function (q) { return box[0] < q[0] + q[2] && box[0] + box[2] > q[0] && box[1] < q[1] + q[3] && box[1] + box[3] > q[1]; })) {
        y = p[1] + r + fs * 1.2; box[1] = y - fs;
      }
      lrects.push(box);
      label(txt, p[0], y, fs, "#fff", "center", "display");
      if (fs > 14) label(s.works.length + " " + plural(s.works.length) + " · " + s.L.hint, p[0], y + fs * 0.95, Math.max(11, fs * 0.5), "rgba(255,255,255,0.72)", "center", "italic");
    });
  }
  function plural(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "работа";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "работы";
    return "работ";
  }
  function label(text, x, y, size, color, align, kind) {
    ctx.font = kind === "display" ? "500 " + size + "px Oswald, 'Arial Narrow', Arial, sans-serif" :
      kind === "italic" ? "italic " + size + "px 'Cormorant Garamond', Georgia, serif" : size + "px 'PT Serif', Georgia, serif";
    ctx.textAlign = align; ctx.fillStyle = color;
    ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 6;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* ---------- анимация камеры ---------- */
  var animating = false;
  function flyTo(v) { target = v; if (!animating) { animating = true; requestAnimationFrame(step); } }
  function step() {
    if (target) {
      var k = 0.12;
      cam.x += (target.x - cam.x) * k; cam.y += (target.y - cam.y) * k;
      cam.s *= Math.pow(target.s / cam.s, k);
      if (Math.abs(target.x - cam.x) * cam.s < 0.5 && Math.abs(target.y - cam.y) * cam.s < 0.5 && Math.abs(Math.log(target.s / cam.s)) < 0.004) {
        cam.x = target.x; cam.y = target.y; cam.s = target.s; target = null;
      }
    }
    draw(); updateHud();
    requestAnimationFrame(step); // звёзды мерцают постоянно
  }

  /* ---------- HUD ---------- */
  function nearestSystem() {
    var best = null, bd = Infinity;
    systems.forEach(function (s) {
      var d = Math.hypot(s.x - cam.x, s.y - cam.y) - s.R;
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }
  var lastHud = "";
  function updateHud() {
    var ov = overview();
    var key, s = null;
    if (cam.s < ov.s * 1.6) key = "all"; else { s = nearestSystem(); key = s ? s.L.level : "all"; }
    if (key === lastHud) return;
    lastHud = key;
    Array.prototype.forEach.call(document.querySelectorAll(".const button"), function (b) { b.classList.toggle("is-on", String(b.dataset.l) === String(key)); });
    if (key === "all") {
      $("#hudName").textContent = "Вся вселенная кафедры";
      $("#hudHint").textContent = WORKS.length + " работ в девяти созвездиях";
    } else {
      $("#hudName").textContent = s.L.name;
      $("#hudHint").textContent = s.works.length + " " + plural(s.works.length) + " · " + s.L.hint;
    }
    setPhoto(key === "all" ? null : s.L.level);
  }

  /* ---------- управление ---------- */
  var mapActive = false;
  function setActive(v) { mapActive = v; mapwrap.classList.toggle("is-active", v); }
  mapwrap.addEventListener("mouseleave", function () { setActive(false); hover = null; tip.hidden = true; });

  function zoomAt(sx, sy, factor) {
    var before = toWorld(sx, sy);
    var ns = clampS((target ? target.s : cam.s) * factor);
    target = null;
    cam.s = ns;
    var after = toWorld(sx, sy);
    cam.x += before[0] - after[0]; cam.y += before[1] - after[1];
  }
  canvas.addEventListener("wheel", function (e) {
    if (!mapActive) { showHint(); return; }
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    var d = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-d * 0.0016));
  }, { passive: false });

  var ptrs = {}, dragStart = null, pinch = null, moved = false;
  canvas.addEventListener("pointerdown", function (e) {
    setActive(true); hideHint();
    canvas.setPointerCapture(e.pointerId);
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    target = null; moved = false;
    var ids = Object.keys(ptrs);
    if (ids.length === 1) dragStart = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
    if (ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s };
    }
  });
  canvas.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    if (ptrs[e.pointerId]) {
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(ptrs);
      if (ids.length === 2 && pinch) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]];
        var mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        var want = clampS(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
        zoomAt(mx, my, want / cam.s); moved = true;
      } else if (ids.length === 1 && dragStart) {
        var dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        cam.x = dragStart.cx - dx / cam.s; cam.y = dragStart.cy - dy / cam.s;
      }
      tip.hidden = true;
      return;
    }
    // наведение
    var h = pick(e.clientX - r.left, e.clientY - r.top);
    if (h !== hover) { hover = h; canvas.style.cursor = h ? "pointer" : "grab"; }
    if (h) showTip(h, e.clientX - r.left, e.clientY - r.top); else tip.hidden = true;
  });
  function endPtr(e) {
    var r = canvas.getBoundingClientRect();
    var wasDrag = moved;
    delete ptrs[e.pointerId];
    if (Object.keys(ptrs).length < 2) pinch = null;
    if (!Object.keys(ptrs).length) {
      dragStart = null;
      if (!wasDrag && e.type === "pointerup") {
        var h = pick(e.clientX - r.left, e.clientY - r.top);
        if (h) { selected = h; openPanel(h.w); }
        else {
          var w = toWorld(e.clientX - r.left, e.clientY - r.top);
          var sys = systems.filter(function (s) { return Math.hypot(s.x - w[0], s.y - w[1]) < s.R; })[0];
          if (sys && cam.s < systemView(sys).s * 0.7) flyTo(systemView(sys));
        }
      }
    } else {
      var ids = Object.keys(ptrs); var p = ptrs[ids[0]];
      dragStart = { x: p.x, y: p.y, cx: cam.x, cy: cam.y };
    }
  }
  canvas.addEventListener("pointerup", endPtr);
  canvas.addEventListener("pointercancel", endPtr);

  function pick(sx, sy) {
    var best = null, bd = 14;
    allStars.forEach(function (st) {
      if (filtering() && !isActive(st.w)) return;
      var p = toScreen(st.x, st.y);
      var d = Math.hypot(p[0] - sx, p[1] - sy);
      if (d < bd) { bd = d; best = st; }
    });
    return best;
  }
  function showTip(st, x, y) {
    var w = st.w;
    tip.innerHTML = '<span class="t-type">' + esc(TYPES[w.type].name) + (w.year ? " · " + w.year : "") + "</span>" +
      '<span class="t-title">' + esc(w.title) + "</span>" + '<span class="t-au">' + esc(shortAuthors(w)) + "</span>";
    tip.hidden = false;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.min(W - tw - 10, x + 16) + "px";
    tip.style.top = Math.max(10, Math.min(H - th - 10, y - th / 2)) + "px";
  }

  $("#zIn").addEventListener("click", function () { flyTo({ x: cam.x, y: cam.y, s: clampS(cam.s * 1.8) }); });
  $("#zOut").addEventListener("click", function () { flyTo({ x: cam.x, y: cam.y, s: clampS(cam.s / 1.8) }); });
  $("#zAll").addEventListener("click", function () { flyTo(overview()); });
  canvas.addEventListener("keydown", function (e) {
    var k = e.key, step = 80 / cam.s;
    if (k === "+" || k === "=") flyTo({ x: cam.x, y: cam.y, s: clampS(cam.s * 1.6) });
    else if (k === "-") flyTo({ x: cam.x, y: cam.y, s: clampS(cam.s / 1.6) });
    else if (k === "ArrowLeft") cam.x -= step; else if (k === "ArrowRight") cam.x += step;
    else if (k === "ArrowUp") cam.y -= step; else if (k === "ArrowDown") cam.y += step;
    else if (k === "0") flyTo(overview());
    else return;
    e.preventDefault();
  });

  // список созвездий
  var constEl = $("#const");
  constEl.innerHTML = '<button type="button" data-l="all"><span class="n">∗</span>Вся вселенная</button>' +
    systems.map(function (s) {
      return '<button type="button" data-l="' + s.L.level + '"><span class="n">' + (s.L.level - MIN_L + 1) + "</span>" + esc(s.L.name) + " <i>" + s.works.length + "</i></button>";
    }).join("");
  constEl.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    hideHint();
    if (b.dataset.l === "all") flyTo(overview());
    else flyTo(systemView(systems.filter(function (s) { return String(s.L.level) === b.dataset.l; })[0]));
  });

  /* ---------- подсказка ---------- */
  var hintTimer = null;
  function showHint() {
    $("#hint").classList.remove("is-gone");
    clearTimeout(hintTimer); hintTimer = setTimeout(hideHint, 2200);
  }
  function hideHint() { $("#hint").classList.add("is-gone"); }
  setTimeout(hideHint, 6500);

  /* ---------- фото Земли ---------- */
  function setPhoto(level) {
    var el = $("#photoCredit"); if (!el) return;
    el.textContent = level === null ? "Перетаскивайте карту, приближайте колесом или жестом, нажмите на созвездие, чтобы подлететь к нему." :
      "Созвездие «" + levelInfo(level).name + "». Нажмите на звезду, чтобы открыть карточку работы.";
  }
  (function gallery() {
    var g = $("#gallery"); if (!g || !D.PHOTOS) return;
    g.innerHTML = D.PHOTOS.map(function (ph) {
      return '<figure><img src="' + esc(ph.src) + '" alt="' + esc(ph.caption) + '" loading="lazy"><figcaption>' + esc(ph.caption) + "</figcaption></figure>";
    }).join("");
    $("#galleryCredit").textContent = D.photoCredit || "";
  })();

  /* ---------- фильтры и поиск ---------- */
  D.PEOPLE.forEach(function (p) {
    var n = WORKS.filter(function (w) { return w.authors.indexOf(p.id) >= 0; }).length;
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip";
    b.textContent = p.short + " · " + n;
    b.title = p.name + ", " + p.role;
    b.addEventListener("click", function () {
      if (activePeople[p.id]) delete activePeople[p.id]; else activePeople[p.id] = true;
      b.classList.toggle("is-on", !!activePeople[p.id]);
      renderList();
    });
    $("#people").appendChild(b);
  });
  var searchTimer = null;
  $("#search").addEventListener("input", function () {
    var v = this.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { query = norm(v.trim()); renderList(); }, 180);
  });
  [["article", "Статья в журнале"], ["chapter", "В сборнике"], ["book", "Книга"], ["thesis", "Диссертация"], ["talk", "Тезисы, доклад"]].forEach(function (t) {
    var s = document.createElement("span");
    s.innerHTML = '<b class="lg-' + t[0] + '"></b>' + t[1];
    $("#legend").appendChild(s);
  });

  /* ---------- карточка ---------- */
  var panel = $("#panel");
  function openPanel(w) {
    if (!w) return;
    selected = starOf[w.id] || null;
    var L = levelInfo(w.level), src = D.SOURCES[w.source] || D.SOURCES.istina;
    var names = w.authors.map(function (id) {
      var p = people[id];
      return p.profile ? '<a href="' + esc(p.profile) + '" target="_blank" rel="noopener">' + esc(p.name) + "</a>" : esc(p.name);
    }).join(", ");
    var links = "";
    if (w.istina) {
      links += '<li><a href="' + esc(w.istina) + '" target="_blank" rel="noopener">' +
        (w.istinaKind === "record" ? "Запись о работе в ИСТИНА МГУ" : "Профиль автора в ИСТИНА МГУ") + "</a></li>";
    }
    (w.links || []).forEach(function (l) {
      var lbl = l.kind === "doi" ? l.label + " (издатель)" :
        l.kind === "doi-crossref" ? l.label + " (найден по Crossref)" :
        l.kind === "index" ? l.label + " (индекс цитирования)" : l.label;
      links += '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(lbl) + "</a></li>";
    });
    var html = '<span class="tag">' + esc(TYPES[w.type].name) + "</span>" +
      (w.year ? '<span class="tag">' + w.year + "</span>" : "") +
      "<h2>" + esc(w.title) + "</h2>" +
      '<p class="meta">' + names + (w.coauthors ? "; соавторы: " + esc(w.coauthors) : "") + "</p>" +
      (w.venue ? '<p class="meta">' + esc(w.venue) + "</p>" : "") +
      '<div class="box"><h3>Библиографическая запись</h3><div>' + esc(w.gost) +
      '</div><button class="copy" id="copyGost" type="button">Скопировать</button></div>' +
      (links ? '<div class="box"><h3>Источники</h3><ul class="links">' + links + "</ul></div>" : "") +
      (w.source === "istina" ? "" :
        '<div class="box"><h3>Источник реквизитов</h3>' +
        '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.title) + "</a><br>" +
        (src.primary ? "Официальный документ" : "Вторичный источник") + ", проверено " + esc(D.checkedAt) + "</div>") +
      (w.verify ? '<div class="box warn"><h3>Требует сверки</h3>' + esc(w.verify) + "</div>" : "") +
      '<div class="box"><h3>Созвездие</h3>' + (w.level - MIN_L + 1) + " «" + esc(L.name) + "»: " + esc(L.hint) +
      '. <a href="#" id="toLevel">Показать на карте</a></div>';
    $("#panelBody").innerHTML = html;
    panel.scrollTop = 0;
    $("#copyGost").addEventListener("click", function () {
      var btn = this;
      try {
        navigator.clipboard.writeText(w.gost).then(
          function () { btn.textContent = "Скопировано"; },
          function () { btn.textContent = "Выделите текст вручную"; });
      } catch (e) { btn.textContent = "Выделите текст вручную"; }
    });
    $("#toLevel").addEventListener("click", function (e) {
      e.preventDefault(); closePanel();
      mapwrap.scrollIntoView({ behavior: "smooth" });
      var st = starOf[w.id];
      if (st) { selected = st; flyTo({ x: st.x, y: st.y, s: 3.2 }); }
    });
    panel.classList.add("is-open"); panel.setAttribute("aria-hidden", "false");
    try { history.replaceState(null, "", "#" + w.id); } catch (e) {}
  }
  function closePanel() {
    panel.classList.remove("is-open"); panel.setAttribute("aria-hidden", "true");
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  $("#panelClose").addEventListener("click", closePanel);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePanel(); });

  /* ---------- список ---------- */
  var expanded = {}, PAGE = 20;
  function renderList() {
    var html = "", total = 0;
    LEVELS.slice().reverse().forEach(function (L) {
      var ws = WORKS.filter(function (w) { return w.level === L.level && isActive(w); })
        .sort(function (a, b) { return (b.year || 0) - (a.year || 0); });
      if (!ws.length) return;
      total += ws.length;
      html += '<h4 id="lvl-' + (L.level - MIN_L + 1) + '"><span class="n">' + (L.level - MIN_L + 1) + "</span>" + esc(L.name) +
        " <small>" + esc(L.hint) + ", " + ws.length + "</small></h4>";
      var shown = expanded[L.level] ? ws : ws.slice(0, PAGE);
      shown.forEach(function (w) {
        var doi = (w.links || []).some(function (l) { return l.kind.indexOf("doi") === 0; });
        html += '<div class="row" data-id="' + esc(w.id) + '"><div class="ry">' + esc(w.year || "") + '</div><div><div class="rt">' +
          esc(w.title) + '</div><div class="ra">' + esc(authorsLine(w)) + ". " + esc(TYPES[w.type].name) +
          (w.venue ? ". " + esc(w.venue) : "") + (doi ? ' <span class="doi">DOI</span>' : "") + "</div></div></div>";
      });
      if (ws.length > shown.length) html += '<button class="more" type="button" data-l="' + L.level + '">Показать ещё ' + (ws.length - shown.length) + "</button>";
    });
    $("#list").innerHTML = '<p class="list-total">Найдено работ: ' + total + "</p>" + (html || "<p>Ничего не найдено.</p>");
    $("#found").textContent = filtering() ? "Найдено: " + total : "";
  }
  $("#list").addEventListener("click", function (e) {
    var m = e.target.closest(".more");
    if (m) { expanded[+m.dataset.l] = true; renderList(); return; }
    var r = e.target.closest(".row");
    if (r) openPanel(byId[r.dataset.id]);
  });

  /* ---------- о карте и источники ---------- */
  function renderAbout() {
    var withDoi = WORKS.filter(function (w) { return (w.links || []).some(function (l) { return l.kind.indexOf("doi") === 0; }); }).length;
    $("#aboutBody").innerHTML =
      "<h2>О карте</h2>" +
      '<p class="lead">Научные работы сотрудников кафедры собраны во вселенную: каждая работа здесь звезда, каждый уровень масштаба созвездие.</p>' +
      "<p>В центре кафедра. От неё по спиральному рукаву расходятся девять созвездий, от самых малых объектов исследования к самым крупным: от единицы данных и алгоритма через человека, организацию, отрасль и государство к международному уровню, глобальной среде и космосу. Чем крупнее объект, тем дальше и больше созвездие. Цвет звезды обозначает вид работы, размер: её вес (диссертации и книги ярче статей).</p>" +
      "<p>Карту можно перетаскивать и приближать колесом мыши или двумя пальцами. При сильном приближении у звёзд появляются заглавия; нажатие открывает библиографическую запись и источники. Поиск и выбор авторов подсвечивают нужные звёзды.</p>" +
      '<ol class="levels">' + LEVELS.map(function (L) {
        return '<li><span class="n">' + (L.level - MIN_L + 1) + "</span><b>" + esc(L.name) + "</b><span>" + esc(L.hint) + "</span></li>";
      }).join("") + "</ol>" +
      "<p>Созвездие присвоено работе автоматически по ключевым словам заглавия; работы без признаков другого уровня отнесены к созвездию «Государство». Это навигационная классификация, а не оценка работы.</p>";
    $("#stats").innerHTML = "Звёзд (работ): " + WORKS.length + "<br>Со ссылкой DOI: " + withDoi;
    $("#checked").textContent = D.checkedAt;
    var srcs = Object.keys(D.SOURCES).map(function (k) {
      var s2 = D.SOURCES[k];
      return "<li>" + esc(s2.title) + ". — Текст : электронный. — URL: <a href=\"" + esc(s2.url) + "\" target=\"_blank\" rel=\"noopener\">" +
        esc(s2.url) + "</a> (дата обращения: " + esc(D.checkedAt) + ")." + (s2.primary ? "" : " Вторичный источник.") + "</li>";
    }).join("");
    var profiles = D.PEOPLE.filter(function (p) { return p.profile; }).map(function (p) {
      return '<li><a href="' + esc(p.profile) + '" target="_blank" rel="noopener">' + esc(p.name) + "</a></li>";
    }).join("");
    $("#sourcesBody").innerHTML =
      "<h2>Источники</h2>" +
      "<p>Списки работ выгружены из системы ИСТИНА МГУ по профилям сотрудников:</p><ul>" + profiles + "</ul>" +
      "<p>Библиографические записи построены по ГОСТ Р 7.0.100-2018 из экспорта BibTeX каждой записи ИСТИНА; заглавия и выходные данные приведены так, как их внесли авторы. У каждой работы есть ссылка на её запись в ИСТИНА. Ссылки на издателя (DOI), Scopus, Web of Science и eLibrary даны там, где они указаны в ИСТИНА или найдены по совпадению заглавия, года и издания в Crossref.</p>" +
      '<ol class="src"><li>Кафедра компьютерного права и информационной безопасности. — Текст : электронный // Высшая школа государственного аудита МГУ имени М.В. Ломоносова : официальный сайт. — URL: <a href="' + esc(D.department.url) + '" target="_blank" rel="noopener">' + esc(D.department.url) + "</a> (дата обращения: " + esc(D.checkedAt) + ").</li>" + srcs + "</ol>";
  }

  /* ---------- старт ---------- */
  renderList(); renderAbout();
  window.addEventListener("resize", function () { resize(); });
  resize();
  var o = overview(); cam.x = o.x; cam.y = o.y; cam.s = o.s;
  var hashW = byId[location.hash.slice(1)];
  if (hashW) { var st = starOf[hashW.id]; if (st) { cam.x = st.x; cam.y = st.y; cam.s = 3.2; selected = st; } openPanel(hashW); }
  animating = true; requestAnimationFrame(step);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
})();
