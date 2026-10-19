/* Latest news section, shared by the main page and every stock page.
   Markup: <section id="news" data-src="data/news.json" data-tickers="ARM,TSLA,SNDK,INTC"></section>
   With more than one ticker it shows filter chips. Headlines come from data/news.json,
   rebuilt by scripts/fetch-news.mjs in the GitHub Action. Re-renders on page language change. */
(function () {
  const host = document.getElementById("news");
  if (!host) return;
  const SRC = host.dataset.src, TICKERS = host.dataset.tickers.split(","), MULTI = TICKERS.length > 1;
  const PAGE = 30;
  const L = {
    en: { h: "Latest news", sub: "Headlines from the last 30 days, newest first. Refreshed about every hour.", all: "All",
          upd: "Updated", more: "Show more", none: "No headlines in the last 30 days yet. The list fills in after the next refresh.",
          fail: "News could not be loaded right now.", today: "Today", yday: "Yesterday", note: "Headlines link to the original publishers via Google News and Yahoo Finance. Headlines are in English." },
    zh: { h: "最新新闻", sub: "近30天新闻标题，最新在前。约每小时刷新。", all: "全部",
          upd: "更新于", more: "显示更多", none: "近30天暂无新闻，下次刷新后会显示。",
          fail: "暂时无法载入新闻。", today: "今天", yday: "昨天", note: "标题经 Google News 与 Yahoo Finance 链接至原始媒体，标题为英文。" }
  };
  const zh = () => (typeof lang !== "undefined" && lang === "zh");
  if (host.dataset.h) L.en.h = host.dataset.h;
  if (host.dataset.sub) L.en.sub = host.dataset.sub;
  const t = (k) => L[zh() ? "zh" : "en"][k];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TZ = "Asia/Singapore";
  const dayKey = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
  const hm = (ms) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

  const st = document.createElement("style");
  st.textContent = `
  #news .nchips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}
  #news .nchips button{font:500 12px var(--f-mono);border:1px solid var(--line);background:var(--panel);color:var(--muted);padding:4px 10px;border-radius:4px;cursor:pointer}
  #news .nchips button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
  #news .nchips button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  #news .nlist{background:var(--panel);border:1px solid var(--line);border-radius:6px;overflow:hidden}
  #news .nday{font:600 11px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:10px 16px 6px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--bg) 60%,var(--panel))}
  #news .nday:first-child{border-top:0}
  #news .nrow{display:grid;grid-template-columns:44px auto minmax(0,1fr);gap:10px;align-items:baseline;padding:9px 16px;border-top:1px solid var(--line)}
  #news .nday+.nrow{border-top:0}
  #news .ntime{font:500 12px var(--f-mono);color:var(--muted);font-variant-numeric:tabular-nums}
  #news .ntk{font:600 10.5px var(--f-mono);letter-spacing:.04em;background:var(--ink);color:var(--bg);padding:2px 6px;border-radius:3px}
  #news .nrow a{color:var(--ink);text-decoration:none;font-size:14px;line-height:1.4}
  #news .nrow a:hover,#news .nrow a:focus-visible{color:var(--accent);text-decoration:underline}
  #news .nsrc{display:block;font-size:12px;color:var(--muted);margin-top:2px}
  #news .nmore{margin-top:12px;font:500 12px var(--f-mono);border:1px solid var(--line);background:var(--panel);color:var(--ink);padding:6px 12px;border-radius:4px;cursor:pointer}
  #news .nnote{font-size:12px;color:var(--muted);margin:10px 0 0}
  @media (max-width:620px){#news .nrow{grid-template-columns:40px minmax(0,1fr)} #news .ntk{display:none} #news.multi .ntk{display:inline-block;grid-column:2;justify-self:start} #news.multi .nrow>div{grid-column:2}}
  `;
  document.head.appendChild(st);
  if (MULTI) host.classList.add("multi");

  let data = null, err = false, filter = "ALL", shown = PAGE;
  try { filter = (MULTI && localStorage.getItem("news-filter")) || "ALL"; } catch (e) {}
  if (filter !== "ALL" && !TICKERS.includes(filter)) filter = "ALL"; // saved on another page with different chips
  if (!MULTI) filter = TICKERS[0];
  if (filter !== "ALL" && !TICKERS.includes(filter)) filter = "ALL";

  function render() {
    const items = data ? data.items.filter((x) => TICKERS.includes(x.t) && (filter === "ALL" || x.t === filter)) : [];
    const today = dayKey(Date.now()), yday = dayKey(Date.now() - 864e5);
    let rows = "", lastDay = "";
    items.slice(0, shown).forEach((x) => {
      const d = dayKey(x.ts);
      if (d !== lastDay) {
        lastDay = d;
        const label = d === today ? t("today") : d === yday ? t("yday")
          : new Date(x.ts).toLocaleDateString(zh() ? "zh-CN" : "en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
        rows += `<div class="nday">${label}</div>`;
      }
      rows += `<div class="nrow"><span class="ntime">${hm(x.ts)}</span><span class="ntk">${esc(x.t)}</span><div><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a><span class="nsrc">${esc(x.src || "")}</span></div></div>`;
    });
    const upd = data && data.updated ? `${t("upd")} ${new Date(data.updated * 1000).toLocaleString(zh() ? "zh-CN" : "en-SG", { timeZone: TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} SGT` : "";
    host.innerHTML = `
      <h2>${t("h")}</h2>
      <p class="sub">${t("sub")}${upd ? " " + upd + "." : ""}</p>
      ${MULTI ? `<div class="nchips" role="group" aria-label="Filter headlines">${["ALL", ...TICKERS].map((k) => {
          const n = data ? data.items.filter((x) => k === "ALL" ? TICKERS.includes(x.t) : x.t === k).length : 0;
          return `<button type="button" data-k="${k}" aria-pressed="${k === filter}">${k === "ALL" ? t("all") : k} · ${n}</button>`; }).join("")}</div>` : ""}
      ${err ? `<p class="sub">${t("fail")}</p>` : items.length ? `<div class="nlist">${rows}</div>` : `<p class="sub">${data ? t("none") : "…"}</p>`}
      ${items.length > shown ? `<button type="button" class="nmore">${t("more")} (${items.length - shown})</button>` : ""}
      <p class="nnote">${t("note")}</p>`;
    host.querySelectorAll(".nchips button").forEach((b) => b.onclick = () => {
      filter = b.dataset.k; shown = PAGE; try { localStorage.setItem("news-filter", filter); } catch (e) {} render(); });
    const m = host.querySelector(".nmore"); if (m) m.onclick = () => { shown += PAGE; render(); };
  }

  async function load() {
    try {
      const r = await fetch(SRC + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(); j.items.sort((a, b) => b.ts - a.ts);
      const changed = !data || j.updated !== data.updated; data = j; err = false;
      if (changed) render();
    } catch (e) { if (!data) { err = true; render(); } }
  }

  // follow the page's language switch
  if (typeof setLang === "function") { const o = setLang; setLang = function () { o.apply(this, arguments); render(); }; }
  render(); load(); setInterval(load, 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
