"""Sends the alert email. Needs EMAIL_USER and EMAIL_APP_PASSWORD (a Gmail app password works).

Optional: EMAIL_TO (defaults to EMAIL_USER), SMTP_HOST (smtp.gmail.com), SMTP_PORT (465).
"""
import html
import os
import smtplib
from email.message import EmailMessage

from .data import log


def send(alerts, site_url):
    user, pw = os.environ.get("EMAIL_USER"), os.environ.get("EMAIL_APP_PASSWORD")
    if not alerts:
        return False
    if not (user and pw):
        log("  email not configured (EMAIL_USER / EMAIL_APP_PASSWORD), skipping")
        return False
    to = os.environ.get("EMAIL_TO") or user
    buys = [a for a in alerts if a["type"] == "buy"]
    sells = [a for a in alerts if a["type"] == "sell"]
    subject = " | ".join(filter(None, [
        f"{len(buys)} investing chance{'s' if len(buys) != 1 else ''}: {', '.join(a['t'] for a in buys)}" if buys else "",
        f"{len(sells)} to review: {', '.join(a['t'] for a in sells)}" if sells else ""]))

    def block(a):
        e = html.escape
        pts = "".join(f"<li>{e(p)}</li>" for p in a.get("points", []))
        return (f"<div style='border:1px solid #ddd;border-radius:8px;padding:14px;margin:12px 0'>"
                f"<b style='font-size:16px'>{e(a['title'])}</b><br>"
                f"<span style='color:#555'>{e(a['name'])} ({e(a['t'])}) - {a['price']:,.2f} {e(a['cur'])}</span>"
                f"<p>{e(a['text'])}</p><ul>{pts}</ul>"
                f"<a href='{site_url}#c-{e(a['t'].replace('.', '_'))}'>Open on your site</a></div>")

    body = ("<div style='font-family:Arial,sans-serif;max-width:620px'>"
            + ("<h2>New chances to invest</h2>" + "".join(map(block, buys)) if buys else "")
            + ("<h2>Companies on your watchlist to review</h2>" + "".join(map(block, sells)) if sells else "")
            + "<p style='color:#777;font-size:12px'>Automated screening for learning purposes, not financial advice. "
              "Check the company yourself before investing.</p></div>")
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = "Stock agent: " + subject, user, to
    msg.set_content("\n\n".join(f"{a['title']}\n{a['text']}" for a in alerts) + f"\n\n{site_url}")
    msg.add_alternative(body, subtype="html")
    try:
        with smtplib.SMTP_SSL(os.environ.get("SMTP_HOST") or "smtp.gmail.com", int(os.environ.get("SMTP_PORT") or 465), timeout=30) as s:
            s.login(user, pw)
            s.send_message(msg)
        log(f"  email sent to the configured address ({len(alerts)} alerts)")
        return True
    except Exception as e:
        log(f"  email failed: {e!r}"[:200])
        return False
