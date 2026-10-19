#!/usr/bin/env python3
"""Indicator snapshot for the daily technical read.

Reads <stock>/data/history.json (and skhy/data/krx/history.json) and writes
data/ta-snapshot.json: for each stock and listing, the latest close and moves,
SMA 5/10/30/100/200 with slopes, MACD (12, 26, 9), RSI (14), Parabolic SAR
(0.02, 0.2), ATR (14), 52-week range, recent swing highs/lows and how price sits
against the levels currently written in <stock>/ta.json.

The maths mirrors assets/technicals.js so the written read matches the signal
table on the page. Usage: python3 scripts/ta-snapshot.py [--text]
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def sma(a, n):
    o, s = [None] * len(a), 0.0
    for i, x in enumerate(a):
        s += x
        if i >= n:
            s -= a[i - n]
        if i >= n - 1:
            o[i] = s / n
    return o


def ema(a, n):
    k, e, o = 2 / (n + 1), None, []
    for i, x in enumerate(a):
        e = x if e is None else x * k + e * (1 - k)
        o.append(None if i < n - 1 else e)
    return o


def macd(c):
    e12, e26 = ema(c, 12), ema(c, 26)
    m = [None if a is None or b is None else a - b for a, b in zip(e12, e26)]
    s0 = next((i for i, x in enumerate(m) if x is not None), None)
    sig = [None] * len(c)
    if s0 is not None:
        for j, v in enumerate(ema(m[s0:], 9)):
            sig[s0 + j] = v
    hist = [None if a is None or b is None else a - b for a, b in zip(m, sig)]
    return m, sig, hist


def rsi(c, n=14):
    o = [None] * len(c)
    if len(c) <= n:
        return o
    g = l = 0.0
    for i in range(1, n + 1):
        d = c[i] - c[i - 1]
        g += max(d, 0); l += max(-d, 0)
    g /= n; l /= n
    o[n] = 100 - 100 / (1 + g / l) if l else 100
    for i in range(n + 1, len(c)):
        d = c[i] - c[i - 1]
        g = (g * (n - 1) + max(d, 0)) / n
        l = (l * (n - 1) + max(-d, 0)) / n
        o[i] = 100 - 100 / (1 + g / l) if l else 100
    return o


def psar(h, l, step=0.02, mx=0.2):
    n = len(h)
    out, tr = [None] * n, [None] * n
    if n < 3:
        return out, tr
    up = h[1] >= h[0]
    af = step
    ep = max(h[0], h[1]) if up else min(l[0], l[1])
    sar = min(l[0], l[1]) if up else max(h[0], h[1])
    for i in range(2, n):
        sar = sar + af * (ep - sar)
        if up:
            sar = min(sar, l[i - 1], l[i - 2])
            if l[i] < sar:
                up, sar, ep, af = False, ep, l[i], step
            elif h[i] > ep:
                ep, af = h[i], min(af + step, mx)
        else:
            sar = max(sar, h[i - 1], h[i - 2])
            if h[i] > sar:
                up, sar, ep, af = True, ep, h[i], step
            elif l[i] < ep:
                ep, af = l[i], min(af + step, mx)
        out[i], tr[i] = sar, up
    return out, tr


def atr(h, l, c, n=14):
    if len(c) <= n + 1:
        return None
    tr = [h[0] - l[0]] + [max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])) for i in range(1, len(c))]
    a = sum(tr[1:n + 1]) / n
    for i in range(n + 1, len(c)):
        a = (a * (n - 1) + tr[i]) / n
    return a


def r2(x):
    return None if x is None else round(x, 2)


def pct(a, b):
    return None if a is None or not b else round((a / b - 1) * 100, 1)


def last_change(flags, d):
    """Date the latest run of equal booleans started."""
    i = len(flags) - 1
    if flags[i] is None:
        return None
    while i > 0 and flags[i - 1] == flags[-1]:
        i -= 1
    return d[i] if i > 0 and flags[i - 1] is not None else None


def swings(d, h, l, win=5, look=260):
    """Fractal swing highs/lows over the last `look` bars (high/low that is the extreme of +-win bars)."""
    n, start = len(h), max(0, len(h) - look)
    hi, lo = [], []
    for i in range(start, n):
        a, b = max(0, i - win), min(n, i + win + 1)
        if b - i - 1 < 2:  # need at least 2 bars after to confirm
            continue
        if h[i] == max(h[a:b]):
            hi.append([d[i], h[i]])
        if l[i] == min(l[a:b]):
            lo.append([d[i], l[i]])
    return hi[-14:], lo[-14:]


def analyse(hist, levels=None):
    d, c = hist["d"], hist["c"]
    h, l = hist.get("h") or c, hist.get("l") or c
    v = hist.get("v") or []
    n = len(c)
    px = c[-1]
    out = {"bars": n, "date": d[-1], "close": r2(px),
           "chg_1d": pct(px, c[-2]) if n > 1 else None,
           "chg_5d": pct(px, c[-6]) if n > 5 else None,
           "chg_20d": pct(px, c[-21]) if n > 20 else None,
           "ohl_last": [r2(hist["o"][-1]) if hist.get("o") else None, r2(h[-1]), r2(l[-1])]}
    if v and v[-1] and n > 21:
        vv = [x for x in v[-21:-1] if x]
        out["vol_vs_20d"] = round(v[-1] / (sum(vv) / len(vv)), 2) if vv else None
    ma = {}
    for k in (5, 10, 30, 100, 200):
        s = sma(c, k)
        if s[-1] is None:
            ma[str(k)] = None
            continue
        prev = s[-6] if n > 5 and s[-6] is not None else None
        ma[str(k)] = {"v": r2(s[-1]), "px_vs": pct(px, s[-1]),
                      "slope_5d": None if prev is None else ("up" if s[-1] > prev else "down" if s[-1] < prev else "flat"),
                      "above_since": last_change([None if x is None else ci > x for ci, x in zip(c, s)], d)}
    out["sma"] = ma
    m, sig, hh = macd(c)
    if hh[-1] is not None:
        above = [None if x is None else x > 0 for x in hh]
        out["macd"] = {"macd": round(m[-1], 3), "signal": round(sig[-1], 3), "hist": round(hh[-1], 3),
                       "hist_prev": [round(x, 3) for x in hh[-4:-1] if x is not None],
                       "state": "above signal" if hh[-1] > 0 else "below signal",
                       "since": last_change(above, d), "zero_line": "above zero" if m[-1] > 0 else "below zero"}
    rr = rsi(c)
    if rr[-1] is not None:
        out["rsi"] = {"now": round(rr[-1], 1), "5d_ago": r2(rr[-6]) if n > 5 else None,
                      "max_20d": r2(max(x for x in rr[-20:] if x is not None)),
                      "min_20d": r2(min(x for x in rr[-20:] if x is not None))}
    sar, tr = psar(h, l)
    if tr[-1] is not None:
        out["psar"] = {"sar": r2(sar[-1]), "trend": "bullish" if tr[-1] else "bearish", "flipped": last_change(tr, d)}
    a = atr(h, l, c)
    out["atr14"] = r2(a)
    yr = slice(max(0, n - 252), n)
    hi52, lo52 = max(h[yr]), min(l[yr])
    out["range_52w"] = {"high": r2(hi52), "high_date": d[yr][h[yr].index(hi52)],
                        "low": r2(lo52), "low_date": d[yr][l[yr].index(lo52)],
                        "px_vs_high": pct(px, hi52)}
    sh, sl = swings(d, h, l)
    out["swing_highs"], out["swing_lows"] = sh, sl
    out["last_20"] = [[d[i], r2(h[i]), r2(l[i]), r2(c[i])] for i in range(max(0, n - 20), n)]
    if levels:
        chk = {}
        for side in ("r", "s"):
            for lv in levels.get(side, []):
                p = lv[0]
                # closes beyond the level in the last 5 sessions
                beyond = sum(1 for x in c[-5:] if (x > p if side == "r" else x < p))
                chk[f"{side} {p}"] = {"px_vs": pct(px, p), "closes_beyond_5d": beyond,
                                      "status": ("broken" if (px > p if side == "r" else px < p) else "intact")}
        out["written_levels"] = chk
    return out


def load(p):
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return None


def main():
    res = {}
    for name in sorted(os.listdir(ROOT)):
        ta = load(os.path.join(ROOT, name, "ta.json"))
        if ta is None:
            continue
        series = ta.get("series") or [dict(ta, src="data/history.json")]
        res[name] = []
        for s in series:
            hist = load(os.path.join(ROOT, name, s.get("src", "data/history.json")))
            entry = {"src": s.get("src", "data/history.json"), "written_asof": s.get("asof"), "written_close": s.get("close"),
                     "written_bias": (s.get("bias") or {}).get("en")}
            if not hist or not hist.get("c") or len(hist["c"]) < 30 or not hist.get("h"):
                entry["error"] = "no usable OHLC history"
            else:
                entry.update(analyse(hist, s.get("levels")))
            res[name].append(entry)
    path = os.path.join(ROOT, "data", "ta-snapshot.json")
    with open(path, "w") as f:
        json.dump(res, f, ensure_ascii=False, separators=(",", ":"))
    if "--text" in sys.argv:
        for k, ss in res.items():
            for s in ss:
                if "error" in s:
                    print(f"{k} {s['src']}: {s['error']}")
                    continue
                ma = " ".join(f"{p}:{x['v']}({x['px_vs']:+}%,{x['slope_5d']})" if x else f"{p}:-" for p, x in s["sma"].items())
                mc, rs, ps = s.get("macd", {}), s.get("rsi", {}), s.get("psar", {})
                print(f"{k} [{s['src']}] {s['date']} close {s['close']} ({s['chg_1d']:+}% 1d, {s['chg_5d']:+}% 5d, {s['chg_20d']}% 20d)")
                print(f"  SMA {ma}")
                print(f"  MACD {mc.get('state')} since {mc.get('since')} hist {mc.get('hist')} prev {mc.get('hist_prev')} {mc.get('zero_line')} | RSI {rs.get('now')} | SAR {ps.get('trend')} {ps.get('sar')} since {ps.get('flipped')} | ATR {s['atr14']}")
                print(f"  52w {s['range_52w']} ")
                print(f"  swing highs {s['swing_highs'][-8:]}")
                print(f"  swing lows  {s['swing_lows'][-8:]}")
                print(f"  written {s['written_asof']} {s['written_bias']} levels {s.get('written_levels')}")
    print(f"wrote {path} ({len(res)} stocks)", file=sys.stderr)


if __name__ == "__main__":
    main()
