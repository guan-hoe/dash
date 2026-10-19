// USD/IDR forward curve for the FX tab: indicative outright forwards from 1 week to 2 years.
// Offshore rupiah forwards are non-deliverable (NDF), so this is the curve the NDF market trades on.
// Writes data/fx-fwd.json: the latest curve plus one end-of-day snapshot per FX day (kept ~400 days),
// which the page uses for the "vs 1W / 1M ago" overlays and the history chart.
// Sources
//   1. FXEmpire forward-rates page (outright bid / ask / mid and points per tenor).
//   2. Investing.com forward-rates page (bid / ask points), converted to outrights with the spot in data/fx.json.
// Anything that fails keeps the previous file, so a deploy always goes out with the last good curve.
// Usage: node scripts/fetch-fwd.mjs   [FWD_CLOSE=1 after the New York close] (run after scripts/fetch-fx.mjs, which supplies the spot)
import { writeFileSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const log = (...a) => console.log(...a);
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };
const num = (s) => parseFloat(String(s).replace(/,/g, ""));
const OUT = "data/fx-fwd.json";

// k = label on the page, days = approximate tenor length used for the annualised carry
const TENORS = [
  { t: "1W", days: 7, fxe: "One Week", inv: "1W" },
  { t: "2W", days: 14, fxe: "Two Weeks", inv: "2W" },
  { t: "3W", days: 21, fxe: "Three Weeks", inv: "3W" },
  { t: "1M", days: 30, fxe: "One Month", inv: "1M" },
  { t: "2M", days: 61, fxe: "Two Months", inv: "2M" },
  { t: "3M", days: 91, fxe: "Three Months", inv: "3M" },
  { t: "4M", days: 122, fxe: "Four Months", inv: "4M" },
  { t: "5M", days: 152, fxe: "Five Months", inv: "5M" },
  { t: "6M", days: 182, fxe: "Six Months", inv: "6M" },
  { t: "9M", days: 273, fxe: "Nine Months", inv: "9M" },
  { t: "1Y", days: 365, fxe: "One Year", inv: "1Y" },
  { t: "2Y", days: 730, fxe: "Two Years", inv: "2Y" },
];

async function page(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Accept: "text/html" }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  // tags to spaces, so cell values become whitespace-separated tokens whatever the markup is
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}
const N = "(-?[\\d,]+(?:\\.\\d+)?)";

let spot = null;
try { spot = JSON.parse(readFileSync("data/fx.json", "utf8")).items.find((x) => x.k === "usdidr")?.price ?? null; } catch {}

async function fxempire() {
  const txt = await page("https://www.fxempire.com/currencies/usd-idr/forward-rates");
  const rows = [];
  for (const T of TENORS) {
    const m = txt.match(new RegExp(`${T.fxe}\\s+${N}\\s+${N}\\s+${N}\\s+${N}`));
    if (!m) continue;
    const [bid, ask, mid, pts] = m.slice(1, 5).map(num);
    if (!(bid > 1000 && ask >= bid && mid >= bid && mid <= ask)) continue;
    rows.push({ t: T.t, days: T.days, bid, ask, mid, pts });
  }
  if (rows.length < 6) throw new Error(`only ${rows.length} tenors parsed`);
  const asof = txt.match(/As of:?\s*([0-9]{1,2}:[0-9]{2}\s+[A-Z][a-z]{2}\s+[0-9]{1,2},\s+[0-9]{4}),?\s*UTC/);
  let time = asof ? Date.parse(asof[1].replace(/^(\S+)\s+(.*)$/, "$2 $1") + " UTC") : NaN;
  if (!isFinite(time)) time = Date.now();
  // spot implied by the curve (mid minus points); used when it differs from data/fx.json's timing
  const s = rows.map((r) => r.mid - r.pts).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  return { rows, time: Math.floor(time / 1000), spot: +s.toFixed(1), src: "FXEmpire" };
}

async function investing() {
  if (!spot) throw new Error("no spot in data/fx.json to convert points");
  const txt = await page("https://www.investing.com/currencies/usd-idr-forward-rates");
  const rows = [];
  for (const T of TENORS) {
    const m = txt.match(new RegExp(`USDIDR ${T.inv} FWD\\s+${N}\\s+${N}`));
    if (!m) continue;
    const pb = num(m[1]), pa = num(m[2]);
    if (!isFinite(pb) || !isFinite(pa) || pa < pb) continue;
    const pts = (pb + pa) / 2;
    rows.push({ t: T.t, days: T.days, bid: +(spot + pb).toFixed(1), ask: +(spot + pa).toFixed(1), mid: +(spot + pts).toFixed(1), pts: +pts.toFixed(2) });
  }
  if (rows.length < 5) throw new Error(`only ${rows.length} tenors parsed`);
  return { rows, time: Math.floor(Date.now() / 1000), spot, src: "Investing.com (points on CNBC spot)" };
}

// FX day: a quote after 5pm New York belongs to the next weekday
function fxDay(ms) {
  const p = {}; new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).forEach((q) => { p[q.type] = q.value; });
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  if (+p.hour >= 17) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

let prev = null;
try { prev = JSON.parse(readFileSync(OUT, "utf8")); } catch {}

let got = null;
for (const [name, fn] of [["FXEmpire", fxempire], ["Investing.com", investing]]) {
  try { got = await fn(); log(name, "ok:", got.rows.map((r) => `${r.t} ${r.mid}`).join(", ")); break; }
  catch (e) { log(name, "failed:", e.message); summary(`- USD/IDR forwards: ${name} failed (${e.message})`); }
}
if (!got) { log("forwards: no source worked; kept previous file"); process.exit(0); }

for (const r of got.rows) r.carry = +((r.pts / got.spot) * (365 / r.days) * 100).toFixed(2); // % a year, ≈ IDR minus USD rates

// Live runs (deploy) file the curve under the FX day now trading. The after-close run in ta-data.yml sets
// FWD_CLOSE=1 so the curve is saved as the close of the day that just ended; that is the copy committed to the repo.
let day = fxDay(Date.now());
if (process.env.FWD_CLOSE) { const d = new Date(day + "T00:00:00Z"); do d.setUTCDate(d.getUTCDate() - 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6); day = d.toISOString().slice(0, 10); }
const hist = (prev?.hist || []).filter((h) => h.d !== day);
hist.push({ d: day, spot: got.spot, m: Object.fromEntries(got.rows.map((r) => [r.t, r.mid])) });
hist.sort((a, b) => (a.d < b.d ? -1 : 1));
const out = { updated: Math.floor(Date.now() / 1000), time: got.time, src: got.src, spot: got.spot, rows: got.rows, hist: hist.slice(-400) };
mkdirSync("data", { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
const one = got.rows.find((r) => r.t === "1M");
summary(`- USD/IDR forwards (${got.src}): spot ${got.spot}${one ? `, 1M ${one.mid} (${one.pts} pts, ${one.carry}% a year)` : ""} · ${hist.length} daily snapshots`);
