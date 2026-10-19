#!/usr/bin/env python3
"""Top 20 institutional shareholders for every stock, with the change over the last 6 months.

Source: SEC Form 13F data sets (https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets),
the flattened XML of every 13F-HR filed by US institutional managers with over $100M in 13(f) securities.

For the latest quarter whose filings are published (e.g. Jun 30) and the two before it (Mar 31, Dec 31,
so the comparison spans 6 months), the script sums each manager's shares in the stock (common shares
only: no options, no bonds), ranks managers by shares at the latest quarter and writes <dir>/holders.json.

Usage:  python3 scripts/fetch-holders.py            (all stocks)
        python3 scripts/fetch-holders.py mu nvda    (some stocks)
Env:    SEC_USER_AGENT  the User-Agent sent to sec.gov, which asks for a name and contact
        HOLDERS_CACHE   folder for the downloaded zips (default .cache/13f)

Limits worth knowing: 13F covers US-regulated managers only, so founders, parent companies, foreign
holders (e.g. SoftBank in Arm) and retail are not in it. Filings arrive up to 45 days after quarter end.
"""
import csv, io, json, os, re, sys, time, zipfile, datetime as dt, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = pathlib.Path(os.environ.get("HOLDERS_CACHE", ROOT / ".cache" / "13f"))
UA = os.environ.get("SEC_USER_AGENT") or "stock-dashboard/1.0 (github.com/angcharles/stock-dashboard)"
INDEX = "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets"
TOP = 20
csv.field_size_limit(10**9)

# dir, ticker, CUSIP (None = find it by name), issuer-name pattern (checks the CUSIP, or finds it)
STOCKS = [
    ("arm", "ARM", "042068205", r"^ARM HOLDINGS"),
    ("tesla", "TSLA", "88160R101", r"^TESLA"),
    ("sndk", "SNDK", None, r"^SANDISK"),
    ("intc", "INTC", "458140100", r"^INTEL CORP"),
    ("spcx", "SPCX", None, r"SPACE EXPLORATION|SPACEX"),
    ("mu", "MU", "595112103", r"^MICRON TECH"),
    ("lite", "LITE", "55024U109", r"^LUMENTUM"),
    ("cohr", "COHR", "19247G107", r"^COHERENT"),
    ("googl", "GOOGL", "02079K305", r"^ALPHABET"),
    ("meta", "META", "30303M102", r"^META PLATFORMS"),
    ("nvda", "NVDA", "67066G104", r"^NVIDIA"),
    ("zs", "ZS", "98980G102", r"^ZSCALER"),
    ("be", "BE", "093712107", r"^BLOOM ENERGY"),
    ("aaoi", "AAOI", "03823U102", r"^APPLIED OPTOELECTRONICS"),
    ("amd", "AMD", "007903107", r"^ADVANCED MICRO DEVICES"),
    ("mp", "MP", "553368101", r"^MP MATERIALS"),
    ("amzn", "AMZN", "023135106", r"^AMAZON"),
    ("msft", "MSFT", "594918104", r"^MICROSOFT"),
    ("mrvl", "MRVL", "573874104", r"^MARVELL"),
    ("skhy", "SKHY", None, r"^SK HYNIX"),
    ("tsm", "TSM", "874039100", r"^TAIWAN SEMICONDUCTOR"),
    ("avgo", "AVGO", "11135F101", r"^BROADCOM"),
    ("rok", "ROK", "773903109", r"^ROCKWELL AUTOMATION"),
    ("amat", "AMAT", "038222105", r"^APPLIED MATLS|^APPLIED MATERIALS"),
    ("asml", "ASML", "N07059210", r"^ASML HOLDING"),
    ("pltr", "PLTR", "69608A108", r"^PALANTIR"),
    ("glw", "GLW", "219350105", r"^CORNING INC"),
    ("ter", "TER", "880770102", r"^TERADYNE"),
]

# words kept in capitals when tidying manager names
CAPS = {"LLC", "LP", "LLP", "L.P.", "LTD", "PLC", "AG", "SA", "NV", "N.A.", "NA", "AB", "ASA", "AS", "SE", "UBS", "BNP", "BNY",
        "FMR", "TIAA", "CPP", "UK", "US", "USA", "II", "III", "IV", "AQR", "D.E.", "DE", "PNC", "RBC", "TD", "HSBC",
        "BMO", "CIBC", "ING", "AXA", "DWS", "AMP", "IFM", "ETF", "SSGA", "GQG", "T.", "KKR", "BAMCO", "AGF", "NFJ", "JNL", "PGIM", "SG", "L.L.C.", "LLC.", "ABN", "AMRO", "CIBC", "MUFG", "SMBC", "NN", "DZ", "PIMCO", "ARK", "MFS", "TCW", "UMB"}
SPECIAL = {"BLACKROCK": "BlackRock", "JPMORGAN": "JPMorgan", "MORGAN": "Morgan", "GOLDMAN": "Goldman", "NORGES": "Norges",
           "MCKINSEY": "McKinsey", "MACKENZIE": "Mackenzie", "INVESCO": "Invesco", "WELLINGTON": "Wellington"}

# managers that file as several entities (or switched entities) are combined, so a reorganisation
# does not look like a sale plus a new buyer. Vanguard moved from one filer (Vanguard Group Inc.)
# to several (Capital Management, Portfolio Management, Fiduciary Trust) in 2026.
FAMILIES = [(re.compile(r"^VANGUARD\b", re.I), "fam-vanguard", "Vanguard (all filing entities)")]
MIN_MANAGERS = 25  # a CUSIP found by name needs at least this many holders, or it is likely the wrong listing


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url, dest=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                if dest is None:
                    return r.read().decode("utf-8", "replace")
                tmp = dest.with_suffix(".part")
                with open(tmp, "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                tmp.rename(dest)
                return dest
        except Exception as e:  # noqa: BLE001
            log(f"  retry {attempt + 1} for {url}: {e}")
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f"could not download {url}")


def pdate(s):
    return dt.datetime.strptime(s.strip().title(), "%d-%b-%Y").date()


def qend(d):
    """Quarter end on or before d."""
    m = (d.month - 1) // 3 * 3
    if m == 0:
        return dt.date(d.year - 1, 12, 31)
    return dt.date(d.year, m, 30 if m in (6, 9) else 31)


def prev_q(q):
    return qend(q.replace(day=1) - dt.timedelta(days=1))


def windows():
    """Published data sets as {(start, end): url}."""
    html = get(INDEX)
    out = {}
    for href in set(re.findall(r'href="([^"]+?_form13f\.zip)"', html)):
        m = re.search(r"(\d{2}[a-z]{3}\d{4})-(\d{2}[a-z]{3}\d{4})_form13f\.zip$", href)
        if not m:
            continue
        a, b = (dt.datetime.strptime(x, "%d%b%Y").date() for x in m.groups())
        out[(a, b)] = href if href.startswith("http") else "https://www.sec.gov" + href
    if not out:
        raise SystemExit("no 13F data sets found on " + INDEX)
    return out


def window_for(q, W):
    """The data set holding most filings for quarter q: the one covering the 45-day deadline."""
    due = q + dt.timedelta(days=45)
    for (a, b), url in W.items():
        if a <= due <= b:
            return (a, b), url
    return None, None


def tidy(name):
    words = []
    for w in name.strip().split():
        u = w.upper().rstrip(",")
        if u in SPECIAL:
            words.append(SPECIAL[u] + ("," if w.endswith(",") else ""))
        elif u in CAPS:
            words.append(w.upper())
        elif w.isupper() or w.islower():
            words.append("-".join(x.capitalize() for x in w.split("-")))
        else:
            words.append(w)
    s = re.sub(r"\s*/[A-Za-z]{2,4}/?\s*$", "", " ".join(words))
    s = re.sub(r"^UBS Am,? A Distinct Business Unit Of .*$", "UBS Asset Management Americas", s, flags=re.I)
    s = re.sub(r",? A Distinct Business Unit Of .*$", "", s, flags=re.I)
    s = re.sub(r"^Price T\.? Rowe", "T. Rowe Price", s)
    s = re.sub(r"(?<=\S) (Of|And|The|For|De|Du|La)\b", lambda m: " " + m.group(1).lower(), s)
    s = re.sub(r"\bInc\b(?!\.)", "Inc.", s)
    return s.replace(" ,", ",")


def load_quarter(q, url, want_cusips, name_res):
    """Rows of the chosen filings for quarter q: {cik: shares} per CUSIP, plus manager names and filer set."""
    a = url.rsplit("/", 1)[-1]
    CACHE.mkdir(parents=True, exist_ok=True)
    zp = CACHE / a
    if not zp.exists():
        log(f"  downloading {a}")
        get(url, zp)
    log(f"  reading {a} for {q}")
    z = zipfile.ZipFile(zp)
    names = {n.upper().rsplit("/", 1)[-1]: n for n in z.namelist()}

    def rows(fname):
        with z.open(names[fname]) as f:
            yield from csv.DictReader(io.TextIOWrapper(f, "utf-8", "replace"), delimiter="\t", quoting=csv.QUOTE_NONE)

    sub = {}
    for r in rows("SUBMISSION.TSV"):
        if r["SUBMISSIONTYPE"] not in ("13F-HR", "13F-HR/A"):
            continue
        try:
            if pdate(r["PERIODOFREPORT"]) != q:
                continue
        except ValueError:
            continue
        sub[r["ACCESSION_NUMBER"]] = {"cik": r["CIK"].lstrip("0"), "filed": pdate(r["FILING_DATE"]), "type": r["SUBMISSIONTYPE"]}
    for r in rows("COVERPAGE.TSV"):
        s = sub.get(r["ACCESSION_NUMBER"])
        if s:
            s["amend"] = (r.get("ISAMENDMENT") or "").upper() == "Y"
            s["atype"] = (r.get("AMENDMENTTYPE") or "").upper()
            s["name"] = r.get("FILINGMANAGER_NAME") or ""

    # which filings count for each manager: the latest full report (original or restatement),
    # plus any "new holdings" amendments filed after it
    by = {}
    for acc, s in sub.items():
        by.setdefault(s["cik"], []).append((s["filed"], acc, s))
    use, mgr = set(), {}
    for cik, L in by.items():
        L.sort(key=lambda x: (x[0], x[1]))
        full = [x for x in L if not x[2].get("amend") or "RESTATE" in x[2].get("atype", "")]
        base = full[-1] if full else L[-1]
        use.add(base[1])
        use.update(x[1] for x in L if x[2].get("amend") and "NEW" in x[2].get("atype", "") and x[0] >= base[0])
        mgr[cik] = base[2].get("name") or mgr.get(cik, "")

    held = {}  # cusip -> {cik: [shares, value]}
    issuer = {}  # cusip -> {name: count}
    pats = [re.compile(p) for p in name_res]
    for r in rows("INFOTABLE.TSV"):
        acc = r["ACCESSION_NUMBER"]
        if acc not in use:
            continue
        if (r.get("PUTCALL") or "").strip() or (r.get("SSHPRNAMTTYPE") or "").strip().upper() != "SH":
            continue
        c = r["CUSIP"].strip().upper()
        nm = (r.get("NAMEOFISSUER") or "").strip().upper()
        if c not in want_cusips and not any(p.search(nm) for p in pats):
            continue
        try:
            sh = float(r["SSHPRNAMT"] or 0)
            val = float(r["VALUE"] or 0)
        except ValueError:
            continue
        cik = sub[acc]["cik"]
        h = held.setdefault(c, {}).setdefault(cik, [0.0, 0.0])
        h[0] += sh
        h[1] += val
        issuer.setdefault(c, {}).setdefault(nm, 0)
        issuer[c][nm] += 1
    # combine manager families
    fam = {}
    for cik, nm in mgr.items():
        for rx, key, label in FAMILIES:
            if rx.search(nm or ""):
                fam[cik] = (key, label)
    if fam:
        for c, H in held.items():
            for cik in [k for k in H if k in fam]:
                key = fam[cik][0]
                a = H.pop(cik)
                b = H.setdefault(key, [0.0, 0.0])
                b[0] += a[0]
                b[1] += a[1]
        for cik, (key, label) in fam.items():
            mgr[key] = label
    filers = set(by) | {fam[c][0] for c in by if c in fam}
    return {"held": held, "issuer": issuer, "mgr": mgr, "filers": filers}


def main():
    pick = [a.lower() for a in sys.argv[1:]]
    stocks = [s for s in STOCKS if not pick or s[0] in pick or s[1].lower() in pick]
    W = windows()
    # latest quarter whose main data set is out
    q = qend(dt.date.today())
    while window_for(q, W)[0] is None:
        q = prev_q(q)
    Q = [prev_q(prev_q(q)), prev_q(q), q]  # 6 months ago, 3 months ago, latest
    log("quarters:", [str(x) for x in Q])
    want = {s[2] for s in stocks if s[2]}
    name_res = [s[3] for s in stocks]
    data = []
    for x in Q:
        (a, b), url = window_for(x, W)
        if not url:
            raise SystemExit(f"no data set for {x}")
        d = load_quarter(x, url, want, name_res)
        d["window"] = (a, b)
        data.append(d)

    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for dirn, tick, cusip, pat in stocks:
        rx = re.compile(pat)
        latest = data[-1]
        # check or find the CUSIP from issuer names in the latest quarter
        cands = {c: sum(n for nm, n in names.items() if rx.search(nm)) for c, names in latest["issuer"].items()}
        cands = {c: n for c, n in cands.items() if n}
        if cusip and cusip not in latest["held"] and cands:
            log(f"  {tick}: CUSIP {cusip} not found; using name match")
            cusip = None
        if not cusip and cands:
            cusip = max(cands, key=lambda c: (len(latest["held"].get(c, {})), cands[c]))
            if len(latest["held"].get(cusip, {})) < MIN_MANAGERS:
                log(f"  {tick}: only {len(latest['held'].get(cusip, {}))} managers hold {cusip}; treating as not yet held")
                cusip = None
        iss = ""
        if cusip and cusip in latest["issuer"]:
            iss = max(latest["issuer"][cusip].items(), key=lambda kv: kv[1])[0]
            if not rx.search(iss):
                log(f"  WARNING {tick}: CUSIP {cusip} is filed as '{iss}'")
        out = {"ticker": tick, "cusip": cusip, "issuer": iss, "quarters": [str(x) for x in Q], "generated": now,
               "filed_through": [str(d["window"][1]) for d in data], "source": "SEC Form 13F data sets",
               "holders": [], "dropped": [], "totals": None}
        if cusip and cusip in latest["held"]:
            per = [d["held"].get(cusip, {}) for d in data]

            def series(cik):
                return [round(per[i][cik][0]) if cik in per[i] else (0 if cik in data[i]["filers"] else None) for i in range(3)]

            def name(cik):
                if cik.startswith("fam-"):
                    return next(lab for _, k, lab in FAMILIES if k == cik)
                for d in reversed(data):
                    if d["mgr"].get(cik):
                        return tidy(d["mgr"][cik])
                return "CIK " + cik

            rank = sorted(per[2], key=lambda c: -per[2][c][0])[:TOP]
            out["holders"] = [{"name": name(c), "cik": c, "sh": series(c), "val": round(per[2][c][1])} for c in rank]
            first = [c for c in sorted(per[0], key=lambda c: -per[0][c][0])[:TOP] if c not in rank]
            out["dropped"] = [{"name": name(c), "cik": c, "sh": series(c)} for c in first]
            out["totals"] = {"filers": [len(p) for p in per], "sh": [round(sum(v[0] for v in p.values())) for p in per]}
            log(f"  {tick}: {iss} {cusip} · {len(per[2])} managers · top: {out['holders'][0]['name']}")
        else:
            log(f"  {tick}: no 13F holdings found for {Q[-1]}")
        dest = ROOT / dirn / "holders.json"
        try:  # keep the file untouched when only the timestamp would change
            prev = json.loads(dest.read_text())
            if {**prev, "generated": now} == out:
                continue
        except (OSError, ValueError):
            pass
        dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
