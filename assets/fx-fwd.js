/* FX tab: USD/IDR forward curve. Reads data/fx-fwd.json (scripts/fetch-fwd.mjs, deploy workflow) and draws
   either the curve (outright forward by tenor, with spot and the curve 1 week / 1 month ago when saved) or the
   history of the 1M, 3M and 1Y outrights. Below the chart: bid / ask / mid, points, annualised carry and the
   1-day change in points. Plain SVG, themed from the page's CSS variables. Re-polls every 5 minutes. */
(function () {
  const root = document.getElementById("fwd");
  if (!root) return;
  const SRC = root.dataset.src;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const f0 = (v) => v == null || !isFinite(v) ? "–" : Math.round(v).toLocaleString("en-US");
  const f1 = (v) => v == null || !isFinite(v) ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const sg = (v, d) => v == null || !isFinite(v) ? "–" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);
  const sgt = (s) => new Date(s * 1000).toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const NS = "http://www.w3.org/2000/svg";
  let data = null, view = "curve", cmp = { w: true, m: true };

  root.innerHTML = `
    <div class="chead"><h3 id="fwdH">USD/IDR forward curve</h3>
      <div class="rng" role="group" aria-label="Forward chart view">
        <button type="button" data-v="curve" aria-pressed="true">Curve</button><button type="button" data-v="hist" aria-pressed="false">History</button></div></div>
    <p class="sub" style="margin:0 0 8px">Indicative outright USD/IDR forwards, 1 week to 2 years. Offshore rupiah forwards are non-deliverable (NDF), so this is the curve the NDF market trades; points over spot ≈ the IDR–USD interest-rate gap. Points rising faster than the rate gap explains usually signal offshore pressure on the rupiah.</p>
    <div class="ind" id="fwdCmp" role="group" aria-label="Compare with"></div>
    <div class="ohlc" id="fwdRead" aria-live="polite"></div>
    <div class="curve"><div><svg id="fwdSvg" role="img" aria-label="USD/IDR forward curve chart" style="width:100%;height:260px;display:block"></svg><div class="leg" id="fwdLeg"></div></div>
      <div style="overflow-x:auto"><table class="ctab" id="fwdTab"></table></div></div>
    <p class="note" id="fwdNote"></p>`;
  const svg = root.querySelector("#fwdSvg");
  root.querySelectorAll(".rng button").forEach((b) => b.addEventListener("click", () => {
    view = b.dataset.v; root.querySelectorAll(".rng button").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw();
  }));

  const col = () => { const s = getComputedStyle(document.documentElement), g = (n) => s.getPropertyValue(n).trim();
    return { ink: g("--ink"), muted: g("--muted"), line: g("--line"), acc: g("--accent"), up: g("--up"), down: g("--down"), mono: g("--f-mono") || "monospace" }; };
  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; }
  function txt(x, y, s, attrs) { const t = el("text", { x, y, ...attrs }); t.textContent = s; return t; }

  // snapshot closest to (and not after) n calendar days before the latest one
  function ago(n) {
    const H = data.hist || []; if (H.length < 2) return null;
    const last = new Date(H[H.length - 1].d + "T00:00:00Z"); last.setUTCDate(last.getUTCDate() - n);
    const cut = last.toISOString().slice(0, 10);
    for (let i = H.length - 2; i >= 0; i--) if (H[i].d <= cut) return H[i];
    return null;
  }
  const prevDay = () => (data.hist || []).length >= 2 ? data.hist[data.hist.length - 2] : null;

  function axes(C, W, H, P, yMin, yMax, yTicks) {
    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + ((yMax - yMin) * i) / yTicks, y = P.t + (H - P.t - P.b) * (1 - i / yTicks);
      el("line", { x1: P.l, x2: W - P.r, y1: y, y2: y, stroke: C.line, "stroke-width": 1, "stroke-dasharray": i ? "2 3" : "" });
      txt(P.l - 6, y + 4, f0(v), { "text-anchor": "end", fill: C.muted, "font-size": 10.5, "font-family": C.mono });
    }
  }
  function niceRange(vals, pad) {
    let lo = Math.min(...vals), hi = Math.max(...vals); const span = Math.max(hi - lo, 20);
    lo -= span * pad; hi += span * pad; const step = Math.pow(10, Math.floor(Math.log10((hi - lo) / 4)));
    const s = [1, 2, 2.5, 5, 10].map((m) => m * step).find((m) => (hi - lo) / m <= 5) || step * 10;
    return [Math.floor(lo / s) * s, Math.ceil(hi / s) * s, Math.round((Math.ceil(hi / s) * s - Math.floor(lo / s) * s) / s)];
  }

  function drawCurve(C, W, H) {
    const rows = data.rows, P = { l: 52, r: 12, t: 12, b: 26 };
    const wk = cmp.w ? ago(7) : null, mo = cmp.m ? ago(30) : null;
    const series = [{ name: "Now", pts: rows.map((r) => r.mid), color: C.acc, w: 2.4, dash: "" }];
    if (wk) series.push({ name: `1W ago (${wk.d.slice(5)})`, pts: rows.map((r) => (wk.m[r.t] != null ? wk.m[r.t] : null)), color: C.muted, w: 1.5, dash: "5 4" });
    if (mo) series.push({ name: `1M ago (${mo.d.slice(5)})`, pts: rows.map((r) => (mo.m[r.t] != null ? mo.m[r.t] : null)), color: C.down, w: 1.5, dash: "2 3" });
    const all = [data.spot, ...series.flatMap((s) => s.pts.filter((v) => v != null))];
    const [y0, y1, nT] = niceRange(all, 0.06);
    axes(C, W, H, P, y0, y1, nT);
    const n = rows.length, X = (i) => P.l + ((W - P.l - P.r) * (i + 0.5)) / n, Y = (v) => P.t + (H - P.t - P.b) * (1 - (v - y0) / (y1 - y0));
    rows.forEach((r, i) => txt(X(i), H - 8, r.t, { "text-anchor": "middle", fill: C.muted, "font-size": 10.5, "font-family": C.mono }));
    // spot line
    el("line", { x1: P.l, x2: W - P.r, y1: Y(data.spot), y2: Y(data.spot), stroke: C.up, "stroke-width": 1, "stroke-dasharray": "6 4", opacity: 0.8 });
    txt(W - P.r - 2, Y(data.spot) - 4, `spot ${f0(data.spot)}`, { "text-anchor": "end", fill: C.up, "font-size": 10.5, "font-family": C.mono });
    for (const s of series.slice().reverse()) {
      let d = ""; s.pts.forEach((v, i) => { if (v == null) return; d += (d ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); });
      el("path", { d, fill: "none", stroke: s.color, "stroke-width": s.w, "stroke-dasharray": s.dash, "stroke-linejoin": "round" });
    }
    rows.forEach((r, i) => el("circle", { cx: X(i), cy: Y(r.mid), r: 3, fill: C.acc }));
    // hover / tap bands
    const read = root.querySelector("#fwdRead");
    const show = (i) => { const r = rows[i]; let s = `<b>${r.t}</b> outright ${f1(r.mid)} <span class="mut">bid</span> ${f1(r.bid)} <span class="mut">ask</span> ${f1(r.ask)} · <span class="mut">pts</span> ${f1(r.pts)} · <span class="mut">carry</span> ${r.carry.toFixed(2)}% a yr`;
      if (wk && wk.m[r.t] != null) s += ` · <span class="mut">vs 1W</span> ${sg(r.mid - wk.m[r.t], 0)}`;
      if (mo && mo.m[r.t] != null) s += ` · <span class="mut">vs 1M</span> ${sg(r.mid - mo.m[r.t], 0)}`;
      read.innerHTML = s; };
    rows.forEach((r, i) => { const w = (W - P.l - P.r) / n;
      const b = el("rect", { x: X(i) - w / 2, y: P.t, width: w, height: H - P.t - P.b, fill: "transparent", tabindex: 0 });
      b.addEventListener("mouseenter", () => show(i)); b.addEventListener("focus", () => show(i)); b.addEventListener("click", () => show(i)); });
    show(rows.findIndex((r) => r.t === "1M") >= 0 ? rows.findIndex((r) => r.t === "1M") : 0);
    root.querySelector("#fwdLeg").innerHTML = series.map((s) => `<span><i style="background:${s.color};height:${s.w}px"></i>${esc(s.name)}</span>`).join("") +
      `<span><i style="background:${C.up}"></i>Spot</span>`;
  }

  function drawHist(C, W, H) {
    const Hs = (data.hist || []).filter((h) => h.m), P = { l: 52, r: 12, t: 12, b: 26 };
    const read = root.querySelector("#fwdRead");
    if (Hs.length < 2) {
      txt(W / 2, H / 2, "History builds up from one saved curve a day — check back after a few sessions.", { "text-anchor": "middle", fill: C.muted, "font-size": 12 });
      read.innerHTML = ""; root.querySelector("#fwdLeg").innerHTML = ""; return;
    }
    const lines = [{ k: "spot", name: "Spot", color: C.up }, { k: "1M", name: "1M", color: C.acc }, { k: "3M", name: "3M", color: C.muted }, { k: "1Y", name: "1Y", color: C.down }];
    const val = (h, k) => k === "spot" ? h.spot : h.m[k];
    const all = Hs.flatMap((h) => lines.map((l) => val(h, l.k)).filter((v) => v != null));
    const [y0, y1, nT] = niceRange(all, 0.04);
    axes(C, W, H, P, y0, y1, nT);
    const n = Hs.length, X = (i) => P.l + ((W - P.l - P.r) * (n === 1 ? 0.5 : i / (n - 1))), Y = (v) => P.t + (H - P.t - P.b) * (1 - (v - y0) / (y1 - y0));
    const step = Math.max(1, Math.ceil(n / 6));
    Hs.forEach((h, i) => { if (i % step === 0 || i === n - 1) txt(X(i), H - 8, h.d.slice(5), { "text-anchor": i === n - 1 ? "end" : "middle", fill: C.muted, "font-size": 10.5, "font-family": C.mono }); });
    for (const l of lines) { let d = ""; Hs.forEach((h, i) => { const v = val(h, l.k); if (v == null) return; d += (d ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); });
      el("path", { d, fill: "none", stroke: l.color, "stroke-width": l.k === "spot" ? 1.4 : 2, "stroke-dasharray": l.k === "spot" ? "6 4" : "" }); }
    const show = (i) => { const h = Hs[i]; read.innerHTML = `<b>${h.d}</b> ` + lines.map((l) => `<span class="mut">${l.name}</span> ${f0(val(h, l.k))}`).join(" · ") +
      (h.m["1M"] != null ? ` · <span class="mut">1M pts</span> ${f1(h.m["1M"] - h.spot)}` : ""); };
    Hs.forEach((h, i) => { const w = (W - P.l - P.r) / Math.max(1, n - 1);
      const b = el("rect", { x: X(i) - w / 2, y: P.t, width: w, height: H - P.t - P.b, fill: "transparent" });
      b.addEventListener("mouseenter", () => show(i)); b.addEventListener("click", () => show(i)); });
    show(n - 1);
    root.querySelector("#fwdLeg").innerHTML = lines.map((l) => `<span><i style="background:${l.color}"></i>${l.name}</span>`).join("");
  }

  function table() {
    const pd = prevDay();
    root.querySelector("#fwdTab").innerHTML = `<thead><tr><th>Tenor</th><th>Bid</th><th>Ask</th><th>Mid</th><th>Pts</th><th>Carry</th><th>1D pts</th></tr></thead><tbody>` +
      data.rows.map((r) => { const p0 = pd && pd.m[r.t] != null ? pd.m[r.t] - pd.spot : null, d = p0 == null ? null : r.pts - p0;
        return `<tr><td>${r.t}</td><td>${f1(r.bid)}</td><td>${f1(r.ask)}</td><td><b>${f1(r.mid)}</b></td><td>${f1(r.pts)}</td><td>${r.carry.toFixed(2)}%</td><td class="${d == null ? "" : d >= 0 ? "up" : "down"}">${sg(d, 1)}</td></tr>`; }).join("") + "</tbody>";
  }

  function draw() {
    try { drawAll(); } catch (e) {
      const n = root.querySelector("#fwdNote"); if (n) n.textContent = "The forward curve could not be drawn in this browser (" + e.message + "). Try updating the browser or a hard refresh.";
      if (window.console) console.error("fx-fwd", e);
    }
  }
  function drawAll() {
    if (!data || !data.rows || !data.rows.length) return;
    const C = col(); svg.innerHTML = "";
    const W = Math.max(280, svg.clientWidth || 600), H = 260; svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const cm = root.querySelector("#fwdCmp");
    cm.hidden = view !== "curve";
    cm.innerHTML = [["w", "vs 1W ago", ago(7), C.muted], ["m", "vs 1M ago", ago(30), C.down]].map(([k, l, h, c]) =>
      `<button type="button" data-k="${k}" aria-pressed="${!!(cmp[k] && h)}" ${h ? "" : "disabled title=\"Not enough saved history yet\""}><i style="background:${c}"></i>${l}</button>`).join("");
    cm.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { cmp[b.dataset.k] = !cmp[b.dataset.k]; draw(); }));
    if (view === "curve") drawCurve(C, W, H); else drawHist(C, W, H);
    table();
    root.querySelector("#fwdNote").textContent = `Source: ${data.src}, as of ${sgt(data.time)} SGT (refreshed with the FX rates). Spot ${f0(data.spot)}. Carry = points ÷ spot, annualised. ` +
      `Indicative bank-contributed quotes, not dealable prices; Bloomberg's IHN fixings can differ by a few points. ${(data.hist || []).length} daily curve${(data.hist || []).length === 1 ? "" : "s"} saved.`;
  }

  async function load() {
    try { const r = await fetch(SRC + "?t=" + Date.now(), { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (j && j.rows && j.rows.length) { data = j; root.hidden = false; draw(); } } } catch (e) {}
  }
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(draw, 150); });
  if (window.matchMedia) { const mq = matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", draw); };
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  load(); setInterval(load, 5 * 60 * 1000);
})();
