"""Turns a company's raw numbers into scores, plain-language reasons, strategies and sell flags.

Two separate questions, on purpose:
  quality  - is this a good business?  (profitability, growth, financial safety)
  value    - is the price reasonable?  (what you pay for each unit of profit)
"""
import re

from . import config as C

FIN = "Financial Services"
HEAVY_DEBT_OK = ("Real Estate", "Utilities")  # these normally run on a lot of debt
# Industries whose profits swing between boom and bust. A low P/E there often marks a boom year.
CYCLICAL = re.compile(r"oil|gas|gold|silver|copper|steel|alumin|mining|metals|semiconductor|auto|airline|shipping|marine"
                      r"|chemical|residential construction|lumber|coal|uranium", re.I)


def is_cyclical(c):
    return c.get("sector") in ("Energy", "Basic Materials") or bool(CYCLICAL.search(c.get("industry") or ""))


def lin(x, lo, hi):
    """Map x to 0..100, linearly between lo (0) and hi (100). lo > hi means 'lower is better'."""
    if x is None:
        return None
    f = (x - lo) / (hi - lo)
    return max(0.0, min(1.0, f)) * 100


def _avg(parts):
    """parts: [(score or None, weight)] -> (weighted average or None, found, expected)."""
    got = [(s, w) for s, w in parts if s is not None]
    if not got:
        return None, 0, len(parts)
    return sum(s * w for s, w in got) / sum(w for _, w in got), len(got), len(parts)


def score(c):
    """c: company dict with 'sector' and 'm' (metrics). Returns the scores dict."""
    m, sec = c["m"], c.get("sector")
    fin = sec == FIN
    g = m.get

    if fin:
        profit = [(lin(g("roe"), 0.04, 0.18), 2), (lin(g("npm"), 0.05, 0.30), 1)]
    else:
        profit = [(lin(g("roe"), 0.03, 0.25), 1.5), (lin(g("opm"), 0.03, 0.28), 1.5), (lin(g("roa"), 0.01, 0.12), 1)]

    growth = [(lin(g("revg"), -0.05, 0.18), 1.5), (lin(g("epsg"), -0.10, 0.25), 0.5), (lin(g("cagr"), 0.0, 0.15), 1.5)]

    calm = lin(g("beta"), 1.7, 0.6)
    if fin:
        safety = [(lin(g("roa"), 0.003, 0.015), 2), (calm, 1)]
    elif sec in HEAVY_DEBT_OK:
        safety = [(lin(g("de"), 300, 80), 2), (lin(g("fcfy"), -0.02, 0.04), 1), (calm, 1)]
    else:
        safety = [(lin(g("de"), 200, 30), 2), (lin(g("cr"), 0.8, 2.0), 1),
                  (lin(g("fcfy"), 0.0, 0.05), 1.5), (lin(g("netcash"), -0.4, 0.1), 1), (calm, 0.5)]

    pe = g("fpe") if g("fpe") is not None else g("pe")
    if pe is not None and pe <= 0:
        pe_s = 0.0  # losing money
    else:
        pe_s = lin(pe, 22, 7) if fin else lin(pe, 40, 12)
    if fin:
        value = [(pe_s, 2), (lin(g("pb"), 3.0, 0.8), 1.5)]
    else:
        value = [(pe_s, 2), (lin(g("peg"), 3.0, 1.0), 1.5), (lin(g("evebitda"), 25, 8), 1), (lin(g("fcfy"), 0.01, 0.07), 1)]

    out, found, expected = {}, 0, 0
    for name, parts in (("profit", profit), ("growth", growth), ("safety", safety), ("value", value)):
        s, f, e = _avg(parts)
        out[name] = None if s is None else round(s)
        found += f
        expected += e
    q, _, _ = _avg([(out["profit"], 0.4), (out["growth"], 0.3), (out["safety"], 0.3)])
    out["quality"] = None if q is None or out["profit"] is None else round(q)
    out["coverage"] = round(found / expected, 2)
    return out


def pct(x, d=0):
    return f"{x * 100:.{d}f}%"


def reasons(c):
    """Plain-language good / bad points, strongest first."""
    m, fin = c["m"], c.get("sector") == FIN
    g = m.get
    good, bad = [], []
    if is_cyclical(c):
        bad.append("Profits in this industry swing between boom and bust years, so a low P/E today can be misleading")

    def add(val, hi, lo, good_t, bad_t, higher_better=True):
        if val is None:
            return
        if (val >= hi) if higher_better else (val <= hi):
            good.append(good_t)
        elif (val <= lo) if higher_better else (val >= lo):
            bad.append(bad_t)

    if g("roe") is not None:
        add(g("roe"), 0.18, 0.07, f"Earns {pct(g('roe'))} a year on shareholders' money (ROE) - a sign of a strong business",
            f"Earns only {pct(g('roe'))} on shareholders' money (ROE) - weak")
    if not fin and g("opm") is not None:
        add(g("opm"), 0.20, 0.06, f"Keeps {pct(g('opm'))} of every sale as operating profit - high margins",
            f"Keeps only {pct(g('opm'))} of every sale as operating profit - thin margins")
    if g("revg") is not None:
        add(g("revg"), 0.10, 0.0, f"Sales are growing {pct(g('revg'))} a year",
            f"Sales are shrinking ({pct(g('revg'))} vs last year)")
    if g("cagr") is not None:
        add(g("cagr"), 0.10, 0.0, f"Sales grew about {pct(g('cagr'))} a year over the last few years - consistent growth",
            "Sales have not grown over the last few years")
    if not fin and g("de") is not None:
        lim = 250 if c.get("sector") in HEAVY_DEBT_OK else 150
        add(g("de"), 50, lim, "Low debt compared with what the company owns",
            f"Carries a lot of debt (debt is {g('de') / 100:.1f}x shareholders' equity)", higher_better=False)
    if not fin and g("fcfy") is not None:
        add(g("fcfy"), 0.04, 0.0, f"Produces real spare cash every year ({pct(g('fcfy'), 1)} of its market value)",
            "Is not producing spare cash right now")
    pe = g("fpe") if g("fpe") is not None else g("pe")
    if pe is not None:
        if pe <= 0:
            bad.append("Is currently losing money")
        else:
            hi, lo = (10, 18) if fin else (16, 35)
            add(pe, hi, lo, f"Price is {pe:.0f}x yearly profit (P/E) - reasonable",
                f"Price is {pe:.0f}x yearly profit (P/E) - expensive, a lot of future growth is already paid for", higher_better=False)
    if c.get("offHigh") is not None and c["offHigh"] >= C.PULLBACK_MIN:
        good.append(f"Trades {c['offHigh']:.0f}% below its highest price of the past year")
    return good[:5], bad[:4]


def strategies(c):
    s, m = c["s"], c["m"]
    q, v = s.get("quality") or 0, s.get("value") or 0
    out = []
    solid = q >= C.QUALITY_MIN and (s.get("safety") or 0) >= C.SAFETY_MIN
    if solid and v >= C.VALUE_MIN_SALE and (c.get("offHigh") or 0) >= C.PULLBACK_MIN:
        out.append("sale")
    if solid and v >= C.VALUE_MIN_FAIR:
        out.append("fair")
    if (s.get("profit") or 0) >= 70 and (s.get("growth") or 0) >= 70:
        out.append("compounder")
    if (m.get("divy") or 0) >= 0.025 and (m.get("payout") or 9) < 0.75 and q >= 55 and (s.get("safety") or 0) >= 50:
        out.append("dividend")
    if (s.get("safety") or 0) >= 80 and (s.get("profit") or 0) >= 60:
        out.append("fortress")
    return out


def opportunity(c):
    """'strong' = great business on sale at a sensible price. 'good' = great business at a fair price."""
    if (c["s"].get("coverage") or 0) < C.COVERAGE_MIN or not c.get("price"):
        return None
    st = c.get("strategies", [])
    if is_cyclical(c):  # stricter, and never the top grade: boom-year numbers flatter these companies
        return "good" if "fair" in st and c["s"]["quality"] >= 85 and (c["m"].get("cagr") or 0) > 0.05 else None
    if "sale" in st:
        return "strong"
    if "fair" in st:
        return "good"
    return None


def sell_flags(c, q_before=None):
    """Reasons a long-term owner should reconsider. A falling price alone is never one of them."""
    s, m = c["s"], c["m"]
    q = s.get("quality")
    flags = []
    if (s.get("coverage") or 0) < C.COVERAGE_MIN or q is None:
        return flags
    if q < 40:
        flags.append({"code": "weak", "level": "sell",
                      "text": f"Business quality is weak (score {q}/100). The reasons to own it for the long term are thin."})
    elif (m.get("revg") or 0) < -0.10 and (m.get("npm") or 0) < 0:
        flags.append({"code": "weak", "level": "sell",
                      "text": "Sales are falling fast and the company is losing money."})
    if q_before is not None and q_before - q >= 15:
        flags.append({"code": "falling", "level": "review",
                      "text": f"Business quality dropped from {q_before} to {q} in recent months. Find out what changed."})
    pe = m.get("fpe") if m.get("fpe") is not None else m.get("pe")
    if (s.get("value") or 50) < 15 and pe and pe > 45:
        flags.append({"code": "pricey", "level": "trim",
                      "text": f"Price is {pe:.0f}x yearly profit - very expensive. Consider selling part and keeping the rest."})
    ai = c.get("ai") or {}
    if ai.get("impact") == "thesis_risk":
        flags.append({"code": "news", "level": "review",
                      "text": "Recent news may hurt the long-term story: " + ai.get("summary", "")})
    return flags


def evaluate(c, q_before=None):
    """Fill in every derived field on a company dict."""
    c["s"] = score(c)
    c["cyc"] = is_cyclical(c)
    c["strategies"] = strategies(c)
    c["opp"] = opportunity(c)
    c["good"], c["bad"] = reasons(c)
    c["sell"] = sell_flags(c, q_before)
    return c
