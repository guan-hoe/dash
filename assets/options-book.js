/* Options tab: the weekly 5-delta cash-secured put book.
   Reads data/options-book.json (built by scripts/options-backtest.py after every US close)
   and draws the KPIs, this week's book, account value + drawdown with event markers,
   weekly cash collected, events, the assignment replay, profit by stock, the expert read
   and the trade log. Charts: TradingView Lightweight Charts (loaded by the page). */
(function () {
  const $ = (id) => document.getElementById(id);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const usd = (x, d = 0) => (x < 0 ? "−$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgn = (x, d = 0) => (x >= 0 ? "+" : "−") + "$" + Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: d });
  const pct = (x, d = 1) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d) + "%";
  const cls = (x) => (x >= 0 ? "pos" : "neg");
  const fmtD = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const short = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tk = (t) => `<span class="tick">${esc(t)}</span>`;
  const dstr = (t) => (typeof t === "string" ? t : `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`);
  let D, LW;

  fetch("../data/options-book.json?t=" + Date.now(), { cache: "no-store" }).then((r) => r.json()).then((d) => { D = d; LW = window.LightweightCharts; init(); })
    .catch(() => { $("kpi").innerHTML = `<p class="sub">The backtest data isn't available yet.</p>`; });

  function base(extra = {}) {
    return { layout: { background: { type: "solid", color: "transparent" }, textColor: css("--muted"), fontFamily: css("--f-mono"), fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: css("--line") } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false },
      crosshair: { mode: LW.CrosshairMode.Normal }, autoSize: true, localization: { locale: "en-US" },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true }, ...extra };
  }

  function init() {
    kpis(); book(); perf(); weekly(); events(); exercise(); byName(); view(); log(); rules();
  }

  // ------------------------------------------------------------ KPIs
  function kpis() {
    const s = D.stats;
    const t = (b, v, small, c = "") => `<div class="tile"><b>${b}</b><span class="v ${c}">${v}</span><small>${small}</small></div>`;
    $("kpi").innerHTML = [
      t("Account value", usd(s.nav), `From ${usd(D.capital)} on ${fmtD(D.start)}`),
      t("Total return", pct(s.ret), `SPY ${pct(s.spyRet)} over the same two years`, cls(s.ret)),
      t("Annual return", pct(s.cagr), `Volatility ${s.vol.toFixed(1)}% a year`, cls(s.cagr)),
      t("Sharpe ratio", s.sharpe == null ? "—" : s.sharpe.toFixed(2), `Over T-bills at ${s.rf.toFixed(1)}%`),
      t("Max drawdown", pct(s.mdd), `SPY ${pct(s.spyMdd)}; trough ${fmtD(s.mddAt)}`, "neg"),
      t("Put premium", usd(s.putPrem), `${s.putsSold} puts sold, ${s.expired} expired worthless`),
      t("Call premium", usd(s.callPrem), `Covered calls after ${s.assigned} assignment${s.assigned === 1 ? "" : "s"}`),
      t("T-bill interest", usd(s.interest), "On the cash securing the puts"),
      t("Momentum exits", String(s.boughtBack), "Puts bought back early"),
      t("Winning weeks", `${s.posWeeks}/${s.weeks}`, `${Math.round((s.posWeeks / s.weeks) * 100)}% of weeks made money`),
    ].join("");
    // concentration caveat: one stock making most of the profit
    const tot = D.byName.reduce((a, x) => a + x.pnl, 0), top = D.byName[0];
    if (top && tot > 0 && top.pnl / tot > 0.35) {
      const ep = D.episodes.find((e) => e.t === top.t);
      $("caveat").hidden = false;
      $("caveat").innerHTML = `<b>Read the result with care.</b> ${esc(top.name)} alone made ${usd(top.pnl)}, ${Math.round((top.pnl / tot) * 100)}% of the profit from trading${ep ? `, mostly because its put was assigned at $${ep.K} on ${fmtD(ep.assign_d)} and the shares were then held while the stock rallied` : ""}. Take that out and the book earns mainly its premium and T-bill interest. One lucky assignment flatters the record; the next one may come in a falling market.`;
    }
  }

  // ------------------------------------------------------------ this week
  function book() {
    const L = D.live, s = D.stats;
    const coll = L.puts.reduce((a, x) => a + x.coll, 0), shares = L.shares.reduce((a, x) => a + x.n * x.S, 0);
    const prem = L.puts.reduce((a, x) => a + x.prem * x.n * 100, 0) + L.calls.reduce((a, x) => a + x.prem * x.n * 100, 0);
    $("nowSub").textContent = `Positions after the ${fmtD(L.asof)} close. ${usd(coll)} secures the puts${shares ? `, ${usd(shares)} sits in shares from an assignment` : ""}, and ${usd(Math.max(0, s.nav - coll - shares))} is spare cash in T-bills. This week's premium: ${usd(prem)}.`;
    let h = `<table class="st"><thead><tr><th>Stock</th><th>Position</th><th class="r">Strike</th><th class="r">Contracts</th><th class="r">Premium</th><th class="r">Cash taken</th><th class="r">Below price</th><th class="r">IV</th><th>Expires</th></tr></thead><tbody>`;
    L.puts.forEach((x) => {
      h += `<tr><td>${tk(x.t)} ${esc(x.name)}</td><td><span class="chip put">Short put</span></td><td class="mono r">$${x.K}</td><td class="mono r">${x.n}</td><td class="mono r">$${x.prem.toFixed(2)}</td><td class="mono r">${usd(x.prem * x.n * 100)}</td><td class="mono r">${x.otm.toFixed(1)}%</td><td class="mono r">${x.iv.toFixed(0)}%</td><td class="mono">${short(x.exp)}</td></tr>`;
    });
    L.calls.forEach((x) => {
      h += `<tr><td>${tk(x.t)} ${esc(x.name)}</td><td><span class="chip call">Covered call</span></td><td class="mono r">$${x.K}</td><td class="mono r">${x.n}</td><td class="mono r">$${x.prem.toFixed(2)}</td><td class="mono r">${usd(x.prem * x.n * 100)}</td><td class="mono r">${pct((x.K / x.S - 1) * 100)} above</td><td class="mono r">—</td><td class="mono">${short(x.exp)}</td></tr>`;
    });
    L.shares.forEach((x) => {
      h += `<tr><td>${tk(x.t)} ${esc(x.name)}</td><td><span class="chip bad">Shares (assigned)</span></td><td class="mono r">$${x.cost}</td><td class="mono r">${x.n.toLocaleString()} sh</td><td class="mono r">$${x.S.toFixed(2)}</td><td class="mono r ${cls(x.S - x.cost)}">${sgn((x.S - x.cost) * x.n)}</td><td class="mono r" colspan="3" style="text-align:left">cost basis vs last price</td></tr>`;
    });
    if (!L.puts.length && !L.calls.length && !L.shares.length) h += `<tr><td colspan="9">Neutral: no stock passes the momentum filter, so the book sits in T-bills.</td></tr>`;
    $("book").innerHTML = h + "</tbody></table><p class=\"note\">Strikes are the listed strike at or below a 5 delta (puts) and at or above a 10 delta (calls). IV is the volatility used to price the option, including the put skew.</p>";
    const nt = D.neutral.slice(0, 8);
    $("side").innerHTML = `<div><h3>How the week runs</h3><ul class="rules" style="font-size:13.5px">
      <li><b>Friday close:</b> sell next Friday's puts at about a 5 delta, roughly a 1-in-20 chance of finishing in the money.</li>
      <li><b>Each day:</b> if a stock closes below its 50-day average, buy the put back and stand aside.</li>
      <li><b>Next Friday:</b> worthless puts are kept as profit; an in-the-money put means buying the shares at the strike.</li>
      <li><b>After an assignment:</b> sell a 10-delta covered call the next week; if it isn't exercised, keep selling calls while the trend holds, or sell the shares if it doesn't.</li></ul></div>
      <div>${nt.length ? `<h3>Sitting out after a momentum break</h3><p style="margin:0;font-size:13.5px;line-height:2">${nt.map((x) => `${tk(x.t)} since ${short(x.since)}`).join(" &nbsp;")}</p>` : `<h3>Sitting out</h3><p style="margin:0;font-size:13.5px">No stock has been benched by a momentum break in the last three months.</p>`}</div>`;
  }

  // ------------------------------------------------------------ account value + drawdown
  let perfC, ddC, navS, spyS, ddS, ddSpy, mkOn = { macro: true, assign: true, back: true };
  function perf() {
    const RANGES = [["6M", 182], ["1Y", 365], ["All", 0]];
    let rangeDays = 0;
    $("rng").innerHTML = RANGES.map(([l, n]) => `<button type="button" data-n="${n}" aria-pressed="${n === 0}">${l}</button>`).join("");
    $("mks").innerHTML = [["macro", "Market events", "--ev"], ["assign", "Assignments", "--down"], ["back", "Buy-backs", "--warn"]]
      .map(([id, l, v]) => `<button type="button" class="sw" data-id="${id}" aria-pressed="true"><i style="background:var(${v})"></i>${l}</button>`).join("");
    perfC = LW.createChart($("perf"), base({ rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, visible: false } }));
    navS = perfC.addAreaSeries({ lineColor: css("--s-book"), topColor: css("--s-book") + "33", bottomColor: css("--s-book") + "00", lineWidth: 2, priceLineVisible: false,
      priceFormat: { type: "custom", formatter: (v) => "$" + (v / 1e6).toFixed(2) + "M" } });
    navS.setData(D.nav.map(([d, v]) => ({ time: d, value: v })));
    spyS = perfC.addLineSeries({ color: css("--s-spy"), lineWidth: 1.5, lineStyle: 2, priceLineVisible: false, lastValueVisible: true,
      priceFormat: { type: "custom", formatter: (v) => "$" + (v / 1e6).toFixed(2) + "M" } });
    spyS.setData(D.spy.map(([d, v]) => ({ time: d, value: v })));
    ddC = LW.createChart($("ddc"), base({ rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.02 } } }));
    ddS = ddC.addAreaSeries({ lineColor: css("--down"), topColor: css("--down") + "00", bottomColor: css("--down") + "55", lineWidth: 1.5, priceLineVisible: false,
      priceFormat: { type: "custom", formatter: (v) => v.toFixed(1) + "%" }, invertFilledArea: true });
    ddS.setData(D.dd.map(([d, v]) => ({ time: d, value: v })));
    // SPY drawdown
    let pk = 0; const sdd = D.spy.map(([d, v]) => { pk = Math.max(pk, v); return { time: d, value: +((v / pk - 1) * 100).toFixed(2) }; });
    ddSpy = ddC.addLineSeries({ color: css("--s-spy"), lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: (v) => v.toFixed(1) + "%" } });
    ddSpy.setData(sdd);
    markers();
    // sync the two time scales
    let lock = false;
    const sync = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (lock || !r) return; lock = true; b.timeScale().setVisibleLogicalRange(r); lock = false; });
    sync(perfC, ddC); sync(ddC, perfC);
    const navBy = new Map(D.nav), spyBy = new Map(D.spy), ddBy = new Map(D.dd), sddBy = new Map(sdd.map((x) => [x.time, x.value]));
    const last = D.nav[D.nav.length - 1][0];
    const ro = (d) => {
      const n = navBy.get(d), s = spyBy.get(d);
      const ev = D.events.find((e) => e.kind === "macro" && snap(e.d) === d), tr = D.trades.filter((x) => snap(x.d) === d && (x.a.startsWith("Put assigned") || x.a.startsWith("Bought back")));
      const tag = [ev ? `<b style="color:var(--ev)">${esc(ev.title)}</b>` : "", ...tr.map((x) => `<b style="color:var(${x.a.startsWith("Put") ? "--down" : "--warn"})">${x.t} ${x.a.startsWith("Put") ? "assigned" : "put bought back"}</b>`)].filter(Boolean).join(" · ");
      $("ro1").innerHTML = `<span>${fmtD(d)}</span>${tag ? `<span>${tag}</span>` : ""}<span><i style="background:var(--s-book)"></i>Book <b>${usd(n)}</b> (${pct((n / D.capital - 1) * 100)})</span>${s ? `<span><i style="background:var(--s-spy)"></i>SPY <b>${usd(s)}</b> (${pct((s / D.capital - 1) * 100)})</span>` : ""}`;
      $("ro2").innerHTML = `<span>Drawdown</span><span><i style="background:var(--down)"></i>Book <b>${(ddBy.get(d) ?? 0).toFixed(1)}%</b></span><span><i style="background:var(--s-spy)"></i>SPY <b>${(sddBy.get(d) ?? 0).toFixed(1)}%</b></span>`;
    };
    ro(last);
    const move = (p) => { const d = p && p.time ? dstr(p.time) : last; if (navBy.has(d)) ro(d); else ro(last); };
    perfC.subscribeCrosshairMove(move); ddC.subscribeCrosshairMove(move);
    perfC.subscribeClick((p) => { if (p && p.time) pickEvent(dstr(p.time), true); });
    const setRange = (n) => {
      rangeDays = n;
      if (!n) { perfC.timeScale().fitContent(); return; }
      const to = new Date(last + "T12:00:00Z"), from = new Date(to - n * 864e5).toISOString().slice(0, 10);
      perfC.timeScale().setVisibleRange({ from, to: last });
    };
    $("rng").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; $("rng").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); setRange(+b.dataset.n); });
    $("mks").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", on); mkOn[b.dataset.id] = on; markers(); });
    perfC.timeScale().fitContent();
  }
  const navDates = () => D.nav.map((x) => x[0]);
  function snap(d) { const ds = navDates(); return ds.find((x) => x >= d) || ds[ds.length - 1]; }
  function markers() {
    const m = [];
    if (mkOn.macro) D.events.filter((e) => e.kind === "macro").forEach((e) => m.push({ time: snap(e.d), position: "aboveBar", color: css("--ev"), shape: "circle" }));
    if (mkOn.assign) D.trades.filter((x) => x.a.startsWith("Put assigned")).forEach((x) => m.push({ time: snap(x.d), position: "belowBar", color: css("--down"), shape: "arrowUp", text: `${x.t} assigned` }));
    if (mkOn.back) D.trades.filter((x) => x.a.startsWith("Bought back")).forEach((x) => m.push({ time: snap(x.d), position: "belowBar", color: css("--warn"), shape: "square" }));
    m.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    navS.setMarkers(m);
  }
  function weekFor(d) { return D.weeks.find((w) => w.d >= d); }
  function pickEvent(d, fromClick) {
    // nearest event within 4 days, else describe the week
    const near = D.events.filter((e) => Math.abs(new Date(e.d) - new Date(d)) <= 4 * 864e5).sort((a, b) => Math.abs(new Date(a.d) - new Date(d)) - Math.abs(new Date(b.d) - new Date(d)))[0];
    const tr = D.trades.filter((x) => x.d === d && !x.a.startsWith("Sold 5-delta"));
    const w = weekFor(d);
    let h = "";
    if (near) h += `<b>${esc(near.title)}</b> · ${fmtD(near.d)}. ${near.note ? esc(near.note) + " " : ""}`;
    if (w) h += `Week to ${short(w.d)}: book ${sgn(w.pnl)}${w.spy != null ? `, SPY ${pct(w.spy)}` : ""}. ${drivers(w)}`;
    if (tr.length) h += ` That day: ${tr.map((x) => `${x.t} ${x.a.toLowerCase()}${x.K ? ` ($${x.K})` : ""}`).join("; ")}.`;
    $("evInfo").innerHTML = h;
    if (!fromClick) {
      const a = new Date(new Date(d + "T12:00:00Z") - 45 * 864e5).toISOString().slice(0, 10), b = new Date(new Date(d + "T12:00:00Z").getTime() + 45 * 864e5).toISOString().slice(0, 10);
      perfC.timeScale().setVisibleRange({ from: a, to: b });
      $("rng").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
      $("perfH").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  }
  function drivers(w) {
    const e = Object.entries(w.by || {}); if (!e.length) return "";
    e.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return "Drivers: " + e.slice(0, 3).map(([t, x]) => `${t} ${sgn(x)}`).join(", ") + ".";
  }

  // ------------------------------------------------------------ weekly cash
  function weekly() {
    let mode = "cash";
    $("wkv").innerHTML = [["cash", "Cash collected"], ["pnl", "Weekly P&L"]].map(([id, l]) => `<button type="button" data-id="${id}" aria-pressed="${id === mode}">${l}</button>`).join("");
    const ch = LW.createChart($("wkc"), base());
    const money = { type: "custom", formatter: (v) => (v < 0 ? "−$" : "$") + Math.abs(v / 1000).toFixed(1) + "k" };
    // stacked look: each bar is a running total, drawn tallest first so the smaller ones sit on top
    const sI = ch.addHistogramSeries({ color: css("--int"), priceFormat: money, priceLineVisible: false, lastValueVisible: false });
    const sC = ch.addHistogramSeries({ color: css("--call"), priceFormat: money, priceLineVisible: false, lastValueVisible: false });
    const sP = ch.addHistogramSeries({ color: css("--put"), priceFormat: money, priceLineVisible: false, lastValueVisible: false });
    const sPL = ch.addHistogramSeries({ priceFormat: money, priceLineVisible: false, lastValueVisible: false });
    const W = D.weeks;
    function draw() {
      const z = (a) => a.map((x) => ({ time: x.d }));
      if (mode === "cash") {
        sI.setData(W.map((w) => ({ time: w.d, value: w.put + w.call + w.int })));
        sC.setData(W.map((w) => ({ time: w.d, value: w.put + w.call })));
        sP.setData(W.map((w) => ({ time: w.d, value: w.put })));
        sPL.setData(z(W));
      } else {
        sP.setData(z(W)); sC.setData(z(W)); sI.setData(z(W));
        sPL.setData(W.map((w) => ({ time: w.d, value: w.pnl, color: w.pnl >= 0 ? css("--up") : css("--down") })));
      }
      ch.timeScale().fitContent();
      ro(null);
    }
    const byD = new Map(W.map((w) => [w.d, w]));
    function ro(d) {
      const w = (d && byD.get(d)) || W[W.length - 1];
      $("ro3").innerHTML = mode === "cash"
        ? `<span>Week to ${fmtD(w.d)}</span><span><i style="background:var(--put)"></i>Puts <b>${usd(w.put)}</b></span><span><i style="background:var(--call)"></i>Calls <b>${usd(w.call)}</b></span><span><i style="background:var(--int)"></i>Interest <b>${usd(w.int)}</b></span><span>Total <b>${usd(w.put + w.call + w.int)}</b></span>`
        : `<span>Week to ${fmtD(w.d)}</span><span>P&amp;L <b class="${cls(w.pnl)}">${sgn(w.pnl)}</b></span>${w.spy != null ? `<span>SPY <b>${pct(w.spy)}</b></span>` : ""}<span>${esc(drivers(w))}</span>`;
    }
    ch.subscribeCrosshairMove((p) => ro(p && p.time ? dstr(p.time) : null));
    $("wkv").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; mode = b.dataset.id; $("wkv").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw(); });
    draw();
    const s = D.stats, wks = W.length, total = s.putPrem + s.callPrem + s.interest;
    const avgPut = s.putPrem / wks;
    $("cashK").innerHTML = [
      ["Total cash collected", usd(total), "Put + call premium + interest"],
      ["Average week", usd(total / wks), `${usd(avgPut)} of it from puts`],
      ["Premium yield", ((s.putPrem + s.callPrem) / D.capital / (wks / 52) * 100).toFixed(1) + "%", "A year, on the starting $1M"],
      ["Best week", sgn(Math.max(...W.map((w) => w.pnl))), "Profit or loss, after marks"],
      ["Worst week", sgn(Math.min(...W.map((w) => w.pnl))), "Profit or loss, after marks"],
    ].map(([b, v, sm]) => `<div class="tile"><b>${b}</b><span class="v">${v}</span><small>${sm}</small></div>`).join("");
  }

  // ------------------------------------------------------------ events
  function events() {
    const ev = D.events.filter((e) => e.kind !== "assign");
    $("evs").innerHTML = ev.map((e, k) => {
      let body = "";
      if (e.kind === "macro") body = `<p>${esc(e.note)}</p>`;
      else body = `<p>${e.spy != null ? `SPY ${pct(e.spy)} that week. ` : ""}${(e.drivers || []).map(([t, x]) => `${t} ${sgn(x)}`).join(", ")}</p>`;
      const pnl = e.pnl != null ? `<span class="p ${cls(e.pnl)}">Book ${sgn(e.pnl)} that week</span>` : "";
      return `<button type="button" class="ev ${e.kind}" data-k="${k}"><span class="d">${fmtD(e.d)}</span><div class="t">${esc(e.title)}</div>${body}${pnl}</button>`;
    }).join("");
    $("evs").addEventListener("click", (e) => { const b = e.target.closest(".ev"); if (!b) return; pickEvent(ev[+b.dataset.k].d, false); });
  }

  // ------------------------------------------------------------ assignment replay
  function exercise() {
    const E = D.episodes;
    if (!E.length) { $("epSel").innerHTML = `<span class="sub">No put was assigned in the backtest.</span>`; return; }
    $("epSel").innerHTML = E.map((e, k) => `<button type="button" data-k="${k}" aria-pressed="${k === 0}">${e.t} · ${short(e.assign_d)}</button>`).join("");
    const ch = LW.createChart($("epc"), base());
    const px = ch.addLineSeries({ color: css("--ink"), lineWidth: 2, priceLineVisible: false, priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
    const kS = ch.addLineSeries({ color: css("--put"), lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const cS = ch.addLineSeries({ color: css("--call"), lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const hl = ch.addLineSeries({ color: css("--accent"), lineWidth: 6, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    let cur, steps = [];
    function show(k) {
      const e = (cur = E[k]), path = e.path, byD = new Map(path);
      px.setData(path.map(([d, v]) => ({ time: d, value: v })));
      const after = (d0, d1) => path.filter(([d]) => d >= d0 && (!d1 || d <= d1));
      kS.setData(after(e.put_d, e.assign_d).map(([d]) => ({ time: d, value: e.K })));
      // each call's strike from the day it was sold to its expiry; a gap marks the roll to the next one
      const cm = new Map();
      e.calls.forEach((c) => { const seg = after(c.d, c.exp); seg.forEach(([d], j) => { if (j === 0 && cm.has(d)) cm.set(d + "|gap", 1); cm.set(d, c.K); }); });
      const cs = [];
      if (e.calls.length) {
        let prevK = null;
        after(e.calls[0].d, e.calls[e.calls.length - 1].exp).forEach(([d]) => {
          const K = cm.get(d);
          if (K == null) { cs.push({ time: d }); prevK = null; return; }
          if (prevK != null && K !== prevK) cs.push({ time: d });   // break the line where the strike changes
          else cs.push({ time: d, value: K });
          prevK = K;
        });
      }
      cS.setData(cs);
      hl.setData([]);
      const n = e.n, sh = n * 100;
      steps = [{ d: e.put_d, a: e.put_d, b: e.assign_d, h: `<b>${fmtD(e.put_d)}: sell ${n} puts at $${e.K}</b><small>Stock at $${e.S_sell.toFixed(2)}; strike ${((1 - e.K / e.S_sell) * 100).toFixed(1)}% below. Premium $${e.prem.toFixed(2)} a share = ${usd(e.prem * sh)} taken in, ${usd(e.K * sh)} of cash set aside.</small>` },
        { d: e.assign_d, a: e.assign_d, b: e.assign_d, h: `<b>${fmtD(e.assign_d)}: assigned at $${e.K}</b><small>Closed at $${e.S_assign.toFixed(2)}, below the strike, so the put is exercised: buy ${sh.toLocaleString()} shares for ${usd(e.K * sh)}. Paper loss through the strike ${usd((e.K - e.S_assign) * sh)}, offset by the ${usd(e.prem * sh)} premium.</small>` }];
      e.calls.forEach((c) => {
        steps.push({ d: c.d, a: c.d, b: c.exp, h: `<b>${fmtD(c.d)}: sell ${n} calls at $${c.K}</b><small>Stock at $${c.S.toFixed(2)}; 10-delta call ${((c.K / c.S - 1) * 100).toFixed(1)}% above for $${c.prem.toFixed(2)} (${usd(c.prem * sh)}). ${c.out === "called" ? "Finished in the money: shares called away at the strike." : c.out === "expired" ? "Expired worthless: premium kept, shares still held." : "Still open."}</small>` });
      });
      if (e.end_d) steps.push({ d: e.end_d, a: e.end_d, b: e.end_d, h: `<b>${fmtD(e.end_d)}: out at $${e.exit.toFixed(2)}</b><small>${esc(e.how)}.</small>` });
      $("epSteps").innerHTML = steps.map((s, i) => `<li data-i="${i}">${s.h}</li>`).join("");
      const calls = e.calls.reduce((a, c) => a + c.prem, 0) * sh;
      const stock = ((e.exit ?? path[path.length - 1][1]) - e.K) * sh;
      $("epNote").innerHTML = `Result of this episode: put premium ${usd(e.prem * sh)} + call premium ${usd(calls)} ${stock >= 0 ? "+" : "−"} ${usd(Math.abs(stock))} on the shares = <b class="${cls(e.pnl)}">${sgn(e.pnl)}</b>${e.end_d ? "" : " so far"}.`;
      px.setMarkers([
        { time: e.put_d, position: "aboveBar", color: css("--put"), shape: "arrowDown", text: "Sell put" },
        { time: e.assign_d, position: "belowBar", color: css("--down"), shape: "arrowUp", text: "Assigned" },
        ...e.calls.map((c) => ({ time: c.d, position: "aboveBar", color: css("--call"), shape: "circle", text: "Call" })),
        ...(e.end_d ? [{ time: e.end_d, position: "aboveBar", color: css("--up"), shape: "square", text: e.how.startsWith("Called") ? "Called away" : "Sold" }] : []),
      ].sort((a, b) => (a.time < b.time ? -1 : 1)));
      ch.timeScale().fitContent();
      ro(null);
    }
    function ro(d) {
      const e = cur, path = new Map(e.path), dd = d || e.assign_d, v = path.get(dd);
      $("ro4").innerHTML = `<span>${fmtD(dd)}</span><span><i style="background:var(--ink)"></i>${e.t} <b>$${v ? v.toFixed(2) : "—"}</b></span><span><i style="background:var(--put)"></i>Put strike <b>$${e.K}</b></span>${e.calls.length ? `<span><i style="background:var(--call)"></i>Call strikes <b>${[...new Set(e.calls.map((c) => "$" + c.K))].slice(0, 4).join(", ")}${e.calls.length > 4 ? "…" : ""}</b></span>` : ""}`;
    }
    ch.subscribeCrosshairMove((p) => ro(p && p.time ? dstr(p.time) : null));
    $("epSel").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (!b) return; $("epSel").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); show(+b.dataset.k); });
    $("epSteps").addEventListener("click", (ev) => {
      const li = ev.target.closest("li"); if (!li) return;
      const s = steps[+li.dataset.i];
      $("epSteps").querySelectorAll("li").forEach((x) => x.classList.toggle("on", x === li));
      const seg = cur.path.filter(([d]) => d >= s.a && d <= s.b).map(([d, v]) => ({ time: d, value: v }));
      hl.setData(seg.length > 1 ? seg : []);
      hl.applyOptions({ color: css("--accent") + "55" });
      if (seg.length === 1) ro(seg[0].time);
    });
    show(0);
  }

  // ------------------------------------------------------------ by name
  function byName() {
    const B = D.byName, mx = Math.max(...B.map((x) => Math.abs(x.pnl)), 1);
    $("byName").innerHTML = `<table class="st"><thead><tr><th>Stock</th><th class="r">Weeks with a put</th><th class="r">Net result</th><th style="width:40%"></th></tr></thead><tbody>${B.map((x) =>
      `<tr><td>${tk(x.t)} ${esc(x.name)}</td><td class="mono r">${x.weeks}</td><td class="mono r ${cls(x.pnl)}">${sgn(x.pnl)}</td><td><div class="bar"><span style="width:${(Math.abs(x.pnl) / mx) * 100}%;background:var(${x.pnl >= 0 ? "--up" : "--down"})"></span></div></td></tr>`).join("")}</tbody></table>`;
  }

  // ------------------------------------------------------------ expert read
  function view() {
    const s = D.stats, wks = s.weeks, yrs = wks / 52;
    const premYield = ((s.putPrem + s.callPrem) / D.capital / yrs) * 100, intYield = (s.interest / D.capital / yrs) * 100;
    const asgRate = s.putsSold ? (s.assigned / s.putsSold) * 100 : 0;
    const B = D.byName, tot = B.reduce((a, x) => a + x.pnl, 0);
    const top = B[0], ex = top ? tot - top.pnl : tot;
    const worst = [...D.weeks].sort((a, b) => a.pnl - b.pnl)[0];
    const ddWin = s.mddFrom ? `${fmtD(s.mddFrom)} to ${fmtD(s.mddAt)}` : fmtD(s.mddAt);
    $("view").innerHTML = `
      <h3>Where the return came from</h3>
      <p>Over ${wks} weeks the book turned ${usd(D.capital)} into ${usd(s.nav)} (${pct(s.cagr)} a year) against SPY's ${pct(s.spyRet)} in total. Roughly ${premYield.toFixed(1)}% a year came from option premium and ${intYield.toFixed(1)}% from T-bill interest on the cash that secures the puts; the rest is the result of shares held after assignments. ${top && tot > 0 && top.pnl / tot > 0.35 ? `Be clear-eyed about that last part: ${esc(top.name)} produced ${usd(top.pnl)} of the ${usd(tot)} trading profit. Without it the book made ${usd(ex)} from trading, which is the more honest guide to what the premium engine earns.` : ""}</p>
      <h3>Why it was so smooth, and why that can change</h3>
      <p>A 5-delta weekly put sits about 1.6 standard deviations below the price, so in a typical week nothing happens and the premium is kept: ${s.posWeeks} of ${wks} weeks made money and only ${s.assigned} of ${s.putsSold} puts (${asgRate.toFixed(1)}%) were assigned, below the 5% the delta implies, because the momentum filter only sells under stocks already rising and the 50-day rule pulled ${s.boughtBack} puts before trouble got worse. The worst drawdown was ${pct(s.mdd)} (${ddWin}) against SPY's ${pct(s.spyMdd)}; the worst single week was ${sgn(worst.pnl)} (to ${fmtD(worst.d)}). This is the classic short-volatility profile: many small gains, occasional sharp losses. Its weak spot is a gap: an earnings miss, a guidance cut or a weekend headline can take a stock 15–25% through the strike before the 50-day rule can act, and every name here is a high-beta AI or semiconductor stock, so those gaps tend to arrive together.</p>
      <h3>How I would run it for real</h3>
      <p>Skip the week of each stock's earnings, or sell the put further out; that is where most single-name gaps happen. Hold the 30% cap, and treat it as a ceiling, not a target, when two picks are in the same trade (memory, optics, foundry). Keep the collateral in T-bills, as modelled. Size for the bad week, not the average one: a 20% gap through a 30% position costs about 6% of the account in one session. And check fills: 5-delta weeklies often quote a few cents wide, so the 10% fill haircut and $0.65 commission here matter, and on the thinner names (AAOI, MP, ZS) the real cost may be higher.</p>
      <h3>What this backtest can't see</h3>
      <p>Option prices are modelled, not historical quotes. From ${s.ivRealFrom ? fmtD(s.ivRealFrom) : "mid-2026"} the model uses each stock's real 30-day implied volatility; before that it estimates implied volatility from realised volatility and the VIX, and adds a fixed 1.30× put skew. Real 5-delta skew moves around, especially into earnings and in sell-offs, so premiums and strikes in the early part of the test are estimates. Early assignment, dividends, borrow and taxes are ignored.</p>`;
  }

  // ------------------------------------------------------------ trade log
  function log() {
    const T = [...D.trades].reverse();
    const ts = [...new Set(T.map((x) => x.t))].sort(), as = [...new Set(T.map((x) => x.a))].sort();
    $("fT").innerHTML += ts.map((t) => `<option>${t}</option>`).join("");
    $("fA").innerHTML += as.map((a) => `<option>${esc(a)}</option>`).join("");
    let lim = 40;
    const kindChip = (a) => a.includes("put") && a.startsWith("Sold") ? "put" : a.includes("call") && a.startsWith("Sold") ? "call" : a.includes("assigned") || a.startsWith("Bought") || a.startsWith("Sold shares") ? "bad" : a.includes("worthless") || a.includes("called away") ? "good" : "";
    function draw() {
      const ft = $("fT").value, fa = $("fA").value;
      const rows = T.filter((x) => (!ft || x.t === ft) && (!fa || x.a === fa));
      $("log").innerHTML = `<table class="st"><thead><tr><th>Date</th><th>Stock</th><th>Action</th><th class="r">Strike</th><th class="r">Contracts</th><th class="r">Price</th><th class="r">Stock</th><th class="r">P&amp;L</th></tr></thead><tbody>${rows.slice(0, lim).map((x) =>
        `<tr><td class="mono">${short(x.d)} ${x.d.slice(0, 4)}</td><td>${tk(x.t)}</td><td><span class="chip ${kindChip(x.a)}">${esc(x.a)}</span>${x.w ? ` <span class="note">${x.w}% weight · IV ${x.iv}%</span>` : ""}</td><td class="mono r">${x.K != null ? "$" + x.K : "—"}</td><td class="mono r">${x.n != null ? x.n.toLocaleString() : "—"}</td><td class="mono r">${x.px != null ? "$" + x.px.toFixed(2) : "—"}</td><td class="mono r">${x.S != null ? "$" + x.S.toFixed(2) : "—"}</td><td class="mono r ${x.pnl != null ? cls(x.pnl) : ""}">${x.pnl != null ? sgn(x.pnl) : ""}</td></tr>`).join("")}</tbody></table>`;
      $("logMore").hidden = rows.length <= lim;
    }
    $("fT").addEventListener("change", () => { lim = 40; draw(); });
    $("fA").addEventListener("change", () => { lim = 40; draw(); });
    $("logMore").addEventListener("click", () => { lim += 80; draw(); });
    draw();
  }

  function rules() {
    const r = D.rules;
    $("rules").innerHTML = [
      `<b>Capital:</b> ${usd(D.capital)} on ${fmtD(D.start)}, fully cash-secured: every put is backed by cash equal to strike × 100 per contract. No margin, no leverage.`,
      `<b>Universe:</b> every stock on this dashboard that was trading at the time (SK hynix's ADS and SpaceX join when they list).`,
      `<b>Momentum filter:</b> a stock can be sold only if it closes above its ${r.smaS}-day average, its ${r.smaF}-day average is above its ${r.smaS}-day, and its ${r.mom}-day return is positive. Ranked by that 3-month return divided by its volatility.`,
      `<b>Mean-variance optimisation:</b> the top-ranked names, no more than ${r.maxNames} counting any shares held, are weighted for the highest Sharpe ratio of their simulated weekly put returns over the last ${r.mvoWeeks} weeks (premium minus any loss through the strike). Expected returns shrunk halfway to the group average, covariance 30% toward its diagonal; weights 0–${Math.round(r.cap * 100)}% on a 5% grid, fully invested as far as the cap allows. Re-optimised every Friday.`,
      `<b>Strikes:</b> puts at the listed strike at or below a ${Math.round(r.putDelta * 100)} delta, expiring the next Friday; after assignment, ${Math.round(r.callDelta * 100)}-delta covered calls at or above the strike for that delta.`,
      `<b>Momentum break:</b> if a stock with an open put closes below its ${r.smaS}-day average, the put is bought back at that close and the name sits out until it passes the filter again.`,
      `<b>After assignment:</b> buy the shares at the strike and sell a 10-delta call the next week. If the call expires, keep the shares and sell another call while the stock is above its ${r.smaS}-day average; otherwise sell the shares at that Friday's close.`,
      `<b>Pricing:</b> Black-Scholes with each stock's real 30-day implied volatility where the dashboard has it, otherwise realised volatility (10/20/60-day blend) × the stock's measured IV/RV ratio × a VIX regime factor. Puts priced at ${r.putSkew.toFixed(2)}× that volatility for the 5-delta skew.`,
      `<b>Costs:</b> sells fill ${Math.round(r.slip * 100)}% below the model mid, buy-backs ${Math.round(r.slip * 100)}% above, $${r.comm.toFixed(2)} a contract, 0.05% on stock sales. Puts paying under $0.05 a share are skipped. Cash earns the 13-week T-bill yield.`,
      `<b>Updated</b> ${fmtD(D.updated)}. The whole history is recomputed from the closing prices after every US session, so the record shifts slightly as the volatility data fills in.`,
    ].map((x) => `<li>${x}</li>`).join("");
  }
})();
