/* "Previous session" macro recap at the top of the Macro tab.
   Narrative lives in data/macro-recap.json (rewritten by Claude after each New York close,
   scheduled task "Stock dashboard: daily macro recap"). The closing levels and day/week
   changes are computed here from the same daily bars the page's chart uses (data/macro.json),
   so the numbers always match the tiles and charts. */
(function () {
  const box = document.getElementById("mrecap");
  if (!box) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const get = (u) => fetch(u + "?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const GROUPS = [["cmd", "Commodities"], ["us", "US Treasuries"], ["de", "German Bunds"], ["fr", "French OATs"]];
  const ORDER = ["oil", "gold", "silver", "us2y", "us5y", "us10y", "us30y", "de2y", "de5y", "de10y", "de30y", "fr2y", "fr5y", "fr10y", "fr30y"];
  const shift = (iso, days) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); };
  const lastLE = (d, x) => { for (let i = d.length - 1; i >= 0; i--) if (d[i] <= x) return i; return -1; };

  Promise.all([get(box.dataset.src || "../data/macro-recap.json"), get(box.dataset.macro || "../data/macro.json")]).then(([r, m]) => {
    if (!r) return;
    const by = Object.fromEntries(((m && m.items) || []).map((x) => [x.k, x]));
    const notes = r.rows || {};
    const fmtChg = (it, a, b) => {
      if (a == null || b == null) return `<span class="mr-c">—</span>`;
      if (it.kind === "yield") { const bp = Math.round((a - b) * 100); return `<span class="mr-c">${bp > 0 ? "+" : bp < 0 ? "−" : "±"}${Math.abs(bp)}bp</span>`; }
      const p = (a / b - 1) * 100, up = p >= 0;
      return `<span class="mr-c ${up ? "up" : "down"}">${up ? "+" : "−"}${Math.abs(p).toFixed(1)}%</span>`;
    };
    let rows = "";
    for (const [g, gName] of GROUPS) {
      const grpOf = (k) => (by[k] && by[k].grp) || (["oil", "gold", "silver"].includes(k) ? "cmd" : k.slice(0, 2));
      const ks = ORDER.filter((k) => grpOf(k) === g && notes[k]);
      if (!ks.length) continue;
      rows += `<div class="mr-g">${gName}</div>`;
      for (const k of ks) {
        const it = by[k], h = it && it.hist && it.hist.d ? it.hist : null;
        let close = null, day = null, wk = null;
        if (h) {
          const i = lastLE(h.d, r.session), j = lastLE(h.d, shift(r.session, -7));
          if (i >= 0) { close = h.c[i]; if (i > 0) day = h.c[i - 1]; if (j >= 0 && j < i) wk = h.c[j]; }
        }
        const lvl = close == null ? "—" : it.kind === "yield" ? close.toFixed(2) + "%" : "$" + close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const name = it ? (it.kind === "yield" ? it.short.replace(/ yield$/, "") : it.short) : k;
        rows += `<div class="mr-r"><span class="mr-n">${esc(name)}</span><span class="mr-v">${lvl}</span>` +
          `${it ? fmtChg(it, close, day) : "<span class=mr-c>—</span>"}${it ? fmtChg(it, close, wk) : "<span class=mr-c>—</span>"}` +
          `<span class="mr-t">${esc(notes[k])}</span></div>`;
      }
    }
    const drivers = (r.drivers || []).map(([h, t]) => `<li><b>${esc(h)}.</b> ${esc(t)}</li>`).join("");
    const src = (r.sources || []).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join(" · ");
    box.innerHTML =
      `<div class="eyebrow">Previous New York session · ${esc(r.asof)}</div>` +
      `<h2>${esc(r.headline)}</h2>` +
      `<p class="mr-sum">${esc(r.summary)}</p>` +
      `<ul class="mr-dr">${drivers}</ul>` +
      `<div class="mr-tbl" role="table" aria-label="Closing levels"><div class="mr-r mr-h"><span>Instrument</span><span>Close</span><span>Day</span><span>Week</span><span>Read</span></div>${rows}</div>` +
      (r.watch ? `<p class="mr-note">${esc(r.watch)}</p>` : "") +
      `<p class="mr-src">Summary by Claude after the New York close. Levels and changes are from this page's daily closes (European yields close at their own session's end); commentary from: ${src}. Not advice.</p>`;
    box.hidden = false;
  });
})();
