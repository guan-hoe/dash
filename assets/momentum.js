/* Portfolio tab: renders data/momentum-portfolio.json (built daily by
   scripts/momentum-portfolio.py) — holdings, KPIs, growth and drawdown charts
   (TradingView Lightweight Charts), the drawdown review, weights over time and
   the momentum ranking. */
(function () {
  const $ = (id) => document.getElementById(id);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const pct = (x, d = 1) => (x == null || isNaN(x) ? "—" : (x * 100).toFixed(d) + "%");
  const spct = (x, d = 1) => (x == null || isNaN(x) ? "—" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(d) + "%");
  const num = (x, d = 2) => (x == null || isNaN(x) ? "—" : x.toFixed(d));
  const cls = (x) => (x > 0 ? "pos" : x < 0 ? "neg" : "");
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fd = (s, y = true) => { if (!s) return "—"; const [Y, M, D] = s.split("-").map(Number); return `${MON[M - 1]} ${D}${y ? ", " + Y : ""}`; };
  const pts = (x) => (x * 100).toFixed(1).replace("-", "−") + " pts";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let D, names = {}, folders = {};
  let range = "all", show = { nav: true, raw: true, ew: true, spy: true };
  let c1, c2, s1 = {}, s2 = {}, syncing = false;

  fetch("../data/momentum-portfolio.json?t=" + Date.now()).then((r) => r.json()).then((d) => {
    D = d;
    d.scores.forEach((s) => { names[s.tk] = s.n; folders[s.tk] = s.f; });
    d.holdings.forEach((h) => { names[h.tk] = h.n; folders[h.tk] = h.f; });
    kpis(); holdings(); next(); controls(); charts(); review(); weights(); scores(); rules();
    $("foot").textContent = `Backtest from ${fd(d.start)} to the ${fd(d.updated)} close, rebuilt from the dashboard's daily prices after every US session. Results are simulated: they include 0.10% trading costs and a ${pct(d.rules.cash_rate)} cash rate, but not taxes, slippage on large orders or the bias of testing on a stock list picked today. For information only, not investment advice.`;
  }).catch((e) => { $("kpi").innerHTML = `<p class="note">Portfolio data not available yet (${esc(e.message)}).</p>`; });

  const link = (tk) => folders[tk] ? `<a href="../${folders[tk]}/">${tk}</a>` : tk;

  /* ---------- KPI tiles ---------- */
  function kpis() {
    const s = D.stats, e = D.stats_ew, p = D.stats_spy;
    const cur = D.dd[D.dd.length - 1], inv = 1 - D.cash;
    const vs = (a, b, f = spct) => (b ? `${f(a)} · ` : "");
    const t = [
      ["Total return", spct(s.total, 0), `Since ${fd(D.start)}. Equal-weight ${spct(e.total, 0)}${p ? ` · S&P 500 ${spct(p.total, 0)}` : ""}`, cls(s.total)],
      ["Annual return", spct(s.cagr, 0), `Compounded. Equal-weight ${spct(e.cagr, 0)}${p ? ` · S&P 500 ${spct(p.cagr, 0)}` : ""}`, cls(s.cagr)],
      ["Sharpe ratio", num(s.sharpe), `Excess return per unit of risk. Equal-weight ${num(e.sharpe)}${p ? ` · S&P 500 ${num(p.sharpe)}` : ""}`],
      ["Sortino ratio", num(s.sortino), `Counts only downside swings. Equal-weight ${num(e.sortino)}`],
      ["Max drawdown", pct(s.mdd), `Deepest fall from a high. Without the volatility control ${pct(D.stats_raw.mdd)}`, "neg", true],
      ["From its high", cur < -0.0005 ? pct(cur) : "At a high", cur < -0.0005 ? `Below its peak as of ${fd(D.updated)}` : `New high on ${fd(D.updated)}`, cur < 0 ? "neg" : "pos"],
      ["Volatility", pct(s.vol, 0), `Annualized. Target ${pct(D.rules.vol_target, 0)}; equal-weight ${pct(e.vol, 0)}`],
      ["Invested", pct(inv, 0), D.cash > 0.001 ? `${pct(D.cash, 0)} in cash to hold the volatility target` : "Fully invested, no cash"],
    ];
    $("kpi").innerHTML = t.map(([b, v, sm, c, hl]) => `<div class="tile${hl ? " hl" : ""}"><b>${b}</b><span class="v ${c || ""}">${v}</span><small>${sm}</small></div>`).join("");
  }

  /* ---------- holdings ---------- */
  const PAL = ["--g1", "--g2", "--g3", "--g4", "--g5", "--g6", "--g7", "--g8", "--g9", "--g10"];
  function holdings() {
    const H = D.holdings;
    $("nowSub").textContent = `Set at the ${fd(D.rebalanced)} rebalance. "Now" is each weight after prices have moved since then; the next rebalance is at Friday's close.`;
    const bar = H.map((h, i) => `<span style="width:${h.now * 100}%;background:var(${PAL[i]})" title="${h.tk} ${pct(h.now)}"></span>`).join("") +
      (D.cash > 0.001 ? `<span style="width:${D.cash * 100}%;background:var(--cash)" title="Cash ${pct(D.cash)}"></span>` : "");
    const leg = H.map((h, i) => `<span><i style="background:var(${PAL[i]})"></i>${h.tk} ${pct(h.now)}</span>`).join("") + (D.cash > 0.001 ? `<span><i style="background:var(--cash)"></i>Cash ${pct(D.cash)}</span>` : "");
    $("hold").innerHTML = `<div class="wbar">${bar}</div><div class="wleg" style="margin-bottom:12px">${leg}</div>
    <table class="st"><thead><tr><th>Stock</th><th class="r">Target</th><th class="r">Now</th><th>Held since</th><th class="r">Since then</th><th class="r">6M mom.</th><th class="r">3M mom.</th><th class="r">Volatility</th><th class="r">Rank</th></tr></thead><tbody>
    ${H.map((h) => `<tr><td>${link(h.tk)} <span style="color:var(--muted);font-size:12.5px">${esc(h.n)}</span></td><td class="mono r">${pct(h.target)}</td><td class="mono r">${pct(h.now)}</td><td class="mono">${fd(h.since, false)}</td><td class="mono r ${cls(h.ret_since)}">${spct(h.ret_since)}</td><td class="mono r ${cls(h.m6)}">${spct(h.m6, 0)}</td><td class="mono r ${cls(h.m3)}">${spct(h.m3, 0)}</td><td class="mono r">${pct(h.vol, 0)}</td><td class="mono r">#${h.rank ?? "—"}</td></tr>`).join("")}
    ${D.cash > 0.001 ? `<tr class="off"><td>Cash</td><td class="mono r">${pct(D.cash)}</td><td class="mono r">${pct(D.cash)}</td><td colspan="6">Earns ~${pct(D.rules.cash_rate)} a year</td></tr>` : ""}
    </tbody></table><p class="note">Momentum is measured to a week before the close. Rank is out of the ${D.scores.length} stocks scored at the latest close.</p>`;
  }

  function next() {
    const P = D.preview, cur = {};
    D.holdings.forEach((h) => (cur[h.tk] = h.target));
    const all = [...new Set([...Object.keys(P.w), ...Object.keys(cur)])].sort((a, b) => (P.w[b] || 0) - (P.w[a] || 0));
    const rows = all.map((k) => {
      const a = cur[k] || 0, b = P.w[k] || 0, d = b - a;
      const chip = !a ? `<span class="chip in">In</span>` : !b ? `<span class="chip out">Out</span>` : Math.abs(d) < 0.001 ? `<span class="chip">Same</span>` : `<span class="chip">${d > 0 ? "Up" : "Down"}</span>`;
      return `<tr${!b ? ' class="off"' : ""}><td>${link(k)}</td><td class="mono r">${pct(a)}</td><td class="mono r">${pct(b)}</td><td>${chip}</td></tr>`;
    }).join("");
    const cashRow = (D.cash > 0.001 || P.cash > 0.001) ? `<tr class="off"><td>Cash</td><td class="mono r">${pct(D.cash)}</td><td class="mono r">${pct(P.cash)}</td><td></td></tr>` : "";
    const outs = all.filter((k) => cur[k] && !P.w[k]).map((k) => {
      const s = D.scores.find((x) => x.tk === k);
      return s ? `${k} ${!s.above ? "closed below its 100-day average" : s.score <= 0 ? "has a negative score" : `slipped to #${s.rank}`}` : k;
    });
    $("next").innerHTML = `<h3>${P.pending ? `Rebalance at the ${fd(P.d)} close` : `If it rebalanced at the ${fd(P.d)} close`}</h3>
      <p class="note" style="margin:0 0 10px">${P.pending ? "Takes effect from the next session." : "A preview only: the rules trade on Friday's close, so this can still change."}</p>
      <table class="st"><thead><tr><th>Stock</th><th class="r">Now</th><th class="r">Would be</th><th></th></tr></thead><tbody>${rows}${cashRow}</tbody></table>
      ${outs.length ? `<p class="note">${esc(outs.join("; "))}.</p>` : ""}`;
  }

  /* ---------- growth + drawdown charts ---------- */
  const LINES = [["nav", "Portfolio", "--s-mom"], ["raw", "No vol control", "--s-raw"], ["ew", "Equal-weight", "--s-ew"], ["spy", "S&P 500", "--s-spy"]];
  const RANGES = [["3m", "3M", 63], ["6m", "6M", 126], ["1y", "1Y", 252], ["all", "All", 1e9]];
  function controls() {
    $("rng").innerHTML = RANGES.map(([k, l]) => `<button type="button" data-r="${k}" aria-pressed="${k === range}">${l}</button>`).join("");
    $("lns").innerHTML = LINES.filter(([k]) => D[k]).map(([k, l, c]) => `<button type="button" class="sw" data-l="${k}" aria-pressed="${show[k]}"><i style="background:var(${c})"></i>${l}</button>`).join("");
    $("rng").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; range = b.dataset.r; controls(); charts(); };
    $("lns").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; const k = b.dataset.l; if (k === "nav") return; show[k] = !show[k]; controls(); charts(); };
  }
  function i0() { const n = (RANGES.find((r) => r[0] === range) || RANGES[3])[2]; return Math.max(0, D.dates.length - 1 - n); }
  function charts() {
    if (!window.LightweightCharts) { $("perf").innerHTML = `<p class="note">Chart library did not load.</p>`; return; }
    const LW = window.LightweightCharts, a = i0(), dates = D.dates.slice(a);
    [c1, c2].forEach((c) => c && c.remove()); s1 = {}; s2 = {};
    const base = { layout: { background: { type: "solid", color: "transparent" }, textColor: css("--muted"), fontFamily: css("--f-mono"), fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: css("--line") } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false },
      crosshair: { mode: LW.CrosshairMode.Normal }, autoSize: true,
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true } };
    c1 = LW.createChart($("perf"), { ...base, localization: { locale: "en-US", priceFormatter: (v) => "$" + v.toFixed(0) } });
    c2 = LW.createChart($("ddc"), { ...base, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.06 } }, localization: { locale: "en-US", priceFormatter: (v) => v.toFixed(0) + "%" } });
    const ddOf = (v) => { let pk = -1e9; return v.map((x) => { pk = Math.max(pk, x); return x / pk - 1; }); };
    const vals = {}, dds = {};
    LINES.forEach(([k, , c]) => {
      if (!D[k] || !show[k]) return;
      const v = D[k].slice(a), b = v[0];
      vals[k] = v.map((x) => (x / b) * 100); dds[k] = ddOf(vals[k]).map((x) => x * 100);
      const main = k === "nav";
      s1[k] = c1.addLineSeries({ color: css(c), lineWidth: main ? 2.5 : 1.5, lineStyle: k === "raw" ? 2 : 0, priceLineVisible: false, lastValueVisible: main, crosshairMarkerVisible: true });
      s1[k].setData(dates.map((d, i) => ({ time: d, value: vals[k][i] })));
      if (main) {
        const r = css("--dd");
        s2[k] = c2.addBaselineSeries({ baseValue: { type: "price", price: 0 }, topLineColor: r, topFillColor1: "rgba(0,0,0,0)", topFillColor2: "rgba(0,0,0,0)",
          bottomLineColor: r, bottomFillColor1: hexA(r, 0.12), bottomFillColor2: hexA(r, 0.42), lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
          autoscaleInfoProvider: (orig) => { const x = orig(); if (x && x.priceRange) x.priceRange.maxValue = Math.max(0.5, Math.min(x.priceRange.maxValue, 0.5)); return x; } });
      } else {
        s2[k] = c2.addLineSeries({ color: css(c), lineWidth: 1.25, lineStyle: k === "raw" ? 2 : 0, priceLineVisible: false, lastValueVisible: false });
      }
      s2[k].setData(dates.map((d, i) => ({ time: d, value: dds[k][i] })));
    });
    // deepest point marker
    const md = dds.nav, mi = md.indexOf(Math.min(...md));
    if (md[mi] < -0.05) s2.nav.setMarkers([{ time: dates[mi], position: "belowBar", color: css("--dd"), shape: "arrowUp", text: `Max ${md[mi].toFixed(1)}%` }]);
    c1.timeScale().fitContent(); c2.timeScale().fitContent();
    const ro = (el, src, f) => (i) => {
      const k = i == null ? dates.length - 1 : i;
      el.innerHTML = `<span>${fd(dates[k])}</span>` + LINES.filter(([x]) => src[x]).map(([x, l, c]) => `<span><i style="background:var(${c})"></i>${l} <b>${f(src[x][k])}</b></span>`).join("");
    };
    const r1 = ro($("ro1"), vals, (v) => "$" + v.toFixed(0)), r2 = ro($("ro2"), dds, (v) => (v < -0.05 ? v.toFixed(1) + "%" : "at high"));
    r1(); r2();
    const idx = new Map(dates.map((d, i) => [d, i]));
    const tkey = (t) => (typeof t === "string" ? t : t && t.year ? `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}` : null);
    const link2 = (from, to, fromS, toS, mine, other) => {
      from.subscribeCrosshairMove((p) => {
        const i = p && p.time ? idx.get(tkey(p.time)) : null;
        mine(i); other(i);
        if (syncing) return; syncing = true;
        try { if (i == null) to.clearCrosshairPosition(); else to.setCrosshairPosition(toS.value[i] ?? 0, dates[i], toS.s); } catch (e) {}
        syncing = false;
      });
      from.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (syncing || !r) return; syncing = true; to.timeScale().setVisibleLogicalRange(r); syncing = false; });
    };
    link2(c1, c2, null, { s: s2.nav, value: dds.nav }, r1, r2);
    link2(c2, c1, null, { s: s1.nav, value: vals.nav }, r2, r1);
  }
  function hexA(c, a) {
    const m = c.match(/^#([0-9a-f]{6})$/i); if (!m) return c;
    const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /* ---------- drawdown review ---------- */
  function review() {
    const s = D.stats, R = D.risk, E = D.episodes, top = E[0];
    const p = D.stats_spy, ew = D.stats_ew;
    $("mddSub").textContent = `The deepest falls in the backtest, and what today's five holdings could plausibly lose over the next year if held as they are now.`;
    const k = [
      ["Backtest max drawdown", pct(s.mdd), top ? `${fd(top.peak, false)} → ${fd(top.trough)}; ${top.rec ? `recovered ${fd(top.rec, false)}` : "not yet recovered"}` : "", true],
      ["Same rules, no vol control", pct(D.stats_raw.mdd), "What the cash buffer saved"],
      ["Equal-weight basket", pct(ew.mdd), p ? `S&P 500 ${pct(p.mdd)} over the same period` : "All dashboard stocks"],
      ["Next 12 months, typical", pct(R.mdd_p50), "Median worst fall, today's mix"],
      ["1-in-10 year", pct(R.mdd_p10), "Worst fall exceeded in 10% of simulations", true],
      ["1-in-20 year", pct(R.mdd_p05), "Worst fall exceeded in 5%"],
      ["Worst week, today's mix", pct(R.worst5), `Worst day ${pct(R.worst1)}; worst month ${pct(R.worst20)}`],
      ["1-day 95% VaR", pct(-R.var95_1d), "Expect a day this bad about once a month"],
    ];
    $("mddK").innerHTML = k.map(([b, v, sm, hl]) => `<div class="tile${hl ? " hl" : ""}"><b>${b}</b><span class="v neg">${v}</span><small>${sm}</small></div>`).join("");

    const drv = (e) => e.drivers.map(([t, v]) => `${t} (${pts(v)})`).join(", ");
    const plan = Math.ceil(Math.max(-s.mdd, -R.mdd_p10) * 20) / 20, bad = Math.ceil(-R.mdd_p05 * 20) / 20;
    const corr = R.avg_corr;
    const hTk = D.holdings.map((h) => h.tk).join(", ");
    const p1 = top ? `<p><b>The record.</b> The deepest fall was <b>${pct(top.depth)}</b>, from the ${fd(top.peak)} high to the ${fd(top.trough)} low over ${top.days_down} sessions${top.rec ? `, recovered by ${fd(top.rec)} (${top.days_rec} sessions later)` : ", and it has not yet regained that high"}. The biggest drags were ${drv(top)}. In the same window the equal-weight basket moved ${spct(top.ew)}${top.spy != null ? ` and the S&P 500 ${spct(top.spy)}` : ""}. Without the volatility control the same picks fell ${pct(D.stats_raw.mdd)}, so moving part of the portfolio to cash when swings got large cut the worst loss by about ${Math.round((1 - s.mdd / D.stats_raw.mdd) * 100)}% while giving up some upside.</p>` : "";
    const p2 = `<p><b>The risk ahead.</b> Holding today's mix (${hTk}) unchanged and replaying random stretches of its last year of daily returns, the worst fall over the next 12 months is typically about <b>${pct(R.mdd_p50, 0)}</b>; one year in ten it would exceed <b>${pct(R.mdd_p10, 0)}</b>, and one in twenty <b>${pct(R.mdd_p05, 0)}</b>. The mix runs at ${pct(R.vol, 0)} annual volatility${corr != null ? ` and its holdings have moved together (average correlation ${num(corr)})` : ""}, so a bad day for one tends to be a bad day for most.</p>`;
    const p3 = `<p><b>My view.</b> Plan for a peak-to-trough fall of about <b>${Math.round(plan * 100)}%</b> in a normal bad year and treat <b>${Math.round(bad * 100)}%</b> as a realistic stress case; size the position so that a fall of that size is survivable. Three things could make it worse than the backtest. First, a momentum crash: when market leadership flips, the stocks that rose most fall fastest and together, and with these names concentrated in AI chips, memory and data-center hardware a sector-wide de-rating hits all five at once. Second, the volatility control works on the last month of swings and acts weekly, so it trims after trouble starts and cannot dodge overnight gaps on earnings or export news (today's mix had a ${pct(R.worst1)} day in the last year). Third, the record is short (${Math.round((D.dates.length - 1) / 21)} months) and taken in a strong market for these stocks, on a list chosen with hindsight. What helps: the 25% cap, the 100-day trend filter that drops a stock once it breaks down, and cash when nothing qualifies.</p>`;
    $("view").innerHTML = p1 + p2 + p3;

    $("eps").innerHTML = `<table class="st"><thead><tr><th>Peak</th><th>Trough</th><th class="r">Fall</th><th class="r">Sessions down</th><th>Recovered</th><th class="r">Equal-weight</th>${p ? '<th class="r">S&amp;P 500</th>' : ""}<th>Biggest drags</th></tr></thead><tbody>
    ${E.map((e) => `<tr><td class="mono">${fd(e.peak)}</td><td class="mono">${fd(e.trough)}</td><td class="mono r neg">${pct(e.depth)}</td><td class="mono r">${e.days_down}</td><td class="mono">${e.rec ? `${fd(e.rec, false)} <span style="color:var(--muted)">(+${e.days_rec})</span>` : "Not yet"}</td><td class="mono r ${cls(e.ew)}">${spct(e.ew)}</td>${p ? `<td class="mono r ${cls(e.spy)}">${spct(e.spy)}</td>` : ""}<td style="font-size:12.5px">${e.drivers.map(([t, v]) => `${link(t)} ${pts(v)}`).join(", ")}</td></tr>`).join("")}
    </tbody></table><p class="note">"Biggest drags" is each stock's contribution to the fall in percentage points of the portfolio. "Sessions down" counts peak to trough; the number after the recovery date counts trough to recovery.</p>`;
  }

  /* ---------- weights over time ---------- */
  function weights() {
    const RB = D.rebalances.filter((r) => !r.pending), n = RB.length;
    const tot = {};
    RB.forEach((r) => Object.entries(r.w).forEach(([k, v]) => (tot[k] = (tot[k] || 0) + v)));
    const topK = Object.keys(tot).sort((a, b) => tot[b] - tot[a]).slice(0, 10);
    const keys = [...topK, "Other", "Cash"];
    const col = (k) => (k === "Cash" ? "var(--cash)" : k === "Other" ? "var(--g0)" : `var(${PAL[topK.indexOf(k)]})`);
    const W = 1000, H = 300, L = 36, Rr = 8, T = 8, B = 26, iw = W - L - Rr, ih = H - T - B, bw = iw / n;
    const stack = RB.map((r) => {
      const o = {}; let other = 0;
      Object.entries(r.w).forEach(([k, v]) => (topK.includes(k) ? (o[k] = v) : (other += v)));
      o.Other = other; o.Cash = r.cash; return o;
    });
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weights at each weekly rebalance">`;
    [0, 0.25, 0.5, 0.75, 1].forEach((g) => { const y = T + ih * (1 - g); svg += `<line x1="${L}" x2="${W - Rr}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="11" font-family="var(--f-mono)" fill="var(--muted)">${g * 100}%</text>`; });
    stack.forEach((o, i) => {
      let y = T + ih;
      keys.forEach((k) => { const v = o[k] || 0; if (v <= 0) return; const h = v * ih; y -= h; svg += `<rect x="${(L + i * bw).toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(bw - 0.6, 0.5).toFixed(2)}" height="${h.toFixed(2)}" fill="${col(k)}"/>`; });
    });
    let lastM = "";
    RB.forEach((r, i) => { const m = r.d.slice(0, 7); if (m !== lastM && (i === 0 || r.d.slice(5, 7) % 2 === 1)) { const [Y, M] = m.split("-"); svg += `<text x="${L + i * bw}" y="${H - 8}" font-size="11" font-family="var(--f-mono)" fill="var(--muted)">${MON[M - 1]}${M === "01" || i === 0 ? " " + Y.slice(2) : ""}</text>`; } lastM = m; });
    svg += `<rect id="wHov" x="0" y="${T}" width="${bw}" height="${ih}" fill="none" stroke="var(--ink)" stroke-width="1.5" visibility="hidden"/><rect x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent" id="wHit"/></svg>`;
    $("wts").innerHTML = svg + `<div class="tip" id="wTip" hidden></div>`;
    $("wleg").innerHTML = keys.filter((k) => k !== "Other" || Object.keys(tot).length > 10).map((k) => `<span><i style="background:${col(k)}"></i>${k}</span>`).join("");
    const box = $("wts"), hit = $("wHit"), hov = $("wHov"), tip = $("wTip");
    const move = (ev) => {
      const sv = box.querySelector("svg").getBoundingClientRect(), x = ((ev.clientX - sv.left) / sv.width) * W;
      const i = Math.min(n - 1, Math.max(0, Math.floor((x - L) / bw))), r = RB[i];
      hov.setAttribute("x", L + i * bw); hov.setAttribute("visibility", "visible");
      tip.innerHTML = `<b>Week of ${fd(r.d)}</b>` + Object.entries(r.w).map(([k, v]) => `<div><i style="background:${col(topK.includes(k) ? k : "Other")}"></i>${k} ${pct(v)}</div>`).join("") + (r.cash > 0.001 ? `<div><i style="background:var(--cash)"></i>Cash ${pct(r.cash)}</div>` : "") + `<div style="color:var(--muted)">Traded ${pct(r.turn, 0)} of the portfolio</div>`;
      tip.hidden = false;
      const bx = box.getBoundingClientRect(); let left = ev.clientX - bx.left + 14; if (left + 240 > bx.width) left = ev.clientX - bx.left - 254;
      tip.style.left = Math.max(0, left) + "px"; tip.style.top = Math.max(0, ev.clientY - bx.top - 20) + "px";
    };
    hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { tip.hidden = true; hov.setAttribute("visibility", "hidden"); });
  }

  /* ---------- ranking ---------- */
  function scores() {
    const held = new Set(D.holdings.map((h) => h.tk)), cand = new Set(Object.keys(D.preview.w));
    const st = (s) => cand.has(s.tk) ? (held.has(s.tk) ? `<span class="chip in">Holding</span>` : `<span class="chip in">Candidate</span>`) :
      held.has(s.tk) ? `<span class="chip out">Held, would exit</span>` : !s.above ? `<span class="chip">Below 100-day</span>` : s.score <= 0 ? `<span class="chip">Negative</span>` : `<span class="chip">Qualifies</span>`;
    $("scores").innerHTML = `<table class="st"><thead><tr><th class="r">#</th><th>Stock</th><th class="r">Score</th><th class="r">6M</th><th class="r">3M</th><th class="r">Volatility</th><th>Status</th></tr></thead><tbody>
    ${D.scores.map((s) => `<tr${s.ok ? "" : ' class="off"'}><td class="mono r">${s.rank}</td><td>${link(s.tk)} <span style="color:var(--muted);font-size:12.5px">${esc(s.n)}</span></td><td class="mono r">${num(s.score)}</td><td class="mono r ${cls(s.m6)}">${spct(s.m6, 0)}</td><td class="mono r ${cls(s.m3)}">${spct(s.m3, 0)}</td><td class="mono r">${pct(s.vol, 0)}</td><td>${st(s)}</td></tr>`).join("")}
    </tbody></table><p class="note">Score = average of the 6-month and 3-month returns (both to a week ago) ÷ 3-month volatility. ${D.young.length ? `Not scored yet, too little history: ${D.young.map(link).join(", ")}.` : ""}</p>`;
  }

  function rules() {
    const r = D.rules;
    const li = [
      `<b>Universe:</b> every stock on this dashboard. Listings with under ${r.lookbacks[0] + r.skip} sessions of history join once they have enough.`,
      `<b>Momentum score:</b> the average of the 6-month and 3-month returns, both measured to a week before the close to skip short-term reversals, divided by 3-month volatility so a steady climber outranks a jumpy one.`,
      `<b>Trend filter:</b> a stock must close above its 100-day average with a positive score to be held. If fewer than four qualify, each gets 25% and the rest goes to cash.`,
      `<b>Weights:</b> the top five are weighted for the highest expected Sharpe ratio (return above the ${pct(r.cash_rate)} cash rate per unit of risk) with every weight between 0% and ${pct(r.cap, 0)}. Expected returns are each stock's annualized momentum pulled halfway to the group average; risk is the 6-month covariance with correlations pulled 30% toward zero. Both shrinkages keep one hot stock from dominating. Weights are solved exactly on a ${pct(r.step)} grid.`,
      `<b>Volatility control:</b> if the chosen mix swung more than ${pct(r.vol_target, 0)} a year over the last ${r.vol_window} sessions, every weight is scaled down (in 5% steps) and the rest held in cash. It never borrows to scale up.`,
      `<b>Trading:</b> rebalances at each Friday close; the new weights apply from the next session, and in between weights drift with prices. Every trade costs 0.10%. All numbers use only data available at the time.`,
      `<b>Updates:</b> rebuilt by the dashboard's daily price job after every US close, so the track record, drawdowns, ranking and preview update by themselves.`,
    ];
    $("rules").innerHTML = li.map((x) => `<li>${x}</li>`).join("");
  }

  const mq = matchMedia("(prefers-color-scheme: dark)");
  const redraw = () => { if (D) { charts(); weights(); holdings(); } };
  mq.addEventListener && mq.addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
