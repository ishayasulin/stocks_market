"""Reads the headlines for the most interesting companies.

With an ANTHROPIC_API_KEY, Claude reads them and explains in plain language what matters for a
long-term owner. Without a key (or if the call fails) a simple keyword reader is used instead.
"""
import hashlib
import json
import os

from . import config as C
from .data import log

SYSTEM = """You help a beginner who invests for the long term (years, not days) in quality companies.
For each company you get its key numbers and recent news headlines. Decide what the news means for
someone who owns or wants to own the business for many years. Most daily news is noise: price moves,
analyst opinions and market chatter do not change a business. What matters is anything that changes
how much money the company can earn over years: losing or winning major customers, new laws,
lawsuits, accounting problems, leadership scandals, debt trouble, a product that changes the market.

Write for someone who does not know finance words. Short, concrete sentences. Do not tell the reader
to buy or sell. You only have headlines, so do not invent details that are not in them."""

SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string"},
                    "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative"]},
                    "impact": {"type": "string", "enum": ["noise", "watch", "thesis_support", "thesis_risk"],
                               "description": "noise: does not change the business. watch: could matter, keep an eye on it. "
                                              "thesis_support: strengthens the long-term story. thesis_risk: may damage it."},
                    "summary": {"type": "string", "description": "One or two plain sentences: what is going on."},
                    "lesson": {"type": "string", "description": "One sentence: how a long-term investor should think about this kind of news."},
                },
                "required": ["ticker", "sentiment", "impact", "summary", "lesson"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

NEG = ("lawsuit", "sued", "probe", "investigation", "fraud", "recall", "bankrupt", "default", "downgrade",
       "plunge", "slump", "cuts forecast", "cuts guidance", "misses", "warning", "layoff", "resigns", "scandal", "fine")
POS = ("beats", "record", "raises forecast", "raises guidance", "upgrade", "wins", "contract", "approval",
       "approved", "surge", "buyback", "raises dividend", "partnership", "expands")
RISK = ("fraud", "bankrupt", "default", "investigation", "probe", "scandal", "accounting")


def news_key(c):
    return hashlib.sha1("|".join(sorted(n["title"] for n in c.get("news", []))).encode()).hexdigest()[:12]


def rule_based(c):
    text = " ".join(n["title"].lower() for n in c.get("news", []))
    neg, pos = sum(w in text for w in NEG), sum(w in text for w in POS)
    risk = [w for w in RISK if w in text]
    sentiment = "negative" if neg > pos else "positive" if pos > neg else "neutral"
    if risk:
        impact, summary = "watch", f"Headlines mention: {', '.join(risk)}. Read them before deciding anything."
    else:
        impact = "noise"
        summary = {"negative": "Recent headlines lean negative, but nothing that clearly changes the business.",
                   "positive": "Recent headlines lean positive.", "neutral": "Nothing unusual in recent headlines."}[sentiment]
    return {"sentiment": sentiment, "impact": impact, "summary": summary, "by": "rules",
            "lesson": "Headlines move prices for days. Business results decide returns over years."}


def ai_read(companies):
    """One Claude call for all companies. Returns {ticker: analysis} or {} on any problem."""
    import anthropic

    blocks = []
    for c in companies:
        m, s = c["m"], c["s"]
        heads = "\n".join(f"- {n['title']} ({n.get('pub') or 'unknown source'})" for n in c["news"])
        blocks.append(f"### {c['t']} - {c['name']} ({c.get('industry')})\n"
                      f"Quality score {s.get('quality')}/100, price score {s.get('value')}/100, "
                      f"sales growth {m.get('revg')}, P/E {m.get('fpe') or m.get('pe')}, "
                      f"{c.get('offHigh')}% below 52-week high.\nHeadlines:\n{heads}")
    try:
        client = anthropic.Anthropic()
        resp = client.beta.messages.create(
            model=C.AI_MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",  # if a safety filter declines, another model answers instead
            thinking={"type": "adaptive"},
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
            system=SYSTEM,
            messages=[{"role": "user", "content": "Return one item per company below.\n\n" + "\n\n".join(blocks)}],
        )
        if resp.stop_reason != "end_turn":
            log(f"  AI news: stopped with {resp.stop_reason}, using keyword reader")
            return {}
        text = next(b.text for b in resp.content if b.type == "text")
        return {x["ticker"]: {**{k: x[k] for k in ("sentiment", "impact", "summary", "lesson")}, "by": "ai"}
                for x in json.loads(text)["items"]}
    except anthropic.AuthenticationError:
        log("  AI news: the ANTHROPIC_API_KEY was rejected, using keyword reader")
    except anthropic.RateLimitError:
        log("  AI news: rate limited, using keyword reader")
    except anthropic.APIStatusError as e:
        log(f"  AI news: API error {e.status_code}: {e.message}"[:300])
    except anthropic.APIConnectionError:
        log("  AI news: could not reach the API, using keyword reader")
    except (StopIteration, KeyError, ValueError) as e:
        log(f"  AI news: unexpected reply ({e!r}), using keyword reader")
    return {}


def analyse(companies, cache):
    """Sets c['ai'] on every company that has news. cache: {ticker: {'key':..., 'ai':...}} from the last run."""
    todo = []
    for c in companies:
        if not c.get("news"):
            continue
        hit = cache.get(c["t"])
        if hit and hit.get("key") == news_key(c) and hit["ai"].get("by") == "ai":
            c["ai"] = hit["ai"]  # same headlines as last time: do not pay to read them again
        else:
            todo.append(c)
    got = ai_read(todo) if todo and os.environ.get("ANTHROPIC_API_KEY") else {}
    for c in todo:
        c["ai"] = got.get(c["t"]) or rule_based(c)
    return {c["t"]: {"key": news_key(c), "ai": c["ai"]} for c in companies if c.get("ai")}
