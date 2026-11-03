"""Собирает data/works.js из выгрузки ИСТИНА (списки + BibTeX + найденные DOI)."""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "istina")
os.chdir(SRC)

CHECKED = "03.11.2026"
PEOPLE = {"baturin": "1276994", "zueva": "3172534", "morozov": "26759990", "streltsov": "2826393"}
res = json.load(open("bib.json"))
crossref = json.load(open("crossref.json")) if os.path.exists("crossref.json") else {}

SEC_TYPE = {"Статьи в журналах": "article", "Статьи в сборниках": "chapter",
            "Тезисы докладов": "talk", "Книги": "book", "Диссертации": "thesis"}
CITIES = ["Москва", "Санкт-Петербург", "Саратов", "Уфа", "Тула", "Пермь", "Казань", "Екатеринбург",
          "Новосибирск", "Киев", "Минск", "Ростов-на-Дону", "Нижний Новгород", "Красноярск", "Самара",
          "Воронеж", "Омск", "Махачкала", "Алматы", "Баку", "Долгопрудный", "Ленинград", "Л.", "Симферополь", "Севастополь", "Челябинск", "Томск", "Курск", "Ижевск", "Иркутск", "Ярославль", "Владивосток", "Хабаровск", "Калининград", "Тверь", "Барнаул", "Ставрополь", "Краснодар", "Волгоград", "Оренбург", "Тюмень", "Белгород", "Смоленск", "Рязань", "Орел", "Нур-Султан", "Бишкек", "Ереван", "Душанбе", "Ташкент", "London", "Berlin", "Cham", "М.", "М", "СПб.", "СПб"]


def unbib(s):
    s = s.replace("{\\flqq}", "«").replace("{\\frqq}", "»").replace("{\\dq}", '"').replace("\\dq", '"')
    s = s.replace("\\&", "&").replace("--", "-")
    s = re.sub(r"[{}\\]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def field(b, k):
    m = re.search(r"\n\s*" + k + r" = \{(.*?)\},?\n", b, re.S)
    return unbib(m.group(1)) if m else ""


def is_cyr(s):
    return bool(re.search("[а-яА-Я]", s))


def initials(given):
    parts = [p for p in re.split(r"[\s.]+", given) if p]
    out = ""
    for p in parts:
        if "-" in p:
            out += "-".join(x[0] + "." for x in p.split("-") if x)
        else:
            out += p[0] + "."
    return out


def parse_authors(a):
    res_ = []
    for one in re.split(r"\s+and\s+", a):
        one = one.strip()
        if not one:
            continue
        if "," in one:
            fam, giv = one.split(",", 1)
        else:
            bits = one.split()
            fam, giv = (bits[0], " ".join(bits[1:])) if len(bits) > 1 else (one, "")
        res_.append((fam.strip(), initials(giv.strip())))
    return res_


def head_and_resp(auth):
    """Возвращает (заголовок перед заглавием, сведения об ответственности) по ГОСТ Р 7.0.100-2018."""
    if not auth:
        return "", ""
    full = [f"{i} {f}".strip() for f, i in auth]
    if len(auth) <= 3:
        head = f"{auth[0][0]}, {auth[0][1]}".rstrip(", ")
        return head, ", ".join(full)
    if len(auth) == 4:
        return "", ", ".join(full)
    tail = " [и др.]" if is_cyr(auth[0][0]) else " [et al.]"
    return "", ", ".join(full[:3]) + tail


def split_place(addr, pub):
    addr = addr.strip()
    place = ""
    for c in sorted(CITIES, key=len, reverse=True):
        if addr.endswith(" " + c) or addr == c:
            place = c
            addr = addr[: -len(c)].strip()
            break
    if place in ("М", "М."):
        place = "Москва"
    if place in ("СПб", "СПб."):
        place = "Санкт-Петербург"
    publisher = pub or addr
    if not pub and not place:
        publisher = addr
    return place, publisher


def pages(p):
    p = p.replace("--", "-").strip()
    m = re.fullmatch(r"(\w+)-(\w+)", p)
    if m and m.group(1) == m.group(2):
        p = m.group(1)
    return p


def gost(kind, b, extra_title=""):
    title = field(b, "title")
    auth = parse_authors(field(b, "author"))
    head, resp = head_and_resp(auth)
    cyr = is_cyr(title) or is_cyr(field(b, "journal")) or is_cyr(field(b, "booktitle"))
    ct = "Текст : непосредственный" if cyr else "Text : unmediated"
    y, vol, num, pg = field(b, "year"), field(b, "volume"), field(b, "number"), pages(field(b, "pages"))
    place, publisher = split_place(field(b, "address"), field(b, "publisher"))
    imprint = ""
    if place and publisher:
        imprint = f"{place} : {publisher}"
    elif place or publisher:
        imprint = place or publisher
    title = re.sub(r"\s*:\s*", " : ", title)
    parts = []
    lead = (head + " " if head else "") + title
    if resp:
        lead += " / " + resp
    p_lbl, v_lbl, n_lbl = ("С.", "Т.", "№") if cyr else ("P.", "Vol.", "No.")
    if kind == "book":
        s = lead + "."
        if imprint or y:
            s += " — " + ", ".join(x for x in [imprint, y] if x) + "."
        np_ = field(b, "numpages")
        if np_:
            s += f" — {np_} {'с' if cyr else 'p'}."
        if field(b, "series"):
            s += f" — ({field(b, 'series')})."
        if field(b, "isbn"):
            s += f" — ISBN {field(b, 'isbn')}."
        s += f" — {ct}."
    else:
        src = field(b, "journal") or field(b, "booktitle")
        s = lead + f". — {ct}"
        if src:
            s += f" // {src}"
        if kind == "journal":
            if y:
                s += f". — {y}"
            vn = ", ".join(x for x in [f"{v_lbl} {vol}" if vol else "", f"{n_lbl} {num}" if num else ""] if x)
            if vn:
                s += f". — {vn}"
        else:
            if imprint or y:
                s += ". — " + ", ".join(x for x in [imprint, y] if x)
        if pg:
            s += f". — {p_lbl} {pg}"
        s += "."
    doi = field(b, "doi")
    if doi:
        s += f" — DOI {doi}."
    return re.sub(r"\.\.", ".", s)


# ---------- уровни ----------
RULES = [
    (5, r"астронав|астроном|космо|космич|орбит|ракет|спутник|гагарин|луну|лун[аы]|аполлон|мкс\b|салют|salyut|space|astronaut|rocket|lunar|дирижабл|звезд|галакт|сатурн|марс"),
    (-3, r"персональн|данн(ых|ые)|data|тайн|конфиденциальн|3d-документ|документ\b|электронн(ая|ой) подпис|реестр|регистр|информационн(ая|ой) энтропи"),
    (-2, r"искусственн\w* интеллект|интеллектуальн\w* систем|\bии\b|ии-|ии‑|нейро|алгоритм|робот|машинн|machine learning|artificial|\bai\b|блокчейн|кибернетич|компьютер|нейросет|облачн|3d|модел[иь]ровани|программн"),
    (-1, r"личност|человек|гражданин|пользовател|студент|аспирант|обучающ|ребен|дет[ейя]|здоровь|юрист|ученого|ученый|космонавт|когнитивн|self|individual|memory|памяти|биограф|юбиле|воспоминан|интервью|кадр"),
    (0, r"\bорганизаци(я|и|ю|ей|й|ях|ями)\b|университет|вуз|кафедр|образоват|учебн|учебник|магистерск|предприяти|компани|корпорати|учрежден|академи[яи] наук|\bран\b|научн\w* центр|музе|счетной палат|казначейств|банк(?!овск)"),
    (4, r"глобал|метавселен|цифров(ая|ой) земл|digital earth|ноосфер|человечеств|интернет|киберпространств|информационн(ое|ого) пространств|онлайнов|виртуальн|омнимедиа|сеть|сети"),
    (3, r"международн|зарубеж|иностран|стран(ах)? мира|countr|international|global|china|китай|кита[ея]|сша\b|канад|казахстан|белорусс|азербайджан|украин|еаэс|оон|европ|ближнем восток|миграц|суверенитет|холодной войне|германи|брикс|шос"),
    (1, r"экономик|рынок|рынк|финанс|бюджет|банк|крипто|рубл|налог|закуп|реклам|отрасл|бизнес|предприним|страхов|ценных бумаг|фондов|капитал|инвестиц|мошенничеств|легализаци|контрабанд|мсфо|отчетност|economic|financial|market|business|banking|энерг|транспорт|краудфандинг|контролинг|контроллинг|смарт-контрол|эконофизик"),
]


def level_of(text):
    t = text.lower().replace("ё", "е")
    for lvl, rx in RULES:
        if re.search(rx, t):
            return lvl
    return 2


# ---------- сбор ----------
works = {}
order = []
for pid in PEOPLE:
    for line in open(pid + ".txt", encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip():
            continue
        parts = line.split(" | ")
        sec, path, body = parts[0].strip(), parts[1].strip(), parts[2]
        ext = []
        if len(parts) > 3 and parts[3].startswith("EXT"):
            ext = parts[3][3:].split()
        typ = SEC_TYPE.get(sec, "article")
        if path == "-":
            key = pid + "-diss-" + re.match(r"(\d{4})", body).group(1)
            segs = body.split(" ¶ ")
            y = segs[0][:4]
            title = segs[0][5:]
            spec = segs[1] if len(segs) > 1 else ""
            council = next((s for s in segs if s.startswith("Защищена")), "")
            kind_d = "доктора" if "Докторская" in spec else "кандидата"
            sci = re.search(r"\(([^)]*наук[^)]*)\)\s*$", spec)
            spec_code = re.search(r"специальности\s+([\d.]+)", spec)
            org = re.search(r".* при (.+)$", council)
            fam_name = {"baturin": "Батурин, Ю.М.", "zueva": "Зуева, А.С.", "morozov": "Морозов, А.В.", "streltsov": "Стрельцов, А.А."}[pid]
            full_name = {"baturin": "Батурин Юрий Михайлович", "zueva": "Зуева Анна Сергеевна", "morozov": "Морозов Андрей Витальевич", "streltsov": "Стрельцов Анатолий Александрович"}[pid]
            g = f"{fam_name} {title}"
            if spec_code:
                g += f" : специальность {spec_code.group(1)}"
            g += f" : диссертация на соискание ученой степени {kind_d} {'' if not sci else ''}наук / {full_name}"
            if org:
                g += f" ; {org.group(1).strip()}"
            g += f". — {y}. — Текст : непосредственный."
            g = g.replace("ученой степени доктора наук", "ученой степени доктора наук").replace("  ", " ")
            if sci:
                field_word = {"юрид. науки": "юридических", "экон. науки": "экономических", "техн. науки": "технических"}.get(sci.group(1).strip())
                if field_word:
                    g = g.replace(f"степени {kind_d} наук", f"степени {kind_d} {field_word} наук")
            works[key] = dict(id=key, authors=[pid], year=int(y), type="thesis", title=title.strip() + " (диссертация)",
                              gost=g, istina=f"https://istina.msu.ru/workers/{PEOPLE[pid]}/publications/", istinaKind="profile",
                              links=[], level=level_of(title), note=council)
            order.append(key)
            continue
        code = ("a" if "/article/" in path else "b") + path.rstrip("/").rsplit("/", 1)[1]
        if code in works:
            if pid not in works[code]["authors"]:
                works[code]["authors"].append(pid)
            continue
        r = res.get(code, {"bib": "", "ext": []})
        b = r["bib"]
        title = field(b, "title") or re.sub(r"^\d{4}\s+", "", body.split(" ¶ ")[0])
        y = field(b, "year") or body[:4]
        kind = "book" if typ == "book" else ("journal" if b.lstrip().startswith("@article") else "proc")
        links = []
        doi = field(b, "doi")
        for u in list(r.get("ext", [])) + ext:
            if "doi.org/" in u:
                doi = doi or u.split("doi.org/", 1)[1]
        if doi:
            links.append({"label": "DOI " + doi, "url": "https://doi.org/" + doi, "kind": "doi"})
        cr = crossref.get(code)
        if not doi and cr and cr.get("doi"):
            doi_c = cr["doi"]
            links.append({"label": "DOI " + doi_c, "url": "https://doi.org/" + doi_c, "kind": "doi-crossref"})
        for u in list(r.get("ext", [])) + ext:
            if "doi.org/" in u:
                continue
            host = re.match(r"https?://([^/]+)", u).group(1)
            lbl = {"www.scopus.com": "Scopus", "gateway.webofknowledge.com": "Web of Science", "elibrary.ru": "eLibrary"}.get(host, host)
            if not any(l["url"] == u for l in links):
                links.append({"label": lbl, "url": u, "kind": "index"})
        urls_in_body = re.findall(r"https?://\S+", body)
        for u in urls_in_body:
            u = u.rstrip(".,;)")
            if not any(l["url"] == u for l in links):
                links.append({"label": re.match(r"https?://([^/]+)", u).group(1), "url": u, "kind": "publisher"})
        venue = field(b, "journal") or field(b, "booktitle")
        g = gost(kind, b) if b else ""
        if cr and cr.get("doi") and not field(b, "doi"):
            g = g.rstrip() + f" — DOI {cr['doi']}."
        works[code] = dict(id=code, authors=[pid], year=int(y) if str(y).isdigit() else None, type=typ, title=title,
                           venue=venue, gost=g, istina=f"https://istina.msu.ru{path}", istinaKind="record",
                           links=links, level=level_of(title))
        order.append(code)

NOTES = {
    "baturin-diss-1992": "В ИСТИНА заглавие указано как «Компьютерное право», год 1992. В перечне диссертаций кафедры ЮНЕСКО НИУ ВШЭ: «Теоретические проблемы компьютерного права», 1991. Сверить с экземпляром РГБ.",
    "streltsov-diss-2004": "В ИСТИНА в поле заглавия указано наименование специальности. По перечню кафедры ЮНЕСКО НИУ ВШЭ заглавие: «Теоретические и методологические основы правового обеспечения информационной безопасности России». Сверить с экземпляром РГБ.",
}
for k, v in NOTES.items():
    if k in works:
        works[k]["verify"] = v
if "streltsov-diss-2004" in works:
    works["streltsov-diss-2004"]["level"] = 2
out = [works[k] for k in order]
from collections import Counter
print("works", len(out))
print("levels", sorted(Counter(w["level"] for w in out).items()))
print("types", Counter(w["type"] for w in out))
print("with direct links", sum(1 for w in out if w["links"]), "doi", sum(1 for w in out if any(l["kind"].startswith("doi") for l in w["links"])))
print("multi-author dept", sum(1 for w in out if len(w["authors"]) > 1))
with open(os.path.join(HERE, "..", "data", "works.js"), "w", encoding="utf-8") as fh:
    fh.write("/* Выгрузка из ИСТИНА МГУ, собрана build/build.py. Не править вручную. */\nwindow.KPIB_ISTINA = ")
    fh.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    fh.write(";\n")
