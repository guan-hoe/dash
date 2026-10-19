/* Runtime for stock pages built by scripts/make-stock-page.py.
   Expects globals from the page: KEY, SHARES, TV, Q, G, P, T. Defines lang, setLang, buildCharts
   (used by fcf.js and news.js). Price-based cells are computed from data/history.json + quote.json. */
const EN = {};
document.querySelectorAll("[data-i],[data-ih]").forEach(el => { const k = el.dataset.i || el.dataset.ih; if (!(k in EN)) EN[k] = el.innerHTML; });
let lang = "en";
function setLang(l) {
  lang = l; document.documentElement.lang = l === "zh" ? "zh-Hans" : "en";
  document.querySelectorAll("[data-i],[data-ih]").forEach(el => { const k = el.dataset.i || el.dataset.ih; el.innerHTML = l === "zh" ? (T.zh[k] ?? EN[k]) : EN[k]; });
  document.getElementById("langBtn").textContent = l === "zh" ? "EN" : "中文";
  try { localStorage.setItem(KEY + "-lang", l); } catch (e) {}
  renderTable(); renderQuote(); buildCharts();
}
document.getElementById("langBtn").onclick = () => setLang(lang === "en" ? "zh" : "en");

const modes = ["auto", "light", "dark"]; let mode = "auto";
function setTheme(m) {
  mode = m; const r = document.documentElement; if (m === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", m);
  document.getElementById("themeBtn").textContent = m === "auto" ? "◐ Auto" : m === "light" ? "☀ Light" : "☾ Dark";
  try { localStorage.setItem(KEY + "-theme", m); } catch (e) {} buildCharts();
}
document.getElementById("themeBtn").onclick = () => setTheme(modes[(modes.indexOf(mode) + 1) % 3]);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => buildCharts());

const zhOn = () => lang === "zh";
const fmtB = m => m >= 1000 ? "$" + (m / 1000).toFixed(m >= 100000 ? 0 : m >= 10000 ? 1 : 2) + "B" : "$" + Math.round(m) + "M";
const pctS = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(0) + "%";

// ---- quarterly table + TTM cell ----
// "Q2 2026" -> "Q2 2025", "Q1 FY27" / "Q1 FY27e" -> "Q1 FY26"
const yearAgo = l => { const m = l.replace(/e$/, "").match(/^(Q\d) (FY)?(\d+)$/); if (!m) return null;
  const y = +m[3] - 1; return `${m[1]} ${m[2] || ""}${m[2] ? String(y).padStart(2, "0") : y}`; };
const qBy = l => Q.find(q => q[0] === l);
function renderTable() {
  const b = document.getElementById("qBody"); const f = n => n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 1 : 0 });
  let h = "";
  if (G) { const pg = qBy(yearAgo(G[0]));
    h += `<tr class="guide"><td>${G[0]}</td><td>${zhOn() ? (G[3] || G[2]) : G[2]}</td><td>${f(G[1])}</td><td>${pg ? pctS((G[1] / pg[2] - 1) * 100) : "—"}</td><td>—</td><td>—</td><td>—</td></tr>`; }
  for (let i = Q.length - 1; i >= 0; i--) {
    const q = Q[i], prev = qBy(yearAgo(q[0]));
    const yoy = prev && prev[2] > 0 ? pctS((q[2] / prev[2] - 1) * 100) : "—";
    const e = q[5] == null ? "—" : (q[5] < 0 ? "−$" : "$") + Math.abs(q[5]).toFixed(2);
    h += `<tr><td>${q[0]}</td><td>${q[1]}</td><td><b>${f(q[2])}</b></td><td>${yoy}</td><td>${q[3] == null ? "—" : q[3].toFixed(1) + "%"}</td><td>${q[4] == null ? "—" : q[4].toFixed(1) + "%"}</td><td>${e}</td></tr>`;
  }
  b.innerHTML = h;
  if (TTM) { document.getElementById("ttmV").textContent = TTM.v; document.getElementById("ttmS").textContent = zhOn() ? TTM.zh : TTM.en; return; }
  const n = Q.length, ttm = Q.slice(-4).reduce((s, q) => s + q[2], 0);
  document.getElementById("ttmV").textContent = fmtB(ttm);
  const consecutive = n >= 8;
  document.getElementById("ttmS").textContent = consecutive
    ? pctS((ttm / Q.slice(-8, -4).reduce((s, q) => s + q[2], 0) - 1) * 100) + (zhOn() ? " 同比" : " YoY")
    : (zhOn() ? "最近4个已披露季度" : "last 4 reported quarters");
}

// ---- charts ----
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let charts = [], range = 0;
const WIN = 252;
function sma(a, n) { return a.map((_, i) => i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n); }
function buildCharts() {
  if (!window.Chart) return;
  charts.forEach(c => c.destroy()); charts = [];
  const mut = css("--muted"), line = css("--line"), acc = css("--accent"), cop = css("--copper");
  Chart.defaults.font.family = css("--f-mono"); Chart.defaults.font.size = 11; Chart.defaults.color = mut;
  const grid = { color: line, drawTicks: false }, nobox = { border: { display: false } };
  if (P.c.length) {
    const n = range ? range : WIN, d = P.d.slice(-n), c = P.c.slice(-n), s = sma(P.c, 50).slice(-n);
    const ctx = document.getElementById("cPrice").getContext("2d");
    const gr = ctx.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, acc + "40"); gr.addColorStop(1, acc + "00");
    charts.push(new Chart(ctx, { type: "line", data: { labels: d, datasets: [
      { label: zhOn() ? "收盘" : "Close", data: c, borderColor: acc, backgroundColor: gr, fill: true, borderWidth: 1.8, pointRadius: c.map((_, i) => i === c.length - 1 ? 4 : 0), pointBackgroundColor: acc, tension: .15 },
      { label: "SMA 50", data: s, borderColor: cop, borderWidth: 1.2, borderDash: [4, 3], pointRadius: 0, fill: false }] },
      options: { maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { boxWidth: 10, color: mut } }, tooltip: { callbacks: { label: t => `${t.dataset.label}: $${t.parsed.y?.toFixed(2)}` } } },
        scales: { x: { ...nobox, grid: { display: false }, ticks: { maxTicksLimit: 7, callback: function (v) { const s = this.getLabelForValue(v); return s.slice(5, 7) + "/" + s.slice(2, 4); } } },
          y: { ...nobox, grid, ticks: { callback: v => "$" + v.toLocaleString("en-US") } } } } }));
  }
  const QQ = Q.slice(-12), labels = QQ.map(q => q[0]).concat(G ? [G[0]] : []);
  charts.push(new Chart(document.getElementById("cRev"), { data: { labels, datasets: [
    { type: "line", label: zhOn() ? "毛利率" : "Gross margin", data: QQ.map(q => q[3]).concat(G ? [null] : []), borderColor: cop, backgroundColor: cop, borderWidth: 2, pointRadius: 2.5, yAxisID: "y2", tension: .2, order: 0 },
    { type: "bar", label: zhOn() ? "营收" : "Revenue", data: QQ.map(q => q[2]).concat(G ? [null] : []), backgroundColor: acc, borderRadius: 2, stack: "s", order: 1 },
    { type: "bar", label: zhOn() ? "指引" : "Guidance", data: QQ.map(() => null).concat(G ? [G[1]] : []), backgroundColor: line, borderColor: mut, borderWidth: 1, borderDash: [3, 3], borderRadius: 2, stack: "s", order: 1 }] },
    options: { maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { filter: t => t.parsed.y != null, callbacks: { label: t => t.dataset.yAxisID === "y2" ? `${t.dataset.label}: ${t.parsed.y.toFixed(1)}%` : `${t.dataset.label}: ${fmtB(t.parsed.y)}` } } },
      scales: { x: { ...nobox, grid: { display: false }, stacked: true, ticks: { maxRotation: 0, autoSkip: true, callback: function (v) { return this.getLabelForValue(v).split(" "); } } },
        y: { ...nobox, stacked: true, grid, ticks: { callback: v => fmtB(v) } },
        y2: { ...nobox, position: "right", grid: { display: false }, ticks: { callback: v => v + "%" } } } } }));
}
document.querySelectorAll(".range button").forEach(b => b.onclick = () => { range = +b.dataset.r;
  document.querySelectorAll(".range button").forEach(x => x.setAttribute("aria-pressed", x === b)); buildCharts(); });

// ---- live quote + price-derived cells ----
let LQ = null;
const fmt$ = v => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sgn = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
const sgn1 = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);
const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
const dfmt = s => new Date(s + "T12:00:00Z").toLocaleDateString(zhOn() ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function rsi(c, n = 14) {
  if (c.length <= n) return null; let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function renderQuote() {
  const c = P.c; if (!c.length && !LQ) return;
  const zh = zhOn();
  const last = LQ ? LQ.price : c[c.length - 1], prev = LQ && LQ.prevClose ? LQ.prevClose : c[c.length - 2];
  ["barPx", "pxBig"].forEach(id => set(id, fmt$(last)));
  if (prev) {
    const ch = last - prev, pct = ch / prev * 100, up = ch >= 0;
    const bc = document.getElementById("barChg"), pc = document.getElementById("pxChg");
    bc.textContent = sgn(pct) + "%"; pc.textContent = `${sgn(ch)} (${sgn(pct)}%)`;
    [bc, pc].forEach(e => { e.classList.toggle("up", up); e.classList.toggle("down", !up); });
  }
  const m = last * SHARES; set("mcap", "$" + (m >= 1e12 ? (m / 1e12).toFixed(2) + "T" : (m / 1e9).toFixed(m >= 1e11 ? 0 : 1) + "B"));
  if (c.length > 1) {
    const w = c.slice(-WIN), wd = P.d.slice(-WIN);
    const yr = String(new Date().getFullYear()); let base = null;
    for (let i = 0; i < P.d.length; i++) if (P.d[i] < yr) base = c[i];
    const ytd = base ? (last / base - 1) * 100 : null, y1 = (last / w[0] - 1) * 100;
    const short = w.length < 240;
    set("pxNote", (ytd != null ? (zh ? "年初至今 " : "YTD ") + sgn1(ytd) + "% · " : "") + (short ? (zh ? "上市以来 " : "Since listing ") : (zh ? "一年 " : "1Y ")) + sgn1(y1) + "%");
    let hi = 0, lo = 0; w.forEach((x, i) => { if (x > w[hi]) hi = i; if (x < w[lo]) lo = i; });
    set("hiV", fmt$(w[hi])); set("hiS", dfmt(wd[hi])); set("loV", fmt$(w[lo])); set("loS", dfmt(wd[lo]));
    set("r52", "$" + Math.round(w[lo]).toLocaleString("en-US") + "–" + Math.round(w[hi]).toLocaleString("en-US"));
    const s50 = c.length >= 50 ? c.slice(-50).reduce((s, x) => s + x, 0) / 50 : null;
    const s200 = c.length >= 200 ? c.slice(-200).reduce((s, x) => s + x, 0) / 200 : null;
    const pos = s => last >= s ? (zh ? "股价在上方" : "price above") : (zh ? "股价在下方" : "price below");
    set("s50V", s50 ? fmt$(s50) : "—"); set("s50S", s50 ? pos(s50) : (zh ? "数据不足" : "not enough history"));
    set("s200V", s200 ? fmt$(s200) : "—"); set("s200S", s200 ? pos(s200) : (zh ? "上市未满200日" : "under 200 sessions"));
    const r = rsi(c.slice(-120)); set("rsiV", r == null ? "—" : r.toFixed(1));
    set("rsiS", r == null ? "" : r >= 70 ? (zh ? "超买" : "overbought") : r <= 30 ? (zh ? "超卖" : "oversold") : (zh ? "中性" : "neutral"));
    const ch20 = c.slice(-21); let mv = 0; for (let i = 1; i < ch20.length; i++) mv += Math.abs(ch20[i] / ch20[i - 1] - 1);
    set("mvV", ch20.length > 1 ? "±" + (mv / (ch20.length - 1) * 100).toFixed(1) + "%" : "—");
    const peak = Math.max(...w, last), dd = (last / peak - 1) * 100, ddv = document.getElementById("ddv");
    ddv.textContent = (dd < -0.5 ? "−" : "") + Math.abs(dd).toFixed(0) + "%"; ddv.classList.toggle("down", dd < -0.5);
    set("ddS", (zh ? "相对 " : "vs. ") + dfmt(wd[hi]) + (zh ? " 收盘" : " close"));
  }
  const t = LQ && LQ.time ? new Date(LQ.time * 1000) : null;
  const sgt = d => d.toLocaleString(zh ? "zh-CN" : "en-SG", { timeZone: "Asia/Singapore", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const open = LQ && LQ.state === "REGULAR";
  set("pxLabel", open ? (zh ? "盘中 · 美股交易中" : "Intraday · market open") : (zh ? "最近收盘" : "Last close") + (t ? " · " + t.toLocaleDateString(zh ? "zh-CN" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }) : ""));
  document.getElementById("barLive").classList.toggle("on", !!open);
  set("barTime", t ? (open ? (zh ? "实时 " : "Live ") : (zh ? "收盘 " : "Closed ")) + sgt(t) + " SGT" : (zh ? "快照" : "snapshot"));
  set("footTime", t ? (zh ? "股价更新于 " : "Price updated ") + sgt(t) + " SGT (" + (zh ? "约每10分钟刷新" : "refreshes about every 10 min") + ")." : "");
}
async function loadLive() {
  try {
    const bust = "?t=" + Date.now();
    const [q, hist] = await Promise.all([
      fetch("data/quote.json" + bust, { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("data/history.json" + bust, { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null)]);
    let changed = false;
    if (hist && hist.d && hist.d.length > 5 && (!P.d.length || hist.d[hist.d.length - 1] >= P.d[P.d.length - 1])) { P = { d: hist.d.slice(), c: hist.c.slice() }; changed = true; }
    if (q && q.price) {
      if (!LQ || q.time !== LQ.time) changed = true;
      LQ = q;
      if (q.date && P.d.length) { const i = P.d.indexOf(q.date); if (i >= 0) P.c[i] = q.price; else if (q.date > P.d[P.d.length - 1]) { P.d.push(q.date); P.c.push(q.price); } }
    }
    if (changed) { renderQuote(); buildCharts(); }
  } catch (e) { /* keep snapshot */ }
}

let sl0 = "en", st = "auto"; try { sl0 = localStorage.getItem(KEY + "-lang") || "en"; st = localStorage.getItem(KEY + "-theme") || "auto"; } catch (e) {}
mode = st; if (st !== "auto") document.documentElement.setAttribute("data-theme", st);
document.getElementById("themeBtn").textContent = st === "auto" ? "◐ Auto" : st === "light" ? "☀ Light" : "☾ Dark";
setLang(sl0);
loadLive(); setInterval(loadLive, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadLive(); });

(function () { const s = document.createElement("script"); s.src = "https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js"; s.async = true;
  s.text = JSON.stringify({ symbol: TV, width: "100%", isTransparent: true, colorTheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light", locale: "en" });
  document.querySelector("#tv .tradingview-widget-container").appendChild(s); })();
