/* "Previous session" recap on the main page, just above the bullish ranking.
   Content lives in data/market-recap.json and is rewritten by Claude after each US close
   (scheduled task "Stock dashboard: daily market recap").
   stats rows: [label, value, % change (number) or text, invert colours (true for VIX)]. */
(function () {
  const box = document.getElementById("recap");
  if (!box) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  fetch((box.dataset.src || "data/market-recap.json") + "?t=" + Date.now(), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return;
      const chg = (v, inv) => {
        if (typeof v === "string") return `<span class="rc-c">${esc(v)}</span>`;
        const up = v >= 0, good = inv ? !up : up;
        return `<span class="rc-c ${good ? "up" : "down"}">${up ? "+" : "−"}${Math.abs(v).toFixed(2)}%</span>`;
      };
      const stats = (d.stats || []).map(([n, v, c, inv]) =>
        `<div class="rc-s"><span class="rc-n">${esc(n)}</span><span class="rc-v">${esc(v)}</span>${chg(c, inv)}</div>`).join("");
      const drivers = (d.drivers || []).map(([h, t]) => `<li><b>${esc(h)}.</b> ${esc(t)}</li>`).join("");
      const src = (d.sources || []).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join(" · ");
      box.className = "recap t-" + (d.tone === "up" ? "up" : d.tone === "mixed" ? "mixed" : "down");
      box.innerHTML =
        `<div class="eyebrow">Previous US session · ${esc(d.asof)}</div>` +
        `<h2>${esc(d.headline)}</h2>` +
        `<p class="rc-sum">${esc(d.summary)}</p>` +
        `<div class="rc-stats">${stats}</div>` +
        `<ul class="rc-dr">${drivers}</ul>` +
        (d.week ? `<p class="rc-note">${esc(d.week)}</p>` : "") +
        (d.watch ? `<p class="rc-note">${esc(d.watch)}</p>` : "") +
        `<p class="rc-src">Summary by Claude after the close, from market coverage: ${src}. Not advice.</p>`;
      box.hidden = false;
    })
    .catch(() => {});
})();
