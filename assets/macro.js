/* Macro page: tiles for crude oil, gold, silver and the 2/5/10/30-year US Treasury, German Bund and French OAT yields; an interactive chart
   for the selected one (1W on 30-minute bars, 1M to 1Y on daily bars) with indicators, reversal-signal markers,
   key levels, a computed technical read and a reversal-signal table; the yield curve vs 1 month and 1 year ago, and the economic calendar.
   Data: data/macro.json and data/macro-cal.json, built by scripts/fetch-macro.mjs in the deploy workflow.
   Re-polls every minute. Charts: TradingView Lightweight Charts. */
(function () {
  const TZ = "Asia/Singapore";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isY = (x) => x.kind === "yield";
  const nth = (a, i) => a[a.length + i]; // a.at(i) for negative i, for older browsers
  const fmtV = (x, v) => v == null ? "–" : isY(x) ? v.toFixed(3) + "%" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sgn = (v, d) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);
  const chgTxt = (x, chg, pct) => chg == null ? "–" : isY(x) ? `${sgn(chg * 100, 1)} bp` : `${sgn(chg, 2)} (${sgn(pct, 2)}%)`;
  const sgt = (s) => new Date(s * 1000).toLocaleString("en-SG", { timeZone: TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const fmtD = (iso) => { const [Y, M, D] = iso.split("-").map(Number); return new Date(Date.UTC(Y, M - 1, D)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); };
  let M = null, CAL = null, sel = "oil", tf = "6M", calFilter = "us";
  try { sel = localStorage.getItem("macro-sel") || sel; tf = localStorage.getItem("macro-tf") || tf; calFilter = localStorage.getItem("macro-cal") || calFilter; } catch (e) {}

  // Trading date a quote belongs to: futures and Treasuries start the next session at 6pm New York time,
  // so a quote after 18:00 ET (or on a weekend) counts toward the next weekday's bar.
  function sessionDay(ts) {
    const p = {}; new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ts * 1000)).forEach((q) => { p[q.type] = q.value; });
    const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
    if (+p.hour >= 18) d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  // daily OHLC with the live price folded into today's bar (older files may hold closes only)
  function series(x) {
    const H = x.hist, d = H.d.slice(), c = H.c.slice();
    const o = (H.o || H.c).slice(), h = (H.h || H.c).slice(), l = (H.l || H.c).slice();
    if (x.price != null && x.time) {
      const day = sessionDay(x.time), p = x.price;
      if (d.length && nth(d, -1) === day) { const k = c.length - 1; c[k] = p; h[k] = Math.max(h[k], p); l[k] = Math.min(l[k], p); }
      else if (!d.length || day > nth(d, -1)) { const pc = c.length ? nth(c, -1) : p; d.push(day); o.push(pc); h.push(Math.max(pc, p)); l.push(Math.min(pc, p)); c.push(p); }
    }
    return { d, o, h, l, c };
  }

  // ---------- indicators (same formulas as the stock pages' technical charts) ----------
  const sma = (a, n) => { const out = Array(a.length).fill(null); let t = 0; for (let i = 0; i < a.length; i++) { t += a[i]; if (i >= n) t -= a[i - n]; if (i >= n - 1) out[i] = t / n; } return out; };
  const ema = (a, n) => { const k = 2 / (n + 1); let e = null; return a.map((v, i) => { e = e == null ? v : v * k + e * (1 - k); return i < n - 1 ? null : e; }); };
  function macd(c) {
    const e12 = ema(c, 12), e26 = ema(c, 26);
    const m = c.map((_, i) => e12[i] == null || e26[i] == null ? null : e12[i] - e26[i]);
    let s0 = -1; for (let i = 0; i < m.length; i++) if (m[i] != null) { s0 = i; break; }
    const sig = Array(c.length).fill(null);
    if (s0 >= 0) ema(m.slice(s0), 9).forEach((v, j) => { sig[s0 + j] = v; });
    return { m, sig, hist: m.map((v, i) => v == null || sig[i] == null ? null : v - sig[i]) };
  }
  function rsi(c, n) {
    n = n || 14; const out = Array(c.length).fill(null); if (c.length <= n) return out;
    let g = 0, q = 0;
    for (let i = 1; i <= n; i++) { const dd = c[i] - c[i - 1]; g += Math.max(dd, 0); q += Math.max(-dd, 0); }
    g /= n; q /= n; out[n] = q ? 100 - 100 / (1 + g / q) : 100;
    for (let i = n + 1; i < c.length; i++) { const dd = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(dd, 0)) / n; q = (q * (n - 1) + Math.max(-dd, 0)) / n; out[i] = q ? 100 - 100 / (1 + g / q) : 100; }
    return out;
  }
  function psar(h, l, step, max) {
    step = step || 0.02; max = max || 0.2;
    const n = h.length, out = Array(n).fill(null), tr = Array(n).fill(null); if (n < 3) return { out, tr };
    let up = h[1] >= h[0], af = step, ep = up ? Math.max(h[0], h[1]) : Math.min(l[0], l[1]), sar = up ? Math.min(l[0], l[1]) : Math.max(h[0], h[1]);
    for (let i = 2; i < n; i++) {
      sar = sar + af * (ep - sar);
      if (up) { sar = Math.min(sar, l[i - 1], l[i - 2]); if (l[i] < sar) { up = false; sar = ep; ep = l[i]; af = step; } else if (h[i] > ep) { ep = h[i]; af = Math.min(af + step, max); } }
      else { sar = Math.max(sar, h[i - 1], h[i - 2]); if (h[i] > sar) { up = true; sar = ep; ep = h[i]; af = step; } else if (l[i] < ep) { ep = l[i]; af = Math.min(af + step, max); } }
      out[i] = sar; tr[i] = up;
    }
    return { out, tr };
  }
  const at = (s, daysBack) => { const t = new Date(Date.now() - daysBack * 864e5).toISOString().slice(0, 10); let v = null; for (let i = 0; i < s.d.length; i++) { if (s.d[i] <= t) v = s.c[i]; else break; } return v; };

  function spark(s) {
    const c = s.c.slice(-66); if (c.length < 2) return "";
    const lo = Math.min(...c), hi = Math.max(...c), w = 200, h = 34, k = hi - lo || 1;
    const pts = c.map((v, i) => `${(i / (c.length - 1) * w).toFixed(1)},${(h - 2 - (v - lo) / k * (h - 4)).toFixed(1)}`).join(" ");
    const col = nth(c, -1) >= c[0] ? "var(--up)" : "var(--down)";
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function tiles() {
    const put = (host, list) => {
      host.innerHTML = list.map((x) => {
        const s = series(x), cls = x.chg == null ? "" : x.chg >= 0 ? "up" : "down";
        return `<button type="button" class="tile" data-k="${x.k}" aria-pressed="${x.k === sel}"><b>${esc(x.short)}</b><span class="v">${fmtV(x, x.price)}</span><span class="c ${cls}">${chgTxt(x, x.chg, x.pct)}</span>
          ${spark(s)}<small>${x.realtime ? "Live" : "Delayed"} · ${sgt(x.time)} SGT</small></button>`;
      }).join("");
      host.querySelectorAll(".tile").forEach((b) => b.onclick = () => { sel = b.dataset.k; try { localStorage.setItem("macro-sel", sel); } catch (e) {} tiles(); chart(); });
    };
    const g = (x) => x.grp || (isY(x) ? "us" : "cmd");
    put($("tC"), M.items.filter((x) => !isY(x)));
    [["tY", "us"], ["tDE", "de"], ["tFR", "fr"]].forEach(([id, k]) => {
      const L = M.items.filter((x) => isY(x) && g(x) === k), el = $(id);
      el.hidden = el.previousElementSibling.hidden = !L.length;
      if (L.length) put(el, L);
    });
  }

  // ---------- more indicators: Bollinger Bands, stochastic, ATR ----------
  // simple average that waits for a full window of non-null values
  const smaN = (a, n) => { const out = Array(a.length).fill(null); for (let i = n - 1; i < a.length; i++) { let t = 0, ok = true; for (let j = i - n + 1; j <= i; j++) { if (a[j] == null) { ok = false; break; } t += a[j]; } if (ok) out[i] = t / n; } return out; };
  function boll(c, n, k) {
    n = n || 20; k = k || 2; const mid = sma(c, n), up = Array(c.length).fill(null), lo = Array(c.length).fill(null);
    for (let i = n - 1; i < c.length; i++) { let v = 0; for (let j = i - n + 1; j <= i; j++) v += (c[j] - mid[i]) ** 2; const sd = Math.sqrt(v / n); up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd; }
    return { mid, up, lo };
  }
  function stoch(h, l, c, n, sk, sd) {
    n = n || 14; sk = sk || 3; sd = sd || 3; const raw = Array(c.length).fill(null);
    for (let i = n - 1; i < c.length; i++) { let hh = -Infinity, ll = Infinity; for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, h[j]); ll = Math.min(ll, l[j]); } raw[i] = hh > ll ? (c[i] - ll) / (hh - ll) * 100 : 50; }
    const k = smaN(raw, sk); return { k, d: smaN(k, sd) };
  }
  function atrS(h, l, c, n) {
    n = n || 14; const out = Array(c.length).fill(null); if (c.length <= n) return out;
    const tr = c.map((_, i) => i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[0] - l[0]);
    let a = 0; for (let i = 1; i <= n; i++) a += tr[i]; a /= n; out[n] = a;
    for (let i = n + 1; i < c.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
    return out;
  }

  // ---------- time frames: 1W uses 30-minute bars when the data has them, the rest use daily bars ----------
  const TF = [["1W", 5], ["1M", 22], ["3M", 66], ["6M", 128], ["1Y", 252]];
  const SGT_OFF = 8 * 3600; // the chart axis shows Singapore wall-clock time for intraday bars
  function bars(x) {
    const it = x.intra;
    if (tf === "1W" && it && it.t && it.t.length >= 40) {
      const t = it.t.slice(), o = it.o.slice(), h = it.h.slice(), l = it.l.slice(), c = it.c.slice();
      if (x.price != null && x.time) {
        const b = Math.floor(x.time / 1800) * 1800, last = nth(t, -1), p = x.price;
        if (b === last) { const k = c.length - 1; c[k] = p; h[k] = Math.max(h[k], p); l[k] = Math.min(l[k], p); }
        else if (b > last) { const pc = nth(c, -1); t.push(b); o.push(pc); h.push(Math.max(pc, p)); l.push(Math.min(pc, p)); c.push(p); }
      }
      const from = Math.max(0, t.findIndex((v) => v >= nth(t, -1) - 7 * 86400));
      const lab = (i) => new Date(t[i] * 1000).toLocaleString("en-SG", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " SGT";
      const short = (i) => new Date(t[i] * 1000).toLocaleString("en-SG", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
      return { T: t.map((v) => v + SGT_OFF), o, h, l, c, lab, short, from, intra: true, unit: "bar", unitP: "30-min bars", src: x.isrc || "30-minute bars" };
    }
    const S = series(x), N = S.d.length, n = (TF.find((q) => q[0] === tf) || TF[3])[1];
    return { T: S.d, o: S.o, h: S.h, l: S.l, c: S.c, lab: (i) => fmtD(S.d[i]), short: (i) => fmtD(S.d[i]).replace(/, \d{4}$/, ""), from: Math.max(0, N - n), intra: false, unit: "day", unitP: "daily bars", src: x.hsrc };
  }

  // ---------- reversal signals ----------
  // Each signal: { i, dir: +1 bullish / -1 bearish, code (chart label), name, why }.
  function reversals(B, I, flat) {
    const { o, h, l, c } = B, n = c.length, out = [], add = (i, dir, code, name, why) => out.push({ i, dir, code, name, why });
    const down = (i) => i >= 6 && c[i - 1] < c[i - 6], up = (i) => i >= 6 && c[i - 1] > c[i - 6];
    const body = (i) => Math.abs(c[i] - o[i]), rng = (i) => h[i] - l[i];
    const avgBody = (i) => { let t = 0, k = 0; for (let j = Math.max(0, i - 10); j < i; j++) { t += body(j); k++; } return k ? t / k : 0; };
    const lowest = (i, w) => { for (let j = Math.max(0, i - w); j < i; j++) if (l[j] < l[i]) return false; return true; };
    const highest = (i, w) => { for (let j = Math.max(0, i - w); j < i; j++) if (h[j] > h[i]) return false; return true; };
    for (let i = 2; i < n; i++) {
      // candlestick patterns (need real open/high/low)
      if (!flat && rng(i) > 0) {
        const bd = body(i), lw = Math.min(o[i], c[i]) - l[i], uw = h[i] - Math.max(o[i], c[i]), R = rng(i);
        if (down(i) && c[i - 1] < o[i - 1] && c[i] > o[i] && o[i] <= c[i - 1] && c[i] >= o[i - 1] && bd > body(i - 1)) add(i, 1, "Engulf", "Bullish engulfing", "Up bar's body swallows the prior down bar after a decline");
        if (up(i) && c[i - 1] > o[i - 1] && c[i] < o[i] && o[i] >= c[i - 1] && c[i] <= o[i - 1] && bd > body(i - 1)) add(i, -1, "Engulf", "Bearish engulfing", "Down bar's body swallows the prior up bar after a rally");
        if (down(i) && lowest(i, 5) && lw >= 2 * Math.max(bd, R * 0.05) && uw <= 0.25 * R) add(i, 1, "Hammer", "Hammer", "Long lower wick at a new low: sellers pushed down and were bought back");
        if (up(i) && highest(i, 5) && uw >= 2 * Math.max(bd, R * 0.05) && lw <= 0.25 * R) add(i, -1, "Star", "Shooting star", "Long upper wick at a new high: buyers pushed up and were sold back");
        const ab = avgBody(i - 2);
        if (i >= 8 && ab > 0) {
          const big2 = body(i - 2) > ab && body(i - 2) > 0.5 * rng(i - 2), small1 = body(i - 1) < 0.35 * body(i - 2), mid2 = (o[i - 2] + c[i - 2]) / 2;
          if (big2 && small1 && down(i - 2) && c[i - 2] < o[i - 2] && c[i] > o[i] && c[i] > mid2) add(i, 1, "M.Star", "Morning star", "Big down bar, small pause, then an up bar closing past its midpoint");
          if (big2 && small1 && up(i - 2) && c[i - 2] > o[i - 2] && c[i] < o[i] && c[i] < mid2) add(i, -1, "E.Star", "Evening star", "Big up bar, small pause, then a down bar closing past its midpoint");
        }
      }
      // oscillator turns
      const r = I.r;
      if (r[i - 1] != null && r[i] != null) {
        if (r[i - 1] < 30 && r[i] >= 30) add(i, 1, "RSI", "RSI leaves oversold", `RSI 14 back above 30 (${r[i].toFixed(0)})`);
        if (r[i - 1] > 70 && r[i] <= 70) add(i, -1, "RSI", "RSI leaves overbought", `RSI 14 back below 70 (${r[i].toFixed(0)})`);
      }
      const K = I.st.k, D = I.st.d;
      if (K[i - 1] != null && D[i - 1] != null && K[i] != null && D[i] != null) {
        if (K[i - 1] <= D[i - 1] && K[i] > D[i] && Math.min(K[i - 1], D[i - 1]) < 20) add(i, 1, "Stoch", "Stochastic cross up in oversold", `%K crossed above %D below 20 (${K[i].toFixed(0)})`);
        if (K[i - 1] >= D[i - 1] && K[i] < D[i] && Math.max(K[i - 1], D[i - 1]) > 80) add(i, -1, "Stoch", "Stochastic cross down in overbought", `%K crossed below %D above 80 (${K[i].toFixed(0)})`);
      }
      const M = I.m;
      if (M.hist[i - 1] != null && M.hist[i] != null) {
        if (M.hist[i - 1] <= 0 && M.hist[i] > 0 && M.m[i] < 0) add(i, 1, "MACD", "MACD bullish cross below zero", "MACD crossed above its signal line while still negative");
        if (M.hist[i - 1] >= 0 && M.hist[i] < 0 && M.m[i] > 0) add(i, -1, "MACD", "MACD bearish cross above zero", "MACD crossed below its signal line while still positive");
      }
      const tr = I.sar.tr;
      if (tr[i - 1] != null && tr[i] != null && tr[i] !== tr[i - 1]) add(i, tr[i] ? 1 : -1, "SAR", tr[i] ? "Parabolic SAR flips up" : "Parabolic SAR flips down", tr[i] ? "Price closed above the SAR; dots move below price" : "Price closed below the SAR; dots move above price");
      const bb = I.bb;
      if (bb.lo[i - 1] != null && bb.lo[i] != null) {
        if (c[i - 1] < bb.lo[i - 1] && c[i] > bb.lo[i]) add(i, 1, "BB", "Back inside lower Bollinger Band", "Closed back above the lower band after closing below it");
        if (c[i - 1] > bb.up[i - 1] && c[i] < bb.up[i]) add(i, -1, "BB", "Back inside upper Bollinger Band", "Closed back below the upper band after closing above it");
      }
    }
    // DeMark TD Sequential setup: nine closes in a row below (buy) or above (sell) the close four bars earlier
    let bs = 0, ss = 0;
    for (let i = 4; i < n; i++) {
      bs = c[i] < c[i - 4] ? bs + 1 : 0; ss = c[i] > c[i - 4] ? ss + 1 : 0;
      if (bs === 9) { add(i, 1, "TD9", "TD Sequential buy setup 9", "Nine closes in a row below the close four bars earlier: selling may be exhausted"); bs = 0; }
      if (ss === 9) { add(i, -1, "TD9", "TD Sequential sell setup 9", "Nine closes in a row above the close four bars earlier: buying may be exhausted"); ss = 0; }
    }
    // divergence between swing lows/highs (3 bars each side) and RSI / MACD
    const w = 3, pl = [], ph = [];
    for (let i = w; i < n - w; i++) {
      let lo = true, hi = true;
      for (let j = i - w; j <= i + w; j++) { if (j === i) continue; if (l[j] < l[i]) lo = false; if (h[j] > h[i]) hi = false; }
      if (lo) pl.push(i); if (hi) ph.push(i);
    }
    const div = (P, dir) => {
      for (let k = 1; k < P.length; k++) {
        const a = P[k - 1], b = P[k]; if (b - a < 4 || b - a > 40) continue;
        const pxOk = dir > 0 ? l[b] < l[a] : h[b] > h[a];
        if (!pxOk) continue;
        const r = I.r, m = I.m.m, conf = Math.min(n - 1, b + w);
        if (r[a] != null && r[b] != null && (dir > 0 ? r[b] > r[a] + 1 && r[b] < 50 : r[b] < r[a] - 1 && r[b] > 50))
          add(b, dir, "Div", dir > 0 ? "Bullish RSI divergence" : "Bearish RSI divergence", `${dir > 0 ? "Lower low" : "Higher high"} in price but ${dir > 0 ? "higher" : "lower"} RSI (${r[a].toFixed(0)} → ${r[b].toFixed(0)}); confirmed ${B.short(conf)}`);
        if (m[a] != null && m[b] != null && (dir > 0 ? m[b] > m[a] && m[b] < 0 : m[b] < m[a] && m[b] > 0))
          add(b, dir, "Div", dir > 0 ? "Bullish MACD divergence" : "Bearish MACD divergence", `${dir > 0 ? "Lower low" : "Higher high"} in price but a ${dir > 0 ? "higher" : "lower"} MACD reading; confirmed ${B.short(conf)}`);
      }
    };
    div(pl, 1); div(ph, -1);
    return { list: out.sort((p, q) => p.i - q.i), pl, ph };
  }

  // support and resistance from swing points in the visible window, merged when closer than 0.6 ATR
  function levels(B, from, piv, atrV) {
    const px = nth(B.c, -1), N = B.c.length, cand = [];
    piv.ph.filter((i) => i >= from).forEach((i) => cand.push({ p: B.h[i], i, k: "Swing high" }));
    piv.pl.filter((i) => i >= from).forEach((i) => cand.push({ p: B.l[i], i, k: "Swing low" }));
    let hi = from, lo = from; for (let i = from; i < N; i++) { if (B.h[i] > B.h[hi]) hi = i; if (B.l[i] < B.l[lo]) lo = i; }
    cand.push({ p: B.h[hi], i: hi, k: "Window high" }, { p: B.l[lo], i: lo, k: "Window low" });
    const tol = (atrV || Math.abs(px) * 0.01) * 0.6, cl = [];
    cand.sort((a, b) => a.p - b.p).forEach((x) => {
      const g = cl.find((y) => Math.abs(y.p - x.p) <= tol);
      if (g) { g.p = (g.p * g.n + x.p) / (g.n + 1); g.n++; if (x.i > g.i) g.i = x.i; if (/Window/.test(x.k)) g.k = x.k; }
      else cl.push({ p: x.p, n: 1, i: x.i, k: x.k });
    });
    const R = cl.filter((x) => x.p > px + tol * 0.25).sort((a, b) => a.p - b.p).slice(0, 3);
    const S = cl.filter((x) => x.p < px - tol * 0.25).sort((a, b) => b.p - a.p).slice(0, 3);
    return { R, S, px };
  }

  // ---------- chart ----------
  const IND = [["ma5", "MA 5", "#d97706"], ["ma10", "MA 10", "#7c3aed"], ["ma30", "MA 30", "#0d9488"], ["ma100", "MA 100", "#64748b"], ["bb", "Bollinger", "#94a3b8"], ["sar", "SAR", "#0b6fb8"],
    ["lv", "Levels", "#a86a00"], ["rev", "Reversals", ""], ["macd", "MACD", ""], ["rsi", "RSI", ""], ["stoch", "Stoch", ""]];
  let on = { ma5: true, ma10: true, ma30: true, ma100: true, bb: false, sar: true, lv: true, rev: true, macd: true, rsi: true, stoch: true }, style = "candle";
  try { const z = JSON.parse(localStorage.getItem("macro-ind") || "null"); if (z) for (const k in z) if (k in on) on[k] = z[k]; style = localStorage.getItem("macro-style") || style; } catch (e) {}
  let C = null, cur = null, lvLines = [];
  const save = () => { try { localStorage.setItem("macro-ind", JSON.stringify(on)); localStorage.setItem("macro-tf", tf); localStorage.setItem("macro-style", style); } catch (e) {} };
  function mkChart(el, axis, intra) {
    return LightweightCharts.createChart(el, { autoSize: true, localization: { locale: "en-US" },
      layout: { background: { color: "transparent" }, textColor: css("--muted"), fontFamily: css("--f-mono"), fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: css("--line") } }, rightPriceScale: { borderVisible: false, minimumWidth: 70 },
      timeScale: { borderVisible: false, visible: axis, timeVisible: !!intra, secondsVisible: false, rightOffset: 3 },
      crosshair: { mode: 0 }, handleScroll: { vertTouchDrag: false } });
  }
  const lineOpt = (color, w, extra) => Object.assign({ color, lineWidth: w || 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, extra || {});
  function build(intra) {
    if (C) { [C.main, C.mac, C.rs, C.sto].forEach((c) => c.remove()); lvLines = []; }
    const up = css("--up"), dn = css("--down");
    const main = mkChart($("chart"), true, intra), mac = mkChart($("chMacd"), false, intra), rs = mkChart($("chRsi"), false, intra), sto = mkChart($("chStoch"), false, intra);
    const candle = main.addCandlestickSeries({ upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn });
    const line = main.addLineSeries({ color: css("--accent"), lineWidth: 2, priceLineVisible: false });
    const ma = {}; IND.slice(0, 4).forEach(([k, , col]) => { ma[k] = main.addLineSeries(lineOpt(col)); });
    const bb = { up: main.addLineSeries(lineOpt("#94a3b8", 1, { lineStyle: 2 })), mid: main.addLineSeries(lineOpt("#94a3b8", 1, { lineStyle: 1 })), lo: main.addLineSeries(lineOpt("#94a3b8", 1, { lineStyle: 2 })) };
    const sar = main.addLineSeries(lineOpt("#0b6fb8", 1, { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.5 }));
    const mh = mac.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    const ml = mac.addLineSeries(lineOpt(css("--accent"), 1.5)), ms = mac.addLineSeries(lineOpt("#d97706"));
    const box = () => ({ priceRange: { minValue: 0, maxValue: 100 } });
    const rl = rs.addLineSeries(lineOpt("#7c3aed", 1.5, { lastValueVisible: true, autoscaleInfoProvider: box }));
    rl.createPriceLine({ price: 70, color: dn, lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    rl.createPriceLine({ price: 30, color: up, lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    const sk = sto.addLineSeries(lineOpt(css("--accent"), 1.5, { lastValueVisible: true, autoscaleInfoProvider: box })), sd = sto.addLineSeries(lineOpt("#d97706", 1, { autoscaleInfoProvider: box }));
    sk.createPriceLine({ price: 80, color: dn, lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    sk.createPriceLine({ price: 20, color: up, lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    const all = [main, mac, rs, sto]; let busy = false;
    // one time window for all panes
    all.forEach((c) => c.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (busy || !r) return; busy = true; all.forEach((q) => { if (q !== c) q.timeScale().setVisibleLogicalRange(r); }); busy = false; }));
    // one crosshair for all panes, plus the floating tooltip on the price chart
    // only the pane under the pointer drives the others (programmatic crosshair moves also fire events)
    const firstSeries = new Map([[main, candle], [mac, ml], [rs, rl], [sto, sk]]);
    const els = new Map([[main, $("chart")], [mac, $("chMacd")], [rs, $("chRsi")], [sto, $("chStoch")]]);
    let hover = null;
    els.forEach((el, c) => { el.addEventListener("pointerenter", () => { hover = c; }); el.addEventListener("pointerleave", () => { if (hover === c) hover = null; }); });
    all.forEach((c) => c.subscribeCrosshairMove((p) => {
      if (c !== hover) return;
      const idx = p && p.time != null ? idxOf(p.time) : -1;
      ohlc(idx >= 0 ? idx : null);
      if (c === main) tip(p, idx); else hideTip();
      all.forEach((q) => {
        if (q === c || !q.setCrosshairPosition) return;
        const v = idx < 0 ? null : valueAt(q, idx);
        if (v == null) q.clearCrosshairPosition(); else q.setCrosshairPosition(v, p.time, firstSeries.get(q));
      });
    }));
    C = { main, mac, rs, sto, candle, line, ma, bb, sar, mh, ml, ms, rl, sk, sd, intra, all };
  }
  function valueAt(q, i) {
    if (!cur) return null; const I = cur.I;
    return q === C.main ? cur.B.c[i] : q === C.mac ? I.m.m[i] : q === C.rs ? I.r[i] : I.st.k[i];
  }
  function timeKey(t) { return typeof t === "object" && t ? `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}` : String(t); }
  function idxOf(t) { return cur && cur.ix.has(timeKey(t)) ? cur.ix.get(timeKey(t)) : -1; }
  const fP = (x, v) => v == null || !isFinite(v) ? "–" : isY(x) ? v.toFixed(3) : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fChg = (x, a, b) => a == null || b == null ? "–" : isY(x) ? sgn((b - a) * 100, 1) + " bp" : sgn((b / a - 1) * 100, 2) + "%";
  const word = (x, d) => isY(x) ? (d > 0 ? "Upturn" : "Downturn") : (d > 0 ? "Bullish" : "Bearish");

  function tip(p, i) {
    const el = $("chTip");
    if (!p || !p.point || i < 0 || p.point.x < 0) { hideTip(); return; }
    const { x, B, rv } = cur, pc = i ? B.c[i - 1] : null;
    const sigs = rv.list.filter((s) => s.i === i);
    el.innerHTML = `<b>${esc(B.lab(i))}</b><div class="g"><span>Open</span><span>${fP(x, B.o[i])}</span><span>High</span><span>${fP(x, B.h[i])}</span><span>Low</span><span>${fP(x, B.l[i])}</span><span>Close</span><span>${fP(x, B.c[i])}</span><span>Change</span><span class="${pc == null || B.c[i] >= pc ? "up" : "down"}">${fChg(x, pc, B.c[i])}</span></div>`
      + (sigs.length ? `<div class="rv">${sigs.map((s) => `<div class="${s.dir > 0 ? "up" : "down"}">${s.dir > 0 ? "▲" : "▼"} ${esc(s.name)}</div>`).join("")}</div>` : "");
    el.hidden = false;
    const W = $("chart").clientWidth, w = el.offsetWidth, hgt = el.offsetHeight, H = $("chart").clientHeight;
    let left = p.point.x + 16; if (left + w > W - 70) left = p.point.x - w - 16; if (left < 0) left = 4;
    let top = p.point.y - hgt / 2; top = Math.max(4, Math.min(H - hgt - 4, top));
    el.style.left = left + "px"; el.style.top = top + "px";
  }
  function hideTip() { $("chTip").hidden = true; }

  function ohlc(i) {
    if (!cur) return;
    const { x, B, I } = cur, k = i == null ? B.c.length - 1 : i, pc = k ? B.c[k - 1] : null, f = (v) => fP(x, v), u = B.intra ? "" : "";
    $("chOhlc").innerHTML = `<b>${esc(B.lab(k))}</b> O ${f(B.o[k])} H ${f(B.h[k])} L ${f(B.l[k])} C ${f(B.c[k])} <span class="${B.c[k] >= (pc == null ? B.c[k] : pc) ? "up" : "down"}">${pc == null ? "" : fChg(x, pc, B.c[k])}</span>`
      + `<span class="mut"> · MA5 ${f(I.ma5[k])} · MA10 ${f(I.ma10[k])} · MA30 ${f(I.ma30[k])} · MA100 ${f(I.ma100[k])}${u} · RSI ${I.r[k] == null ? "–" : I.r[k].toFixed(0)} · %K ${I.st.k[k] == null ? "–" : I.st.k[k].toFixed(0)} · MACD ${I.m.m[k] == null ? "–" : I.m.m[k].toFixed(isY(x) ? 3 : 2)}</span>`;
  }

  function viewRange() { const N = cur.B.c.length; return { from: cur.B.from - 0.5, to: N - 0.5 + 3 }; }
  function zoom(f) {
    if (!C) return; const ts = C.main.timeScale(), r = ts.getVisibleLogicalRange(); if (!r) return;
    const w = Math.max(8, (r.to - r.from) * f), c = (r.from + r.to) / 2;
    ts.setVisibleLogicalRange({ from: c - w / 2, to: c + w / 2 });
  }
  function jumpTo(i) {
    if (!C) return; const ts = C.main.timeScale(), r = ts.getVisibleLogicalRange(), w = r ? r.to - r.from : 60;
    ts.setVisibleLogicalRange({ from: i - w / 2, to: i + w / 2 });
    if (C.main.setCrosshairPosition) C.main.setCrosshairPosition(cur.B.c[i], cur.B.T[i], C.candle);
    ohlc(i);
    $("chart").closest(".panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function controls(x) {
    const rg = document.querySelector(".rng");
    rg.innerHTML = TF.map(([l]) => `<button type="button" data-tf="${l}" aria-pressed="${l === tf}">${l}</button>`).join("");
    rg.querySelectorAll("button").forEach((b) => b.onclick = () => { tf = b.dataset.tf; save(); chart(); });
    const tg = $("chInd");
    tg.innerHTML = IND.map(([k, l, col]) => `<button type="button" data-k="${k}" aria-pressed="${!!on[k]}">${col ? `<i style="background:${col}"></i>` : ""}${l}</button>`).join("");
    tg.querySelectorAll("button").forEach((b) => b.onclick = () => { on[b.dataset.k] = !on[b.dataset.k]; save(); chart(true); });
    document.querySelectorAll(".zm [data-st]").forEach((b) => { b.setAttribute("aria-pressed", b.dataset.st === style); b.onclick = () => { style = b.dataset.st; save(); chart(true); }; });
    document.querySelectorAll(".zm [data-z]").forEach((b) => b.onclick = () => { const z = b.dataset.z; if (z === "in") zoom(0.7); else if (z === "out") zoom(1 / 0.7); else if (C && cur) C.main.timeScale().setVisibleLogicalRange(viewRange()); });
  }

  function chart(keepView) {
    const x = M.items.find((i) => i.k === sel) || M.items[0]; if (!x) return;
    sel = x.k;
    const B = bars(x), N = B.c.length;
    if (N < 3) return;
    const flat = !B.intra && (!x.hist.o || (x.hsrc && /closes only/.test(x.hsrc)));
    const I = { ma5: sma(B.c, 5), ma10: sma(B.c, 10), ma30: sma(B.c, 30), ma100: sma(B.c, 100), bb: boll(B.c), sar: psar(B.h, B.l), m: macd(B.c), r: rsi(B.c, 14), st: stoch(B.h, B.l, B.c), atr: atrS(B.h, B.l, B.c) };
    const rv = reversals(B, I, flat);
    const ix = new Map(B.T.map((t, i) => [String(t), i]));
    const prevView = keepView && C && cur && cur.x.k === x.k && cur.B.intra === B.intra ? C.main.timeScale().getVisibleLogicalRange() : null;
    cur = { x, B, I, rv, ix, flat };
    $("chH").textContent = x.name + (x.contract && !isY(x) ? ` · ${x.contract}` : "") + ` · ${tf} · ${B.unitP}`;
    controls(x);
    ["macd", "rsi", "stoch"].forEach((k) => { $({ macd: "chMacd", rsi: "chRsi", stoch: "chStoch" }[k]).hidden = !on[k]; });
    if (window.LightweightCharts) {
      if (!C || C.intra !== B.intra) build(B.intra);
      const pf = isY(x) ? { type: "custom", formatter: (v) => v.toFixed(3) + "%", minMove: 0.001 } : { type: "price", precision: 2, minMove: 0.01 };
      const pts = (a) => B.T.map((t, i) => a[i] == null ? { time: t } : { time: t, value: a[i] });
      const up = css("--up"), dn = css("--down");
      C.candle.applyOptions({ priceFormat: pf, visible: style === "candle" });
      C.candle.setData(B.T.map((t, i) => ({ time: t, open: B.o[i], high: B.h[i], low: B.l[i], close: B.c[i] })));
      C.line.applyOptions({ priceFormat: pf, visible: style === "line" });
      C.line.setData(pts(B.c));
      ["ma5", "ma10", "ma30", "ma100"].forEach((k) => { C.ma[k].applyOptions({ priceFormat: pf, visible: !!on[k] }); C.ma[k].setData(pts(I[k])); });
      ["up", "mid", "lo"].forEach((k) => { C.bb[k].applyOptions({ priceFormat: pf, visible: !!on.bb }); C.bb[k].setData(pts(I.bb[k])); });
      C.sar.applyOptions({ priceFormat: pf, visible: !!on.sar }); C.sar.setData(pts(I.sar.out));
      C.mh.setData(B.T.map((t, i) => I.m.hist[i] == null ? { time: t } : { time: t, value: I.m.hist[i], color: I.m.hist[i] >= 0 ? up : dn }));
      C.ml.setData(pts(I.m.m)); C.ms.setData(pts(I.m.sig));
      C.rl.setData(pts(I.r)); C.sk.setData(pts(I.st.k)); C.sd.setData(pts(I.st.d));
      // reversal markers: one arrow per bar and direction; bigger, with a count, where several signals agree (names in the tooltip)
      const target = style === "candle" ? C.candle : C.line, other = style === "candle" ? C.line : C.candle;
      other.setMarkers([]);
      if (on.rev) {
        const g = new Map();
        rv.list.forEach((s) => { const k = s.i + ":" + s.dir; if (!g.has(k)) g.set(k, { i: s.i, dir: s.dir, codes: [] }); const q = g.get(k); if (!q.codes.includes(s.code)) q.codes.push(s.code); });
        target.setMarkers([...g.values()].sort((a, b) => a.i - b.i || a.dir - b.dir).map((q) => ({ time: B.T[q.i], position: q.dir > 0 ? "belowBar" : "aboveBar", shape: q.dir > 0 ? "arrowUp" : "arrowDown",
          color: q.dir > 0 ? up : dn, size: q.codes.length > 1 ? 1.4 : 0.8, text: q.codes.length > 1 ? `${q.codes.length}×` : "" })));
      } else target.setMarkers([]);
      C.main.timeScale().setVisibleLogicalRange(prevView || viewRange());
    }
    ohlc(null);
    ta(); revPanel(); stats();
  }

  function stats() {
    const { x, B, I } = cur, S = series(x), N = B.c.length, from = B.from;
    const last = nth(B.c, -1), hi = Math.max(...B.h.slice(from)), lo = Math.min(...B.l.slice(from)), first = B.c[from] ?? B.c[0];
    const delta = (a) => a == null ? "–" : isY(x) ? sgn((last - a) * 100, 0) + " bp" : sgn((last / a - 1) * 100, 1) + "%";
    const av = nth(I.atr, -1);
    $("stats").innerHTML = `<div>Last<span>${fmtV(x, last)}</span></div><div>${tf} change<span class="${last >= first ? "up" : "down"}">${delta(first)}</span></div><div>1 month<span>${delta(at(S, 30))}</span></div><div>1 year<span>${delta(at(S, 365))}</span></div>
      <div>${tf} high<span>${fmtV(x, hi)}</span></div><div>${tf} low<span>${fmtV(x, lo)}</span></div>
      <div>ATR 14 (${B.intra ? "30 min" : "daily"})<span>${av == null ? "–" : isY(x) ? (av * 100).toFixed(1) + " bp" : fmtV(x, av)}</span></div>`;
    const u = B.intra ? "30-minute bars" : "daily bars";
    $("chNote").textContent = `Quote: ${x.src}${x.realtime ? " (real time)" : " (may be delayed)"}, ${sgt(x.time)} SGT. History: ${B.src}, ${u} from ${B.lab(from)}; the latest bar includes the latest quote.`
      + `${tf === "1W" && !B.intra ? " 30-minute bars are not available yet for this instrument, so the 1-week view uses daily bars." : ""}`
      + ` Indicators use ${u}: simple moving averages (5, 10, 30, 100 bars), Bollinger Bands (20, 2), Parabolic SAR (0.02, 0.2), MACD (12, 26, 9), RSI 14, stochastic (14, 3, 3), ATR 14.`
      + `${cur.flat ? " This history has closes only, so candles show the close and candlestick patterns are skipped." : ""}${isY(x) ? " For yields, a rising candle means a higher yield (lower bond price)." : " Front-month futures; the contract rolls before expiry."}`;
  }

  // ---------- technical analysis panel ----------
  function ta() {
    const { x, B, I, rv } = cur, n = B.c.length - 1, px = B.c[n], Y = isY(x), u = B.intra ? "30-minute" : "daily", ub = B.intra ? "bar" : "day";
    const f = (v) => fmtV(x, v), rows = [];
    const row = (k, v, s, st) => rows.push({ k, v, s, st });
    const dist = (v) => Y ? sgn((px - v) * 100, 0) + " bp" : sgn((px / v - 1) * 100, 1) + "%";
    const m30 = I.ma30[n], m100 = I.ma100[n];
    let trend = "neut";
    if (m30 != null) {
      const a30 = px > m30, a100 = m100 == null ? a30 : px > m100; trend = a30 && a100 ? "bull" : !a30 && !a100 ? "bear" : "neut";
      row("Trend", f(px), trend === "bull" ? `Above the 30 and 100-${ub} averages` : trend === "bear" ? `Below the 30 and 100-${ub} averages` : `Between the 30 and 100-${ub} averages`, trend);
    }
    const ms = [I.ma5[n], I.ma10[n], I.ma30[n], I.ma100[n]].filter((v) => v != null);
    let stack = "neut";
    if (ms.length >= 3) {
      const upO = ms.every((v, i) => !i || ms[i - 1] > v), dnO = ms.every((v, i) => !i || ms[i - 1] < v); stack = upO ? "bull" : dnO ? "bear" : "neut";
      row("MA stack", ms.map((v) => fP(x, v)).join(" · "), upO ? "5 > 10 > 30 > 100: rising order" : dnO ? "5 < 10 < 30 < 100: falling order" : "Averages tangled: no clean trend", stack);
    }
    if (m30 != null) row(`SMA 30 / 100`, `${dist(m30)}${m100 != null ? " / " + dist(m100) : ""}`, `Price ${px > m30 ? "above" : "below"} the 30-${ub}${m100 != null ? ` and ${px > m100 ? "above" : "below"} the 100-${ub}` : ""} average`, null);
    const M = I.m; let mState = "neut", mTxt = "";
    if (M.hist[n] != null) {
      let ci = null; for (let i = n; i > 0; i--) if (M.hist[i] != null && M.hist[i - 1] != null && (M.hist[i] > 0) !== (M.hist[i - 1] > 0)) { ci = i; break; }
      const upM = M.hist[n] > 0, rising = M.hist[n] > M.hist[n - 1]; mState = upM ? (rising ? "bull" : "neut") : (rising ? "neut" : "bear");
      mTxt = `MACD is ${upM ? "above" : "below"} its signal${ci != null ? ` (crossed ${B.short(ci)})` : ""} and the histogram is ${rising ? "rising" : "falling"}`;
      row("MACD", `${M.m[n].toFixed(Y ? 3 : 2)} / ${M.sig[n].toFixed(Y ? 3 : 2)}`, mTxt.replace(/^MACD is /, "").replace(/^./, (c) => c.toUpperCase()), mState);
    }
    const r = I.r[n];
    if (r != null) row("RSI 14", r.toFixed(0), r >= 70 ? "Overbought: above 70" : r <= 30 ? "Oversold: below 30" : r >= 50 ? "Above 50: buyers in control" : "Below 50: sellers in control", r >= 70 || r <= 30 ? "neut" : r >= 50 ? "bull" : "bear");
    const K = I.st.k[n], D = I.st.d[n];
    if (K != null && D != null) row("Stochastic", `${K.toFixed(0)} / ${D.toFixed(0)}`, `${K > 80 ? "Overbought zone" : K < 20 ? "Oversold zone" : "Mid-range"}, %K ${K >= D ? "above" : "below"} %D`, K > 80 || K < 20 ? "neut" : K >= D ? "bull" : "bear");
    const sp = I.sar;
    if (sp.out[n] != null) {
      let fi = null; for (let i = n; i > 2; i--) if (sp.tr[i] != null && sp.tr[i - 1] != null && sp.tr[i] !== sp.tr[i - 1]) { fi = i; break; }
      row("Parabolic SAR", f(sp.out[n]), `${sp.tr[n] ? "Dots below price: uptrend" : "Dots above price: downtrend"}${fi != null ? ` since ${B.short(fi)}` : ""}`, sp.tr[n] ? "bull" : "bear");
    }
    const bb = I.bb;
    if (bb.up[n] != null) {
      const pb = (px - bb.lo[n]) / (bb.up[n] - bb.lo[n]);
      row("Bollinger %B", pb.toFixed(2), pb > 1 ? "Above the upper band: stretched" : pb < 0 ? "Below the lower band: stretched" : pb >= 0.5 ? "Upper half of the bands" : "Lower half of the bands", pb > 1 || pb < 0 ? "neut" : pb >= 0.5 ? "bull" : "bear");
    }
    const av = I.atr[n];
    if (av != null) row(`ATR 14 (${u})`, Y ? (av * 100).toFixed(1) + " bp" : f(av), Y ? "Average true range per bar" : `${(av / px * 100).toFixed(2)}% of price per bar`, null);
    const scored = rows.filter((q) => q.st), bulls = scored.filter((q) => q.st === "bull").length, bears = scored.filter((q) => q.st === "bear").length;
    const lab = (st) => st === "bull" ? (Y ? "Rising" : "Bullish") : st === "bear" ? (Y ? "Falling" : "Bearish") : "Neutral";
    $("taScore").textContent = `${bulls} of ${scored.length} ${Y ? "point up" : "bullish"}`;
    $("taMeter").style.width = (scored.length ? bulls / scored.length * 100 : 0) + "%";
    $("taSig").innerHTML = rows.map((q) => `<div><span class="k">${esc(q.k)}</span><span class="v">${esc(q.v)}</span>${q.st ? `<span class="pill p-${q.st}">${lab(q.st)}</span>` : ""}<span class="s">${esc(q.s)}</span></div>`).join("");

    // written read
    const from = B.from, first = B.c[from], hi = Math.max(...B.h.slice(from)), lo = Math.min(...B.l.slice(from)), pos = hi > lo ? (px - lo) / (hi - lo) * 100 : 50;
    const ratio = scored.length ? bulls / scored.length : 0.5, bias = ratio >= 0.65 ? "bull" : ratio <= 0.35 ? "bear" : "neut";
    const biasTxt = Y ? (bias === "bull" ? "Yield trend: rising" : bias === "bear" ? "Yield trend: falling" : "Yield trend: sideways") : (bias === "bull" ? "Technical bias: bullish" : bias === "bear" ? "Technical bias: bearish" : "Technical bias: neutral");
    const L = levels(B, from, rv, av);
    const nm = isY(x) ? `the ${x.short}${/yield/i.test(x.short) ? "" : " yield"}` : x.short.toLowerCase();
    const p1 = `Over this ${tf} window ${nm} has moved ${Y ? sgn((px - first) * 100, 0) + " bp" : sgn((px / first - 1) * 100, 1) + "%"}, from ${f(first)} to ${f(px)}, trading between ${f(lo)} and ${f(hi)}; it sits ${pos.toFixed(0)}% of the way up that range. `
      + (trend === "bull" ? `Price is above its 30 and 100-${ub} averages` : trend === "bear" ? `Price is below its 30 and 100-${ub} averages` : `Price is caught between its 30 and 100-${ub} averages`)
      + (stack === "bull" ? " and the averages are stacked in rising order, a clean uptrend." : stack === "bear" ? " and the averages are stacked in falling order, a clean downtrend." : ", with the averages tangled, so the trend is not clean.");
    const p2 = `Momentum: RSI is ${r == null ? "–" : r.toFixed(0)}${r >= 70 ? " (overbought)" : r <= 30 ? " (oversold)" : ""}, ${mTxt || "MACD is not available yet"}, and the stochastic reads ${K == null ? "–" : K.toFixed(0)}${K > 80 ? " in overbought territory" : K < 20 ? " in oversold territory" : ""}.`
      + (sp.out[n] != null ? ` Parabolic SAR ${sp.tr[n] ? "is below price, trailing the move at " : "is above price, capping it at "}${f(sp.out[n])}.` : "");
    const W = recent();
    const rWord = (d) => Y ? (d > 0 ? "upturn" : "downturn") : (d > 0 ? "bullish" : "bearish");
    let p3 = W.bull.length || W.bear.length
      ? `Reversal watch: ${[W.bull.length ? `${W.bull.length} ${rWord(1)} (${[...new Set(W.bull.map((s) => s.name))].join(", ")})` : "", W.bear.length ? `${W.bear.length} ${rWord(-1)} (${[...new Set(W.bear.map((s) => s.name))].join(", ")})` : ""].filter(Boolean).join(" and ")} signal${W.bull.length + W.bear.length > 1 ? "s" : ""} in the last ${W.k} ${B.intra ? "bars" : "sessions"}`
        + (W.bull.length > W.bear.length && trend === "bear" ? ", pushing against the downtrend: a bounce is possible if price holds support." : W.bear.length > W.bull.length && trend === "bull" ? ", pushing against the uptrend: watch for a pullback if resistance holds." : W.bull.length > W.bear.length ? ", in line with the current trend." : W.bear.length > W.bull.length ? ", in line with the current trend." : ", pointing both ways.")
      : `Reversal watch: no reversal signals in the last ${W.k} ${B.intra ? "bars" : "sessions"}${W.last ? `; the most recent was a ${rWord(W.last.dir)} ${W.last.name.toLowerCase()} on ${B.short(W.last.i)}` : ""}.`;
    const s1 = L.S[0], r1 = L.R[0];
    p3 += ` ${s1 ? `Nearest support is ${f(s1.p)} (${dist(s1.p)} away)` : `No support below in this window`}; ${r1 ? `nearest resistance is ${f(r1.p)} (${dist(r1.p)} away)` : "price is at the top of this window, with no resistance above"}.`
      + (s1 && r1 ? ` A close below ${f(s1.p)} would weaken the picture; a close above ${f(r1.p)} would strengthen it.` : "");
    $("taRead").innerHTML = `<div class="asof">Technical read · ${tf} · ${u} · ${esc(B.lab(n))}</div>
      <span class="bias pill p-${bias}">${biasTxt} · ${bulls} of ${scored.length}</span>
      <p>${esc(p1)}</p><p>${esc(p2)}</p><p>${esc(p3)}</p>
      <p class="note">Generated from the indicators on this page, not a forecast or investment advice.${Y ? " Rising yields mean falling bond prices." : ""}</p>`;
    const lr = (cls, labl, q) => `<tr><td><span class="lt ${cls}">${labl}</span>${f(q.p)}</td><td class="${q.p >= px ? "up" : "down"}">${Y ? sgn((q.p - px) * 100, 0) + " bp" : sgn((q.p / px - 1) * 100, 1) + "%"}</td><td>${esc(q.k)}${q.n > 1 ? ` · ${q.n} touches` : ""} · ${esc(B.short(q.i))}</td></tr>`;
    $("taLvl").innerHTML = `<h3>Key levels</h3><table class="lvl"><thead><tr><th>Level</th><th>From price</th><th>Basis</th></tr></thead><tbody>
      ${L.R.slice().reverse().map((q, i, a) => lr("r", "R" + (a.length - i), q)).join("")}
      <tr class="now"><td>Last ${f(px)}</td><td></td><td>${esc(B.lab(n))}</td></tr>
      ${L.S.map((q, i) => lr("s", "S" + (i + 1), q)).join("")}</tbody></table>
      <p class="note">Swing highs and lows (3 bars each side) and the window's extremes, merged when within 0.6 ATR of each other. Drawn on the chart when Levels is on.</p>`;
    // level lines on the chart
    if (C) {
      const tgt = style === "candle" ? C.candle : C.line;
      lvLines.forEach(([s, l]) => { try { s.removePriceLine(l); } catch (e) {} }); lvLines = [];
      if (on.lv) {
        L.R.forEach((q, i) => lvLines.push([tgt, tgt.createPriceLine({ price: q.p, color: css("--down"), lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: "R" + (i + 1) })]));
        L.S.forEach((q, i) => lvLines.push([tgt, tgt.createPriceLine({ price: q.p, color: css("--up"), lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: "S" + (i + 1) })]));
      }
    }
  }

  function recent() {
    const { B, rv } = cur, n = B.c.length - 1, k = B.intra ? 16 : 5;
    const inW = rv.list.filter((s) => s.i > n - k);
    const last = rv.list.length ? nth(rv.list, -1) : null;
    return { k, bull: inW.filter((s) => s.dir > 0), bear: inW.filter((s) => s.dir < 0), last };
  }

  let rvAll = false;
  function revPanel() {
    const { x, B, rv } = cur, from = B.from, Y = isY(x);
    const W = recent(), list = rv.list.filter((s) => s.i >= from).slice().reverse();
    const nb = list.filter((s) => s.dir > 0).length, ns = list.length - nb;
    const lead = W.bull.length > W.bear.length ? [1, `${Y ? "Upturn" : "Bullish"} reversal signals are clustering`] : W.bear.length > W.bull.length ? [-1, `${Y ? "Downturn" : "Bearish"} reversal signals are clustering`] : W.bull.length ? [0, "Reversal signals point both ways"] : [0, "No fresh reversal signals"];
    $("rvWatch").innerHTML = `<div><div class="asof">Last ${W.k} ${B.intra ? "30-minute bars" : "sessions"}</div><div class="big ${lead[0] > 0 ? "up" : lead[0] < 0 ? "down" : ""}">${lead[1]}</div></div>
      <div class="cnt">▲ ${W.bull.length} ${Y ? "upturn" : "bullish"} · ▼ ${W.bear.length} ${Y ? "downturn" : "bearish"}</div>
      <div class="cnt">In the ${tf} window: ▲ ${nb} · ▼ ${ns}</div>`;
    const cnt = (s) => rv.list.filter((q) => q.dir === s.dir && Math.abs(q.i - s.i) <= 2).length;
    $("rvTab").innerHTML = list.length
      ? `<div class="rvr rvh"><span>${B.intra ? "Bar (SGT)" : "Date"}</span><span>Signal</span><span>Pattern</span><span style="text-align:right">Close</span></div>`
        + list.slice(0, rvAll ? list.length : 15).map((s) => `<button type="button" class="rvr" data-i="${s.i}"><span class="d">${esc(B.short(s.i))}</span><span><span class="pill p-${s.dir > 0 ? "bull" : "bear"}">${s.dir > 0 ? "▲" : "▼"} ${word(x, s.dir)}</span></span><span>${esc(s.name)}${cnt(s) > 1 ? ` <span class="score">· ${cnt(s)} signals within 2 bars</span>` : ""}<small>${esc(s.why)}</small></span><span class="px">${fmtV(x, B.c[s.i])}</span></button>`).join("")
        + (list.length > 15 ? `<button type="button" class="more" id="rvMore" style="margin:10px 14px">${rvAll ? "Show fewer" : `Show all ${list.length}`}</button>` : "")
      : `<p class="sub" style="padding:12px 16px;margin:0">No reversal signals in this window.</p>`;
    $("rvTab").querySelectorAll("button.rvr").forEach((b) => b.onclick = () => jumpTo(+b.dataset.i));
    const mb = $("rvMore"); if (mb) mb.onclick = () => { rvAll = !rvAll; revPanel(); };
  }

  // double-click the price chart to go back to the selected time frame
  $("chart").addEventListener("dblclick", () => { if (C && cur) C.main.timeScale().setVisibleLogicalRange(viewRange()); });
  $("chart").addEventListener("mouseleave", hideTip);

  // ---------- yield curves: US, Germany, France, or all three today ----------
  const CV = [["us", "US Treasuries", "us"], ["de", "German Bunds", "de"], ["fr", "French OATs", "fr"], ["all", "All", ""]];
  let cv = null, cvS = [], cvSel = "us";
  try { cvSel = localStorage.getItem("macro-curve") || cvSel; } catch (e) {}
  function curveSet(pre) { return ["2y", "5y", "10y", "30y"].map((t) => M.items.find((i) => i.k === pre + t)); }
  function curve() {
    const have = CV.filter(([k]) => k === "all" ? CV.slice(0, 3).filter(([q]) => curveSet(q).every(Boolean)).length > 1 : curveSet(k).every(Boolean));
    if (!have.length) { $("curve").closest("section").hidden = true; return; }
    $("curve").closest("section").hidden = false;
    if (!have.find(([k]) => k === cvSel)) cvSel = have[0][0];
    const sw = $("cvSel");
    sw.innerHTML = have.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === cvSel}">${l}</button>`).join("");
    sw.querySelectorAll("button").forEach((b) => b.onclick = () => { cvSel = b.dataset.k; try { localStorage.setItem("macro-curve", cvSel); } catch (e) {} curve(); });
    const lab = ["2Y", "5Y", "10Y", "30Y"], yrs = [2, 5, 10, 30];
    const last = (x) => nth(series(x).c, -1);
    let rows, tab;
    const bp = (a, b) => a == null || b == null ? "–" : sgn((a - b) * 100, 0) + " bp";
    if (cvSel === "all") {
      const cols = { us: css("--accent"), de: "#d97706", fr: "#7c3aed" };
      const sets = CV.slice(0, 3).filter(([k]) => curveSet(k).every(Boolean)).map(([k, l]) => [k, l, curveSet(k).map(last)]);
      rows = sets.map(([k, l, v]) => [l, v, cols[k], 2]);
      const by = Object.fromEntries(sets.map(([k, , v]) => [k, v]));
      const cell = (v) => v == null ? "–" : v.toFixed(2) + "%";
      tab = `<table class="ctab"><thead><tr><th></th>${sets.map(([k]) => `<th>${{ us: "US", de: "Bund", fr: "OAT" }[k]}</th>`).join("")}${by.fr && by.de ? "<th>OAT–Bund</th>" : ""}${by.us && by.de ? "<th>UST–Bund</th>" : ""}</tr></thead><tbody>
        ${lab.map((l, i) => `<tr><td>${l}</td>${sets.map(([, , v]) => `<td>${cell(v[i])}</td>`).join("")}${by.fr && by.de ? `<td>${bp(by.fr[i], by.de[i])}</td>` : ""}${by.us && by.de ? `<td>${bp(by.us[i], by.de[i])}</td>` : ""}</tr>`).join("")}
        <tr><td>10Y–2Y</td>${sets.map(([, , v]) => `<td class="${v[2] - v[0] < 0 ? "down" : ""}">${bp(v[2], v[0])}</td>`).join("")}${by.fr && by.de ? "<td></td>" : ""}${by.us && by.de ? "<td></td>" : ""}</tr></tbody></table>
        <p class="note">Today's curves side by side. OAT–Bund is France's spread over Germany, a gauge of French credit and political risk; UST–Bund is the US premium over Germany.</p>`;
    } else {
      const Y = curveSet(cvSel), now = Y.map(last), m1 = Y.map((x) => at(series(x), 30)), y1 = Y.map((x) => at(series(x), 365));
      rows = [["Now", now, css("--accent"), 2], ["1 month ago", m1, css("--muted"), 1], ["1 year ago", y1, "#d97706", 1]];
      const sp = (v) => v.some((z) => z == null) ? [null, null] : [v[2] - v[0], v[3] - v[2]];
      const [s1, s2] = sp(now), [m1a, m1b] = sp(m1), [y1a, y1b] = sp(y1);
      // spread over Bunds for the French curve
      const de = cvSel === "fr" && curveSet("de").every(Boolean) ? curveSet("de") : null;
      const d10 = de ? [last(de[2]), at(series(de[2]), 30), at(series(de[2]), 365)] : null;
      tab = `<table class="ctab"><thead><tr><th></th><th>Now</th><th>1M chg</th><th>1Y chg</th></tr></thead><tbody>
        ${Y.map((x, i) => `<tr><td>${lab[i]}</td><td>${now[i].toFixed(2)}%</td><td>${bp(now[i], m1[i])}</td><td>${bp(now[i], y1[i])}</td></tr>`).join("")}
        <tr><td>10Y–2Y</td><td class="${s1 < 0 ? "down" : ""}">${s1 == null ? "–" : sgn(s1 * 100, 0) + " bp"}</td><td>${bp(s1, m1a)}</td><td>${bp(s1, y1a)}</td></tr>
        <tr><td>30Y–10Y</td><td>${s2 == null ? "–" : sgn(s2 * 100, 0) + " bp"}</td><td>${bp(s2, m1b)}</td><td>${bp(s2, y1b)}</td></tr>
        ${d10 ? (() => { const n0 = now[2] - d10[0], n1 = m1[2] != null && d10[1] != null ? m1[2] - d10[1] : null, n2 = y1[2] != null && d10[2] != null ? y1[2] - d10[2] : null; return `<tr><td>OAT–Bund 10Y</td><td>${sgn(n0 * 100, 0)} bp</td><td>${bp(n0, n1)}</td><td>${bp(n0, n2)}</td></tr>`; })() : ""}</tbody></table>
        <p class="note">Curve points use the latest quote; 1-month and 1-year values are daily closes from the same history as the chart.</p>`;
    }
    if (window.LightweightCharts) {
      // years-to-maturity on a time axis: fake timestamps so spacing is proportional to maturity
      const T = (y) => 86400 * 30 * y;
      if (!cv) cv = LightweightCharts.createChart($("curve"), { autoSize: true, layout: { background: { color: "transparent" }, textColor: css("--muted"), fontFamily: css("--f-mono"), fontSize: 11 },
        grid: { vertLines: { visible: false }, horzLines: { color: css("--line") } }, rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, tickMarkFormatter: (t) => { const i = yrs.findIndex((y) => T(y) === t); return i >= 0 ? lab[i] : ""; } },
        localization: { locale: "en-US", timeFormatter: (t) => { const i = yrs.findIndex((y) => T(y) === t); return i >= 0 ? lab[i] : ""; } },
        handleScroll: false, handleScale: false });
      cvS.forEach((q) => cv.removeSeries(q)); cvS = [];
      for (const [, v, col, w] of rows.slice().reverse()) {
        if (v.some((z) => z == null)) continue;
        const q = cv.addLineSeries({ color: col, lineWidth: w, priceFormat: { type: "custom", formatter: (z) => z.toFixed(2) + "%" }, lastValueVisible: false, priceLineVisible: false, pointMarkersVisible: true });
        q.setData(yrs.map((y, i) => ({ time: T(y), value: v[i] }))); cvS.push(q);
      }
      cv.timeScale().fitContent();
    }
    $("cvLeg").innerHTML = rows.map(([n, , col, w]) => `<span><i style="background:${col};height:${w + 1}px"></i>${n}</span>`).join("");
    $("cvTab").innerHTML = tab;
  }

  let calShown = 0;
  function calendar() {
    const host = $("cal"), f = $("calFlt");
    const F = [["us", "US"], ["high", "High impact, all"], ["all", "All"]];
    f.innerHTML = F.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === calFilter}">${l}</button>`).join("");
    f.querySelectorAll("button").forEach((b) => b.onclick = () => { calFilter = b.dataset.k; try { localStorage.setItem("macro-cal", calFilter); } catch (e) {} calShown = 0; calendar(); });
    if (!CAL || !CAL.events) { host.innerHTML = `<p class="sub">The calendar could not be loaded right now.</p>`; return; }
    const ok = (e) => calFilter === "all" ? true : calFilter === "high" ? e.imp === "High" : e.c === "USD" || (e.c === "All" && e.imp !== "Low");
    const evs = CAL.events.filter(ok), now = Date.now() / 1000;
    const dayK = (s) => new Date(s * 1000).toLocaleDateString("en-CA", { timeZone: TZ }), today = dayK(now);
    const limit = calShown || 200;
    let html = `<div class="chead2"><span>SGT</span><span></span><span>Event</span><span>Forecast</span><span>Previous</span></div>`, last = "";
    evs.slice(0, limit).forEach((e) => {
      const k = dayK(e.ts);
      if (k !== last) { last = k; html += `<div class="cday${k === today ? " today" : ""}">${k === today ? "Today · " : ""}${new Date(e.ts * 1000).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })}</div>`; }
      const tm = new Date(e.ts * 1000).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
      html += `<div class="crow${e.ts < now - 3600 ? " past" : ""}"><span class="tm">${tm}</span><span class="cc">${esc(e.c)}</span><span><i class="imp ${esc(e.imp)}" title="${esc(e.imp)} impact"></i>${esc(e.t)}${e.act ? ` · <b>${esc(e.act)}</b>` : ""}</span>
        <span class="num"><b>Fcst</b>${esc(e.fc || "–")}</span><span class="num"><b>Prev</b>${esc(e.pv || "–")}</span></div>`;
    });
    host.innerHTML = evs.length ? `<div class="cal">${html}</div>` + (evs.length > limit ? `<button type="button" class="more">Show all (${evs.length})</button>` : "") : `<p class="sub">No events for this filter.</p>`;
    const m = host.querySelector(".more"); if (m) m.onclick = () => { calShown = evs.length; calendar(); };
    $("calSub").textContent = `This week and next, in Singapore time, updated ${sgt(CAL.updated)} SGT. Dots mark expected market impact (red high, orange medium, yellow low).`;
  }

  async function getJSON(u) { try { const r = await fetch(u + "?t=" + Date.now(), { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
  async function load() {
    const [m, c] = await Promise.all([getJSON("../data/macro.json"), getJSON("../data/macro-cal.json")]);
    const mChanged = m && m.items && m.items.length && (!M || m.updated !== M.updated);
    if (mChanged) { M = m; tiles(); chart(); curve(); }
    else if (!M) { $("tC").innerHTML = `<p class="sub">Macro prices could not be loaded right now.</p>`; }
    if (c && (!CAL || c.updated !== CAL.updated)) { CAL = c; calendar(); } else if (!CAL) calendar();
  }
  load(); setInterval(load, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
