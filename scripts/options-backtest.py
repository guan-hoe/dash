#!/usr/bin/env python3
"""Options tab: weekly 5-delta cash-secured put book, backtested -> data/options-book.json.

Strategy (walk-forward, no look-ahead; every decision uses data up to that close):
  * Capital $1,000,000. Universe: every stock on the dashboard.
  * Every Friday close (or the week's last session) the book sells cash-secured
    puts that expire the following Friday, at the strike nearest a 5 delta
    (rounded down to a listed strike, i.e. never closer than 5 delta).
  * Momentum filter (a name may be sold only when all hold): close above its
    50-day average, 20-day average above the 50-day, and a positive 3-month
    return. Ranked by 3-month return divided by 3-month volatility.
  * Mean-variance optimisation: the best-ranked names (no more than 5, counting
    any stock held after an assignment) are weighted for the highest Sharpe
    ratio of their simulated weekly put returns over the trailing 52 weeks
    (premium earned minus any loss through the strike, as % of collateral).
    Expected returns are shrunk halfway to the group average, the covariance
    30% toward its diagonal. Weights are 0-30% per name on a 5% grid; anything
    not allocated stays in T-bills. Re-optimised every week (the rebalance).
  * Momentum break: if a name with an open put closes below its 50-day average,
    the put is bought back that day and the name stays neutral (no new put)
    until it passes the filter again at a later Friday.
  * Assignment: a put that finishes in the money is exercised; the book buys
    100 shares per contract at the strike, then sells a 10-delta covered call
    expiring the next Friday (rounded up to a listed strike). If the call
    finishes in the money the shares are called away. If not, the shares are
    kept and another 10-delta call sold while momentum is intact (close above
    the 50-day); otherwise the shares are sold at that Friday's close.
  * Cash and put collateral earn the 13-week T-bill yield (^IRX).
  * Option prices: Black-Scholes. Implied volatility is the stock's 30-day IV
    where the dashboard has it (from July 2026); before that a proxy: a blend
    of 10/20/60-day realised volatility times the stock's measured IV/RV ratio,
    scaled by the VIX versus its 1-year median. A 5-delta put trades at 1.30x
    the at-the-money IV (put skew); a 10-delta call at 1.00x.
  * Costs: sells fill 10% below mid, buy-backs 10% above mid (min $0.01),
    $0.65 per contract, 0.05% on stock sales. Puts paying under $0.05 are skipped.
Pure standard library, so it runs in the GitHub Action without installs.

Usage: python3 scripts/options-backtest.py [PRICE_DIR] [--text]
  PRICE_DIR holds <TICKER>/history.json with long history (the Action fetches
  5 years there, plus ^VIX, ^IRX and SPY); missing tickers fall back to
  <folder>/data/history.json in the repo.
  Exclude LITE and AAOI
  Exclude MP and META and BE
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
"""
import json, math, os, sys
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "options-book.json")

STOCKS = [  # folder, ticker, name
    ("amat", "AMAT", "Applied Materials"),
    ("amd", "AMD", "AMD"), ("amzn", "AMZN", "Amazon"), ("arm", "ARM", "Arm Holdings"),
    ("asml", "ASML", "ASML"), ("avgo", "AVGO", "Broadcom"), 
    ("cohr", "COHR", "Coherent"), ("glw", "GLW", "Corning"), ("googl", "GOOGL", "Alphabet"),
    ("intc", "INTC", "Intel"), ("mrvl", "MRVL", "Marvell Technology"), ("msft", "MSFT", "Microsoft"),
    ("mu", "MU", "Micron Technology"), ("nvda", "NVDA", "NVIDIA"), ("pltr", "PLTR", "Palantir"),
    ("rok", "ROK", "Rockwell Automation"), ("skhy", "SKHY", "SK hynix"), ("sndk", "SNDK", "Sandisk"),
    ("spcx", "SPCX", "SpaceX"), ("ter", "TER", "Teradyne"), ("tesla", "TSLA", "Tesla"),
    ("tsm", "TSM", "TSMC"), ("zs", "ZS", "Zscaler"),
]


CAPITAL = 1_000_000.0
YEARS = 2
MAX_NAMES, CAP, STEP = 5, 0.30, 0.05
PUT_DELTA, CALL_DELTA = 0.05, 0.10
PUT_SKEW, CALL_SKEW = 1.30, 1.00
SLIP, COMM, STOCK_COST, MIN_PREM = 0.10, 0.65, 0.0005, 0.05
SMA_F, SMA_S, MOM, MIN_HIST = 20, 50, 63, 70
MVO_WEEKS, SHRINK_MU, SHRINK_COV = 52, 0.5, 0.3
DEFAULT_VRP, DEFAULT_RF = 1.15, 0.043
NAME = {t: n for _, t, n in STOCKS}

# Market events worth a label on the charts (dates are the session the move happened).
EVENTS = [
    ("2024-11-06", "US election", "Stocks jumped the day after the US election; high-beta tech led."),
    ("2024-12-18", "Hawkish Fed cut", "The Fed cut but signalled fewer 2025 cuts; the S&P 500 fell ~3% in a day."),
    ("2025-01-27", "DeepSeek shock", "A cheap Chinese AI model hit AI-chip stocks; NVIDIA lost ~17% in a day."),
    ("2025-03-10", "Growth scare", "Recession and tariff worries drove a sharp Nasdaq sell-off."),
    ("2025-04-03", "Liberation Day tariffs", "Sweeping US tariffs set off the biggest two-day drop since 2020; VIX spiked above 50."),
    ("2025-04-09", "Tariff pause", "A 90-day pause on most tariffs sparked one of the best days in decades."),
    ("2025-05-12", "US-China truce", "US and China cut tariffs for 90 days; chip stocks rallied hard."),
]

# ---------------------------------------------------------------- maths
def ncdf(x): return 0.5 * (1 + math.erf(x / math.sqrt(2)))

def ninv(p):  # Acklam's rational approximation
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
    pl = 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > 1 - pl:
        q = math.sqrt(-2 * math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5; r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)

def bs(S, K, T, sig, r, kind):
    if T <= 1e-9 or sig <= 0:
        return max(0.0, K - S) if kind == "P" else max(0.0, S - K)
    v = sig * math.sqrt(T); d1 = (math.log(S / K) + (r + 0.5 * sig * sig) * T) / v; d2 = d1 - v
    if kind == "P": return K * math.exp(-r * T) * ncdf(-d2) - S * ncdf(-d1)
    return S * ncdf(d1) - K * math.exp(-r * T) * ncdf(d2)

def strike_for(S, T, sig, r, delta, kind):
    v = sig * math.sqrt(T)
    d1 = ninv(1 - delta) if kind == "P" else ninv(delta)   # put: N(d1)-1 = -delta ; call: N(d1) = delta
    return S * math.exp(-(d1 * v) + (r + 0.5 * sig * sig) * T)

def grid_step(S):
    return 0.5 if S < 50 else 1.0 if S < 100 else 2.5 if S < 250 else 5.0 if S < 1000 else 10.0

def round_strike(K, S, kind):
    g = grid_step(S)
    return math.floor(K / g) * g if kind == "P" else math.ceil(K / g) * g

def mean(x): return sum(x) / len(x) if x else 0.0

# ---------------------------------------------------------------- data
def load_hist(path):
    try:
        with open(path) as f: h = json.load(f)
        return {d: c for d, c in zip(h["d"], h["c"]) if c}
    except (OSError, ValueError, KeyError):
        return None

def load_iv(folder):
    try:
        with open(os.path.join(ROOT, folder, "vol.json")) as f: v = json.load(f)
        return {d: x / 100 for d, x in (v.get("aq") or []) if x}
    except (OSError, ValueError):
        return {}

def main():
    pdir = next((a for a in sys.argv[1:] if not a.startswith("--")), None)
    text = "--text" in sys.argv

    def hist_for(t, folder):
        h = load_hist(os.path.join(pdir, t, "history.json")) if pdir else None
        repo = load_hist(os.path.join(ROOT, folder, "data", "history.json")) or {}
        if h: h.update(repo)  # repo copy is the freshest for the last 2 years
        return h or repo

    spy = (load_hist(os.path.join(pdir, "SPY", "history.json")) if pdir else None) or {}
    spy.update(load_hist(os.path.join(ROOT, "data", "bench", "SPY", "history.json")) or {})
    vix = (load_hist(os.path.join(pdir, "^VIX", "history.json")) if pdir else None) or {}
    irx = (load_hist(os.path.join(pdir, "^IRX", "history.json")) if pdir else None) or {}
    cal = sorted(spy)
    px = {t: hist_for(t, f) for f, t, _ in STOCKS}
    ivreal = {t: load_iv(f) for f, t, _ in STOCKS}
    N = len(cal)
    end = date.fromisoformat(cal[-1])
    start_d = (end - timedelta(days=365 * YEARS + 1)).isoformat()

    # aligned closes (carry nothing forward: None when a stock didn't trade/exist)
    C = {t: [px[t].get(d) for d in cal] for t in px}

    def rv(t, i, n):
        c = C[t]
        if i - n < 0 or any(c[k] is None for k in range(i - n, i + 1)): return None
        r = [math.log(c[k] / c[k - 1]) for k in range(i - n + 1, i + 1)]
        m = mean(r); return math.sqrt(sum((x - m) ** 2 for x in r) / (len(r) - 1) * 252)

    def sma(t, i, n):
        c = C[t]
        if i - n + 1 < 0 or any(c[k] is None for k in range(i - n + 1, i + 1)): return None
        return sum(c[i - n + 1:i + 1]) / n

    def blend(t, i):
        a, b, c = rv(t, i, 10), rv(t, i, 20), rv(t, i, 60)
        if b is None: return None
        return 0.2 * (a or b) + 0.5 * b + 0.3 * (c or b)

    # IV/RV ratio measured where the dashboard has real 30-day IV
    vrp = {}
    for t in px:
        rs = []
        for i, d in enumerate(cal):
            if d in ivreal[t]:
                b = blend(t, i)
                if b: rs.append(ivreal[t][d] / b)
        rs.sort()
        vrp[t] = min(1.6, max(1.0, rs[len(rs) // 2])) if len(rs) >= 20 else DEFAULT_VRP

    vix_l = [vix.get(d) for d in cal]
    def vixf(i):
        v = vix_l[i]
        if not v: return 1.0
        w = sorted(x for x in vix_l[max(0, i - 252):i + 1] if x)
        return min(1.6, max(0.85, math.sqrt(v / w[len(w) // 2])))

    ivsrc = {}
    def atm_iv(t, i):
        d = cal[i]
        for k in range(i, max(-1, i - 3), -1):   # the latest real 30-day IV, up to 2 sessions old
            if cal[k] in ivreal[t]: return ivreal[t][cal[k]]
        b = blend(t, i)
        if b is None: return None
        return max(0.15, b * vrp[t] * vixf(i))

    irx_last = [None]
    def rf(i):
        v = irx.get(cal[i])
        if v: irx_last[0] = v / 100
        return irx_last[0] if irx_last[0] is not None else DEFAULT_RF

    def momentum_ok(t, i):
        c = C[t][i]
        f, s = sma(t, i, SMA_F), sma(t, i, SMA_S)
        if c is None or f is None or s is None or i < MOM or C[t][i - MOM] is None: return False
        return c > s and f > s and c / C[t][i - MOM] > 1

    def broken(t, i):
        c, s = C[t][i], sma(t, i, SMA_S)
        return c is not None and s is not None and c < s

    def score(t, i):
        v = rv(t, i, MOM)
        return (C[t][i] / C[t][i - MOM] - 1) / v if v else -1

    # week-end sessions (last session of each ISO week)
    # (the latest session counts only if it is a Friday; a part-week stays open)
    wk = [i for i in range(N - 1) if date.fromisoformat(cal[i + 1]).isocalendar()[:2] != date.fromisoformat(cal[i]).isocalendar()[:2]]
    if date.fromisoformat(cal[N - 1]).weekday() == 4: wk.append(N - 1)
    wk_next = {wk[k]: wk[k + 1] for k in range(len(wk) - 1)}
    wkset = set(wk)

    def nxt(i):  # expiry session index for an option sold at i, and its date label
        if i in wk_next: return wk_next[i], cal[wk_next[i]]
        d0 = date.fromisoformat(cal[i]); fri = d0 + timedelta(days=(4 - d0.weekday()) % 7 or 7)
        return i + 5, fri.isoformat()

    # simulated weekly short-put returns per name, for the optimiser
    simret = {t: {} for t in px}
    for k in range(len(wk) - 1):
        i, j = wk[k], wk[k + 1]
        T = (j - i) / 252
        for t in px:
            s0, s1 = C[t][i], C[t][j]
            if s0 is None or s1 is None: continue
            a = atm_iv(t, i)
            if a is None: continue
            sig = a * PUT_SKEW
            K = round_strike(strike_for(s0, T, sig, rf(i), PUT_DELTA, "P"), s0, "P")
            if K <= 0: continue
            p = bs(s0, K, T, sig, rf(i), "P") * (1 - SLIP)
            simret[t][i] = (p - max(0.0, K - s1)) / K
    ivsrc.clear()

    def optimise(names, i):
        hist = [k for k in wk if k < i][-MVO_WEEKS:]
        R = {t: [simret[t][k] for k in hist if k in simret[t]] for t in names}
        names = [t for t in names if len(R[t]) >= 26]
        if not names: return {}
        L = min(len(R[t]) for t in names)
        R = {t: R[t][-L:] for t in names}
        mu = {t: mean(R[t]) for t in names}; g = mean(list(mu.values()))
        mu = {t: (1 - SHRINK_MU) * mu[t] + SHRINK_MU * g for t in names}
        cov = {}
        for a in names:
            for b in names:
                ma, mb = mean(R[a]), mean(R[b])
                c = sum((x - ma) * (y - mb) for x, y in zip(R[a], R[b])) / (L - 1)
                cov[a, b] = c if a == b else (1 - SHRINK_COV) * c
        units, cap = round(1 / STEP), round(CAP / STEP)
        target = min(units, cap * len(names))   # fully invested, or as far as the caps allow
        best, bw = -1e9, None
        def rec(k, left, cur):
            nonlocal best, bw
            if k == len(names):
                if sum(cur) != target: return
                w = [u * STEP for u in cur]
                r = sum(w[m] * mu[names[m]] for m in range(len(names)))
                v = sum(w[m] * w[n] * cov[names[m], names[n]] for m in range(len(names)) for n in range(len(names)))
                s = r / math.sqrt(max(v, 1e-14))
                if s > best: best, bw = s, list(w)
                return
            for u in range(min(cap, left) + 1):
                cur.append(u); rec(k + 1, left - u, cur); cur.pop()
        rec(0, units, [])
        if best <= 0 or bw is None: return {}
        return {t: round(w, 4) for t, w in zip(names, bw) if w > 0}

    # ---------------------------------------------------------------- simulation
    i0 = next(k for k in wk if cal[k] >= start_d)
    cash = CAPITAL
    puts, calls, shares = {}, {}, {}  # t -> dict
    trades, daily, weeks = [], [], []
    episodes, cur_ep = [], {}
    neutral_since = {}
    diag = []
    interest, wk_int = 0.0, [0.0]
    wk_pnl = {}  # by name for the current week
    prem_week = {"put": 0.0, "call": 0.0}
    nav_prev = CAPITAL
    last_week_nav = CAPITAL
    week_start_i = i0

    def opt_val(o, i, kind):
        T = max(0, o["exp_i"] - i) / 252
        a = atm_iv(o["t"], i) or o["iv"] / (PUT_SKEW if kind == "P" else CALL_SKEW)
        return bs(C[o["t"]][i], o["K"], T, a * (PUT_SKEW if kind == "P" else CALL_SKEW), rf(i), kind)

    def nav(i):
        v = cash
        for t, s in shares.items(): v += s["n"] * (C[t][i] or s["last"])
        for t, o in puts.items(): v -= o["n"] * 100 * opt_val(o, i, "P")
        for t, o in calls.items(): v -= o["n"] * 100 * opt_val(o, i, "C")
        return v

    def log(i, t, action, **kw):
        trades.append({"d": cal[i], "t": t, "a": action, **{k: (round(v, 2) if isinstance(v, float) else v) for k, v in kw.items()}})

    def add(t, x): wk_pnl[t] = wk_pnl.get(t, 0.0) + x

    for i in range(i0, N):
        r_ = rf(i)
        if i > i0:  # T-bill interest on cash and collateral (daily)
            it = cash * r_ / 252; cash += it; interest += it; wk_int[0] += it
        # ---- daily: momentum break -> buy back the put, go neutral
        for t in list(puts):
            if i < puts[t]["exp_i"] and broken(t, i):
                o = puts.pop(t)
                mid = opt_val(o, i, "P"); px_ = max(0.01, mid * (1 + SLIP))
                cost = o["n"] * (100 * px_ + COMM); cash -= cost
                add(t, o["n"] * 100 * (o["prem"] - px_) - o["n"] * COMM * 2)
                log(i, t, "Bought back put (momentum broke)", K=o["K"], n=o["n"], px=px_, S=C[t][i], pnl=o["n"] * 100 * (o["prem"] - px_) - 2 * o["n"] * COMM)
                neutral_since[t] = cal[i]
        if i in wkset:
            # ---- expiries
            for t in list(puts):
                o = puts[t]
                if o["exp_i"] != i: continue
                puts.pop(t); S = C[t][i]
                if S < o["K"]:
                    cash -= o["n"] * 100 * o["K"]
                    shares[t] = {"n": o["n"] * 100, "cost": o["K"], "last": S, "fresh": True}
                    loss = o["n"] * 100 * (o["K"] - S)
                    add(t, o["n"] * 100 * o["prem"] - o["n"] * COMM - loss)
                    log(i, t, "Put assigned: bought shares", K=o["K"], n=o["n"], S=S, pnl=o["n"] * 100 * o["prem"] - loss)
                    cur_ep[t] = {"t": t, "name": NAME[t], "put_d": o["d"], "assign_d": cal[i], "K": o["K"], "prem": o["prem"], "n": o["n"],
                                 "S_sell": o["S"], "S_assign": S, "calls": []}
                else:
                    add(t, o["n"] * 100 * o["prem"] - o["n"] * COMM)
                    log(i, t, "Put expired worthless", K=o["K"], n=o["n"], S=S, pnl=o["n"] * 100 * o["prem"] - o["n"] * COMM)
            for t in list(calls):
                o = calls[t]
                if o["exp_i"] != i: continue
                calls.pop(t); S = C[t][i]; s = shares[t]
                if S > o["K"]:
                    cash += s["n"] * o["K"] * (1 - STOCK_COST)
                    add(t, o["n"] * 100 * o["prem"] - o["n"] * COMM + s["n"] * (o["K"] - s["last"]) - s["n"] * o["K"] * STOCK_COST)
                    log(i, t, "Call exercised: shares called away", K=o["K"], n=o["n"], S=S, pnl=s["n"] * (o["K"] - s["cost"]))
                    shares.pop(t)
                    ep = cur_ep.pop(t, None)
                    if ep: ep["calls"][-1]["out"] = "called"; ep.update(end_d=cal[i], exit=o["K"], how="Called away at the call strike"); episodes.append(ep)
                else:
                    add(t, o["n"] * 100 * o["prem"] - o["n"] * COMM)
                    log(i, t, "Call expired worthless", K=o["K"], n=o["n"], S=S, pnl=o["n"] * 100 * o["prem"] - o["n"] * COMM)
                    if t in cur_ep: cur_ep[t]["calls"][-1]["out"] = "expired"
            # ---- record the week (before new trades)
            nv = nav(i)
            if i > i0:
                spx = spy.get(cal[i]); spx0 = spy.get(cal[week_start_i])
                weeks.append({"d": cal[i], "nav": round(nv, 2), "pnl": round(nv - last_week_nav, 2),
                              "put": round(prem_week["put"], 2), "call": round(prem_week["call"], 2), "int": round(wk_int[0], 2),
                              "spy": round((spx / spx0 - 1) * 100, 2) if spx and spx0 else None,
                              "by": {t: round(x, 0) for t, x in sorted(wk_pnl.items(), key=lambda kv: kv[1]) if abs(x) >= 1}})
            last_week_nav, week_start_i = nv, i
            wk_pnl.clear(); prem_week = {"put": 0.0, "call": 0.0}; wk_int[0] = 0.0
            # ---- stock held: covered call, or exit
            for t in list(shares):
                s = shares[t]; S = C[t][i]
                if t in calls: continue
                if not s["fresh"] and broken(t, i):
                    cash += s["n"] * S * (1 - STOCK_COST)
                    add(t, s["n"] * (S - s["last"]) - s["n"] * S * STOCK_COST)
                    log(i, t, "Sold shares (momentum still broken)", n=s["n"], S=S, pnl=s["n"] * (S - s["cost"]))
                    shares.pop(t); neutral_since[t] = cal[i]
                    ep = cur_ep.pop(t, None)
                    if ep: ep.update(end_d=cal[i], exit=S, how="Sold the shares after the call expired, as momentum was still broken"); episodes.append(ep)
                    continue
                j, jd = nxt(i); T = (j - i) / 252
                a = atm_iv(t, i) or 0.5
                K = round_strike(strike_for(S, T, a * CALL_SKEW, r_, CALL_DELTA, "C"), S, "C")
                K = max(K, round_strike(S, S, "C"))
                p = bs(S, K, T, a * CALL_SKEW, r_, "C") * (1 - SLIP)
                p = round(max(p, 0.01), 2)
                n = s["n"] // 100
                cash += n * (100 * p - COMM)
                prem_week["call"] += n * 100 * p
                calls[t] = {"t": t, "K": K, "n": n, "prem": p, "exp_i": j, "exp": jd, "iv": a * CALL_SKEW, "d": cal[i], "S": S}
                s["fresh"] = False
                log(i, t, "Sold 10-delta covered call", K=K, n=n, px=p, S=S, exp=jd, iv=round(a * CALL_SKEW * 100, 1))
                if t in cur_ep: cur_ep[t]["calls"].append({"d": cal[i], "K": K, "prem": p, "S": S, "exp": jd})
            j, jd = nxt(i); T = (j - i) / 252
            slots = MAX_NAMES - len(shares)
            elig = [t for t in px if t not in shares and t not in puts and i >= MIN_HIST and C[t][i] is not None and momentum_ok(t, i)]
            elig.sort(key=lambda t: -score(t, i))
            pick = elig[:max(0, slots)]
            diag.append((cal[i], len(elig), len(pick)))
            w = optimise(pick, i) if pick else {}
            free = cash
            book = []
            for t, wt in sorted(w.items(), key=lambda kv: -kv[1]):
                S = C[t][i]; a = atm_iv(t, i)
                if a is None: continue
                sig = a * PUT_SKEW
                K = round_strike(strike_for(S, T, sig, r_, PUT_DELTA, "P"), S, "P")
                p = bs(S, K, T, sig, r_, "P") * (1 - SLIP)
                p = math.floor(p * 100) / 100
                if p < MIN_PREM or K <= 0: continue
                n = int(wt * nv // (K * 100))
                n = min(n, int(free // (K * 100)))
                if n <= 0: continue
                free -= n * K * 100
                cash += n * (100 * p - COMM)
                prem_week["put"] += n * 100 * p
                d1 = (math.log(S / K) + (r_ + 0.5 * sig * sig) * T) / (sig * math.sqrt(T))
                puts[t] = {"t": t, "K": K, "n": n, "prem": p, "exp_i": j, "exp": jd, "iv": sig, "d": cal[i], "S": S}
                book.append(t)
                log(i, t, "Sold 5-delta put", K=K, n=n, px=p, S=S, exp=jd, w=round(wt * 100, 1), iv=round(sig * 100, 1),
                    delta=round(ncdf(d1) - 1, 3), coll=n * K * 100)
        # ---- daily mark
        nv = nav(i)
        for t, s in shares.items():
            if C[t][i]:
                add(t, s["n"] * (C[t][i] - s["last"])); s["last"] = C[t][i]
        daily.append([cal[i], round(nv, 2)])
        nav_prev = nv

    # open episodes at the end
    for t, ep in cur_ep.items():
        ep.update(end_d=None, exit=None, how="Still holding the shares"); episodes.append(ep)

    # ---------------------------------------------------------------- stats
    navs = [v for _, v in daily]
    peak, dd, mdd, mdd_d, peak_d = navs[0], [], 0.0, None, daily[0][0]
    pk_at = daily[0][0]; mdd_from = None
    for d, v in daily:
        if v > peak: peak, pk_at = v, d
        x = v / peak - 1; dd.append([d, round(x * 100, 2)])
        if x < mdd: mdd, mdd_d, mdd_from = x, d, pk_at
    rets = [navs[k] / navs[k - 1] - 1 for k in range(1, len(navs))]
    yrs = (date.fromisoformat(daily[-1][0]) - date.fromisoformat(daily[0][0])).days / 365.25
    cagr = (navs[-1] / navs[0]) ** (1 / yrs) - 1
    vol = math.sqrt(sum((r - mean(rets)) ** 2 for r in rets) / (len(rets) - 1) * 252)
    rfa = mean([rf(k) for k in range(i0, N)])
    sharpe = (cagr - rfa) / vol if vol else None
    spy0, spy1 = spy[daily[0][0]], spy[daily[-1][0]]
    spy_curve = [[d, round(CAPITAL * spy[d] / spy0, 2)] for d, _ in daily if d in spy]
    sp, smdd = spy0, 0.0
    for d, _ in daily:
        if d in spy: sp = max(sp, spy[d]); smdd = min(smdd, spy[d] / sp - 1)
    put_prem = sum(w["put"] for w in weeks); call_prem = sum(w["call"] for w in weeks)
    sold = [x for x in trades if x["a"] == "Sold 5-delta put"]
    assigned = [x for x in trades if x["a"].startswith("Put assigned")]
    bought = [x for x in trades if x["a"].startswith("Bought back")]
    expired = [x for x in trades if x["a"] == "Put expired worthless"]
    pos_weeks = sum(1 for w in weeks if w["pnl"] > 0)

    # events: fixed macro list + the best and worst weeks, with their drivers
    wk_by_d = {w["d"]: w for w in weeks}
    def week_of(d):
        return next((w for w in weeks if w["d"] >= d), None)
    ev = []
    for d, title, note in EVENTS:
        if d < daily[0][0]: continue
        w = week_of(d)
        ev.append({"d": d, "title": title, "note": note, "kind": "macro", "wk": w["d"] if w else None, "pnl": w["pnl"] if w else None})
    ranked = sorted(weeks, key=lambda w: w["pnl"])
    for w in ranked[:6] + ranked[-4:]:
        drivers = sorted(w["by"].items(), key=lambda kv: kv[1])
        top = drivers[:2] if w["pnl"] < 0 else drivers[::-1][:2]
        ev.append({"d": w["d"], "title": ("Loss week" if w["pnl"] < 0 else "Best week"), "kind": "loss" if w["pnl"] < 0 else "gain",
                   "wk": w["d"], "pnl": w["pnl"], "spy": w["spy"], "drivers": [[t, x] for t, x in top]})
    for e in assigned:
        ev.append({"d": e["d"], "title": f"{e['t']} put assigned", "kind": "assign", "wk": e["d"], "t": e["t"], "K": e["K"], "S": e["S"]})
    ev.sort(key=lambda e: e["d"])

    # name-level attribution over the whole test
    by_name = {}
    for w in weeks:
        for t, x in w["by"].items(): by_name[t] = by_name.get(t, 0) + x
    weeks_in = {}
    for x in sold: weeks_in[x["t"]] = weeks_in.get(x["t"], 0) + 1

    # price paths for the exercise explainer
    for ep in episodes:
        t = ep["t"]
        a = cal.index(ep["put_d"]); b = cal.index(ep["end_d"]) if ep.get("end_d") else N - 1
        lo, hi = max(0, a - 15), min(N - 1, b + 10)
        ep["path"] = [[cal[k], C[t][k]] for k in range(lo, hi + 1) if C[t][k]]
        ep["pnl"] = round(ep["n"] * 100 * (ep["prem"] + sum(c["prem"] for c in ep["calls"]) + ((ep["exit"] or C[t][N - 1]) - ep["K"])), 0)

    # current book (positions open after the last Friday)
    live = {"asof": cal[N - 1], "puts": [], "calls": [], "shares": [], "cash": round(cash, 2)}
    for t, o in puts.items():
        live["puts"].append({"t": t, "name": NAME[t], "K": o["K"], "n": o["n"], "prem": o["prem"], "S": o["S"], "exp": o["exp"],
                             "iv": round(o["iv"] * 100, 1), "coll": o["n"] * o["K"] * 100, "otm": round((1 - o["K"] / o["S"]) * 100, 1),
                             "src": "IV30" if any(cal[k] in ivreal[t] for k in range(N - 3, N)) else "proxy"})
    for t, o in calls.items():
        live["calls"].append({"t": t, "name": NAME[t], "K": o["K"], "n": o["n"], "prem": o["prem"], "S": o["S"], "exp": o["exp"]})
    for t, s in shares.items():
        live["shares"].append({"t": t, "name": NAME[t], "n": s["n"], "cost": s["cost"], "S": C[t][N - 1]})
    neutral = [{"t": t, "name": NAME[t], "since": d} for t, d in neutral_since.items() if t not in puts and t not in shares and not momentum_ok(t, N - 1) and d >= cal[max(0, N - 60)]]

    out = {
        "updated": cal[N - 1], "start": daily[0][0], "capital": CAPITAL,
        "rules": {"maxNames": MAX_NAMES, "cap": CAP, "putDelta": PUT_DELTA, "callDelta": CALL_DELTA, "putSkew": PUT_SKEW,
                  "slip": SLIP, "comm": COMM, "smaS": SMA_S, "smaF": SMA_F, "mom": MOM, "mvoWeeks": MVO_WEEKS},
        "stats": {"nav": round(navs[-1], 2), "ret": round((navs[-1] / CAPITAL - 1) * 100, 2), "cagr": round(cagr * 100, 2),
                  "vol": round(vol * 100, 2), "sharpe": round(sharpe, 2) if sharpe is not None else None,
                  "mdd": round(mdd * 100, 2), "mddFrom": mdd_from, "mddAt": mdd_d,
                  "putPrem": round(put_prem, 2), "interest": round(interest, 2), "callPrem": round(call_prem, 2), "rf": round(rfa * 100, 2),
                  "putsSold": len(sold), "assigned": len(assigned), "boughtBack": len(bought), "expired": len(expired),
                  "posWeeks": pos_weeks, "weeks": len(weeks),
                  "spyRet": round((spy1 / spy0 - 1) * 100, 2), "spyMdd": round(smdd * 100, 2),
                  "ivRealFrom": min((min(v) for v in ivreal.values() if v), default=None)},
        "vrp": {t: round(v, 2) for t, v in vrp.items()},
        "nav": daily, "dd": dd, "spy": spy_curve, "weeks": weeks, "events": ev,
        "byName": [{"t": t, "name": NAME[t], "pnl": round(x, 0), "weeks": weeks_in.get(t, 0)} for t, x in sorted(by_name.items(), key=lambda kv: -kv[1])],
        "elig": [[d, a, b] for d, a, b in diag],
        "episodes": episodes, "trades": trades, "live": live, "neutral": neutral,
    }
    with open(OUT, "w") as f: json.dump(out, f, separators=(",", ":"))
    s = out["stats"]
    msg = (f"Options book {out['start']} → {out['updated']}: NAV ${s['nav']:,.0f} ({s['ret']:+.1f}%, CAGR {s['cagr']:.1f}%), "
           f"vol {s['vol']:.1f}%, Sharpe {s['sharpe']}, max DD {s['mdd']:.1f}% · put premium ${s['putPrem']:,.0f}, call premium ${s['callPrem']:,.0f} · "
           f"{s['putsSold']} puts sold, {s['assigned']} assigned, {s['boughtBack']} bought back · SPY {s['spyRet']:+.1f}% (max DD {s['spyMdd']:.1f}%)")
    print(msg if text else msg)
    if text:
        print("\nOpen puts:", ", ".join(f"{x['t']} {x['K']}P x{x['n']}" for x in live["puts"]) or "none")

if __name__ == "__main__":
    main()
