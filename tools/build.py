"""Собирает data/works.js из выгрузки ИСТИНА (списки + BibTeX + найденные DOI)."""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "istina")
os.chdir(SRC)

CHECKED = "03.11.2026"
PEOPLE = {"baturin": "1276994", "zueva": "3172534", "morozov": "26759990", "streltsov": "2826393", "sapronov": "324211318"}
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


# ---------- уровни (орбиты) ----------
# Порядок проверки: от самых узнаваемых признаков к общим; первое совпадение определяет орбиту.
RULES = [
    # Орбиты по паспорту научной специальности «Информационное право» (29 направлений) и орбита 30 для работ вне паспорта.
    (20, r"персональн|биометр|\bданн(ых|ые|ым|ыми)\b о|big data|больш\w* данн|идентификац\w* (лиц|физическ|граждан)"),
    (22, r"архив|библиотек"),
    (21, r"\bсми\b|средств\w* массов|массов\w* информац|журналист|редакци|медиа|телевиден|печат(и|ь)\b|пресс|цензур|гласност|нейроцензур"),
    (24, r"интеллектуальн\w* собственност|авторск|патент|исключительн\w* прав|товарн\w* знак|смежн\w* прав"),
    (23, r"документ|электронн\w* подпис|цифров\w* подпис|эцп|документооборот|реестр"),
    (26, r"ответственност|правонарушени|преступлен|уголовн|мошенничеств|наказани|санкци|административн\w* (правонаруш|ответств)"),
    (28, r"международн\w* информационн\w* безопасн|информационн\w* (войн|оружи|противоборств)|кибервойн|кибератак|кибероружи|гибридн\w* войн"),
    (19, r"информационн\w* безопасност|безопасност\w* информац|защит\w* информац|кибербезопасн|киберугроз|кибер|шифрован|криптограф|угроз"),
    (27, r"\bснг\b|еаэс|таможенн\w* союз|одкб|брикс|\bшос\b|международн\w* сотруднич|союзн\w* государств|интеграц"),
    (29, r"зарубеж|иностран|опыт|имплемент|китай|китайск|казахстан|беларус|белорусс|европ|\bсша\b|америк|германи|франци|великобритан|gdpr|countr|foreign|international|international"),
    (4,  r"электронн\w* (правительств|государств|правосуди|демократ|управлен)|государственн\w* (управлен|контрол|аудит)|публичн\w* власт|общественн\w* контрол|органов власт|e-government|smart-контрол|смарт-контрол"),
    (25, r"экономик|экономическ|электронн\w* коммерц|e-commerce|рынок|рынк|финанс|бюджет|банк|крипто|цифров\w* рубл|рубл|платеж|налог|закуп|реклам|бизнес|предприним|страхов|ценн\w* бумаг|инвестиц|аудит|казначейств|отчетност|economic|financial|market"),
    (17, r"интернет|\bсвяз[ьи]\b|телекоммуникац|\bсет[ьиях]\b|социальн\w* сет|облачн|онлайн|online|on-line|метавселен|виртуальн|киберпространств|цифров\w* платформ|cloud|virtual"),
    (18, r"информатизац|информационн\w* систем|автоматизирован|эвм|компьютер|вычислительн|искусственн\w* интеллект|\bии\b|нейросет|алгоритм|робот|программ|цифровизац|цифров\w* трансформац|информационно-аналитическ|ситуационн|artificial|\bai\b|computer"),
    (16, r"тайн|конфиденциальн|частн\w* жизн|приватност|неприкосновенност|право на информацию|доступ\w* к информаци|открыт\w* (данн|информац)|общедоступн|privacy"),
    (15, r"правов\w* режим|информационн\w* ресурс|режим\w* информац"),
    (5,  r"\bуслуг|госуслуг"),
    (3,  r"прав\w* (и свобод|человека|граждан)|свобод\w* (слова|информац|мысл)|информационн\w* обществ|информационн\w* политик|human rights|information society"),
    (6,  r"юрисдикц|трансграничн|саморегулир|пределы|границ\w* (регулир|правов)|суверенитет"),
    (7,  r"систем\w* (российского )?права|отрасл\w* права|взаимосвяз"),
    (8,  r"наук\w* информационн|становлени|истори\w* (информационн|компьютерн|правов)|правов\w* информатик|компьютерн\w* прав|кибернетик|юридическ\w* наук"),
    (9,  r"методолог|методическ|метод\b|подход"),
    (10, r"\bнорм[аыу]?\b|правов\w* норм|правоприменени|толковани"),
    (11, r"законодательств|закон\b|закона|законов|законопроект|кодекс|кодификац|модельн|источник|конституц|федеральн\w* закон|комментари"),
    (12, r"принцип"),
    (13, r"правоотношени|отношени\w* в (информационн|цифров)"),
    (14, r"субъект|посредник|оператор|правов\w* статус|провайдер|платформ"),
    (1,  r"информационн\w* прав|предмет|понятийн|понят\w* информ"),
    (2,  r"информаци|информационн\w* (сред|пространств|сфер|технолог)|данн(ых|ые)|цифров\w* сред|технолог|information|data"),
]


def level_of(text):
    t = text.lower().replace("ё", "е")
    for lvl, rx in RULES:
        if re.search(rx, t):
            return lvl
    return 30


TOPICS = [
  ("space",   "Космонавтика и космическое право", "#b78ce0", r"космо|космич|орбит|ракет|спутник|гагарин|космонавт|астронав|\bмкс\b|салют|\bмир\b|луну|аполлон|space|astronaut|rocket|lunar|salyut"),
  ("ai",      "Искусственный интеллект и алгоритмы", "#e0b34a", r"искусственн\w* интеллект|\bии\b|ии[‑-]|нейро|алгоритм|робот|machine learning|artificial|\bai\b|нейросет|генератив|chatgpt|кибернетич"),
  ("pd",      "Персональные данные и тайна", "#f08a8a", r"персональн\w* данн|тайн|конфиденциальн|приватн|privacy|личн\w* жизн"),
  ("mib",     "Международная информационная безопасность", "#7fcadb", r"международн\w* информационн\w* безопасн|международн\w* прав|киберпространств|суверенитет|икт[‑-]сред|\bоон\b|\bшос\b|international information security|кибервойн"),
  ("ib",      "Информационная безопасность и киберугрозы", "#5f84e0", r"информационн\w* безопасн|кибер|компьютерн\w* преступ|защит\w* информац|критическ\w* информационн|угроз|security|cyber|фейк|недостоверн"),
  ("audit",   "Государственный аудит и финансовый контроль", "#e8743b", r"аудит|финансов\w* контрол|контроллинг|смарт-контрол|счетн\w* палат|казначейств|комплаенс|государственн\w* контрол"),
  ("econsec", "Экономическая безопасность и правоохрана", "#d4573f", r"экономическ\w* безопасн|мошенничеств|легализац|контрабанд|правоохранит|преступн|теневой|теневая|офшор|отток капитал"),
  ("migr",    "Миграция и демография", "#9bc46a", r"миграц|мигрант|демограф|населени|старени|иммиграц"),
  ("digecon", "Экономика, цифровая экономика и финансы", "#cfa57a", r"экономик|экономическ\w* теори|economy|ekonom|безработиц|задолженност|туризм|e-commerce|облачн|энерг|energy|капитал|цифров\w* экономик|цифров\w* рубл|крипто|финанс|банк|налог|бюджет|ценн\w* бумаг|краудфанд|рынок|рынк|платформ|инвестиц|economic|financial|banking|market"),
  ("media",   "СМИ, гласность и цензура", "#e6a0c8", r"\bсми\b|массов\w* информац|гласност|glasnost|цензур|журналист|медиа|пресс|press|omnimedia|омнимедиа|телевиден|книг|кинорецензи"),
  ("edu",     "Образование и подготовка кадров", "#8fd3b0", r"образован|обучен|учебн|магистер|студент|аспирант|кафедр|университет|подготовк\w* кадр|профессиональн\w* компетенц|proctoring"),
  ("infolaw", "Информационное и компьютерное право", "#a3acb8", r"информационн\w* прав|компьютерн\w* прав|правов\w* информати|правов\w* информац|свод\w* закон|регистр|мониторинг\w* правопримен|электронн\w* документ|электронн\w* подпис|интернет|документ|цифров\w* прав|computer law|телекоммуникац|компьютер|эвм|вычислительн|изобретен|digital humanities"),
  ("const",   "Конституция, государство и власть", "#e9d391", r"конституц|союзн\w* договор|ссср|рсфср|президент|ельцин|государственност|государственн\w* управлен|политик|власт|закон|законодат|бюрократ|lawmaking|lawyers|юрист|уголовн|политическ|political|ново-огарев|novo-ogarevo|soviet|urss"),
  ("culture", "Литература, искусство и культура", "#f2c27b", r"кэрролл|литератур|искусств|поэз|гамлет|музе|эссе|баллада|роман|фотограф"),
  ("vr",      "Виртуальные среды, 3D и цифровая Земля", "#6fd6c4", r"виртуальн|3d|3-d|цифров\w* земл|digital earth|ситуационн\w* (центр|анализ)|информационно-аналитическ|laser scanning|lightcraft|impulsar|моделировани|virtual"),
  ("intl",    "Международные отношения и мировая политика", "#9fb4ff", r"международн\w* отношен|миропоряд|европейск|гренланд|дипломат|турци|кеннан|kennan|америк|переговор|глобализац|китай|china|world order"),
  ("science", "История и философия науки", "#c7b8ff", r"рефлексивн|шухов|инженер|наук[аиуе]\b|наукой|истори|академи\w* наук|наукометр|науки и техники|научн\w* мысл|наук\w* и техник|естествозн|иивт|ииет|физик|математ|вернадск|междисциплин|философ|эконофизик|бифуркац|турбулентн|учен\w*\b"),
]


def topics_of(text):
    t = text.lower().replace("ё", "е")
    return [tid for tid, name, color, rx in TOPICS if re.search(rx, t)]


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
            fam_name = {"baturin": "Батурин, Ю.М.", "zueva": "Зуева, А.С.", "morozov": "Морозов, А.В.", "streltsov": "Стрельцов, А.А.", "sapronov": "Сапронов, Д.Ю."}[pid]
            full_name = {"baturin": "Батурин Юрий Михайлович", "zueva": "Зуева Анна Сергеевна", "morozov": "Морозов Андрей Витальевич", "streltsov": "Стрельцов Анатолий Александрович", "sapronov": "Сапронов Дмитрий Юрьевич"}[pid]
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
# Явные ошибки ввода в ИСТИНА: год 1922 при публикации в сборнике 2022 года
for k in ("a513076343", "a513076257"):
    if k in works and works[k]["year"] == 1922:
        works[k]["year"] = 2022
        works[k]["verify"] = "В ИСТИНА указан 1922 год; по изданию (сборник 2022 года) это опечатка, на карте работа отнесена к 2022 году. Сверить запись в ИСТИНА."
for k, v in NOTES.items():
    if k in works:
        works[k]["verify"] = v
if "streltsov-diss-2004" in works:
    works["streltsov-diss-2004"]["level"] = 19
# Соавторы из числа сотрудников по полю author BibTeX (запись может отсутствовать в профиле соавтора)
BIBNAME = {"baturin": "Батурин, Ю. М.", "zueva": "Зуева, А. С.", "morozov": "Морозов, А. В.", "streltsov": "Стрельцов, А. А.", "sapronov": "Сапронов, Д. Ю."}
for k, w in works.items():
    b = res.get(k, {}).get("bib", "")
    au = re.search(r"author\s*=\s*\{(.*?)\},\n", b)
    if not au:
        continue
    for pid, nm in BIBNAME.items():
        if nm in au.group(1) and pid not in w["authors"]:
            w["authors"].append(pid)
# PDF в архиве конференции «Ломоносов»
for w in works.values():
    for l in w["links"]:
        if "lomonosov-msu.ru/archive" in l["url"] and l["url"].endswith(".pdf"):
            l["kind"] = "pdf"; l["label"] = "PDF · архив конференции «Ломоносов»"
    w["links"].sort(key=lambda l: 0 if l["kind"] == "pdf" else 1)
if "sapronov-diss-2026" in works:
    works["sapronov-diss-2026"]["links"].append({"label": "Диссертационный совет МГУ: сведения о научном руководителе", "url": "https://dissovet.msu.ru/file/dissovet-docs/eb496304-84e1-11f1-9bf7-005056b96f20", "kind": "publisher"})
if "a792817220" in works:
    works["a792817220"]["verify"] = "В ИСТИНА к заглавию ошибочно присоединены слова «университета. Серия 26: Государственный аудит»; на карте заглавие дано без них. Сверить с выпуском журнала."
# Полные тексты: КиберЛенинка, открытый доступ по DOI (OpenAlex), файлы в ИСТИНА
ft = json.load(open("fulltext.json")) if os.path.exists("fulltext.json") else {}
for k, v in ft.get("cyberleninka", {}).items():
    if k in works:
        base = "https://cyberleninka.ru" + v["link"]
        works[k]["links"].insert(0, {"label": "PDF · КиберЛенинка", "url": base + "/pdf", "kind": "pdf"})
        works[k]["links"].insert(1, {"label": "Статья на КиберЛенинке", "url": base, "kind": "fulltext"})
for k, v in ft.get("openalex", {}).items():
    if k in works and v.get("pdf") and not any(l["url"] == v["pdf"] for l in works[k]["links"]):
        works[k]["links"].insert(0, {"label": "PDF · открытый доступ", "url": v["pdf"], "kind": "pdf"})
for k in ft.get("istina_files", {}):
    if k in works:
        works[k]["istinaFile"] = True
for w in works.values():
    w["topics"] = topics_of(w["title"] + " " + (w.get("venue") or "")) or ["other"]
out = [works[k] for k in order]
from collections import Counter
print("works", len(out))
print("levels", sorted(Counter(w["level"] for w in out).items()))
print("types", Counter(w["type"] for w in out))
print("with direct links", sum(1 for w in out if w["links"]), "doi", sum(1 for w in out if any(l["kind"].startswith("doi") for l in w["links"])))
print("multi-author dept", sum(1 for w in out if len(w["authors"]) > 1))
from collections import Counter as _C
print("topics", sorted(_C(t for w in out for t in w["topics"]).items(), key=lambda x: -x[1]))
print("primary", sorted(_C(w["topics"][0] for w in out).items(), key=lambda x: -x[1]))
print("pdf", sum(1 for w in out if any(l["kind"] == "pdf" for l in w["links"])), "istina files", sum(1 for w in out if w.get("istinaFile")))
with open(os.path.join(HERE, "..", "data", "works.js"), "w", encoding="utf-8") as fh:
    fh.write("/* Выгрузка из ИСТИНА МГУ, собрана tools/build.py. Не править вручную. */\nwindow.KPIB_ISTINA = ")
    fh.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    fh.write(";\nwindow.KPIB_TOPICS = ")
    fh.write(json.dumps([{"id": t[0], "name": t[1], "color": t[2]} for t in TOPICS] + [{"id": "other", "name": "Прочие темы", "color": "#8a9099"}], ensure_ascii=False))
    fh.write(";\n")
