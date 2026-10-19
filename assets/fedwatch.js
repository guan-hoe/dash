/* Macro page: Fed funds rate expectations, FedWatch-style.
   Futures-implied rate after each upcoming FOMC meeting, how many basis points of hikes (or cuts) are priced,
   and the probability of each target range, compared with 1 day, 1 week, 2 weeks or 1 month ago.
   Data: data/fedwatch.json, built by scripts/fetch-fedwatch.mjs in the deploy workflow. Re-polls every minute. */
(function () {
  const $ = (id) => document.getElementById(id);
  const host = $("fedSec"); if (!host) return;
  const TZ = "Asia/Singapore";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sgn = (v, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(d);
  const pct = (p) => (p * 100).toFixed(1) + "%";
  const iso2date = (s) => { const [Y, M, D] = s.split("-").map(Number); return new Date(Date.UTC(Y, M - 1, D)); };
  const fmtD = (s, yr) => iso2date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(yr ? { year: "numeric" } : {}), timeZone: "UTC" });
  const sgt = (s) => new Date(s * 1000).toLocaleString("en-SG", { timeZone: TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const rangeTxt = (lo) => `${(+lo).toFixed(2)}–${(+lo + 0.25).toFixed(2)}%`;
  const FOMC_DAYS = new Set(["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
    "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08"]);
  const LB = [["1D", "1 day"], ["1W", "1 week"], ["2W", "2 weeks"], ["1M", "1 month"]];

  let F = null, lb = "1W", view = "bps", selM = null, hm = "rate", hf = "all", selDay = null;
  try { lb = localStorage.getItem("fed-lb") || lb; view = localStorage.getItem("fed-view") || view; hm = localStorage.getItem("fed-hm") || hm; hf = localStorage.getItem("fed-hf") || hf; } catch (e) {}

  // snapshot to compare with: the last one on or before the lookback date (1D = the previous trading day)
  function then(now) {
    const S = F.snapshots, i = S.indexOf(now);
    if (lb === "1D") return S[i - 1] || null;
    const t = iso2date(now.d);
    if (lb === "1M") t.setUTCMonth(t.getUTCMonth() - 1); else t.setUTCDate(t.getUTCDate() - (lb === "1W" ? 7 : 14));
    const ts = t.toISOString().slice(0, 10);
    for (let k = i - 1; k >= 0; k--) if (S[k].d <= ts) return S[k];
    return null;
  }
  // probabilities relative to today's range
  function sides(m, lower) {
    let hike = 0, hold = 0, cut = 0;
    for (const [k, p] of Object.entries(m.p)) { const d = +k - lower; if (d > 0.001) hike += p; else if (d < -0.001) cut += p; else hold += p; }
    return { hike, hold, cut };
  }

  function controls() {
    $("fedLb").innerHTML = LB.map(([k, t]) => `<button type="button" data-lb="${k}" aria-pressed="${k === lb}" title="Compare with ${t} ago">${k}</button>`).join("");
    $("fedView").innerHTML = [["bps", "Bps priced"], ["rate", "Implied rate"]].map(([k, t]) => `<button type="button" data-v="${k}" aria-pressed="${k === view}">${t}</button>`).join("");
    $("fedLb").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; lb = b.dataset.lb; try { localStorage.setItem("fed-lb", lb); } catch (x) {} render(); };
    $("fedView").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; view = b.dataset.v; try { localStorage.setItem("fed-view", view); } catch (x) {} render(); };
  }

  function kpis(now, prv) {
    const ms = now.meetings, nx = ms[0], s = sides(nx, now.lower);
    const y1 = ms.filter((m) => m.d.slice(0, 4) === now.d.slice(0, 4)).at(-1), last = ms.at(-1);
    const pm = (m) => prv && prv.meetings.find((x) => x.d === m.d);
    const dTxt = (m) => { const q = pm(m); if (!q) return ""; const dv = (m.rate - q.rate) * 100; return `<em class="${dv > 0.05 ? "up" : dv < -0.05 ? "down" : ""}">${sgn(dv, 1)} bp vs ${lb}</em>`; };
    const pq = pm(nx), ps = pq ? sides(pq, now.lower) : null;
    const box = (k, v, sub) => `<div><b>${k}</b><span>${v}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
    $("fedKpi").innerHTML =
      box("Target range", rangeTxt(now.lower), `EFFR ${now.effr.toFixed(2)}%`) +
      box(`Next FOMC · ${fmtD(nx.d)}`, `${pct(s.hike)} hike`, `${pct(s.hold)} hold${s.cut > 0.0005 ? ` · ${pct(s.cut)} cut` : ""}${ps ? ` <em class="${s.hike - ps.hike > 0.0005 ? "up" : s.hike - ps.hike < -0.0005 ? "down" : ""}">${sgn((s.hike - ps.hike) * 100, 1)} pp vs ${lb}</em>` : ""}`) +
      (y1 && y1 !== nx ? box(`Priced by ${fmtD(y1.d)}`, `${sgn(y1.cum, 1)} bp`, `${(y1.cum / 25).toFixed(2)} hikes · ${dTxt(y1)}`) : "") +
      box(`Priced by ${fmtD(last.d, true)}`, `${sgn(last.cum, 1)} bp`, `${(last.cum / 25).toFixed(2)} hikes · ${dTxt(last)}`);
  }

  // ---------- grouped bar chart: now vs then for every meeting ----------
  function chart(now, prv) {
    const el = $("fedChart"), W = Math.max(300, el.clientWidth), H = W < 560 ? 250 : 300;
    const ms = now.meetings, n = ms.length;
    const val = (m) => (view === "bps" ? m.cum : m.rate);
    // "then" in the same terms: bps relative to today's EFFR, so both bars share one baseline
    const tv = (m) => { const q = prv && prv.meetings.find((x) => x.d === m.d); return q ? (view === "bps" ? (q.rate - now.effr) * 100 : q.rate) : null; };
    const all = ms.flatMap((m) => [val(m), tv(m)]).filter((v) => v != null);
    let lo, hi;
    if (view === "bps") { lo = Math.min(0, ...all); hi = Math.max(0, ...all); const pad = Math.max(5, (hi - lo) * 0.12); hi += pad; if (lo < 0) lo -= pad; }
    else { lo = Math.min(now.lower, ...all); hi = Math.max(now.lower + 0.25, ...all); const pad = (hi - lo) * 0.15 || 0.05; lo -= pad; hi += pad; }
    const step = view === "bps" ? niceStep((hi - lo) / 5) : niceStep((hi - lo) / 5);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const L = 46, R = 10, T = 14, B = 34, pw = W - L - R, ph = H - T - B;
    const y = (v) => T + ph * (1 - (v - lo) / (hi - lo));
    const gw = pw / n, bw = Math.max(4, Math.min(22, gw * 0.32)), gap = 2;
    const base = view === "bps" ? y(0) : y(lo);
    let g = "";
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const yy = y(v).toFixed(1), z = view === "bps" && Math.abs(v) < 1e-9;
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" style="stroke:var(--line);stroke-width:${z ? 1.2 : 1}${z ? "" : ";stroke-dasharray:2 3"}"/>`;
      g += `<text x="${L - 6}" y="${(+yy + 3.5).toFixed(1)}" text-anchor="end" class="fx">${view === "bps" ? (v > 0 ? "+" : "") + Math.round(v) : v.toFixed(2) + "%"}</text>`;
    }
    if (view === "rate") { // today's target range as a band
      g += `<rect x="${L}" width="${pw}" y="${y(now.lower + 0.25).toFixed(1)}" height="${(y(now.lower) - y(now.lower + 0.25)).toFixed(1)}" style="fill:var(--accent-soft);opacity:.7"/>`;
    }
    const bar = (x, v, cls) => {
      if (v == null) return "";
      const y1 = y(v), top = Math.min(y1, base), h = Math.max(1, Math.abs(base - y1)), r = Math.min(4, bw / 2, h);
      // rounded data end, square at the baseline
      const up = y1 <= base;
      const d = up ? `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${top + h}Z`
        : `M${x},${top}V${top + h - r}Q${x},${top + h} ${x + r},${top + h}H${x + bw - r}Q${x + bw},${top + h} ${x + bw},${top + h - r}V${top}Z`;
      return `<path d="${d}" class="${cls}"/>`;
    };
    ms.forEach((m, i) => {
      const cx = L + gw * (i + 0.5), t = tv(m), sel = m.d === selM;
      if (sel) g += `<rect x="${(L + gw * i + 1).toFixed(1)}" y="${T}" width="${(gw - 2).toFixed(1)}" height="${ph}" rx="4" style="fill:var(--accent-soft)"/>`;
      g += bar(cx - bw - gap / 2, t, "fb-then") + bar(cx + gap / 2, val(m), "fb-now");
      const every = gw < 30 ? 2 : 1, lab = gw < 46 ? iso2date(m.d).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) : fmtD(m.d);
      if (i % every === 0 || sel) g += `<text x="${cx.toFixed(1)}" y="${H - B + 15}" text-anchor="middle" class="fx${sel ? " sel" : ""}">${lab}</text>`;
      if (i === 0 || m.d.slice(0, 4) !== ms[i - 1].d.slice(0, 4)) g += `<text x="${cx.toFixed(1)}" y="${H - B + 28}" text-anchor="middle" class="fx yr">${m.d.slice(0, 4)}</text>`;
      g += `<rect class="hit" data-i="${i}" x="${(L + gw * i).toFixed(1)}" y="${T}" width="${gw.toFixed(1)}" height="${ph + B}" fill="transparent"/>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${view === "bps" ? "Basis points of hikes priced" : "Implied fed funds rate"} after each FOMC meeting, now vs ${lb} ago">${g}</svg>`;
    const tip = $("fedTip");
    const show = (i, ev) => {
      const m = ms[i], q = prv && prv.meetings.find((x) => x.d === m.d), s = sides(m, now.lower);
      const row = (k, a, b) => `<span>${k}</span><span>${a}</span><span>${b}</span>`;
      tip.innerHTML = `<b>FOMC ${fmtD(m.d, true)}</b><div class="g3"><span></span><span class="h">Now</span><span class="h">${lb} ago</span>` +
        row("Implied", m.rate.toFixed(3) + "%", q ? q.rate.toFixed(3) + "%" : "–") +
        row("Priced", sgn(m.cum, 1) + " bp", q ? sgn((q.rate - now.effr) * 100, 1) + " bp" : "–") +
        row("This mtg", sgn(m.move, 1) + " bp", q ? sgn(q.move, 1) + " bp" : "–") +
        `</div><div class="rv">Change: ${q ? `<strong>${sgn((m.rate - q.rate) * 100, 1)} bp</strong>` : "no data"} · P(above today's range) ${pct(s.hike)}</div><div class="rv mut">Click for probabilities</div>`;
      tip.hidden = false;
      const box = el.getBoundingClientRect(), cx = L + gw * (i + 0.5);
      let left = cx + 14; if (left + 230 > box.width) left = Math.max(0, cx - 244);
      tip.style.left = left + "px"; tip.style.top = Math.max(0, (ev ? ev.clientY - box.top : 40) - 60) + "px";
    };
    el.querySelectorAll(".hit").forEach((r) => {
      r.addEventListener("mousemove", (e) => show(+r.dataset.i, e));
      r.addEventListener("mouseleave", () => { tip.hidden = true; });
      r.addEventListener("click", () => { selM = ms[+r.dataset.i].d; render(); });
    });
    $("fedLeg").innerHTML = `<span><i class="sw now"></i>Now (${fmtD(now.d)})</span><span><i class="sw then"></i>${prv ? `${lb} ago (${fmtD(prv.d)})` : `${lb} ago: no data yet`}</span>` +
      `<span>${view === "bps" ? "Bars: cumulative bps above (+) or below (−) today's EFFR after each meeting" : "Bars: futures-implied effective fed funds rate after each meeting; band = today's target range"}</span>`;
  }
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }

  // ---------- probability distribution for the selected meeting ----------
  function probs(now, prv) {
    const m = now.meetings.find((x) => x.d === selM) || now.meetings[0], q = prv && prv.meetings.find((x) => x.d === m.d);
    const keys = [...new Set([...Object.keys(m.p), ...(q ? Object.keys(q.p) : [])])].sort((a, b) => b - a).filter((k) => (m.p[k] || 0) >= 0.001 || (q && (q.p[k] || 0) >= 0.001));
    const rows = keys.map((k) => {
      const a = m.p[k] || 0, b = q ? q.p[k] || 0 : null, d = b == null ? null : (a - b) * 100, cur = Math.abs(+k - now.lower) < 0.001;
      const tag = +k > now.lower + 0.001 ? `+${Math.round((+k - now.lower) * 100)}bp` : +k < now.lower - 0.001 ? `−${Math.round((now.lower - +k) * 100)}bp` : "hold";
      return `<div class="pr${cur ? " cur" : ""}"><div class="pk">${rangeTxt(k)}<small>${tag}</small></div>` +
        `<div class="pb"><i class="now" style="width:${(a * 100).toFixed(1)}%"></i>${b != null ? `<i class="then" style="width:${(b * 100).toFixed(1)}%"></i>` : ""}</div>` +
        `<div class="pv">${pct(a)}<small>${b != null ? `${pct(b)} · <span class="${d > 0.05 ? "up" : d < -0.05 ? "down" : ""}">${sgn(d, 1)} pp</span>` : ""}</small></div></div>`;
    }).join("");
    const s = sides(m, now.lower);
    $("fedProb").innerHTML = `<div class="sig-head"><h3>FOMC ${fmtD(m.d, true)}: target range probabilities</h3><span class="score">${s.hike >= s.hold && s.hike >= s.cut ? "Hike favoured" : s.cut > s.hold ? "Cut favoured" : "Hold favoured"}</span></div>` +
      `<p class="note" style="margin:0 0 10px">Implied rate ${m.rate.toFixed(3)}%${q ? ` (${sgn((m.rate - q.rate) * 100, 1)} bp vs ${lb} ago)` : ""} · ${sgn(m.cum, 1)} bp priced from today, ${sgn(m.move, 1)} bp at this meeting. Bars: now; thin line: ${lb} ago.</p>${rows}`;
  }

  function table(now, prv) {
    const head = `<tr><th>Meeting</th><th>Implied rate</th><th>Δ ${lb}</th><th>Bps priced</th><th>This mtg</th><th>P(hike)</th><th>Δ ${lb}</th><th>P(hold)</th><th>P(cut)</th></tr>`;
    const body = now.meetings.map((m) => {
      const q = prv && prv.meetings.find((x) => x.d === m.d), s = sides(m, now.lower), sq = q ? sides(q, now.lower) : null;
      const dr = q ? (m.rate - q.rate) * 100 : null, dp = sq ? (s.hike - sq.hike) * 100 : null;
      const c = (v, e) => v == null ? "–" : `<span class="${v > e ? "up" : v < -e ? "down" : ""}">${sgn(v, 1)}</span>`;
      return `<tr class="${m.d === selM ? "on" : ""}" data-d="${m.d}"><td>${fmtD(m.d)} ’${m.d.slice(2, 4)}</td><td>${m.rate.toFixed(3)}%</td><td>${c(dr, 0.05)}</td><td>${sgn(m.cum, 1)}</td><td>${sgn(m.move, 1)}</td><td>${pct(s.hike)}</td><td>${c(dp, 0.05)}</td><td>${pct(s.hold)}</td><td>${pct(s.cut)}</td></tr>`;
    }).join("");
    $("fedTab").innerHTML = `<table class="ctab ftab">${head}${body}</table>`;
    $("fedTab").querySelectorAll("tr[data-d]").forEach((tr) => tr.onclick = () => { selM = tr.dataset.d; render(); });
  }

  // ---------- history: how pricing for the selected meeting moved, with the news on each day ----------
  const NYF = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const nyParts = (ms) => { const o = {}; for (const p of NYF.formatToParts(ms)) o[p.type] = p.value; return { d: `${o.year}-${o.month}-${o.day}`, h: +o.hour }; };
  const sgtT = (ms) => new Date(ms).toLocaleString("en-SG", { timeZone: TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  // an event moves the settle of the first trading day that closes after it (futures settle ~3pm New York)
  function dayIndex(S, ts) {
    const { d, h } = nyParts(ts);
    for (let i = 0; i < S.length; i++) if (h < 15 ? S[i].d >= d : S[i].d > d) return i;
    return ts >= Date.parse(S.at(-1).d + "T00:00:00Z") - 864e5 ? S.length - 1 : -1;
  }
  const evOk = (e) => hf === "all" || (hf === "cal" ? e.k === "cal" : hf === "fed" ? e.fed : e.k === "news");
  const evRank = (e) => (e.k === "cal" ? (e.imp === "High" ? 0 : 1) : e.fed ? 2 : 3);

  function history(now, prv) {
    const host2 = $("fedHist"); if (!host2) return;
    const S = F.snapshots, md = selM, mFor = (s) => s.meetings.find((x) => x.d === md);
    const metric = (s) => { const m = mFor(s); if (!m) return null; return hm === "rate" ? m.rate : sides(m, now.lower).hike * 100; };
    const vals = S.map(metric), dlt = vals.map((v, i) => (i && v != null && vals[i - 1] != null ? v - vals[i - 1] : null));
    const unit = hm === "rate" ? "bp" : "pp", dScale = hm === "rate" ? 100 : 1; // daily change shown in bp or pp
    // events per day
    const days = S.map(() => []);
    for (const e of F.events || []) { if (!evOk(e)) continue; const i = dayIndex(S, e.ts); if (i >= 0) days[i].push(e); }
    days.forEach((a) => a.sort((x, y) => evRank(x) - evRank(y) || y.ts - x.ts));
    if (selDay == null || selDay >= S.length) { selDay = S.length - 1; }

    $("fedHm").innerHTML = [["rate", "Implied rate"], ["hike", "P(hike)"]].map(([k, t]) => `<button type="button" data-k="${k}" aria-pressed="${k === hm}">${t}</button>`).join("");
    $("fedHf").innerHTML = [["all", "All news"], ["cal", "Data releases"], ["fed", "Fed"], ["news", "Headlines"]].map(([k, t]) => `<button type="button" data-k="${k}" aria-pressed="${k === hf}">${t}</button>`).join("");
    $("fedHm").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; hm = b.dataset.k; try { localStorage.setItem("fed-hm", hm); } catch (x) {} history(now, prv); };
    $("fedHf").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; hf = b.dataset.k; try { localStorage.setItem("fed-hf", hf); } catch (x) {} history(now, prv); };
    const mNow = mFor(now);
    // meeting picker: the next three FOMC meetings, plus whichever meeting is picked in the chart above
    const picks = now.meetings.slice(0, 3).map((m) => m.d);
    if (!picks.includes(md)) picks.push(md);
    const hs = $("fedHSel");
    hs.innerHTML = picks.map((d) => `<option value="${d}"${d === md ? " selected" : ""}>${fmtD(d, true)}${d === now.meetings[0].d ? " (next)" : ""}</option>`).join("");
    hs.onchange = () => { selM = hs.value; render(); };

    const el = host2, W = Math.max(300, el.clientWidth), small = W < 560;
    const L = 48, R = 12, T = 12, PH = small ? 150 : 180, DH = 44, LANE = 30, B = 22;
    const H = T + PH + 10 + DH + 8 + LANE + B, n = S.length;
    const good = vals.filter((v) => v != null);
    if (!good.length) { el.innerHTML = `<p class="sub">No history for this meeting yet.</p>`; return; }
    let lo = Math.min(...good), hi = Math.max(...good);
    if (hm === "rate") { lo = Math.min(lo, now.lower); const pad = Math.max(0.03, (hi - lo) * 0.1); lo -= pad; hi += pad; }
    else { lo = Math.max(0, lo - 8); hi = Math.min(100, hi + 8); if (hi - lo < 20) hi = Math.min(100, lo + 20); }
    const step = niceStep((hi - lo) / 4); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => L + (n === 1 ? (W - L - R) / 2 : ((W - L - R) * i) / (n - 1));
    const y = (v) => T + PH * (1 - (v - lo) / (hi - lo));
    const colW = (W - L - R) / Math.max(1, n - 1);
    let g = "";
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const yy = y(v).toFixed(1);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" style="stroke:var(--line);stroke-dasharray:2 3"/>`;
      g += `<text x="${L - 6}" y="${(+yy + 3.5).toFixed(1)}" text-anchor="end" class="fx">${hm === "rate" ? v.toFixed(2) + "%" : Math.round(v) + "%"}</text>`;
    }
    if (hm === "rate") g += `<rect x="${L}" width="${W - L - R}" y="${y(Math.min(hi, now.lower + 0.25)).toFixed(1)}" height="${Math.max(0, y(Math.max(lo, now.lower)) - y(Math.min(hi, now.lower + 0.25))).toFixed(1)}" style="fill:var(--accent-soft);opacity:.6"/>`;
    // FOMC decisions inside the window and the comparison date
    S.forEach((s, i) => {
      if (FOMC_DAYS.has(s.d)) g += `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${T + PH}" style="stroke:var(--muted);stroke-dasharray:4 3"/><text x="${x(i) + 4}" y="${T + 10}" class="fx">FOMC</text>`;
      if (prv && s.d === prv.d) g += `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${T + PH}" style="stroke:var(--muted);opacity:.5"/><text x="${x(i) + 4}" y="${T + PH - 4}" class="fx">${lb} ago</text>`;
    });
    // line
    let d = "", pen = false;
    vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    g += `<path d="${d}" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round"/>`;
    const li = vals.length - 1;
    if (vals[li] != null) g += `<circle cx="${x(li).toFixed(1)}" cy="${y(vals[li]).toFixed(1)}" r="4" style="fill:var(--accent);stroke:var(--panel);stroke-width:2"/>`;
    // daily change bars
    const dTop = T + PH + 10, dMid = dTop + DH / 2, dMax = Math.max(1e-9, ...dlt.filter((v) => v != null).map((v) => Math.abs(v)));
    g += `<line x1="${L}" x2="${W - R}" y1="${dMid}" y2="${dMid}" style="stroke:var(--line)"/><text x="${L - 6}" y="${dMid + 3.5}" text-anchor="end" class="fx">Δ day</text>`;
    const bw = Math.max(2, Math.min(10, colW * 0.5));
    dlt.forEach((v, i) => {
      if (v == null || Math.abs(v) < 1e-9) return;
      const h = Math.max(1.5, (Math.abs(v) / dMax) * (DH / 2 - 2)), top = v > 0 ? dMid - h : dMid;
      g += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" class="${v > 0 ? "hb-up" : "hb-dn"}"/>`;
    });
    // news lane: one marker per day; circle = data release, diamond = Fed / headlines; size by count
    const lY = dTop + DH + 8 + LANE / 2;
    g += `<text x="${L - 6}" y="${lY + 3.5}" text-anchor="end" class="fx">News</text>`;
    days.forEach((a, i) => {
      if (!a.length) return;
      const r = Math.min(8, 3.5 + Math.sqrt(a.length) * 1.2), cx = x(i), on = i === selDay, cal = a.some((e) => e.k === "cal");
      const cls = `${cal ? "ev-cal" : "ev-news"}${on ? " on" : ""}`;
      g += cal ? `<circle cx="${cx.toFixed(1)}" cy="${lY}" r="${r.toFixed(1)}" class="${cls}"/>`
        : `<path d="M${cx.toFixed(1)},${lY - r - 1}L${(cx + r + 1).toFixed(1)},${lY}L${cx.toFixed(1)},${lY + r + 1}L${(cx - r - 1).toFixed(1)},${lY}Z" class="${cls}"/>`;
    });
    // x labels
    const every = Math.ceil(n / (small ? 5 : 8));
    S.forEach((s, i) => { if ((n - 1 - i) % every === 0) g += `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === n - 1 ? "end" : i === 0 ? "start" : "middle"}" class="fx">${fmtD(s.d)}</text>`; });
    if (selDay != null) g = `<rect x="${(x(selDay) - colW / 2).toFixed(1)}" y="${T}" width="${colW.toFixed(1)}" height="${H - T - B}" style="fill:var(--accent-soft);opacity:.7"/>` + g;
    S.forEach((s, i) => { g += `<rect class="hit" data-i="${i}" x="${(x(i) - colW / 2).toFixed(1)}" y="${T}" width="${colW.toFixed(1)}" height="${H - T}" fill="transparent"/>`; });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${hm === "rate" ? "Implied rate" : "Probability of a hike"} for the ${fmtD(md, true)} FOMC meeting over the last ${n} trading days, with news markers">${g}</svg>`;

    const fmtV = (v) => (v == null ? "–" : hm === "rate" ? v.toFixed(3) + "%" : v.toFixed(1) + "%");
    const fmtDl = (v) => (v == null ? "–" : `${sgn(v * dScale, 1)} ${unit}`);
    const tip = $("fedHTip");
    const show = (i, ev) => {
      const a = days[i];
      tip.innerHTML = `<b>${fmtD(S[i].d, true)}</b><div class="g"><span>${hm === "rate" ? "Implied" : "P(hike)"}</span><span>${fmtV(vals[i])}</span><span>Day change</span><span>${fmtDl(dlt[i])}</span></div>` +
        (a.length ? `<div class="rv">${a.slice(0, 2).map((e) => `• ${esc(e.t.length > 70 ? e.t.slice(0, 68) + "…" : e.t)}`).join("<br>")}${a.length > 2 ? `<br><span class="mut">+${a.length - 2} more</span>` : ""}</div>` : `<div class="rv mut">No news logged</div>`) +
        `<div class="rv mut">Click to list the day's news</div>`;
      tip.hidden = false;
      const box = el.getBoundingClientRect(), cx = x(i);
      let left = cx + 14; if (left + 250 > box.width) left = Math.max(0, cx - 264);
      tip.style.left = left + "px"; tip.style.top = Math.max(0, (ev ? ev.clientY - box.top : 40) - 70) + "px";
    };
    el.querySelectorAll(".hit").forEach((r) => {
      r.addEventListener("mousemove", (e) => show(+r.dataset.i, e));
      r.addEventListener("mouseleave", () => { tip.hidden = true; });
      r.addEventListener("click", () => { selDay = +r.dataset.i; tip.hidden = true; history(now, prv); });
    });
    $("fedHLeg").innerHTML = `<span><i style="background:var(--accent)"></i>${hm === "rate" ? "Implied rate after the meeting" : "P(above today's range)"}</span>` +
      `<span><i class="sw ev cal"></i>Data release</span><span><i class="sw ev news"></i>Fed / headlines</span><span>Δ day: change from the previous settle (${unit})</span>`;

    // day detail
    const a = days[selDay], newsDays = days.map((x, i) => (x.length ? i : -1)).filter((i) => i >= 0);
    const pi = newsDays.filter((i) => i < selDay).at(-1), ni = newsDays.find((i) => i > selDay);
    const row = (e) => {
      const when = `<small>${sgtT(e.ts)} SGT${e.s ? " · " + esc(e.s) : ""}</small>`;
      if (e.k === "cal") return `<li class="ec"><span class="tg">${e.fed ? "Fed" : "Data"}${e.imp === "High" ? " · high" : ""}</span><div>${esc(e.t)}${e.a || e.f || e.p ? ` <span class="mut">${e.a ? "actual " + esc(e.a) + " · " : ""}${e.f ? "fcst " + esc(e.f) + " · " : ""}${e.p ? "prev " + esc(e.p) : ""}</span>` : ""}${when}</div></li>`;
      return `<li><span class="tg">${e.fed ? "Fed" : "News"}</span><div>${e.u ? `<a href="${esc(e.u)}" target="_blank" rel="noopener">${esc(e.t)}</a>` : esc(e.t)}${when}</div></li>`;
    };
    const dv = dlt[selDay];
    $("fedDay").innerHTML = `<div class="dh"><button type="button" data-go="${pi ?? ""}" ${pi == null ? "disabled" : ""} aria-label="Previous day with news">‹</button>` +
      `<div><b>${fmtD(S[selDay].d, true)}${selDay === S.length - 1 ? " (latest)" : ""}</b><span>${hm === "rate" ? "Implied" : "P(hike)"} ${fmtV(vals[selDay])} · <em class="${dv > 1e-4 ? "up" : dv < -1e-4 ? "down" : ""}">${fmtDl(dv)} on the day</em>${mNow && vals[selDay] != null ? ` · ${fmtDl(vals.at(-1) - vals[selDay])} since` : ""}</span></div>` +
      `<button type="button" data-go="${ni ?? ""}" ${ni == null ? "disabled" : ""} aria-label="Next day with news">›</button></div>` +
      (a.length ? `<ul class="evl">${a.slice(0, 14).map(row).join("")}</ul>${a.length > 14 ? `<p class="note">+${a.length - 14} more headlines that day.</p>` : ""}` : `<p class="note">No news logged for this day${hf !== "all" ? " under this filter" : ""}.</p>`);
    $("fedDay").querySelectorAll("button[data-go]").forEach((b) => b.onclick = () => { if (b.dataset.go === "") return; selDay = +b.dataset.go; history(now, prv); });
  }

  function render() {
    if (!F || !F.snapshots || !F.snapshots.length) { $("fedKpi").innerHTML = ""; $("fedChart").innerHTML = `<p class="sub">Fed funds futures data could not be loaded right now.</p>`; return; }
    const now = F.snapshots.at(-1), prv = then(now);
    if (!selM || !now.meetings.some((m) => m.d === selM)) selM = now.meetings[0].d;
    controls(); kpis(now, prv); chart(now, prv); probs(now, prv); history(now, prv); table(now, prv);
    // freshness: say when the futures were last pulled, and warn when the feed has fallen behind
    const age = (Date.now() / 1000 - (F.updated || 0)) / 3600, lastSettle = iso2date(now.d), behind = (Date.now() - lastSettle) / 864e5;
    $("fedAge").innerHTML = (F.stale || age > 6 || behind > 4)
      ? `<span class="warn">⚠ Futures data last refreshed ${F.updated ? sgt(F.updated) + " SGT" : "–"} (latest settle ${fmtD(now.d, true)}); the latest fetch failed, showing the last good data.</span>`
      : `Futures refreshed ${F.updated ? sgt(F.updated) + " SGT" : "–"} · latest settle ${fmtD(now.d, true)}`;
    $("fedNote").textContent = `Computed from CBOT 30-day fed funds futures (same method as CME FedWatch: each meeting's implied move is split between the two nearest 25bp outcomes and chained meeting by meeting). ` +
      `Futures as of ${F.quoteTime ? sgt(F.quoteTime) + " SGT" : fmtD(now.d, true)}; comparison uses the ${prv ? fmtD(prv.d, true) : "–"} settle. "Bps priced" for both dates is measured from today's EFFR (${now.effr.toFixed(2)}%), so the change is the shift in the expected rate. Futures can be delayed; for information only.`;
  }

  async function load() {
    try {
      const r = await fetch("../data/fedwatch.json?t=" + Date.now(), { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && (!F || j.updated !== F.updated)) { F = j; render(); } else if (!F) render();
    } catch (e) { if (!F) render(); }
  }
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => F && render(), 150); });
  load(); setInterval(load, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
