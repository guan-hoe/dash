// Government bond curves for the AI debt table on the Datacenter page: 2/5/10/30-year yields in every
// currency the AI bonds are issued in (US Treasuries, German Bunds for euro bonds, gilts, Swiss Confederation,
// Canadas, JGBs and Australian Commonwealth bonds), with ~60 trading days of daily closes so the page can show
// week-to-date and month-to-date changes.
// Source: CNBC quote service (Tradeweb) for live yields and CNBC daily bars for history.
// Anything that fails keeps the previous file's values for that tenor, so a deploy always has the last good data.
// Writes data/curves.json. Usage: node scripts/fetch-curves.mjs
import { writeFileSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const log = (...a) => console.log(...a);
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };
const num = (s) => (s == null ? NaN : parseFloat(String(s).replace(/[$,%+\s]/g, "")));
const nyDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split("?")[0]}`);
  return r.json();
}

// currency -> CNBC symbol prefix and suffix
const CUR = { USD: ["US", ""], EUR: ["DE", "-DE"], GBP: ["GB", "-GB"], CHF: ["CH", "-CH"], CAD: ["CA", "-CA"], JPY: ["JP", "-JP"], AUD: ["AU", "-AU"] };
const TENORS = [2, 5, 10, 30];
const sym = (cur, y) => `${CUR[cur][0]}${y}Y${CUR[cur][1]}`;

let prev = { cur: {} };
try { prev = JSON.parse(readFileSync("data/curves.json", "utf8")); } catch {}

async function quotes(list) {
  const out = {};
  for (let i = 0; i < list.length; i += 14) {
    const part = list.slice(i, i + 14);
    try {
      const j = await get(`https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(part.join("|"))}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`);
      for (const q of j?.FormattedQuoteResult?.FormattedQuote || []) {
        const v = num(q.last); if (!isFinite(v)) continue;
        const t = Date.parse(q.last_time);
        out[q.symbol] = { v, t: isFinite(t) ? Math.floor(t / 1000) : Math.floor(Date.now() / 1000) };
      }
    } catch (e) { log("quotes failed:", e.message); }
  }
  return out;
}
async function bars(s) {
  const j = await get(`https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol=${encodeURIComponent(s)}`);
  const d = [];
  for (const b of j?.barData?.priceBars || []) {
    const cl = num(b.close); if (!isFinite(cl)) continue;
    const t = String(b.tradeTime || ""), day = t.length >= 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : nyDate(b.tradeTimeinMills);
    if (d.length && d.at(-1)[0] === day) d.at(-1)[1] = cl; else d.push([day, cl]);
  }
  if (d.length < 20) throw new Error(`only ${d.length} bars`);
  return d; // full year: the page also needs the yield on each bond's pricing date
}

const all = Object.keys(CUR).flatMap((c) => TENORS.map((y) => sym(c, y)));
const live = await quotes(all);
log("live:", Object.keys(live).length, "of", all.length);
const out = { updated: Math.floor(Date.now() / 1000), src: "CNBC (Tradeweb) live yields and daily closes", cur: {} };
let ok = 0, kept = 0;
for (const c of Object.keys(CUR)) {
  out.cur[c] = {};
  for (const y of TENORS) {
    const s = sym(c, y), old = prev.cur?.[c]?.[y];
    let h = null;
    try { h = await bars(s); } catch (e) { log(s, "bars failed:", e.message); }
    const q = live[s];
    if (!h && !q) { if (old) { out.cur[c][y] = old; kept++; } continue; }
    const hist = h || old?.d || [];
    const now = q ? q.v : hist.at(-1)?.[1];
    if (now == null) continue;
    out.cur[c][y] = { now: +now.toFixed(3), t: q ? q.t : Math.floor(Date.parse(hist.at(-1)[0] + "T21:00:00Z") / 1000), d: hist.map(([dd, v]) => [dd, +v.toFixed(3)]) };
    ok++;
  }
  const row = TENORS.map((y) => out.cur[c][y] ? `${y}Y ${out.cur[c][y].now}` : `${y}Y –`).join(" · ");
  log(c, row); summary(`- ${c}: ${row}`);
}
log(`curves: ${ok} fetched, ${kept} kept from previous file`);
mkdirSync("data", { recursive: true });
writeFileSync("data/curves.json", JSON.stringify(out));
