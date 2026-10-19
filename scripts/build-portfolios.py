#!/usr/bin/env python3
"""Builds data/portfolios-perf.json for the Pelosi, Trump, Druckenmiller and Thiel panels on the main page.

Inputs
  data/portfolios.json         holdings, weights, trades (edited when a new filing lands)
  <pricedir>/<TICKER>/history.json  daily closes written by scripts/fetch-quote.mjs (include SPY)
Output
  data/portfolios-perf.json    daily performance, per-holding prices/returns, and a check for new filings

Pelosi, Trump (MODELS): model portfolios with fixed estimated weights, rebalanced daily (sum of weight x daily return).
Druckenmiller, Thiel (F13): the 13F share counts (call rows at their underlying shares) marked to each day's close
since the quarter end.
New-filing check: SEC EDGAR submissions (each 13F filer's latest 13F-HR) and the House Clerk's yearly
financial-disclosure index (Pelosi periodic transaction reports). Network errors are recorded, not fatal.

Usage: python3 scripts/build-portfolios.py <pricedir> [--no-filings]
  --no-filings  skip the SEC / House Clerk check and keep the filing flags from the existing
                data/portfolios-perf.json (used by the 10-minute live refresh in deploy.yml)
"""
import io, json, os, sys, time, urllib.request, zipfile, datetime as dt
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
NO_FILINGS = "--no-filings" in sys.argv
PRICES = ARGS[0] if ARGS else os.path.join(ROOT, "pf-data")
PERF = os.path.join(ROOT, "data", "portfolios-perf.json")
CFG = json.load(open(os.path.join(ROOT, "data", "portfolios.json")))


def hist(t):
    try:
        h = json.load(open(os.path.join(PRICES, t, "history.json")))
        return dict(zip(h["d"], h["c"])) if h.get("d") else {}
    except Exception:
        return {}


def r(x, n=2):
    return None if x is None else round(x, n)


def pct(a, b):
    return None if a is None or not b else (a / b - 1) * 100


spy = hist("SPY")
if not spy:
    sys.exit("no SPY history")
dates = sorted(spy)
last = dates[-1]
year0 = next((d for d in reversed(dates) if d < f"{last[:4]}-01-01"), dates[0])  # last close of prior year


def series(t):
    """closes aligned to SPY dates, forward-filled; None before the first print."""
    h, out, v = hist(t), [], None
    for d in dates:
        v = h.get(d, v)
        out.append(v)
    return out


def at(s, d):
    """value at (or last before) date d"""
    i = max(i for i, x in enumerate(dates) if x <= d) if dates[0] <= d else 0
    return s[i]


MODELS = [k for k in ("pelosi", "trump") if k in CFG]
F13 = [k for k in ("druck", "thiel") if k in CFG]
S = {t: series(t) for t in {"SPY", *[h[0] for k in MODELS + F13 for h in CFG[k]["holdings"]]}}
spy_s = S["SPY"]
out = {"updated": int(time.time()), "session": last, "missing": []}
# Live state from SPY's quote: REGULAR while the US session is open, so the panels can say "live".
try:
    sq = json.load(open(os.path.join(PRICES, "SPY", "quote.json")))
    out["state"], out["asof"] = sq.get("state"), sq.get("time")
except Exception:
    pass

# ---------- Pelosi, Trump: fixed-weight models ----------
start6 = max(0, len(dates) - 128)


def model(P):
    W = {t: w for t, _, w in P["holdings"]}
    idx, lvl = [], 100.0
    for i, d in enumerate(dates):
        if i:
            num = den = 0.0
            for t, w in W.items():
                a, b = S[t][i - 1], S[t][i]
                if a and b:
                    num += w * (b / a - 1); den += w
            lvl *= 1 + (num / den if den else 0)
        idx.append(lvl)
    filing = P["last_stock_filing"]
    ph = []
    for t, name, w in P["holdings"]:
        s = S[t]
        if s[-1] is None and t not in out["missing"]:
            out["missing"].append(t)
        ph.append({"t": t, "n": name, "w": r(w / sum(W.values()) * 100, 1), "px": r(s[-1]),
                   "d1": r(pct(s[-1], s[-2]) if len(s) > 1 else None), "ytd": r(pct(s[-1], at(s, year0))),
                   "sf": r(pct(s[-1], at(s, filing)))})
    return {
        "dates": dates[start6:], "idx": [r(x, 3) for x in idx[start6:]], "spy": [r(x, 2) for x in spy_s[start6:]],
        "stats": {"d1": r(pct(idx[-1], idx[-2])), "sf": r(pct(idx[-1], at(idx, filing))), "ytd": r(pct(idx[-1], at(idx, year0))),
                  "y1": r(pct(idx[-1], idx[0])),
                  "spy_d1": r(pct(spy_s[-1], spy_s[-2])), "spy_sf": r(pct(spy_s[-1], at(spy_s, filing))),
                  "spy_ytd": r(pct(spy_s[-1], at(spy_s, year0))), "spy_y1": r(pct(spy_s[-1], spy_s[0]))},
        "holdings": ph}


for k in MODELS:
    out[k] = model(CFG[k])

# ---------- Druckenmiller, Thiel: 13F shares marked to market ----------
def thirteen_f(T):
    q = T["period"]
    i0 = max(i for i, d in enumerate(dates) if d <= q)
    val = []
    for i in range(i0, len(dates)):
        tot = 0.0
        for t, _, sh, v13, *_ in T["holdings"]:
            px = S[t][i]
            tot += sh * px if px else v13  # before a first print, hold the filed value
        val.append(tot)
    th, tot_now = [], val[-1]
    for t, name, sh, v13, *kind in T["holdings"]:
        s = S[t]
        px = s[-1]
        if px is None and t not in out["missing"]:
            out["missing"].append(t)
        v = sh * px if px else v13
        th.append({"t": t, "n": name, "sh": sh, **({"call": 1} if kind and kind[0] == "call" else {}), "px": r(px), "v": round(v), "w": r(v / tot_now * 100, 1),
                   "d1": r(pct(s[-1], s[-2])), "sq": r(pct(px, s[i0]) if px and s[i0] else pct(v, v13))})
    th.sort(key=lambda x: -x["v"])
    return {"dates": dates[i0:], "val": [round(x) for x in val], "spy": [r(x) for x in spy_s[i0:]],
            "stats": {"now": round(tot_now), "filed": sum(h[3] for h in T["holdings"]), "sq": r(pct(val[-1], val[0])),
                      "d1": r(pct(val[-1], val[-2])) if len(val) > 1 else None, "spy_sq": r(pct(spy_s[-1], spy_s[i0])),
                      "spy_d1": r(pct(spy_s[-1], spy_s[-2]))},
            "holdings": th}


for k in F13:
    out[k] = thirteen_f(CFG[k])

# ---------- new-filing check ----------
UA = os.environ.get("SEC_USER_AGENT") or "stock-dashboard admin@example.com"


def get(url, ua=UA):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=40) as f:
        return f.read()


fl = {}
if NO_FILINGS:
    try:
        fl = json.load(open(PERF)).get("filings", {})
    except Exception:
        fl = {}
for key in ([] if NO_FILINGS else F13):
    T = CFG[key]
    try:
        j = json.loads(get(f"https://data.sec.gov/submissions/CIK{T['cik']:010d}.json"))
        rc = j["filings"]["recent"]
        k = next(i for i, f in enumerate(rc["form"]) if f.startswith("13F-HR"))
        fl[key] = {"accession": rc["accessionNumber"][k], "form": rc["form"][k], "period": rc["reportDate"][k],
                   "filed": rc["filingDate"][k], "new": rc["accessionNumber"][k] != T["accession"]}
    except Exception as e:
        fl[key] = {"error": str(e)[:200]}
P = CFG["pelosi"]
try:
    if NO_FILINGS:
        raise StopIteration
    yr = int(last[:4])
    ptr = []
    for y in (yr - 1, yr):
        z = zipfile.ZipFile(io.BytesIO(get(f"https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{y}FD.zip",
                                           "Mozilla/5.0 (stock-dashboard)")))
        name = next(n for n in z.namelist() if n.lower().endswith(".xml"))
        for m in ET.fromstring(z.read(name)).iter("Member"):
            g = lambda tag: (m.findtext(tag) or "").strip()
            if g("Last").lower() == "pelosi" and g("FilingType") == "P":
                ptr.append({"id": g("DocID"), "filed": g("FilingDate"), "year": y})
    ptr.sort(key=lambda x: dt.datetime.strptime(x["filed"], "%m/%d/%Y"), reverse=True)
    fl["pelosi"] = {"latest": ptr[:5], "unreviewed": [p for p in ptr if p["year"] >= 2026 and p["id"] not in P["reviewed_filings"]]}
except StopIteration:
    pass
except Exception as e:
    fl["pelosi"] = {"error": str(e)[:200]}
out["filings"] = fl

json.dump(out, open(PERF, "w"), separators=(",", ":"))
print(json.dumps({"session": last, **{k: out[k]["stats"] for k in MODELS + F13},
                  "missing": out["missing"], "filings": fl}, indent=1))
