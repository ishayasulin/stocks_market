"""The agent. Run with:  python -m agent.run [--mode auto|full|quick] [--limit N]

full  - rebuild everything: company list, financial numbers, multi-year statements, news, price history
quick - only refresh prices and re-check for opportunities (used between full scans)
auto  - full if the last full scan is older than 20 hours, otherwise quick
"""
import argparse
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

from . import config as C
from . import data, news, notify, scoring
from .data import log

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"
SITE_URL = os.environ.get("SITE_URL", "https://ishayasulin.github.io/stocks_market/")


def load(path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def rounded(o):
    if isinstance(o, float):
        return round(o, 4)
    if isinstance(o, dict):
        return {k: rounded(v) for k, v in o.items()}
    if isinstance(o, list):
        return [rounded(v) for v in o]
    return o


def read_watchlist():
    p = ROOT / "watchlist.txt"
    if not p.exists():
        return []
    return [ln.split("#")[0].strip().upper() for ln in p.read_text().splitlines() if ln.split("#")[0].strip()]


def days_ago(d):
    return (date.today() - date.fromisoformat(d)).days


def quality_before(state, t):
    """Quality score from 2-6 months ago, if we have one."""
    old = [q for d, q in state["qhist"].get(t, []) if 60 <= days_ago(d) <= 180]
    return old[-1] if old else None


def full_scan(state, watchlist, limit):
    log("Building the list of companies...")
    uni = data.build_universe(watchlist)
    if limit:
        uni = dict(list(uni.items())[:limit] + [(t, data.market_of(t)) for t in watchlist])
    log(f"Fetching numbers for {len(uni)} companies...")
    seen, companies = set(), []
    for c in data.fetch_companies(uni):
        if c["name"] not in seen or c["t"] in watchlist:  # skip second share classes of the same company
            seen.add(c["name"])
            companies.append(c)
    data.add_cross_currency(companies, data.fx_rates({c["cur"] for c in companies} | {c["fcur"] for c in companies}))
    for c in companies:
        scoring.evaluate(c)

    ranked = sorted(companies, key=lambda c: -(c["s"]["quality"] or 0))
    deep = {c["t"]: c for c in ranked[:C.DEEP_DIVE_TOP] + [c for c in companies if c["t"] in watchlist]}
    log(f"Reading multi-year statements for {len(deep)} companies...")
    with ThreadPoolExecutor(3) as ex:
        list(ex.map(data.fetch_deep, deep.values()))
    for c in companies:
        scoring.evaluate(c)

    cands = sorted([c for c in companies if c["opp"]], key=rank_key)[:C.NEWS_TOP]
    readers = {c["t"]: c for c in cands + [c for c in companies if c["t"] in watchlist]}
    log(f"Reading news for {len(readers)} companies...")
    for c in readers.values():
        c["news"] = data.fetch_news(c)
    state["news"] = news.analyse(list(readers.values()), state.get("news", {}))

    log("Downloading price history...")
    hist = data.fetch_history([c["t"] for c in companies])
    (OUT / "h").mkdir(parents=True, exist_ok=True)
    for c in companies:
        h = hist.get(c["t"])
        if h:
            scale = c["price"] / h["c"][-1] if h["c"][-1] else 1  # history can be in agorot / pence
            if abs(scale - 1) > 0.5:
                h["c"] = [round(v * scale, 4) for v in h["c"]]
            (OUT / "h" / f"{c['t']}.json").write_text(json.dumps(h, separators=(",", ":")))
    return companies


def quick_scan(companies):
    log(f"Refreshing prices for {len(companies)} companies...")
    px = data.latest_prices([c["t"] for c in companies])
    for c in companies:
        if c["t"] not in px or not c.get("price"):
            continue
        last, prev = px[c["t"]]
        unit = round(last / c["price"]) if last / c["price"] > 50 else 1  # agorot / pence quotes
        new = last / unit
        k = new / c["price"]
        if not 0.5 < k < 2:
            continue  # split or bad tick: wait for the next full scan
        c["price"], c["chg"] = new, (last / prev - 1) * 100
        c["hi52"] = max(c.get("hi52") or new, new)
        c["offHigh"] = round((1 - new / c["hi52"]) * 100, 1)
        if c.get("mcap"):
            c["mcap"] *= k
        if c.get("mcapUsd"):
            c["mcapUsd"] *= k
        m = c["m"]
        for f in ("pe", "fpe", "peg", "pb"):
            if m.get(f) is not None:
                m[f] *= k
        for f in ("fcfy", "netcash", "divy"):
            if m.get(f) is not None:
                m[f] /= k
    return companies


def rank_key(c):
    return (0 if c["opp"] == "strong" else 1, -((c["s"]["quality"] or 0) * 0.6 + (c["s"]["value"] or 0) * 0.4))


def make_alerts(companies, state, watchlist):
    today = date.today().isoformat()
    fresh = lambda key: key not in state["alerted"] or days_ago(state["alerted"][key]) >= C.REALERT_DAYS
    out = []

    def add(c, kind, level, key, title, text, points):
        state["alerted"][key] = today
        out.append({"id": f"{key}:{today}", "date": today, "ts": int(time.time()), "type": kind, "level": level,
                    "t": c["t"], "name": c["name"], "title": title, "text": text, "points": points,
                    "price": c["price"], "cur": c["cur"]})

    for c in sorted([c for c in companies if c["opp"] and fresh(c["t"] + ":buy")], key=rank_key)[:C.MAX_NEW_ALERTS]:
        s = c["s"]
        title = f"{c['name']}: quality business on sale" if c["opp"] == "strong" else f"{c['name']}: quality business at a fair price"
        text = f"Business quality {s['quality']}/100, price score {s['value']}/100."
        if (c.get("offHigh") or 0) >= C.PULLBACK_MIN:
            text += f" It trades {c['offHigh']:.0f}% below its highest price of the past year."
        if (c.get("ai") or {}).get("by") == "ai":
            text += " News: " + c["ai"]["summary"]
        add(c, "buy", c["opp"], c["t"] + ":buy", title, text, c["good"][:3] + ["Watch out: " + b for b in c["bad"][:1]])

    for c in companies:
        if c["t"] in watchlist:
            for f in c["sell"]:
                key = f"{c['t']}:{f['code']}"
                if fresh(key):
                    word = {"sell": "consider selling", "trim": "consider selling part", "review": "time to review"}[f["level"]]
                    add(c, "sell", f["level"], key, f"{c['name']}: {word}", f["text"], c["bad"][:3])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="auto", choices=["auto", "full", "quick"])
    ap.add_argument("--limit", type=int, default=0, help="scan only the first N companies (for testing)")
    ap.add_argument("--no-email", action="store_true")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    prev = load(OUT / "data.json", {})
    state = {"alerted": {}, "qhist": {}, "news": {}, **load(OUT / "state.json", {})}
    watchlist = read_watchlist()
    now = int(time.time())

    mode = a.mode
    if mode == "auto":
        mode = "quick" if prev.get("companies") and now - prev.get("fullScan", 0) < 20 * 3600 else "full"
    if mode == "quick" and not prev.get("companies"):
        mode = "full"
    log(f"Mode: {mode}")

    if mode == "full":
        companies = full_scan(state, watchlist, a.limit)
        if len(companies) < max(5, len(prev.get("companies", [])) // 3):
            raise SystemExit(f"Only {len(companies)} companies came back - Yahoo is probably blocking. Keeping old data.")
    else:
        companies = quick_scan(prev["companies"])

    today = date.today().isoformat()
    for c in companies:
        scoring.evaluate(c, quality_before(state, c["t"]))
        hist = state["qhist"].setdefault(c["t"], [])
        if c["s"]["quality"] is not None and (not hist or days_ago(hist[-1][0]) >= 7):
            hist.append([today, c["s"]["quality"]])
            del hist[:-60]

    new_alerts = make_alerts(companies, state, watchlist)
    alerts = (new_alerts + prev.get("alerts", []))[:80]
    alerts = [x for x in alerts if days_ago(x["date"]) <= 90]

    out = {
        "updated": now, "updatedText": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "fullScan": now if mode == "full" else prev.get("fullScan", now),
        "ai": any((c.get("ai") or {}).get("by") == "ai" for c in companies),
        "watchlist": watchlist, "indices": data.fetch_indices() or prev.get("indices", []),
        "alerts": alerts, "companies": sorted(companies, key=lambda c: -(c.get("mcapUsd") or 0)),
    }
    (OUT / "data.json").write_text(json.dumps(rounded(out), separators=(",", ":"), ensure_ascii=False))
    (OUT / "state.json").write_text(json.dumps(state, separators=(",", ":")))

    opp = [c for c in companies if c["opp"]]
    log(f"Done: {len(companies)} companies, {len(opp)} opportunities "
        f"({sum(c['opp'] == 'strong' for c in opp)} strong), {len(new_alerts)} new alerts.")
    for x in new_alerts:
        log(f"  ALERT [{x['type']}/{x['level']}] {x['title']}")
    if not a.no_email:
        notify.send(new_alerts, SITE_URL)


if __name__ == "__main__":
    main()
