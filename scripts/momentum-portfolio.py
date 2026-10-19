#!/usr/bin/env python3
"""Momentum portfolio for the Portfolio tab: data/momentum-portfolio.json.

Rules (walk-forward, no look-ahead):
  * Universe: every stock on the dashboard (<folder>/data/history.json).
  * Every Friday close (or the week's last session) each stock is scored on
    risk-adjusted momentum: the average of its 6-month and 3-month returns,
    both skipping the latest week, divided by its 3-month volatility.
  * Eligible: at least 131 sessions of history, close above its 100-day
    average and a positive score (an absolute-momentum filter).
  * Holds the top 5 eligible stocks, weighted for the highest expected Sharpe
    ratio with every weight between 0% and 25%. Expected returns are the
    stocks' annualised momentum shrunk halfway to the group average; risk is
    the 6-month covariance shrunk 30% toward its diagonal. Weights are searched
    on a 2.5% grid, so the answer is exact on that grid.
  * Fewer than 4 eligible stocks: 25% each and the rest in cash (cash earns
    the cash rate below), so the 25% cap always holds.
  * New weights apply from the next session; between rebalances weights drift
    with prices. Trading costs 0.10% of the value traded.
Pure standard library so it runs in the GitHub Action without installs.

Usage: python3 scripts/momentum-portfolio.py [--text]
"""
import json, math, os, random, sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "momentum-portfolio.json")

STOCKS = [  # folder, ticker, name
    ("aaoi", "AAOI", "Applied Optoelectronics"), ("amat", "AMAT", "Applied Materials"),
    ("amd", "AMD", "AMD"), ("amzn", "AMZN", "Amazon"), ("arm", "ARM", "Arm Holdings"),
    ("asml", "ASML", "ASML"), ("avgo", "AVGO", "Broadcom"), ("be", "BE", "Bloom Energy"),
    ("cohr", "COHR", "Coherent"), ("glw", "GLW", "Corning"), ("googl", "GOOGL", "Alphabet"),
    ("intc", "INTC", "Intel"), ("lite", "LITE", "Lumentum"), ("meta", "META", "Meta Platforms"),
    ("mp", "MP", "MP Materials"), ("mrvl", "MRVL", "Marvell Technology"), ("msft", "MSFT", "Microsoft"),
    ("mu", "MU", "Micron Technology"), ("nvda", "NVDA", "NVIDIA"), ("pltr", "PLTR", "Palantir"),
    ("rok", "ROK", "Rockwell Automation"), ("skhy", "SKHY", "SK hynix"), ("sndk", "SNDK", "Sandisk"),
    ("spcx", "SPCX", "SpaceX"), ("ter", "TER", "Teradyne"), ("tesla", "TSLA", "Tesla"),
    ("tsm", "TSM", "TSMC"), ("zs", "ZS", "Zscaler"),
]

N_HOLD, CAP, STEP = 5, 0.25, 0.025
L6, L3, SKIP, VOLW, COVW, SMA = 126, 63, 5, 63, 126, 100
MIN_HIST = L6 + SKIP
COST = 0.0010          # per unit of value traded
CASH_RATE = 0.039      # annual, ~3-month T-bill; also the Sharpe hurdle
SHRINK_MU, SHRINK_COV = 0.5, 0.3
VOL_TARGET = float(os.environ.get("VT", "0.35"))  # annual; scale down to this, never lever up
VT_WIN = int(os.environ.get("VTW", "21"))          # sessions used to forecast the mix's volatility


def load(path):
    try:
        with open(path) as f:
            h = json.load(f)
        return dict(zip(h["d"], h["c"]))
    except (OSError, ValueError, KeyError):
        return None


def stdev(x):
    m = sum(x) / len(x)
    return math.sqrt(sum((v - m) ** 2 for v in x) / (len(x) - 1))


def grid(n, units, cap_units):
    """All integer vectors of length n, each 0..cap_units, summing to units."""
    out = []
    def rec(i, left, cur):
        if i == n - 1:
            if left <= cap_units:
                out.append(cur + [left])
            return
        lo = max(0, left - cap_units * (n - 1 - i))
        for v in range(lo, min(cap_units, left) + 1):
            rec(i + 1, left - v, cur + [v])
    rec(0, units, [])
    return out


GRIDS = {}


def max_sharpe(mu, cov):
    n = len(mu)
    units, cap_u = round(1 / STEP), round(CAP / STEP)
    if n not in GRIDS:
        GRIDS[n] = [[v * STEP for v in g] for g in grid(n, units, cap_u)]
    best, bw = -1e18, None
    for w in GRIDS[n]:
        r = sum(w[i] * mu[i] for i in range(n))
        v = sum(w[i] * w[j] * cov[i][j] for i in range(n) for j in range(n))
        s = (r - CASH_RATE) / math.sqrt(max(v, 1e-12))
        if s > best + 1e-12:
            best, bw = s, w
    return bw


def main():
    px, names = {}, {}
    for folder, tk, name in STOCKS:
        h = load(os.path.join(ROOT, folder, "data", "history.json"))
        if h:
            px[tk], names[tk] = h, (folder, name)
    dates = sorted(set().union(*[set(v) for v in px.values()]))
    # calendar = sessions where most stocks traded (drops stray foreign-holiday rows)
    cnt = {d: sum(d in v for v in px.values()) for d in dates}
    dates = [d for d in dates if cnt[d] >= len(px) * 0.5]
    T = len(dates)
    C = {tk: [v.get(d) for d in dates] for tk, v in px.items()}
    for tk in C:  # forward-fill gaps after a stock's first price
        s, last = C[tk], None
        for i in range(T):
            if s[i] is None:
                s[i] = last
            else:
                last = s[i]
    R = {tk: [None] + [(s[i] / s[i - 1] - 1) if s[i] and s[i - 1] else None for i in range(1, T)] for tk, s in C.items()}
    first = {tk: next(i for i in range(T) if C[tk][i]) for tk in C}

    spy = load(os.path.join(ROOT, "data", "bench", "SPY", "history.json"))

    def week_end(i):
        if i == T - 1:
            return True
        a, b = date.fromisoformat(dates[i]), date.fromisoformat(dates[i + 1])
        return b.isocalendar()[1] != a.isocalendar()[1] or (b - a).days > 3

    def score_all(t):
        rows = []
        for tk in C:
            s = C[tk]
            if t - first[tk] < MIN_HIST or s[t] is None:
                continue
            m6 = s[t - SKIP] / s[t - SKIP - L6] - 1
            m3 = s[t - SKIP] / s[t - SKIP - L3] - 1
            rr = [R[tk][k] for k in range(t - VOLW + 1, t + 1) if R[tk][k] is not None]
            vol = stdev(rr) * math.sqrt(252)
            sma = sum(s[t - SMA + 1:t + 1]) / SMA
            sc = (0.5 * m6 + 0.5 * m3) / vol if vol > 0 else 0
            mu = 0.5 * math.log(1 + m6) * 252 / L6 + 0.5 * math.log(1 + m3) * 252 / L3
            rows.append({"tk": tk, "score": sc, "m6": m6, "m3": m3, "vol": vol, "mu": mu,
                         "above": s[t] > sma, "sma": sma, "close": s[t],
                         "ok": s[t] > sma and sc > 0})
        rows.sort(key=lambda r: -r["score"])
        for i, r in enumerate(rows):
            r["rank"] = i + 1
        return rows

    def target(t, rows):
        pick = [r for r in rows if r["ok"]][:N_HOLD]
        n = len(pick)
        if n == 0:
            return {}, pick
        if n < 4:
            return scale(t, {r["tk"]: CAP for r in pick}), pick
        tks = [r["tk"] for r in pick]
        avg = sum(r["mu"] for r in pick) / n
        mu = [(1 - SHRINK_MU) * r["mu"] + SHRINK_MU * avg for r in pick]
        ret = [[R[tk][k] for k in range(t - COVW + 1, t + 1)] for tk in tks]
        ret = [[v if v is not None else 0.0 for v in x] for x in ret]
        means = [sum(x) / len(x) for x in ret]
        cov = [[sum((ret[i][k] - means[i]) * (ret[j][k] - means[j]) for k in range(COVW)) / (COVW - 1) * 252
                for j in range(n)] for i in range(n)]
        cov = [[cov[i][j] * (1 if i == j else 1 - SHRINK_COV) for j in range(n)] for i in range(n)]
        w = max_sharpe(mu, cov)
        return scale(t, {tks[i]: w[i] for i in range(n) if w[i] > 0}), pick

    cfg = {'vt': VOL_TARGET}

    def scale(t, tw):
        """Volatility target: if the mix's recent volatility is above VOL_TARGET,
        hold proportionally less of every stock and the rest in cash."""
        if cfg['vt'] <= 0 or not tw:
            return tw
        pr = [sum(v * (R[k][i] or 0) for k, v in tw.items()) for i in range(t - VT_WIN + 1, t + 1)]
        fv = stdev(pr) * math.sqrt(252)
        f = min(1.0, cfg['vt'] / fv) if fv > 0 else 1.0
        f = math.floor(f * 20) / 20  # 5% steps to avoid churning on noise
        return {k: v * f for k, v in tw.items()}

    start = max(MIN_HIST, SMA, COVW) + 1
    while start < T and not week_end(start - 1):
        start += 1
    def sim(vt):
        cfg['vt'] = vt
        nav, w, cash = [1.0], {}, 1.0
        rebal, turn_tot = [], 0.0
        contrib = []          # per session: {tk: contribution to the day's return}
        held_w = []           # weights held during each session (start of day)
        t = start - 1
        # first rebalance at start-1 close
        pend = None
        rows = score_all(t)
        tw, pick = target(t, rows)
        pend = (tw, pick, rows)
        for t in range(start, T):
            if pend is not None:
                tw, pick, rows = pend
                tcash = 1 - sum(tw.values())
                traded = sum(abs(tw.get(k, 0) - w.get(k, 0)) for k in set(tw) | set(w)) + abs(tcash - cash)
                traded /= 2
                nav[-1] *= 1 - COST * 2 * traded  # buys + sells
                turn_tot += traded
                rebal.append({"d": dates[t - 1], "w": {k: round(v, 4) for k, v in sorted(tw.items(), key=lambda x: -x[1])},
                              "cash": round(tcash, 4), "turn": round(traded, 4),
                              "cand": [[r["tk"], round(r["score"], 3)] for r in pick]})
                w, cash = dict(tw), tcash
                pend = None
            held_w.append(dict(w))
            day = {k: w[k] * (R[k][t] or 0) for k in w}
            g = sum(day.values()) + cash * cash_d
            contrib.append(day)
            tot = 1 + g
            nav.append(nav[-1] * tot)
            w = {k: w[k] * (1 + (R[k][t] or 0)) / tot for k in w}
            cash = cash * (1 + cash_d) / tot
            if week_end(t) and t < T - 1:
                rows = score_all(t)
                tw, pick = target(t, rows)
                pend = (tw, pick, rows)

        # this close is a Friday: rebalance now, effective next session
        if date.fromisoformat(dates[T - 1]).weekday() == 4:
            rows = score_all(T - 1)
            tw, pick = target(T - 1, rows)
            tcash = 1 - sum(tw.values())
            traded = (sum(abs(tw.get(k, 0) - w.get(k, 0)) for k in set(tw) | set(w)) + abs(tcash - cash)) / 2
            rebal.append({"d": dates[T - 1], "w": {k: round(v, 4) for k, v in sorted(tw.items(), key=lambda x: -x[1])},
                          "cash": round(tcash, 4), "turn": round(traded, 4),
                          "cand": [[r["tk"], round(r["score"], 3)] for r in pick], "pending": True})
        return nav, w, cash, rebal, turn_tot, contrib, held_w

    cash_d = (1 + CASH_RATE) ** (1 / 252) - 1
    out_dates = [dates[start - 1]] + dates[start:T]
    nav_raw = sim(0)[0]
    nav, w, cash, rebal, turn_tot, contrib, held_w = sim(VOL_TARGET)
    pv, _ = target(T - 1, score_all(T - 1))  # what a rebalance at the latest close would hold
    preview = {"d": dates[T - 1], "w": {k: round(v, 4) for k, v in sorted(pv.items(), key=lambda x: -x[1])},
               "cash": round(1 - sum(pv.values()), 4), "pending": bool(rebal[-1].get("pending"))}

    # equal-weight universe benchmark (all stocks with a price, rebalanced daily)
    ew = [1.0]
    for t in range(start, T):
        rr = [R[k][t] for k in C if R[k][t] is not None and t > first[k]]
        ew.append(ew[-1] * (1 + (sum(rr) / len(rr) if rr else 0)))
    spy_nav = None
    if spy:
        base = spy.get(out_dates[0])
        if base:
            spy_nav, last = [], base
            for d in out_dates:
                last = spy.get(d, last)
                spy_nav.append(last / base)

    def dd_series(v):
        pk, out = v[0], []
        for x in v:
            pk = max(pk, x)
            out.append(x / pk - 1)
        return out

    def stats(v):
        rets = [v[i] / v[i - 1] - 1 for i in range(1, len(v))]
        n = len(rets)
        yrs = n / 252
        cagr = v[-1] ** (1 / yrs) - 1 if yrs > 0 else 0
        vol = stdev(rets) * math.sqrt(252)
        ex = [r - cash_d for r in rets]
        sharpe = (sum(ex) / n * 252) / vol if vol else 0
        down = math.sqrt(sum(min(r, 0) ** 2 for r in ex) / n) * math.sqrt(252)
        sortino = (sum(ex) / n * 252) / down if down else 0
        dd = dd_series(v)
        mdd = min(dd)
        return {"total": v[-1] - 1, "cagr": cagr, "vol": vol, "sharpe": sharpe, "sortino": sortino,
                "mdd": mdd, "calmar": cagr / -mdd if mdd < 0 else None,
                "best_day": max(rets), "worst_day": min(rets),
                "pos_weeks": None}

    def episodes(v, k=5):
        eps, i, n = [], 0, len(v)
        pk_i = 0
        while i < n:
            if v[i] >= v[pk_i]:
                pk_i = i
                i += 1
                continue
            # in drawdown from pk_i
            tr_i, j = i, i
            while j < n and v[j] < v[pk_i]:
                if v[j] < v[tr_i]:
                    tr_i = j
                j += 1
            rec = j if j < n else None
            eps.append({"peak": pk_i, "trough": tr_i, "rec": rec, "depth": v[tr_i] / v[pk_i] - 1})
            if rec is None:
                break
            pk_i, i = j, j + 1
        eps.sort(key=lambda e: e["depth"])
        return eps[:k]

    S = stats(nav)
    wk = [nav[i] for i in range(len(out_dates)) if i == 0 or week_end(dates.index(out_dates[i]))]
    S["pos_weeks"] = sum(wk[i] > wk[i - 1] for i in range(1, len(wk))) / max(1, len(wk) - 1)
    S["turnover_yr"] = turn_tot / ((len(nav) - 1) / 252)
    # beta / correlation vs equal-weight universe
    pr = [nav[i] / nav[i - 1] - 1 for i in range(1, len(nav))]
    er = [ew[i] / ew[i - 1] - 1 for i in range(1, len(ew))]
    mp, me = sum(pr) / len(pr), sum(er) / len(er)
    cv = sum((a - mp) * (b - me) for a, b in zip(pr, er)) / (len(pr) - 1)
    S["beta_ew"] = cv / stdev(er) ** 2
    S["corr_ew"] = cv / (stdev(pr) * stdev(er))

    eps = []
    for e in episodes(nav):
        a, b = e["peak"], e["trough"]
        att = {}
        for t in range(a, b):  # contrib index t = session out_dates[t+1]
            for k, v in contrib[t].items():
                att[k] = att.get(k, 0) + v * nav[t] / nav[a]
        drivers = sorted(att.items(), key=lambda x: x[1])[:3]
        ewd = ew[b] / ew[a] - 1
        sd = (spy_nav[b] / spy_nav[a] - 1) if spy_nav else None
        eps.append({"peak": out_dates[a], "trough": out_dates[b], "rec": out_dates[e["rec"]] if e["rec"] is not None else None,
                    "depth": round(e["depth"], 4), "days_down": b - a,
                    "days_rec": (e["rec"] - b) if e["rec"] is not None else None,
                    "ew": round(ewd, 4), "spy": round(sd, 4) if sd is not None else None,
                    "drivers": [[k, round(v, 4)] for k, v in drivers if v < 0]})

    # forward-looking drawdown risk for the current holdings: block bootstrap of
    # the last year of their daily returns, 2,000 one-year paths, 10-day blocks
    cur = next(r for r in reversed(rebal) if not r.get("pending"))
    cw = cur["w"]
    hist = []
    for t in range(max(1, T - 252), T):
        hist.append(sum(cw[k] * (R[k][t] or 0) for k in cw) + cur["cash"] * cash_d)
    rnd = random.Random(7)
    mdds, rets1y = [], []
    for _ in range(2000):
        v, pk, m = 1.0, 1.0, 0.0
        for _b in range(25):  # 25 blocks of 10 sessions = one year
            s0 = rnd.randrange(0, len(hist) - 10)
            for r in hist[s0:s0 + 10]:
                v *= 1 + r
                pk = max(pk, v)
                m = min(m, v / pk - 1)
        mdds.append(m)
        rets1y.append(v - 1)
    mdds.sort()
    rets1y.sort()
    q = lambda a, p: a[min(len(a) - 1, int(p * len(a)))]
    # worst 1/5/20-session moves of today's mix over the last year
    def worst(n):
        best = 0
        for i in range(len(hist) - n + 1):
            v = 1
            for r in hist[i:i + n]:
                v *= 1 + r
            best = min(best, v - 1)
        return best
    hvol = stdev(hist) * math.sqrt(252)
    risk = {"mdd_p50": q(mdds, 0.5), "mdd_p25": q(mdds, 0.25), "mdd_p10": q(mdds, 0.10), "mdd_p05": q(mdds, 0.05),
            "ret_p50": q(rets1y, 0.5), "ret_p05": q(rets1y, 0.05), "ret_p95": q(rets1y, 0.95),
            "vol": hvol, "var95_1d": -q(sorted(hist), 0.05),
            "worst1": worst(1), "worst5": worst(5), "worst20": worst(20)}
    # average pairwise correlation of current holdings (last 6 months)
    tks = list(cw)
    if len(tks) > 1:
        ret = {k: [R[k][t] or 0 for t in range(T - COVW, T)] for k in tks}
        def corr(a, b):
            ma, mb = sum(a) / len(a), sum(b) / len(b)
            c = sum((x - ma) * (y - mb) for x, y in zip(a, b))
            return c / math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
        cs = [corr(ret[a], ret[b]) for i, a in enumerate(tks) for b in tks[i + 1:]]
        risk["avg_corr"] = sum(cs) / len(cs)

    # latest scores for every stock + current holdings detail
    rows = score_all(T - 1)
    sc_rows = [{"tk": r["tk"], "f": names[r["tk"]][0], "n": names[r["tk"]][1], "rank": r["rank"],
                "score": round(r["score"], 3), "m6": round(r["m6"], 4), "m3": round(r["m3"], 4),
                "vol": round(r["vol"], 4), "above": r["above"], "ok": r["ok"]} for r in rows]
    young = [tk for tk in C if T - 1 - first[tk] < MIN_HIST]
    last_w = held_w[-1] if held_w else {}
    # when each current holding entered (start of its latest unbroken run)
    since = {}
    for k in cw:
        d0 = cur["d"]
        for rb in reversed(rebal):
            if k in rb["w"]:
                d0 = rb["d"]
            else:
                break
        since[k] = d0
    holdings = []
    for k, tw in cw.items():
        i0 = dates.index(since[k])
        holdings.append({"tk": k, "f": names[k][0], "n": names[k][1], "target": tw,
                         "now": round(w.get(k, 0), 4), "since": since[k],
                         "ret_since": round(C[k][T - 1] / C[k][i0] - 1, 4), "close": C[k][T - 1],
                         **{x: next((r[x] for r in sc_rows if r["tk"] == k), None) for x in ("score", "m6", "m3", "vol", "rank")}})
    holdings.sort(key=lambda h: -h["target"])

    def rnd4(a):
        return [round(x, 5) for x in a]
    out = {
        "updated": dates[T - 1], "start": out_dates[0], "next_rebalance": "next Friday close",
        "rules": {"hold": N_HOLD, "cap": CAP, "step": STEP, "lookbacks": [L6, L3], "skip": SKIP, "mom_vol_window": VOLW,
                  "cov_window": COVW, "sma": SMA, "cost": COST, "cash_rate": CASH_RATE, "vol_target": VOL_TARGET, "vol_window": VT_WIN, "rebalance": "weekly (Friday close)"},
        "dates": out_dates, "nav": rnd4(nav), "raw": rnd4(nav_raw), "dd_raw": rnd4(dd_series(nav_raw)),
        "stats_raw": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in stats(nav_raw).items() if k != "pos_weeks"},
        "exposure": [[r["d"], round(1 - r["cash"], 4)] for r in rebal], "ew": rnd4(ew), "spy": rnd4(spy_nav) if spy_nav else None,
        "dd": rnd4(dd_series(nav)), "dd_ew": rnd4(dd_series(ew)), "dd_spy": rnd4(dd_series(spy_nav)) if spy_nav else None,
        "stats": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in S.items()},
        "stats_ew": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in stats(ew).items() if k != "pos_weeks"},
        "stats_spy": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in stats(spy_nav).items() if k != "pos_weeks"} if spy_nav else None,
        "episodes": eps, "risk": {k: round(v, 4) for k, v in risk.items()},
        "holdings": holdings, "cash": cur["cash"], "rebalanced": cur["d"],
        "rebalances": rebal, "preview": preview, "scores": sc_rows, "young": young,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")
    if "--text" in sys.argv:
        print(f"{out['start']} → {out['updated']}  sessions {len(nav)-1}  rebalances {len(rebal)}")
        for lbl, s in (("Momentum", out["stats"]), ("Equal wt", out["stats_ew"]), ("SPY", out["stats_spy"])):
            if s:
                print(f"{lbl:9} total {s['total']:+.1%} CAGR {s['cagr']:+.1%} vol {s['vol']:.1%} Sharpe {s['sharpe']:.2f} "
                      f"Sortino {s['sortino']:.2f} maxDD {s['mdd']:.1%}")
        print("Holdings:", ", ".join(f"{h['tk']} {h['target']:.1%}" for h in holdings), f"cash {cur['cash']:.1%}")
        print("Episodes:", [(e["peak"], e["trough"], e["depth"], e["drivers"]) for e in eps])
        print("Risk:", out["risk"])
        print("Max weight ever:", max(max(r["w"].values(), default=0) for r in rebal),
              "max names:", max(len(r["w"]) for r in rebal))


if __name__ == "__main__":
    main()
