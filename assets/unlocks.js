/* Share unlock (lock-up expiry) schedule section.
   Reads unlocks.json next to the page and, if it exists, fills <section id="unlocks"> (or adds one after
   the holders section). For each tranche it shows the shares released, their market value at the live
   price (data/quote.json), and the tranche as a % of average daily volume (20-session average from the
   "v" array in data/history.json, falling back to the figure in unlocks.json). Status (released / next /
   upcoming) is worked out from today's New York date. A Chart.js timeline above the table plots every
   tranche (released and upcoming) as shares, market value or days of volume, with cumulative % unlocked. Refreshes the price every minute.
   EN / 中文 follows <html lang>. Edit unlocks.json when a results date is announced. */
(function () {
  let host = document.getElementById("unlocks");
  if (!host) {
    const after = document.getElementById("holders") || document.getElementById("cashflow");
    if (!after) return;
    host = document.createElement("section"); host.id = "unlocks"; after.after(host);
  }
  host.setAttribute("aria-label", "Share unlock schedule");
  const ADV_N = 20;

  const L = {
    en: {
      nav: "Unlocks", h: "Share unlock schedule",
      sub: "When locked-up insider and pre-IPO shares become sellable. Value uses the live price; the last column compares each tranche with the stock's average daily trading volume, so 400% means about four days of normal trading.",
      date: "Date", ev: "Tranche", grp: "Group", sh: "Shares", out: "% of shares out.", val: "Market value", adv: "% of avg daily volume", st: "Status",
      sRel: "Released", sNext: "Next", sUp: "Upcoming", sEst: "Date est.", sSkip: "Did not trigger",
      kNext: "Next unlock", kNextS: (d, n) => `${d} · in ${n} day${n === 1 ? "" : "s"}`,
      kRel: "Unlocked so far", kRelS: (p) => `${p} of shares outstanding`,
      k26: "Still to unlock in 2026", k26S: (v) => `${v} at the current price`,
      kAdv: "Avg daily volume", kAdvS: (n, d, live) => `${n}-session average · ${live ? "live, " : ""}as of ${d}`,
      days: (x) => `≈ ${x} days`,
      price: (p, d) => `Values at $${p} (${d}).`,
      note: "Share counts are the \"up to\" figures in the IPO prospectus; holders need not sell, so these are ceilings on new supply, not forecasts of selling. Earnings-linked tranches release on the second full trading day after results, and their dates here are estimates until SpaceX announces them. The extended group excludes Musk.",
      src: "Sources", asof: (d) => `Schedule checked ${d}.`, loading: "Loading unlock schedule…", fail: "Unlock schedule is not available.",
      cH: "Unlock timeline: released and upcoming", mSh: "Shares", mVal: "Market value", mDays: "Days of volume",
      lPast: "Released", lFut: "Upcoming", lEst: "Upcoming, date estimated", lMusk: "Elon Musk", lCum: "Cumulative unlocked, % of shares out. (right)",
      today: "Today", clip: "bar cut off", tSh: "Shares", tVal: "Value", tAdv: "Of avg daily volume", tCum: "Cumulative unlocked",
      yAx: { sh: "Shares (M)", val: "US$ B", days: "Trading days" },
    },
    zh: {
      nav: "解禁", h: "股份解禁时间表",
      sub: "禁售的内部人及上市前股份何时可出售。市值按实时股价计算；最后一列为该批股份相当于日均成交量的百分比，400% 约等于四天的正常成交。",
      date: "日期", ev: "批次", grp: "组别", sh: "股数", out: "占总股本", val: "市值", adv: "占日均成交量", st: "状态",
      sRel: "已解禁", sNext: "下一批", sUp: "待解禁", sEst: "日期为估计", sSkip: "未触发",
      kNext: "下一批解禁", kNextS: (d, n) => `${d} · ${n} 天后`,
      kRel: "已解禁合计", kRelS: (p) => `占已发行股份 ${p}`,
      k26: "2026 年内待解禁", k26S: (v) => `按现价约 ${v}`,
      kAdv: "日均成交量", kAdvS: (n, d, live) => `近 ${n} 个交易日平均 · ${live ? "实时，" : ""}截至 ${d}`,
      days: (x) => `约 ${x} 天`,
      price: (p, d) => `市值按 $${p}（${d}）计算。`,
      note: "股数为招股书中的「最多」数量；持有人不一定出售，因此代表新增可售供给上限，而非抛售预测。与财报挂钩的批次在财报后第二个完整交易日解禁，公布前此处日期为估计。延长组不含马斯克。",
      src: "资料来源", asof: (d) => `时间表核对于 ${d}。`, loading: "载入解禁时间表…", fail: "暂无解禁时间表。",
      cH: "解禁时间轴：已解禁与待解禁", mSh: "股数", mVal: "市值", mDays: "成交天数",
      lPast: "已解禁", lFut: "待解禁", lEst: "待解禁（日期为估计）", lMusk: "马斯克", lCum: "累计解禁占总股本（右轴）",
      today: "今天", clip: "柱体已截断", tSh: "股数", tVal: "市值", tAdv: "占日均成交量", tCum: "累计解禁",
      yAx: { sh: "股数（百万）", val: "十亿美元", days: "交易日" },
    },
  };
  const lang = () => (document.documentElement.lang || "en").startsWith("zh") ? "zh" : "en";
  const t = (k) => L[lang()][k];
  const tx = (o) => o == null ? "" : typeof o === "string" ? o : (o[lang()] ?? o.en ?? "");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fd = (s) => { const [y, m, d] = s.split("-").map(Number); return lang() === "zh" ? `${y}年${m}月${d}日` : `${MON[m - 1]} ${d}, ${y}`; };
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const money = (v) => {
    if (!isFinite(v)) return "—";
    if (lang() === "zh") return v >= 1e12 ? `$${(v / 1e12).toFixed(2)} 万亿` : `$${(v / 1e8).toFixed(0)} 亿`;
    return v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : `$${(v / 1e9).toFixed(1)}B`;
  };
  const shares = (m) => lang() === "zh" ? (m >= 1000 ? `${(m / 100).toFixed(1)} 亿` : `${(m / 100).toFixed(2)} 亿`) : (m >= 1000 ? `${(m / 1000).toFixed(2)}B` : `${m.toFixed(1)}M`);
  const pctS = (v) => !isFinite(v) ? "—" : v >= 10 ? Math.round(v).toLocaleString("en-US") + "%" : v.toFixed(1) + "%";

  const st = document.createElement("style");
  st.textContent = `
  #unlocks .ul-cells{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:14px}
  #unlocks td.num,#unlocks th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  #unlocks td.dt{white-space:nowrap;font-family:var(--f-mono);font-size:13px}
  #unlocks td.dt small{display:block;font-family:var(--f-body);color:var(--muted);font-size:11px}
  #unlocks tr.done td{color:var(--muted)}
  #unlocks tr.skip td{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--line)}
  #unlocks tr.next td{background:var(--accent-soft)}
  #unlocks .advbar{display:flex;align-items:center;gap:8px;justify-content:flex-end}
  #unlocks .advbar i{display:inline-block;height:6px;border-radius:3px;background:var(--copper);min-width:2px}
  #unlocks .advbar small{color:var(--muted);font-size:11px;display:block}
  #unlocks .grp{font:500 11px var(--f-mono);letter-spacing:.04em;color:var(--muted);white-space:nowrap}
  #unlocks .ul-note{font-size:12px;color:var(--muted);margin:10px 0 0}
  #unlocks .ul-note a{color:var(--muted)}
  #unlocks .tbl{overflow-x:auto}
  #unlocks .ul-chart{position:relative;height:340px}
  #unlocks .ul-head{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;margin-bottom:8px}
  #unlocks .ul-head h3{margin:0;font:700 15px/1.3 var(--f-display)}
  #unlocks .ul-head .range{margin:0}
  #unlocks .legend{margin:0 0 6px}
  #unlocks .sw.est{background:transparent !important;border:1.5px dashed var(--accent)}
  #unlocks .sw.ln{height:3px;vertical-align:3px}
  @media (max-width:620px){#unlocks .ul-chart{height:330px}}
  #unlocks td.ev,#unlocks th.ev{text-align:left;white-space:normal;min-width:220px}
  #unlocks td.stc,#unlocks th.stc{text-align:left}
  @media (max-width:860px){#unlocks .ul-cells{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media (max-width:620px){#unlocks .hide-sm{display:none}#unlocks td.ev,#unlocks th.ev{min-width:150px}#unlocks .grp{display:none}#unlocks td.dt{font-size:12px}}`;
  document.head.appendChild(st);

  function navLink() {
    const nav = document.querySelector("nav.sec"); if (!nav) return;
    let a = nav.querySelector('a[href="#unlocks"]');
    if (!a) {
      a = document.createElement("a"); a.href = "#unlocks";
      const after = ["#holders", "#cashflow", "#revenue"].map((s) => nav.querySelector(`a[href="${s}"]`)).find(Boolean);
      after ? after.after(a) : nav.appendChild(a);
    }
    a.textContent = t("nav");
  }

  let D = null, Q = null, H = null, failed = false, chart = null;
  let mode = "sh"; try { mode = localStorage.getItem("unlocks-mode") || "sh"; } catch (e) {}
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const alpha = (c, a) => {
    const m = c.match(/^#([0-9a-f]{6})$/i); if (!m) return c;
    const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const shortD = (s) => { const [y, m, d] = s.split("-").map(Number); return lang() === "zh" ? `${m}月${d}日` : `${MON[m - 1]} ${d}`; };
  const estD = (r) => { const e = tx(r.est).replace(/\s*\((est\.)\)|（估）/g, ""); return "~" + e.replace(/ 20\d\d$/, "").replace(/^20\d\d 年 /, ""); };

  function px() {
    if (Q && Q.price) return { p: Q.price, d: Q.date, live: true };
    return D ? { p: D.fallback.price, d: D.fallback.price_date, live: false } : null;
  }
  function adv() {
    if (H && Array.isArray(H.v)) {
      const vv = [], dd = [];
      for (let i = H.v.length - 1; i >= 0 && vv.length < ADV_N; i--) if (H.v[i] > 0) { vv.push(H.v[i]); dd.push(H.d[i]); }
      if (vv.length >= 10) return { v: vv.reduce((s, x) => s + x, 0) / vv.length, d: dd[0], live: true };
    }
    return D ? { v: D.fallback.adv, d: D.fallback.adv_date, live: false } : null;
  }

  function drawChart(rows, now, P, A, OUT) {
    const cv = host.querySelector("#ulChart");
    if (chart) { chart.destroy(); chart = null; }
    if (!cv || !window.Chart) return;
    const live = rows.filter((r) => !r.skip);
    // one column per date; Musk and the extended group share Jun 14, 2027
    const cols = [];
    live.forEach((r) => { const c = cols.find((x) => x.date === r.date); c ? c.items.push(r) : cols.push({ date: r.date, items: [r] }); });
    const metric = (r) => mode === "val" ? r.shares * 1e6 * P.p / 1e9 : mode === "days" ? r.shares * 1e6 / A.v : r.shares;
    const tot = cols.map((c) => c.items.reduce((s, r) => s + metric(r), 0));
    const sorted = tot.slice().sort((a, b) => b - a);
    const nice = (v) => { const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return (f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10) * e; };
    const cap = sorted[0] > sorted[1] * 2.2 ? nice(sorted[1] * 1.3) : null; // keep Musk's block from flattening the rest
    const narrow = cv.parentElement.clientWidth < 560;
    const ACC = css("--accent") || "#0b6fb8", COP = css("--copper") || "#b4622d", SL = css("--slate") || "#7d8a9c", INK = css("--ink"), MUT = css("--muted"), LN = css("--line");
    const isMusk = (r) => r.group === "musk";
    const fill = (r) => r.date <= now ? alpha(SL, .55) : isMusk(r) ? COP : r.fixed ? ACC : alpha(ACC, .18);
    const edge = (r) => r.date <= now ? alpha(SL, .55) : isMusk(r) ? COP : ACC;
    // stacked datasets: layer 0 = first item at each date, layer 1 = second
    const layers = [0, 1].map((k) => ({
      type: "bar", yAxisID: "y", stack: "s", order: 2,
      data: cols.map((c) => { const r = c.items[k]; if (!r) return null; const v = metric(r); if (!cap) return v; const below = k ? metric(c.items[0]) : 0; return Math.max(0, Math.min(v, cap - below)); }),
      backgroundColor: cols.map((c) => c.items[k] ? fill(c.items[k]) : "transparent"),
      borderColor: cols.map((c) => c.items[k] ? edge(c.items[k]) : "transparent"),
      borderWidth: cols.map((c) => c.items[k] && !c.items[k].fixed && c.items[k].date > now ? 1.5 : 0),
      borderDash: [4, 3], borderSkipped: false, borderRadius: 3, maxBarThickness: 46,
    }));
    let run = 0;
    const cum = cols.map((c) => { run += c.items.reduce((s, r) => s + r.shares, 0); return run * 1e6 / OUT * 100; });
    const line = { type: "line", yAxisID: "y2", order: 1, data: cum, borderColor: INK, backgroundColor: INK, borderWidth: 2, pointRadius: 3, tension: 0, stepped: false,
      segment: { borderDash: (ctx) => cols[ctx.p1DataIndex].date > now ? [5, 4] : undefined } };
    const firstFuture = cols.findIndex((c) => c.date > now);
    const labels = cols.map((c) => { const r = c.items[0]; const y = "'" + c.date.slice(2, 4); const d = r.fixed ? shortD(c.date) : estD(r); return narrow ? d + " " + y : [d, y]; });
    const fmt = (v) => mode === "val" ? (v >= 1000 ? `$${(v / 1000).toFixed(2)}T` : `$${v.toFixed(0)}B`) : mode === "days" ? v.toFixed(v < 10 ? 1 : 0) + "d" : shares(v);
    const overlay = {
      id: "ulOverlay",
      afterDatasetsDraw(c) {
        const { ctx, chartArea: a, scales: { x, y } } = c;
        ctx.save();
        if (firstFuture > 0) { // today divider
          const xx = (x.getPixelForValue(firstFuture - 1) + x.getPixelForValue(firstFuture)) / 2;
          ctx.strokeStyle = MUT; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xx, a.top); ctx.lineTo(xx, a.bottom); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = MUT; ctx.font = "600 11px " + (css("--f-mono") || "monospace"); ctx.textAlign = "center"; ctx.fillText(narrow ? "▸" : t("today") + " ▸", xx, a.top + 10);
        }
        ctx.font = "600 10.5px " + (css("--f-mono") || "monospace"); ctx.textAlign = "center";
        cols.forEach((col, i) => { // value on top of each bar; clipped bars get a break mark
          const px = x.getPixelForValue(i), v = tot[i], shown = cap ? Math.min(v, cap) : v, py = y.getPixelForValue(shown);
          if (cap && v > cap) {
            ctx.fillStyle = css("--panel") || "#fff"; ctx.fillRect(px - 16, py + 10, 32, 5);
            ctx.fillStyle = COP; ctx.fillText(fmt(v) + " ↑", px, py - 5);
          } else if (!narrow) {
            ctx.lineWidth = 3; ctx.strokeStyle = css("--panel") || "#fff"; ctx.lineJoin = "round"; ctx.strokeText(fmt(v), px, py - 5);
            ctx.fillStyle = col.date <= now ? MUT : INK; ctx.fillText(fmt(v), px, py - 5);
          }
        });
        ctx.restore();
      },
    };
    chart = new Chart(cv, {
      data: { labels, datasets: [...layers, line] },
      plugins: [overlay],
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { top: 18 } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (it) => it.datasetIndex === 0,
            callbacks: {
              title: (it) => { const c = cols[it[0].dataIndex]; const r = c.items[0]; return (r.fixed ? fd(c.date) : tx(r.est)) + " · " + (c.date <= now ? t("sRel") : t("sUp")); },
              label: () => null,
              afterBody: (it) => {
                const c = cols[it[0].dataIndex], out = [];
                c.items.forEach((r) => {
                  const sh = r.shares * 1e6;
                  out.push(tx(r));
                  out.push(`  ${t("tSh")}: ${shares(r.shares)} · ${t("tVal")}: ${money(sh * P.p)}`);
                  out.push(`  ${t("tAdv")}: ${pctS(sh / A.v * 100)} (${t("days")((sh / A.v).toFixed(1))})`);
                });
                out.push(`${t("tCum")}: ${pctS(cum[it[0].dataIndex])}`);
                return out;
              },
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, border: { color: LN }, ticks: { color: MUT, autoSkip: false, maxRotation: narrow ? 90 : 0, minRotation: narrow ? 90 : 0, font: { size: narrow ? 9.5 : 10.5 } } },
          y: { stacked: true, beginAtZero: true, max: cap || undefined, grid: { color: alpha(LN.startsWith("#") ? LN : "#d9dee5", .7) }, border: { display: false },
               title: { display: !narrow, text: t("yAx")[mode], color: MUT, font: { size: 11 } },
               ticks: { color: MUT, maxTicksLimit: 6, callback: (v) => mode === "sh" ? (v >= 1000 ? (v / 1000) + "B" : v + "M") : mode === "val" ? "$" + v + "B" : v + "d" } },
          y2: { position: "right", min: 0, max: 100, grid: { display: false }, border: { display: false }, ticks: { color: MUT, stepSize: 25, callback: (v) => v + "%" } },
        },
      },
    });
  }

  function render() {
    navLink();
    if (!D) {
      host.innerHTML = `<h2>${t("h")}</h2><div class="panel"><p class="sub" style="margin:0">${failed ? t("fail") : t("loading")}</p></div>`;
      return;
    }
    const now = today(), P = px(), A = adv();
    const OUT = (typeof SHARES === "number" && SHARES > 0) ? SHARES : 13.182e9;
    const rows = D.tranches.slice().sort((a, b) => a.date.localeCompare(b.date));
    const live = rows.filter((r) => !r.skip);
    const next = live.find((r) => r.date > now);
    const relM = live.filter((r) => r.date <= now).reduce((s, r) => s + r.shares, 0);
    const rest26 = live.filter((r) => r.date > now && r.date < "2027-01-01").reduce((s, r) => s + r.shares, 0);
    const maxAdv = Math.max(...live.map((r) => r.shares * 1e6 / A.v * 100));

    const body = rows.map((r) => {
      const sh = r.shares * 1e6, val = sh * P.p, pa = sh / A.v * 100, days = sh / A.v;
      const done = r.date <= now;
      const status = r.skip ? t("sSkip") : done ? t("sRel") : r === next ? t("sNext") : t("sUp");
      const pill = r.skip ? "" : done ? "" : r === next ? "p-watch" : r.shares >= 1000 ? "p-risk" : "";
      const cls = r.skip ? "skip" : done ? "done" : r === next ? "next" : "";
      const dateCell = r.fixed ? fd(r.date) : `${esc(tx(r.est))}<small>${t("sEst")}</small>`;
      const w = Math.max(2, Math.round(Math.sqrt(pa / maxAdv) * 70));
      return `<tr class="${cls}">
        <td class="dt">${dateCell}</td>
        <td class="ev">${esc(tx(r))}<div class="grp">${esc(tx(D.groups[r.group]))}</div></td>
        <td class="num">${shares(r.shares)}</td>
        <td class="num hide-sm">${pctS(sh / OUT * 100)}</td>
        <td class="num">${money(val)}</td>
        <td class="num"><div class="advbar"><span>${pctS(pa)}<small>${t("days")(days >= 10 ? Math.round(days) : days.toFixed(1))}</small></span>${r.skip ? "" : `<i style="width:${w}px"></i>`}</div></td>
        <td class="stc">${pill ? `<span class="pill ${pill}">${status}</span>` : status}</td>
      </tr>`;
    }).join("");

    const nx = next ? `<div class="v">${shares(next.shares)} · ${money(next.shares * 1e6 * P.p)}</div><div class="s">${esc(next.fixed ? t("kNextS")(fd(next.date), dayDiff(now, next.date)) : tx(next.est))}</div>` : `<div class="v">—</div><div class="s"></div>`;
    const srcs = (D.sources || []).map((x) => `<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(tx(x.t))}</a>`).join(" · ");
    host.innerHTML = `
      <h2>${t("h")}</h2>
      <p class="sub">${t("sub")}</p>
      <div class="cells ul-cells">
        <div class="cell"><div class="k">${t("kNext")}</div>${nx}</div>
        <div class="cell"><div class="k">${t("kRel")}</div><div class="v">${shares(relM)}</div><div class="s">${t("kRelS")(pctS(relM * 1e6 / OUT * 100))}</div></div>
        <div class="cell"><div class="k">${t("k26")}</div><div class="v">${shares(rest26)}</div><div class="s">${t("k26S")(money(rest26 * 1e6 * P.p))}</div></div>
        <div class="cell"><div class="k">${t("kAdv")}</div><div class="v">${shares(A.v / 1e6)}</div><div class="s">${t("kAdvS")(ADV_N, fd(A.d), A.live)}</div></div>
      </div>
      <div class="panel" style="margin-bottom:14px">
        <div class="ul-head"><h3>${t("cH")}</h3>
          <div class="range" role="group" aria-label="Measure">
            <button type="button" data-m="sh" aria-pressed="${mode === "sh"}">${t("mSh")}</button>
            <button type="button" data-m="val" aria-pressed="${mode === "val"}">${t("mVal")}</button>
            <button type="button" data-m="days" aria-pressed="${mode === "days"}">${t("mDays")}</button>
          </div></div>
        <div class="legend">
          <span><i class="sw" style="background:var(--slate);opacity:.55"></i>${t("lPast")}</span>
          <span><i class="sw" style="background:var(--accent)"></i>${t("lFut")}</span>
          <span><i class="sw est"></i>${t("lEst")}</span>
          <span><i class="sw" style="background:var(--copper)"></i>${t("lMusk")}</span>
          <span><i class="sw ln" style="background:var(--ink)"></i>${t("lCum")}</span>
        </div>
        <div class="ul-chart"><canvas id="ulChart" aria-label="${t("cH")}"></canvas></div>
      </div>
      <div class="panel tbl"><table>
        <thead><tr><th>${t("date")}</th><th class="ev">${t("ev")}</th><th class="num">${t("sh")}</th><th class="num hide-sm">${t("out")}</th><th class="num">${t("val")}</th><th class="num">${t("adv")}</th><th class="stc">${t("st")}</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>
      <p class="ul-note">${t("price")(P.p.toFixed(2), fd(P.d))} ${t("note")} ${t("asof")(fd(D.asof))}${srcs ? " " + t("src") + (lang() === "zh" ? "：" : ": ") + srcs : ""}</p>`;
    host.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => { mode = b.dataset.m; try { localStorage.setItem("unlocks-mode", mode); } catch (e) {} render(); });
    drawChart(rows, now, P, A, OUT);
  }

  async function loadLive() {
    const bust = "?t=" + Date.now();
    const [q, h] = await Promise.all([
      fetch("data/quote.json" + bust, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("data/history.json" + bust, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null)]);
    if (q && q.price) Q = q;
    if (h && h.d) H = h;
    if (D) render();
  }

  render();
  fetch("unlocks.json?t=" + Math.floor(Date.now() / 3600e3), { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((j) => { D = j; render(); })
    .catch(() => { failed = true; render(); });
  loadLive();
  setInterval(() => { if (!document.hidden) loadLive(); }, 60e3);
  new MutationObserver(() => { if (D) render(); else render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang", "data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (D) render(); });
})();
