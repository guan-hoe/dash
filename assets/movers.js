/* Top movers panel for the main page.
   Ranks every stock on the site by the size of its latest daily move (quote.json price vs previous close),
   then draws the 5 biggest gainers (left, #moversL) and the 5 biggest losers (right, #moversR) of the latest session
   as interactive candlestick charts: SMA 5/10/30/100, Parabolic SAR and MACD (12, 26, 9).
   Uses TradingView Lightweight Charts (loaded by the page). Data: <dir>/data/quote.json and history.json,
   refreshed by the GitHub Action (every 10 minutes in US market hours, then the closing print), so the lists
   follow each trading day and hold the last session's moves outside market hours. */
(function () {
  const STOCKS = [
    ["arm", "ARM", "Arm Holdings"], ["tesla", "TSLA", "Tesla"], ["sndk", "SNDK", "Sandisk"], ["intc", "INTC", "Intel"],
    ["spcx", "SPCX", "SpaceX"], ["mu", "MU", "Micron"], ["lite", "LITE", "Lumentum"], ["cohr", "COHR", "Coherent"],
    ["googl", "GOOGL", "Alphabet"], ["meta", "META", "Meta Platforms"],
    ["nvda", "NVDA", "NVIDIA"], ["zs", "ZS", "Zscaler"], ["be", "BE", "Bloom Energy"], ["aaoi", "AAOI", "Applied Optoelectronics"], ["amd", "AMD", "AMD"], ["mp", "MP", "MP Materials"], ["amzn", "AMZN", "Amazon"], ["msft", "MSFT", "Microsoft"],
    ["mrvl", "MRVL", "Marvell"], ["skhy", "SKHY", "SK hynix"], ["tsm", "TSM", "TSMC"], ["avgo", "AVGO", "Broadcom"], ["rok", "ROK", "Rockwell Automation"],
    ["amat", "AMAT", "Applied Materials"], ["asml", "ASML", "ASML"], ["pltr", "PLTR", "Palantir"], ["glw", "GLW", "Corning"], ["ter", "TER", "Teradyne"]];
  const SLOTS = [document.getElementById("moversL"), document.getElementById("moversR")];
  if (!SLOTS[0] || !SLOTS[1]) return;
  const IND = [
    ["ma5", "MA 5", "--ma5"], ["ma10", "MA 10", "--ma10"], ["ma30", "MA 30", "--ma30"], ["ma100", "MA 100", "--ma100"],
    ["sar", "SAR", "--sar"], ["macd", "MACD", "--accent"]];
  const RANGES = [["1M", 22], ["3M", 66], ["6M", 128], ["1Y", 252]];
  let on = { ma5: true, ma10: true, ma30: true, ma100: true, sar: true, macd: true };
  let rangeN = 66;
  try { const s = JSON.parse(localStorage.getItem("movers-ind") || "null"); if (s) on = { ...on, ...s }; rangeN = +localStorage.getItem("movers-range") || 66; } catch (e) {}

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const st = document.createElement("style");
  st.textContent = `
  :root{--ma5:#d97706;--ma10:#7c3aed;--ma30:#0d9488;--ma100:#64748b;--sar:#0b6fb8}
  @media (prefers-color-scheme: dark){:root{--ma5:#f5b041;--ma10:#a78bfa;--ma30:#2dd4bf;--ma100:#94a3b8;--sar:#4fa8e8}}
  .mv-h{font:600 11px var(--f-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 10px;display:flex;justify-content:space-between;gap:8px}
  .mv{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:12px;min-width:0;margin-bottom:14px}
  .mv-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
  .mv-top a{color:inherit;text-decoration:none}
  .mv-rank{font:600 11px var(--f-mono);color:var(--muted)}
  .mv-name{font:600 14px var(--f-body);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mv-px{font:600 15px var(--f-mono);font-variant-numeric:tabular-nums}
  .mv-chg{font:600 12px var(--f-mono);padding:1px 6px;border-radius:3px}
  .mv-chg.up{color:var(--up);background:color-mix(in srgb,var(--up) 14%,transparent)}
  .mv-chg.down{color:var(--down);background:color-mix(in srgb,var(--down) 14%,transparent)}
  .mv-ohlc{font:500 10.5px var(--f-mono);color:var(--muted);min-height:15px;margin:6px 0 2px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mv-main{height:210px}.mv-macd{height:80px;border-top:1px dashed var(--line)}
  .mv-ctl{display:flex;gap:4px;flex-wrap:wrap;margin:8px 0 0}
  .mv-ctl button{font:500 10.5px var(--f-mono);border:1px solid var(--line);background:transparent;color:var(--muted);padding:2px 6px;border-radius:3px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
  .mv-ctl button[aria-pressed="true"]{color:var(--ink);border-color:var(--muted)}
  .mv-ctl button[aria-pressed="false"] i{opacity:.25}
  .mv-ctl i{display:inline-block;width:8px;height:8px;border-radius:2px}
  .mv-ctl button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  .mv-ctl .rg[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
  .mv-sep{flex-basis:100%;height:0}
  `;
  document.head.appendChild(st);

  // ---------- indicators ----------
  const sma = (a, n) => a.map((_, i) => i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n);
  const ema = (a, n) => { const k = 2 / (n + 1); let e = null; return a.map((x, i) => { e = e == null ? x : x * k + e * (1 - k); return i < n - 1 ? null : e; }); };
  function macd(c) {
    const e12 = ema(c, 12), e26 = ema(c, 26);
    const m = c.map((_, i) => e12[i] == null || e26[i] == null ? null : e12[i] - e26[i]);
    const start = m.findIndex((x) => x != null);
    const sig = Array(c.length).fill(null);
    if (start >= 0) { const s = ema(m.slice(start), 9); s.forEach((v, j) => sig[start + j] = v); }
    return { m, sig, hist: m.map((v, i) => v == null || sig[i] == null ? null : v - sig[i]) };
  }
  function psar(h, l, step = 0.02, max = 0.2) {
    const n = h.length, out = Array(n).fill(null); if (n < 3) return out;
    let up = h[1] >= h[0], af = step, ep = up ? Math.max(h[0], h[1]) : Math.min(l[0], l[1]), sar = up ? Math.min(l[0], l[1]) : Math.max(h[0], h[1]);
    for (let i = 2; i < n; i++) {
      sar = sar + af * (ep - sar);
      if (up) {
        sar = Math.min(sar, l[i - 1], l[i - 2]);
        if (l[i] < sar) { up = false; sar = ep; ep = l[i]; af = step; }
        else if (h[i] > ep) { ep = h[i]; af = Math.min(af + step, max); }
      } else {
        sar = Math.max(sar, h[i - 1], h[i - 2]);
        if (h[i] > sar) { up = true; sar = ep; ep = h[i]; af = step; }
        else if (l[i] < ep) { ep = l[i]; af = Math.min(af + step, max); }
      }
      out[i] = sar;
    }
    return out;
  }

  // ---------- data ----------
  async function getJSON(u) { try { const r = await fetch(u + "?t=" + Date.now(), { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
  async function load() {
    const rows = await Promise.all(STOCKS.map(async ([dir, t, name]) => {
      const q = await getJSON(`${dir}/data/quote.json`);
      if (!q || !q.price || !q.prevClose) return null;
      return { dir, t, name, q, pct: (q.price / q.prevClose - 1) * 100 };
    }));
    const all = rows.filter(Boolean).sort((a, b) => b.pct - a.pct);
    const n = Math.min(5, Math.floor(all.length / 2));
    return { gain: all.slice(0, n), lose: all.slice(-n).reverse() };
  }

  // ---------- cards ----------
  let cards = [], lastKey = "";
  const fmt = (v) => v == null ? "—" : v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v.toFixed(2);

  function destroy() { cards.forEach((c) => { c.main && c.main.remove(); c.sub && c.sub.remove(); }); cards = []; }

  async function build(sets) {
    destroy();
    const q0 = sets.gain[0] && sets.gain[0].q, M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const ds = q0 && (q0.date || (q0.time ? new Date(q0.time * 1000).toISOString().slice(0, 10) : ""));
    const asof = ds ? `${M[+ds.slice(5, 7) - 1]} ${+ds.slice(8, 10)}` : "";
    SLOTS[0].innerHTML = `<div class="mv-h"><span class="up">Top 5 gainers</span><span>${asof ? "session " + asof : "latest session"}</span></div>`;
    SLOTS[1].innerHTML = `<div class="mv-h"><span class="down">Top 5 losers</span><span>${asof ? "session " + asof : "latest session"}</span></div>`;
    const top = [...sets.gain.map((s, i) => ({ s, slot: SLOTS[0], r: i + 1 })), ...sets.lose.map((s, i) => ({ s, slot: SLOTS[1], r: i + 1 }))];
    for (let k = 0; k < top.length; k++) {
      const { s, slot, r } = top[k];
      const el = document.createElement("div"); el.className = "mv";
      const up = s.pct >= 0;
      el.innerHTML = `<div class="mv-top"><span class="mv-rank">#${r}</span><a href="${s.dir}/"><span class="tick">${s.t}</span></a><a class="mv-name" href="${s.dir}/">${s.name}</a>
        <span class="mv-px">$${fmt(s.q.price)}</span><span class="mv-chg ${up ? "up" : "down"}">${up ? "+" : "−"}${Math.abs(s.pct).toFixed(2)}%</span></div>
        <div class="mv-ohlc"></div><div class="mv-main"></div><div class="mv-macd"></div>
        <div class="mv-ctl">${RANGES.map(([l, n]) => `<button type="button" class="rg" data-n="${n}" aria-pressed="${n === rangeN}">${l}</button>`).join("")}<span class="mv-sep"></span>
        ${IND.map(([id, l, v]) => `<button type="button" class="ind" data-id="${id}" aria-pressed="${on[id]}"><i style="background:var(${v})"></i>${l}</button>`).join("")}</div>`;
      slot.appendChild(el);
      const h = await getJSON(`${s.dir}/data/history.json`);
      const card = { s, el, h };
      cards.push(card);
      draw(card);
    }
    wire();
  }

  function draw(card) {
    const { el, h } = card;
    if (card.main) card.main.remove(); if (card.sub) card.sub.remove();
    const box = el.querySelector(".mv-main"), mbox = el.querySelector(".mv-macd"), ohlcEl = el.querySelector(".mv-ohlc");
    mbox.style.display = on.macd ? "" : "none";
    if (!h || !h.d || h.d.length < 5 || !window.LightweightCharts) { box.innerHTML = `<p style="font-size:12px;color:var(--muted)">Price history not available yet.</p>`; return; }
    const LW = window.LightweightCharts;
    const has = Array.isArray(h.o) && h.o.length === h.c.length;
    const o = has ? h.o : h.c.map((c, i) => i ? h.c[i - 1] : c), hi = has ? h.h : h.c.map((c, i) => Math.max(c, o[i])), lo = has ? h.l : h.c.map((c, i) => Math.min(c, o[i]));
    const ink = css("--ink"), mut = css("--muted"), line = css("--line"), upC = css("--up"), dnC = css("--down");
    const base = { layout: { background: { type: "solid", color: "transparent" }, textColor: mut, fontFamily: css("--f-mono"), fontSize: 10 },
      grid: { vertLines: { visible: false }, horzLines: { color: line } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false },
      crosshair: { mode: LW.CrosshairMode.Normal }, autoSize: true,
      // drag to pan, pinch or drag the price/time axis to zoom; the mouse wheel and vertical swipes still scroll the page
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true } };
    const main = LW.createChart(box, { ...base, timeScale: { ...base.timeScale, visible: !on.macd } });
    const t = h.d;
    const cs = main.addCandlestickSeries({ upColor: upC, downColor: dnC, borderUpColor: upC, borderDownColor: dnC, wickUpColor: upC, wickDownColor: dnC, priceLineVisible: false });
    cs.setData(t.map((d, i) => ({ time: d, open: o[i], high: hi[i], low: lo[i], close: h.c[i] })));
    const lineData = (arr) => arr.map((v, i) => v == null ? { time: t[i] } : { time: t[i], value: v });
    [["ma5", 5], ["ma10", 10], ["ma30", 30], ["ma100", 100]].forEach(([id, n]) => {
      if (!on[id]) return;
      main.addLineSeries({ color: css("--" + id), lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(lineData(sma(h.c, n)));
    });
    if (on.sar) {
      const sar = psar(hi, lo);
      main.addLineSeries({ color: css("--sar"), lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.6, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(lineData(sar));
    }
    let sub = null;
    if (on.macd) {
      sub = LW.createChart(mbox, { ...base, rightPriceScale: { borderVisible: false, scaleMargins: { top: .1, bottom: .1 } } });
      const m = macd(h.c);
      sub.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false }).setData(m.hist.map((v, i) => v == null ? { time: t[i] } : { time: t[i], value: v, color: (v >= 0 ? upC : dnC) + "99" }));
      sub.addLineSeries({ color: css("--accent"), lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }).setData(lineData(m.m));
      sub.addLineSeries({ color: css("--copper") || "#b4622d", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(lineData(m.sig));
      let lock = false;
      const sync = (from, to) => from.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (lock || !r) return; lock = true; to.timeScale().setVisibleLogicalRange(r); lock = false; });
      sync(main, sub); sync(sub, main);
    }
    const n = t.length; main.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - rangeN), to: n - 1 + 2 });
    const showBar = (i) => {
      if (i == null || i < 0 || i >= n) i = n - 1;
      const chg = i ? (h.c[i] / h.c[i - 1] - 1) * 100 : 0;
      ohlcEl.textContent = `${t[i]}  O ${fmt(o[i])}  H ${fmt(hi[i])}  L ${fmt(lo[i])}  C ${fmt(h.c[i])}  ${chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(2)}%`;
    };
    main.subscribeCrosshairMove((p) => { if (!p || !p.time) return showBar(null); showBar(t.indexOf(p.time)); });
    showBar(null);
    card.main = main; card.sub = sub;
  }

  function wire() {
    document.querySelectorAll("#moversL .mv-ctl button, #moversR .mv-ctl button").forEach((b) => b.onclick = () => {
      if (b.classList.contains("rg")) { rangeN = +b.dataset.n; document.querySelectorAll(".mv-ctl .rg").forEach((x) => x.setAttribute("aria-pressed", +x.dataset.n === rangeN)); }
      else { on[b.dataset.id] = !on[b.dataset.id]; document.querySelectorAll(`.mv-ctl .ind[data-id="${b.dataset.id}"]`).forEach((x) => x.setAttribute("aria-pressed", on[b.dataset.id])); }
      try { localStorage.setItem("movers-ind", JSON.stringify(on)); localStorage.setItem("movers-range", String(rangeN)); } catch (e) {}
      cards.forEach(draw);
    });
  }

  async function refresh() {
    const top = await load();
    if (!top.gain.length) { SLOTS.forEach((s) => s.innerHTML = ""); return; }
    const key = [...top.gain, ...top.lose].map((x) => x.t + x.q.time + x.pct.toFixed(2)).join("|");
    if (key === lastKey) return; lastKey = key;
    build(top);
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => cards.forEach(draw));
  refresh(); setInterval(refresh, 10 * 60 * 1000);
})();
