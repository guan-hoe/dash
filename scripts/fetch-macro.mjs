// Macro page data: crude oil, gold, silver, the 2/5/10/30-year US Treasury, German Bund and French OAT yields,
// plus an economic calendar.
// Writes data/macro.json (live quote, about 1 year of daily bars and ~10 days of 30-minute bars per instrument)
// and data/macro-cal.json.
// Sources
//   Live quotes: CNBC quote service (Tradeweb yields, CME/COMEX front-month futures), then Yahoo Finance.
//   History: Yahoo daily closes for the futures; US Treasury daily par yield curve for the yields
//            (Yahoo ^FVX/^TNX/^TYX as a fallback; the 2-year has no Yahoo index).
//   Calendar: Forex Factory weekly calendar JSON (this week and next week); forecast and previous only.
// Anything that fails keeps the previous file's values, so a deploy always goes out with the last good data.
// Usage: node scripts/fetch-macro.mjs
import { writeFileSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const log = (...a) => console.log(...a);
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };
const num = (s) => (s == null ? NaN : parseFloat(String(s).replace(/[$,%+\s]/g, "")));
const nyDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
async function get(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...headers }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split("?")[0]}`);
  return r;
}

const INSTR = [
  { k: "oil", name: "WTI crude oil", short: "Crude oil", unit: "$/bbl", kind: "commodity", cnbc: "@CL.1", yahoo: "CL=F" },
  { k: "gold", name: "Gold (COMEX)", short: "Gold", unit: "$/oz", kind: "commodity", cnbc: "@GC.1", yahoo: "GC=F" },
  { k: "silver", name: "Silver (COMEX)", short: "Silver", unit: "$/oz", kind: "commodity", cnbc: "@SI.1", yahoo: "SI=F" },
  { k: "us2y", name: "US 2-year Treasury yield", short: "2Y yield", unit: "%", kind: "yield", cnbc: "US2Y", tsy: "2 Yr" },
  { k: "us5y", name: "US 5-year Treasury yield", short: "5Y yield", unit: "%", kind: "yield", cnbc: "US5Y", tsy: "5 Yr", yahoo: "^FVX" },
  { k: "us10y", name: "US 10-year Treasury yield", short: "10Y yield", unit: "%", kind: "yield", cnbc: "US10Y", tsy: "10 Yr", yahoo: "^TNX" },
  { k: "us30y", name: "US 30-year Treasury yield", short: "30Y yield", unit: "%", kind: "yield", cnbc: "US30Y", tsy: "30 Yr", yahoo: "^TYX" },
  // German Bunds and French OATs: CNBC (Tradeweb) quotes and daily bars only; on failure the previous file's values are kept
  ...[2, 5, 10, 30].map((y) => ({ k: `de${y}y`, name: `German ${y}-year Bund yield`, short: `Bund ${y}Y`, unit: "%", kind: "yield", grp: "de", cnbc: `DE${y}Y-DE` })),
  ...[2, 5, 10, 30].map((y) => ({ k: `fr${y}y`, name: `French ${y}-year OAT yield`, short: `OAT ${y}Y`, unit: "%", kind: "yield", grp: "fr", cnbc: `FR${y}Y-FR` })),
];

let prev = { items: [] };
try { prev = JSON.parse(readFileSync("data/macro.json", "utf8")); } catch {}
const prevBy = Object.fromEntries((prev.items || []).map((x) => [x.k, x]));

// ---------- live quotes ----------
async function cnbc() {
  const syms = INSTR.map((i) => i.cnbc).join("|");
  const r = await get(`https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(syms)}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`, { Accept: "application/json" });
  const list = (await r.json())?.FormattedQuoteResult?.FormattedQuote || [];
  const out = {};
  for (const q of list) {
    const last = num(q.last), prevClose = num(q.previous_day_closing);
    if (!isFinite(last)) continue;
    const t = Date.parse(q.last_time);
    out[q.symbol] = { price: last, prevClose: isFinite(prevClose) ? prevClose : null, time: isFinite(t) ? Math.floor(t / 1000) : Math.floor(Date.now() / 1000),
      contract: q.name, realtime: q.realTime === "true", src: "CNBC" + (q.exchange ? " · " + q.exchange : "") };
  }
  return out;
}
let cookie = "", crumb = "";
async function yahooChart(sym, range = "2y") {
  if (!crumb) {
    try {
      const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(10000) });
      cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
      if (cookie) crumb = await (await get("https://query2.finance.yahoo.com/v1/test/getcrumb", { Cookie: cookie })).text();
    } catch (e) { log("yahoo crumb:", e.message); }
  }
  const q = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";
  const r = await get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d${q}`, { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) });
  const res = (await r.json())?.chart?.result?.[0];
  if (!res) throw new Error("yahoo: empty");
  const qd = res.indicators?.quote?.[0] || {}, ts = res.timestamp || [], cl = qd.close || [];
  const d = [], o = [], h = [], l = [], c = [], r4 = (v, fb) => +((v ?? fb).toFixed(4));
  ts.forEach((t, i) => { if (cl[i] == null) return; const day = nyDate(t * 1000);
    const row = [r4(qd.open?.[i], cl[i]), r4(qd.high?.[i], cl[i]), r4(qd.low?.[i], cl[i]), r4(cl[i])];
    if (d.at(-1) === day) { const k = c.length - 1; h[k] = Math.max(h[k], row[1]); l[k] = Math.min(l[k], row[2]); c[k] = row[3]; }
    else { d.push(day); o.push(row[0]); h.push(row[1]); l.push(row[2]); c.push(row[3]); } });
  const m = res.meta || {};
  return { hist: { d, o, h, l, c }, quote: { price: m.regularMarketPrice, prevClose: null, time: m.regularMarketTime, src: "Yahoo Finance", realtime: false } };
}

// ---------- CNBC daily OHLC bars (same feed as the live quotes) ----------
async function cnbcBars(sym) {
  const j = await (await get(`https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol=${encodeURIComponent(sym)}`, { Accept: "application/json" })).json();
  const bars = j?.barData?.priceBars || [];
  const d = [], o = [], h = [], l = [], c = [];
  for (const b of bars) {
    const cl = num(b.close); if (!isFinite(cl)) continue;
    const t = String(b.tradeTime || ""), day = t.length >= 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : nyDate(b.tradeTimeinMills);
    const op = num(b.open), hi = num(b.high), lo = num(b.low);
    const O = isFinite(op) ? op : cl, H = Math.max(isFinite(hi) ? hi : cl, O, cl), L = Math.min(isFinite(lo) ? lo : cl, O, cl);
    if (d.at(-1) === day) { const k = c.length - 1; h[k] = Math.max(h[k], H); l[k] = Math.min(l[k], L); c[k] = cl; }
    else { d.push(day); o.push(O); h.push(H); l.push(L); c.push(cl); }
  }
  if (d.length < 120) throw new Error(`cnbc bars: only ${d.length}`);
  const k = Math.max(0, d.length - 400);   // ~1.5 years, enough for the 100-day average over a 1-year view
  return { d: d.slice(k), o: o.slice(k), h: h.slice(k), l: l.slice(k), c: c.slice(k) };
}

// ---------- intraday bars for the 1-week chart (30-minute candles, about the last 10 days) ----------
// CNBC 5-day chart first (same feed as the quotes), then Yahoo 30-minute bars for one month (more warm-up
// for the indicators). Returns { t: [unix seconds], o, h, l, c } or null.
function bucket30(rows) {
  const t = [], o = [], h = [], l = [], c = [], r4 = (v) => +v.toFixed(4);
  for (const [ts, O, H, L, C] of rows.sort((a, b) => a[0] - b[0])) {
    if (![ts, O, H, L, C].every(isFinite)) continue;
    const b = Math.floor(ts / 1800) * 1800;
    if (t.at(-1) === b) { const k = c.length - 1; h[k] = Math.max(h[k], r4(H)); l[k] = Math.min(l[k], r4(L)); c[k] = r4(C); }
    else { t.push(b); o.push(r4(O)); h.push(r4(Math.max(H, O, C))); l.push(r4(Math.min(L, O, C))); c.push(r4(C)); }
  }
  const from = (t.at(-1) || 0) - 12 * 86400, k = t.findIndex((x) => x >= from);
  return t.length ? { t: t.slice(k), o: o.slice(k), h: h.slice(k), l: l.slice(k), c: c.slice(k) } : null;
}
async function intraday(ins) {
  try {
    const j = await (await get(`https://ts-api.cnbc.com/harmony/app/charts/5D.json?symbol=${encodeURIComponent(ins.cnbc)}`, { Accept: "application/json" })).json();
    const rows = (j?.barData?.priceBars || []).map((b) => {
      const cl = num(b.close), op = num(b.open), hi = num(b.high), lo = num(b.low), ms = num(b.tradeTimeinMills);
      return [Math.floor(ms / 1000), isFinite(op) ? op : cl, isFinite(hi) ? hi : cl, isFinite(lo) ? lo : cl, cl];
    });
    const b = bucket30(rows);
    if (b && b.t.length >= 40) return { bars: b, src: "CNBC 30-minute bars" };
    log(ins.k, "cnbc intraday: only", b ? b.t.length : 0);
  } catch (e) { log(ins.k, "cnbc intraday failed:", e.message); }
  if (ins.yahoo) {
    try {
      const q = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";
      const r = await get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ins.yahoo)}?range=1mo&interval=30m${q}`, { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) });
      const res = (await r.json())?.chart?.result?.[0], qd = res?.indicators?.quote?.[0] || {};
      const rows = (res?.timestamp || []).map((ts, i) => [ts, qd.open?.[i] ?? qd.close?.[i], qd.high?.[i] ?? qd.close?.[i], qd.low?.[i] ?? qd.close?.[i], qd.close?.[i]]).filter((x) => x[4] != null);
      const b = bucket30(rows);
      if (b && b.t.length >= 40) return { bars: b, src: "Yahoo Finance 30-minute bars" };
    } catch (e) { log(ins.k, "yahoo intraday failed:", e.message); }
  }
  return null;
}

// ---------- Treasury par yield curve (official daily) ----------
async function treasury() {
  const y = new Date().getUTCFullYear(), rows = [];
  for (const yr of [y - 2, y - 1, y]) {
    let t; try { t = await (await get(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${yr}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${yr}&page&_format=csv`)).text(); } catch (e) { log(`Treasury ${yr} failed:`, e.message); continue; }
    const lines = t.trim().split(/\r?\n/), head = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
    for (const ln of lines.slice(1)) {
      const f = ln.split(","), [mm, dd, yy] = f[0].split("/");
      const row = { d: `${yy}-${mm}-${dd}` };
      head.forEach((h, i) => { if (i) row[h] = num(f[i]); });
      rows.push(row);
    }
  }
  rows.sort((a, b) => (a.d < b.d ? -1 : 1));
  const cutoff = new Date(Date.now() - 560 * 864e5).toISOString().slice(0, 10);
  return rows.filter((r) => r.d >= cutoff);
}

let live = {};
try { live = await cnbc(); log("CNBC:", Object.keys(live).join(", ")); } catch (e) { log("CNBC failed:", e.message); }
let tsy = null;
try { tsy = await treasury(); log("Treasury rows:", tsy.length, "latest", tsy.at(-1)?.d); } catch (e) { log("Treasury failed:", e.message); }

const items = [];
for (const ins of INSTR) {
  const old = prevBy[ins.k] || {};
  let hist = null, quote = live[ins.cnbc] || null, hSrc = "";
  try { hist = await cnbcBars(ins.cnbc); hSrc = "CNBC daily bars"; } catch (e) { log(ins.k, "cnbc bars failed:", e.message); }
  if (!hist && ins.kind === "yield" && tsy && tsy.length > 100) {
    const d = [], c = [];
    for (const r of tsy) if (isFinite(r[ins.tsy])) { d.push(r.d); c.push(r[ins.tsy]); }
    hist = { d, o: c, h: c, l: c, c }; hSrc = "US Treasury (closes only)";
  }
  if ((!hist || !quote) && ins.yahoo) {
    try {
      const y = await yahooChart(ins.yahoo);
      if (!hist && y.hist.d.length > 100) { const k = Math.max(0, y.hist.d.length - 400); hist = Object.fromEntries(Object.entries(y.hist).map(([n, a]) => [n, a.slice(k)])); hSrc = "Yahoo Finance"; }
      if (!quote && y.quote.price) quote = y.quote;
    } catch (e) { log(ins.k, "yahoo failed:", e.message); }
  }
  if (!quote && ins.kind === "yield" && hist) {
    quote = { price: hist.c.at(-1), prevClose: hist.c.at(-2), time: Math.floor(Date.parse(hist.d.at(-1) + "T21:00:00Z") / 1000), src: "US Treasury (daily close)", realtime: false };
  }
  if (!hist) { hist = old.hist || { d: [], c: [] }; hSrc = old.hsrc || "previous file"; }
  if (!quote) { quote = old.price != null ? { price: old.price, prevClose: old.prev, time: old.time, src: old.src, realtime: false, contract: old.contract } : null; }
  if (!quote) { log(ins.k, "no data"); continue; }
  let intra = await intraday(ins);
  if (!intra && old.intra && old.intra.t && old.intra.t.length) intra = { bars: old.intra, src: old.isrc || "previous file" };
  // previous close: from the quote, else the last daily close before the quote's own date
  let prevClose = quote.prevClose ?? null;
  if (prevClose == null && hist.c.length > 1) { const qd = nyDate(quote.time * 1000); prevClose = hist.d.at(-1) >= qd ? hist.c.at(-2) : hist.c.at(-1); }
  const chg = prevClose != null ? quote.price - prevClose : null;
  const it = { k: ins.k, name: ins.name, short: ins.short, unit: ins.unit, kind: ins.kind, grp: ins.grp || (ins.kind === "yield" ? "us" : "cmd"), price: +quote.price.toFixed(ins.kind === "yield" ? 3 : 2),
    prev: prevClose, chg: chg == null ? null : +chg.toFixed(ins.kind === "yield" ? 3 : 2),
    pct: chg == null || !prevClose ? null : +((chg / prevClose) * 100).toFixed(2),
    time: quote.time, realtime: !!quote.realtime, src: quote.src, contract: quote.contract || null, hsrc: hSrc, hist,
    ...(intra ? { intra: intra.bars, isrc: intra.src } : {}) };
  items.push(it);
  log(ins.k, it.price, it.chg, it.src, `${hist.d.length} bars (${hSrc})`, intra ? `${intra.bars.t.length} intraday (${intra.src})` : "no intraday");
  summary(`- ${ins.short}: ${it.price}${ins.unit === "%" ? "%" : ""} (${it.chg >= 0 ? "+" : ""}${it.chg}) · ${it.src} · history ${hSrc}`);
}
mkdirSync("data", { recursive: true });
writeFileSync("data/macro.json", JSON.stringify({ updated: Math.floor(Date.now() / 1000), items }));

// ---------- economic calendar ----------
let cal = { events: [] };
try { cal = JSON.parse(readFileSync("data/macro-cal.json", "utf8")); } catch {}
const ev = [];
for (const wk of ["thisweek", "nextweek"]) {
  try {
    const j = await (await get(`https://nfs.faireconomy.media/ff_calendar_${wk}.json`, { Accept: "application/json" })).json();
    for (const e of j) {
      const ts = Date.parse(e.date);
      if (!isFinite(ts)) continue;
      ev.push({ t: e.title, c: e.country, ts: Math.floor(ts / 1000), imp: e.impact, fc: e.forecast || "", pv: e.previous || "", act: e.actual || "" });
    }
    log(`calendar ${wk}: ${j.length}`);
  } catch (e) { log(`calendar ${wk} failed:`, e.message); }
}
if (ev.length) {
  // keep the last 14 days of earlier events so the page can show what just happened
  const first = Math.min(...ev.map((e) => e.ts)), keepFrom = Date.now() / 1000 - 14 * 86400;
  const older = (cal.events || []).filter((e) => e.ts < first && e.ts >= keepFrom);
  const seen = new Set(), all = [];
  for (const e of [...older, ...ev].sort((a, b) => a.ts - b.ts)) { const k = e.t + "|" + e.c + "|" + e.ts; if (!seen.has(k)) { seen.add(k); all.push(e); } }
  writeFileSync("data/macro-cal.json", JSON.stringify({ updated: Math.floor(Date.now() / 1000), source: "Forex Factory", events: all }));
  summary(`- Calendar: ${all.length} events`);
} else log("calendar: kept previous file");
