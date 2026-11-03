(function () {
  "use strict";

  var D = window.KPIB;
  var LEVELS = D.LEVELS;
  var MIN_L = LEVELS[0].level, MAX_L = LEVELS[LEVELS.length - 1].level;
  var RATIO = 3.2;                       // во сколько раз соседний уровень крупнее
  var DENSE = 12;                        // больше этого числа работ: точечная раскладка
  var TYPES = {
    article:     { name: "Статья в журнале",    color: "var(--blue)" },
    chapter:     { name: "Статья в сборнике",   color: "var(--blue)" },
    book:        { name: "Монография, книга",   color: "var(--green)" },
    thesis:      { name: "Диссертация",         color: "var(--red)" },
    supervision: { name: "Научное руководство", color: "var(--red)" },
    talk:        { name: "Тезисы, доклад",      color: "var(--yellow)" },
    event:       { name: "Научное мероприятие", color: "var(--yellow)" }
  };

  // ручные записи + выгрузка ИСТИНА
  var WORKS = D.WORKS.concat((window.KPIB_ISTINA || []).map(function (w) {
    w.source = "istina"; return w;
  }));
  var byId = {};
  WORKS.forEach(function (w) { byId[w.id] = w; });

  var people = {};
  D.PEOPLE.forEach(function (p) { people[p.id] = p; });
  var activePeople = {};          // пусто = все
  var query = "";

  var $ = function (s) { return document.querySelector(s); };
  var stage = $("#stage"), slider = $("#zoom"), mapwrap = $("#map");

  /* ---------- фотографии фона ---------- */
  var PHOTOS = D.PHOTOS || [];
  var bgEls = PHOTOS.map(function (ph) {
    var el = document.createElement("div");
    el.style.backgroundImage = "url('" + ph.src + "')";
    $("#bgs").appendChild(el);
    return el;
  });
  var curPhoto = -1;
  function setPhoto(level) {
    var idx = -1;
    PHOTOS.forEach(function (ph, i) { if (ph.levels.indexOf(level) >= 0) idx = i; });
    if (idx < 0 || idx === curPhoto) return;
    curPhoto = idx;
    bgEls.forEach(function (el, i) { el.classList.toggle("on", i === idx); });
    $("#photoCredit").textContent = PHOTOS[idx].caption + ". " + (D.photoCredit || "");
  }

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

  /* ---------- построение DOM шкалы ---------- */
  var levelEls = [];
  LEVELS.forEach(function (L) {
    var works = WORKS.filter(function (w) { return w.level === L.level; })
      .sort(function (a, b) { return (b.year || 0) - (a.year || 0); });
    var el = document.createElement("div");
    el.className = "lvl";
    el.innerHTML = '<div class="lvl-label">' + esc(L.name) + " <span class=\"cnt\">" + works.length + "</span><small>" + esc(L.hint) + "</small></div>" +
      (works.length ? "" : '<div class="lvl-empty">Работ этого уровня пока нет</div>');
    el.addEventListener("click", function (e) { if (e.target === el) goTo(L.level); });
    stage.appendChild(el);

    var dense = works.length > DENSE;
    var items = works.map(function (w) {
      var it = document.createElement("div");
      it.className = "item t-" + w.type + (dense ? " dot" : "");
      it.tabIndex = 0;
      it.dataset.id = w.id;
      it.setAttribute("role", "button");
      it.setAttribute("aria-label", w.title);
      it.title = (w.year ? w.year + ". " : "") + w.title + "\n" + shortAuthors(w);
      if (!dense) {
        it.innerHTML = '<div class="yr">' + esc(w.year || "") + '</div><div class="ttl">' + esc(w.title) +
          '</div><div class="au">' + esc(shortAuthors(w)) + "</div>";
      }
      stage.appendChild(it);
      return { w: w, el: it };
    });
    levelEls.push({ L: L, el: el, label: el.firstChild, items: items, dense: dense });
  });
  stage.addEventListener("click", function (e) {
    var it = e.target.closest && e.target.closest(".item");
    if (it) { e.stopPropagation(); openPanel(byId[it.dataset.id]); }
  });
  stage.addEventListener("keydown", function (e) {
    var it = e.target.closest && e.target.closest(".item");
    if (it && e.key === "Enter") openPanel(byId[it.dataset.id]);
  });

  // раскладка работ внутри уровня
  function layoutPoints(n, d) {
    var pts = [], size;
    function ring(count, R, start) {
      for (var k = 0; k < count; k++) {
        var a = start + k * 2 * Math.PI / count;
        pts.push([R * Math.cos(a), R * Math.sin(a)]);
      }
    }
    if (n <= 1) { pts.push([0, 0]); size = d * 0.3; }
    else if (n <= 6) {
      var R = d * 0.22;
      size = Math.min(d * 0.25, 2 * R * Math.sin(Math.PI / n) / 1.1);
      ring(n, R, -Math.PI / 2 + Math.PI / n);
    } else if (n <= DENSE) {
      var a = Math.round(n / 3), b = n - a, R1 = d * 0.13, R2 = d * 0.3;
      size = Math.min(d * 0.18, 2 * R1 * Math.sin(Math.PI / a) / 1.1, 2 * R2 * Math.sin(Math.PI / b) / 1.1);
      if (a === 1) pts.push([0, 0]); else ring(a, R1, -Math.PI / 2);
      ring(b, R2, -Math.PI / 2 + Math.PI / b);
    } else {
      // «подсолнух»: равномерное заполнение круга
      var RR = d * 0.33;
      size = RR * Math.sqrt(Math.PI / n) * 0.82;
      for (var i = 0; i < n; i++) {
        var r = RR * Math.sqrt((i + 0.5) / n), th = i * 2.39996;
        pts.push([r * Math.cos(th), r * Math.sin(th)]);
      }
    }
    return { pts: pts, size: size };
  }

  /* ---------- раскладка ---------- */
  var z = 2, zTarget = 2, W = 0, H = 0;

  function layout() {
    W = stage.clientWidth; H = stage.clientHeight;
    var narrow = W < 700;
    var B = narrow ? Math.min(W * 0.96, H * 0.8) : Math.min(W * 0.62, H * 0.9);   // диаметр текущего уровня
    var K = narrow ? B * 0.9 : B * 1.08;
    var cy = H / 2 + 18;
    var cur = Math.round(z);

    levelEls.forEach(function (o) {
      var f = Math.pow(RATIO, o.L.level - z);
      var d = B * f;
      var cx = W / 2 + K * (f - 1);
      var visible = d > 6 && d < Math.max(W, H) * 9 && cx - d / 2 < W + 40;
      var op = d < 40 ? Math.max(0, (d - 6) / 34) : 1;

      o.el.style.display = visible ? "" : "none";
      o.el.classList.toggle("is-current", o.L.level === cur);
      if (visible) {
        o.el.style.left = cx + "px"; o.el.style.top = cy + "px";
        o.el.style.width = d + "px"; o.el.style.height = d + "px";
        o.el.style.opacity = op;
        var fs = Math.max(9, Math.min(30, d * 0.058));
        o.label.style.fontSize = fs + "px";
        o.label.style.top = (d * 0.06) + "px";
        o.label.style.width = (d * 0.7) + "px";
        o.label.style.display = d > 90 ? "" : "none";
        o.label.lastChild.style.fontSize = Math.max(8, fs * 0.55) + "px";
        var emp = o.el.querySelector(".lvl-empty");
        if (emp) emp.style.fontSize = Math.max(9, d * 0.04) + "px";
      }

      var n = o.items.length, pos = layoutPoints(n, d), dItem = pos.size;
      var show = visible && dItem >= (o.dense ? 2 : 5);
      o.items.forEach(function (it, i) {
        if (!show) { if (it.el.style.display !== "none") it.el.style.display = "none"; return; }
        var x = cx + pos.pts[i][0];
        var y = cy + d * (o.dense ? 0.1 : 0.07) + pos.pts[i][1];
        var act = isActive(it.w);
        it.el.style.display = "";
        it.el.style.left = x + "px"; it.el.style.top = y + "px";
        it.el.style.width = dItem + "px"; it.el.style.height = dItem + "px";
        it.el.style.opacity = op * (act ? 1 : 0.12);
        it.el.classList.toggle("is-dim", !act);
        if (o.dense) return;
        var tf = dItem * 0.085;
        var showText = tf >= 7;
        it.el.style.fontSize = Math.min(tf, 20) + "px";
        it.el.style.borderWidth = Math.max(1.5, Math.min(4, dItem * 0.02)) + "px";
        it.el.style.padding = showText ? (dItem * 0.12) + "px" : "0";
        for (var k = 0; k < it.el.children.length; k++) it.el.children[k].style.display = showText ? "" : "none";
        if (showText) it.el.children[1].style.webkitLineClamp = Math.max(2, Math.floor((dItem * 0.42) / (Math.min(tf, 20) * 1.25)));
      });
    });

    var info = levelInfo(Math.max(MIN_L, Math.min(MAX_L, cur)));
    $("#lvlNum").textContent = info.level - MIN_L + 1;
    $("#lvlName").textContent = info.name;
    $("#lvlHint").textContent = info.hint;
    var cnt = WORKS.filter(function (w) { return w.level === info.level && isActive(w); }).length;
    $("#lvlOpen").textContent = "Список: " + cnt;
    $("#lvlOpen").dataset.l = info.level;
    tickEls.forEach(function (t) {
      var on = +t.dataset.l === info.level;
      t.classList.toggle("is-on", on);
      var L2 = levelInfo(+t.dataset.l);
      t.textContent = on ? (L2.tick || L2.name) : String(L2.level - MIN_L + 1);
      t.title = L2.name;
    });
    setPhoto(info.level);
    if (document.activeElement !== slider) slider.value = z;
  }

  /* ---------- анимация ---------- */
  var raf = null;
  function tick() {
    var dz = zTarget - z;
    if (Math.abs(dz) < 0.0015) { z = zTarget; layout(); raf = null; return; }
    z += dz * 0.16;
    layout();
    raf = requestAnimationFrame(tick);
  }
  function setTarget(v, instant) {
    zTarget = Math.max(MIN_L - 0.4, Math.min(MAX_L + 0.4, v));
    if (instant) { z = zTarget; layout(); return; }
    if (!raf) raf = requestAnimationFrame(tick);
    hideHint();
  }
  function goTo(l) { setTarget(l); }

  /* ---------- управление ---------- */
  slider.min = MIN_L - 0.4; slider.max = MAX_L + 0.4;
  slider.addEventListener("input", function () { setTarget(+slider.value, true); hideHint(); });
  slider.addEventListener("change", function () { setTarget(Math.round(+slider.value)); });
  $("#zoomIn").addEventListener("click", function () { setTarget(Math.round(zTarget) - 1); });
  $("#zoomOut").addEventListener("click", function () { setTarget(Math.round(zTarget) + 1); });
  $("#lvlOpen").addEventListener("click", function () { scrollToLevel(+this.dataset.l); });

  var tickEls = LEVELS.map(function (L) {
    var b = document.createElement("button");
    b.type = "button"; b.dataset.l = L.level; b.textContent = L.tick || L.name;
    b.style.left = ((L.level - (MIN_L - 0.4)) / (MAX_L - MIN_L + 0.8) * 100) + "%";
    b.addEventListener("click", function () { goTo(L.level); });
    $("#ticks").appendChild(b);
    return b;
  });

  var snapTimer = null;
  var mapActive = false;
  function setActive(v) { mapActive = v; mapwrap.classList.toggle("is-active", v); }
  stage.addEventListener("pointerdown", function () { setActive(true); hideHint(); });
  mapwrap.addEventListener("mouseleave", function () { setActive(false); });
  stage.addEventListener("wheel", function (e) {
    if (!mapActive) return;
    e.preventDefault();
    var delta = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
    if (e.deltaMode === 1) delta *= 16;
    setTarget(zTarget + delta * 0.0022);
    clearTimeout(snapTimer);
    snapTimer = setTimeout(function () {
      if (Math.abs(zTarget - Math.round(zTarget)) < 0.22) setTarget(Math.round(zTarget));
    }, 260);
  }, { passive: false });

  stage.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest(".item")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "+") setTarget(Math.round(zTarget) + 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "-") setTarget(Math.round(zTarget) - 1);
  });

  // перетаскивание и щипок
  var pts = {}, startZ = 0, startX = 0, startDist = 0, moved = false;
  stage.addEventListener("pointerdown", function (e) {
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    startZ = zTarget; startX = e.clientX; moved = false;
    if (Object.keys(pts).length === 2) startDist = dist();
  });
  stage.addEventListener("pointermove", function (e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pts);
    if (ids.length === 2 && startDist) {
      var r = dist() / startDist;
      setTarget(startZ - Math.log(r) / Math.log(RATIO), true); moved = true;
    } else if (ids.length === 1) {
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 6) moved = true;
      if (moved) setTarget(startZ + dx / (W * 0.45), true);
    }
  });
  function endPtr(e) {
    delete pts[e.pointerId];
    if (!Object.keys(pts).length) { startDist = 0; if (moved) setTarget(Math.round(zTarget)); }
  }
  stage.addEventListener("pointerup", endPtr);
  stage.addEventListener("pointercancel", endPtr);
  function dist() {
    var v = Object.keys(pts).map(function (k) { return pts[k]; });
    return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) || 1;
  }
  stage.addEventListener("click", function (e) { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);

  window.addEventListener("resize", layout);

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
      refresh();
    });
    $("#people").appendChild(b);
  });
  var searchTimer = null;
  $("#search").addEventListener("input", function () {
    var v = this.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { query = norm(v.trim()); refresh(); }, 180);
  });
  function refresh() { layout(); renderList(); }

  [["article", "Статья в журнале"], ["chapter", "В сборнике"], ["book", "Книга"], ["thesis", "Диссертация"], ["talk", "Тезисы, доклад"]].forEach(function (t) {
    var s = document.createElement("span");
    s.innerHTML = '<b class="lg-' + t[0] + '"></b>' + t[1];
    $("#legend").appendChild(s);
  });

  /* ---------- карточка ---------- */
  var panel = $("#panel");
  function openPanel(w) {
    if (!w) return;
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
      '<div class="box blue"><h3>Библиографическая запись</h3><div>' + esc(w.gost) +
      '</div><button class="copy" id="copyGost" type="button">Скопировать</button></div>' +
      (links ? '<div class="box green"><h3>Источники</h3><ul class="links">' + links + "</ul></div>" : "") +
      (w.source === "istina" ? "" :
        '<div class="box ' + (src.primary ? "green" : "yellow") + '"><h3>Источник реквизитов</h3>' +
        '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.title) + "</a><br>" +
        (src.primary ? "Официальный документ" : "Вторичный источник") + ", проверено " + esc(D.checkedAt) + "</div>") +
      (w.verify ? '<div class="box yellow"><h3>Требует сверки</h3>' + esc(w.verify) + "</div>" : "") +
      '<div class="box" style="background:var(--fill)"><h3>Место на шкале</h3>Уровень ' +
      (w.level - MIN_L + 1) + " «" + esc(L.name) + "»: " + esc(L.hint) +
      '. <a href="#" id="toLevel">Показать уровень</a></div>';
    $("#panelBody").innerHTML = html;
    $("#panelBody").scrollTop = 0; panel.scrollTop = 0;
    $("#copyGost").addEventListener("click", function () {
      var btn = this;
      try {
        navigator.clipboard.writeText(w.gost).then(
          function () { btn.textContent = "Скопировано"; },
          function () { btn.textContent = "Выделите текст вручную"; });
      } catch (e) { btn.textContent = "Выделите текст вручную"; }
    });
    $("#toLevel").addEventListener("click", function (e) { e.preventDefault(); closePanel(); mapwrap.scrollIntoView({ behavior: "smooth" }); goTo(w.level); });
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
  }
  $("#list").addEventListener("click", function (e) {
    var m = e.target.closest(".more");
    if (m) { expanded[+m.dataset.l] = true; renderList(); return; }
    var r = e.target.closest(".row");
    if (r) openPanel(byId[r.dataset.id]);
  });
  function scrollToLevel(l) {
    var h = document.getElementById("lvl-" + (l - MIN_L + 1));
    (h || $("#works")).scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- о карте и источники ---------- */
  function renderAbout() {
    var withDoi = WORKS.filter(function (w) { return (w.links || []).some(function (l) { return l.kind.indexOf("doi") === 0; }); }).length;
    $("#aboutBody").innerHTML =
      "<h2>О карте</h2>" +
      '<p class="lead">Научные работы сотрудников кафедры расположены на одной шкале: от отдельной единицы данных до космоса.</p>' +
      "<p>Навигация устроена как шкала масштаба вселенной: каждый следующий уровень крупнее предыдущего, и движение по шкале переводит взгляд от данных и алгоритмов к человеку, организации, отрасли, государству, международному уровню, глобальной среде и космосу. Каждая точка на карте означает одну работу; нажатие открывает её библиографическую запись и источники.</p>" +
      '<ol class="levels">' + LEVELS.map(function (L) {
        return '<li><span class="n">' + (L.level - MIN_L + 1) + "</span><b>" + esc(L.name) + "</b><span>" + esc(L.hint) + "</span></li>";
      }).join("") + "</ol>" +
      "<p>Уровень присвоен автоматически по ключевым словам заглавия; работы без признаков другого уровня отнесены к уровню «Государство». Это навигационная классификация, а не оценка работы.</p>";
    $("#stats").innerHTML = "Работ на карте: " + WORKS.length + "<br>Со ссылкой DOI: " + withDoi;
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
      '<ol class="src"><li>Кафедра компьютерного права и информационной безопасности. — Текст : электронный // Высшая школа государственного аудита МГУ имени М.В. Ломоносова : официальный сайт. — URL: <a href="' + esc(D.department.url) + '" target="_blank" rel="noopener">' + esc(D.department.url) + "</a> (дата обращения: " + esc(D.checkedAt) + ").</li>" + srcs + "</ol>" +
      "<p>" + esc(D.photoCredit || "") + "</p>";
  }

  /* ---------- подсказка ---------- */
  var hintGone = false;
  function hideHint() { if (!hintGone) { hintGone = true; $("#hint").classList.add("is-gone"); } }
  setTimeout(hideHint, 7000);

  /* ---------- старт ---------- */
  renderList(); renderAbout();
  var hashW = byId[location.hash.slice(1)];
  setTarget(hashW ? hashW.level : 2, true);
  if (hashW) openPanel(hashW);
})();
