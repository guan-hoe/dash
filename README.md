# Stock Dashboard

Investor dashboards, EN / 中文, light / dark:

- **Arm Holdings (ARM)** — `arm/index.html` → https://angcharles.github.io/stock-dashboard/arm/
- **Tesla (TSLA)** — `tesla/index.html` → https://angcharles.github.io/stock-dashboard/tesla/
- **Sandisk (SNDK)** — `sndk/index.html` → https://angcharles.github.io/stock-dashboard/sndk/
- **Intel (INTC)** — `intc/index.html` → https://angcharles.github.io/stock-dashboard/intc/
- **SpaceX (SPCX)** — `spcx/index.html` → https://angcharles.github.io/stock-dashboard/spcx/
- **Micron (MU)** — `mu/index.html` → https://angcharles.github.io/stock-dashboard/mu/
- **Lumentum (LITE)** — `lite/index.html` → https://angcharles.github.io/stock-dashboard/lite/
- **Coherent (COHR)** — `cohr/index.html` → https://angcharles.github.io/stock-dashboard/cohr/
- **Alphabet (GOOGL)** — `googl/index.html` → https://angcharles.github.io/stock-dashboard/googl/
- **Meta (META)** — `meta/index.html` → https://angcharles.github.io/stock-dashboard/meta/
- **NVIDIA (NVDA)** — `nvda/index.html` → https://angcharles.github.io/stock-dashboard/nvda/
- **Zscaler (ZS)** — `zs/index.html` → https://angcharles.github.io/stock-dashboard/zs/
- **Bloom Energy (BE)** — `be/index.html` → https://angcharles.github.io/stock-dashboard/be/
- **Applied Optoelectronics (AAOI)** — `aaoi/index.html` → https://angcharles.github.io/stock-dashboard/aaoi/
- **AMD (AMD)** — `amd/index.html` → https://angcharles.github.io/stock-dashboard/amd/
- **MP Materials (MP)** — `mp/index.html` → https://angcharles.github.io/stock-dashboard/mp/
- **Amazon (AMZN)** — `amzn/index.html` → https://angcharles.github.io/stock-dashboard/amzn/
- **Microsoft (MSFT)** — `msft/index.html` → https://angcharles.github.io/stock-dashboard/msft/
- **Marvell (MRVL)** — `mrvl/index.html` → https://angcharles.github.io/stock-dashboard/mrvl/
- **SK hynix (SKHY)** — `skhy/index.html` → https://angcharles.github.io/stock-dashboard/skhy/
- **TSMC (TSM)** — `tsm/index.html` → https://angcharles.github.io/stock-dashboard/tsm/
- **Broadcom (AVGO)** — `avgo/index.html` → https://angcharles.github.io/stock-dashboard/avgo/
- **Rockwell Automation (ROK)** — `rok/index.html` → https://angcharles.github.io/stock-dashboard/rok/
- **Applied Materials (AMAT)** — `amat/index.html` → https://angcharles.github.io/stock-dashboard/amat/
- **ASML (ASML)** — `asml/index.html` → https://angcharles.github.io/stock-dashboard/asml/
- **Palantir (PLTR)** — `pltr/index.html` → https://angcharles.github.io/stock-dashboard/pltr/
- **Corning (GLW)** — `glw/index.html` → https://angcharles.github.io/stock-dashboard/glw/
- **Teradyne (TER)** — `ter/index.html` → https://angcharles.github.io/stock-dashboard/ter/

- **SpaceX vs Tesla merger** — `merger/index.html` → https://angcharles.github.io/stock-dashboard/merger/ (financial metrics, 2024–28 forecasts, capex & backlog, exchange-ratio math, merger scenarios with share-price impact, verdict)

Each page covers price, revenue mix, financials, free cash flow, watch list, calendar and sources. The root `index.html` (https://angcharles.github.io/stock-dashboard/) lists every stock with its latest price.

## Ranking on the main page
- The stock cards on `index.html` are ordered from most to least bullish (Claude's judgment), with a rank, a tier (Bullish / Constructive / Neutral / Cautious) and a one-line reason on each card. A Claude scheduled task re-ranks them after every US session (Tue–Sat 8:22am SGT) by reordering the cards, editing the `rk` and `why` lines and the "Ranked by Claude as of" date.

## Previous-session market recap (main page)
The panel above "Most to least bullish" summarises the latest US session: headline, index/SOX/VIX/10Y/oil moves, the 3–4 drivers of the rally or sell-off, the week so far and what to watch. It renders `data/market-recap.json` with `assets/market-recap.js`. Claude rewrites the JSON after each US close (scheduled task "Stock dashboard: daily market recap", Tue–Sat ~7:28 SGT) from market wraps; only that file changes. The deploy workflow copies it into the site (`.github/workflows/deploy.yml`).

## Previous-session macro recap (Macro tab)
The panel at the top of the Macro tab summarises the latest New York session for crude oil, gold, silver and the 2/5/10/30-year US Treasury, German Bund and French OAT yields: headline, the 3–4 themes that moved them, and a one-line read per instrument. The narrative is `data/macro-recap.json` (Claude rewrites it after each New York close, scheduled task "Stock dashboard: daily macro recap", Tue–Sat ~7:38 SGT). `assets/macro-recap.js` computes each row's close and day/week change from the daily bars in `data/macro.json` (the same data as the tiles and chart), so only the JSON's text needs updating. The deploy workflow copies the JSON into the site.

## Previous-session FX recap and calls (FX tab)
The panel at the top of the FX tab summarises the latest New York FX session (the FX day ends at 5pm New York) for the 14 pairs on the tab: headline, a two-sentence summary, the 2–3 themes that moved currencies, Claude's dollar view and highest-conviction calls, and — folded under "All 14 pairs" — a one-line read plus a 1–2 week call per pair (direction, entry zone, target and the level that would prove it wrong). The narrative and calls are `data/fx-recap.json`; Claude rewrites it after each New York close (scheduled task "Stock dashboard: daily FX recap", Tue–Sat ~7:12 SGT). `assets/fx-recap.js` computes each pair's close and day/week change from the daily bars in `data/fx.json` (the same data as the tiles and chart), so only the JSON's text needs updating. The deploy workflow copies the JSON into the site.

## USD/IDR forward curve (FX tab)
Below the FX chart: indicative USD/IDR outright forwards from 1 week to 2 years (offshore rupiah forwards are NDFs), with bid / ask / mid, points, annualised carry and the 1-day change in points. "Curve" overlays the curve 1 week and 1 month ago; "History" plots spot, 1M, 3M and 1Y over time. `scripts/fetch-fwd.mjs` scrapes FXEmpire's forward-rates page (fallback: Investing.com's points on the CNBC spot) into `data/fx-fwd.json` on every deploy; the after-close data workflow (`ta-data.yml`) runs it with `FWD_CLOSE=1` and commits the file, which is how one curve a day is saved for the overlays and history. `assets/fx-fwd.js` draws it.

## How the live price works
- A GitHub Action (`.github/workflows/deploy.yml`) runs every 10 minutes during US market hours, fetches each symbol's quote and daily closes from Yahoo Finance (`scripts/fetch-quote.mjs SYMBOL OUTDIR RANGE`), and redeploys the site. No commits are made.
  - ARM → `arm/data/quote.json`, `arm/data/history.json`
  - TSLA → `tesla/data/quote.json`, `tesla/data/history.json` (2 years of closes, so the 50-day average covers the full 1-year chart)
  - SNDK → `sndk/data/quote.json`, `sndk/data/history.json` (all closes since the Feb 2025 listing)
  - INTC → `intc/data/quote.json`, `intc/data/history.json` (2 years of closes)
- Each page reloads its quote every minute, so the price, change, market cap, YTD and chart update without a refresh.
- The TradingView box under the price is tick-by-tick real time.
- Fundamentals (quarterly table, ratios, guidance, key cells, watch list, calendar, free cash flow) live in `specs/<ticker>.json` and are rebuilt into the page with `python3 scripts/make-stock-page.py specs/<ticker>.json` (ARM, Tesla, Sandisk and Intel have no spec and are edited in their `index.html` and `fcf-data.js`). A Claude scheduled task ("earnings review refresh", Tue–Sat 07:45 SGT) checks every stock for a new quarterly report and updates its fundamentals, ratios and management review once the report is out.

## Technical analysis section
- `assets/technicals.js` adds a "Technical analysis" section (and a Technicals link in the page menu) to every stock page: interactive daily candlesticks with SMA 5/10/30/100, Parabolic SAR (0.02, 0.2) and the key levels, MACD (12, 26, 9) and RSI (14) panes, ranges 1M–2Y, and a live signal table with a bullish/bearish count. It draws from `data/history.json`, so it updates with each price refresh.
- The written read and support/resistance levels live in `<stock>/ta.json` (EN and 中文, dated). They are rewritten every weekday morning (Singapore time) after the US close by a Claude scheduled task.
- Data for that refresh: `.github/workflows/ta-data.yml` runs after the close (21:25 UTC, Mon–Fri), saves each stock's daily OHLC to `<stock>/data/history.json` in the repo and writes `data/ta-snapshot.json` with `scripts/ta-snapshot.py` (SMAs and slopes, MACD, RSI, Parabolic SAR, ATR, swing highs/lows and whether each written level still holds; same maths as the page). Run `python3 scripts/ta-snapshot.py --text` locally for a readable version. SK hynix's `ta.json` has two series (Nasdaq ADS and the Seoul listing, `skhy/data/krx/history.json`), shown with a toggle.

## Top movers
- `assets/movers.js` shows the latest session's 5 biggest gainers on the left of the main page and the 5 biggest losers on the right (under the stock cards on smaller screens), each as a candlestick chart with 5/10/30/100-day moving averages, Parabolic SAR and MACD (12, 26, 9), drawn with TradingView Lightweight Charts. The lists re-rank with every price refresh (every 10 minutes in US market hours plus the closing print), so they follow each trading day and hold the last session outside market hours. Indicator and range buttons are remembered per browser.
- `scripts/fetch-quote.mjs` saves daily open/high/low as well as close in `history.json`.

## Pelosi, Trump, Druckenmiller and Thiel portfolios (main page)
- `assets/portfolios.js` adds four panels under the top movers: Nancy Pelosi's household portfolio and, below it, Donald Trump's personal stock book on the left; Stanley Druckenmiller's (Duquesne Family Office LLC) and, below it, Peter Thiel's (Thiel Macro LLC) on the right. Each has a performance chart vs the S&P 500 (SPY), a holdings table with weights and notes.
- Trump (`trump`) uses the same fixed-weight model as Pelosi: estimated values from his 2025 OGE annual disclosure (Unusual Whales estimates), with Trump Media (DJT) about 59% and the rest of his index-like stock book modelled as SPY; the trades list is the largest rows from the latest OGE 278-T. Update it by hand when a new 278-T or annual report is released. Thiel (`thiel`) uses the same 13F format as Druckenmiller (CIK 1562087).
- Holdings live in `data/portfolios.json`. Pelosi: estimated weights (Pelosi Tracker) plus every 2026 stock/option row from her House periodic transaction reports; the return is a model (fixed weights, rebalanced daily). Druckenmiller (`druck`): exact share counts from the latest 13F (CIK 1536411) as `[ticker, name, shares, value]`, with a fifth field `"call"` on call-option rows (valued at the underlying shares, as filed), marked to market since the quarter end. Weight = each row's share of the total marked value; the panel lists the top 15 and folds the rest under "Other positions".
- Live prices: every price refresh (`deploy.yml`, every 10 minutes in US market hours) prices every holding and SPY (dashboard stocks reuse their own quotes, the rest are fetched 8 at a time) and rebuilds `data/portfolios-perf.json` with `build-portfolios.py pf-data --no-filings`, so prices, weights, day and YTD moves, values and charts follow the session. The panels reload every minute and show "live h:mm ET" while the market is open, "close <date>" otherwise.
- `scripts/build-portfolios.py` also runs in `.github/workflows/ta-data.yml` after each US close (with the filing check): it fetches prices for every holding and SPY, writes `data/portfolios-perf.json`, and checks SEC EDGAR and the House Clerk index for new filings. A new filing shows a "review pending" flag on the panel until `data/portfolios.json` is updated (the daily Claude scheduled task does this).

## Extended-hours (24-hour) price
- `scripts/fetch-quote.mjs` adds `ext` to each `data/quote.json` when the regular session is closed: `{session: pre|post|overnight, price, time, chg (% vs last regular price), source}`, first from Robinhood's public 24/5 quote feed (the only free source found that carries overnight-session trades, routed via Blue Ocean ATS), then Yahoo's quote (pre/post fields), Yahoo's intraday chart with pre/post bars, then Nasdaq. Yahoo, Nasdaq and CNBC do not publish overnight trades. Only a trade newer than the regular price and under 20 hours old is kept, so from Friday 8pm to Sunday 8pm ET (no trading) the cards show the Friday close only.
- `assets/ext-hours.js` (loaded by every stock page) shows it under the big price and as a chip in the top bar, in EN / 中文, and hides it during regular hours.
- `.github/workflows/deploy.yml` refreshes every 15 minutes outside regular hours from Sunday 8pm to Friday 8pm ET (dispatched by `heartbeat.yml`), on top of the 10-minute refresh during the session.

## Portfolio tab (`portfolio/`)
- A rules-based momentum portfolio of at most five dashboard stocks, no stock above 25%, rebalanced at each Friday close for the highest expected Sharpe ratio, with a volatility control (35% a year, 21-session forecast) that moves part to cash. Full rules are on the page and at the top of `scripts/momentum-portfolio.py`.
- `scripts/momentum-portfolio.py` (standard library only) backtests the rules walk-forward on every `<stock>/data/history.json` and writes `data/momentum-portfolio.json`: daily NAV (with and without the volatility control), equal-weight and SPY benchmarks, drawdowns, the five deepest drawdowns with the stocks that drove them, a bootstrap of next-year drawdowns for today's mix, current holdings, a preview of the next rebalance and every stock's momentum score. SPY history comes from `data/bench/SPY/history.json`.
- Both run in `ta-data.yml` after each US close, so the tab updates by itself; `assets/momentum.js` renders it (Lightweight Charts for growth and drawdown).

## Macro page (`macro/`, "Macro" tab on the main page)
- Tiles, a daily candlestick chart (SMA 5/10/30/100, Parabolic SAR, MACD and RSI panes, each toggleable) and the yield curve for WTI crude, gold, silver and the 2/5/10/30-year Treasury yields; the economic calendar; macro news. Rendered by `assets/macro.js` (news by `assets/news.js` with `data-src="../data/macro-news.json"`).
- `scripts/fetch-macro.mjs` (run in the deploy workflow) writes `data/macro.json`: live quotes from CNBC's quote service (Tradeweb yields, CME/COMEX front-month futures; Yahoo as fallback), about 400 daily OHLC bars from CNBC (Yahoo, then the US Treasury par yield curve with closes only, as fallbacks). It also writes `data/macro-cal.json` from the Forex Factory weekly calendar (this week and next; forecast and previous).
- `node scripts/fetch-news.mjs macro` writes `data/macro-news.json` (14 days; topics OIL, GOLD, SILVER, RATES, FED, ECON).
- The committed `data/macro*.json` files are empty placeholders; each deploy fills them, and a failed source falls back to them.

## News feed
- `scripts/fetch-news.mjs` pulls the last 30 days of headlines for every stock from Google News RSS and Yahoo Finance RSS and writes `data/news.json` (newest first, up to 80 per stock, duplicates removed). The Action runs it every hour, every day, plus on every price refresh.
- `assets/news.js` shows the feed on the main page (with filter chips per stock) and on each stock page (that stock only). To add a stock, add it to `STOCKS` in the script and to `data-tickers` on the main page.

## Analyst ratings section
- `assets/analysts.js` adds an "Analyst ratings and price targets" section (and an Analysts link in the menu) after the holders: consensus rating, average / median / high / low target and upside from the live price, upgrades, downgrades and initiations in the last 90 days, the rating mix now vs. 3 months ago, each firm's latest target plotted against the price, and a table of every firm's rating, change and target (latest per firm or all actions; filter by upgrades, downgrades, initiations or target changes; 3 / 6 / 12 months). EN / 中文.
- Data: `node scripts/fetch-analysts.mjs` reads Yahoo Finance (upgrade/downgrade history, recommendation trend, financial data) into `<stock>/analysts.json`; `.github/workflows/analysts.yml` runs it before the open and after the close on weekdays and commits changes. If Yahoo's firm-level feed for a stock goes quiet, the page says so (META's stops in Sep 2024) while the consensus figures stay current.

## Management review and leadership sections
- `assets/mgmt.js` adds two sections (and Review / CEO & CFO links in the page menu) after the revenue charts on every stock page, in EN / 中文:
  - **Management's review of the quarter**: two short paragraphs, the latest quarter's results with management's view and direction, then how the stock traded during and after the report and what drove it. Three cells show the report date, the first-session move and the move since the report (computed live from `data/history.json` when available, otherwise the written figure).
  - **CEO and CFO**: a short background on each, with the year they took the role.
- Text lives in `<stock>/mgmt.json` (written Oct 11, 2026; each section is kept under 10 lines on desktop). Refresh it after each earnings report: update `reported`, `pre_close`, `react`, `since`, the two `review` paragraphs and `sources`, and the executives if either changes.

## Options and volatility section
- `assets/options.js` adds an "Options and volatility" section (and an Options link in the page menu) after the technicals: implied vs. realized volatility over 6 months (IV30, realized 10 and 30-day, and the IV − RV30 spread), summary cells (IV30, RV30, IV ÷ RV, IV rank, expected move, put/call open interest) and an option chain with an expiry picker and strike-range filter. EN / 中文.
- Chain: `node scripts/fetch-options.mjs chain` pulls Cboe's delayed quotes (15-minute delay; IV and delta are Cboe's) into `<stock>/data/options.json` on every price refresh, trimmed to the nearest 6 expiries plus the monthlies out to about 13 months and strikes 60–160% of the price.
- IV history: `node scripts/fetch-options.mjs iv` runs daily after the close (`.github/workflows/vol.yml`) and adds the day's 30-day IV to `<stock>/vol.json`, which is committed. The history was seeded from alphaquery, which serves about 3 months free (from Jul 10, 2026), so the IV line reaches the full 6 months in January 2027. Realized volatility is computed in the browser from `data/history.json`.

## Top 20 shareholders section
- `assets/holders.js` adds a "Top 20 shareholders" section (and a Holders link in the page menu) after the cash flow section on every stock page: the 20 largest institutional holders with their shares at the last three 13F quarter ends (6 months), % of the company, the 6-month change and a status (new / added / trimmed / steady), plus who left the top 20. EN / 中文.
- Data: `scripts/fetch-holders.py` reads the SEC Form 13F data sets and writes `<stock>/holders.json`. `.github/workflows/holders.yml` runs it every Monday (and on demand from the Actions tab), commits any change and redeploys. A new 13F quarter appears about 45 days after each quarter end.
- The SEC asks automated downloads to identify a contact. Set it once under Settings → Secrets and variables → Actions → Variables as `SEC_USER_AGENT` (e.g. `stock-dashboard you@example.com`).
- 13F covers US institutional managers only: founders, parent companies (SoftBank in Arm), foreign holders and retail are not included. CUSIPs are listed in the script; a new stock needs a line in `STOCKS` there.

## Free cash flow section
- `assets/fcf.js` renders the "Free cash flow, by quarter" section (chart, quarterly table, estimates, cash in/out analysis, cash bridge) into `<section id="cashflow">` on each page, in EN / 中文.
- Each stock's numbers and text live in `<stock>/fcf-data.js` (`hist` = reported quarters, `est` = estimates, as [quarter, ended, operating CF, capex, FCF] in US$M). After each earnings report, move the reported quarter from `est` to `hist` and roll the estimates forward.

Note: GitHub pauses scheduled workflows in a repo with no activity for 60 days. Re-enable it from the Actions tab if that happens.

## Publish on GitHub Pages
1. Create a public repo named `stock-dashboard`.
2. Upload everything in this repo.
3. Settings → Pages → Source: **GitHub Actions**.
4. Sites appear at `https://angcharles.github.io/stock-dashboard/` plus `/arm/`, `/tesla/`, `/sndk/` and `/intc/`.

For information only, not investment advice. Not affiliated with Arm Holdings plc, Tesla, Inc., Sandisk Corporation or Intel Corporation.

## Adding a stock
Newer pages (SPCX, MU, LITE, COHR, GOOGL, META, NVDA, ZS, BE, AAOI, AMD, MP, AMZN, MSFT, MRVL, SKHY, TSM, AVGO, ROK, AMAT, ASML, PLTR, GLW, TER) are generated: edit `specs/<stock>.json` and run `python3 scripts/make-stock-page.py specs/<stock>.json`. Shared code is in `assets/stock-page.js` and `assets/stock.css`; price cells (52-week range, moving averages, RSI, drawdown) are computed from the live price history. For a new stock, copy a spec, generate the page, then write `<stock>/ta.json`, add the fetch line and the folder name in the copy loop of `.github/workflows/deploy.yml`, a card to the root `index.html`, an entry to `STOCKS` in `scripts/fetch-news.mjs` and `assets/movers.js`. TSMC and SK hynix figures are converted to US$ from NT$ and won at each quarter's rate (see the specs).

Older pages: Copy a stock folder (e.g. `intc/`), edit its `index.html` and seed `data/`, add a fetch line and copy lines to `.github/workflows/deploy.yml`, and add a card to the root `index.html`.

## Share unlock schedule (SpaceX)
- `assets/unlocks.js` adds a "Share unlock schedule" section with a timeline chart (every released and upcoming tranche as shares, market value or days of volume, plus cumulative % unlocked and a today marker) (and an Unlocks link in the menu) to any page that has an `unlocks.json` next to it — currently `spcx/`. Each lock-up tranche shows its shares, % of shares outstanding, market value at the live price, and size as a % of the 20-session average daily volume (from the `v` volume array that `scripts/fetch-quote.mjs` now writes to `history.json`). Status (released / next / upcoming) follows today's date.
- Tranche dates and sizes come from the IPO prospectus (424B4). Earnings-linked tranches carry estimated dates; when SpaceX announces a results date, set that tranche's `date` to the second full trading day after it and `"fixed": true` in `spcx/unlocks.json`.

## AI debt section (Datacenter tab)
- `assets/aidebt.js` renders "AI debt: who is borrowing and when it comes due" on `datacenter/index.html`: summary cells, a by-borrower table (amount, average coupon, maturity span, next maturity), a maturity wall (principal due by year, stacked by borrower or by type, hover for the split, click a bar to filter) and a table of every bond (filter by borrower, type, currency, maturity and text; sort any column; one row per bond or per deal with expandable tranches and sources; CSV download).
- Data: `data/ai-debt.json`, one entry per deal with its tranches as `[maturity, amount in millions of the deal currency, coupon]`, from the SEC filings and pricing announcements listed in `sources`. Covers Alphabet, Amazon, Meta and Oracle bonds since Sep 2025, SpaceX (xAI), CoreWeave, SoftBank's OpenAI-funding bond and the project-SPV bonds behind hyperscaler leases. Add a deal when one prices; non-US-dollar amounts convert at the live FX tab rates (`data/fx.json`), with `fxFallback` as backup.

## Datacenter tab
- `datacenter/index.html` (tab on every section page) covers Microsoft, Amazon (AWS), Alphabet, Meta, Oracle, Alibaba Cloud, CoreWeave, Nebius, SpaceX AI (xAI), OpenAI (Stargate), Equinix and Digital Realty: their CPUs, GPUs and custom chips, power online and targeted in gigawatts, capex, latest revenue by segment, and the 2026–2028 revenue outlook, plus a chip price and rental table. The three charts are interactive: switch measures (revenue / growth, capex / capex-to-revenue), show or hide series, sort, filter by group, hover or tap a row for detail, and click to jump to the company card.
- All figures live in `data/datacenter.json` (rendered by `assets/datacenter.js`), dated in the file and edited by hand after each earnings season. Estimates and single-broker numbers are labelled, and every company card lists its sources.
