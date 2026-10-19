/* Analyst ratings section, shared by every stock page.
   Reads analysts.json next to the page (written by scripts/fetch-analysts.mjs from Yahoo Finance,
   refreshed twice a day) and data/quote.json for the live price. Shows the consensus, how the
   rating mix changed over 3 months, each firm's price target against the price, and a table of
   every firm's rating, target and the change, with filters. EN / 中文 follows <html lang>.
   Uses a <section id="analysts"> if the page has one, otherwise adds it after the holders section. */
(function () {
  let host = document.getElementById("analysts");
  if (!host) {
    host = document.createElement("section");
    host.id = "analysts";
    const after = document.getElementById("holders") || document.getElementById("cashflow") || document.getElementById("revenue");
    if (!after) return;
    after.after(host);
  }
  host.setAttribute("aria-label", "Analyst ratings");

  const L = {
    en: {
      nav: "Analysts", h: "Analyst ratings and price targets",
      sub: "Every brokerage rating and price target from the last 12 months, with what changed. Upside is measured from the live price.",
      kCons: "Consensus", sCons: (n, m) => `${n} analysts · mean score ${m} (1 = strong buy, 5 = sell)`,
      kAvg: "Average target", sAvg: (u) => `${u} vs. price`,
      kRange: "Target range", sRange: (m) => `low – high · median ${m}`,
      kMoves: "Last 90 days", sMoves: (r, c) => `${r} target raises · ${c} cuts`,
      up: "upgrades", down: "downgrades", init: "initiations",
      mixH: "Rating mix", now: "Now", ago3: "3 months ago",
      sb: "Strong buy", b: "Buy", hd: "Hold", s: "Sell", ss: "Strong sell",
      stripH: "Price targets by firm", stripS: "Each dot is a firm's latest target; the line is the live price.",
      price: "Price", avg: "Average",
      tblH: "Ratings by firm",
      vLatest: "Latest per firm", vAll: "All actions",
      fAll: "All", fUp: "Upgrades", fDown: "Downgrades", fInit: "Initiations", fPT: "Target changes",
      w3: "3M", w6: "6M", w12: "12M",
      date: "Date", firm: "Firm", rating: "Rating", change: "Change", target: "Target", prior: "Prior", ptchg: "Target chg", upside: "Upside",
      aUp: "Upgrade", aDown: "Downgrade", aInit: "Initiated", aMain: "Maintained", aReit: "Reiterated",
      bBuy: "Buy", bHold: "Hold", bSell: "Sell",
      none: "No analyst actions in this window.", loading: "Loading analyst ratings…", fail: "Analyst data is not available yet. It is added by the next refresh.",
      stale: (d) => `Yahoo Finance's firm-by-firm feed for this stock stops on ${d}, so the table is empty or dated; the consensus, target range and rating mix above are current.`,
      note: (d) => `Source: Yahoo Finance, updated ${d}. Ratings are each firm's own wording, grouped into buy / hold / sell. "Maintained" means the firm kept its rating and changed or confirmed its target. For information only, not investment advice.`,
      more: (n) => `Show all ${n}`, less: "Show fewer",
    },
    zh: {
      nav: "分析师", h: "分析师评级与目标价",
      sub: "过去 12 个月各券商的评级与目标价，以及变化。上涨空间按实时股价计算。",
      kCons: "综合评级", sCons: (n, m) => `${n} 位分析师 · 平均评分 ${m}（1 = 强烈买入，5 = 卖出）`,
      kAvg: "平均目标价", sAvg: (u) => `较现价 ${u}`,
      kRange: "目标价区间", sRange: (m) => `最低 – 最高 · 中位数 ${m}`,
      kMoves: "近 90 天", sMoves: (r, c) => `上调目标价 ${r} 次 · 下调 ${c} 次`,
      up: "次上调评级", down: "次下调评级", init: "次首次覆盖",
      mixH: "评级分布", now: "当前", ago3: "3 个月前",
      sb: "强烈买入", b: "买入", hd: "持有", s: "卖出", ss: "强烈卖出",
      stripH: "各券商目标价", stripS: "每个点为一家券商的最新目标价；竖线为实时股价。",
      price: "股价", avg: "平均",
      tblH: "各券商评级",
      vLatest: "每家最新", vAll: "全部记录",
      fAll: "全部", fUp: "上调评级", fDown: "下调评级", fInit: "首次覆盖", fPT: "目标价变动",
      w3: "3个月", w6: "6个月", w12: "12个月",
      date: "日期", firm: "券商", rating: "评级", change: "变化", target: "目标价", prior: "原目标价", ptchg: "目标价变动", upside: "上涨空间",
      aUp: "上调", aDown: "下调", aInit: "首次覆盖", aMain: "维持", aReit: "重申",
      bBuy: "买入", bHold: "持有", bSell: "卖出",
      none: "此时段内没有分析师动态。", loading: "正在载入分析师评级…", fail: "分析师数据尚未生成，将于下次更新时加入。",
      stale: (d) => `Yahoo Finance 对该股票的逐家券商数据止于 ${d}，故下表为空或较旧；上方的综合评级、目标价区间与评级分布为最新数据。`,
      note: (d) => `来源：Yahoo Finance，更新于 ${d}。评级沿用各券商原文，并归为买入 / 持有 / 卖出。"维持"指券商保持评级，调整或确认目标价。仅供参考，不构成投资建议。`,
      more: (n) => `显示全部 ${n} 条`, less: "收起",
    },
  };
  const lang = () => (document.documentElement.lang || "en").startsWith("zh") ? "zh" : "en";
  const t = (k) => L[lang()][k];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dfmt = (s) => { const [y, m, d] = s.split("-").map(Number); return lang() === "zh" ? `${y}/${m}/${d}` : `${MON[m - 1]} ${d}, ${y}`; };
  const money = (v) => v == null || !isFinite(v) ? "—" : "$" + (v >= 1000 ? Math.round(v).toLocaleString("en-US") : v >= 100 ? v.toFixed(0) : v.toFixed(2));
  const pct = (v) => v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "%";
  const daysAgo = (s) => (Date.now() - new Date(s + "T12:00:00Z")) / 864e5;

  const BUY = /strong buy|buy|outperform|overweight|positive|accumulate|add|top pick|conviction|long-term buy|speculative buy/i;
  const SELL = /sell|underperform|underweight|reduce|negative/i;
  const bucket = (g) => !g ? null : SELL.test(g) && !/outperform/i.test(g) ? "sell" : BUY.test(g) ? "buy" : "hold";
  const BCLS = { buy: "p-plus", hold: "p-hold", sell: "p-risk" };

  let A = null, P = null, failed = false, view = "latest", filt = "all", win = 365, showAll = false;
  try { view = localStorage.getItem("an-view") || "latest"; win = +localStorage.getItem("an-win") || 365; } catch (e) {}

  const st = document.createElement("style");
  st.textContent = `
  #analysts .an-cells{grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:16px}
  #analysts .an-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:16px;margin-bottom:16px}
  #analysts h3{font:600 15px var(--f-body);margin:0 0 4px}
  #analysts .hint{font-size:12.5px;color:var(--muted);margin:0 0 10px}
  #analysts .mix{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px 10px;align-items:center;font-size:12.5px}
  #analysts .mix .lab{color:var(--muted);font:500 11px var(--f-mono);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
  #analysts .mix .bar{display:flex;height:22px;border-radius:4px;overflow:hidden;background:var(--line)}
  #analysts .mix .bar i{display:flex;align-items:center;justify-content:center;font:600 10.5px var(--f-mono);color:#fff;font-style:normal;min-width:0;overflow:hidden}
  #analysts .mix .n{font:600 12px var(--f-mono);color:var(--muted)}
  #analysts .mixkey{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:10px}
  #analysts .mixkey i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
  #analysts .strip{position:relative;height:74px;margin:6px 8px 0}
  #analysts .strip .axis{position:absolute;left:0;right:0;top:34px;height:2px;background:var(--line)}
  #analysts .strip .dot{position:absolute;top:28px;width:12px;height:12px;margin-left:-6px;border-radius:50%;opacity:.8;border:1.5px solid var(--panel)}
  #analysts .strip .px{position:absolute;top:8px;bottom:14px;width:2px;margin-left:-1px;background:var(--ink)}
  #analysts .strip .avg{position:absolute;top:18px;bottom:24px;width:2px;margin-left:-1px;background:var(--accent)}
  #analysts .strip .tag{position:absolute;font:600 10.5px var(--f-mono);white-space:nowrap;transform:translateX(-50%)}
  #analysts .strip .tag.t{top:-6px}#analysts .strip .tag.b{bottom:-2px;color:var(--muted)}
  #analysts .ctl{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin:0 0 8px}
  #analysts .ctl button{font:500 11.5px var(--f-mono);border:1px solid var(--line);background:transparent;color:var(--muted);padding:3px 8px;border-radius:4px;cursor:pointer;white-space:nowrap}
  #analysts .ctl button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
  #analysts .ctl button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  #analysts .ctl .gap{flex:1}
  #analysts table{min-width:760px}
  #analysts th,#analysts td{white-space:nowrap}
  #analysts td.fm,#analysts th.fm{text-align:left;font-weight:500;position:sticky;left:0;background:var(--panel);z-index:1}
  #analysts td.dt,#analysts th.dt{text-align:left;color:var(--muted)}
  #analysts td.rt,#analysts th.rt,#analysts td.ch,#analysts th.ch{text-align:left}
  #analysts .pill{display:inline-block;margin-right:6px}
  #analysts .p-hold{background:color-mix(in srgb,var(--muted) 15%,transparent);color:var(--muted)}
  #analysts .p-new{background:var(--accent-soft);color:var(--accent)}
  #analysts .ch .from{color:var(--muted)}
  #analysts .more{margin-top:10px;font:500 12px var(--f-mono);border:1px solid var(--line);background:transparent;color:var(--ink);padding:5px 10px;border-radius:4px;cursor:pointer}
  #analysts .an-note{font-size:12px;color:var(--muted);margin:10px 0 0;max-width:100ch;line-height:1.55}
  #analysts .an-stale{font-size:13.5px;margin:0 0 14px;padding:10px 12px;border-left:3px solid var(--copper);background:var(--copper-soft);border-radius:0 6px 6px 0;max-width:100ch}
  @media (max-width:860px){#analysts .an-grid{grid-template-columns:minmax(0,1fr)}}
  #analysts .sd{display:none;font:400 11px var(--f-mono);color:var(--muted);margin-top:2px}
  @media (max-width:640px){#analysts table{min-width:0}#analysts .xm,#analysts .dt{display:none}#analysts .sd{display:block}#analysts .ch .pill{margin-right:0}#analysts th,#analysts td{padding:6px 5px}#analysts td.fm{white-space:normal;min-width:96px}}
  `;
  document.head.appendChild(st);
  const COL = { sb: "#0f7a43", b: "#3aa76d", hd: "#9aa3ad", s: "#e07a5f", ss: "#c2362b" };

  function navLink() {
    const nav = document.querySelector("nav.sec"); if (!nav) return;
    let a = nav.querySelector('a[href="#analysts"]');
    if (!a) {
      a = document.createElement("a"); a.href = "#analysts";
      const after = nav.querySelector('a[href="#holders"]') || nav.querySelector('a[href="#cashflow"]');
      after ? after.after(a) : nav.appendChild(a);
    }
    a.textContent = t("nav");
  }

  const actLabel = (a) => ({ up: ["aUp", "p-plus"], down: ["aDown", "p-risk"], init: ["aInit", "p-new"], main: ["aMain", "p-hold"], reit: ["aReit", "p-hold"] }[a] || ["aMain", "p-hold"]);
  const price = () => P || (A && A.consensus && A.consensus.price) || null;

  function rows() {
    if (!A) return [];
    // [date, firm, to, from, action, pt, prior, ptAction]
    let R = A.actions.filter((r) => daysAgo(r[0]) <= win);
    if (view === "latest") { const seen = new Set(); R = R.filter((r) => !seen.has(r[1]) && seen.add(r[1])); }
    if (filt === "up") R = R.filter((r) => r[4] === "up");
    else if (filt === "down") R = R.filter((r) => r[4] === "down");
    else if (filt === "init") R = R.filter((r) => r[4] === "init");
    else if (filt === "pt") R = R.filter((r) => r[5] && r[6] && r[5] !== r[6]);
    return R;
  }

  function cells() {
    const C = A.consensus || {}, px = price();
    const recent = A.actions.filter((r) => daysAgo(r[0]) <= 90);
    const n = (k) => recent.filter((r) => r[4] === k).length;
    const raises = recent.filter((r) => r[5] && r[6] && r[5] > r[6]).length, cuts = recent.filter((r) => r[5] && r[6] && r[5] < r[6]).length;
    const key = (C.key || "").replace("_", " ");
    const keyTx = lang() === "zh" ? ({ "strong buy": "强烈买入", buy: "买入", hold: "持有", underperform: "跑输", sell: "卖出", "strong sell": "强烈卖出" }[key] || key) : key.replace(/\b\w/g, (c) => c.toUpperCase());
    const up = C.mean && px ? (C.mean / px - 1) * 100 : null;
    return `<div class="cells an-cells">
      <div class="cell"><div class="k">${t("kCons")}</div><div class="v">${esc(keyTx || "—")}</div><div class="s">${t("sCons")(C.n ?? "—", C.rating ? C.rating.toFixed(2) : "—")}</div></div>
      <div class="cell"><div class="k">${t("kAvg")}</div><div class="v">${money(C.mean)}</div><div class="s">${lang() === "zh" ? "较现价 " : ""}<span class="${up >= 0 ? "up" : "down"}">${pct(up)}</span>${lang() === "zh" ? "" : " vs. price"}</div></div>
      <div class="cell"><div class="k">${t("kRange")}</div><div class="v">${money(C.low)} – ${money(C.high)}</div><div class="s">${t("sRange")(money(C.median))}</div></div>
      <div class="cell"><div class="k">${t("kMoves")}</div><div class="v"><span class="up">${n("up")}</span> / <span class="down">${n("down")}</span> / ${n("init")}</div><div class="s">${t("up")} / ${t("down")} / ${t("init")} · ${t("sMoves")(raises, cuts)}</div></div>
    </div>`;
  }

  function mix() {
    const T = A.trend || [];
    const row = (p) => T.find((x) => x[0] === p);
    const bar = (r, lab) => {
      if (!r) return "";
      const v = r.slice(1), tot = v.reduce((s, x) => s + (x || 0), 0) || 1;
      const segs = ["sb", "b", "hd", "s", "ss"].map((k, i) => v[i] ? `<i style="width:${v[i] / tot * 100}%;background:${COL[k]}" title="${esc(t(k))}: ${v[i]}">${v[i] / tot > 0.07 ? v[i] : ""}</i>` : "").join("");
      return `<span class="lab">${lab}</span><div class="bar">${segs}</div><span class="n">${tot}</span>`;
    };
    return `<div class="panel"><h3>${t("mixH")}</h3>
      <div class="mix">${bar(row("0m"), t("now"))}${bar(row("-3m"), t("ago3"))}</div>
      <div class="mixkey">${["sb", "b", "hd", "s", "ss"].map((k) => `<span><i style="background:${COL[k]}"></i>${t(k)}</span>`).join("")}</div>
    </div>`;
  }

  function strip() {
    const px = price(), C = A.consensus || {};
    const seen = new Set(), latest = [];
    for (const r of A.actions) if (r[5] && !seen.has(r[1]) && daysAgo(r[0]) <= 365) { seen.add(r[1]); latest.push(r); }
    const vals = latest.map((r) => r[5]).concat([px, C.low, C.high].filter(Boolean));
    if (!vals.length) return `<div class="panel"><h3>${t("stripH")}</h3><p class="hint">${t("none")}</p></div>`;
    const lo = Math.min(...vals) * 0.97, hi = Math.max(...vals) * 1.03;
    const x = (v) => ((v - lo) / (hi - lo) * 100).toFixed(2) + "%";
    const colr = (g) => ({ buy: COL.b, hold: COL.hd, sell: COL.ss }[bucket(g)] || COL.hd);
    const dots = latest.map((r) => `<span class="dot" style="left:${x(r[5])};background:${colr(r[2])}" title="${esc(r[1])}: ${money(r[5])} · ${esc(r[2])} · ${esc(dfmt(r[0]))}"></span>`).join("");
    return `<div class="panel"><h3>${t("stripH")}</h3><p class="hint">${t("stripS")}</p>
      <div class="strip">
        <div class="axis"></div>${dots}
        ${C.mean ? `<span class="avg" style="left:${x(C.mean)}"></span>` : ""}
        ${px ? `<span class="px" style="left:${x(px)}"></span><span class="tag t" style="left:${x(px)}">${t("price")} ${money(px)}</span>` : ""}
        <span class="tag b" style="left:0;transform:none">${money(lo / 0.97)}</span>
        <span class="tag b" style="left:auto;right:0;transform:none">${money(hi / 1.03)}</span>
        ${C.mean ? `<span class="tag b" style="left:${x(C.mean)};color:var(--accent)">${t("avg")} ${money(C.mean)}</span>` : ""}
      </div></div>`;
  }

  function table() {
    const R = rows(), px = price();
    const shown = showAll ? R : R.slice(0, 25);
    const body = shown.map((r) => {
      const [d, firm, to, from, act, pt, prior] = r;
      const b = bucket(to), [lk, lc] = actLabel(act);
      const chgRating = act === "up" || act === "down" ? `<span class="from">${esc(from)}</span> → ${esc(to)}` : "";
      const ptc = pt && prior ? (pt / prior - 1) * 100 : null;
      const ups = pt && px ? (pt / px - 1) * 100 : null;
      return `<tr>
        <td class="dt">${esc(dfmt(d))}</td>
        <td class="fm">${esc(firm)}<div class="sd">${esc(dfmt(d))}</div></td>
        <td class="rt">${b ? `<span class="pill ${BCLS[b]}">${t(b === "buy" ? "bBuy" : b === "hold" ? "bHold" : "bSell")}</span>` : ""}<span class="xm">${esc(to)}</span></td>
        <td class="ch"><span class="pill ${lc}">${t(lk)}</span><span class="xm">${chgRating}</span></td>
        <td><b>${money(pt)}</b></td>
        <td class="xm">${money(prior)}</td>
        <td class="${ptc > 0 ? "up" : ptc < 0 ? "down" : ""}">${ptc == null ? "—" : ptc === 0 ? "0%" : pct(ptc)}</td>
        <td class="xm ${ups > 0 ? "up" : ups < 0 ? "down" : ""}">${pct(ups)}</td>
      </tr>`;
    }).join("");
    const btn = (cls, val, cur, lab) => `<button type="button" class="${cls}" data-v="${val}" aria-pressed="${cur === val}">${lab}</button>`;
    return `<h3 style="margin:4px 0 8px">${t("tblH")}</h3>
      <div class="ctl">${btn("vw", "latest", view, t("vLatest"))}${btn("vw", "all", view, t("vAll"))}<span class="gap"></span>
        ${btn("wn", "90", String(win), t("w3"))}${btn("wn", "182", String(win), t("w6"))}${btn("wn", "365", String(win), t("w12"))}</div>
      <div class="ctl">${btn("ft", "all", filt, t("fAll"))}${btn("ft", "up", filt, t("fUp"))}${btn("ft", "down", filt, t("fDown"))}${btn("ft", "init", filt, t("fInit"))}${btn("ft", "pt", filt, t("fPT"))}</div>
      <div class="panel tbl">
        ${R.length ? `<table>
          <thead><tr><th class="dt">${t("date")}</th><th class="fm">${t("firm")}</th><th class="rt">${t("rating")}</th><th class="ch">${t("change")}</th><th>${t("target")}</th><th class="xm">${t("prior")}</th><th>${t("ptchg")}</th><th class="xm">${t("upside")}</th></tr></thead>
          <tbody>${body}</tbody></table>` : `<p class="hint" style="margin:0">${t("none")}</p>`}
      </div>
      ${R.length > 25 ? `<button type="button" class="more">${showAll ? t("less") : t("more")(R.length)}</button>` : ""}`;
  }

  function render() {
    navLink();
    const head = `<h2>${t("h")}</h2><p class="sub">${t("sub")}</p>`;
    if (!A) { host.innerHTML = head + `<div class="panel"><p class="hint" style="margin:0">${failed ? t("fail") : t("loading")}</p></div>`; return; }
    const upd = A.updated ? dfmt(A.updated.slice(0, 10)) : "";
    host.innerHTML = head + cells() + `<div class="an-grid">${mix()}${strip()}</div>` +
      (A.feed_last ? `<p class="an-stale">${esc(t("stale")(dfmt(A.feed_last)))}</p>` : "") +
      `<div id="anTbl">${table()}</div><p class="an-note">${esc(t("note")(upd))}</p>`;
  }

  host.addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.classList.contains("vw")) { view = b.dataset.v; try { localStorage.setItem("an-view", view); } catch (e) {} }
    else if (b.classList.contains("wn")) { win = +b.dataset.v; try { localStorage.setItem("an-win", String(win)); } catch (e) {} }
    else if (b.classList.contains("ft")) filt = b.dataset.v;
    else if (b.classList.contains("more")) showAll = !showAll;
    else return;
    const box = host.querySelector("#anTbl"); if (box) box.innerHTML = table();
  });

  async function getJSON(u) { try { const r = await fetch(u + "?t=" + Math.floor(Date.now() / 60000), { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
  async function load() {
    const [a, q] = await Promise.all([getJSON("analysts.json"), getJSON("data/quote.json")]);
    if (a && a.actions) A = a; else failed = true;
    if (q && q.price) P = q.price;
  }
  (async () => {
    render();
    await load();
    render();
    setInterval(async () => { if (document.hidden) return; const old = P; await load(); if (P !== old) { const box = host.querySelector("#anTbl"); render(); void box; } }, 120000);
    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  })();
})();
