"""Everything that talks to Yahoo Finance (through the yfinance library)."""
import math
import time
from concurrent.futures import ThreadPoolExecutor

import yfinance as yf
from yfinance import EquityQuery as Q

from . import config as C

SUBUNIT = {"ILA": ("ILS", 100), "GBp": ("GBP", 100), "GBX": ("GBP", 100), "ZAc": ("ZAR", 100)}
MARKET_BY_SUFFIX = {
    "TA": "IL", "L": "UK", "DE": "DE", "PA": "FR", "AS": "NL", "SW": "CH", "CO": "DK", "ST": "SE", "OL": "NO",
    "MC": "ES", "MI": "IT", "BR": "BE", "T": "JP", "KS": "KR", "TW": "TW", "HK": "HK", "SZ": "CN", "SS": "CN",
    "NS": "IN", "TO": "CA", "AX": "AU",
}


def log(*a):
    print(*a, flush=True)


def num(x):
    try:
        x = float(x)
        return None if math.isnan(x) or math.isinf(x) else x
    except (TypeError, ValueError):
        return None


def retry(fn, tries=3, wait=4):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # Yahoo is flaky; back off and try again
            if i == tries - 1:
                raise
            time.sleep(wait * (i + 1))


def market_of(ticker):
    return MARKET_BY_SUFFIX.get(ticker.rsplit(".", 1)[1], "World") if "." in ticker else "US"


def build_universe(watchlist):
    """Returns {ticker: market label}. Screener picks first, then world leaders, then your watchlist."""
    uni = {}
    for market, region, exchanges, n in C.SCREENS:
        for sector in C.SECTORS:
            q = Q("and", [Q("eq", ["sector", sector]), Q("eq", ["region", region]), Q("is-in", ["exchange", *exchanges])])
            try:
                r = retry(lambda: yf.screen(q, sortField="intradaymarketcap", sortAsc=False, size=n))
                for x in r.get("quotes", []):
                    uni.setdefault(x["symbol"], market)
            except Exception as e:
                log(f"  screen failed {market}/{sector}: {e!r}"[:200])
            time.sleep(0.3)
    for t in C.WORLD + list(watchlist):
        uni.setdefault(t, market_of(t))
    return uni


def fx_rates(currencies):
    """{currency: value of 1 unit in USD}"""
    rates = {"USD": 1.0}
    for cur in sorted(set(currencies) - {"USD", None}):
        try:
            h = retry(lambda: yf.Ticker(f"{cur}USD=X").history(period="5d"))
            rates[cur] = float(h["Close"].dropna().iloc[-1])
        except Exception:
            log(f"  no FX rate for {cur}")
    return rates


def fetch_company(ticker, market):
    """One company's current numbers, normalised. Returns None if Yahoo has nothing useful."""
    try:
        i = retry(lambda: yf.Ticker(ticker).info)
    except Exception as e:
        log(f"  {ticker}: failed {e!r}"[:160])
        return None
    if not i or i.get("quoteType") != "EQUITY" or not (i.get("currentPrice") or i.get("regularMarketPrice")):
        return None
    cur, div = SUBUNIT.get(i.get("currency"), (i.get("currency"), 1))
    px = lambda k: None if num(i.get(k)) is None else num(i.get(k)) / div  # price-like fields
    g = lambda k: num(i.get(k))
    price = px("currentPrice") or px("regularMarketPrice")
    hi = px("fiftyTwoWeekHigh")
    c = {
        "t": ticker, "name": i.get("longName") or i.get("shortName") or ticker, "mkt": market,
        "country": i.get("country"), "cur": cur, "fcur": i.get("financialCurrency") or cur,
        "sector": i.get("sector"), "industry": i.get("industry"),
        "price": price, "chg": g("regularMarketChangePercent"),
        "mcap": g("marketCap"), "hi52": hi, "lo52": px("fiftyTwoWeekLow"),
        "ma200": px("twoHundredDayAverage"), "target": px("targetMeanPrice"),
        "offHigh": round((1 - price / hi) * 100, 1) if hi and price else None,
        "about": (i.get("longBusinessSummary") or "")[:600], "web": i.get("website"),
        "raw": {"fcf": g("freeCashflow"), "debt": g("totalDebt"), "cash": g("totalCash")},
        "m": {
            "pe": g("trailingPE"), "fpe": g("forwardPE"), "peg": g("trailingPegRatio"), "pb": g("priceToBook"),
            "roe": g("returnOnEquity"), "roa": g("returnOnAssets"), "opm": g("operatingMargins"),
            "npm": g("profitMargins"), "revg": g("revenueGrowth"), "epsg": g("earningsGrowth"),
            "de": g("debtToEquity"), "cr": g("currentRatio"), "evebitda": g("enterpriseToEbitda"),
            "divy": None if g("dividendYield") is None else g("dividendYield") / 100,
            "payout": g("payoutRatio"), "beta": g("beta"),
        },
    }
    return c


def fetch_companies(universe, workers=4):
    with ThreadPoolExecutor(workers) as ex:
        res = list(ex.map(lambda kv: fetch_company(*kv), universe.items()))
    return [c for c in res if c]


def add_cross_currency(companies, rates):
    """Numbers that need currency conversion: size in USD, cash yield, net cash."""
    for c in companies:
        r, fr, raw = rates.get(c["cur"]), rates.get(c["fcur"]), c.pop("raw", {})
        c["mcapUsd"] = c["mcap"] * r if c.get("mcap") and r else None
        if c["mcapUsd"] and fr:
            if raw.get("fcf") is not None:
                c["m"]["fcfy"] = raw["fcf"] * fr / c["mcapUsd"]
            if raw.get("debt") is not None and raw.get("cash") is not None:
                c["m"]["netcash"] = (raw["cash"] - raw["debt"]) * fr / c["mcapUsd"]


def fetch_deep(c):
    """Several years of sales, profit and spare cash - shows whether quality is consistent."""
    try:
        t = yf.Ticker(c["t"])
        inc, cf = retry(lambda: t.income_stmt), retry(lambda: t.cashflow)
        cols = sorted(inc.columns)[-4:]
        row = lambda df, name: [num(df.at[name, k]) if name in df.index and k in df.columns else None for k in cols]
        rev = row(inc, "Total Revenue")
        deep = {"years": [k.year for k in cols], "rev": rev, "ni": row(inc, "Net Income"), "fcf": row(cf, "Free Cash Flow")}
        pts = [(y, v) for y, v in zip(deep["years"], rev) if v and v > 0]
        if len(pts) >= 3 and pts[-1][0] > pts[0][0]:
            c["m"]["cagr"] = (pts[-1][1] / pts[0][1]) ** (1 / (pts[-1][0] - pts[0][0])) - 1
        c["deep"] = deep
    except Exception as e:
        log(f"  deep {c['t']}: {e!r}"[:160])


def fetch_history(tickers, period="5y", interval="1wk"):
    """{ticker: {"d": [days since 1970], "c": [close]}}, weekly closes."""
    out = {}
    for k in range(0, len(tickers), 60):
        chunk = tickers[k:k + 60]
        try:
            df = retry(lambda: yf.download(chunk, period=period, interval=interval, auto_adjust=True,
                                           progress=False, group_by="ticker", threads=True))
        except Exception as e:
            log(f"  history chunk failed: {e!r}"[:160])
            continue
        for t in chunk:
            try:
                s = (df[t]["Close"] if len(chunk) > 1 else df["Close"]).dropna()
                if hasattr(s, "columns"):
                    s = s.iloc[:, 0]
                if len(s) > 1:
                    out[t] = {"d": [int(ts.timestamp() // 86400) for ts in s.index], "c": [round(float(v), 4) for v in s.values]}
            except Exception:
                pass
    return out


def fetch_news(c, n=8):
    """Recent headlines for a company."""
    for query in (c["t"], c["name"]):
        try:
            items = retry(lambda: yf.Search(query, news_count=n, max_results=1).news, tries=2)
        except Exception:
            items = []
        if items:
            return [{"title": x.get("title"), "pub": x.get("publisher"), "ts": x.get("providerPublishTime"),
                     "link": x.get("link")} for x in items if x.get("title")][:n]
    return []


def fetch_indices():
    out = []
    for sym, name in C.INDICES.items():
        try:
            h = retry(lambda: yf.Ticker(sym).history(period="1y"))["Close"].dropna()
            last, hi = float(h.iloc[-1]), float(h.max())
            out.append({"sym": sym, "name": name, "price": round(last, 2),
                        "chg": round((last / float(h.iloc[-2]) - 1) * 100, 2),
                        "yr": round((last / float(h.iloc[0]) - 1) * 100, 1),
                        "offHigh": round((1 - last / hi) * 100, 1),
                        "spark": [round(float(v), 2) for v in h.iloc[::5].values]})
        except Exception as e:
            log(f"  index {sym}: {e!r}"[:160])
    return out


def latest_prices(tickers):
    """Quick refresh: {ticker: (last close, previous close)} in the quote's raw unit."""
    out = {}
    for t, h in fetch_history(tickers, period="5d", interval="1d").items():
        if len(h["c"]) >= 2:
            out[t] = (h["c"][-1], h["c"][-2])
    return out
