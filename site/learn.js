/* The Learn tab. Every lesson uses the same live numbers the agent uses, so what you read is true today. */
function learnView(D, h) {
  const { BY, money, big, pct, esc, meter, hashOf, holdings, STRAT, MKT, rank, store } = h;
  const cs = D.companies, done = store.get("lessons", []);
  const ex = BY[store.get("example", "")] ?? cs.find((c) => c.deep && c.m.fpe > 0) ?? cs[0];
  const link = (c) => `<a href="${hashOf(c.t)}">${esc(c.name)}</a>`;
  const median = (arr) => { const a = arr.filter((v) => v != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
  const peers = cs.filter((c) => c.sector === ex.sector);
  const pe = (c) => c.m.fpe ?? c.m.pe;
  const quality = cs.filter((c) => (c.s.quality ?? 0) >= 75 && c.s.coverage >= 0.6 && pe(c) > 0 && pe(c) < 150);
  const cheapQ = [...quality].sort((a, b) => pe(a) - pe(b))[0], dearQ = [...quality].sort((a, b) => pe(b) - pe(a))[0];
  const lowPrice = cs.filter((c) => c.cur === "USD" && c.mcapUsd > 2e11).sort((a, b) => a.price - b.price)[0];
  const highPrice = cs.filter((c) => c.cur === "USD" && c.mcapUsd && lowPrice && c.mcapUsd < lowPrice.mcapUsd / 3).sort((a, b) => b.price - a.price)[0];
  const weak = cs.filter((c) => c.sell.some((f) => f.code === "weak") && c.mcapUsd > 2e10)[0];
  const dip = cs.filter((c) => c.opp === "strong").sort((a, b) => b.offHigh - a.offHigh)[0];
  const hs = holdings(), mySectors = {};
  for (const x of hs) if (x.c) mySectors[x.c.sector] = (mySectors[x.c.sector] ?? 0) + x.share;
  const row = (label, c, f) => `<tr><td>${label}</td><td class="r num"><b>${f(c)}</b></td></tr>`;
  const cmp = (label, key, f, betterHigh = true) => { const v = ex.m[key], m = median(peers.map((c) => c.m[key])); if (v == null || m == null) return "";
    const better = betterHigh ? v > m : v < m; return `<tr><td>${label}</td><td class="r num"><b>${f(v)}</b></td><td class="r num">${f(m)}</td><td><span class="tag ${better ? "good" : "warn"}">${better ? "Better than most" : "Worse than most"}</span></td></tr>`; };

  const lessons = [
    ["What you actually buy", `
      <p>A share is a small piece of a real business. If the business earns more money over the years, your piece becomes worth more. That is the whole idea of long-term investing: own good businesses and give them time.</p>
      <p>The share price alone tells you nothing. What matters is the price of the whole company, called <b>market value</b> (or market cap): share price × number of shares.</p>
      <div class="live"><p>${link(ex)} costs <b>${money(ex.price, ex.cur)}</b> per share and the whole company is valued at <b>${big(ex.mcap, ex.cur)}</b>.</p>
      ${lowPrice && highPrice ? `<p>${link(lowPrice)} costs only ${money(lowPrice.price, "USD")} a share, while ${link(highPrice)} costs ${money(highPrice.price, "USD")}. Yet ${esc(lowPrice.name)} is the far bigger company: ${big(lowPrice.mcapUsd, "USD")} against ${big(highPrice.mcapUsd, "USD")}. A low share price does not mean cheap.</p>` : ""}</div>
      <p class="note"><b>Remember:</b> you can buy any amount. Many brokers sell parts of a share, so an expensive share price never blocks you.</p>`],

    ["Is it a good business?", `
      <p>Before looking at the price, ask whether you would want to own this business at all. Two numbers answer most of it:</p>
      <ul class="pts"><li><b>Return on equity (ROE)</b>: how much profit the company makes each year for every 100 the owners have put in. Above 15% for many years is the mark of a strong business.</li>
      <li><b>Operating margin</b>: how much of each sale is left as profit after the costs of running the business. High margins mean customers happily pay and rivals cannot easily copy it.</li></ul>
      <div class="live"><label>Pick any company to use as the example in all lessons<select id="lesson-pick">${[...cs].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${esc(c.t)}" ${c === ex ? "selected" : ""}>${esc(c.name)} (${esc(c.t)})</option>`).join("")}</select></label>
      <div class="tablebox"><table><thead><tr><th>${esc(ex.name)}</th><th class="r">Company</th><th class="r">Typical in ${esc(ex.sector)}</th><th></th></tr></thead><tbody>
      ${cmp("Return on equity", "roe", (v) => pct(v))}${cmp("Operating margin", "opm", (v) => pct(v))}${cmp("Profit margin", "npm", (v) => pct(v))}</tbody></table></div>
      <p class="small muted">Always compare with companies in the same field. A supermarket and a software company have very different normal margins.</p></div>
      <p><b>Find it yourself:</b> on Yahoo Finance, open a company and choose the "Statistics" tab. Look under "Management Effectiveness" and "Profitability".</p>`],

    ["Is it growing, year after year?", `
      <p>One good year can be luck. A long-term investor wants sales and profits that rise steadily over many years. Look at the bars, not at a single number.</p>
      <div class="live">${ex.deep ? `<p>${link(ex)}: sales went from ${big(ex.deep.rev[0], ex.fcur)} in ${ex.deep.years[0]} to ${big(ex.deep.rev.at(-1), ex.fcur)} in ${ex.deep.years.at(-1)}${ex.m.cagr != null ? `, about <b>${pct(ex.m.cagr)} a year</b>` : ""}. Profit went from ${big(ex.deep.ni[0], ex.fcur)} to ${big(ex.deep.ni.at(-1), ex.fcur)}.</p>` : `<p>${link(ex)}: sales changed ${pct(ex.m.revg)} compared with last year.</p>`}
      <p>Open the company page to see the yearly bars.</p></div>
      <p>Ask <b>why</b> it will keep growing in ten years. More customers? New countries? Higher prices? If you cannot explain it in two sentences, you do not understand the business yet.</p>
      <p><b>Find it yourself:</b> Yahoo Finance, "Financials" tab, "Income Statement". Read the "Total Revenue" and "Net Income" rows from right (oldest) to left (newest).</p>`],

    ["Can it survive bad years?", `
      <p>Recessions come every few years. Companies with a lot of debt can be forced to sell parts of themselves or issue new shares at the worst moment. Companies with little debt and plenty of cash use bad years to get stronger.</p>
      <ul class="pts"><li><b>Debt to equity</b>: debt compared with the owners' money. Below 0.6 is comfortable for most businesses. Banks, utilities and real estate normally carry more.</li>
      <li><b>Free cash flow</b>: the cash left after the company paid all its bills and investments. Profit is an opinion of accountants. Cash is a fact.</li></ul>
      <div class="live"><div class="tablebox"><table><tbody>${row("Debt to equity", ex, (c) => c.m.de == null ? "-" : (c.m.de / 100).toFixed(2) + "x")}${row("Spare cash each year, as a share of the company's value", ex, (c) => pct(c.m.fcfy, 1))}${row("Financial safety score", ex, (c) => (c.s.safety ?? "-") + " / 100")}</tbody></table></div>
      ${weak ? `<p>A weak example right now: ${link(weak)} scores ${weak.s.quality} for quality. ${esc(weak.bad[0] ?? "")}.</p>` : ""}</div>`],

    ["Is the price fair?", `
      <p>A wonderful business can still be a bad investment if you overpay. The most used yardstick is the <b>P/E ratio</b>: the share price divided by one year of profit per share. A P/E of 20 means you pay 20 years of today's profit.</p>
      <ul class="pts"><li>Under 15: cheap. Ask why. Sometimes a bargain, sometimes a business in trouble.</li><li>15 to 25: normal for a good company.</li><li>Over 35: the price expects years of fast growth. If growth disappoints, the share can fall a lot.</li></ul>
      <p>The <b>PEG ratio</b> improves on this: P/E divided by the yearly profit growth. Around 1 is fair. Above 2.5 is expensive.</p>
      <div class="live"><p>${link(ex)} has a P/E of <b>${pe(ex) ? pe(ex).toFixed(1) : "-"}</b>${ex.m.peg ? ` and a PEG of <b>${ex.m.peg.toFixed(2)}</b>` : ""}. Price score: ${ex.s.value ?? "-"} / 100.</p>
      ${cheapQ && dearQ ? `<p>Among today's high-quality companies, the lowest P/E is ${link(cheapQ)} at ${pe(cheapQ).toFixed(1)} and the highest is ${link(dearQ)} at ${pe(dearQ).toFixed(1)}. Both are good businesses. Buyers of the second one are paying ${(pe(dearQ) / pe(cheapQ)).toFixed(0)} times more for each unit of profit.</p>` : ""}</div>
      <p class="note warn"><b>Careful with boom-and-bust industries.</b> Oil, mining, chips and car makers earn huge profits in good years and little in bad ones. Their P/E looks lowest exactly when profits are at a peak. The site marks these and is stricter with them.</p>`],

    ["When to buy", `
      <p>Nobody can pick the lowest price. People who try usually end up waiting forever. What works for long-term investors:</p>
      <ul class="pts"><li><b>Buy regularly.</b> Put in a fixed amount every month or every few months. You automatically buy more shares when prices are low. This is called dollar-cost averaging.</li>
      <li><b>Buy quality when it is on sale.</b> Markets regularly panic. When a great business drops 15% or more while its numbers stay healthy, that is the best time.</li>
      <li><b>Only money you will not need for 5+ years.</b> Shares can fall 30% or more and take years to recover. Keep an emergency fund outside the market first.</li>
      <li><b>Never everything at once into one company.</b></li></ul>
      <div class="live"><div class="tablebox"><table><thead><tr><th>Market</th><th class="r">Below its yearly high</th><th class="r">Past year</th></tr></thead><tbody>
      ${D.indices.map((i) => `<tr><td>${esc(i.name)}</td><td class="r num">${i.offHigh.toFixed(1)}%</td><td class="r num">${i.yr >= 0 ? "+" : ""}${i.yr}%</td></tr>`).join("")}</tbody></table></div>
      ${dip ? `<p>Right now the agent marks ${cs.filter((c) => c.opp === "strong").length} quality companies as on sale. The biggest drop is ${link(dip)}, ${dip.offHigh.toFixed(0)}% below its yearly high with a quality score of ${dip.s.quality}.</p>` : "<p>No quality company is on sale today. That is normal. Keep buying regularly and wait.</p>"}</div>
      <p>This is what the <b>Alerts</b> do for you: they fire when a company passes the quality test <i>and</i> its price is sensible.</p>`],

    ["When to sell", `
      <p>Great investors sell rarely. Selling a wonderful business because the price went up is the most common beginner mistake, and selling because the price went down is the second.</p>
      <p><b>Good reasons to sell:</b></p>
      <ul class="pts"><li>The business got worse: shrinking sales, vanishing profits, growing debt, or a problem that will last years.</li><li>The reason you bought is no longer true.</li><li>The price became extreme (for example a P/E above 45 without matching growth). Selling part is enough.</li><li>One company grew to more than a quarter of your money.</li><li>You need the money, or found a clearly better business.</li></ul>
      <p><b>Bad reasons:</b> the price dropped, the headlines are scary, a friend sold, you are bored.</p>
      <div class="live">${hs.length ? `<p>Your companies right now:</p><ul class="pts">${hs.map((x) => `<li>${x.c ? link(x.c) : esc(x.t)}: ${esc(x.signals[0].text)}</li>`).join("")}</ul>` : `<p>Record your buys in <a href="#portfolio">My buys</a> and this lesson will check each of your companies against these reasons with today's numbers.</p>`}</div>`],

    ["Do not bet on one horse", `
      <p>Even careful research gets it wrong sometimes. Spreading your money keeps one mistake from hurting much. Aim, over time, for at least 8 companies in 4 or more different sectors, and more than one country.</p>
      <p>A simple base many investors use: put most of the money in an index fund (one fund that owns hundreds of companies, such as an S&P 500 or TA-125 fund) and pick individual companies with the rest.</p>
      <div class="live">${hs.length ? `<p>You own ${hs.length} ${hs.length === 1 ? "company" : "companies"} in ${Object.keys(mySectors).length} sector(s):</p><div class="tablebox"><table><tbody>${Object.entries(mySectors).sort((a, b) => b[1] - a[1]).map(([s, v]) => `<tr><td>${esc(s)}</td><td class="r num">${pct(v)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <p>Best-ranked company in each sector today:</p><div class="tablebox"><table><tbody>${[...new Set(cs.map((c) => c.sector))].filter(Boolean).sort().map((s) => { const b = cs.filter((c) => c.sector === s && c.s.coverage >= 0.6).sort((x, y) => rank(y) - rank(x))[0]; return b ? `<tr><td>${esc(s)}</td><td>${link(b)}</td><td style="width:120px">${meter(b.s.quality)}</td></tr>` : ""; }).join("")}</tbody></table></div></div>`],

    ["The strategies the agent uses", `
      <p>The agent does not guess where prices go next. It checks every company against a few well-known long-term strategies:</p>
      ${Object.entries(STRAT).map(([k, [name, text]]) => `<div class="row"><span class="tag accent">${name}</span><span style="flex:1 1 260px">${text}</span><a href="#explore" data-filter='{"strat":"${k}"}'>${cs.filter((c) => c.strategies.includes(k)).length} companies today</a></div>`).join("")}
      <p>All of them share one belief: over many years, the share price follows the business. So find good businesses, do not overpay, and wait.</p>`],

    ["Where to read, and a 10-minute check", `
      <p><b>The source of truth is the company's own reports.</b> News and social media come second.</p>
      <ul class="pts"><li><b>Annual report</b> (in the US it is called a 10-K, free on <a href="https://www.sec.gov/edgar/search/" target="_blank" rel="noopener">SEC EDGAR</a>). Read the "Business" and "Risk Factors" sections first.</li>
      <li><b>Israeli companies</b> publish every report on <a href="https://maya.tase.co.il/" target="_blank" rel="noopener">MAYA</a>, the Tel Aviv Stock Exchange site.</li>
      <li><b>Investor relations page</b> on the company's website: presentations that explain the business in plain slides.</li>
      <li><b>Numbers at a glance:</b> <a href="https://finance.yahoo.com/" target="_blank" rel="noopener">Yahoo Finance</a> ("Statistics" and "Financials" tabs).</li>
      <li><b>News:</b> Reuters, Bloomberg, the Financial Times, and for Israel Globes, TheMarker and Calcalist. Read for facts about the business, not for price predictions.</li>
      <li><b>Books:</b> "The Little Book of Common Sense Investing" (Bogle), "One Up on Wall Street" (Lynch), "The Intelligent Investor" (Graham).</li></ul>
      <p><b>Your 10-minute check before any buy:</b></p>
      <ol class="pts"><li>Can I explain in two sentences how this company makes money?</li><li>ROE above 15% and healthy margins?</li><li>Sales and profits higher than 3 years ago?</li><li>Debt under control and real spare cash?</li><li>Is the P/E reasonable for its growth (PEG under about 2)?</li><li>What could go badly wrong? (Read "Risk Factors".)</li><li>Will this be only a sensible part of my money after I buy?</li></ol>
      <p class="note">Every company page on this site answers questions 2 to 5 with live numbers. Questions 1, 6 and 7 are yours.</p>`],
  ];
  return `<div><h1>Learn</h1><p class="lead muted">Ten short lessons. Each one uses today's real numbers, so you learn on live examples. Change the example company in lesson 2.</p></div>
    <div style="display:grid;gap:10px">${lessons.map(([title, body], i) => `<details class="lesson ${done.includes(String(i)) ? "done" : ""}" ${i === done.length && !done.includes(String(i)) ? "open" : ""}>
      <summary><span class="n">${done.includes(String(i)) ? "✓" : i + 1}</span>${title}</summary><div class="body">${body}
      ${done.includes(String(i)) ? "" : `<div><button class="btn" data-done="${i}">I understand this</button></div>`}</div></details>`).join("")}</div>`;
}
