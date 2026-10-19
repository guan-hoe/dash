/* Extended-hours price for stock pages: pre-market, after-hours and the overnight (24-hour) session.
   Reads data/quote.json "ext" ({session, price, time, chg, source}), written by scripts/fetch-quote.mjs
   when the regular session is closed and a newer trade exists. Shows a line under the big price and a
   chip in the top bar; hidden during regular hours or when the extended price is older than 20 hours.
   Polls every minute (the deploy workflow refreshes quote.json about every 10-15 minutes). */
(function () {
  const box = document.getElementById("pxChg"), bar = document.getElementById("barChg");
  if (!box) return;
  const L = {
    en: { pre: "Pre-market", post: "After-hours", overnight: "Overnight (24h)", vs: "vs last close", at: "SGT" },
    zh: { pre: "盘前", post: "盘后", overnight: "夜盘（24小时）", vs: "较最近收盘", at: "新加坡时间" },
  };
  const st = document.createElement("style");
  st.textContent = `
  .ext-line{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin-top:8px;padding:6px 8px;border:1px solid var(--line);border-radius:4px;font:500 12px var(--f-mono);font-variant-numeric:tabular-nums}
  .ext-line b{font:600 10px var(--f-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .ext-line .px{font:600 15px var(--f-mono)}
  .ext-line small{font-size:10.5px;color:var(--muted)}
  .ext-chip{margin-left:8px;font:500 12px var(--f-mono);color:var(--muted);white-space:nowrap}
  @media (max-width:560px){.ext-chip{display:none}}`;
  document.head.appendChild(st);

  const line = document.createElement("div");
  line.className = "ext-line"; line.hidden = true;
  box.insertAdjacentElement("afterend", line);
  let chip = null;
  if (bar) { chip = document.createElement("span"); chip.className = "ext-chip"; chip.hidden = true; bar.insertAdjacentElement("afterend", chip); }

  let Q = null;
  const zh = () => (document.documentElement.lang || "").startsWith("zh");
  const sg = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2) + "%";
  const money = (x) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function render() {
    const e = Q && Q.ext, fresh = e && Date.now() / 1000 - e.time < 72000 && Q.state !== "REGULAR";
    line.hidden = !fresh; if (chip) chip.hidden = !fresh;
    if (!fresh) return;
    const t = L[zh() ? "zh" : "en"], cls = e.chg >= 0 ? "up" : "down";
    const when = new Date(e.time * 1000).toLocaleString(zh() ? "zh-CN" : "en-SG", { timeZone: "Asia/Singapore", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    line.innerHTML = `<b>${t[e.session] || e.session}</b><span class="px">${money(e.price)}</span><span class="${cls}">${sg(e.chg)}</span><small>${t.vs} · ${when} ${t.at}</small>`;
    line.title = "Source: " + (e.source || "");
    if (chip) chip.innerHTML = `${t[e.session] || e.session} <span class="${cls}">${money(e.price)} ${sg(e.chg)}</span>`;
  }
  async function load() {
    try { const r = await fetch("data/quote.json?t=" + Date.now(), { cache: "no-store" }); if (r.ok) { Q = await r.json(); render(); } } catch (e) {}
  }
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  load(); setInterval(load, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
