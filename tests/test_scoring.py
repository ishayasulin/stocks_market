from agent import scoring


def co(sector="Technology", industry="Software - Application", off=20, **m):
    base = dict(roe=0.30, opm=0.30, roa=0.12, revg=0.15, epsg=0.2, cagr=0.12, de=30, cr=2, fcfy=0.05,
                netcash=0.05, beta=1.0, fpe=18, peg=1.2, evebitda=12, npm=0.2)
    return scoring.evaluate({"t": "X", "name": "X", "sector": sector, "industry": industry, "price": 10,
                             "offHigh": off, "m": {**base, **m}})


def test_great_business_on_sale_is_strong():
    c = co()
    assert c["s"]["quality"] >= 85 and c["opp"] == "strong" and not c["sell"]


def test_great_but_expensive_is_not_an_opportunity():
    c = co(fpe=60, peg=4, evebitda=40)
    assert c["s"]["quality"] >= 75 and c["opp"] is None
    assert any(f["code"] == "pricey" for f in c["sell"])


def test_weak_business_gets_sell_flag_even_if_cheap():
    c = co(roe=0.01, opm=0.01, roa=0.0, revg=-0.2, epsg=-0.5, cagr=-0.05, de=300, cr=0.6, fcfy=-0.02, netcash=-0.6, fpe=6)
    assert c["opp"] is None and c["sell"][0]["level"] == "sell"


def test_cyclical_never_gets_top_grade():
    c = co(sector="Basic Materials", industry="Gold", fpe=8)
    assert c["cyc"] and c["opp"] != "strong" and "boom and bust" in c["bad"][0]


def test_missing_data_is_not_trusted():
    c = scoring.evaluate({"t": "X", "name": "X", "sector": "Technology", "industry": "", "price": 1, "offHigh": 30,
                          "m": {"roe": 0.5}})
    assert c["opp"] is None and c["sell"] == []


def test_quality_drop_asks_for_review():
    c = scoring.evaluate(co(revg=0.0, cagr=0.0, epsg=0.0), q_before=95)
    assert any(f["code"] == "falling" for f in c["sell"])
