// Fed funds rate expectations for the Macro page, FedWatch-style.
// Writes data/fedwatch.json: one snapshot per trading day for about the last 6 weeks, each with the
// futures-implied rate after every upcoming FOMC meeting, the bps priced and the probability of each
// target range. The page compares today's snapshot with 1 day, 1 week, 2 weeks and 1 month ago.
//
// Method (the one CME FedWatch documents):
//   30-day fed funds futures (CBOT ZQ) settle at 100 minus the month's average effective fed funds rate.
//   Walking the meetings in order from today's EFFR, the rate after a meeting is either the next month's
//   implied rate (when that month has no meeting) or solved from the meeting month's average:
//     avg = (d * before + (N - d) * after) / N   (the decision takes effect the day after the meeting).
//   Each meeting's expected move in 25bp steps is split between the two neighbouring moves and chained into
//   a probability tree, giving the probability of each target range after every meeting.
// Sources: Yahoo Finance daily bars for each ZQ contract; FRED (EFFR, DFEDTARL, DFEDTARU) for the
// effective rate and target range, with the New York Fed API and known values as fallbacks.
// Anything that fails keeps the previous file's snapshots. The deploy job does not commit this file, so when
// there is no local copy the previous one is read back from the published site (GitHub Pages) instead;
// without that, a run where Yahoo throttled the fetch published nothing or only part of the curve.
// Also writes `events`: scheduled US data releases (data/macro-cal.json), Fed / economy / rates headlines
// (data/macro-news.json plus a 45-day Google News search) for the "How pricing moved" chart. Events are
// merged with the previous file's, so the history grows beyond the 14 days the other feeds keep.
// Usage: node scripts/fetch-fedwatch.mjs
import { writeFileSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const log = (...a) => console.log(...a);
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };
const nyDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
async function get(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...headers }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split("?")[0]}`);
  return r;
}

// FOMC decision days (second day of each meeting), from the Fed's published schedules.
// Add the next year's dates when the Fed announces them (usually in August).
export const FOMC = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08",
];
// Known policy settings, used when FRED and the NY Fed are unreachable: [from date, lower, upper, typical EFFR]
const KNOWN = [
  ["2025-12-11", 3.50, 3.75, 3.64],
  ["2026-09-17", 3.75, 4.00, 3.88],
];
const CODES = "FGHJKMNQUVXZ";
const ym = (d) => d.slice(0, 7);
const addMonth = (m, k = 1) => { const [y, mo] = m.split("-").map(Number); const t = new Date(Date.UTC(y, mo - 1 + k, 1)); return t.toISOString().slice(0, 7); };
const daysIn = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
const zq = (m) => `ZQ${CODES[+m.slice(5, 7) - 1]}${m.slice(2, 4)}.CBT`;
const meetingMonths = new Set(FOMC.map(ym));

// ---------- pure computation (exported for tests) ----------
// prices: { "YYYY-MM": futures price }, date: snapshot date, r0: EFFR on that date, lower: target lower bound
export function snapshot(date, prices, r0, lower) {
  const spread = r0 - lower;                     // where EFFR trades inside the range
  const meetings = FOMC.filter((d) => d > date); // a meeting on the snapshot date has already happened by the settle
  let before = r0, dist = new Map([[0, 1]]);     // distribution over 25bp steps from the current range
  const out = [];
  for (const md of meetings) {
    const m = ym(md), d = +md.slice(8, 10), N = daysIn(m), nx = addMonth(m);
    let after = null, how = "";
    if (!meetingMonths.has(nx) && prices[nx] != null) { after = 100 - prices[nx]; how = "next"; }
    else if (prices[m] != null && N - d > 0) { after = (N * (100 - prices[m]) - d * before) / (N - d); how = "same"; }
    else if (prices[m] == null && prices[nx] != null) {
      // meeting month's contract has expired off the feed: solve from the next month, whose own meeting
      // outcome comes from the month after it (when that month has no meeting)
      const m2 = FOMC.find((x) => ym(x) === nx), n3 = addMonth(nx), N2 = daysIn(nx);
      if (m2 && !meetingMonths.has(n3) && prices[n3] != null) {
        const d2 = +m2.slice(8, 10), a2 = 100 - prices[n3];
        after = (N2 * (100 - prices[nx]) - (N2 - d2) * a2) / d2; how = "back";
      }
    }
    if (after == null || !isFinite(after) || after < -1 || after > 15) break;
    const steps = (after - before) / 0.25, lo = Math.floor(steps), fr = steps - lo;
    const nd = new Map();
    for (const [k, p] of dist) {
      if (1 - fr > 1e-9) nd.set(k + lo, (nd.get(k + lo) || 0) + p * (1 - fr));
      if (fr > 1e-9) nd.set(k + lo + 1, (nd.get(k + lo + 1) || 0) + p * fr);
    }
    dist = nd;
    const probs = {};
    for (const [k, p] of [...dist].sort((a, b) => a[0] - b[0])) if (p >= 0.0005) probs[(lower + k * 0.25).toFixed(2)] = +p.toFixed(4);
    out.push({ d: md, rate: +after.toFixed(4), move: +((after - before) * 100).toFixed(1), cum: +((after - r0) * 100).toFixed(1), how, p: probs });
    before = after;
  }
  return { d: date, effr: r0, lower, upper: lower + 0.25, spread: +spread.toFixed(3), meetings: out };
}

// ---------- fetching ----------
let cookie = "", crumb = "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// one retry with a fresh crumb: deploy runs this after ~100 other Yahoo calls and the odd 401/429 is common
async function yahooDaily(sym) {
  try { return await yahooOnce(sym); }
  catch (e) {
    if (/HTTP 404/.test(e.message)) throw e; // expired contract, retrying will not help
    crumb = ""; cookie = ""; await sleep(2500);
    return yahooOnce(sym);
  }
}
async function yahooOnce(sym) {
  if (!crumb) {
    try {
      const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(10000) });
      cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
      if (cookie) crumb = await (await get("https://query2.finance.yahoo.com/v1/test/getcrumb", { Cookie: cookie })).text();
    } catch (e) { log("yahoo crumb:", e.message); }
  }
  const q = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";
  const r = await get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d${q}`, { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) });
  const res = (await r.json())?.chart?.result?.[0];
  if (!res) throw new Error("empty");
  const ts = res.timestamp || [], cl = res.indicators?.quote?.[0]?.close || [], out = {};
  ts.forEach((t, i) => { if (cl[i] != null && cl[i] > 80 && cl[i] < 101) out[nyDate(t * 1000)] = +cl[i].toFixed(4); });
  const m = res.meta || {};
  if (m.regularMarketPrice > 80 && m.regularMarketTime) out[nyDate(m.regularMarketTime * 1000)] = +m.regularMarketPrice.toFixed(4);
  return { bars: out, time: m.regularMarketTime || null };
}

async function policy() {
  // returns { "YYYY-MM-DD": { effr, lower, upper } } for the last ~3 months
  const from = new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10), out = {};
  try {
    const t = await (await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=EFFR,DFEDTARL,DFEDTARU&cosd=${from}`)).text();
    const lines = t.trim().split(/\r?\n/), head = lines[0].split(",");
    for (const ln of lines.slice(1)) {
      const f = ln.split(","), row = {};
      head.forEach((h, i) => { if (i) row[h.trim()] = parseFloat(f[i]); });
      out[f[0]] = { effr: row.EFFR, lower: row.DFEDTARL, upper: row.DFEDTARU };
    }
    log("FRED rows:", Object.keys(out).length);
  } catch (e) { log("FRED failed:", e.message); }
  try {
    const j = await (await get("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/60.json", { Accept: "application/json" })).json();
    for (const r of j?.refRates || []) {
      const o = out[r.effectiveDate] || (out[r.effectiveDate] = {});
      if (!isFinite(o.effr)) o.effr = +r.percentRate;
      if (!isFinite(o.lower) && r.targetRateFrom != null) o.lower = +r.targetRateFrom;
      if (!isFinite(o.upper) && r.targetRateTo != null) o.upper = +r.targetRateTo;
    }
    log("NY Fed rows:", (j?.refRates || []).length);
  } catch (e) { log("NY Fed failed:", e.message); }
  return out;
}
// policy on a date: the latest known row on or before it, else the KNOWN table
function policyOn(date, rows) {
  // on a meeting day the futures settle already reflects the decision, which takes effect the next day
  if (FOMC.includes(date)) date = new Date(Date.parse(date + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
  const keys = Object.keys(rows).filter((k) => k <= date && isFinite(rows[k].effr)).sort();
  const known = KNOWN.filter((k) => k[0] <= date).at(-1) || KNOWN[0];
  let lower = known[1], effr = known[3];
  const kl = Object.keys(rows).filter((k) => k <= date && isFinite(rows[k].lower)).sort().at(-1);
  if (kl) lower = rows[kl].lower;
  if (keys.length) { const e = rows[keys.at(-1)].effr; if (e >= lower - 0.05 && e <= lower + 0.3) effr = e; }
  return { effr, lower };
}

// The previous file: the local copy, else the copy on the published site.
async function previous() {
  try { return JSON.parse(readFileSync("data/fedwatch.json", "utf8")); } catch {}
  const repo = process.env.GITHUB_REPOSITORY || "angcharles/stock-dashboard", [owner, name] = repo.split("/");
  const url = process.env.FEDWATCH_PREV_URL || `https://${owner.toLowerCase()}.github.io/${name}/data/fedwatch.json`;
  try {
    const j = await (await get(`${url}?t=${Date.now()}`, { Accept: "application/json" })).json();
    log(`previous file from the site: ${j.snapshots?.length || 0} snapshots, ${j.events?.length || 0} events`);
    return j;
  } catch (e) { log("previous file from the site failed:", e.message); return { snapshots: [] }; }
}

// ---------- events for the history chart ----------
const FEDRX = /\bFed\b|Federal Reserve|FOMC|fed funds|rate (cut|hike)s?|\bhikes?\b|Fed (chair|governor|official|president)|Beige Book|dot plot/i;
const RELEVANT = /\bFed\b|Federal Reserve|FOMC|fed funds|rate (cut|hike)|inflation|\bCPI\b|\bPCE\b|\bPPI\b|payrolls?|jobs report|unemployment|jobless|\bGDP\b|retail sales|\bISM\b|\bPMI\b|Treasury yields?|bond yields?|\byields?\b|tariff|shutdown|wage/i;
const ekey = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 70);
function decode(s = "") {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
async function googleNews(q) {
  const xml = await (await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, { Accept: "application/rss+xml,application/xml" })).text();
  const tag = (it, n) => { const m = it.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)); return m ? decode(m[1]) : ""; };
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    let t = tag(it, "title"); const src = tag(it, "source");
    if (src && t.endsWith(" - " + src)) t = t.slice(0, -(src.length + 3));
    return { title: t, url: tag(it, "link"), src, ts: Date.parse(tag(it, "pubDate")) };
  }).filter((x) => x.title && x.ts);
}
async function events(prev, cutMs) {
  const out = [], now = Date.now();
  // scheduled US releases and Fed events that have happened (Forex Factory calendar)
  try {
    const cal = JSON.parse(readFileSync("data/macro-cal.json", "utf8"));
    for (const e of cal.events || []) {
      if (e.c !== "USD" || !/High|Medium/.test(e.imp || "") || !e.ts || e.ts * 1000 > now) continue;
      out.push({ ts: e.ts * 1000, k: "cal", t: e.t, imp: e.imp, a: e.act || "", f: e.fc || "", p: e.pv || "", fed: FEDRX.test(e.t) || /Powell|FOMC|Fed /.test(e.t) });
    }
  } catch (e) { log("calendar events:", e.message); }
  // headlines already fetched for the Macro page
  try {
    const n = JSON.parse(readFileSync("data/macro-news.json", "utf8"));
    for (const x of n.items || []) if (["FED", "ECON", "RATES"].includes(x.t) && RELEVANT.test(x.title))
      out.push({ ts: x.ts, k: "news", t: x.title, u: x.url, s: x.src, fed: FEDRX.test(x.title) });
  } catch (e) { log("macro news events:", e.message); }
  // a longer Fed search so the chart has headlines for its whole window
  for (const q of ['("Federal Reserve" OR FOMC OR "Fed officials" OR "Fed chair" OR "rate hike" OR "fed funds futures") when:45d',
                   '(CPI OR inflation OR "jobs report" OR payrolls OR "retail sales" OR PCE) "rate hike" OR Fed when:45d']) {
    try {
      const got = await googleNews(q); let k = 0;
      for (const x of got) if (RELEVANT.test(x.title)) { out.push({ ts: x.ts, k: "news", t: x.title, u: x.url, s: x.src, fed: FEDRX.test(x.title) }); k++; }
      log(`google news: ${k}/${got.length} kept`);
    } catch (e) { log("google news failed:", e.message); }
  }
  // merge with earlier runs, newest copy wins, one per headline per day
  const seen = new Set(), all = [];
  for (const e of [...out, ...(prev.events || [])].sort((a, b) => b.ts - a.ts)) {
    if (!(e.ts >= cutMs) || e.ts > now + 36e5) continue;
    const k = e.k + "|" + nyDate(e.ts) + "|" + ekey(e.t);
    if (seen.has(k)) continue; seen.add(k); all.push(e);
  }
  return all.slice(0, 900);
}

async function main() {
  const prev = await previous();
  const today = nyDate(Date.now());
  // contracts from ~6 weeks ago through the month after the last listed meeting
  const months = [];
  for (let m = addMonth(ym(today), -2); m <= addMonth(ym(FOMC.at(-1)), 1); m = addMonth(m)) months.push(m);
  const px = {}; let latest = 0, ok = 0;
  for (const m of months) {
    try { const y = await yahooDaily(zq(m)); px[m] = y.bars; if (Object.keys(y.bars).length) ok++; if (y.time > latest) latest = y.time; }
    catch (e) { log(zq(m), "failed:", e.message); }
  }
  log(`contracts with data: ${ok}/${months.length}`);
  const rows = await policy();
  const dates = [...new Set(Object.values(px).flatMap((b) => Object.keys(b)))].sort().filter((d) => d >= nyDate(Date.now() - 45 * 864e5));
  const snaps = [];
  for (const d of dates) {
    const prices = {};
    for (const m of months) { const b = px[m] || {}; if (b[d] != null) prices[m] = b[d]; }
    const { effr, lower } = policyOn(d, rows);
    const s = snapshot(d, prices, effr, lower);
    if (s.meetings.length >= 2) snaps.push(s);
  }
  // keep earlier snapshots from the previous file that this run could not rebuild, and never let a
  // partial fetch (some contracts throttled) replace a day that had the full curve
  const cut = nyDate(Date.now() - 45 * 864e5), byD = new Map(snaps.map((s) => [s.d, s]));
  let keptPrev = 0;
  for (const s of prev.snapshots || []) {
    if (s.d < cut) continue;
    const n = byD.get(s.d);
    if (!n || n.meetings.length < s.meetings.length) { byD.set(s.d, s); keptPrev++; }
  }
  const all = [...byD.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
  if (!all.length) { log("no snapshots and no previous file; nothing to write"); return; }
  const fresh = ok > 0 && snaps.length > 0;
  if (!fresh) log("no fresh futures data; republishing the previous snapshots");
  const ev = await events(prev, Date.parse(all[0].d + "T00:00:00Z") - 3 * 864e5);
  const now = all.at(-1);
  mkdirSync("data", { recursive: true });
  writeFileSync("data/fedwatch.json", JSON.stringify({ updated: fresh ? Math.floor(Date.now() / 1000) : prev.updated || Math.floor(Date.now() / 1000),
    checked: Math.floor(Date.now() / 1000), quoteTime: fresh ? latest || null : prev.quoteTime || null, stale: !fresh,
    source: "CBOT 30-day fed funds futures via Yahoo Finance; EFFR and target range from FRED / New York Fed", snapshots: all, events: ev }));
  log(`kept ${keptPrev} snapshots from the previous file; ${ev.length} events`);
  const nm = now.meetings[0];
  log(`snapshots: ${all.length}, latest ${now.d}; next ${nm?.d} implied ${nm?.rate} (${nm?.move}bp)`);
  summary(`- Fed funds: ${all.length} daily snapshots${fresh ? "" : " (STALE: no fresh futures)"}, latest ${now.d}; next meeting ${nm?.d} ${nm?.move >= 0 ? "+" : ""}${nm?.move}bp priced`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
