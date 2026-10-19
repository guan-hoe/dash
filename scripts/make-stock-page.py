#!/usr/bin/env python3
"""Builds a stock dashboard page from a spec file.

Usage:  python3 scripts/make-stock-page.py specs/mu.json   (writes mu/index.html and mu/fcf-data.js)
        python3 scripts/make-stock-page.py specs/*.json

A spec holds everything that is edited by hand: identity, headline text, key cells, quarterly
results, guidance, watch list, calendar, sources and the free cash flow block, each text in EN and 中文.
Price, market cap, 52-week range, moving averages, RSI, YTD and drawdown are computed in the browser
from data/quote.json and data/history.json, which the GitHub Action refreshes.
"""
import json, sys, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def t(o, lang="en"):
    if isinstance(o, dict):
        return o.get(lang) or o.get("en", "")
    return o or ""


def build(spec_path):
    S = json.loads(pathlib.Path(spec_path).read_text())
    d = S["dir"]
    out = ROOT / d
    (out / "data").mkdir(parents=True, exist_ok=True)

    zh = {}   # data-i key -> 中文 text
    def tx(key, o, tag="span", attrs="", raw=False):
        """Element whose text switches language. raw=True keeps HTML (data-ih)."""
        zh[key] = t(o, "zh")
        attr = "data-ih" if raw else "data-i"
        return f'<{tag} {attr}="{key}"{attrs}>{t(o)}</{tag}>'

    # fixed UI labels
    UI = {
        "n_home": ("All stocks", "全部股票"), "n_over": ("Overview", "概览"), "n_price": ("Price", "股价"),
        "n_rev": ("Revenue", "营收"), "n_fcf": ("Cash flow", "现金流"), "n_watch": ("Watch list", "关注点"),
        "n_news": ("News", "新闻"), "n_src": ("Sources", "来源"),
        "k_mcap": ("Market cap", "市值"), "s_mcap": ("at current price", "按当前股价"),
        "k_52": ("52-week range", "52周区间"), "s_52": ("closing low / high", "收盘低 / 高"),
        "k_ttm": ("Revenue TTM", "近12月营收"), "k_er": ("Next earnings", "下次财报"),
        "h_price": ("Price, last 12 months", "近12个月股价"),
        "k_hi": ("1Y closing high", "一年收盘最高"), "k_lo": ("1Y closing low", "一年收盘最低"),
        "k_move": ("Avg daily move", "日均波幅"), "s_move": ("last 20 sessions", "近20个交易日"),
        "s_beta": ("vs. S&P 500", "相对标普500"), "k_dd": ("From peak", "距高点"),
        "h_rev": ("Revenue and margins, by quarter", "季度营收与利润率"),
        "l_rev": ("Revenue", "营收"), "l_gm": ("Gross margin (right axis)", "毛利率（右轴）"), "l_g": ("Guidance", "指引"),
        "t_q": ("Quarter", "季度"), "t_end": ("Ended", "截至"), "t_rev": ("Revenue, US$M", "营收（百万美元）"),
        "t_yoy": ("YoY", "同比"), "t_gm": ("Gross margin", "毛利率"), "t_om": ("Op. margin", "营业利润率"),
        "t_eps": ("EPS (GAAP)", "每股收益（GAAP）"),
        "h_watch": ("Watch list", "关注点"), "sub_watch": ("What moves the thesis, sorted by direction.", "影响投资逻辑的因素，按方向分类。"),
        "pl_plus": ("Tailwind", "利好"), "pl_watch": ("Watch", "留意"), "pl_risk": ("Risk", "风险"),
        "h_cal": ("Calendar", "日程"), "h_src": ("Sources", "来源"),
    }
    def ui(key, tag="span", attrs=""):
        return tx(key, {"en": UI[key][0], "zh": UI[key][1]}, tag, attrs)

    esc = html.escape
    cells = "".join(
        f'<div class="cell"><div class="k">{tx(f"kc{i}", c["k"])}</div><div class="v">{esc(c["v"])}</div>'
        f'<div class="s">{tx(f"sc{i}", c["s"])}</div></div>' for i, c in enumerate(S["rev_cells"]))
    pill = {"plus": "p-plus", "watch": "p-watch", "risk": "p-risk"}
    watch = "".join(
        f'<div class="item"><span class="pill {pill[w["kind"]]}" data-i="pl_{w["kind"]}">{UI["pl_" + w["kind"]][0]}</span>'
        f'<div>{tx(f"w{i}h", w["h"], "h3")}{tx(f"w{i}p", w["p"], "p")}</div></div>' for i, w in enumerate(S["watch"]))
    cal = "".join(
        f'<div class="item"><div><div class="date">{esc(c["date"])}</div>{tx(f"c{i}h", c["h"], "h3")}{tx(f"c{i}p", c["p"], "p")}</div></div>'
        for i, c in enumerate(S["calendar"]))
    src = "".join(f'<li><a href="{esc(u)}" target="_blank" rel="noopener">{esc(n)}</a></li>' for n, u in S["sources"])

    ui_keys = {k: v[1] for k, v in UI.items()}
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(S['name'])} {S['ticker']} Dashboard</title>
<meta name="description" content="{esc(S['name'])} ({S['exchange']}: {S['ticker']}) investor dashboard: price, quarterly revenue and margins, free cash flow, watch list, news and calendar.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">
<link rel="stylesheet" href="../assets/stock.css?v=2">
<style>.chart.rev{{height:320px}} tr.guide td{{color:var(--muted);font-style:italic}}</style>
</head>
<body>
<header class="bar"><div class="bar-in">
  <span class="tick">{S['exchange']}: {S['ticker']}</span>
  <span class="bar-px" id="barPx">{esc(S['snapshot']['price'])}</span>
  <span class="chg" id="barChg"></span>
  <span class="live" id="barLive"><i class="dot"></i><span id="barTime">snapshot</span></span>
  <nav class="sec" aria-label="Sections">
    <a href="../" data-i="n_home">All stocks</a>
    <a href="#overview" data-i="n_over">Overview</a>
    <a href="#price" data-i="n_price">Price</a>
    <a href="#revenue" data-i="n_rev">Revenue</a>
    <a href="#cashflow" data-i="n_fcf">Cash flow</a>
    <a href="#watch" data-i="n_watch">Watch list</a>
    <a href="#news" data-i="n_news">News</a>
    <a href="#sources" data-i="n_src">Sources</a>
  </nav>
  <div class="tools">
    <button class="tg" id="langBtn" type="button" aria-label="Switch language">中文</button>
    <button class="tg" id="themeBtn" type="button" aria-label="Switch theme">◐ Auto</button>
  </div>
</div></header>

<main class="wrap">
  <div class="hero" id="overview">
    <div>
      {tx("eyebrow", S["eyebrow"], "div", ' class="eyebrow"')}
      {tx("title", S["title"], "h1", "", raw=True)}
      {tx("lede", S["lede"], "p", ' class="lede"')}
    </div>
    <div class="pxbox">
      <div class="eyebrow" id="pxLabel">Last close · {esc(S['snapshot']['date'])}</div>
      <div class="pxbig" id="pxBig">{esc(S['snapshot']['price'])}</div>
      <div class="chg" id="pxChg"></div>
      <div class="pxnote" id="pxNote"></div>
      <div id="tv" style="margin-top:12px"><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div></div></div>
    </div>
  </div>

  <div class="cells" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:8px">
    <div class="cell"><div class="k">{ui("k_mcap")}</div><div class="v" id="mcap">{esc(S['snapshot']['mcap'])}</div><div class="s">{ui("s_mcap")}</div></div>
    <div class="cell"><div class="k">{ui("k_52")}</div><div class="v" id="r52">{esc(S['snapshot']['range'])}</div><div class="s">{ui("s_52")}</div></div>
    <div class="cell"><div class="k">{tx("k_val", S["valuation"]["k"])}</div><div class="v">{esc(S['valuation']['v'])}</div><div class="s">{tx("s_val", S["valuation"]["s"])}</div></div>
    <div class="cell"><div class="k">{ui("k_ttm")}</div><div class="v" id="ttmV"></div><div class="s" id="ttmS"></div></div>
    <div class="cell"><div class="k">{tx("k_an", S["analysts"]["k"])}</div><div class="v">{esc(S['analysts']['v'])}</div><div class="s">{tx("s_an", S["analysts"]["s"])}</div></div>
    <div class="cell"><div class="k">{ui("k_er")}</div><div class="v">{esc(S['earnings']['v'])}</div><div class="s">{tx("s_er", S["earnings"]["s"])}</div></div>
  </div>

  <section id="price">
    <h2>{ui("h_price")}</h2>
    {tx("sub_price", S["sub_price"], "p", ' class="sub"')}
    <div class="grid">
      <div class="panel">
        <div class="range" role="group" aria-label="Range">
          <button type="button" data-r="66" aria-pressed="false">3M</button>
          <button type="button" data-r="128" aria-pressed="false">6M</button>
          <button type="button" data-r="0" aria-pressed="true">1Y</button>
        </div>
        <div class="chart"><canvas id="cPrice" aria-label="{S['ticker']} daily close price chart"></canvas></div>
      </div>
      <div class="cells">
        <div class="cell"><div class="k">{ui("k_hi")}</div><div class="v" id="hiV">—</div><div class="s" id="hiS"></div></div>
        <div class="cell"><div class="k">{ui("k_lo")}</div><div class="v" id="loV">—</div><div class="s" id="loS"></div></div>
        <div class="cell"><div class="k">SMA 50</div><div class="v" id="s50V">—</div><div class="s" id="s50S"></div></div>
        <div class="cell"><div class="k">SMA 200</div><div class="v" id="s200V">—</div><div class="s" id="s200S"></div></div>
        <div class="cell"><div class="k">RSI 14</div><div class="v" id="rsiV">—</div><div class="s" id="rsiS"></div></div>
        <div class="cell"><div class="k">{ui("k_move")}</div><div class="v" id="mvV">—</div><div class="s">{ui("s_move")}</div></div>
        <div class="cell"><div class="k">Beta</div><div class="v">{esc(S['beta'])}</div><div class="s">{ui("s_beta")}</div></div>
        <div class="cell"><div class="k">{ui("k_dd")}</div><div class="v" id="ddv">—</div><div class="s" id="ddS"></div></div>
      </div>
    </div>
  </section>

  <section id="technicals" aria-label="Technical analysis"></section>

  <section id="options" aria-label="Options"></section>

  <section id="revenue">
    <h2>{ui("h_rev")}</h2>
    {tx("sub_rev", S["sub_rev"], "p", ' class="sub"')}
    <div class="grid">
      <div class="panel">
        <div class="legend"><span><i class="sw" style="background:var(--accent)"></i>{ui("l_rev")}</span><span><i class="sw" style="background:var(--copper);height:3px;vertical-align:3px"></i>{ui("l_gm")}</span><span><i class="sw" style="background:var(--line)"></i>{ui("l_g")}</span></div>
        <div class="chart rev"><canvas id="cRev" aria-label="Quarterly revenue and gross margin"></canvas></div>
      </div>
      <div class="cells">{cells}</div>
    </div>
    <div class="panel tbl" style="margin-top:16px">
      <table>
        <thead><tr><th>{ui("t_q")}</th><th>{ui("t_end")}</th><th>{ui("t_rev")}</th><th>{ui("t_yoy")}</th><th>{ui("t_gm")}</th><th>{ui("t_om")}</th><th>{ui("t_eps")}</th></tr></thead>
        <tbody id="qBody"></tbody>
      </table>
    </div>
  </section>

  <section id="cashflow" aria-label="Free cash flow"></section>

  <section id="holders" aria-label="Top shareholders"></section>

  <section id="analysts" aria-label="Analyst ratings"></section>

  <section id="watch">
    <h2>{ui("h_watch")}</h2>
    {ui("sub_watch", "p", ' class="sub"')}
    <div class="wl">{watch}</div>
  </section>

  <section id="news" data-src="../data/news.json" data-tickers="{S['ticker']}" aria-label="Latest news"></section>

  <section id="calendar">
    <h2>{ui("h_cal")}</h2>
    <div class="cal">{cal}</div>
  </section>

  <section id="sources">
    <h2>{ui("h_src")}</h2>
    <ol class="src">{src}</ol>
  </section>

  <footer><span id="footTime"></span> {tx("foot", S["foot"])}</footer>
</main>

<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script>
const KEY = {json.dumps(S['dir'])}, SHARES = {S['shares']}, TV = {json.dumps(S['exchange'] + ':' + S['ticker'])};
// [quarter, ended, revenue US$M, gross margin %, operating margin %, GAAP EPS]  oldest first
const Q = {json.dumps(S['quarters'])};
// guidance or consensus for the next quarter: [label, revenue US$M, note en, note zh] or null
const G = {json.dumps(S.get('guide'))};
// optional fixed TTM revenue cell when quarters are not consecutive
const TTM = {json.dumps(S.get('ttm'), ensure_ascii=False)};
let P = {{d:[],c:[]}};
const T = {{zh:{json.dumps({**ui_keys, **zh}, ensure_ascii=False)}}};
</script>
<script src="../assets/stock-page.js?v=1"></script>
<script src="fcf-data.js?v=1"></script>
<script src="../assets/fcf.js?v=4"></script>
<script src="../assets/news.js?v=2"></script>
<script src="../assets/technicals.js?v=1"></script>
<script src="../assets/holders.js?v=3"></script>
<script src="../assets/options.js?v=1"></script>
<script src="../assets/analysts.js?v=1"></script>
<script src="../assets/mgmt.js?v=1"></script>
<script src="../assets/ext-hours.js?v=1"></script>
<script src="../assets/stock-picker.js?v=1"></script>
</body>
</html>
"""
    (out / "index.html").write_text(page)
    (out / "fcf-data.js").write_text("window.FCF = " + json.dumps(S["fcf"], ensure_ascii=False, indent=1) + ";\n")
    for f in ("quote.json", "history.json"):
        p = out / "data" / f
        if not p.exists():
            p.write_text("{}")
    print("wrote", out / "index.html")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        build(p)
