/* Quality Stock Scout - reads data/data.json (written by the agent) and renders everything in the browser.
   Your buys are stored only in this browser (localStorage). */
const REPO = "https://github.com/ishayasulin/stocks_market";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("qss." + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("qss." + k, JSON.stringify(v)); } catch {} },
};
let D = null, BY = {}, USD = {};
const ui = { q: "", mkt: "All", sector: "All", industry: "All", strat: "All", sort: "rank", show: 40 };

/* ---------- formatting ---------- */
const SYM = { USD: "$", ILS: "₪", EUR: "€", GBP: "£", JPY: "¥", CHF: "CHF ", CAD: "C$", AUD: "A$" };
const money = (v, cur, d) => v == null ? "-" : (SYM[cur] ?? "") + v.toLocaleString("en-US", { minimumFractionDigits: d ?? (Math.abs(v) < 1000 ? 2 : 0), maximumFractionDigits: d ?? (Math.abs(v) < 1000 ? 2 : 0) }) + (SYM[cur] ? "" : " " + (cur || ""));
const big = (v, cur) => { if (v == null) return "-"; const a = Math.abs(v), [n, u] = a >= 1e12 ? [v / 1e12, "T"] : a >= 1e9 ? [v / 1e9, "B"] : [v / 1e6, "M"]; return (SYM[cur] ?? "") + n.toFixed(a >= 1e12 || n < 10 ? 2 : 1) + u + (SYM[cur] ? "" : " " + (cur || "")); };
const pct = (v, d = 0) => v == null ? "-" : (v * 100).toFixed(d) + "%";
const signed = (v, d = 1) => v == null ? "-" : `<span class="${v >= 0 ? "up" : "down"}">${v >= 0 ? "+" : ""}${v.toFixed(d)}%</span>`;
const tone = (s) => s == null ? "" : s >= 70 ? "good" : s >= 45 ? "warn" : "bad";
const meter = (s) => `<div class="meter ${tone(s)}" title="${s ?? "no data"} out of 100"><i><b style="width:${s ?? 0}%"></b></i><span>${s ?? "-"}</span></div>`;
const MKT = { US: "USA", IL: "Israel", UK: "UK", DE: "Germany", FR: "France", NL: "Netherlands", CH: "Switzerland", DK: "Denmark", SE: "Sweden", NO: "Norway", ES: "Spain", IT: "Italy", BE: "Belgium", JP: "Japan", KR: "Korea", TW: "Taiwan", HK: "Hong Kong", CN: "China", IN: "India", CA: "Canada", AU: "Australia" };
const STRAT = {
  sale: ["Quality on sale", "Top-quality business, sensible price, and the share price has dropped 15%+ from its yearly high."],
  fair: ["Quality at a fair price", "Top-quality business that is not expensive compared with its profits."],
  compounder: ["Compounder", "Very profitable and still growing fast, so profits can snowball for years."],
  dividend: ["Dividend payer", "Pays you a solid cash dividend it can comfortably afford."],
  fortress: ["Fortress", "Very safe finances: little debt, plenty of cash."],
};
const rank = (c) => (c.s.quality ?? 0) * 0.6 + (c.s.value ?? 0) * 0.4;
const hashOf = (t) => "#c-" + t.replace(/\./g, "_");
const oppTag = (c) => c.opp === "strong" ? `<span class="tag good">Quality on sale</span>` : c.opp === "good" ? `<span class="tag accent">Fair price</span>` : "";
const ago = (ts) => { const m = Math.round((Date.now() / 1000 - ts) / 60); return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

function verdict(c) {
  const q = c.s.quality, v = c.s.value;
  if (q == null || c.s.coverage < 0.6) return ["Not enough data", "Too many numbers are missing to judge this company.", ""];
  if (q >= 70 && v >= 58) return ["Great business at a sensible price", "This is the combination long-term investors look for.", "good"];
  if (q >= 70 && v >= 35) return ["Great business, full price", "Fine to buy slowly over time. Even better if the price dips.", "accent"];
  if (q >= 70) return ["Great business, expensive", "The price already assumes years of success. Many investors wait for a better price.", "warn"];
  if (q >= 50) return ["Decent business, not top quality", "Nothing wrong, but there are stronger companies to own for the long term.", "warn"];
  if (v >= 60) return ["Cheap for a reason", "A low price on a weak business is often a trap, not a bargain.", "bad"];
  return ["Weak business", "Does not pass the quality test for long-term investing.", "bad"];
}

/* ---------- portfolio ---------- */
const buys = () => store.get("buys", []);
function holdings() {
  const map = {};
  for (const b of buys()) {
    const h = map[b.t] ??= { t: b.t, shares: 0, cost: 0, cur: b.cur, first: b.date };
    h.shares += b.shares; h.cost += b.amount; if (b.date < h.first) h.first = b.date;
  }
  const list = Object.values(map).map((h) => {
    const c = BY[h.t];
    h.c = c; h.avg = h.cost / h.shares; h.value = c ? c.price * h.shares : null;
    h.gain = h.value == null ? null : (h.value / h.cost - 1) * 100;
    h.usd = (h.value ?? h.cost) * (USD[h.cur] ?? 1);
    return h;
  });
  const total = list.reduce((a, h) => a + h.usd, 0);
  for (const h of list) { h.share = total ? h.usd / total : 0; h.signals = signals(h, list.length); }
  return list.sort((a, b) => b.usd - a.usd);
}
function signals(h, n) {
  const out = [], c = h.c;
  if (!c) return [{ level: "info", code: "untracked", text: "The agent does not scan this company yet. Add its ticker to your watchlist so it gets tracked." }];
  for (const f of c.sell) out.push(f);
  if (n >= 3 && h.share > 0.25) out.push({ level: "trim", code: "big", text: `This is ${pct(h.share)} of everything you own. If it goes wrong it hurts a lot. Consider putting new money elsewhere, or selling a part.` });
  if (!c.sell.some((f) => f.level === "sell")) {
    if (h.gain <= -15 && (c.s.quality ?? 0) >= 65) out.push({ level: "hold", code: "dip", text: `The price is ${Math.abs(h.gain).toFixed(0)}% below what you paid, but the business is still strong (quality ${c.s.quality}). A lower price on a healthy business is not a reason to sell. Long-term investors often buy more here.` });
    else if (h.gain >= 50 && (c.s.quality ?? 0) >= 65 && !c.sell.length) out.push({ level: "hold", code: "win", text: `Up ${h.gain.toFixed(0)}% and the business is still strong. A big gain alone is not a reason to sell. Let winners keep working.` });
  }
  if (!out.length) out.push({ level: "hold", code: "ok", text: "Nothing has changed in the business. Hold." });
  return out;
}
const LEVEL = { sell: ["Consider selling", "bad"], trim: ["Consider selling part", "warn"], review: ["Review", "warn"], hold: ["Hold", "good"], info: ["Not tracked", ""] };
const worst = (sig) => ["sell", "trim", "review", "info", "hold"].find((l) => sig.some((s) => s.level === l));

/* ---------- alerts & pop-up ---------- */
function myAlerts() {
  const week = Math.floor(Date.now() / 6048e5), list = D.alerts.map((a) => ({ ...a }));
  for (const h of holdings()) for (const s of h.signals) if (["sell", "trim", "review"].includes(s.level))
    list.unshift({ id: `own:${h.t}:${s.code}:${week}`, type: "sell", level: s.level, t: h.t, name: h.c.name, title: `${h.c.name}: ${LEVEL[s.level][0].toLowerCase()}`, text: s.text, mine: true, date: "You own this" });
  return list;
}
const unseen = () => { const seen = store.get("seen", []); return myAlerts().filter((a) => !seen.includes(a.id)); };
function markSeen() { store.set("seen", [...new Set([...store.get("seen", []), ...myAlerts().map((a) => a.id)])].slice(-400)); badge(); }
function badge() { const n = unseen().length, d = $("#dot"); d.hidden = !n; d.textContent = n; }
const alertHtml = (a) => `<div class="alert ${a.type === "sell" ? a.level : ""}">
  <div class="row"><span class="tag ${a.type === "buy" ? "good" : a.level === "sell" ? "bad" : "warn"}">${a.type === "buy" ? "Chance to invest" : LEVEL[a.level][0]}</span><span class="muted small">${esc(a.date)}</span></div>
  <b>${esc(a.title)}</b><p>${esc(a.text)}</p>
  ${a.points?.length ? `<ul class="pts">${a.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
  <div><a href="${hashOf(a.t)}" data-close>See why, with the numbers</a></div></div>`;
function popup() {
  const list = unseen();
  if (!list.length) return;
  $("#popin").innerHTML = `<h2>${list.length} new message${list.length > 1 ? "s" : ""} from your agent</h2>
    ${list.slice(0, 6).map(alertHtml).join("")}
    ${list.length > 6 ? `<p class="muted">And ${list.length - 6} more in the Alerts tab.</p>` : ""}
    <p class="small muted">A chance to invest means the company passed the quality and price rules. It is a starting point for your own reading, not an instruction to buy.</p>
    <div class="row"><button class="btn primary" data-close>Got it</button></div>`;
  $("#pop").showModal();
  try { if (window.Notification?.permission === "granted") new Notification("Quality Stock Scout", { body: list[0].title }); } catch {}
}
$("#pop").addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target === $("#pop")) { $("#pop").close(); } });
$("#pop").addEventListener("close", markSeen);

/* ---------- charts ---------- */
function lineChart(box, d, c, cur) {
  const W = 720, H = 260, L = 8, R = 52, T = 10, B = 24, n = c.length;
  const avg = c.map((_, i) => i < 39 ? null : c.slice(i - 39, i + 1).reduce((a, b) => a + b, 0) / 40);
  const lo = Math.min(...c), hi = Math.max(...c), pad = (hi - lo) * 0.06 || 1;
  const x = (i) => L + (i / (n - 1)) * (W - L - R), y = (v) => T + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H - T - B);
  const path = (arr) => arr.map((v, i) => v == null ? "" : `${arr[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const years = []; d.forEach((day, i) => { const yr = new Date(day * 864e5).getUTCFullYear(); if (i && yr !== new Date(d[i - 1] * 864e5).getUTCFullYear()) years.push([i, yr]); });
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Share price over five years">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${W - R + 6}" y="${y(t) + 4}">${money(t, cur, t < 10 ? 2 : 0)}</text>`).join("")}
    ${years.map(([i, yr]) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${yr}</text>`).join("")}
    <path d="${path(avg)}" fill="none" stroke="var(--avg)" stroke-width="2" stroke-dasharray="5 4"/>
    <path d="${path(c)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${x(n - 1)}" cy="${y(c[n - 1])}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
    <g class="hov" hidden><line y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-width="1"/><circle r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></g>
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  const svg = box.querySelector("svg"), hov = box.querySelector(".hov"), tip = box.querySelector(".tip");
  const move = (e) => {
    const r = svg.getBoundingClientRect(), px = ((e.touches?.[0] ?? e).clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
    hov.removeAttribute("hidden"); hov.querySelector("line").setAttribute("x1", x(i)); hov.querySelector("line").setAttribute("x2", x(i));
    hov.querySelector("circle").setAttribute("cx", x(i)); hov.querySelector("circle").setAttribute("cy", y(c[i]));
    tip.hidden = false; tip.style.left = (x(i) / W) * r.width + "px"; tip.style.top = (y(c[i]) / H) * r.height + "px";
    tip.textContent = `${new Date(d[i] * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}: ${money(c[i], cur)}`;
  };
  svg.addEventListener("pointermove", move); svg.addEventListener("pointerleave", () => { hov.setAttribute("hidden", ""); tip.hidden = true; });
}
function bars(years, vals, cur, label) {
  const W = 300, H = 130, T = 18, B = 20, ok = vals.map((v) => v ?? 0), hi = Math.max(0, ...ok), lo = Math.min(0, ...ok), span = hi - lo || 1;
  const y = (v) => T + ((hi - v) / span) * (H - T - B), bw = 44, step = (W - 20) / years.length;
  return `<div><div class="small muted" style="font-weight:600">${label}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label} by year">
    <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>
    ${years.map((yr, i) => { const v = vals[i]; if (v == null) return ""; const cx = 10 + step * i + step / 2, top = Math.min(y(v), y(0)), h = Math.max(2, Math.abs(y(v) - y(0)));
      return `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="4" fill="${v < 0 ? "var(--bad)" : "var(--accent)"}"><title>${yr}: ${big(v, cur)}</title></rect>
      <text x="${cx}" y="${v < 0 ? top + h + 12 : top - 5}" text-anchor="middle">${big(v, "").trim()}</text><text x="${cx}" y="${H - 4}" text-anchor="middle">${yr}</text>`; }).join("")}</svg></div>`;
}
const spark = (a) => { const lo = Math.min(...a), hi = Math.max(...a); return `<svg viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><path d="${a.map((v, i) => `${i ? "L" : "M"}${(i / (a.length - 1)) * 100},${31 - ((v - lo) / (hi - lo || 1)) * 28}`).join("")}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`; };

/* ---------- views ---------- */
const coRow = (c, extra = "") => `<tr class="click" data-go="${hashOf(c.t)}"><td class="co"><b>${esc(c.name)}</b><span>${esc(c.t)} · ${MKT[c.mkt] ?? c.mkt} · ${esc(c.industry ?? c.sector ?? "")}</span></td>
  <td class="r num">${money(c.price, c.cur)}<div class="small">${signed(c.chg)}</div></td><td>${meter(c.s.quality)}</td><td>${meter(c.s.value)}</td>
  <td class="r num">${c.offHigh == null ? "-" : "-" + c.offHigh.toFixed(0) + "%"}</td><td>${oppTag(c)}${extra}</td></tr>`;
const coTable = (list) => `<div class="tablebox"><table><thead><tr><th>Company</th><th class="r">Price</th><th title="Is it a good business? 0-100">Business quality</th><th title="Is the price reasonable? 0-100">Price score</th><th class="r" title="How far below its highest price of the past year">From high</th><th></th></tr></thead><tbody>${list.map((c) => coRow(c)).join("")}</tbody></table></div>`;

function today() {
  const opps = D.companies.filter((c) => c.opp).sort((a, b) => (a.opp === b.opp ? rank(b) - rank(a) : a.opp === "strong" ? -1 : 1));
  const hs = holdings(), flagged = hs.filter((h) => ["sell", "trim", "review"].includes(worst(h.signals)));
  return `<div><h1>Today</h1><p class="lead muted">The agent checked ${D.companies.length} companies in ${new Set(D.companies.map((c) => c.mkt)).size} markets. ${opps.length} pass the long-term quality and price rules right now.</p></div>
  <div class="grid3">${D.indices.map((i) => `<div class="idx"><span class="small muted">${esc(i.name)}</span><span class="v num">${i.price.toLocaleString("en-US")}</span>
    <span class="small">${signed(i.chg, 2)} today · ${signed(i.yr)} in a year</span>${spark(i.spark)}<span class="small muted">${i.offHigh < 1 ? "At its yearly high" : i.offHigh.toFixed(0) + "% below its yearly high"}</span></div>`).join("")}</div>
  ${flagged.length ? `<div class="panel"><h2>Your companies that need a look</h2>${flagged.map((h) => `<div class="note ${LEVEL[worst(h.signals)][1]}"><b><a href="${hashOf(h.t)}">${esc(h.c.name)}</a>: ${LEVEL[worst(h.signals)][0]}</b><p>${esc(h.signals[0].text)}</p></div>`).join("")}</div>` : ""}
  <div class="panel"><div class="row"><h2 style="margin-right:auto">Best chances right now</h2><a href="#explore">Search all companies</a></div>
    <p class="muted">Great businesses (quality 75+) with safe finances and a sensible price. Tap one to see the reasons and learn how to check them yourself.</p>
    <div class="cards">${opps.slice(0, 9).map((c) => `<button class="card" data-go="${hashOf(c.t)}"><div class="row">${oppTag(c)}<span class="muted small">${MKT[c.mkt] ?? c.mkt} · ${esc(c.sector ?? "")}</span></div>
      <div><b>${esc(c.name)}</b> <span class="muted">${esc(c.t)}</span></div><div class="num">${money(c.price, c.cur)} ${signed(c.chg)}</div>
      <div class="small muted">Business quality</div>${meter(c.s.quality)}<div class="small muted">Price score</div>${meter(c.s.value)}
      <ul class="pts good small">${c.good.slice(0, 2).map((g) => `<li>${esc(g)}</li>`).join("")}</ul></button>`).join("") || `<p>No company passes all the rules today. That is normal: good chances are rare. Waiting is part of investing.</p>`}</div></div>
  <div class="panel"><h2>New here? Start with these</h2><div class="row"><a class="btn" href="#learn">Learn how to judge a company</a><a class="btn" href="#explore">Find the best companies in a field</a><a class="btn" href="#portfolio">Record a buy</a></div></div>`;
}

const THEMES = { oil: /oil|gas|energy/, gas: /oil|gas/, fuel: /oil|gas/, electricity: /utilit|electric|power|renewable|solar/, electric: /utilit|electric|power/, power: /utilit|electric|power/, solar: /solar|renewable/, renewable: /solar|renewable/, bank: /bank/, banks: /bank/, chips: /semiconductor/, chip: /semiconductor/, ai: /semiconductor|software/, pharma: /drug|pharma|biotech/, drugs: /drug|pharma|biotech/, medicine: /drug|pharma|biotech/, cyber: /software - infrastructure/, defense: /aerospace & defense/, defence: /aerospace & defense/, weapons: /aerospace & defense/, cars: /auto/, car: /auto/, food: /food|beverage|grocery|packaged|restaurant/, gold: /gold|metal|mining/, mining: /gold|metal|mining|copper|steel/, telecom: /telecom/, phone: /telecom|consumer electronics/, shopping: /retail/, shops: /retail/, health: /health|medical|drug/, housing: /real estate|reit|residential/, tech: /technology|software|semiconductor/, water: /water/, travel: /travel|airline|lodging/ };
function filtered() {
  const words = ui.q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = D.companies.filter((c) => {
    if (ui.mkt !== "All" && (ui.mkt === "World" ? ["US", "IL"].includes(c.mkt) : c.mkt !== ui.mkt)) return false;
    if (ui.sector !== "All" && c.sector !== ui.sector) return false;
    if (ui.industry !== "All" && c.industry !== ui.industry) return false;
    if (ui.strat !== "All" && !c.strategies.includes(ui.strat)) return false;
    const field = `${c.sector} ${c.industry}`.toLowerCase(), hay = `${c.name} ${c.t} ${field} ${MKT[c.mkt] ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w) || THEMES[w]?.test(field));
  });
  const key = { rank, quality: (c) => c.s.quality ?? -1, value: (c) => c.s.value ?? -1, size: (c) => c.mcapUsd ?? 0, drop: (c) => c.offHigh ?? 0 }[ui.sort];
  return list.sort((a, b) => key(b) - key(a));
}
function explore() {
  const sectors = [...new Set(D.companies.map((c) => c.sector).filter(Boolean))].sort();
  const inds = [...new Set(D.companies.filter((c) => ui.sector === "All" || c.sector === ui.sector).map((c) => c.industry).filter(Boolean))].sort();
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label ?? v)}</option>`;
  return `<div><h1>Explore</h1><p class="lead muted">Find the strongest companies in any field. Type a field such as oil, electricity, banks, chips or pharma, or a company name.</p></div>
  <div class="panel"><div class="row">
    <label style="flex:2 1 220px">Search<input id="q" type="search" placeholder="oil, electricity, banks, Teva…" value="${esc(ui.q)}"></label>
    <label>Market<select id="f-mkt">${["All", "US", "IL", "World"].map((m) => opt(m, ui.mkt, { US: "USA", IL: "Israel", World: "Rest of world" }[m] ?? "All markets")).join("")}</select></label>
    <label>Industry<select id="f-industry">${opt("All", ui.industry, "All industries")}${inds.map((i) => opt(i, ui.industry)).join("")}</select></label>
    <label>Strategy<select id="f-strat">${opt("All", ui.strat, "Any")}${Object.entries(STRAT).map(([k, v]) => opt(k, ui.strat, v[0])).join("")}</select></label>
    <label>Order by<select id="f-sort">${[["rank", "Best overall"], ["quality", "Business quality"], ["value", "Best price"], ["drop", "Biggest drop from high"], ["size", "Company size"]].map(([k, l]) => opt(k, ui.sort, l)).join("")}</select></label></div>
    <div class="chips" id="sectors">${["All", ...sectors].map((s) => `<button class="chip ${s === ui.sector ? "on" : ""}" data-sector="${esc(s)}">${s === "All" ? "All sectors" : esc(s)}</button>`).join("")}</div>
    ${ui.strat !== "All" ? `<p class="note">${esc(STRAT[ui.strat][1])}</p>` : ""}<div id="results"></div></div>`;
}
function results() {
  const list = filtered(), el = $("#results"); if (!el) return;
  el.innerHTML = list.length ? `<p class="muted small">${list.length} companies. Business quality and price score are out of 100; higher is better.</p>${coTable(list.slice(0, ui.show))}
    ${list.length > ui.show ? `<div class="row"><button class="btn" id="more">Show more</button></div>` : ""}`
    : `<p>No company matches. The agent scans the biggest companies in each sector. To track another company, <a href="${REPO}/edit/main/watchlist.txt" target="_blank" rel="noopener">add its ticker to your watchlist</a>.</p>`;
}

const METRICS = [
  ["roe", "Return on equity (ROE)", (v) => pct(v), (v) => v >= 0.18 ? "good" : v >= 0.08 ? "warn" : "bad", "Profit earned in a year for every 100 of the owners' money. Above 15% year after year marks a strong business."],
  ["opm", "Operating margin", (v) => pct(v), (v) => v >= 0.2 ? "good" : v >= 0.08 ? "warn" : "bad", "How much of each sale is left after running costs. High margins mean customers pay up and competitors struggle to undercut."],
  ["revg", "Sales growth (1 year)", (v) => pct(v), (v) => v >= 0.1 ? "good" : v >= 0 ? "warn" : "bad", "Are more people buying from this company than a year ago? Profit cannot grow for long without sales growing."],
  ["cagr", "Sales growth (per year, 3 years)", (v) => pct(v), (v) => v >= 0.1 ? "good" : v >= 0.02 ? "warn" : "bad", "Growth over several years. One good year can be luck. Several in a row is a pattern."],
  ["de", "Debt to equity", (v) => (v / 100).toFixed(2) + "x", (v) => v <= 60 ? "good" : v <= 150 ? "warn" : "bad", "Debt compared with the owners' money. Lots of debt is dangerous when business slows down. Banks and utilities normally carry more."],
  ["fcfy", "Free cash flow yield", (v) => pct(v, 1), (v) => v >= 0.04 ? "good" : v >= 0.01 ? "warn" : "bad", "Spare cash the business produced in a year, as a share of its price tag. Cash is harder to fake than profit."],
  ["fpe", "Price to earnings (P/E, next year)", (v) => v.toFixed(1) + "x", (v) => v <= 0 ? "bad" : v <= 18 ? "good" : v <= 32 ? "warn" : "bad", "How many years of profit you pay for one share. 15-25 is common for a good company. Much higher means the price expects fast growth."],
  ["peg", "PEG ratio", (v) => v.toFixed(2), (v) => v <= 1.3 ? "good" : v <= 2.5 ? "warn" : "bad", "P/E divided by profit growth. Around 1 means you pay a fair price for the growth. Above 2.5 means you pay a lot."],
  ["divy", "Dividend yield", (v) => pct(v, 1), (v) => v >= 0.025 ? "good" : "", "Cash paid to you each year as a share of the price. Nice to have, but not required for a great investment."],
  ["beta", "Beta (price swings)", (v) => v.toFixed(2), (v) => v <= 1.1 ? "good" : v <= 1.5 ? "warn" : "bad", "1 means the share moves like the market. Above 1 means wilder swings in both directions."],
];
function company(t) {
  const c = BY[t];
  if (!c) return `<div class="panel"><h2>${esc(t)} is not tracked yet</h2><p>The agent scans the largest companies in every sector. To add this one, <a href="${REPO}/edit/main/watchlist.txt" target="_blank" rel="noopener">add its ticker to your watchlist</a>. It appears after the next scan.</p><a href="#explore">Back to Explore</a></div>`;
  const [vt, vd, vc] = verdict(c), s = c.s, h = holdings().find((x) => x.t === t);
  const pos = c.hi52 > c.lo52 ? ((c.price - c.lo52) / (c.hi52 - c.lo52)) * 100 : 50;
  const part = (label, v, text) => `<div><div class="row"><b style="margin-right:auto">${label}</b></div>${meter(v)}<p class="small muted">${text}</p></div>`;
  const y = `https://finance.yahoo.com/quote/${encodeURIComponent(c.t)}`;
  return `<div><a href="#explore" class="small">← All companies</a>
    <div class="row" style="margin-top:6px"><h1 style="margin-right:auto">${esc(c.name)}</h1>${oppTag(c)}</div>
    <p class="muted">${esc(c.t)} · ${MKT[c.mkt] ?? c.mkt} · ${esc(c.sector ?? "")} · ${esc(c.industry ?? "")} · worth ${big(c.mcap, c.cur)}</p>
    <p class="big">${money(c.price, c.cur)} <span style="font-size:1rem">${signed(c.chg, 2)} today</span></p></div>
  <div class="panel"><span class="tag ${vc}" style="justify-self:start">${vt}</span><p class="lead">${vd}</p>
    <div class="verdict"><div><span class="small muted">Is it a good business?</span><span class="big">${s.quality ?? "-"}<span class="small muted"> / 100</span></span>${meter(s.quality)}</div>
      <div><span class="small muted">Is the price reasonable?</span><span class="big">${s.value ?? "-"}<span class="small muted"> / 100</span></span>${meter(s.value)}</div>
      <div><span class="small muted">Price in the past year</span><div class="range"><b style="left:${Math.max(0, Math.min(100, pos))}%"></b></div>
        <div class="row small muted" style="justify-content:space-between"><span>Low ${money(c.lo52, c.cur)}</span><span>High ${money(c.hi52, c.cur)}</span></div>
        <span class="small">${c.offHigh >= 1 ? `Now ${c.offHigh.toFixed(0)}% below the high` : "Now at its high"}</span></div></div>
    ${c.strategies.length ? `<div class="row">${c.strategies.map((k) => `<span class="tag accent" title="${esc(STRAT[k][1])}">${STRAT[k][0]}</span>`).join("")}</div>` : ""}</div>
  ${h ? `<div class="panel"><h2>You own this</h2><p>${h.shares.toFixed(3)} shares, bought for ${money(h.cost, h.cur)} in total (average ${money(h.avg, h.cur)} a share). Worth ${money(h.value, h.cur)} now, ${signed(h.gain)}.</p>
    ${h.signals.map((x) => `<div class="note ${LEVEL[x.level][1]}"><b>${LEVEL[x.level][0]}</b><p>${esc(x.text)}</p></div>`).join("")}</div>` : ""}
  <div class="grid2"><div class="panel"><h2>What is good</h2>${c.good.length ? `<ul class="pts good">${c.good.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : `<p class="muted">Nothing stands out.</p>`}</div>
    <div class="panel"><h2>What to watch out for</h2>${c.bad.length ? `<ul class="pts bad">${c.bad.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : `<p class="muted">No red flags in the numbers.</p>`}
      ${c.sell.map((x) => `<div class="note ${LEVEL[x.level][1]}"><b>If you own it: ${LEVEL[x.level][0].toLowerCase()}</b><p>${esc(x.text)}</p></div>`).join("")}</div></div>
  <div class="panel"><h2>Score breakdown</h2><div class="grid3">
    ${part("Profitability", s.profit, "Does it earn a lot on the money put into it?")}${part("Growth", s.growth, "Are sales and profits getting bigger?")}
    ${part("Financial safety", s.safety, "Could it survive a few bad years?")}${part("Price", s.value, "What you pay compared with what it earns.")}</div>
    <p class="small muted">Business quality = profitability (40%) + growth (30%) + safety (30%). Price is scored separately, because a great company can still be a poor buy at the wrong price.</p></div>
  <div class="panel"><div class="row"><h2 style="margin-right:auto">Price, last 5 years</h2><div class="legend"><span><i></i>Share price</span><span><i class="avg"></i>Average of the past 40 weeks</span></div></div>
    <div class="chart" id="chart"><p class="muted">Loading chart…</p></div>
    <p class="small muted">The dashed line smooths out daily noise. A quality company trading below its dashed line is often on sale. ${c.target ? `Professional analysts expect about ${money(c.target, c.cur)} within a year (they are often wrong).` : ""}</p></div>
  ${c.deep ? `<div class="panel"><h2>Is it consistent? Year by year</h2><div class="grid3 chart">${bars(c.deep.years, c.deep.rev, c.fcur, "Sales")}${bars(c.deep.years, c.deep.ni, c.fcur, "Profit")}${bars(c.deep.years, c.deep.fcf, c.fcur, "Spare cash (free cash flow)")}</div>
    <p class="small muted">Look for bars that rise steadily. Amounts in ${esc(c.fcur)}, the currency the company reports in.</p></div>` : ""}
  <div class="panel"><h2>The numbers, and how to read them</h2><div class="kv">${METRICS.filter(([k]) => c.m[k] != null).map(([k, label, f, judge, why]) => { const tn = judge(c.m[k]);
    return `<div class="k"><b>${label}</b></div><div class="v num"><span class="tag ${tn}">${f(c.m[k])}</span></div><div class="why small muted">${why}</div>`; }).join("")}</div></div>
  ${c.news?.length ? `<div class="panel"><h2>Recent news</h2>${c.ai ? `<div class="note"><b>${c.ai.by === "ai" ? "What the AI reader makes of it" : "Quick read of the headlines"}</b><p>${esc(c.ai.summary)}</p><p class="small muted">${esc(c.ai.lesson)}</p></div>` : ""}
    <ul class="pts">${c.news.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="muted small">${esc(n.pub ?? "")}${n.ts ? " · " + ago(n.ts) : ""}</span></li>`).join("")}</ul></div>` : ""}
  <div class="panel"><h2>About the company</h2><p>${esc(c.about)}${c.about.length >= 600 ? "…" : ""}</p>
    <h3>Check it yourself</h3><div class="row"><a class="btn" href="${y}" target="_blank" rel="noopener">Yahoo Finance page</a><a class="btn" href="${y}/financials" target="_blank" rel="noopener">Financial statements</a>
    ${c.web ? `<a class="btn" href="${esc(c.web)}" target="_blank" rel="noopener">Company website</a>` : ""}
    ${c.mkt === "US" ? `<a class="btn" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(c.t)}&type=10-K" target="_blank" rel="noopener">Annual reports (SEC)</a>` : ""}
    ${c.mkt === "IL" ? `<a class="btn" href="https://maya.tase.co.il/" target="_blank" rel="noopener">Company reports (MAYA)</a>` : ""}
    <a class="btn primary" href="#portfolio" data-buy="${esc(c.t)}">I bought this</a></div></div>`;
}
async function loadChart(t) {
  const c = BY[t], box = $("#chart"); if (!c || !box) return;
  try { const h = await (await fetch(`data/h/${encodeURIComponent(t)}.json`)).json(); lineChart(box, h.d, h.c, c.cur); }
  catch { box.innerHTML = `<p class="muted">No price history for this company yet.</p>`; }
}

function portfolio() {
  const hs = holdings(), pre = store.get("prefill", ""), c0 = BY[pre];
  const byCur = {}; for (const h of hs) { const b = byCur[h.cur] ??= { cost: 0, value: 0 }; b.cost += h.cost; b.value += h.value ?? h.cost; }
  const sectors = new Set(hs.map((h) => h.c?.sector).filter(Boolean));
  return `<div><h1>My buys</h1><p class="lead muted">Every time you buy, record it here. The site then shows what it is worth and warns you when there is a real reason to sell. Saved only in this browser.</p></div>
  <form class="panel" id="buyform"><h2>Record a buy</h2><div class="row" style="align-items:end">
    <label style="flex:1 1 150px">Company (ticker)<input id="b-t" list="tickers" required placeholder="AAPL or TEVA.TA" value="${esc(pre)}" autocomplete="off"></label>
    <label>Date<input id="b-date" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label>
    <label style="flex:1 1 120px">Money invested<input id="b-amount" type="number" min="0" step="any" required placeholder="1000"></label>
    <label style="flex:1 1 120px">Price per share<input id="b-price" type="number" min="0" step="any" required value="${c0 ? c0.price.toFixed(2) : ""}"></label>
    <button class="btn primary">Save buy</button></div><p class="small muted" id="b-hint">${c0 ? `${esc(c0.name)}, in ${c0.cur}` : "Use the currency the share trades in (dollars for US shares, shekels for Tel Aviv)."}</p>
    <datalist id="tickers">${D.companies.map((c) => `<option value="${esc(c.t)}">${esc(c.name)}</option>`).join("")}</datalist></form>
  ${hs.length ? `<div class="grid3">${Object.entries(byCur).map(([cur, b]) => `<div class="idx"><span class="small muted">Invested in ${cur}</span><span class="v num">${money(b.value, cur, 0)}</span><span class="small">You put in ${money(b.cost, cur, 0)} · ${signed((b.value / b.cost - 1) * 100)}</span></div>`).join("")}
    <div class="idx"><span class="small muted">Spread</span><span class="v num">${hs.length} ${hs.length === 1 ? "company" : "companies"}</span><span class="small ${hs.length < 8 ? "" : "up"}">${sectors.size} sector${sectors.size === 1 ? "" : "s"}. ${hs.length < 8 ? "Aim for 8+ companies in 4+ sectors over time." : "Well spread."}</span></div></div>
  <div class="panel"><h2>What you own</h2><div class="tablebox"><table><thead><tr><th>Company</th><th class="r">Invested</th><th class="r">Worth now</th><th class="r">Gain</th><th class="r">Share of total</th><th>What to do</th></tr></thead><tbody>
    ${hs.map((h) => { const w = worst(h.signals); return `<tr class="click" data-go="${hashOf(h.t)}"><td class="co"><b>${esc(h.c?.name ?? h.t)}</b><span>${esc(h.t)} · ${h.shares.toFixed(3)} shares at ${money(h.avg, h.cur)}</span></td>
      <td class="r num">${money(h.cost, h.cur, 0)}</td><td class="r num">${h.value == null ? "-" : money(h.value, h.cur, 0)}</td><td class="r num">${signed(h.gain)}</td><td class="r num">${pct(h.share)}</td>
      <td><span class="tag ${LEVEL[w][1]}">${LEVEL[w][0]}</span><div class="small muted" style="min-width:220px;max-width:38ch">${esc(h.signals.find((x) => x.level === w).text)}</div></td></tr>`; }).join("")}</tbody></table></div></div>
  <div class="panel"><h2>Every buy</h2><div class="tablebox"><table><thead><tr><th>Date</th><th>Company</th><th class="r">Invested</th><th class="r">Price</th><th class="r">Shares</th><th></th></tr></thead><tbody>
    ${buys().slice().sort((a, b) => b.date.localeCompare(a.date)).map((b) => `<tr><td class="num">${esc(b.date)}</td><td>${esc(b.t)}</td><td class="r num">${money(b.amount, b.cur)}</td><td class="r num">${money(b.price, b.cur)}</td><td class="r num">${b.shares.toFixed(3)}</td><td class="r"><button class="btn ghost" data-del="${b.id}">Remove</button></td></tr>`).join("")}</tbody></table></div>
    <details><summary class="small">Back up or move to another device</summary><p class="small muted">Copy this text and keep it somewhere safe. To restore, paste it here and press Restore.</p>
      <textarea id="backup" rows="3" style="width:100%">${esc(JSON.stringify(buys()))}</textarea><div class="row"><button class="btn" id="restore" type="button">Restore</button></div></details></div>`
  : `<div class="panel"><p>No buys recorded yet. When you buy a share, add it above with the amount you invested and the price you paid.</p></div>`}
  <div class="panel"><h2>When is it time to sell?</h2><p>The site checks these for every company you own. For a long-term investor there are only a few good reasons:</p>
    <ul class="pts"><li><b>The business got worse.</b> Sales shrinking, profits gone, debt piling up, quality score falling. This is the main one.</li>
    <li><b>The price went crazy.</b> When you pay 45+ years of profit for a share, selling a part is sensible.</li>
    <li><b>One company became too big a part of your money</b> (over 25%).</li><li><b>You need the money</b>, or you found a clearly better company.</li></ul>
    <p><b>Not a reason:</b> the price fell, the news is scary, or everyone is selling. If the business is still healthy, a lower price is a discount.</p></div>`;
}

function alertsView() {
  const list = myAlerts(), can = "Notification" in window && Notification.permission === "default";
  return `<div><h1>Alerts</h1><p class="lead muted">Everything the agent flagged in the last 90 days, plus sell signals for companies you own.</p></div>
  ${can ? `<div class="panel"><div class="row"><span style="margin-right:auto">Also show a notification from your browser while this site is open?</span><button class="btn" id="notif">Turn on</button></div></div>` : ""}
  <div class="panel">${list.length ? list.map(alertHtml).join("") : "<p>No alerts yet. The agent posts here when a company passes the rules.</p>"}</div>`;
}

/* ---------- routing & events ---------- */
function render() {
  if (!D) return;
  const h = location.hash.slice(1) || "today", v = $("#view");
  const tab = h.startsWith("c-") ? "explore" : h;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + tab));
  if (h.startsWith("c-")) { const t = h.slice(2).replace(/_/g, "."); v.innerHTML = company(t); loadChart(t); }
  else if (h === "explore") { v.innerHTML = explore(); results(); }
  else if (h === "portfolio") v.innerHTML = portfolio();
  else if (h === "alerts") { v.innerHTML = alertsView(); markSeen(); }
  else if (h === "learn") { v.innerHTML = learnView(D, { BY, money, big, pct, esc, meter, hashOf, holdings, STRAT, MKT, rank, store }); }
  else v.innerHTML = today();
  if (!h.startsWith("c-") || !render.same) window.scrollTo(0, 0);
  badge();
}
window.addEventListener("hashchange", render);
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]"); if (go && !e.target.closest("button[data-del]")) { location.hash = go.dataset.go; return; }
  const sec = e.target.closest("[data-sector]"); if (sec) { ui.sector = sec.dataset.sector; ui.industry = "All"; ui.show = 40; render(); return; }
  const buy = e.target.closest("[data-buy]"); if (buy) store.set("prefill", buy.dataset.buy);
  const filt = e.target.closest("[data-filter]"); if (filt) { Object.assign(ui, { q: "", mkt: "All", sector: "All", industry: "All", strat: "All", sort: "rank" }, JSON.parse(filt.dataset.filter)); }
  const del = e.target.closest("[data-del]"); if (del) { store.set("buys", buys().filter((b) => b.id !== del.dataset.del)); render(); }
  if (e.target.id === "more") { ui.show += 40; results(); }
  if (e.target.id === "restore") { try { const a = JSON.parse($("#backup").value); if (Array.isArray(a)) { store.set("buys", a); render(); } } catch { $("#backup").value = "That text is not a valid backup."; } }
  if (e.target.id === "notif") Notification.requestPermission().then(render);
  const done = e.target.closest("[data-done]"); if (done) { const d = store.get("lessons", []); store.set("lessons", [...new Set([...d, done.dataset.done])]); render(); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "q") { ui.q = e.target.value; ui.show = 40; results(); }
  if (e.target.id === "b-t") { const c = BY[e.target.value.trim().toUpperCase()]; if (c) { $("#b-price").value = c.price.toFixed(2); $("#b-hint").textContent = `${c.name}, in ${c.cur}`; } }
  if (e.target.id === "lesson-pick") { store.set("example", e.target.value); render(); }
});
document.addEventListener("change", (e) => {
  const m = e.target.id?.match(/^f-(\w+)$/); if (m) { ui[m[1]] = e.target.value; ui.show = 40; if (m[1] === "strat") render(); else results(); }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "buyform") return;
  e.preventDefault();
  const t = $("#b-t").value.trim().toUpperCase(), amount = +$("#b-amount").value, price = +$("#b-price").value;
  if (!t || !(amount > 0) || !(price > 0)) return;
  const cur = BY[t]?.cur ?? (t.endsWith(".TA") ? "ILS" : "USD");
  store.set("buys", [...buys(), { id: Date.now().toString(36), t, date: $("#b-date").value, amount, price, shares: amount / price, cur }]);
  store.set("prefill", ""); render();
});

async function refresh(first) {
  try {
    const d = await (await fetch("data/data.json", { cache: "no-store" })).json();
    if (D && d.updated === D.updated) return;
    D = d; BY = Object.fromEntries(d.companies.map((c) => [c.t, c])); USD = {};
    for (const c of d.companies) if (c.mcap && c.mcapUsd) USD[c.cur] ??= c.mcapUsd / c.mcap;
    $("#updated").textContent = `Prices updated ${ago(d.updated)} · ${d.companies.length} companies`;
    render(); popup();
  } catch (err) {
    if (first) $("#view").innerHTML = `<div class="panel"><h2>No data yet</h2><p>The agent has not finished its first scan. In GitHub, open the Actions tab and run the "Scan markets" workflow, then reload this page.</p></div>`;
  }
}
refresh(true);
setInterval(refresh, 5 * 60 * 1000);
