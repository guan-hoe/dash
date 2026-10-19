/* Hover chart for the stock cards on the main (Stocks) page.
   Rest the mouse on a card (or tab to it) and a small price chart pops up beside it:
   daily candlesticks with the 30-day moving average and volume, plus 1M / 3M / 6M / 1Y range buttons.
   The popup stays open while the mouse is over the card or the popup itself, so the buttons and the
   crosshair can be used. Touch screens keep the normal tap-to-open behaviour (no popup).
   Data: <dir>/data/history.json ({d,o,h,l,c,v}), with today's live price from quote.json appended
   when history doesn't include it yet. Uses TradingView Lightweight Charts, loaded by the page. */
(function () {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const RANGES = [["1M", 21], ["3M", 63], ["6M", 126], ["1Y", 252]];
  let rangeN = 63;
  try { rangeN = +localStorage.getItem("cardChartRange") || 63; } catch (e) {}

  const style = document.createElement("style");
  style.textContent = `
  .cc{position:fixed;z-index:50;width:440px;max-width:calc(100vw - 32px);background:var(--panel);border:1px solid var(--line);
    border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.18);padding:12px 12px 10px;opacity:0;transform:translateY(4px);
    transition:opacity .12s,transform .12s;pointer-events:none}
  .cc.on{opacity:1;transform:none;pointer-events:auto}
  .cc-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:2px}
  .cc-h .tick{font-size:12px}
  .cc-n{font:600 14px var(--f-body)}
  .cc-r{margin-left:auto;font:600 13px var(--f-mono);font-variant-numeric:tabular-nums}
  .cc-o{font:500 11px var(--f-mono);color:var(--muted);min-height:16px;font-variant-numeric:tabular-nums}
  .cc-c{height:250px}
  .cc-k{display:flex;gap:4px;align-items:center;margin-top:8px}
  .cc-k button{font:600 11px var(--f-mono);letter-spacing:.04em;background:none;border:1px solid var(--line);color:var(--muted);
    border-radius:4px;padding:3px 8px;cursor:pointer}
  .cc-k button[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--ink)}
  .cc-k button:hover{color:var(--accent)}
  .cc-l{margin-left:auto;font:500 11px var(--f-mono);color:var(--muted);display:flex;gap:10px;align-items:center}
  .cc-l i{display:inline-block;width:10px;height:2px;vertical-align:middle;margin-right:4px}
  .cc-m{font-size:12px;color:var(--muted);padding:90px 0;text-align:center}
  @media (prefers-reduced-motion:reduce){.cc{transition:none}}`;
  document.head.appendChild(style);

  const pop = document.createElement("div");
  pop.className = "cc"; pop.setAttribute("role", "tooltip"); pop.id = "cardChart";
  document.body.appendChild(pop);

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const fmt = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cache = new Map();
  async function getJSON(u) { try { const r = await fetch(u + "?t=" + Date.now(), { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
  function load(card) {
    const dir = card.getAttribute("href").replace(/\/$/, "");
    if (!cache.has(dir)) cache.set(dir, Promise.all([getJSON(`${dir}/data/history.json`), getJSON(`${dir}/data/quote.json`)]).then(([h, q]) => {
      if (!h || !h.d || h.d.length < 5) return null;
      const n = h.c.length, has = Array.isArray(h.o) && h.o.length === n;
      const rows = h.d.map((d, i) => {
        const c = h.c[i], o = has ? h.o[i] : (i ? h.c[i - 1] : c);
        return { time: d, open: o, high: has ? h.h[i] : Math.max(o, c), low: has ? h.l[i] : Math.min(o, c), close: c, vol: (h.v && h.v[i]) || 0 };
      });
      // add today's live price if the saved history stops at the previous session
      if (q && q.price && q.time) {
        const day = new Date(q.time * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        const last = rows[rows.length - 1];
        if (day > last.time) rows.push({ time: day, open: q.prevClose || last.close, high: Math.max(q.price, q.prevClose || q.price), low: Math.min(q.price, q.prevClose || q.price), close: q.price, vol: 0 });
        else if (day === last.time) { last.close = q.price; last.high = Math.max(last.high, q.price); last.low = Math.min(last.low, q.price); }
      }
      return rows;
    }));
    return cache.get(dir);
  }
  function sma(rows, k) {
    let s = 0; return rows.map((r, i) => { s += r.close; if (i >= k) s -= rows[i - k].close; return i >= k - 1 ? { time: r.time, value: s / k } : { time: r.time }; });
  }

  let cur = null, charts = [], showT = 0, hideT = 0;
  function clear() { charts.forEach((c) => c.remove()); charts = []; }

  function place(card) {
    const r = card.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, vw = innerWidth, vh = innerHeight, g = 10;
    let x, y;
    if (r.right + g + w <= vw - 8) x = r.right + g;
    else if (r.left - g - w >= 8) x = r.left - g - w;
    else x = Math.min(Math.max(8, r.left), vw - w - 8);
    if (x === r.right + g || x === r.left - g - w) y = Math.min(Math.max(8, r.top), vh - h - 8);
    else y = r.bottom + g + h <= vh - 8 ? r.bottom + g : Math.max(8, r.top - g - h);
    pop.style.left = x + "px"; pop.style.top = y + "px";
  }

  async function show(card) {
    cur = card; clear();
    const tick = card.querySelector(".tick").textContent.split(":").pop().trim();
    const name = card.querySelector(".name").textContent;
    pop.innerHTML = `<div class="cc-h"><span class="tick">${tick}</span><span class="cc-n">${name}</span><span class="cc-r"></span></div>
      <div class="cc-o"></div><div class="cc-c"><p class="cc-m">Loading chart…</p></div>
      <div class="cc-k">${RANGES.map(([l, n]) => `<button type="button" data-n="${n}" aria-pressed="${n === rangeN}">${l}</button>`).join("")}
      <span class="cc-l"><span><i style="background:var(--accent)"></i>MA 30</span></span></div>`;
    card.setAttribute("aria-describedby", "cardChart");
    place(card); pop.classList.add("on");
    const rows = await load(card);
    if (cur !== card) return;
    if (!rows || !window.LightweightCharts) { pop.querySelector(".cc-c").innerHTML = `<p class="cc-m">Price history not available yet.</p>`; return; }
    draw(rows);
    pop.querySelectorAll(".cc-k button").forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault(); rangeN = +b.dataset.n; try { localStorage.setItem("cardChartRange", rangeN); } catch (err) {}
      pop.querySelectorAll(".cc-k button").forEach((x) => x.setAttribute("aria-pressed", x === b)); clear(); draw(rows);
    }));
  }

  function draw(rows) {
    const LW = window.LightweightCharts;
    const upC = css("--up"), dnC = css("--down"), mut = css("--muted"), line = css("--line");
    const view = rows.slice(-rangeN), first = view[0], last = view[view.length - 1];
    const ch = (last.close / first.close - 1) * 100, rEl = pop.querySelector(".cc-r");
    rEl.textContent = `${ch >= 0 ? "+" : "−"}${Math.abs(ch).toFixed(1)}% · ${RANGES.find((r) => r[1] === rangeN)[0]}`;
    rEl.className = "cc-r " + (ch >= 0 ? "up" : "down");
    const base = { layout: { background: { type: "solid", color: "transparent" }, textColor: mut, fontFamily: css("--f-mono"), fontSize: 10 },
      grid: { vertLines: { visible: false }, horzLines: { color: line } }, rightPriceScale: { borderVisible: false },
      crosshair: { mode: LW.CrosshairMode.Normal }, autoSize: true, handleScroll: false, handleScale: false, localization: { locale: "en-US" } };
    const box = pop.querySelector(".cc-c"); box.innerHTML = "";
    const main = LW.createChart(box, { ...base, timeScale: { borderVisible: false } });
    main.priceScale("right").applyOptions({ scaleMargins: { top: .08, bottom: .24 } });
    const cs = main.addCandlestickSeries({ upColor: upC, downColor: dnC, borderUpColor: upC, borderDownColor: dnC, wickUpColor: upC, wickDownColor: dnC, priceLineVisible: false });
    cs.setData(view);
    // MA 30 from the full history so it starts at the left edge of the view
    const ma = sma(rows, 30).slice(-rangeN);
    main.addLineSeries({ color: css("--accent"), lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(ma);
    const vs = main.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", priceLineVisible: false, lastValueVisible: false });
    main.priceScale("vol").applyOptions({ scaleMargins: { top: .8, bottom: 0 } });
    vs.setData(view.map((r) => ({ time: r.time, value: r.vol, color: (r.close >= r.open ? upC : dnC) + "55" })));
    main.timeScale().fitContent();
    const o = pop.querySelector(".cc-o"), byT = new Map(view.map((r) => [r.time, r]));
    const ohlc = (r) => r ? `${r.time}  O ${fmt(r.open)}  H ${fmt(r.high)}  L ${fmt(r.low)}  C ${fmt(r.close)}` : "";
    o.textContent = ohlc(last);
    main.subscribeCrosshairMove((p) => { const t = p && p.time; o.textContent = ohlc(t ? byT.get(typeof t === "string" ? t : `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`) : last) || ohlc(last); });
    charts = [main];
  }

  function hide() { pop.classList.remove("on"); if (cur) cur.removeAttribute("aria-describedby"); cur = null; clear(); }
  const later = () => { clearTimeout(showT); clearTimeout(hideT); hideT = setTimeout(hide, 180); };

  document.querySelectorAll(".grid a.card").forEach((card) => {
    card.addEventListener("mouseenter", () => { clearTimeout(hideT); clearTimeout(showT); if (cur === card) return; showT = setTimeout(() => show(card), cur ? 60 : 250); });
    card.addEventListener("mouseleave", later);
    card.addEventListener("focus", () => { clearTimeout(hideT); if (cur !== card) show(card); });
    card.addEventListener("blur", later);
    card.addEventListener("mouseenter", () => load(card), { once: true }); // start the download early
  });
  pop.addEventListener("mouseenter", () => clearTimeout(hideT));
  pop.addEventListener("mouseleave", later);
  addEventListener("scroll", () => { if (cur) hide(); }, { passive: true });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && cur) hide(); });
})();
