# Quality Stock Scout

An agent that scans companies on US, Israeli and world markets, finds high-quality businesses at sensible
prices, and tells you when there is a chance to invest or a reason to sell. It comes with a website that also
teaches you how to judge a company yourself, using live numbers.

It is a learning tool that screens companies by rules. It is not financial advice.

## What it does

- **Scans about 360 companies**: the 20 largest in each of 11 sectors in the US, the 10 largest per sector in
  Tel Aviv, and about 65 leading companies elsewhere. Anything in `watchlist.txt` is added.
- **Scores each company twice**: *business quality* (profitability, growth, financial safety) and *price*
  (what you pay for the profits). Long-term thinking: a falling share price is never a reason to sell by itself.
- **Alerts you** with a pop-up on the site and an email when a company passes the rules, and when a company
  on your watchlist shows a reason to sell.
- **Reads the news** for the best candidates. With an Anthropic API key, Claude explains what the headlines
  mean for a long-term owner. Without a key, a simple keyword reader is used.
- **Website**: Today, Explore (search by field: oil, electricity, banks, chips...), a page per company,
  My buys (record every purchase, see sell signals), Alerts, and Learn (ten lessons on live data).

## One-time setup (about 10 minutes)

1. **Merge this branch into `main`.** The schedule only runs from the main branch.
2. **Turn on the website**: repository Settings → Pages → Source: **GitHub Actions**.
   (On a free GitHub account the repository must be public for Pages to work.)
3. **Add secrets**: Settings → Secrets and variables → Actions → New repository secret.

   | Secret | What it is |
   |---|---|
   | `EMAIL_USER` | The Gmail address that sends the alerts |
   | `EMAIL_APP_PASSWORD` | A Gmail *app password* (Google Account → Security → 2-Step Verification → App passwords). Not your normal password. |
   | `EMAIL_TO` | Optional. Where to send alerts, if different from `EMAIL_USER` |
   | `ANTHROPIC_API_KEY` | Optional. Enables the AI news reader. Create one at console.anthropic.com. Costs a few cents per daily scan. |

   For a mail provider other than Gmail, also set `SMTP_HOST` and `SMTP_PORT`.
4. **Run it once**: Actions tab → "Scan markets" → Run workflow. After a few minutes your site is live at
   `https://<your-user>.github.io/stocks_market/`.

After that it runs by itself: every 3 hours on weekdays (a full rebuild once a day, price refreshes in
between) and once a day on weekends.

## Everyday use

- **Record a buy**: My buys tab → ticker, amount invested, price paid. Stored only in your browser. Use the
  backup box to move it to another device.
- **Get sell emails for what you own**: add the ticker to `watchlist.txt` (one per line, Yahoo Finance format:
  `AAPL`, `TEVA.TA`, `ASML.AS`). The watchlist holds tickers only, never amounts.
- **Track a company the agent does not scan**: add it to `watchlist.txt` too.
- **Change how strict the agent is**: edit the numbers in `agent/config.py`.

## How a company is judged

| Score | Built from |
|---|---|
| Profitability | Return on equity, operating margin, return on assets |
| Growth | Sales growth (1 year and 3-year average), profit growth |
| Safety | Debt, cash, free cash flow, price swings |
| **Business quality** | 40% profitability + 30% growth + 30% safety |
| **Price** | P/E, PEG, EV/EBITDA, free cash flow yield (P/E and price-to-book for banks) |

A company becomes a **chance to invest** when quality is 75+, safety is 50+, and either the price score is
62+ ("fair price") or the price score is 50+ and the share is 15% or more below its yearly high ("on sale").
Boom-and-bust industries (oil, mining, chips, cars) must clear a higher bar and never get the top grade.

A **sell signal** appears when business quality is weak (below 40), quality fell 15+ points in a few months,
the price is extreme (P/E above 45 with a very low price score), or the news suggests long-term damage. The
site adds one more for your own holdings: a single company above 25% of your money.

## Run it on your computer

```bash
pip install -r agent/requirements.txt
```

```bash
python -m agent.run --mode full --no-email
```

```bash
python -m http.server 8000 -d site
```

Then open http://localhost:8000. Tests: `python -m pytest tests`.

## Limits to know about

- Data comes from Yahoo Finance through the unofficial `yfinance` library. It can be delayed, incomplete
  (especially for smaller Tel Aviv companies) or occasionally wrong, and Yahoo can block automated requests.
  If a scan fails, the site keeps showing the previous one.
- "Live" means the latest scan: up to 3 hours old on weekdays.
- Scores are simple rules on reported numbers. They cannot see the future, management quality, or anything
  not yet in the numbers. Use them to decide what to read about, not what to buy.
