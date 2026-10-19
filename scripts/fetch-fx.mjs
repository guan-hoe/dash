// FX page data: EUR/USD, AUD/USD, USD/CNH, USD/SGD, USD/JPY, USD/KRW, USD/IDR, USD/INR.
// Writes data/fx.json (live quote + ~1.5 years of daily OHLC per pair).
// Sources
//   Live quotes: CNBC quote service, then Yahoo Finance.
//   History: CNBC daily bars, then Yahoo Finance daily bars.
// Anything that fails keeps the previous file's values, so a deploy always goes out with the last good data.
// Usage: node scripts/fetch-fx.mjs
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

// dp = decimals shown on the page
const PAIRS = [
  { k: "eurusd", g: "Majors", name: "Euro / US dollar", short: "EUR/USD", dp: 4, cnbc: "EUR=", yahoo: "EURUSD=X" },
  { k: "gbpusd", g: "Majors", name: "British pound / US dollar", short: "GBP/USD", dp: 4, cnbc: "GBP=", yahoo: "GBPUSD=X" },
  { k: "audusd", g: "Majors", name: "Australian dollar / US dollar", short: "AUD/USD", dp: 4, cnbc: "AUD=", yahoo: "AUDUSD=X" },
  { k: "usdjpy", g: "Majors", name: "US dollar / Japanese yen", short: "USD/JPY", dp: 2, cnbc: "JPY=", yahoo: "JPY=X" },
  { k: "usdchf", g: "Majors", name: "US dollar / Swiss franc", short: "USD/CHF", dp: 4, cnbc: "CHF=", yahoo: "CHF=X" },
  { k: "usdcad", g: "Majors", name: "US dollar / Canadian dollar", short: "USD/CAD", dp: 4, cnbc: "CAD=", yahoo: "CAD=X" },
  { k: "usdcnh", g: "Asia", name: "US dollar / offshore yuan", short: "USD/CNH", dp: 4, cnbc: "CNH=", yahoo: "CNH=X" },
  { k: "usdhkd", g: "Asia", name: "US dollar / Hong Kong dollar", short: "USD/HKD", dp: 4, cnbc: "HKD=", yahoo: "HKD=X" },
  { k: "usdsgd", g: "Asia", name: "US dollar / Singapore dollar", short: "USD/SGD", dp: 4, cnbc: "SGD=", yahoo: "SGD=X" },
  { k: "usdkrw", g: "Asia", name: "US dollar / Korean won", short: "USD/KRW", dp: 2, cnbc: "KRW=", yahoo: "KRW=X" },
  { k: "usdidr", g: "Asia", name: "US dollar / Indonesian rupiah", short: "USD/IDR", dp: 0, cnbc: "IDR=", yahoo: "IDR=X" },
  { k: "usdinr", g: "Asia", name: "US dollar / Indian rupee", short: "USD/INR", dp: 3, cnbc: "INR=", yahoo: "INR=X" },
  // crosses: if no source quotes them directly, they are calculated from the two dollar pairs
  { k: "eurjpy", g: "Crosses", name: "Euro / Japanese yen", short: "EUR/JPY", dp: 2, cnbc: "EURJPY=", yahoo: "EURJPY=X", calc: ["eurusd", "*", "usdjpy"] },
  { k: "cnhjpy", g: "Crosses", name: "Offshore yuan / Japanese yen", short: "CNH/JPY", dp: 3, cnbc: "CNHJPY=", yahoo: "CNHJPY=X", calc: ["usdjpy", "/", "usdcnh"] },
];
const r6 = (v) => +(+v).toPrecision(7);

let prev = { items: [] };
try { prev = JSON.parse(readFileSync("data/fx.json", "utf8")); } catch {}
const prevBy = Object.fromEntries((prev.items || []).map((x) => [x.k, x]));

// FX trades Sunday 5pm to Friday 5pm New York time; a quote after 17:00 ET belongs to the next weekday's bar.
function fxDay(ms) {
  const p = {}; new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).forEach((q) => { p[q.type] = q.value; });
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  if (+p.hour >= 17) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------- CNBC ----------
async function cnbc() {
  const syms = PAIRS.map((i) => i.cnbc).join("|");
  const r = await get(`https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(syms)}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`, { Accept: "application/json" });
  const list = (await r.json())?.FormattedQuoteResult?.FormattedQuote || [];
  const out = {};
  for (const q of list) {
    const last = num(q.last), prevClose = num(q.previous_day_closing);
    if (!isFinite(last)) continue;
    const t = Date.parse(q.last_time);
    out[q.symbol] = { price: last, prevClose: isFinite(prevClose) ? prevClose : null, time: isFinite(t) ? Math.floor(t / 1000) : Math.floor(Date.now() / 1000),
      realtime: q.realTime === "true", src: "CNBC" };
  }
  return out;
}
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
    else { d.push(day); o.push(r6(O)); h.push(r6(H)); l.push(r6(L)); c.push(r6(cl)); }
  }
  if (d.length < 120) throw new Error(`cnbc bars: only ${d.length}`);
  const k = Math.max(0, d.length - 400);
  return { d: d.slice(k), o: o.slice(k), h: h.slice(k), l: l.slice(k), c: c.slice(k) };
}

// ---------- Yahoo ----------
let cookie = "", crumb = "";
async function yahooChart(sym) {
  if (!crumb) {
    try {
      const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(10000) });
      cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
      if (cookie) crumb = await (await get("https://query2.finance.yahoo.com/v1/test/getcrumb", { Cookie: cookie })).text();
    } catch (e) { log("yahoo crumb:", e.message); }
  }
  const q = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";
  const r = await get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d${q}`, { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) });
  const res = (await r.json())?.chart?.result?.[0];
  if (!res) throw new Error("yahoo: empty");
  const qd = res.indicators?.quote?.[0] || {}, ts = res.timestamp || [], cl = qd.close || [];
  const d = [], o = [], h = [], l = [], c = [];
  ts.forEach((t, i) => { if (cl[i] == null) return; const day = fxDay(t * 1000);
    const C = cl[i], O = qd.open?.[i] ?? C, H = Math.max(qd.high?.[i] ?? C, O, C), L = Math.min(qd.low?.[i] ?? C, O, C);
    if (d.at(-1) === day) { const k = c.length - 1; h[k] = Math.max(h[k], r6(H)); l[k] = Math.min(l[k], r6(L)); c[k] = r6(C); }
    else { d.push(day); o.push(r6(O)); h.push(r6(H)); l.push(r6(L)); c.push(r6(C)); } });
  const m = res.meta || {};
  const k = Math.max(0, d.length - 400);
  return { hist: { d: d.slice(k), o: o.slice(k), h: h.slice(k), l: l.slice(k), c: c.slice(k) },
    quote: m.regularMarketPrice ? { price: m.regularMarketPrice, prevClose: null, time: m.regularMarketTime, src: "Yahoo Finance", realtime: false } : null };
}

// ---------- run ----------
let live = {};
try { live = await cnbc(); log("CNBC:", Object.keys(live).join(", ") || "(none)"); } catch (e) { log("CNBC failed:", e.message); }

const items = [];
// Cross rate from two pairs already fetched this run, e.g. EUR/JPY = EUR/USD x USD/JPY. Daily bars line up by date;
// highs and lows are approximate (the two legs' extremes need not happen at the same moment).
function cross([a, op, b]) {
  const A = items.find((x) => x.k === a), B = items.find((x) => x.k === b);
  if (!A || !B || !A.hist.d.length || !B.hist.d.length) return null;
  const f = op === "*" ? (x, y) => x * y : (x, y) => x / y;
  const bi = new Map(B.hist.d.map((d, i) => [d, i]));
  const H = { d: [], o: [], h: [], l: [], c: [] };
  A.hist.d.forEach((d, i) => {
    const j = bi.get(d); if (j == null) return;
    const O = f(A.hist.o[i], B.hist.o[j]), C = f(A.hist.c[i], B.hist.c[j]);
    const hi = op === "*" ? f(A.hist.h[i], B.hist.h[j]) : f(A.hist.h[i], B.hist.l[j]);
    const lo = op === "*" ? f(A.hist.l[i], B.hist.l[j]) : f(A.hist.l[i], B.hist.h[j]);
    H.d.push(d); H.o.push(r6(O)); H.c.push(r6(C)); H.h.push(r6(Math.max(hi, O, C))); H.l.push(r6(Math.min(lo, O, C)));
  });
  return { hist: H.d.length > 100 ? H : null, hsrc: `calculated from ${A.short} and ${B.short}`,
    quote: { price: f(A.price, B.price), prevClose: A.prev && B.prev ? f(A.prev, B.prev) : null, time: Math.min(A.time, B.time), realtime: A.realtime && B.realtime, src: `calculated (${A.src})` } };
}
for (const P of PAIRS) {
  const old = prevBy[P.k] || {};
  let hist = null, quote = live[P.cnbc] || null, hSrc = "";
  try { hist = await cnbcBars(P.cnbc); hSrc = "CNBC daily bars"; } catch (e) { log(P.k, "cnbc bars failed:", e.message); }
  if (!hist || !quote) {
    try {
      const y = await yahooChart(P.yahoo);
      if (!hist && y.hist.d.length > 100) { hist = y.hist; hSrc = "Yahoo Finance"; }
      if (!quote && y.quote) quote = y.quote;
    } catch (e) { log(P.k, "yahoo failed:", e.message); }
  }
  // a cross with no direct CNBC quote uses the rate calculated from the two live CNBC legs (Yahoo's is delayed)
  if (P.calc && (!hist || !quote || quote.src !== "CNBC")) {
    const c = cross(P.calc);
    if (c) { if (!hist) { hist = c.hist; hSrc = c.hsrc; } if (!quote || (quote.src !== "CNBC" && c.quote.realtime)) quote = c.quote; }
  }
  if (!hist) { hist = old.hist || { d: [], o: [], h: [], l: [], c: [] }; hSrc = old.hsrc || "previous file"; }
  if (!quote && old.price != null) quote = { price: old.price, prevClose: old.prev, time: old.time, src: old.src, realtime: false };
  if (!quote) { log(P.k, "no data"); continue; }
  let prevClose = quote.prevClose ?? null;
  if (prevClose == null && hist.c.length > 1) { const qd = fxDay(quote.time * 1000); prevClose = hist.d.at(-1) >= qd ? hist.c.at(-2) : hist.c.at(-1); }
  const chg = prevClose != null ? quote.price - prevClose : null;
  const it = { k: P.k, g: P.g, name: P.name, short: P.short, dp: P.dp, price: r6(quote.price), prev: prevClose == null ? null : r6(prevClose),
    chg: chg == null ? null : r6(chg), pct: chg == null || !prevClose ? null : +((chg / prevClose) * 100).toFixed(2),
    time: quote.time, realtime: !!quote.realtime, src: quote.src, hsrc: hSrc, hist };
  items.push(it);
  log(P.k, it.price, it.pct, it.src, `${hist.d.length} bars (${hSrc})`);
  summary(`- ${P.short}: ${it.price} (${it.pct >= 0 ? "+" : ""}${it.pct}%) · ${it.src} · history ${hSrc}`);
}
mkdirSync("data", { recursive: true });
if (items.length) writeFileSync("data/fx.json", JSON.stringify({ updated: Math.floor(Date.now() / 1000), items }));
else log("fx: no data at all; kept previous file");
