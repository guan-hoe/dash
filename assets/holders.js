/* Top 20 shareholders section, shared by every stock page.
   Reads holders.json next to the page, written by scripts/fetch-holders.py from the SEC's Form 13F
   data sets (refreshed weekly by .github/workflows/holders.yml). Shows the 20 largest institutional
   holders at the latest 13F quarter, their shares at each of the last three quarter ends (6 months),
   the change, and who dropped out of the top 20. EN / 中文 follows <html lang>.
   Uses a <section id="holders"> if the page has one, otherwise adds it after the cash flow section. */
(function () {
  let host = document.getElementById("holders");
  if (!host) {
    host = document.createElement("section");
    host.id = "holders";
    const after = document.getElementById("cashflow") || document.getElementById("revenue");
    if (!after) return;
    after.after(host);
  }
  host.setAttribute("aria-label", "Top shareholders");

  const L = {
    en: {
      nav: "Holders", h: "Top 20 shareholders",
      sub: "The 20 largest institutional holders, from 13F filings, with their shares at each of the last three quarter ends. The change column covers six months.",
      rank: "#", holder: "Holder", chg: "6-month change", pct: "% chg", own: "% of co.", status: "Status",
      kTop: "Top 20 own", sTop: (d) => `of shares outstanding · ${d}`,
      kNet: "Top 20, 6-month change", sNet: (d0, d2) => `net shares, ${d0} → ${d2}`,
      kMix: "Adding vs. trimming", sMix: "of the top 20, over 6 months",
      kAll: "All 13F holders", sAll: (n, d) => `${n} managers · ${d}`, sAllChg: (x) => `holdings ${x} vs. 6 months ago`,
      sNew: "New", sAdd: "Added", sCut: "Trimmed", sOut: "Sold out", sHold: "Steady",
      dropH: "Left the top 20 since", noFile: "no filing",
      none: "No 13F holdings yet.", loading: "Loading holders…", fail: "Holder data is not available yet. It is added by the weekly 13F refresh.",
      note: (f) => `Source: SEC Form 13F data sets, filings through ${f}. 13F covers US institutional managers with over $100M in US-listed equities, reported up to 45 days after each quarter end, so the latest column is a quarter old. It excludes founders, insiders, parent companies, foreign holders not filing 13F and retail investors. Shares are summed across a manager's filing; options are left out. Vanguard's entities are combined, since it split its single 13F filing into several in 2026. "—" means the manager did not file 13F for that quarter.`,
      tip: (q, s) => `${q}: ${s}`,
    },
    zh: {
      nav: "持股", h: "前 20 大股东",
      sub: "根据 13F 申报的前 20 大机构持股人，列出最近三个季末的持股数；变动栏为六个月变化。",
      rank: "#", holder: "持有人", chg: "六个月变动", pct: "变动%", own: "占总股本", status: "状态",
      kTop: "前 20 名合计持有", sTop: (d) => `占已发行股份 · ${d}`,
      kNet: "前 20 名六个月变动", sNet: (d0, d2) => `净持股变化，${d0} → ${d2}`,
      kMix: "增持 / 减持", sMix: "前 20 名中，六个月内",
      kAll: "全部 13F 持有人", sAll: (n, d) => `${n} 家机构 · ${d}`, sAllChg: (x) => `总持股较六个月前 ${x}`,
      sNew: "新进", sAdd: "增持", sCut: "减持", sOut: "清仓", sHold: "持平",
      dropH: "跌出前 20 名（自", noFile: "未申报",
      none: "暂无 13F 持股记录。", loading: "正在载入持股数据…", fail: "持股数据尚未生成，将由每周 13F 更新加入。",
      note: (f) => `来源：美国证交会 Form 13F 数据集，申报截至 ${f}。13F 仅涵盖持有逾 1 亿美元美国上市股票的美国机构投资者，于季末后 45 天内申报，故最新一栏滞后约一个季度。不含创始人、内部人、母公司、无需申报 13F 的外国持有人及散户。同一机构的持股合并计算，不含期权。先锋（Vanguard）于 2026 年将 13F 拆分为多个实体申报，此处合并计算。"—"表示该机构当季未申报 13F。`,
      tip: (q, s) => `${q}：${s}`,
    },
  };
  // stock-specific notes
  const EXTRA = {
    ARM: { en: "SoftBank Group owns about 90% of Arm and does not file 13F, so it is not in this list; these are holders of the US-listed ADSs.", zh: "软银集团持有 Arm 约 90% 股份，且无需申报 13F，故不在此列；本表为美国 ADS 持有人。" },
    TSM: { en: "Covers holders of the NYSE-listed ADRs only (1 ADR = 5 Taiwan shares), not the Taiwan-listed shares.", zh: "仅涵盖纽交所 ADR 持有人（1 ADR = 5 股台股），不含台湾上市股份。" },
    SKHY: { en: "The Nasdaq ADS listed in July 2026, after the latest 13F quarter end, so the first filings with it are due by mid-November 2026.", zh: "纳斯达克 ADS 于 2026 年 7 月上市，晚于最近一个 13F 季末，首批相关申报将于 2026 年 11 月中旬前提交。" },
    SPCX: { en: "SpaceX listed on June 12, 2026, so June 30 is the first quarter end with 13F holdings; there is no earlier quarter to compare yet.", zh: "SpaceX 于 2026 年 6 月 12 日上市，6 月 30 日是首个有 13F 持股的季末，尚无更早季度可比较。" },
    ASML: { en: "Covers US institutional holders that file 13F only; most of ASML's shares are held in Europe through Euronext Amsterdam, so this list is a slice of the register.", zh: "仅涵盖申报 13F 的美国机构；ASML 大部分股份经阿姆斯特丹泛欧交易所由欧洲投资者持有，本表仅为股东名册的一部分。" },
    TSLA: { en: "Elon Musk's personal stake is not in 13F data.", zh: "马斯克个人持股不在 13F 数据中。" },
    SNDK: { en: "Sandisk began trading in February 2025 after its separation from Western Digital.", zh: "闪迪于 2025 年 2 月自西部数据分拆后上市。" },
  };

  const lang = () => (document.documentElement.lang || "en").startsWith("zh") ? "zh" : "en";
  const t = (k) => L[lang()][k];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MON = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };
  const qd = (s) => { const [y, m, d] = s.split("-").map(Number); return lang() === "zh" ? `${y}年${m}月${d}日` : `${MON.en[m - 1]} ${d}, ${y}`; };
  const qs = (s) => { const [y, m, d] = s.split("-").map(Number); return lang() === "zh" ? `${y}/${m}/${d}` : `${MON.en[m - 1]} ${d} '${String(y).slice(2)}`; };
  const num = (v) => {
    if (v == null) return "—";
    const a = Math.abs(v), s = v < 0 ? "−" : "";
    if (a >= 1e9) return s + (a / 1e9).toFixed(a >= 1e10 ? 1 : 2) + "B";
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
    if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + "K";
    return s + Math.round(a);
  };
  const signed = (v) => v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v)).replace("−", "");
  const pct = (v, dp = 1) => v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(dp) + "%";
  const shares = () => { try { return typeof SHARES !== "undefined" && SHARES > 0 ? SHARES : null; } catch (e) { return null; } };

  const st = document.createElement("style");
  st.textContent = `
  #holders .hd-cells{grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:16px}
  #holders table{min-width:720px}
  #holders th,#holders td{white-space:nowrap}
  #holders td.nm{white-space:normal;min-width:180px;max-width:280px;text-align:left;font-weight:500}
  #holders th.nm{text-align:left}
  #holders td.rk{color:var(--muted);width:28px}
  #holders th.q,#holders td.q{color:var(--muted)}
  #holders td.q.last,#holders th.q.last{color:var(--ink);font-weight:600}
  #holders .bars{display:inline-flex;gap:2px;align-items:flex-end;height:18px;vertical-align:middle;margin-right:6px}
  #holders .bars i{display:block;width:5px;border-radius:1px;background:var(--slate);opacity:.55;min-height:1px}
  #holders .bars i:last-child{background:var(--accent);opacity:1}
  #holders .pill{display:inline-block}
  #holders .p-new{background:var(--accent-soft);color:var(--accent)}
  #holders .p-hold{background:color-mix(in srgb,var(--muted) 15%,transparent);color:var(--muted)}
  #holders .drop{margin-top:14px;font-size:13.5px;color:var(--muted);line-height:1.6}
  #holders .drop b{color:var(--ink);font-weight:500}
  #holders .hd-note{font-size:12px;color:var(--muted);margin:12px 0 0;max-width:100ch;line-height:1.55}
  #holders .hd-extra{font-size:13.5px;margin:0 0 14px;padding:10px 12px;border-left:3px solid var(--copper);background:var(--copper-soft);border-radius:0 6px 6px 0;max-width:100ch}
  #holders td.nm,#holders th.nm{position:sticky;left:0;background:var(--panel);z-index:1}
  @media (max-width:640px){#holders td.nm{min-width:128px;max-width:150px;font-size:12.5px}#holders td.rk,#holders th.rk{display:none}}
  `;
  document.head.appendChild(st);

  let D = null, failed = false;

  function status(sh) {
    const [a, , c] = sh;
    if (!a && c > 0) return ["new", t("sNew"), "p-new"];
    if (!c) return ["out", t("sOut"), "p-risk"];
    const ch = (c - a) / a * 100;
    if (ch > 2) return ["add", t("sAdd"), "p-plus"];
    if (ch < -2) return ["cut", t("sCut"), "p-risk"];
    return ["hold", t("sHold"), "p-hold"];
  }

  function navLink() {
    const nav = document.querySelector("nav.sec"); if (!nav) return;
    let a = nav.querySelector('a[href="#holders"]');
    if (!a) {
      a = document.createElement("a"); a.href = "#holders";
      const after = nav.querySelector('a[href="#cashflow"]') || nav.querySelector('a[href="#revenue"]');
      after ? after.after(a) : nav.appendChild(a);
    }
    a.textContent = t("nav");
  }

  function render() {
    navLink();
    const head = `<h2>${t("h")}</h2><p class="sub">${t("sub")}</p>`;
    const tick = (D && D.ticker) || (document.querySelector(".tick")?.textContent.split(":").pop().trim() || "");
    const ex = EXTRA[tick] ? `<p class="hd-extra">${esc(EXTRA[tick][lang()])}</p>` : "";
    if (!D) { host.innerHTML = head + ex + `<div class="panel"><p class="sub" style="margin:0">${failed ? t("fail") : t("loading")}</p></div>`; return; }
    const Q = D.quarters, H = D.holders || [];
    const filed = qd(D.filed_through[D.filed_through.length - 1]);
    if (!H.length) { host.innerHTML = head + ex + `<div class="panel"><p class="sub" style="margin:0">${t("none")}</p><p class="hd-note">${esc(t("note")(filed))}</p></div>`; return; }

    const S = shares();
    const top = H.reduce((s, h) => s + (h.sh[2] || 0), 0);
    const top0 = H.reduce((s, h) => s + (h.sh[0] || 0), 0);
    const anyPrior = H.some((h) => h.sh[0]);
    const adds = H.filter((h) => ["new", "add"].includes(status(h.sh)[0])).length;
    const cuts = H.filter((h) => status(h.sh)[0] === "cut").length;
    const T = D.totals;
    const allChg = T && T.sh[0] ? (T.sh[2] / T.sh[0] - 1) * 100 : null;

    const cells = `
      <div class="cells hd-cells">
        <div class="cell"><div class="k">${t("kTop")}</div><div class="v">${S ? (top / S * 100).toFixed(1) + "%" : num(top)}</div><div class="s">${S ? num(top) + " · " : ""}${t("sTop")(qd(Q[2]))}</div></div>
        <div class="cell"><div class="k">${t("kNet")}</div><div class="v ${top - top0 >= 0 ? "up" : "down"}">${anyPrior ? pct((top / top0 - 1) * 100) : "—"}</div><div class="s">${anyPrior ? signed(top - top0) + " · " : ""}${t("sNet")(qs(Q[0]), qs(Q[2]))}</div></div>
        <div class="cell"><div class="k">${t("kMix")}</div><div class="v"><span class="up">${adds}</span> / <span class="down">${cuts}</span></div><div class="s">${t("sMix")}</div></div>
        <div class="cell"><div class="k">${t("kAll")}</div><div class="v">${T ? num(T.sh[2]) : "—"}</div><div class="s">${T ? t("sAll")(T.filers[2].toLocaleString("en-US"), qs(Q[2])) : ""}${allChg != null ? " · " + t("sAllChg")(pct(allChg)) : ""}</div></div>
      </div>`;

    const max = Math.max(...H.flatMap((h) => h.sh.filter((x) => x != null)), 1);
    const rows = H.map((h, i) => {
      const [a, b, c] = h.sh, [, lab, cls] = status(h.sh);
      const d = a ? c - a : (c || 0);
      const p = a ? (c / a - 1) * 100 : null;
      const bars = h.sh.map((x, j) => `<i style="height:${x ? Math.max(1, Math.round(x / max * 18)) : 1}px" title="${esc(t("tip")(qs(Q[j]), x == null ? t("noFile") : x.toLocaleString("en-US")))}"></i>`).join("");
      return `<tr>
        <td class="rk">${i + 1}</td>
        <td class="nm">${esc(h.name)}</td>
        <td class="q" title="${a == null ? t("noFile") : (a || 0).toLocaleString("en-US")}">${num(a)}</td>
        <td class="q" title="${b == null ? t("noFile") : (b || 0).toLocaleString("en-US")}">${num(b)}</td>
        <td class="q last" title="${(c || 0).toLocaleString("en-US")}">${num(c)}</td>
        <td>${S ? (c / S * 100).toFixed(2) + "%" : "—"}</td>
        <td class="${d > 0 ? "up" : d < 0 ? "down" : ""}"><span class="bars" aria-hidden="true">${bars}</span>${signed(d)}</td>
        <td class="${p > 0 ? "up" : p < 0 ? "down" : ""}">${p == null ? "—" : pct(p)}</td>
        <td><span class="pill ${cls}">${lab}</span></td>
      </tr>`;
    }).join("");

    const drop = (D.dropped || []).length ? `<p class="drop">${t("dropH")} ${qd(Q[0])}${lang() === "zh" ? "）" : ""}: ` +
      D.dropped.map((h) => `<b>${esc(h.name)}</b> ${num(h.sh[0])} → ${h.sh[2] == null ? t("noFile") : num(h.sh[2])}`).join(" · ") + `</p>` : "";

    host.innerHTML = head + ex + cells + `
      <div class="panel tbl">
        <table>
          <thead><tr>
            <th class="rk">${t("rank")}</th><th class="nm">${t("holder")}</th>
            <th class="q">${qs(Q[0])}</th><th class="q">${qs(Q[1])}</th><th class="q last">${qs(Q[2])}</th>
            <th>${t("own")}</th><th>${t("chg")}</th><th>${t("pct")}</th><th>${t("status")}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>${drop}
      <p class="hd-note">${esc(t("note")(filed))}</p>`;
  }

  render();
  fetch("holders.json?t=" + Math.floor(Date.now() / 3600e3), { cache: "no-store" })
    .then((r) => r.ok ? r.json() : Promise.reject())
    .then((j) => { D = j; render(); })
    .catch(() => { failed = true; render(); });
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
