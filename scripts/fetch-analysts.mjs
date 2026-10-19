// Analyst ratings and price targets for every stock page, from Yahoo Finance
// (upgradeDowngradeHistory, recommendationTrend, financialData).
//
//   node scripts/fetch-analysts.mjs [dir ...]
//
// Writes <dir>/analysts.json with
//   actions    every rating or target action in the last 12 months, newest first:
//              [date, firm, rating now, rating before, action, target now, target before, target action]
//              action: up / down / init / main (maintains rating) / reit (reiterates)
//   consensus  mean / median / high / low target, number of analysts, mean rating (1 = strong buy, 5 = sell)
//   trend      rating counts now and 1, 2, 3 months ago
// Run by .github/workflows/analysts.yml, which commits the files. A failed stock keeps its old file.
import { writeFileSync, appendFileSync } from "node:fs";

const STOCKS = [
  ["arm", "ARM"], ["tesla", "TSLA"], ["sndk", "SNDK"], ["intc", "INTC"], ["spcx", "SPCX"], ["mu", "MU"],
  ["lite", "LITE"], ["cohr", "COHR"], ["googl", "GOOGL"], ["meta", "META"], ["nvda", "NVDA"], ["zs", "ZS"],
  ["be", "BE"], ["aaoi", "AAOI"], ["amd", "AMD"], ["mp", "MP"], ["amzn", "AMZN"], ["msft", "MSFT"],
  ["mrvl", "MRVL"], ["skhy", "SKHY"], ["tsm", "TSM"], ["avgo", "AVGO"], ["rok", "ROK"],
  ["amat", "AMAT"], ["asml", "ASML"], ["pltr", "PLTR"], ["glw", "GLW"], ["ter", "TER"],
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const DAYS = 366;
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };
const raw = (x) => (x && typeof x === "object" ? x.raw : x) ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session() {
  const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(15000) });
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  const crumb = await (await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie }, signal: AbortSignal.timeout(15000) })).text();
  if (!cookie || !crumb || crumb.includes("<")) throw new Error("no Yahoo session");
  return { cookie, crumb };
}

async function fetchOne(S, tick) {
  const u = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(tick)}?modules=upgradeDowngradeHistory,recommendationTrend,financialData&crumb=${encodeURIComponent(S.crumb)}`;
  let err;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA, Cookie: S.cookie }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const res = j.quoteSummary?.result?.[0];
      if (!res) throw new Error(j.quoteSummary?.error?.description || "no result");
      return res;
    } catch (e) { err = e; await sleep(1500 * (i + 1)); }
  }
  throw err;
}

const tidyFirm = (f) => String(f || "").replace(/\s+/g, " ").trim();
const tidyGrade = (g) => String(g || "").replace(/\s+/g, " ").trim();

function build(tick, res) {
  const cut = Date.now() / 1000 - DAYS * 86400;
  const all = res.upgradeDowngradeHistory?.history || [];
  const newest = all.reduce((m, h) => Math.max(m, h.epochGradeDate || 0), 0);
  const hist = all.filter((h) => h.epochGradeDate >= cut);
  const seen = new Set();
  const actions = [];
  for (const h of hist.sort((a, b) => b.epochGradeDate - a.epochGradeDate)) {
    const date = new Date(h.epochGradeDate * 1000).toISOString().slice(0, 10);
    const firm = tidyFirm(h.firm);
    const key = date + firm + h.toGrade + h.currentPriceTarget;
    if (seen.has(key)) continue; // Yahoo sometimes lists the same note twice
    seen.add(key);
    actions.push([date, firm, tidyGrade(h.toGrade), tidyGrade(h.fromGrade), h.action || "", h.currentPriceTarget || null, h.priorPriceTarget || null, h.priceTargetAction || ""]);
  }
  const f = res.financialData || {};
  const trend = (res.recommendationTrend?.trend || []).map((t) => [t.period, t.strongBuy, t.buy, t.hold, t.sell, t.strongSell]);
  return {
    symbol: tick, updated: new Date().toISOString(), source: "Yahoo Finance",
    consensus: {
      mean: raw(f.targetMeanPrice), median: raw(f.targetMedianPrice), high: raw(f.targetHighPrice), low: raw(f.targetLowPrice),
      n: raw(f.numberOfAnalystOpinions), rating: raw(f.recommendationMean), key: f.recommendationKey || null, price: raw(f.currentPrice),
    },
    trend, // [period, strong buy, buy, hold, sell, strong sell]
    // date of the newest firm-level action Yahoo has; set when that feed has gone quiet for 4 months
    feed_last: newest && newest < Date.now() / 1000 - 120 * 86400 ? new Date(newest * 1000).toISOString().slice(0, 10) : null,
    actions,
  };
}

const pick = process.argv.slice(2);
const list = STOCKS.filter(([d, t]) => !pick.length || pick.includes(d) || pick.includes(t));
let S;
try { S = await session(); } catch (e) { console.log("Yahoo session failed:", e.message); process.exit(0); }
summary("### Analysts");
const brief = [];
for (const [dir, tick] of list) {
  try {
    const out = build(tick, await fetchOne(S, tick));
    writeFileSync(`${dir}/analysts.json`, JSON.stringify(out) + "\n");
    const msg = `${out.actions.length} actions, ${out.consensus.n ?? 0} analysts`;
    console.log(`${tick}: ${msg}`); summary(`- ${tick}: ${msg}`); brief.push(`${tick} ${out.actions.length}/${out.consensus.n ?? 0}`);
  } catch (e) {
    console.log(`${tick}: skipped (${e.message})`); summary(`- ${tick}: skipped (${e.message})`); brief.push(`${tick} skipped`);
  }
  await sleep(400);
}
if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Analysts::${brief.join(" · ")}`);
