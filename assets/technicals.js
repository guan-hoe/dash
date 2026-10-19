/* Technical analysis section, shared by every stock page.
   Needs an empty <section id="technicals"> on the page. Reads:
     data/history.json  daily OHLC {d,o,h,l,c}, refreshed by the GitHub Action (live)
     ta.json            the written read and key levels for this stock (edited by hand, dated)
   Draws an interactive candlestick chart with SMA 5/10/30/100, Parabolic SAR and the key levels,
   plus MACD (12, 26, 9) and RSI (14) panes, a live signal table and the written read, in EN / 中文.
   Language follows <html lang>, theme follows the page's data-theme / prefers-color-scheme.
   Uses TradingView Lightweight Charts 4.1 (loaded on demand). */
(function () {
  const host = document.getElementById("technicals");
  if (!host) return;
  const LW_SRC = "https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js";

  const L = {
    en: {
      nav: "Technicals", h: "Technical analysis",
      sub: "Daily candles with 5, 10, 30 and 100-day simple moving averages, Parabolic SAR (0.02, 0.2), MACD (12, 26, 9) and RSI (14). The chart and signal table update with each price refresh; the written read and key levels are dated.",
      sar: "SAR", lv: "Levels", rsi: "RSI 14", macd: "MACD",
      sigH: "Signals now", sigSub: "Computed from the latest daily bar.",
      read: "Technical read", asof: "as of close", levels: "Key levels", lvl: "Level", res: "Resistance", sup: "Support",
      dist: "from price", now: "Last",
      bull: "Bullish", bear: "Bearish", neut: "Neutral",
      trend: "Trend", maStack: "MA stack", pxAbove: (x) => `Price is ${x}% above it`, pxBelow: (x) => `Price is ${x}% below it`,
      sTrendUp: "Price above the 30 and 100-day averages", sTrendDn: "Price below the 30 and 100-day averages", sTrendMix: "Price between the 30 and 100-day averages",
      stackUp: "5 > 10 > 30 > 100: fully bullish order", stackDn: "5 < 10 < 30 < 100: fully bearish order", stackMix: "Averages not in order: trend is mixed",
      macdUp: "MACD above signal", macdDn: "MACD below signal", crossed: "crossed", rising: "histogram rising", falling: "histogram falling",
      rsiHot: "Overbought (above 70)", rsiCold: "Oversold (below 30)", rsiUp: "Above 50: buyers in control", rsiDn: "Below 50: sellers in control",
      sarUp: "Dots below price: uptrend", sarDn: "Dots above price: downtrend", since: "since", stop: "trailing level",
      atr: "Daily range (ATR 14)", atrS: "of price, average true range",
      score: (b, n) => `${b} of ${n} signals bullish`,
      noData: "Price history is not available yet. It loads after the next price refresh.",
      note: "Technical signals describe price behavior only; they are not a forecast or investment advice.",
      ohlc: (d, o, h, l, c, p) => `${d}  O ${o}  H ${h}  L ${l}  C ${c}  ${p}`,
      series: "Listing",
    },
    zh: {
      nav: "技术面", h: "技术分析",
      sub: "日K线，叠加 5、10、30、100 日简单移动平均线、抛物线 SAR（0.02, 0.2）、MACD（12, 26, 9）及 RSI（14）。图表与信号表随股价刷新而更新；文字解读与关键价位注明日期。",
      sar: "SAR", lv: "价位", rsi: "RSI 14", macd: "MACD",
      sigH: "当前信号", sigSub: "按最新日线计算。",
      read: "技术解读", asof: "截至收盘", levels: "关键价位", lvl: "价位", res: "阻力", sup: "支撑",
      dist: "距现价", now: "现价",
      bull: "看多", bear: "看空", neut: "中性",
      trend: "趋势", maStack: "均线排列", pxAbove: (x) => `股价高于该均线 ${x}%`, pxBelow: (x) => `股价低于该均线 ${x}%`,
      sTrendUp: "股价位于 30 日和 100 日均线上方", sTrendDn: "股价位于 30 日和 100 日均线下方", sTrendMix: "股价介于 30 日与 100 日均线之间",
      stackUp: "5 > 10 > 30 > 100：多头排列", stackDn: "5 < 10 < 30 < 100：空头排列", stackMix: "均线交错：趋势不明",
      macdUp: "MACD 在信号线上方", macdDn: "MACD 在信号线下方", crossed: "交叉于", rising: "柱体放大", falling: "柱体收缩",
      rsiHot: "超买（高于 70）", rsiCold: "超卖（低于 30）", rsiUp: "高于 50：买方占优", rsiDn: "低于 50：卖方占优",
      sarUp: "点位在股价下方：上升趋势", sarDn: "点位在股价上方：下降趋势", since: "始于", stop: "跟踪止损位",
      atr: "日均波幅（ATR 14）", atrS: "占股价，平均真实波幅",
      score: (b, n) => `${n} 项信号中 ${b} 项看多`,
      noData: "暂无价格历史，下次股价刷新后载入。",
      note: "技术信号仅描述价格走势，不构成预测或投资建议。",
      ohlc: (d, o, h, l, c, p) => `${d}  开 ${o}  高 ${h}  低 ${l}  收 ${c}  ${p}`,
      series: "上市地",
    },
  };
  const IND = [["ma5", "MA 5", "--ta5"], ["ma10", "MA 10", "--ta10"], ["ma30", "MA 30", "--ta30"], ["ma100", "MA 100", "--ta100"], ["sar", "sar", "--tasar"], ["lv", "lv", "--talv"]];
  const RANGES = [["1M", 22], ["3M", 66], ["6M", 128], ["1Y", 252], ["2Y", 9999]];

  const lang = () => (document.documentElement.lang || "en").startsWith("zh") ? "zh" : "en";
  const t = (k) => L[lang()][k];
  const tx = (o) => o && typeof o === "object" ? (lang() === "zh" ? (o.zh ?? o.en) : o.en) : (o ?? "");
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let on = { ma5: true, ma10: true, ma30: true, ma100: true, sar: true, lv: true };
  let rangeN = 128, serIdx = null;
  try { const s = JSON.parse(localStorage.getItem("ta-ind") || "null"); if (s) on = { ...on, ...s }; rangeN = +localStorage.getItem("ta-range") || 128; } catch (e) {}

  const st = document.createElement("style");
  st.textContent = `
  :root{--ta5:#d97706;--ta10:#7c3aed;--ta30:#0d9488;--ta100:#64748b;--tasar:#0b6fb8;--talv:#a86a00}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ta5:#f5b041;--ta10:#a78bfa;--ta30:#2dd4bf;--ta100:#94a3b8;--tasar:#4fa8e8;--talv:#e3a43a}}
  :root[data-theme="dark"]{--ta5:#f5b041;--ta10:#a78bfa;--ta30:#2dd4bf;--ta100:#94a3b8;--tasar:#4fa8e8;--talv:#e3a43a}
  #technicals .ta-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;align-items:start}
  #technicals .ta-ctl{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
  #technicals .ta-ctl button{font:500 11.5px var(--f-mono);border:1px solid var(--line);background:transparent;color:var(--muted);padding:3px 8px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
  #technicals .ta-ctl button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  #technicals .ta-ctl .rg[aria-pressed="true"],#technicals .ta-ctl .sr[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
  #technicals .ta-ctl .ind[aria-pressed="true"]{color:var(--ink);border-color:var(--muted)}
  #technicals .ta-ctl .ind[aria-pressed="false"] i{opacity:.25}
  #technicals .ta-ctl i{display:inline-block;width:9px;height:9px;border-radius:2px}
  #technicals .ta-gap{flex:1}
  #technicals .ta-ohlc{font:500 11.5px var(--f-mono);color:var(--muted);min-height:17px;margin:2px 0 4px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #technicals .ta-ma{font:500 11px var(--f-mono);display:flex;gap:10px;flex-wrap:wrap;min-height:16px;margin-bottom:4px;font-variant-numeric:tabular-nums}
  #technicals .ta-main{height:380px}
  #technicals .ta-pane{border-top:1px dashed var(--line);position:relative}
  #technicals .ta-pane .lab{position:absolute;left:4px;top:3px;z-index:2;font:600 10px var(--f-mono);color:var(--muted);letter-spacing:.06em;pointer-events:none;background:color-mix(in srgb,var(--panel) 80%,transparent);padding:0 3px}
  #technicals .ta-macd{height:110px}#technicals .ta-rsi{height:96px}
  #technicals .sig{display:grid;grid-template-columns:1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r,6px);overflow:hidden}
  #technicals .sig>div{background:var(--panel);padding:10px 12px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center}
  #technicals .sig .k{font:500 11px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  #technicals .sig .v{font:600 15px var(--f-mono);font-variant-numeric:tabular-nums;grid-column:1}
  #technicals .sig .s{font-size:12px;color:var(--muted);grid-column:1/-1}
  #technicals .sig .pill{grid-row:1/3;grid-column:2;align-self:center}
  #technicals .sig-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:0 0 8px}
  #technicals .sig-head h3,#technicals .ta-read h3{font:600 15px var(--f-body);margin:0}
  #technicals .score{font:600 12px var(--f-mono);color:var(--muted)}
  #technicals .meter{height:6px;border-radius:3px;background:color-mix(in srgb,var(--down) 35%,transparent);overflow:hidden;margin:0 0 10px}
  #technicals .meter i{display:block;height:100%;background:var(--up)}
  #technicals .p-neut{background:color-mix(in srgb,var(--muted) 18%,transparent);color:var(--muted)}
  #technicals .ta-read{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px;margin-top:16px;align-items:start}
  #technicals .ta-read .panel p{margin:8px 0 0;font-size:14.5px;line-height:1.6}
  #technicals .ta-read .panel p:first-of-type{margin-top:10px}
  #technicals .bias{display:inline-block;font:600 12px var(--f-mono);padding:3px 8px;border-radius:4px;margin-top:8px;background:var(--accent-soft);color:var(--ink)}
  #technicals .asof{font:500 11px var(--f-mono);color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
  #technicals table.lvl td,#technicals table.lvl th{padding:7px 8px}
  #technicals table.lvl td:nth-child(3){white-space:normal;text-align:left;color:var(--muted);font-size:12.5px;min-width:120px}
  #technicals table.lvl th:nth-child(3){text-align:left}
  #technicals tr.now td{background:var(--accent-soft);font-weight:600}
  #technicals .lt{font:600 10px var(--f-mono);letter-spacing:.06em;padding:2px 5px;border-radius:3px}
  #technicals .lt.r{color:var(--down);background:color-mix(in srgb,var(--down) 14%,transparent)}
  #technicals .lt.s{color:var(--up);background:color-mix(in srgb,var(--up) 14%,transparent)}
  #technicals .ta-note{font-size:12px;color:var(--muted);margin:10px 0 0}
  @media (max-width:900px){#technicals .ta-grid,#technicals .ta-read{grid-template-columns:minmax(0,1fr)}#technicals .sig{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media (max-width:560px){#technicals .ta-main{height:300px}#technicals .sig{grid-template-columns:minmax(0,1fr)}}
  `;
  document.head.appendChild(st);

  // ---------- indicators ----------
  const sma = (a, n) => { const o = Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
  const ema = (a, n) => { const k = 2 / (n + 1); let e = null; return a.map((x, i) => { e = e == null ? x : x * k + e * (1 - k); return i < n - 1 ? null : e; }); };
  function macd(c) {
    const e12 = ema(c, 12), e26 = ema(c, 26);
    const m = c.map((_, i) => e12[i] == null || e26[i] == null ? null : e12[i] - e26[i]);
    const s0 = m.findIndex((x) => x != null), sig = Array(c.length).fill(null);
    if (s0 >= 0) ema(m.slice(s0), 9).forEach((v, j) => sig[s0 + j] = v);
    return { m, sig, hist: m.map((v, i) => v == null || sig[i] == null ? null : v - sig[i]) };
  }
  function rsi(c, n = 14) {
    const o = Array(c.length).fill(null); if (c.length <= n) return o;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; g += Math.max(d, 0); l += Math.max(-d, 0); }
    g /= n; l /= n; o[n] = l ? 100 - 100 / (1 + g / l) : 100;
    for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; o[i] = l ? 100 - 100 / (1 + g / l) : 100; }
    return o;
  }
  function psar(h, l, step = 0.02, max = 0.2) {
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
  function atr(h, l, c, n = 14) {
    if (c.length <= n + 1) return null;
    const tr = c.map((_, i) => i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[0] - l[0]);
    let a = tr.slice(1, n + 1).reduce((s, x) => s + x, 0) / n;
    for (let i = n + 1; i < c.length; i++) a = (a * (n - 1) + tr[i]) / n;
    return a;
  }

  // ---------- data ----------
  let TA = null, H = null, X = null, charts = [];
  async function getJSON(u) { try { const r = await fetch(u + (u.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
  const series = () => (TA && TA.series) || [{ src: "data/history.json", cur: (TA && TA.cur) || "$", levels: TA && TA.levels, read: TA && TA.read, bias: TA && TA.bias, asof: TA && TA.asof, close: TA && TA.close }];
  const cur = () => series()[serIdx].cur || "$";
  async function loadHist() {
    const s = series()[serIdx];
    const h = await getJSON(s.src);
    if (!h || !h.d || h.d.length < 5) { H = null; return false; }
    const has = Array.isArray(h.o) && h.o.length === h.c.length;
    const o = has ? h.o : h.c.map((c, i) => i ? h.c[i - 1] : c);
    const key = h.d.at(-1) + h.c.at(-1);
    if (H && H.key === key) return false;
    H = { key, d: h.d, c: h.c, o, h: has ? h.h : h.c.map((c, i) => Math.max(c, o[i])), l: has ? h.l : h.c.map((c, i) => Math.min(c, o[i])) };
    const c = H.c;
    X = { ma5: sma(c, 5), ma10: sma(c, 10), ma30: sma(c, 30), ma100: sma(c, 100), mac: macd(c), rsi: rsi(c), sar: psar(H.h, H.l), atr: atr(H.h, H.l, c) };
    return true;
  }

  const fmt = (v) => {
    if (v == null || !isFinite(v)) return "—";
    const a = Math.abs(v);
    return a >= 10000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : a >= 1000 ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toFixed(2);
  };
  const money = (v) => (cur() === "₩" ? "₩" : "$") + fmt(v);
  const dateTx = (a) => { const x = new Date(a || ""); return !a || isNaN(x) ? (a || "") : lang() === "zh" ? `${x.getFullYear()}年${x.getMonth() + 1}月${x.getDate()}日` : a; };
  const pct = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%";

  // ---------- skeleton ----------
  function skeleton() {
    const S = series();
    host.innerHTML = `
      <h2 class="ta-h"></h2><p class="sub ta-sub"></p>
      <div class="ta-grid">
        <div class="panel">
          <div class="ta-ctl">
            ${RANGES.map(([l, n]) => `<button type="button" class="rg" data-n="${n}" aria-pressed="${n === rangeN}">${l}</button>`).join("")}
            ${S.length > 1 ? `<span class="ta-gap"></span>${S.map((s, i) => `<button type="button" class="sr" data-i="${i}" aria-pressed="${i === serIdx}">${esc(tx(s.label))}</button>`).join("")}` : ""}
          </div>
          <div class="ta-ctl">${IND.map(([id, l, v]) => `<button type="button" class="ind" data-id="${id}" aria-pressed="${on[id]}"><i style="background:var(${v})"></i><span>${l}</span></button>`).join("")}</div>
          <div class="ta-ohlc" aria-live="off"></div>
          <div class="ta-ma"></div>
          <div class="ta-main" role="img" aria-label="Daily candlestick chart with moving averages and Parabolic SAR"></div>
          <div class="ta-pane ta-macd"><span class="lab">MACD 12 26 9</span></div>
          <div class="ta-pane ta-rsi"><span class="lab">RSI 14</span></div>
        </div>
        <div>
          <div class="sig-head"><h3 class="sig-h"></h3><span class="score"></span></div>
          <div class="meter"><i></i></div>
          <div class="sig"></div>
          <p class="ta-note sig-sub"></p>
        </div>
      </div>
      <div class="ta-read">
        <div class="panel read-p"></div>
        <div class="panel tbl lvl-p"></div>
      </div>
      <p class="ta-note foot"></p>`;
    host.querySelectorAll(".ta-ctl button").forEach((b) => b.onclick = async () => {
      if (b.classList.contains("rg")) { rangeN = +b.dataset.n; host.querySelectorAll(".rg").forEach((x) => x.setAttribute("aria-pressed", +x.dataset.n === rangeN)); }
      else if (b.classList.contains("sr")) { serIdx = +b.dataset.i; host.querySelectorAll(".sr").forEach((x) => x.setAttribute("aria-pressed", +x.dataset.i === serIdx)); try { localStorage.setItem("ta-ser-" + location.pathname, String(serIdx)); } catch (e) {} H = null; await loadHist(); renderText(); }
      else { on[b.dataset.id] = !on[b.dataset.id]; b.setAttribute("aria-pressed", on[b.dataset.id]); }
      try { localStorage.setItem("ta-ind", JSON.stringify(on)); localStorage.setItem("ta-range", String(rangeN)); } catch (e) {}
      draw();
    });
  }

  function navLink() {
    const nav = document.querySelector("nav.sec"); if (!nav) return;
    let a = nav.querySelector('a[href="#technicals"]');
    if (!a) {
      a = document.createElement("a"); a.href = "#technicals";
      const after = nav.querySelector('a[href="#price"]');
      after ? after.after(a) : nav.appendChild(a);
    }
    a.textContent = t("nav");
  }

  // ---------- text ----------
  function renderText() {
    navLink();
    host.querySelector(".ta-h").textContent = t("h");
    host.querySelector(".ta-sub").textContent = t("sub");
    host.querySelector(".sig-h").textContent = t("sigH");
    host.querySelector(".sig-sub").textContent = t("sigSub");
    host.querySelector(".foot").textContent = t("note");
    host.querySelectorAll(".ind span").forEach((s) => { const id = s.parentNode.dataset.id; if (id === "sar") s.textContent = t("sar"); if (id === "lv") s.textContent = t("lv"); });
    renderSignals(); renderRead();
  }

  function renderSignals() {
    const box = host.querySelector(".sig");
    if (!H) { box.innerHTML = `<div><span class="s">${t("noData")}</span></div>`; host.querySelector(".score").textContent = ""; host.querySelector(".meter i").style.width = "0"; return; }
    const n = H.c.length - 1, px = H.c[n], rows = [];
    const pill = (k) => `<span class="pill ${k === "bull" ? "p-plus" : k === "bear" ? "p-risk" : "p-neut"}">${t(k)}</span>`;
    const row = (k, v, s, state) => rows.push({ k, v, s, state });
    const m30 = X.ma30[n], m100 = X.ma100[n];
    if (m30 != null) {
      const a30 = px > m30, a100 = m100 == null ? a30 : px > m100;
      row(t("trend"), money(px), a30 && a100 ? t("sTrendUp") : !a30 && !a100 ? t("sTrendDn") : t("sTrendMix"), a30 && a100 ? "bull" : !a30 && !a100 ? "bear" : "neut");
    }
    const ms = [X.ma5[n], X.ma10[n], X.ma30[n], X.ma100[n]].filter((x) => x != null);
    if (ms.length >= 3) {
      const upO = ms.every((v, i) => !i || ms[i - 1] > v), dnO = ms.every((v, i) => !i || ms[i - 1] < v);
      row(t("maStack"), ms.map((v) => fmt(v)).join(" · "), upO ? t("stackUp") : dnO ? t("stackDn") : t("stackMix"), upO ? "bull" : dnO ? "bear" : "neut");
    }
    [["ma5", 5], ["ma10", 10], ["ma30", 30], ["ma100", 100]].forEach(([id, p]) => {
      const v = X[id][n]; if (v == null) return;
      row(`SMA ${p}`, money(v), t(px > v ? "pxAbove" : "pxBelow")(Math.abs((px / v - 1) * 100).toFixed(1)), px > v ? "bull" : "bear");
    });
    const M = X.mac;
    if (M.hist[n] != null) {
      let ci = null; for (let i = n; i > 0; i--) if (M.hist[i] != null && M.hist[i - 1] != null && (M.hist[i] > 0) !== (M.hist[i - 1] > 0)) { ci = i; break; }
      const upM = M.hist[n] > 0, rising = M.hist[n] > M.hist[n - 1];
      row("MACD", `${fmt(M.m[n])} / ${fmt(M.sig[n])}`, `${upM ? t("macdUp") : t("macdDn")}${ci != null ? ` · ${t("crossed")} ${H.d[ci]}` : ""} · ${rising ? t("rising") : t("falling")}`, upM ? (rising ? "bull" : "neut") : (rising ? "neut" : "bear"));
    }
    const r = X.rsi[n];
    if (r != null) row("RSI 14", r.toFixed(0), r >= 70 ? t("rsiHot") : r <= 30 ? t("rsiCold") : r >= 50 ? t("rsiUp") : t("rsiDn"), r >= 70 ? "neut" : r <= 30 ? "neut" : r >= 50 ? "bull" : "bear");
    const sp = X.sar;
    if (sp.out[n] != null) {
      let fi = null; for (let i = n; i > 2; i--) if (sp.tr[i] != null && sp.tr[i - 1] != null && sp.tr[i] !== sp.tr[i - 1]) { fi = i; break; }
      row("Parabolic SAR", money(sp.out[n]), `${sp.tr[n] ? t("sarUp") : t("sarDn")}${fi != null ? ` · ${t("since")} ${H.d[fi]}` : ""} · ${t("stop")}`, sp.tr[n] ? "bull" : "bear");
    }
    if (X.atr) row(t("atr"), money(X.atr), `${(X.atr / px * 100).toFixed(1)}% ${t("atrS")}`, null);
    const scored = rows.filter((x) => x.state), bulls = scored.filter((x) => x.state === "bull").length;
    host.querySelector(".score").textContent = t("score")(bulls, scored.length);
    host.querySelector(".meter i").style.width = (scored.length ? bulls / scored.length * 100 : 0) + "%";
    box.innerHTML = rows.map((x) => `<div><span class="k">${esc(x.k)}</span><span class="v">${esc(x.v)}</span>${x.state ? pill(x.state) : ""}<span class="s">${esc(x.s)}</span></div>`).join("");
  }

  function renderRead() {
    const s = series()[serIdx], rp = host.querySelector(".read-p"), lp = host.querySelector(".lvl-p");
    if (!s.read) { rp.style.display = lp.style.display = "none"; return; }
    rp.style.display = lp.style.display = "";
    rp.innerHTML = `<div class="asof">${t("read")} · ${t("asof")} ${esc(dateTx(s.asof))}${s.close ? ` · ${money(s.close)}` : ""}</div>
      ${s.bias ? `<span class="bias">${esc(tx(s.bias))}</span>` : ""}
      ${s.read.map((p) => `<p>${esc(tx(p))}</p>`).join("")}`;
    const px = H ? H.c.at(-1) : s.close;
    const R = ((s.levels && s.levels.r) || []).slice().sort((a, b) => b[0] - a[0]);
    const Sp = ((s.levels && s.levels.s) || []).slice().sort((a, b) => b[0] - a[0]);
    const tr = (cls, lab, [p, note]) => `<tr><td><span class="lt ${cls}">${lab}</span> ${money(p)}</td><td class="${p >= px ? "up" : "down"}">${pct((p / px - 1) * 100)}</td><td>${esc(tx(note))}</td></tr>`;
    lp.innerHTML = `<h3 style="font:600 15px var(--f-body);margin:0 0 8px">${t("levels")}</h3>
      <table class="lvl"><thead><tr><th>${t("lvl")}</th><th>${t("dist")}</th><th></th></tr></thead><tbody>
      ${R.map((l, i) => tr("r", "R" + (R.length - i), l)).join("")}
      <tr class="now"><td>${t("now")} ${money(px)}</td><td></td><td>${H ? esc(H.d.at(-1)) : ""}</td></tr>
      ${Sp.map((l, i) => tr("s", "S" + (i + 1), l)).join("")}
      </tbody></table>`;
  }

  // ---------- charts ----------
  function destroy() { charts.forEach((c) => c.remove()); charts = []; }
  function draw() {
    destroy();
    const box = host.querySelector(".ta-main"), mb = host.querySelector(".ta-macd"), rb = host.querySelector(".ta-rsi");
    const ohlcEl = host.querySelector(".ta-ohlc"), maEl = host.querySelector(".ta-ma");
    [box, mb, rb].forEach((b) => b.querySelectorAll(".tv-lightweight-charts").forEach((x) => x.remove()));
    if (!H || !window.LightweightCharts) { box.innerHTML = `<p style="font-size:13px;color:var(--muted)">${t("noData")}</p>`; mb.style.display = rb.style.display = "none"; return; }
    box.querySelectorAll("p").forEach((p) => p.remove());
    mb.style.display = rb.style.display = "";
    const LW = window.LightweightCharts, d = H.d, n = d.length;
    const mut = css("--muted"), line = css("--line"), upC = css("--up"), dnC = css("--down");
    const priceFmt = { type: "price", precision: cur() === "₩" ? 0 : 2, minMove: cur() === "₩" ? 1 : 0.01 };
    const base = {
      layout: { background: { type: "solid", color: "transparent" }, textColor: mut, fontFamily: css("--f-mono"), fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: line } },
      rightPriceScale: { borderVisible: false, minimumWidth: 72 }, timeScale: { borderVisible: false },
      crosshair: { mode: LW.CrosshairMode.Normal }, autoSize: true,
      localization: { priceFormatter: (v) => fmt(v) },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    };
    const lineData = (arr) => arr.map((v, i) => v == null ? { time: d[i] } : { time: d[i], value: v });
    const main = LW.createChart(box, { ...base, timeScale: { ...base.timeScale, visible: false } });
    const cs = main.addCandlestickSeries({ upColor: upC, downColor: dnC, borderUpColor: upC, borderDownColor: dnC, wickUpColor: upC, wickDownColor: dnC, priceFormat: priceFmt });
    cs.setData(d.map((x, i) => ({ time: x, open: H.o[i], high: H.h[i], low: H.l[i], close: H.c[i] })));
    [["ma5", 1.4], ["ma10", 1.4], ["ma30", 1.6], ["ma100", 2]].forEach(([id, w]) => {
      if (!on[id]) return;
      main.addLineSeries({ color: css("--ta" + id.slice(2)), lineWidth: w, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: priceFmt }).setData(lineData(X[id]));
    });
    if (on.sar) main.addLineSeries({ color: css("--tasar"), lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.7, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: priceFmt }).setData(lineData(X.sar.out));
    const s = series()[serIdx];
    if (on.lv && s.levels) {
      const lc = css("--talv");
      (s.levels.r || []).forEach(([p], i) => cs.createPriceLine({ price: p, color: dnC, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true, title: "R" }));
      (s.levels.s || []).forEach(([p], i) => cs.createPriceLine({ price: p, color: upC, lineWidth: 1, lineStyle: LW.LineStyle.Dashed, axisLabelVisible: true, title: "S" }));
      void lc;
    }
    charts.push(main);

    const mc = LW.createChart(mb, { ...base, timeScale: { ...base.timeScale, visible: false }, rightPriceScale: { ...base.rightPriceScale, scaleMargins: { top: .15, bottom: .1 } } });
    const M = X.mac;
    mc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false }).setData(M.hist.map((v, i) => v == null ? { time: d[i] } : { time: d[i], value: v, color: (v >= 0 ? upC : dnC) + "99" }));
    mc.addLineSeries({ color: css("--accent"), lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }).setData(lineData(M.m));
    mc.addLineSeries({ color: css("--copper") || "#b4622d", lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false }).setData(lineData(M.sig));
    charts.push(mc);

    const rc = LW.createChart(rb, { ...base, rightPriceScale: { ...base.rightPriceScale, scaleMargins: { top: .08, bottom: .08 } } });
    const rs = rc.addLineSeries({ color: css("--ta10"), lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    rs.setData(lineData(X.rsi));
    [[70, dnC], [50, line], [30, upC]].forEach(([p, c]) => rs.createPriceLine({ price: p, color: c, lineWidth: 1, lineStyle: LW.LineStyle.Dotted, axisLabelVisible: false }));
    charts.push(rc);

    let lock = false;
    charts.forEach((a) => a.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (lock || !r) return; lock = true; charts.forEach((b) => b !== a && b.timeScale().setVisibleLogicalRange(r)); lock = false;
    }));
    main.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - Math.min(rangeN, n)), to: n - 1 + 3 });

    const show = (i) => {
      if (i == null || i < 0 || i >= n) i = n - 1;
      const chg = i ? (H.c[i] / H.c[i - 1] - 1) * 100 : 0;
      ohlcEl.innerHTML = `<span class="${chg >= 0 ? "up" : "down"}">${esc(t("ohlc")(d[i], fmt(H.o[i]), fmt(H.h[i]), fmt(H.l[i]), fmt(H.c[i]), pct(chg)))}</span>`;
      maEl.innerHTML = [["ma5", 5], ["ma10", 10], ["ma30", 30], ["ma100", 100]].filter(([id]) => on[id] && X[id][i] != null)
        .map(([id, p]) => `<span style="color:var(--ta${p})">MA${p} ${fmt(X[id][i])}</span>`).join("")
        + (on.sar && X.sar.out[i] != null ? `<span style="color:var(--tasar)">SAR ${fmt(X.sar.out[i])}</span>` : "")
        + (X.rsi[i] != null ? `<span style="color:var(--muted)">RSI ${X.rsi[i].toFixed(0)}</span>` : "");
    };
    charts.forEach((c) => c.subscribeCrosshairMove((p) => show(p && p.time ? d.indexOf(p.time) : null)));
    show(null);
  }

  // ---------- boot ----------
  function ensureLW() {
    if (window.LightweightCharts) return Promise.resolve();
    return new Promise((res) => { const s = document.createElement("script"); s.src = LW_SRC; s.onload = res; s.onerror = res; document.head.appendChild(s); });
  }
  (async () => {
    TA = await getJSON("ta.json");
    const S = series();
    serIdx = TA && TA.defaultSeries != null ? TA.defaultSeries : 0;
    try { const v = localStorage.getItem("ta-ser-" + location.pathname); if (v != null && S[+v]) serIdx = +v; } catch (e) {}
    skeleton(); navLink();
    await Promise.all([ensureLW(), loadHist()]);
    renderText(); draw();
    setInterval(async () => { if (!document.hidden && (await loadHist())) { renderText(); draw(); } }, 120000);
    let lastLang = lang(), lastTheme = document.documentElement.getAttribute("data-theme");
    new MutationObserver(() => {
      const lg = lang(), th = document.documentElement.getAttribute("data-theme");
      if (lg !== lastLang) { lastLang = lg; renderText(); draw(); }
      else if (th !== lastTheme) { lastTheme = th; draw(); }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang", "data-theme"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => draw());
  })();
})();
