/* "Previous session" FX recap and calls at the top of the FX tab.
   Narrative and calls live in data/fx-recap.json (rewritten by Claude after each New York close,
   scheduled task "Stock dashboard: daily FX recap"). Each pair's close and day/week change are
   computed here from the same daily bars the page's tiles and chart use (data/fx.json), so the
   numbers always match the rest of the page. A pair the JSON has no row for is left out. */
(function () {
  const box = document.getElementById("fxrecap");
  if (!box) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const get = (u) => fetch(u + "?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const GROUPS = [["Majors", "Majors"], ["Asia", "Asia"], ["Crosses", "Crosses"]];
  const ORDER = ["eurusd", "gbpusd", "audusd", "usdjpy", "usdchf", "usdcad", "usdcnh", "usdhkd", "usdsgd", "usdkrw", "usdidr", "usdinr", "eurjpy", "cnhjpy"];
  const NAMES = { eurusd: "EUR/USD", gbpusd: "GBP/USD", audusd: "AUD/USD", usdjpy: "USD/JPY", usdchf: "USD/CHF", usdcad: "USD/CAD", usdcnh: "USD/CNH", usdhkd: "USD/HKD",
    usdsgd: "USD/SGD", usdkrw: "USD/KRW", usdidr: "USD/IDR", usdinr: "USD/INR", eurjpy: "EUR/JPY", cnhjpy: "CNH/JPY" };
  const GRP = { eurusd: "Majors", gbpusd: "Majors", audusd: "Majors", usdjpy: "Majors", usdchf: "Majors", usdcad: "Majors", eurjpy: "Crosses", cnhjpy: "Crosses" };
  const DIR = { up: ["▲", "Higher"], down: ["▼", "Lower"], range: ["◆", "Range"] };
  const shift = (iso, days) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); };
  const lastLE = (d, x) => { for (let i = d.length - 1; i >= 0; i--) if (d[i] <= x) return i; return -1; };

  Promise.all([get(box.dataset.src || "../data/fx-recap.json"), get(box.dataset.fx || "../data/fx.json")]).then(([r, m]) => {
    if (!r) return;
    const by = Object.fromEntries(((m && m.items) || []).map((x) => [x.k, x]));
    const rows = r.rows || {};
    const dpOf = (k) => (by[k] && by[k].dp != null ? by[k].dp : 4);
    const num = (k, v) => v == null ? "—" : (+v).toLocaleString("en-US", { minimumFractionDigits: dpOf(k), maximumFractionDigits: dpOf(k) });
    // call levels: whole numbers stay whole for the won/rupiah-style pairs (1,345 not 1,345.00)
    const lvl = (k, v) => { const d = Number.isInteger(+v) && dpOf(k) <= 2 ? 0 : dpOf(k); return (+v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
    const chg = (a, b) => {
      if (a == null || b == null) return `<span class="fr-c">—</span>`;
      const p = (a / b - 1) * 100;
      return `<span class="fr-c">${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p).toFixed(2)}%</span>`;
    };
    const call = (k, v) => {
      if (!v) return "";
      const [ic, lab] = DIR[v.dir] || DIR.range;
      const lv = [v.target != null ? `target <b>${lvl(k, v.target)}</b>` : "", v.stop != null ? `wrong ${v.dir === "down" ? "above" : v.dir === "up" ? "below" : "outside"} <b>${lvl(k, v.stop)}</b>` : ""].filter(Boolean).join(" · ");
      return `<div class="fr-v"><span class="fr-d fr-${esc(v.dir)}">${ic} ${lab}</span>${v.call ? ` <span class="fr-call">${esc(v.call)}</span>` : ""}${lv ? ` <span class="fr-lv">${lv}</span>` : ""}</div>`;
    };
    let tbl = "";
    for (const [g, gName] of GROUPS) {
      const ks = ORDER.filter((k) => ((by[k] && by[k].g) || GRP[k] || "Asia") === g && rows[k]);
      if (!ks.length) continue;
      tbl += `<div class="fr-g">${gName}</div>`;
      for (const k of ks) {
        const it = by[k], h = it && it.hist && it.hist.d ? it.hist : null, row = rows[k];
        let close = null, day = null, wk = null;
        if (h) {
          const i = lastLE(h.d, r.session), j = lastLE(h.d, shift(r.session, -7));
          if (i >= 0) { close = h.c[i]; if (i > 0) day = h.c[i - 1]; if (j >= 0 && j < i) wk = h.c[j]; }
        }
        const note = typeof row === "string" ? row : row.note;
        tbl += `<div class="fr-r"><span class="fr-n">${esc((it && it.short) || NAMES[k] || k)}</span><span class="fr-p">${num(k, close)}</span>${chg(close, day)}${chg(close, wk)}` +
          `<div class="fr-t">${esc(note)}${call(k, row.view)}</div></div>`;
      }
    }
    const drivers = (r.drivers || []).map(([h, t]) => `<li><b>${esc(h)}.</b> ${esc(t)}</li>`).join("");
    const ideas = (r.ideas || []).map(([k, t]) => {
      const v = rows[k] && rows[k].view, [ic, lab] = v ? DIR[v.dir] || DIR.range : ["", ""];
      return `<li><span class="fr-in">${esc(NAMES[k] || k)}</span>${v ? `<span class="fr-d fr-${esc(v.dir)}">${ic} ${lab}</span>` : ""}<span>${esc(t)}</span></li>`;
    }).join("");
    const n = ORDER.filter((k) => rows[k]).length;
    let open = false; try { open = localStorage.getItem("fxrecap-open") === "1"; } catch (e) {}
    const src = (r.sources || []).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join(" · ");
    box.innerHTML =
      `<div class="eyebrow">Previous New York session · ${esc(r.asof)}</div>` +
      `<h2>${esc(r.headline)}</h2>` +
      `<p class="fr-sum">${esc(r.summary)}</p>` +
      `<ul class="fr-dr">${drivers}</ul>` +
      (r.view || ideas ? `<div class="fr-box">${r.view ? `<p class="fr-view"><b>${esc(r.view[0])}</b> ${esc(r.view[1])}</p>` : ""}${ideas ? `<div class="fr-bh">Highest-conviction calls</div><ol class="fr-ideas">${ideas}</ol>` : ""}${r.review ? `<p class="fr-rev"><b>How the last calls did:</b> ${esc(r.review)}</p>` : ""}</div>` : "") +
      `<details class="fr-all"${open ? " open" : ""}><summary>All ${n} pairs: close, day and week moves, what happened and my call (${esc(r.horizon || "1–2 weeks")})</summary>` +
      `<div class="fr-tbl" role="table" aria-label="Closing levels and calls"><div class="fr-r fr-h"><span>Pair</span><span>Close</span><span>Day</span><span>Week</span><span>What happened · the call</span></div>${tbl}</div></details>` +
      (r.watch ? `<p class="fr-note">${esc(r.watch)}</p>` : "") +
      `<p class="fr-src">Summary and calls by Claude after the New York close. Closes and changes are from this page's daily bars (the FX day ends at 5pm New York); a rise means the first currency gained. Sources: ${src}. A market view, not financial advice.</p>`;
    box.hidden = false;
    const det = box.querySelector(".fr-all");
    if (det) det.addEventListener("toggle", () => { try { localStorage.setItem("fxrecap-open", det.open ? "1" : "0"); } catch (e) {} });
  });
})();
