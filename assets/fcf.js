/* Free cash flow section, shared by every stock page.
   Each page defines window.FCF (data + text) and an empty <section id="cashflow">.
   Reads the page's global `lang` and CSS tokens; re-renders when the page rebuilds its charts
   (language or theme change). */
(function () {
  const D = window.FCF;
  const host = document.getElementById("cashflow");
  if (!D || !host) return;

  const L = {
    en: {
      h: "Free cash flow, by quarter",
      legOcf: "Operating cash flow", legCap: "Capital spending", legFcf: "Free cash flow", legEst: "Shaded = estimate",
      kTtm: "FCF, last 4 quarters", kLast: "Latest quarter", kNext: "Next 4 quarters", sNext: "my estimate",
      tQ: "Quarter", tEnd: "Ended", tOcf: "Operating CF", tCap: "Capex", tFcf: "Free cash flow", tTtm: "FCF, trailing 4Q",
      est: "est.", hOut: "Where cash is going", hIn: "Where cash is coming from", hBridge: "Cash bridge, next 4 quarters (estimate)",
      pOut: "Outflow", pIn: "Inflow", bItem: "Item", bAmt: "US$M",
      hRead: "What it means", srcH: "Sources for this section",
      method: "Historical figures: operating cash flow and purchases of property and equipment from company filings, as compiled by Stock Analysis. Estimates are mine, built from company guidance and recent run rates; they are not company forecasts."
    },
    zh: {
      h: "自由现金流（按季度）",
      legOcf: "经营现金流", legCap: "资本开支", legFcf: "自由现金流", legEst: "浅色 = 估算",
      kTtm: "近4季自由现金流", kLast: "最新一季", kNext: "未来4季", sNext: "本人估算",
      tQ: "季度", tEnd: "截至", tOcf: "经营现金流", tCap: "资本开支", tFcf: "自由现金流", tTtm: "近4季合计",
      est: "估", hOut: "现金流向哪里", hIn: "现金从哪里来", hBridge: "未来4季现金桥（估算）",
      pOut: "流出", pIn: "流入", bItem: "项目", bAmt: "百万美元",
      hRead: "解读", srcH: "本节来源",
      method: "历史数据：经营现金流及购置物业与设备支出，取自公司财报，经 Stock Analysis 整理。估算为本人根据公司指引与近期水平推算，并非公司预测。"
    }
  };

  const zh = () => (typeof lang !== "undefined" && lang === "zh");
  const t = k => L[zh() ? "zh" : "en"][k];
  const tx = o => (o && typeof o === "object") ? (zh() ? (o.zh ?? o.en) : o.en) : o;
  const m = v => { const r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); };
  const b = v => v === 0 ? "$0" : (v < 0 ? "−$" : "$") + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(Math.abs(v) >= 10000 ? 1 : 2) + "B" : Math.round(Math.abs(v)) + "M");
  const cls = v => v < 0 ? "down" : "up";

  // rows: [label, ended, ocf, capex, fcf, isEst]
  const rows = D.hist.map(r => [...r, false]).concat(D.est.map(r => [...r, true]));
  rows.forEach((r, i) => { r.ttm = !D.noTtm && i >= 3 ? rows.slice(i - 3, i + 1).reduce((s, x) => s + x[4], 0) : null; });
  const H = rows.filter(r => !r[5]);
  const lastH = H[H.length - 1];
  const ttm = lastH.ttm;
  const next4 = D.est.slice(0, 4).reduce((s, r) => s + r[4], 0);

  let chart = null;
  const st = document.createElement("style");
  st.textContent = ".fcf-2{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.fcf-t{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)}@media (max-width:860px){.fcf-2,.fcf-t{grid-template-columns:minmax(0,1fr)}}";
  document.head.appendChild(st);

  function render() {
    const bridgeEnd = D.bridge.reduce((s, r) => s + r[1], 0);
    host.innerHTML = `
    <h2>${t("h")}</h2>
    <p class="sub">${tx(D.sub)}</p>
    <div class="grid">
      <div class="panel">
        <div class="legend">
          <span><i class="sw" style="background:var(--accent)"></i>${t("legOcf")}</span>
          <span><i class="sw" style="background:var(--copper)"></i>${t("legCap")}</span>
          <span><i class="sw" style="background:var(--ink);height:3px;vertical-align:3px"></i>${t("legFcf")}</span>
          <span><i class="sw" style="background:var(--line)"></i>${t("legEst")}</span>
        </div>
        <div class="chart"><canvas id="cFcf" aria-label="${t("h")}"></canvas></div>
      </div>
      <div class="cells">
        ${D.ttmCell ? `<div class="cell"><div class="k">${tx(D.ttmCell.k)}</div><div class="v ${cls(D.ttmCell.v)}">${b(D.ttmCell.v)}</div><div class="s">${tx(D.ttmCell.s)}</div></div>`
          : `<div class="cell"><div class="k">${t("kTtm")}</div><div class="v ${cls(ttm)}">${b(ttm)}</div><div class="s">${zh() ? "截至 " + lastH[0] : "4 quarters to " + lastH[0]}</div></div>`}
        <div class="cell"><div class="k">${t("kLast")}</div><div class="v ${cls(lastH[4])}">${b(lastH[4])}</div><div class="s">${lastH[0]} · ${lastH[1]}</div></div>
        <div class="cell"><div class="k">${t("kNext")}</div><div class="v ${cls(next4)}">${b(next4)}</div><div class="s">${t("sNext")} · ${D.est[0][0]}–${D.est[3][0]}</div></div>
        <div class="cell"><div class="k">${tx(D.cash.k)}</div><div class="v">${D.cash.v}</div><div class="s">${tx(D.cash.s)}</div></div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;border-left:3px solid var(--accent)">
      <h3 style="font:600 15px var(--f-body);margin:0 0 6px">${t("hRead")}</h3>
      ${D.read.map(p => `<p style="margin:0 0 8px;font-size:14px">${tx(p)}</p>`).join("")}
    </div>

    <div class="grid fcf-2" style="margin-top:16px">
      <div>
        <h3 style="font:600 15px var(--f-body);margin:0 0 8px">${t("hOut")}</h3>
        <div style="display:grid;gap:10px">${D.out.map(o => `<div class="item"><span class="pill p-risk">${t("pOut")}</span><div><h3>${tx(o.h)}</h3><p>${tx(o.p)}</p></div></div>`).join("")}</div>
      </div>
      <div>
        <h3 style="font:600 15px var(--f-body);margin:0 0 8px">${t("hIn")}</h3>
        <div style="display:grid;gap:10px">${D.in.map(o => `<div class="item"><span class="pill p-plus">${t("pIn")}</span><div><h3>${tx(o.h)}</h3><p>${tx(o.p)}</p></div></div>`).join("")}</div>
      </div>
    </div>

    <div class="grid fcf-t" style="margin-top:16px">
      <div class="panel tbl">
        <table>
          <thead><tr><th>${t("tQ")}</th><th>${t("tEnd")}</th><th>${t("tOcf")}</th><th>${t("tCap")}</th><th>${t("tFcf")}</th><th>${t("tTtm")}</th></tr></thead>
          <tbody>${rows.slice().reverse().map(r => `<tr${r[5] ? ' class="guide"' : ""}><td>${r[0]}${r[5] ? " (" + t("est") + ")" : ""}</td><td>${r[1]}</td><td>${m(r[2])}</td><td>${m(-r[3])}</td><td><b class="${r[5] ? "" : cls(r[4])}">${m(r[4])}</b></td><td>${r.ttm == null ? "—" : m(r.ttm)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="panel tbl">
        <h3 style="font:600 15px var(--f-body);margin:0 0 6px">${t("hBridge")}</h3>
        <table>
          <thead><tr><th>${t("bItem")}</th><th>${t("bAmt")}</th></tr></thead>
          <tbody>
            ${D.bridge.map((r, i) => `<tr><td>${tx(r[0])}</td><td>${i === 0 ? m(r[1]) : (r[1] >= 0 ? "+" : "") + m(r[1])}</td></tr>`).join("")}
            <tr><td><b>${tx(D.bridgeEnd)}</b></td><td><b>${m(bridgeEnd)}</b></td></tr>
          </tbody>
        </table>
        <p class="s" style="font-size:12px;color:var(--muted);margin:8px 0 0">${tx(D.bridgeNote)}</p>
      </div>
    </div>

    <p style="font-size:12px;color:var(--muted);margin:14px 0 4px">${t("method")} ${tx(D.extraNote) || ""}</p>
    <p style="font-size:12px;color:var(--muted);margin:0">${t("srcH")}: ${D.src.map(s => `<a href="${s[1]}" target="_blank" rel="noopener">${s[0]}</a>`).join(" · ")}</p>`;
    drawChart();
  }

  function drawChart() {
    if (!window.Chart) return;
    if (chart) chart.destroy();
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const acc = css("--accent"), cop = css("--copper"), ink = css("--ink"), mut = css("--muted"), line = css("--line");
    const fade = (c, i) => rows[i][5] ? c + "55" : c;
    const n = rows.length, nh = H.length;
    chart = new Chart(document.getElementById("cFcf"), {
      type: "bar",
      data: {
        labels: rows.map(r => r[0]),
        datasets: [
          { type: "line", label: t("legFcf"), data: rows.map(r => r[4]), borderColor: ink, backgroundColor: ink, borderWidth: 2, pointRadius: 2.5, tension: .15, order: 0,
            segment: { borderDash: c => c.p1DataIndex >= nh ? [5, 4] : undefined } },
          { label: t("legOcf"), data: rows.map(r => r[2]), backgroundColor: rows.map((_, i) => fade(acc, i)), borderRadius: 2, order: 1 },
          { label: t("legCap"), data: rows.map(r => -r[3]), backgroundColor: rows.map((_, i) => fade(cop, i)), borderRadius: 2, order: 2 }
        ]
      },
      options: {
        maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false },
          tooltip: { callbacks: {
            title: it => rows[it[0].dataIndex][0] + (rows[it[0].dataIndex][5] ? " (" + t("est") + ")" : "") + " · " + rows[it[0].dataIndex][1],
            label: c => `${c.dataset.label}: ${b(c.parsed.y)}` } } },
        scales: {
          x: { border: { display: false }, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, color: mut } },
          y: { border: { display: false }, grid: { color: c => c.tick.value === 0 ? mut : line, drawTicks: false }, ticks: { color: mut, callback: v => b(v) } }
        }
      }
    });
  }

  // Re-render with the page whenever it rebuilds charts (language or theme switch).
  if (typeof buildCharts === "function") {
    const orig = buildCharts;
    buildCharts = function () { orig.apply(this, arguments); if (zh() !== shownZh) render(); else drawChart(); };
  }
  let shownZh = null;
  const _render = render;
  render = function () { shownZh = zh(); _render(); };
  render();
})();
