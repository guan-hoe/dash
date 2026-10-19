// Fetches the last 30 days of news headlines for every stock on the site and writes data/news.json.
// Sources: Google News RSS search (up to ~100 items per query) and Yahoo Finance headline RSS.
// Usage: node scripts/fetch-news.mjs
// If a source fails for a stock, that stock keeps its previous headlines (still trimmed to 30 days),
// so a deploy always goes out with the last good list. Exits 0.
import { writeFileSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";

const STOCKS = [
  // m = a headline must match this to be kept (drops loosely related items from ticker feeds)
  { t: "ARM",  q: '"Arm Holdings" OR "Arm stock" OR "NASDAQ:ARM"', m: /\bArm\b|\bARM\b|Neoverse|SoftBank/ },
  { t: "TSLA", q: 'Tesla (stock OR shares OR TSLA OR Musk OR earnings OR deliveries)', m: /Tesla|TSLA|Cybercab|robotaxi|Optimus|Megapack|\bFSD\b/i },
  { t: "SNDK", q: 'Sandisk OR "NASDAQ:SNDK"', m: /Sandisk|SNDK/i },
  { t: "INTC", q: 'Intel (stock OR shares OR INTC OR foundry OR earnings OR chip)', m: /Intel\b|INTC|Lip-Bu Tan|\b18A\b|\b14A\b/i },
  { t: "SPCX", q: 'SpaceX (stock OR shares OR SPCX OR Starlink OR earnings OR Starship)', m: /SpaceX|SPCX|Starlink|Starship/i },
  { t: "MU",   q: 'Micron (stock OR shares OR MU OR memory OR HBM OR earnings)', m: /Micron|\bMU\b/ },
  { t: "LITE", q: 'Lumentum OR "NASDAQ:LITE"', m: /Lumentum|\bLITE\b/ },
  { t: "COHR", q: '"Coherent Corp" OR "Coherent stock" OR "Coherent shares" OR "NYSE:COHR" OR (Coherent earnings)', m: /Coherent|COHR/ },
  { t: "GOOGL", q: '(Alphabet OR Google) (stock OR shares OR GOOGL OR earnings OR Cloud OR Gemini OR antitrust)', m: /Alphabet|Google|GOOGL?\b|Gemini|YouTube|Waymo/ },
  { t: "META", q: '"Meta Platforms" OR (Meta (stock OR shares OR Zuckerberg OR earnings OR Llama))', m: /\bMeta\b|\bMETA\b|Zuckerberg|Instagram|WhatsApp|Facebook/ },
  { t: "NVDA", q: 'Nvidia (stock OR shares OR NVDA OR earnings OR Blackwell OR Rubin)', m: /Nvidia|NVDA|Jensen Huang|Blackwell|Vera Rubin/i },
  { t: "ZS", q: 'Zscaler OR "NASDAQ:ZS"', m: /Zscaler|\bZS\b/ },
  { t: "BE", q: '"Bloom Energy"', m: /Bloom Energy|NYSE:BE/i },
  { t: "AAOI", q: '"Applied Optoelectronics" OR AAOI', m: /Applied Optoelectronics|AAOI/i },
  { t: "AMD", q: 'AMD (stock OR shares OR earnings OR Instinct OR EPYC OR "Lisa Su")', m: /\bAMD\b|Advanced Micro|Lisa Su|Instinct|EPYC/ },
  { t: "MP", q: '"MP Materials" OR "Mountain Pass" rare earth', m: /MP Materials|Mountain Pass/i },
  { t: "AMZN", q: 'Amazon (stock OR shares OR AMZN OR earnings OR AWS OR Jassy)', m: /Amazon|AMZN|\bAWS\b|Jassy/ },
  { t: "MSFT", q: 'Microsoft (stock OR shares OR MSFT OR earnings OR Azure OR Copilot)', m: /Microsoft|MSFT|Azure|Nadella|Copilot/ },
  { t: "MRVL", q: 'Marvell (stock OR shares OR MRVL OR earnings OR "custom silicon" OR optics)', m: /Marvell|MRVL/ },
  { t: "SKHY", q: '"SK hynix" OR "SK Hynix" OR SKHY', m: /SK ?hynix|SKHY|000660/i },
  { t: "TSM", q: 'TSMC (stock OR shares OR TSM OR earnings OR revenue OR 2nm OR Arizona)', m: /TSMC|\bTSM\b|Taiwan Semiconductor|C\.C\. Wei/ },
  { t: "AVGO", q: 'Broadcom (stock OR shares OR AVGO OR earnings OR XPU OR VMware OR "Hock Tan")', m: /Broadcom|AVGO|Hock Tan|VMware/ },
  { t: "ROK", q: '"Rockwell Automation" OR "NYSE:ROK"', m: /Rockwell Automation|\bROK\b/ },
  { t: "AMAT", q: '"Applied Materials" OR "NASDAQ:AMAT"', m: /Applied Materials|\bAMAT\b/ },
  { t: "ASML", q: 'ASML (stock OR shares OR earnings OR EUV OR lithography OR Fouquet)', m: /\bASML\b|Fouquet|EUV/ },
  { t: "PLTR", q: 'Palantir (stock OR shares OR PLTR OR earnings OR AIP OR Karp)', m: /Palantir|PLTR|Alex Karp/ },
  { t: "GLW", q: '"Corning Inc" OR "Corning Incorporated" OR "NYSE:GLW" OR (Corning fiber)', m: /Corning|\bGLW\b/ },
  { t: "TER", q: 'Teradyne OR "NASDAQ:TER" OR "Universal Robots"', m: /Teradyne|\bTER\b|Universal Robots/ },
];
// `node scripts/fetch-news.mjs macro` builds data/macro-news.json for the Macro page instead.
const MACRO = [
  { t: "OIL", q: '("oil prices" OR "crude oil" OR OPEC OR Brent OR WTI)', y: "CL=F", m: /\boil\b|crude|OPEC|Brent|WTI|petroleum|barrel/i },
  { t: "GOLD", q: '("gold price" OR "gold prices" OR "gold futures" OR bullion)', y: "GC=F", m: /\bgold\b|bullion/i },
  { t: "SILVER", q: '("silver price" OR "silver prices" OR "silver futures")', y: "SI=F", m: /\bsilver\b/i },
  { t: "RATES", q: '("Treasury yields" OR "bond yields" OR "10-year yield" OR "2-year yield" OR "Treasury auction" OR "bond market")', y: "^TNX", m: /yield|Treasur|\bbonds?\b|auction/i },
  { t: "FED", q: '("Federal Reserve" OR FOMC OR "Fed chair" OR "rate cut" OR "rate hike" OR "Fed officials")', y: "", m: /\bFed\b|Federal Reserve|FOMC|rate (cut|hike)|interest rates?/i },
  { t: "ECON", q: '(CPI OR inflation OR "jobs report" OR payrolls OR GDP OR "retail sales" OR PMI OR "jobless claims") US economy', y: "", m: /inflation|\bCPI\b|\bPCE\b|\bPPI\b|jobs|payroll|unemployment|jobless|\bGDP\b|retail sales|\bPMI\b|economy|recession|consumer/i },
];
// `node scripts/fetch-news.mjs fx` builds data/fx-news.json for the FX page.
const FX = [
  { t: "USD", q: '("US dollar" OR "dollar index" OR DXY OR greenback) (forex OR currency OR currencies OR traders)', y: "DX-Y.NYB", m: /dollar|\bDXY\b|greenback|\bUSD\b|forex|currenc/i },
  { t: "EUR", q: '(euro OR EUR/USD OR "EUR/JPY" OR ECB OR Lagarde) (currency OR forex OR dollar OR yen)', y: "EURUSD=X", m: /\beuro\b|EUR\/|\bECB\b|Lagarde/i },
  { t: "GBP", q: '(sterling OR "British pound" OR "GBP/USD" OR "Bank of England") (currency OR forex OR dollar)', y: "GBPUSD=X", m: /sterling|\bpound\b|GBP|Bank of England|\bBoE\b/i },
  { t: "JPY", q: '(yen OR "USD/JPY" OR "Bank of Japan" OR BOJ OR intervention) (currency OR forex OR dollar)', y: "JPY=X", m: /\byen\b|JPY|Bank of Japan|\bBOJ\b/i },
  { t: "CNY", q: '(yuan OR renminbi OR "offshore yuan" OR CNH OR PBOC OR "yuan fixing") (currency OR forex OR dollar)', y: "CNH=X", m: /yuan|renminbi|\bCNH\b|\bCNY\b|PBOC|People's Bank/i },
  { t: "ASIA", q: '("Singapore dollar" OR MAS OR "Korean won" OR "Indonesian rupiah" OR "Indian rupee" OR "Hong Kong dollar" OR "Asian currencies")', y: "SGD=X", m: /Singapore dollar|\bMAS\b|\bwon\b|rupiah|rupee|Hong Kong dollar|HKMA|Asian currenc|\bSGD\b|\bKRW\b|\bINR\b|\bIDR\b|\bHKD\b|Bank Indonesia|Reserve Bank of India|\bRBI\b/i },
  { t: "AUD", q: '("Australian dollar" OR Aussie OR "AUD/USD" OR RBA) (currency OR forex OR dollar)', y: "AUDUSD=X", m: /Australian dollar|Aussie|\bRBA\b|\bAUD\b/i },
  { t: "CAD", q: '("Canadian dollar" OR loonie OR "USD/CAD" OR "Bank of Canada") (currency OR forex OR dollar)', y: "CAD=X", m: /Canadian dollar|loonie|Bank of Canada|\bCAD\b/i },
  { t: "CHF", q: '("Swiss franc" OR "USD/CHF" OR SNB OR "Swiss National Bank") (currency OR forex OR dollar)', y: "CHF=X", m: /Swiss franc|\bfranc\b|\bSNB\b|Swiss National Bank|\bCHF\b/i },
];
const MODE = ["macro", "fx"].includes(process.argv[2]) ? process.argv[2] : "stocks";
if (MODE === "macro") { STOCKS.length = 0; STOCKS.push(...MACRO); }
if (MODE === "fx") { STOCKS.length = 0; STOCKS.push(...FX); }
const OUT = MODE === "macro" ? "data/macro-news.json" : MODE === "fx" ? "data/fx-news.json" : "data/news.json";
const DAYS = MODE === "stocks" ? 30 : 14, PER_STOCK = MODE === "stocks" ? 80 : 60;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const cutoff = Date.now() - DAYS * 864e5;
const summary = (s) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + "\n"); };

const decode = (s = "") => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ""; };

function parseRss(xml, fallbackSrc) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    let title = tag(it, "title"), src = tag(it, "source") || fallbackSrc;
    if (src && title.endsWith(" - " + src)) title = title.slice(0, -(src.length + 3));
    const ts = Date.parse(tag(it, "pubDate"));
    return { title, url: tag(it, "link"), src, ts };
  }).filter((x) => x.title && x.url && x.ts && x.ts >= cutoff && x.ts <= Date.now() + 36e5);
}

async function rss(url, src) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,text/xml" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseRss(await r.text(), src);
}

const key = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

let prev = { items: [] };
try { prev = JSON.parse(readFileSync(OUT, "utf8")); } catch {}

const all = [];
for (const s of STOCKS) {
  const got = [];
  const tries = [
    ["google", `https://news.google.com/rss/search?q=${encodeURIComponent(s.q + ` when:${DAYS}d`)}&hl=en-US&gl=US&ceid=US:en`, ""],
    ["yahoo", `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(s.y ?? s.t)}&region=US&lang=en-US`, "Yahoo Finance"],
  ].filter(([n]) => n !== "yahoo" || (s.y ?? s.t));
  for (const [name, url, src] of tries) {
    try { const items = await rss(url, src); got.push(...items); console.log(`${s.t} ${name}: ${items.length}`); }
    catch (e) { console.log(`${s.t} ${name} failed: ${e.message}`); }
  }
  let items = got.filter((x) => s.m.test(x.title));
  if (!items.length) {
    items = (prev.items || []).filter((x) => x.t === s.t && x.ts >= cutoff);
    console.log(`${s.t}: no fresh items, kept ${items.length} previous`);
  }
  const seen = new Set(), uniq = [];
  for (const x of items.sort((a, b) => b.ts - a.ts)) {
    const k = key(x.title); if (seen.has(k)) continue; seen.add(k);
    uniq.push({ t: s.t, title: x.title, url: x.url, src: x.src, ts: x.ts });
    if (uniq.length >= PER_STOCK) break;
  }
  all.push(...uniq);
  summary(`- ${s.t}: ${uniq.length} headlines`);
}

all.sort((a, b) => b.ts - a.ts);
mkdirSync("data", { recursive: true });
writeFileSync(OUT, JSON.stringify({ updated: Math.floor(Date.now() / 1000), days: DAYS, items: all }));
console.log(`wrote ${all.length} headlines to ${OUT}`);
