/* Management sections, shared by every stock page.
   Reads mgmt.json next to the page and adds two sections after the revenue charts:
     1. "Management's review of the quarter" — the latest results and management's view (paragraph 1)
        and the share price reaction and what drove it (paragraph 2), plus three cells: report date,
        first-session move, and the move since (computed live from data/history.json when it is there).
     2. "CEO and CFO" — one card per executive with a short background.
   EN / 中文 follows <html lang>. Each stock's text lives in <stock>/mgmt.json; refresh it after each report. */
(function () {
  const anchor = document.getElementById("annual") || document.getElementById("revenue");
  if (!anchor) return;

  const mk = (id, label) => {
    let s = document.getElementById(id);
    if (!s) { s = document.createElement("section"); s.id = id; }
    s.setAttribute("aria-label", label);
    return s;
  };
  const rev = mk("mgmt", "Management's review of the quarter");
  const lead = mk("leaders", "CEO and CFO");
  if (!rev.isConnected) anchor.after(rev);
  if (!lead.isConnected) rev.after(lead);

  const L = {
    en: {
      navR: "Review", navL: "CEO & CFO",
      hR: "Management's review of the quarter",
      subR: (q) => `${q}: what the company reported and how management sees it, then how the stock traded around the report and why.`,
      hL: "CEO and CFO", subL: "Who runs the company and who runs the money.",
      kRep: "Reported", kReact: "First session", kSince: "Since the report",
      sRep: { amc: "after the US close", bmo: "before the US open", krx: "before the Seoul open" },
      sReact: (d) => `close on ${d} vs. the last close before the report`,
      sSince: (d, live) => `vs. pre-report close · ${live ? "live, " : ""}as of ${d}`,
      ceo: "Chief Executive Officer", cfo: "Chief Financial Officer", since: (y) => `in the role since ${y}`,
      src: "Sources", asof: (d) => `Written ${d}. Price moves use daily closes.`,
      loading: "Loading…", fail: "Management notes are not available for this stock yet.",
    },
    zh: {
      navR: "管理层回顾", navL: "CEO 与 CFO",
      hR: "管理层季度回顾",
      subR: (q) => `${q}：公司业绩与管理层看法，以及财报前后股价走势与驱动因素。`,
      hL: "CEO 与 CFO", subL: "公司掌舵人与财务掌门人。",
      kRep: "发布日期", kReact: "首个交易日", kSince: "财报后至今",
      sRep: { amc: "美股收盘后", bmo: "美股开盘前", krx: "首尔开盘前" },
      sReact: (d) => `${d} 收盘价对比财报前最后收盘价`,
      sSince: (d, live) => `对比财报前收盘价 · ${live ? "实时，" : ""}截至 ${d}`,
      ceo: "首席执行官", cfo: "首席财务官", since: (y) => `${y} 年起任职`,
      src: "资料来源", asof: (d) => `撰写于 ${d}。股价变动按每日收盘价计算。`,
      loading: "载入中…", fail: "此股票暂无管理层资料。",
    },
  };
  const lang = () => (document.documentElement.lang || "en").startsWith("zh") ? "zh" : "en";
  const t = (k) => L[lang()][k];
  const tx = (o) => o == null ? "" : typeof o === "string" ? o : (o[lang()] ?? o.en ?? "");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fd = (s) => { const [y, m, d] = s.split("-").map(Number); return lang() === "zh" ? `${y}年${m}月${d}日` : `${MON[m - 1]} ${d}, ${y}`; };
  const pct = (v) => v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "%";
  const cls = (v) => v > 0 ? "up" : v < 0 ? "down" : "";

  const st = document.createElement("style");
  st.textContent = `
  #mgmt .mg-cells{grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:14px}
  #mgmt .mg-body p{margin:0 0 10px}
  #mgmt .mg-body p:last-child{margin-bottom:0}
  #mgmt .mg-body .lbl{font-weight:650;color:var(--ink);margin-right:6px}
  #mgmt .mg-note,#leaders .mg-note{font-size:12px;color:var(--muted);margin:10px 0 0}
  #mgmt .mg-note a,#leaders .mg-note a{color:var(--muted)}
  #leaders .ld{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  #leaders .ld .panel h3{margin:0;font:700 17px/1.25 var(--f-display)}
  #leaders .ld .role{font:500 11px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin:2px 0 8px}
  #leaders .ld .role span{color:var(--muted);text-transform:none;letter-spacing:0;font-family:var(--f-body)}
  #leaders .ld p{margin:0}
  @media (max-width:720px){#mgmt .mg-cells{grid-template-columns:1fr}#leaders .ld{grid-template-columns:1fr}}`;
  document.head.appendChild(st);

  function navLinks() {
    const nav = document.querySelector("nav.sec"); if (!nav) return;
    const add = (href, label, afterSel) => {
      let a = nav.querySelector(`a[href="${href}"]`);
      if (!a) {
        a = document.createElement("a"); a.href = href;
        const after = afterSel.map((s) => nav.querySelector(`a[href="${s}"]`)).find(Boolean);
        after ? after.after(a) : nav.appendChild(a);
      }
      a.textContent = label;
    };
    add("#mgmt", t("navR"), ["#annual", "#revenue"]);
    add("#leaders", t("navL"), ["#mgmt"]);
  }

  let D = null, H = null, failed = false;

  function since() {
    if (!D || !D.pre_close) return null;
    if (H && H.d && H.d.length && H.d[H.d.length - 1] > D.react.date) {
      const c = H.c[H.c.length - 1];
      return { v: (c / D.pre_close - 1) * 100, d: H.d[H.d.length - 1], live: true };
    }
    return D.since ? { v: D.since.pct, d: D.since.date, live: false } : null;
  }

  function card(p, role) {
    return `<div class="panel"><h3>${esc(tx(p.name))}</h3>
      <div class="role">${t(role)}${p.since ? ` <span>· ${t("since")(p.since)}</span>` : ""}</div>
      <p>${esc(tx(p.bio))}</p></div>`;
  }

  function render() {
    navLinks();
    if (!D) {
      const msg = `<div class="panel"><p class="sub" style="margin:0">${failed ? t("fail") : t("loading")}</p></div>`;
      rev.innerHTML = `<h2>${t("hR")}</h2>` + msg;
      lead.innerHTML = `<h2>${t("hL")}</h2>` + msg;
      return;
    }
    const s = since();
    const paras = (D.review[lang()] || D.review.en);
    const lbl = lang() === "zh" ? ["业绩与管理层看法：", "股价反应与驱动因素："] : ["The quarter.", "Price action."];
    const srcs = (D.sources || []).map((x) => `<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(tx(x.t))}</a>`).join(" · ");
    rev.innerHTML = `
      <h2>${t("hR")}</h2>
      <p class="sub">${esc(t("subR")(tx(D.quarter)))}</p>
      <div class="cells mg-cells">
        <div class="cell"><div class="k">${t("kRep")}</div><div class="v">${fd(D.reported)}</div><div class="s">${esc(t("sRep")[D.timing] || "")}</div></div>
        <div class="cell"><div class="k">${t("kReact")}</div><div class="v ${cls(D.react.pct)}">${pct(D.react.pct)}</div><div class="s">${esc(t("sReact")(fd(D.react.date)))}</div></div>
        <div class="cell"><div class="k">${t("kSince")}</div><div class="v ${s ? cls(s.v) : ""}">${s ? pct(s.v) : "—"}</div><div class="s">${s ? esc(t("sSince")(fd(s.d), s.live)) : ""}</div></div>
      </div>
      <div class="panel mg-body">
        <p><span class="lbl">${lbl[0]}</span>${esc(paras[0])}</p>
        <p><span class="lbl">${lbl[1]}</span>${esc(paras[1])}</p>
      </div>
      <p class="mg-note">${esc(t("asof")(fd(D.asof)))}${srcs ? " " + t("src") + (lang() === "zh" ? "：" : ": ") + srcs : ""}</p>`;
    lead.innerHTML = `
      <h2>${t("hL")}</h2>
      <p class="sub">${t("subL")}</p>
      <div class="ld">${card(D.ceo, "ceo")}${card(D.cfo, "cfo")}</div>`;
  }

  render();
  const v = Math.floor(Date.now() / 3600e3);
  fetch("mgmt.json?t=" + v, { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((j) => { D = j; render(); })
    .catch(() => { failed = true; render(); });
  fetch("data/history.json?t=" + Math.floor(Date.now() / 600e3), { cache: "no-store" })
    .then((r) => r.ok ? r.json() : null)
    .then((j) => { if (j && j.d && j.d.length) { H = j; if (D) render(); } })
    .catch(() => {});
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
