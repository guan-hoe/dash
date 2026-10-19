/* Stock picker: a dropdown on every page that jumps to any stock's dashboard.
   Include with <script src="<path-to>/assets/stock-picker.js" defer></script>.
   To add a stock, add one line to STOCKS below ([folder, ticker, name]). */
(function () {
  const STOCKS = [
    ["aaoi", "AAOI", "Applied Optoelectronics"],
    ["amat", "AMAT", "Applied Materials"],
    ["amd", "AMD", "AMD"],
    ["amzn", "AMZN", "Amazon"],
    ["arm", "ARM", "Arm Holdings"],
    ["asml", "ASML", "ASML"],
    ["avgo", "AVGO", "Broadcom"],
    ["be", "BE", "Bloom Energy"],
    ["cohr", "COHR", "Coherent"],
    ["glw", "GLW", "Corning"],
    ["googl", "GOOGL", "Alphabet"],
    ["intc", "INTC", "Intel"],
    ["lite", "LITE", "Lumentum"],
    ["meta", "META", "Meta Platforms"],
    ["mp", "MP", "MP Materials"],
    ["mrvl", "MRVL", "Marvell Technology"],
    ["msft", "MSFT", "Microsoft"],
    ["mu", "MU", "Micron Technology"],
    ["nvda", "NVDA", "NVIDIA"],
    ["pltr", "PLTR", "Palantir"],
    ["rok", "ROK", "Rockwell Automation"],
    ["skhy", "SKHY", "SK hynix"],
    ["sndk", "SNDK", "Sandisk"],
    ["spcx", "SPCX", "SpaceX"],
    ["ter", "TER", "Teradyne"],
    ["tesla", "TSLA", "Tesla"],
    ["tsm", "TSM", "TSMC"],
    ["zs", "ZS", "Zscaler"],
  ];

  const me = document.currentScript;
  const root = new URL("../", me ? me.src : location.href);
  const here = location.pathname.replace(/index\.html$/, "");
  const current = STOCKS.find(([f]) => here.endsWith("/" + f + "/"));

  const css = document.createElement("style");
  css.textContent =
    ".sp{position:relative;display:inline-flex;align-items:center}" +
    ".sp select{appearance:none;-webkit-appearance:none;font:600 12px var(--f-mono,ui-monospace,monospace);letter-spacing:.04em;" +
    "color:var(--ink);background:var(--panel,var(--bg));border:1px solid var(--line);border-radius:6px;" +
    "padding:6px 28px 6px 10px;cursor:pointer;max-width:240px}" +
    ".sp::after{content:'▾';position:absolute;right:10px;pointer-events:none;color:var(--muted);font-size:11px}" +
    ".sp select:hover{border-color:var(--accent)}" +
    ".sp select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}" +
    "nav.tabs .sp{margin:0 0 6px auto;align-self:center}" +
    ".bar-in .sp-bar{margin-left:auto}";
  document.head.appendChild(css);

  const label = () => (document.documentElement.lang || "").startsWith("zh") ? "跳转至股票…" : "Go to stock…";

  const wrap = document.createElement("label");
  wrap.className = "sp";
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", "Go to a stock dashboard");
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = label();
  sel.appendChild(ph);
  for (const [f, t, n] of STOCKS) {
    const o = document.createElement("option");
    o.value = f;
    o.textContent = t + " · " + n;
    if (current && current[0] === f) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => {
    if (sel.value) location.href = new URL(sel.value + "/", root).href;
  });
  wrap.appendChild(sel);

  new MutationObserver(() => { ph.textContent = label(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  // Stock pages: sticky header bar, before the language/theme buttons.
  const bar = document.querySelector("header.bar .bar-in");
  if (bar) {
    const live = bar.querySelector(".live");
    wrap.classList.add("sp-bar");
    bar.insertBefore(wrap, live ? live.nextSibling : bar.firstChild);
    return;
  }
  // Main page and section pages: end of the tab row.
  const tabs = document.querySelector("nav.tabs");
  if (tabs) tabs.appendChild(wrap);
})();
