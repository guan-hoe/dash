/* AI debt section on the Datacenter page (#aidebt): bonds sold to fund AI data centers by the hyperscalers,
   SpaceX (xAI), CoreWeave, SoftBank (OpenAI) and the project companies behind hyperscaler leases.
   - Summary cells, a by-borrower table, a maturity wall (stacked by borrower or by type) and a table of every bond.
   - Everything is interactive: click a borrower or a maturity bar to filter the bond table; sort any column;
     filter by borrower, type, currency, maturity and text; switch between one row per bond and one row per deal;
     download the filtered rows as CSV.
   - Each bond shows an estimated yield to maturity, its week- and month-to-date change and the borrower's 5-year CDS:
     live government yield for the bond's currency and maturity (data/curves.json, refreshed on every deploy by
     scripts/fetch-curves.mjs) plus the borrower's credit spread from dated dealer quotes in ai-debt.json "mkt".
   Data: data/ai-debt.json (edited by hand when a new deal prices). Non-USD amounts are converted at the live
   rates in data/fx.json (FX tab), falling back to the rates in ai-debt.json. */
(function () {
  const host = document.getElementById("aidebt");
  if (!host) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
  const NOW = new Date();
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const SYM = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF ", CAD: "C$", JPY: "¥", AUD: "A$" };
  const KIND = { ig: "Investment-grade", hy: "High yield", cv: "Convertible", spv: "Project SPV" };
  const KS = { ig: "IG", hy: "HY", cv: "Conv", spv: "SPV" };
  const TYPES = [{ v: "all", n: "All" }, { v: "ig", n: "Investment-grade" }, { v: "hyc", n: "High yield & convertible" }, { v: "spv", n: "Project SPVs" }];
  const RANGES = [{ v: "all", n: "Any maturity" }, { v: "-2030", n: "Due by 2030" }, { v: "2031-2035", n: "2031–2035" }, { v: "2036-2045", n: "2036–2045" }, { v: "2046-", n: "2046 and later" }];
  const BUCKETS = [];
  for (let y = 2028; y <= 2036; y++) BUCKETS.push({ id: String(y), n: String(y), a: y, b: y });
  [[2037, 2040], [2041, 2045], [2046, 2050], [2051, 2055], [2056, 2060], [2061, 2066], [2067, 2200]].forEach(([a, b]) =>
    BUCKETS.push({ id: a + "-" + b, n: b > 2100 ? "2067+" : `${a}–${String(b).slice(2)}`, x: b > 2100 ? "2067<br>+" : `${a}<br>–${String(b).slice(2)}`, a, b }));

  /* ---------- styles (palette: fixed categorical order, light and dark steps validated for stacked bars) ---------- */
  const st = document.createElement("style");
  st.textContent = `
  #aidebt{--g1:#2a78d6;--g2:#eb6834;--g3:#1baf7a;--g4:#eda100;--g5:#e87ba4;--g6:#008300;--g7:#6250d6;--g8:#e34948}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]) #aidebt{--g1:#3987e5;--g2:#d95926;--g3:#199e70;--g4:#c98500;--g5:#d55181;--g6:#008300;--g7:#9085e9;--g8:#e66767}}
  :root[data-theme="dark"] #aidebt{--g1:#3987e5;--g2:#d95926;--g3:#199e70;--g4:#c98500;--g5:#d55181;--g6:#008300;--g7:#9085e9;--g8:#e66767}
  #aidebt .ad-cells{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin:0 0 16px}
  #aidebt .ad-cells .tile .v{font-size:21px}
  #aidebt .ad-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:16px;align-items:start;margin-bottom:16px}
  @media (max-width:900px){#aidebt .ad-two{grid-template-columns:minmax(0,1fr)}}
  #aidebt h3{font:600 11px var(--f-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
  #aidebt .sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:7px;vertical-align:-1px;flex:none}
  #aidebt .ad-tab{width:100%;border-collapse:collapse;font-size:13px}
  #aidebt .ad-tab th{font:600 10px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);text-align:right;padding:6px;border-bottom:1px solid var(--line);white-space:nowrap}
  #aidebt .ad-tab th:first-child,#aidebt .ad-tab td:first-child{text-align:left}
  #aidebt .ad-tab th button{all:unset;cursor:pointer;display:inline-flex;gap:4px;align-items:center}
  #aidebt .ad-tab th button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  #aidebt .ad-tab th[aria-sort] button{color:var(--ink)}
  #aidebt .ad-tab td{text-align:right;padding:6px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent);font:500 12.5px var(--f-mono);font-variant-numeric:tabular-nums;white-space:nowrap;vertical-align:top}
  #aidebt .ad-tab td:first-child{font:600 13px var(--f-body);white-space:normal;min-width:130px}
  #aidebt .ad-tab td small{display:block;font:400 11.5px var(--f-body);color:var(--muted);white-space:normal}
  #aidebt .ad-tab td.l{text-align:left}
  #aidebt .ad-tab tbody tr.adck{cursor:pointer}
  #aidebt .ad-tab tbody tr.adck:hover,#aidebt .ad-tab tbody tr.adck:focus-visible{background:color-mix(in srgb,var(--accent-soft) 70%,transparent);outline:none}
  #aidebt .ad-tab tbody tr.adck:focus-visible{box-shadow:inset 0 0 0 2px var(--accent)}
  #aidebt .ad-tab tbody tr.on{background:var(--accent-soft)}
  #aidebt .ad-tab tfoot td{font-weight:600;border-top:1px solid var(--line);border-bottom:0}
  #aidebt .shr{display:block;height:3px;border-radius:2px;margin-top:3px;background:var(--accent);opacity:.55}
  #aidebt .tag{display:inline-block;font:600 9.5px var(--f-mono);letter-spacing:.05em;text-transform:uppercase;border:1px solid var(--line);color:var(--muted);border-radius:3px;padding:1px 4px}
  #aidebt .tag.hy,#aidebt .tag.cv{border-color:var(--down);color:var(--down)}
  #aidebt .tag.spv{background:var(--accent-soft);border-color:transparent;color:var(--ink)}
  /* maturity wall */
  #aidebt .mw{position:relative;height:260px;display:grid;grid-template-columns:44px minmax(0,1fr);gap:0 6px}
  #aidebt .mw-y{position:relative;font:500 10.5px var(--f-mono);color:var(--muted)}
  #aidebt .mw-y span{position:absolute;right:0;transform:translateY(50%)}
  #aidebt .mw-p{position:relative;border-bottom:1px solid var(--line)}
  #aidebt .mw-g{position:absolute;left:0;right:0;border-top:1px dashed color-mix(in srgb,var(--line) 80%,transparent)}
  #aidebt .mw-cols{position:absolute;inset:0;display:flex;align-items:flex-end;gap:4px}
  #aidebt .mw-c{flex:1;min-width:0;height:100%;display:flex;flex-direction:column-reverse;gap:2px;cursor:pointer;border-radius:4px 4px 0 0;outline:none;padding-top:2px}
  #aidebt .mw-c:focus-visible{box-shadow:0 0 0 2px var(--accent)}
  #aidebt .mw-c i{display:block;width:100%;flex:none;transition:height .35s cubic-bezier(.2,.7,.2,1)}
  #aidebt .mw-c i:last-child{border-radius:4px 4px 0 0}
  #aidebt .mw-c:hover i,#aidebt .mw-c.on i{filter:brightness(1.08)}
  #aidebt .mw-cols.sel .mw-c:not(.on) i{opacity:.35}
  #aidebt .mw-x{display:flex;gap:4px;margin-left:50px;font:500 10px var(--f-mono);color:var(--muted);padding-top:5px}
  #aidebt .mw-x span{flex:1;min-width:0;text-align:center;white-space:nowrap;line-height:1.25}#aidebt .mw-x b{font-weight:500}#aidebt .mw-x .ls{display:none}
  @media (max-width:620px){#aidebt .mw-x .lf{display:none}#aidebt .mw-x .ls{display:inline}#aidebt .mw-x span{font-size:9px;letter-spacing:-.02em}#aidebt .mw-cols,#aidebt .mw-x{gap:2px}#aidebt .mw{height:220px;grid-template-columns:38px minmax(0,1fr)}#aidebt .mw-x{margin-left:44px}}
  #aidebt .leg{margin:10px 0 0}
  #aidebt .leg button{all:unset;cursor:pointer;display:inline-flex;align-items:center;font:500 11px var(--f-mono);color:var(--muted);padding:2px 0}
  #aidebt .leg button[aria-pressed="false"]{opacity:.45;text-decoration:line-through}
  #aidebt .leg button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  /* filters */
  #aidebt .ad-f{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:0 0 12px;padding-bottom:12px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent)}
  #aidebt select,#aidebt input[type=search]{font:500 12px var(--f-mono);color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:5px 8px;min-width:0}
  #aidebt input[type=search]{width:190px;max-width:100%}
  #aidebt select:focus-visible,#aidebt input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  #aidebt .chipsrow{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 10px}
  #aidebt .chipsrow button{font:500 11.5px var(--f-mono);border:1px solid var(--line);background:var(--panel);color:var(--muted);padding:4px 9px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center}
  #aidebt .chipsrow button[aria-pressed="true"]{color:var(--ink);border-color:var(--ink)}
  #aidebt .chipsrow button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  #aidebt .ad-act{margin-left:auto;display:flex;gap:8px;align-items:center}
  #aidebt .btnl{font:500 12px var(--f-mono);border:1px solid var(--line);background:var(--panel);color:var(--ink);padding:5px 10px;border-radius:5px;cursor:pointer}
  #aidebt .btnl:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  #aidebt .ad-cnt{font:500 12px var(--f-mono);color:var(--muted);margin:0 0 8px}
  #aidebt .ad-wrap{overflow-x:auto;max-height:640px;overflow-y:auto}
  #aidebt .ad-wrap thead th{position:sticky;top:0;background:var(--panel);z-index:1}
  #aidebt .ad-wrap tfoot td{position:sticky;bottom:0;background:var(--panel)}
  #aidebt tr.dx td{background:color-mix(in srgb,var(--accent-soft) 40%,transparent);white-space:normal;text-align:left;font:400 12.5px/1.45 var(--f-body)}
  #aidebt tr.dx table{width:100%;border-collapse:collapse;margin:4px 0 8px}
  #aidebt tr.dx table td{border:0;padding:2px 10px 2px 0;background:none;font:500 12px var(--f-mono);text-align:left;white-space:nowrap}
  #aidebt .caret{display:inline-block;width:12px;color:var(--muted);transition:transform .15s}
  #aidebt tr.open .caret{transform:rotate(90deg)}
  #aidebt .xnote{font-size:12px;color:var(--muted);margin:8px 0 0}
  #aidebt .ad-tab td.up{color:var(--up)}#aidebt .ad-tab td.dn{color:var(--down)}
  #aidebt .ad-tab th[title]{cursor:help}
  #aidebt details.adm{margin:10px 0 0;font-size:12px;color:var(--muted)}
  #aidebt details.adm summary{cursor:pointer;font:600 11px var(--f-mono);letter-spacing:.06em;text-transform:uppercase}
  #aidebt details.adm ul{margin:6px 0 0;padding-left:18px}#aidebt details.adm li{margin:3px 0}
  #aidebt details.adm a{color:var(--muted)}
  #aidebt .xnote a{color:var(--muted)}
  @media (max-width:620px){#aidebt .ad-act{margin-left:0}#aidebt input[type=search]{width:100%}}
  @media (prefers-reduced-motion:reduce){#aidebt .mw-c i{transition:none}}`;
  document.head.appendChild(st);

  /* ---------- data ---------- */
  let D, FX = {}, ROWS = [], G = {}, CV = null;
  const toUSD = (amt, cur) => amt * (FX[cur] || 1) / 1000; // millions local -> US$ billions
  const parseMat = (m) => {
    const r = /^(\d{4})-(\d{4})$/.exec(m); if (r) return { y: null, range: [+r[1], +r[2]] };
    const [y, mo] = m.split("-").map(Number);
    return { y, mo: mo || null };
  };
  const matLabel = (r) => r.range ? `${r.range[0]}–${r.range[1]}` : (r.mo ? `${MON[r.mo - 1]} ${r.y}` : String(r.y));
  const pricedLabel = (s) => { const [y, m, d] = s.split("-").map(Number); return d ? `${MON[m - 1]} ${d}, ${y}` : `${MON[m - 1]} ${y}`; };
  const yrsLeft = (r) => { if (!r.y) return null; const t = new Date(r.y, (r.mo || 7) - 1, 15); return (t - NOW) / 31557600000; };
  const cpnNum = (c) => typeof c === "number" ? c : null;
  const cpnLabel = (c) => typeof c === "number" ? c.toFixed(3).replace(/0$/, "") + "%" : String(c).replace("SOFR FRN", "SOFR floater").replace("BBSW FRN", "BBSW floater").replace(/^([A-Z]+)\+([\d.]+)$/, "$1 + $2%") + (/^\d/.test(String(c)) ? "%" : "");
  const bn = (v) => v == null ? "–" : v >= 100 ? "$" + v.toFixed(0) + "B" : "$" + v.toFixed(v >= 10 ? 1 : 2) + "B";
  const local = (amt, cur) => { const s = SYM[cur] || ""; return amt >= 1000 ? `${s}${+(amt / 1000).toFixed(amt % 100 ? 3 : 2)}B` : `${s}${amt}M`; };

  function build() {
    G = {}; D.groups.forEach((g, i) => { G[g.id] = Object.assign({ i, col: `var(--g${i + 1})` }, g); });
    ROWS = [];
    D.deals.forEach((d) => d.tr.forEach(([m, amt, c], k) => {
      const r = parseMat(m);
      ROWS.push({ d, k, m: r, amt, cur: d.cur, usd: toUSD(amt, d.cur), cpn: c, cn: cpnNum(c), yl: yrsLeft(r),
        name: r.range ? `Other tranches due ${matLabel(r)} (sizes not public)` : `${cpnLabel(c)} notes due ${r.y}`,
        sk: (r.y || r.range[0]) * 100 + (r.mo || 0) });
    }));
  }

  /* ---------- market: estimated yield, WTD/MTD change, CDS ---------- */
  const TEN = [2, 5, 10, 30];
  const nyDay = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const REF = (() => {
    const today = nyDay(NOW), [y, m, dd] = today.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(), mon = new Date(Date.UTC(y, m - 1, dd - ((wd + 6) % 7)));
    return { wk: mon.toISOString().slice(0, 10), mo: `${y}-${String(m).padStart(2, "0")}-01` }; // last close strictly before these
  })();
  const lastBefore = (arr, day, incl) => { let v = null; for (const [d, x] of arr) { if (incl ? d <= day : d < day) v = x; else break; } return v; };
  // government yield (%) for a currency at T years; date = null for now, else the close on or before that day
  function govt(cur, T, date, before) {
    const c = CV && CV.cur && CV.cur[cur], snap = D.mkt.govtSnap[cur] || {};
    const pts = [];
    TEN.forEach((t) => {
      const s = c && c[t];
      let v = null;
      if (date) { if (s && s.d && s.d.length && s.d[0][0] <= date) v = lastBefore(s.d, date, !before); }
      else v = s ? s.now : snap[t] ?? null;
      if (v != null) pts.push([t, v]);
    });
    if (!pts.length) return null;
    return interp(pts, T);
  }
  function interp(pts, T) {
    if (T <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (T <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + (vb - va) * (T - a) / (b - a); }
    return pts[pts.length - 1][1];
  }
  const shift = (M, date) => { const sh = (M && M.sh) || []; if (!sh.length) return 0; if (!date) return sh[sh.length - 1][1]; let v = sh[0][1]; for (const [d, x] of sh) if (d <= date) v = x; return v; };
  const yrsBetween = (a, r) => { const t = new Date(r.y, (r.mo || 7) - 1, 15); return (t - a) / 31557600000; };
  function prepMkt() {
    ROWS.forEach((r) => {
      r.ytm = r.wtd = r.mtd = null; r.cds = null;
      const M = D.mkt && D.mkt.iss[r.d.g]; if (!M) return;
      r.cds = M.cds ? M.cds.v : null;
      if (r.cn == null || r.d.kind === "cv" || r.yl == null || r.yl <= 0) return;
      let spr = null;
      if (M.mode === "curve") spr = interp((M.sprCur && M.sprCur[r.cur]) || M.spr, r.yl);
      else {
        const pd = r.d.priced.length === 7 ? r.d.priced + "-15" : r.d.priced;
        const gi = govt(r.cur, yrsBetween(new Date(pd), r.m), pd);
        const issue = gi != null ? r.cn * 100 - gi * 100 : (M.flat != null ? M.flat - (shift(M, null) - shift(M, pd)) : r.cn * 100 - (govt(r.cur, r.yl, null) || 0) * 100);
        spr = issue + shift(M, null) - shift(M, pd);
        r.issSpr = gi != null;
      }
      const g0 = govt(r.cur, r.yl, null); if (g0 == null) return;
      r.spr = spr; r.ytm = g0 + spr / 100;
      const chg = (day) => { const g1 = govt(r.cur, r.yl, day, true); return g1 == null ? null : (g0 - g1) * 100 + shift(M, null) - shift(M, prevDay(day)); };
      r.wtd = chg(REF.wk); r.mtd = chg(REF.mo);
    });
  }
  const prevDay = (day) => { const t = new Date(day + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };
  const pct = (v) => v == null ? "–" : v.toFixed(2) + "%";
  const bp = (v) => v == null ? "–" : (v > 0.5 ? "+" : v < -0.5 ? "−" : "") + Math.abs(v).toFixed(0);
  const bpCls = (v) => v == null || Math.abs(v) < 0.5 ? "" : v > 0 ? "dn" : "up"; // higher yield = lower price
  const cdsH = (g) => { const M = D.mkt && D.mkt.iss[g]; return M && M.cds ? `<span title="5-year CDS quoted ${pricedLabel(M.cds.d)}">${M.cds.v.toFixed(0)}</span>` : "–"; };
  const wavg = (rs, k) => { const x = rs.filter((r) => r[k] != null), w = x.reduce((a, r) => a + r.usd, 0); return w ? x.reduce((a, r) => a + r[k] * r.usd, 0) / w : null; };

  /* ---------- state ---------- */
  const S = { by: store("ad-by") || "g", groups: new Set((store("ad-groups") || "").split(",").filter(Boolean)), type: store("ad-type") || "all",
    cur: "all", range: "all", bucket: null, q: "", view: store("ad-view") || "bond", sort: "mat", dir: 1, hidden: new Set(), open: new Set() };

  const inRange = (r, v) => {
    if (v === "all") return true;
    if (!r.m.y) return false;
    const [a, b] = v.split("-"); return (!a || r.m.y >= +a) && (!b || r.m.y <= +b);
  };
  const typeOk = (k, t) => t === "all" || (t === "hyc" ? k === "hy" || k === "cv" : k === t);
  function filtered() {
    const q = S.q.trim().toLowerCase();
    return ROWS.filter((r) => (!S.groups.size || S.groups.has(r.d.g)) && typeOk(r.d.kind, S.type) && (S.cur === "all" || r.cur === S.cur) && inRange(r, S.range)
      && (!S.bucket || (r.m.y && r.m.y >= S.bucket.a && r.m.y <= S.bucket.b))
      && (!q || `${r.d.iss} ${r.d.backer} ${G[r.d.g].n} ${r.name} ${r.cur} ${KIND[r.d.kind]} ${r.m.y || ""} ${r.d.note}`.toLowerCase().includes(q)));
  }

  /* ---------- tooltip (shares the page's .ctip style) ---------- */
  const tip = document.createElement("div"); tip.className = "ctip"; tip.hidden = true; tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth;
    tip.style.left = Math.min(Math.max(8, x + 14), vw - w - 8) + window.scrollX + "px";
    tip.style.top = (y - h - 12 < 8 ? y + 18 : y - h - 12) + window.scrollY + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  window.addEventListener("scroll", hideTip, { passive: true });

  /* ---------- layout ---------- */
  host.innerHTML = `
    <h2 id="adH">AI debt: who is borrowing and when it comes due</h2>
    <p class="sub">Every bond sold to pay for AI data centers by the biggest borrowers, with each tranche's size, coupon and maturity. Click a borrower or a maturity bar to filter the bond table; sort any column.</p>
    <div class="ad-cells" id="adCells"></div>
    <div class="ad-two">
      <div class="panel"><h3>By borrower</h3><div class="tw" id="adIss"></div></div>
      <div class="panel"><h3>Maturity wall · principal due, US$ billions</h3><div class="ctl" id="adMwCtl"></div><div id="adMw"></div><div class="leg" id="adLeg"></div><p class="xnote" id="adMwNote"></p></div>
    </div>
    <div class="panel">
      <h3>Every bond</h3>
      <div class="chipsrow" id="adChips" role="group" aria-label="Filter by borrower"></div>
      <div class="ad-f" id="adF"></div>
      <p class="ad-cnt" id="adCnt" aria-live="polite"></p>
      <div class="ad-wrap"><table class="ad-tab" id="adTab"></table></div>
      <details class="adm" id="adMkt"></details>
      <p class="xnote" id="adScope"></p>
    </div>`;
  const $ = (id) => document.getElementById(id);

  /* ---------- summary cells ---------- */
  function cells() {
    const all = ROWS, tot = all.reduce((a, r) => a + r.usd, 0);
    const fixed = all.filter((r) => r.cn != null), wc = fixed.reduce((a, r) => a + r.cn * r.usd, 0) / fixed.reduce((a, r) => a + r.usd, 0);
    const by30 = all.filter((r) => r.m.y && r.m.y <= 2030).reduce((a, r) => a + r.usd, 0);
    const long = all.filter((r) => r.m.y && r.m.y >= 2046).reduce((a, r) => a + r.usd, 0);
    const spv = all.filter((r) => r.d.kind === "spv").reduce((a, r) => a + r.usd, 0);
    const c = (k, v, s) => `<div class="tile"><b>${k}</b><span class="v">${v}</span><small>${s}</small></div>`;
    $("adCells").innerHTML = c("Bonds tracked", bn(tot), `${all.length} tranches in ${D.deals.length} deals`)
      + c("Due by 2030", bn(by30), `${(by30 / tot * 100).toFixed(0)}% of the total`)
      + c("Due 2046 or later", bn(long), `${(long / tot * 100).toFixed(0)}% locked in for 20+ years`)
      + c("Average coupon", wc.toFixed(2) + "%", "fixed-rate bonds, weighted by size")
      + c("Off balance sheet", bn(spv), "project SPVs repaid from hyperscaler leases")
      + (D.context || []).map((x) => c(esc(x.k), esc(x.v), esc(x.s))).join("");
  }

  /* ---------- by borrower ---------- */
  let issSort = "usd";
  function issuers() {
    const agg = D.groups.map((g) => {
      const rs = ROWS.filter((r) => r.d.g === g.id), usd = rs.reduce((a, r) => a + r.usd, 0);
      const fx = rs.filter((r) => r.cn != null), w = fx.reduce((a, r) => a + r.usd, 0);
      const ys = rs.filter((r) => r.m.y).map((r) => r.m.y);
      const next = rs.filter((r) => r.m.y).sort((a, b) => a.sk - b.sk)[0];
      return { g, n: rs.length, usd, cpn: w ? fx.reduce((a, r) => a + r.cn * r.usd, 0) / w : null, lo: Math.min(...ys), hi: Math.max(...ys), next,
        ytm: wavg(rs, "ytm"), cds: D.mkt && D.mkt.iss[g.id] && D.mkt.iss[g.id].cds ? D.mkt.iss[g.id].cds.v : null,
        rating: (rs.find((r) => r.d.rating && r.d.kind !== "cv") || {}).d?.rating || "" };
    });
    const tot = agg.reduce((a, x) => a + x.usd, 0), max = Math.max(...agg.map((x) => x.usd));
    agg.sort((a, b) => issSort === "cpn" ? (b.cpn || 0) - (a.cpn || 0) : issSort === "ytm" ? (b.ytm || 0) - (a.ytm || 0) : issSort === "cds" ? (b.cds ?? -1) - (a.cds ?? -1) : issSort === "next" ? a.next.sk - b.next.sk : b.usd - a.usd);
    const th = (k, n) => `<th${issSort === k ? ' aria-sort="descending"' : ""}><button type="button" data-s="${k}">${n}${issSort === k ? " ▾" : ""}</button></th>`;
    $("adIss").innerHTML = `<table class="ad-tab"><thead><tr><th>Borrower</th>${th("usd", "Amount")}${th("cpn", "Avg cpn")}${th("ytm", "Yield")}${th("cds", "5Y CDS")}${th("next", "Next due")}</tr></thead><tbody>
      ${agg.map((x) => `<tr class="adck${S.groups.size === 1 && S.groups.has(x.g.id) ? " on" : ""}" tabindex="0" data-g="${x.g.id}" aria-label="Show only ${esc(x.g.n)} bonds">
        <td><span class="sw" style="background:${G[x.g.id].col}"></span>${esc(x.g.n)}<small>${x.n} bonds, ${x.lo}–${x.hi}${x.rating ? " · " + esc(x.rating) : ""}</small></td>
        <td>${bn(x.usd)}<small>${(x.usd / tot * 100).toFixed(0)}%</small><span class="shr" style="width:${(x.usd / max * 100).toFixed(1)}%"></span></td>
        <td>${x.cpn == null ? "–" : x.cpn.toFixed(2) + "%"}</td>
        <td>${pct(x.ytm)}</td>
        <td>${cdsH(x.g.id)}</td>
        <td>${matLabel(x.next.m)}<small>${bn(ROWS.filter((r) => r.d.g === x.g.id && r.m.y === x.next.m.y).reduce((a, r) => a + r.usd, 0))}</small></td></tr>`).join("")}
      </tbody><tfoot><tr><td>Total</td><td>${bn(tot)}</td><td></td><td>${pct(wavg(ROWS, "ytm"))}</td><td></td><td></td></tr></tfoot></table>`;
  }
  $("adIss").addEventListener("click", (e) => {
    const s = e.target.closest("button[data-s]"); if (s) { issSort = s.dataset.s; issuers(); return; }
    const tr = e.target.closest("tr[data-g]"); if (!tr) return;
    const g = tr.dataset.g;
    if (S.groups.size === 1 && S.groups.has(g)) S.groups.clear(); else { S.groups.clear(); S.groups.add(g); }
    save(); renderAll(); $("adChips").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  });
  $("adIss").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-g]")) { e.preventDefault(); e.target.click(); } });

  /* ---------- maturity wall ---------- */
  const series = () => S.by === "g"
    ? D.groups.map((g) => ({ id: g.id, n: g.n, col: G[g.id].col, f: (r) => r.d.g === g.id }))
    : [{ id: "ig", n: "Investment-grade", col: "var(--g1)", f: (r) => r.d.kind === "ig" }, { id: "hyc", n: "High yield & convertible", col: "var(--g2)", f: (r) => r.d.kind === "hy" || r.d.kind === "cv" },
       { id: "spv", n: "Project SPVs (off balance sheet)", col: "var(--g3)", f: (r) => r.d.kind === "spv" }];
  function wall() {
    $("adMwCtl").innerHTML = `<div class="cg" data-k="by"><span class="cgl">Stack by</span><div class="seg" role="group" aria-label="Stack by">
      ${[["g", "Borrower"], ["t", "Type"]].map(([v, n]) => `<button type="button" data-v="${v}" aria-pressed="${S.by === v}">${n}</button>`).join("")}</div></div>`;
    const ser = series().filter((s) => !S.hidden.has(s.id));
    // the wall follows the borrower/type/currency filters, not the maturity ones
    const base = ROWS.filter((r) => r.m.y && (!S.groups.size || S.groups.has(r.d.g)) && typeOk(r.d.kind, S.type) && (S.cur === "all" || r.cur === S.cur));
    const cols = BUCKETS.map((b) => {
      const rs = base.filter((r) => r.m.y >= b.a && r.m.y <= b.b);
      const parts = ser.map((s) => ({ s, v: rs.filter(s.f).reduce((a, r) => a + r.usd, 0) }));
      return { b, parts, tot: parts.reduce((a, p) => a + p.v, 0), n: rs.filter((r) => ser.some((s) => s.f(r))).length };
    });
    const max = Math.max(1, ...cols.map((c) => c.tot));
    const step = max > 80 ? 25 : max > 40 ? 10 : max > 16 ? 5 : max > 6 ? 2 : 1, top = Math.ceil(max / step) * step;
    const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
    $("adMw").innerHTML = `<div class="mw"><div class="mw-y">${ticks.map((v) => `<span style="bottom:${v / top * 100}%">$${v}B</span>`).join("")}</div>
      <div class="mw-p">${ticks.slice(1).map((v) => `<div class="mw-g" style="bottom:${v / top * 100}%"></div>`).join("")}
      <div class="mw-cols${S.bucket ? " sel" : ""}" role="list">${cols.map((c, i) => `<div class="mw-c${S.bucket && S.bucket.id === c.b.id ? " on" : ""}" role="listitem" tabindex="0" data-i="${i}"
        aria-label="${c.b.n}: ${bn(c.tot)} due${c.parts.filter((p) => p.v).map((p) => `, ${p.s.n} ${bn(p.v)}`).join("")}. Press Enter to filter the bond table.">
        ${c.parts.filter((p) => p.v > 0).map((p) => `<i style="height:calc(${(p.v / top * 100).toFixed(3)}% - 2px);background:${p.s.col}"></i>`).join("")}</div>`).join("")}</div></div></div>
      <div class="mw-x" aria-hidden="true">${cols.map((c) => `<span><b class="lf">${c.b.x || c.b.n}</b><b class="ls">${c.b.a > 2100 ? "" : c.b.b > 2100 ? "'67<br>+" : c.b.a === c.b.b ? "'" + String(c.b.a).slice(2) : "'" + String(c.b.a).slice(2) + "<br>–" + String(c.b.b).slice(2)}</b></span>`).join("")}</div>`;
    $("adLeg").innerHTML = `<div class="leg" role="group" aria-label="Show or hide series" style="display:flex;flex-wrap:wrap;gap:4px 14px;margin:0">${series().map((s) =>
      `<button type="button" data-h="${s.id}" aria-pressed="${!S.hidden.has(s.id)}"><span class="sw" style="background:${s.col}"></span>${esc(s.n)}</button>`).join("")}</div>`;
    const jp = ROWS.filter((r) => r.m.range).reduce((a, r) => a + r.usd, 0);
    $("adMwNote").innerHTML = `Bars to 2036 are single years; later bars group several years (labelled). Click a bar to list its bonds; click again to clear.${jp ? ` ${bn(jp)} of Alphabet's yen bonds with undisclosed tranche sizes is not in the chart.` : ""} Oracle's Michigan project bond amortizes from 2032, so its principal is shown at final maturity (2045).`;
    $("adMw").querySelectorAll(".mw-c").forEach((el) => {
      const c = cols[+el.dataset.i];
      const html = () => `<b>${c.b.n === c.b.id ? "Due in " + c.b.n : "Due " + c.b.n.replace("–", "–20")}</b><small>${c.n} bonds · ${bn(c.tot)}</small>
        ${c.parts.filter((p) => p.v).sort((a, b) => b.v - a.v).map((p) => `<div class="tr"><span class="sw" style="background:${p.s.col}"></span><em>${esc(p.s.n)}</em><span>${bn(p.v)}</span></div>`).join("")}
        <small class="hint">Click to list these bonds</small>`;
      el.addEventListener("mousemove", (e) => showTip(html(), e.clientX, e.clientY));
      el.addEventListener("mouseleave", hideTip);
      el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); showTip(html(), r.left + r.width / 2, r.top); });
      el.addEventListener("blur", hideTip);
      const pick = () => { S.bucket = S.bucket && S.bucket.id === c.b.id ? null : c.b; S.range = "all"; hideTip(); renderAll(); };
      el.addEventListener("click", pick);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
  }
  $("adMwCtl").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; S.by = b.dataset.v; S.hidden.clear(); save(); wall(); });
  $("adLeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-h]"); if (!b) return;
    const id = b.dataset.h, all = series().length;
    if (S.hidden.has(id)) S.hidden.delete(id); else if (S.hidden.size < all - 1) S.hidden.add(id);
    wall();
  });

  /* ---------- bond table ---------- */
  function chips() {
    $("adChips").innerHTML = `<button type="button" data-g="" aria-pressed="${!S.groups.size}">All borrowers</button>` + D.groups.map((g) =>
      `<button type="button" data-g="${g.id}" aria-pressed="${S.groups.has(g.id)}"><span class="sw" style="background:${G[g.id].col}"></span>${esc(g.n)}</button>`).join("");
  }
  $("adChips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const g = b.dataset.g;
    if (!g) S.groups.clear(); else if (S.groups.has(g)) S.groups.delete(g); else S.groups.add(g);
    save(); renderAll();
  });
  function controls() {
    const curs = [...new Set(ROWS.map((r) => r.cur))];
    $("adF").innerHTML = `
      <div class="cg"><span class="cgl">Type</span><div class="seg" role="group" aria-label="Bond type" data-k="type">${TYPES.map((t) => `<button type="button" data-v="${t.v}" aria-pressed="${S.type === t.v}">${t.n}</button>`).join("")}</div></div>
      <label class="cg"><span class="cgl">Currency</span><select id="adCur"><option value="all">All</option>${curs.map((c) => `<option${S.cur === c ? " selected" : ""}>${c}</option>`).join("")}</select></label>
      <label class="cg"><span class="cgl">Maturity</span><select id="adRange">${(S.bucket ? [{ v: "b", n: "Chart: " + S.bucket.n }] : []).concat(RANGES).map((r) => `<option value="${r.v}"${(S.bucket ? r.v === "b" : S.range === r.v) ? " selected" : ""}>${r.n}</option>`).join("")}</select></label>
      <input type="search" id="adQ" placeholder="Search bonds" aria-label="Search bonds" value="${esc(S.q)}">
      <div class="ad-act"><div class="seg" role="group" aria-label="Rows" data-k="view">${[["bond", "Per bond"], ["deal", "Per deal"]].map(([v, n]) => `<button type="button" data-v="${v}" aria-pressed="${S.view === v}">${n}</button>`).join("")}</div>
      <button type="button" class="btnl" id="adCsv">Download CSV</button></div>`;
  }
  $("adF").addEventListener("click", (e) => {
    const b = e.target.closest(".seg button"); if (b) { const k = b.closest("[data-k]").dataset.k; S[k] = b.dataset.v; save(); renderAll(); return; }
    if (e.target.id === "adCsv") csv();
  });
  $("adF").addEventListener("change", (e) => {
    if (e.target.id === "adCur") { S.cur = e.target.value; renderAll(); }
    if (e.target.id === "adRange") { if (e.target.value !== "b") { S.bucket = null; S.range = e.target.value; } renderAll(); }
  });
  let qt; $("adF").addEventListener("input", (e) => { if (e.target.id !== "adQ") return; clearTimeout(qt); qt = setTimeout(() => { S.q = e.target.value; table(); }, 150); });

  const COLS_B = [
    { k: "iss", n: "Borrower", v: (r) => r.d.iss, h: (r) => `<span class="sw" style="background:${G[r.d.g].col}"></span>${esc(r.d.iss)}${r.d.backer ? `<small>for ${esc(r.d.backer)}</small>` : ""}` },
    { k: "name", n: "Bond", l: 1, f: (rs) => rs.length + " bonds", v: (r) => r.name, h: (r) => r.d.note ? `<span title="${esc(r.d.note)}">${esc(r.name)}</span>` : esc(r.name) },
    { k: "cur", n: "Cur", v: (r) => r.cur },
    { k: "amt", n: "Size", v: (r) => r.amt, h: (r) => local(r.amt, r.cur) },
    { k: "usd", n: "US$", v: (r) => r.usd, h: (r) => bn(r.usd), f: (rs) => bn(rs.reduce((a, r) => a + r.usd, 0)) },
    { k: "cpn", n: "Coupon", v: (r) => r.cn ?? -1, h: (r) => cpnLabel(r.cpn), f: (rs) => { const w = wavg(rs, "cn"); return w == null ? "" : "avg " + w.toFixed(2) + "%"; } },
    { k: "mat", n: "Matures", v: (r) => r.sk, h: (r) => matLabel(r.m) },
    { k: "yl", n: "Years left", v: (r) => r.yl ?? 999, h: (r) => r.yl == null ? "–" : r.yl.toFixed(1) },
    { k: "ytm", n: "YTM", t: "Estimated yield to maturity: live government yield for the currency and maturity plus the borrower's credit spread (see How the yields are estimated)", v: (r) => r.ytm ?? -1, h: (r) => pct(r.ytm), f: (rs) => pct(wavg(rs, "ytm")) },
    { k: "wtd", n: "WTD Δ", t: "Change in yield since last Friday's close, basis points", v: (r) => r.wtd ?? -1e9, h: (r) => bp(r.wtd), c: (r) => bpCls(r.wtd), f: (rs) => bp(wavg(rs, "wtd")) },
    { k: "mtd", n: "MTD Δ", t: "Change in yield since the last close of last month, basis points", v: (r) => r.mtd ?? -1e9, h: (r) => bp(r.mtd), c: (r) => bpCls(r.mtd), f: (rs) => bp(wavg(rs, "mtd")) },
    { k: "cds", n: "5Y CDS", t: "Borrower's 5-year credit default swap, basis points a year (date of the quote below)", v: (r) => r.cds ?? -1, h: (r) => cdsH(r.d.g) },
    { k: "pr", n: "Priced", v: (r) => r.d.priced, h: (r) => pricedLabel(r.d.priced) },
    { k: "kind", n: "Type", v: (r) => r.d.kind, h: (r) => `<span class="tag ${r.d.kind}" title="${KIND[r.d.kind]}">${KS[r.d.kind]}</span>` },
  ];
  function dealRows(rows) {
    const m = new Map();
    rows.forEach((r) => { if (!m.has(r.d.id)) m.set(r.d.id, { d: r.d, rs: [] }); m.get(r.d.id).rs.push(r); });
    return [...m.values()].map((x) => {
      const usd = x.rs.reduce((a, r) => a + r.usd, 0), amt = x.rs.reduce((a, r) => a + r.amt, 0), fx = x.rs.filter((r) => r.cn != null);
      const ys = x.rs.map((r) => r.m.y || r.m.range[1]).concat(x.rs.filter((r) => r.m.range).map((r) => r.m.range[0]));
      const cs = fx.map((r) => r.cn);
      return { d: x.d, rs: x.rs, usd, amt, n: x.rs.length, ytm: wavg(x.rs, "ytm"), wtd: wavg(x.rs, "wtd"), mtd: wavg(x.rs, "mtd"), cds: x.rs[0].cds, lo: Math.min(...ys), hi: Math.max(...ys),
        cpn: fx.length ? fx.reduce((a, r) => a + r.cn * r.usd, 0) / fx.reduce((a, r) => a + r.usd, 0) : null, clo: cs.length ? Math.min(...cs) : null, chi: cs.length ? Math.max(...cs) : null };
    });
  }
  const COLS_D = [
    { k: "iss", n: "Borrower", v: (x) => x.d.iss, h: (x) => `<span class="caret" aria-hidden="true">›</span><span class="sw" style="background:${G[x.d.g].col}"></span>${esc(x.d.iss)}${x.d.backer ? `<small>for ${esc(x.d.backer)}</small>` : ""}` },
    { k: "pr", n: "Priced", v: (x) => x.d.priced, h: (x) => pricedLabel(x.d.priced) },
    { k: "cur", n: "Cur", v: (x) => x.d.cur },
    { k: "amt", n: "Size", v: (x) => x.amt, h: (x) => local(x.amt, x.d.cur) },
    { k: "usd", n: "US$", v: (x) => x.usd, h: (x) => bn(x.usd), f: (rs) => bn(rs.reduce((a, r) => a + r.usd, 0)) },
    { k: "n", n: "Bonds", v: (x) => x.n, f: (rs) => rs.length },
    { k: "mat", n: "Maturities", v: (x) => x.lo, h: (x) => x.lo === x.hi ? x.lo : `${x.lo}–${x.hi}` },
    { k: "cpn", n: "Coupons", f: (rs) => { const w = wavg(rs, "cn"); return w == null ? "" : "avg " + w.toFixed(2) + "%"; }, v: (x) => x.cpn ?? -1, h: (x) => x.clo == null ? cpnLabel(x.rs[0].cpn) : x.clo === x.chi ? x.clo.toFixed(3).replace(/0$/, "") + "%" : `${x.clo.toFixed(2)}–${x.chi.toFixed(2)}%` },
    { k: "ytm", n: "YTM", t: "Estimated yield to maturity, average of the deal's bonds weighted by size", v: (x) => x.ytm ?? -1, h: (x) => pct(x.ytm), f: (rs) => pct(wavg(rs, "ytm")) },
    { k: "wtd", n: "WTD Δ", t: "Change in yield since last Friday's close, basis points", v: (x) => x.wtd ?? -1e9, h: (x) => bp(x.wtd), c: (x) => bpCls(x.wtd), f: (rs) => bp(wavg(rs, "wtd")) },
    { k: "mtd", n: "MTD Δ", t: "Change in yield since the last close of last month, basis points", v: (x) => x.mtd ?? -1e9, h: (x) => bp(x.mtd), c: (x) => bpCls(x.mtd), f: (rs) => bp(wavg(rs, "mtd")) },
    { k: "cds", n: "5Y CDS", t: "Borrower's 5-year credit default swap, basis points a year", v: (x) => x.cds ?? -1, h: (x) => cdsH(x.d.g) },
    { k: "kind", n: "Type", v: (x) => x.d.kind, h: (x) => `<span class="tag ${x.d.kind}" title="${KIND[x.d.kind]}">${KS[x.d.kind]}</span>${x.d.rating ? `<small>${esc(x.d.rating)}</small>` : ""}` },
  ];
  const td = (c, x) => { const cl = [c.l ? "l" : "", c.c ? c.c(x) : ""].filter(Boolean).join(" "); return `<td${cl ? ` class="${cl}"` : ""}>${c.h ? c.h(x) : esc(c.v(x))}</td>`; };
  function table() {
    const rows = filtered(), deal = S.view === "deal";
    const cols = deal ? COLS_D : COLS_B;
    if (!cols.some((c) => c.k === S.sort)) { S.sort = deal ? "pr" : "mat"; S.dir = deal ? -1 : 1; }
    const col = cols.find((c) => c.k === S.sort);
    let list = deal ? dealRows(rows) : rows.slice();
    list.sort((a, b) => { const x = col.v(a), y = col.v(b); return (x < y ? -1 : x > y ? 1 : 0) * S.dir || (b.usd - a.usd); });
    const tot = rows.reduce((a, r) => a + r.usd, 0), fx = rows.filter((r) => r.cn != null), w = fx.reduce((a, r) => a + r.usd, 0);
    const wc = w ? fx.reduce((a, r) => a + r.cn * r.usd, 0) / w : null;
    const thead = `<thead><tr>${cols.map((c) => `<th${c.t ? ` title="${esc(c.t)}"` : ""}${c.k === S.sort ? ` aria-sort="${S.dir > 0 ? "ascending" : "descending"}"` : ""}${c.l ? ' style="text-align:left"' : ""}><button type="button" data-s="${c.k}">${c.n}${c.k === S.sort ? (S.dir > 0 ? " ▴" : " ▾") : ""}</button></th>`).join("")}</tr></thead>`;
    const body = deal
      ? list.map((x) => {
          const open = S.open.has(x.d.id);
          return `<tr class="adck${open ? " open" : ""}" tabindex="0" data-d="${x.d.id}" aria-expanded="${open}">${cols.map((c) => td(c, x)).join("")}</tr>`
            + (open ? `<tr class="dx"><td colspan="${cols.length}">${x.d.note ? esc(x.d.note) : ""}<table>${x.rs.sort((a, b) => a.sk - b.sk).map((r) => `<tr><td>${esc(r.name)}</td><td>${local(r.amt, r.cur)}</td><td>${bn(r.usd)}</td><td>${cpnLabel(r.cpn)}</td><td>${matLabel(r.m)}</td><td>${r.ytm == null ? "" : "YTM " + pct(r.ytm)}</td><td>${r.wtd == null ? "" : "WTD " + bp(r.wtd)}</td><td>${r.mtd == null ? "" : "MTD " + bp(r.mtd)}</td></tr>`).join("")}</table>
              Sources: ${x.d.src.map((i) => `<a href="${esc(D.sources[i].u)}" target="_blank" rel="noopener">${esc(D.sources[i].t)}</a>`).join(" · ")}</td></tr>` : "");
        }).join("")
      : list.map((r) => `<tr>${cols.map((c) => td(c, r)).join("")}</tr>`).join("");
    const foot = `<tfoot><tr>${cols.map((c, i) => `<td${c.l ? ' class="l"' : ""}>${i === 0 ? "Total" : c.f ? c.f(rows) : ""}</td>`).join("")}</tr></tfoot>`;
    $("adTab").innerHTML = thead + `<tbody>${body || `<tr><td colspan="${cols.length}">No bonds match these filters.</td></tr>`}</tbody>` + foot;
    const active = [S.groups.size ? [...S.groups].map((g) => G[g].n).join(", ") : "", S.type !== "all" ? TYPES.find((t) => t.v === S.type).n : "", S.cur !== "all" ? S.cur : "",
      S.bucket ? "maturing " + S.bucket.n : S.range !== "all" ? RANGES.find((r) => r.v === S.range).n.toLowerCase() : "", S.q ? `"${S.q}"` : ""].filter(Boolean);
    $("adCnt").innerHTML = `${deal ? dealRows(rows).length + " deals, " : ""}${rows.length} bonds, ${bn(tot)}${active.length ? " · " + esc(active.join(" · ")) + ` · <button type="button" class="btnl" id="adClr" style="padding:2px 8px">Clear filters</button>` : ""}`;
  }
  $("adTab").addEventListener("click", (e) => {
    const s = e.target.closest("th button[data-s]");
    if (s) { const k = s.dataset.s; if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = ["usd", "amt", "cpn", "n", "pr", "ytm", "wtd", "mtd", "cds"].includes(k) ? -1 : 1; } table(); return; }
    if (e.target.closest("a")) return;
    const tr = e.target.closest("tr[data-d]"); if (!tr) return;
    const id = tr.dataset.d; if (S.open.has(id)) S.open.delete(id); else S.open.add(id); table();
    const again = $("adTab").querySelector(`tr[data-d="${id}"]`); if (again) again.focus();
  });
  $("adTab").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-d]")) { e.preventDefault(); e.target.click(); } });
  $("adCnt").addEventListener("click", (e) => {
    if (e.target.id !== "adClr") return;
    S.groups.clear(); S.type = "all"; S.cur = "all"; S.range = "all"; S.bucket = null; S.q = ""; save(); renderAll();
  });

  function csv() {
    const rows = filtered().sort((a, b) => a.sk - b.sk);
    const q = (v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
    const n2 = (v, k) => v == null ? "" : v.toFixed(k);
    const lines = [["Borrower", "Backer", "Group", "Bond", "Currency", "Amount (local, millions)", "US$ billions", "Coupon", "Maturity", "Years left", "YTM % (est.)", "WTD change bp", "MTD change bp", "5Y CDS bp", "Priced", "Type", "Rating"]]
      .concat(rows.map((r) => [r.d.iss, r.d.backer, G[r.d.g].n, r.name, r.cur, r.amt, r.usd.toFixed(3), cpnLabel(r.cpn), matLabel(r.m), r.yl == null ? "" : r.yl.toFixed(1), n2(r.ytm, 3), n2(r.wtd, 1), n2(r.mtd, 1), r.cds ?? "", r.d.priced, KIND[r.d.kind], r.d.rating]));
    const blob = new Blob([lines.map((l) => l.map(q).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ai-debt-${D.asof}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function mktNote() {
    if (!D.mkt) return;
    const live = CV ? `Government yields are live from ${esc(CV.src || "CNBC")}, updated ${new Date(CV.updated * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
      : `Live government yields did not load, so yields use the ${pricedLabel(D.mkt.govtSnap.asof)} snapshot and week/month changes are blank.`;
    const items = D.groups.map((g) => { const M = D.mkt.iss[g.id]; if (!M) return "";
      return `<li><b>${esc(g.n)}</b>: ${esc(M.how)} ${M.cds ? `5Y CDS ${M.cds.v}bp (${pricedLabel(M.cds.d)}).` : "No CDS trades."} ${(M.src || []).map((i) => `<a href="${esc(D.sources[i].u)}" target="_blank" rel="noopener" title="${esc(D.sources[i].t)}">[src]</a>`).join(" ")}</li>`; }).join("");
    $("adMkt").innerHTML = `<summary>How the yields are estimated</summary><p>${esc(D.mkt.note)} ${live} Week-to-date compares with the close before ${pricedLabel(REF.wk)}, month-to-date with the close before ${pricedLabel(REF.mo)}.</p><ul>${items}</ul>`;
  }

  function save() { store("ad-by", S.by); store("ad-groups", [...S.groups].join(",")); store("ad-type", S.type); store("ad-view", S.view); }
  function renderAll() { issuers(); wall(); chips(); controls(); table(); }

  (async function () {
    const get = async (u) => { try { const r = await fetch(u + "?t=" + Date.now(), { cache: "no-store" }); return r.ok ? r.json() : null; } catch (e) { return null; } };
    const [d, fx, cv] = await Promise.all([get("../data/ai-debt.json"), get("../data/fx.json"), get("../data/curves.json")]);
    CV = cv && cv.cur ? cv : null;
    if (!d) { host.innerHTML += `<p class="note">The AI debt data did not load.</p>`; return; }
    D = d; FX = Object.assign({}, D.fxFallback);
    let live = false;
    const it = {}; ((fx && fx.items) || []).forEach((x) => { if (x.price) it[x.k] = x.price; });
    if (it.eurusd) { FX.EUR = it.eurusd; live = true; }
    if (it.gbpusd) FX.GBP = it.gbpusd;
    if (it.audusd) FX.AUD = it.audusd;
    if (it.usdjpy) FX.JPY = 1 / it.usdjpy;
    if (it.usdchf) FX.CHF = 1 / it.usdchf;
    if (it.usdcad) FX.CAD = 1 / it.usdcad;
    G = {}; D.groups.forEach((g, i) => { G[g.id] = Object.assign({ i, col: `var(--g${i + 1})` }, g); });
    S.groups.forEach((g) => { if (!G[g]) S.groups.delete(g); });
    build(); prepMkt(); cells(); renderAll(); mktNote();
    $("adScope").innerHTML = `${esc(D.scope)} ${live ? "Non-US-dollar bonds are converted to US$ at today's rates from the FX tab." : "Non-US-dollar bonds are converted at the fallback rates in the data file."} Amounts are at issue; prices in the market have moved since. Figures as of ${esc(D.asofText)}.`;
    const ol = document.getElementById("srcList");
    if (ol) ol.insertAdjacentHTML("beforeend", D.sources.map((s) => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a> (AI debt)</li>`).join(""));
  })();
})();
