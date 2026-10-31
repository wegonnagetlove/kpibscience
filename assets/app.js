(function () {
  "use strict";

  var D = window.KPIB;
  var LEVELS = D.LEVELS;
  var MIN_L = LEVELS[0].level, MAX_L = LEVELS[LEVELS.length - 1].level;
  var RATIO = 3.2;              // во сколько раз соседний уровень крупнее
  var TYPES = {
    article:     { name: "Статья",            color: "var(--blue)" },
    book:        { name: "Монография, книга", color: "var(--green)" },
    thesis:      { name: "Диссертация",       color: "var(--red)" },
    supervision: { name: "Научное руководство", color: "var(--red)" },
    talk:        { name: "Доклад",            color: "var(--yellow)" },
    event:       { name: "Научное мероприятие", color: "var(--yellow)" }
  };

  var people = {};
  D.PEOPLE.forEach(function (p) { people[p.id] = p; });
  var activePeople = {};          // пусто = все

  var $ = function (s) { return document.querySelector(s); };
  var stage = $("#stage"), slider = $("#zoom");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function levelInfo(l) { return LEVELS.filter(function (x) { return x.level === l; })[0]; }
  function authorsLine(w) {
    var a = w.authors.map(function (id) { return people[id].short; }).join(", ");
    return w.coauthors ? a + "; " + w.coauthors : a;
  }
  function isActive(w) {
    var keys = Object.keys(activePeople);
    if (!keys.length) return true;
    return w.authors.some(function (id) { return activePeople[id]; });
  }

  /* ---------- построение DOM шкалы ---------- */
  var levelEls = [];
  LEVELS.forEach(function (L) {
    var works = D.WORKS.filter(function (w) { return w.level === L.level; })
      .sort(function (a, b) { return (b.year || 0) - (a.year || 0); });
    var el = document.createElement("div");
    el.className = "lvl";
    el.innerHTML = '<div class="lvl-label">' + esc(L.name) + "<small>" + esc(L.hint) + "</small></div>" +
      (works.length ? "" : '<div class="lvl-empty">Работ этого уровня пока нет</div>');
    el.addEventListener("click", function (e) { if (e.target === el) goTo(L.level); });
    stage.appendChild(el);

    var items = works.map(function (w) {
      var it = document.createElement("div");
      it.className = "item t-" + w.type;
      it.tabIndex = 0;
      it.setAttribute("role", "button");
      it.setAttribute("aria-label", w.title);
      it.innerHTML = '<div class="yr">' + esc(w.year || "") + '</div><div class="ttl">' + esc(w.title) +
        '</div><div class="au">' + esc(w.authors.map(function (id) { return people[id].short; }).join(", ")) + "</div>";
      it.addEventListener("click", function (e) { e.stopPropagation(); openPanel(w); });
      it.addEventListener("keydown", function (e) { if (e.key === "Enter") openPanel(w); });
      stage.appendChild(it);
      return { w: w, el: it };
    });
    levelEls.push({ L: L, el: el, label: el.firstChild, items: items });
  });

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
        o.label.style.top = (d * 0.07) + "px";
        o.label.style.width = (d * 0.7) + "px";
        o.label.style.display = d > 90 ? "" : "none";
        o.label.lastChild.style.fontSize = Math.max(8, fs * 0.55) + "px";
        var emp = o.el.querySelector(".lvl-empty");
        if (emp) emp.style.fontSize = Math.max(9, d * 0.04) + "px";
      }

      var n = o.items.length, pos = ringLayout(n, d), dItem = pos.size;
      o.items.forEach(function (it, i) {
        if (!visible || dItem < 5) { it.el.style.display = "none"; return; }
        var x = cx + pos.pts[i][0];
        var y = cy + d * 0.07 + pos.pts[i][1];
        it.el.style.display = "";
        it.el.style.left = x + "px"; it.el.style.top = y + "px";
        it.el.style.width = dItem + "px"; it.el.style.height = dItem + "px";
        var tf = dItem * 0.085;
        var showText = tf >= 7;
        it.el.style.fontSize = Math.min(tf, 20) + "px";
        it.el.style.borderWidth = Math.max(1.5, Math.min(4, dItem * 0.02)) + "px";
        it.el.style.padding = showText ? (dItem * 0.12) + "px" : "0";
        for (var k = 0; k < it.el.children.length; k++) it.el.children[k].style.display = showText ? "" : "none";
        it.el.querySelector(".ttl").style.webkitLineClamp = Math.max(2, Math.floor((dItem * 0.42) / (Math.min(tf, 20) * 1.25)));
        it.el.classList.toggle("is-dim", !isActive(it.w));
        it.el.style.opacity = op * (isActive(it.w) ? 1 : 0.14);
      });
    });

    var info = levelInfo(Math.max(MIN_L, Math.min(MAX_L, cur)));
    $("#lvlNum").textContent = info.level - MIN_L + 1;
    $("#lvlName").textContent = info.name;
    $("#lvlHint").textContent = info.hint;
    tickEls.forEach(function (t) { t.classList.toggle("is-on", +t.dataset.l === info.level); });
    if (document.activeElement !== slider) slider.value = z;
  }

  // раскладка работ внутри уровня: центр, одно или два кольца
  function ringLayout(n, d) {
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
    } else {
      var a = Math.round(n / 3), b = n - a, R1 = d * 0.13, R2 = d * 0.3;
      size = Math.min(d * 0.18, 2 * R1 * Math.sin(Math.PI / a) / 1.1, 2 * R2 * Math.sin(Math.PI / b) / 1.1);
      if (a === 1) pts.push([0, 0]); else ring(a, R1, -Math.PI / 2);
      ring(b, R2, -Math.PI / 2 + Math.PI / b);
    }
    return { pts: pts, size: size };
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

  var tickEls = LEVELS.map(function (L) {
    var b = document.createElement("button");
    b.type = "button"; b.dataset.l = L.level; b.textContent = L.tick || L.name;
    b.style.left = ((L.level - (MIN_L - 0.4)) / (MAX_L - MIN_L + 0.8) * 100) + "%";
    b.addEventListener("click", function () { goTo(L.level); });
    $("#ticks").appendChild(b);
    return b;
  });

  var snapTimer = null;
  stage.addEventListener("wheel", function (e) {
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
    if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "+") setTarget(Math.round(zTarget) + 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "-") setTarget(Math.round(zTarget) - 1);
  });

  // перетаскивание и щипок
  var pts = {}, startZ = 0, startX = 0, startDist = 0, moved = false;
  stage.addEventListener("pointerdown", function (e) {
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    startZ = zTarget; startX = e.clientX; moved = false;
    var ids = Object.keys(pts);
    if (ids.length === 2) startDist = dist();
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

  /* ---------- фильтры ---------- */
  D.PEOPLE.forEach(function (p) {
    var n = D.WORKS.filter(function (w) { return w.authors.indexOf(p.id) >= 0; }).length;
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip";
    b.textContent = p.short + " · " + n;
    b.title = p.name + ", " + p.role;
    b.addEventListener("click", function () {
      if (activePeople[p.id]) delete activePeople[p.id]; else activePeople[p.id] = true;
      b.classList.toggle("is-on", !!activePeople[p.id]);
      layout(); renderList();
    });
    $("#people").appendChild(b);
  });
  [["article", "Статья"], ["book", "Монография"], ["thesis", "Диссертация"], ["talk", "Доклад, мероприятие"]].forEach(function (t) {
    var s = document.createElement("span");
    s.innerHTML = '<b style="border-color:' + TYPES[t[0]].color + '"></b>' + t[1];
    $("#legend").appendChild(s);
  });

  /* ---------- карточка ---------- */
  var panel = $("#panel");
  function openPanel(w) {
    var L = levelInfo(w.level), src = D.SOURCES[w.source];
    var names = w.authors.map(function (id) { return esc(people[id].name); }).join(", ");
    var html = '<span class="tag">' + esc(TYPES[w.type].name) + "</span>" +
      (w.year ? '<span class="tag">' + w.year + "</span>" : "") +
      "<h2>" + esc(w.title) + "</h2>" +
      '<p class="meta">' + names + (w.coauthors ? "; соавторы: " + esc(w.coauthors) : "") + "</p>" +
      '<div class="box blue"><h3>Библиографическая запись</h3><div id="gost">' + esc(w.gost) +
      '</div><button class="copy" id="copyGost" type="button">Скопировать</button></div>' +
      '<div class="box ' + (src.primary ? "green" : "yellow") + '"><h3>Источник реквизитов</h3>' +
      '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.title) + "</a><br>" +
      (src.primary ? "Официальный документ" : "Вторичный источник: реквизиты подлежат сверке с самим изданием") +
      ", проверено " + esc(D.checkedAt) + "</div>" +
      (w.verify ? '<div class="box yellow"><h3>Требует сверки</h3>' + esc(w.verify) + "</div>" : "") +
      '<div class="box" style="background:var(--fill)"><h3>Место на шкале</h3>Уровень ' +
      (w.level - MIN_L + 1) + " «" + esc(L.name) + "»: " + esc(L.hint) +
      '. <a href="#" id="toLevel">Показать уровень</a></div>';
    $("#panelBody").innerHTML = html;
    $("#copyGost").addEventListener("click", function () {
      var t = w.gost, btn = this;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
        function () { btn.textContent = "Скопировано"; },
        function () { btn.textContent = "Выделите текст вручную"; });
    });
    $("#toLevel").addEventListener("click", function (e) { e.preventDefault(); showView("scale"); goTo(w.level); });
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
  function renderList() {
    var html = "";
    LEVELS.slice().reverse().forEach(function (L) {
      var ws = D.WORKS.filter(function (w) { return w.level === L.level && isActive(w); })
        .sort(function (a, b) { return (b.year || 0) - (a.year || 0); });
      if (!ws.length) return;
      html += '<h2><span class="n">' + (L.level - MIN_L + 1) + "</span>" + esc(L.name) + " <small>" + esc(L.hint) + "</small></h2>";
      ws.forEach(function (w) {
        html += '<div class="row" data-id="' + w.id + '"><div class="ry">' + esc(w.year || "") + '</div><div><div class="rt">' +
          esc(w.title) + '</div><div class="ra">' + esc(authorsLine(w)) + " · " + esc(TYPES[w.type].name) + "</div></div></div>";
      });
    });
    $("#list").innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll(".row"), function (r) {
      r.addEventListener("click", function () {
        openPanel(D.WORKS.filter(function (w) { return w.id === r.dataset.id; })[0]);
      });
    });
  }

  /* ---------- о проекте ---------- */
  function renderAbout() {
    var srcs = Object.keys(D.SOURCES).map(function (k) {
      var s = D.SOURCES[k];
      return "<li>" + esc(s.title) + ". — Текст : электронный. — URL: <a href=\"" + esc(s.url) + "\" target=\"_blank\" rel=\"noopener\">" +
        esc(s.url) + "</a> (дата обращения: " + esc(D.checkedAt) + ")." + (s.primary ? "" : " Вторичный источник.") + "</li>";
    }).join("");
    $("#about").innerHTML =
      "<h2>О проекте</h2>" +
      "<p>Сайт показывает научные работы сотрудников кафедры компьютерного права и информационной безопасности Высшей школы государственного аудита МГУ на одной шкале: от отдельной единицы данных до глобальной информационной среды. Принцип навигации заимствован у интерактивных шкал «масштаба вселенной», но вместо физического размера объекта используется масштаб объекта правового регулирования, которому посвящена работа.</p>" +
      "<h2>Уровни шкалы</h2><ol>" + LEVELS.map(function (L) { return "<li><b>" + esc(L.name) + "</b>: " + esc(L.hint) + "</li>"; }).join("") + "</ol>" +
      "<p>Отнесение работы к уровню является редакционной классификацией по заглавию и предмету работы. Оно не является оценкой самих авторов и правится в файле данных.</p>" +
      "<h2>Источники данных</h2>" +
      "<p>Состав кафедры приведён по официальному сайту ВШГА МГУ. Реквизиты работ взяты из официальных документов диссертационных советов МГУ и страниц сотрудников на сайтах факультетов МГУ. Записи, взятые из вторичных перечней, и записи с неполными реквизитами помечены в карточке блоком «Требует сверки». Публикации А.С. Зуевой и С.С. Калканова в открытых источниках, доступных для проверки, не найдены; их следует дополнить по системе ИСТИНА.</p>" +
      '<ol class="src"><li>Кафедра компьютерного права и информационной безопасности. — Текст : электронный // Высшая школа государственного аудита МГУ имени М.В. Ломоносова : официальный сайт. — URL: <a href="' + esc(D.department.url) + '" target="_blank" rel="noopener">' + esc(D.department.url) + "</a> (дата обращения: " + esc(D.checkedAt) + ").</li>" + srcs + "</ol>" +
      "<p>Данные проверены " + esc(D.checkedAt) + ". Всего работ на шкале: " + D.WORKS.length + ".</p>";
  }

  /* ---------- виды ---------- */
  function showView(v) {
    Array.prototype.forEach.call(document.querySelectorAll(".vbtn"), function (b) { b.classList.toggle("is-on", b.dataset.view === v); });
    $("#list").hidden = v !== "list";
    $("#about").hidden = v !== "about";
    $("#dock").style.display = v === "scale" ? "" : "none";
    document.querySelector(".filters").style.display = v === "about" ? "none" : "";
    if (v === "scale") layout();
  }
  Array.prototype.forEach.call(document.querySelectorAll(".vbtn"), function (b) {
    b.addEventListener("click", function () { showView(b.dataset.view); });
  });

  /* ---------- подсказка ---------- */
  var hintGone = false;
  function hideHint() { if (!hintGone) { hintGone = true; $("#hint").classList.add("is-gone"); } }
  setTimeout(hideHint, 7000);

  /* ---------- старт ---------- */
  renderList(); renderAbout();
  var hashW = D.WORKS.filter(function (w) { return "#" + w.id === location.hash; })[0];
  setTarget(hashW ? hashW.level : 2, true);
  if (hashW) openPanel(hashW);
})();
