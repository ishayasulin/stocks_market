"""Settings for the stock agent. Edit numbers here to change what it scans and how strict it is."""

# --- Which companies get scanned -------------------------------------------------
SECTORS = [
    "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
    "Consumer Defensive", "Industrials", "Energy", "Utilities",
    "Basic Materials", "Communication Services", "Real Estate",
]

# Biggest companies per sector, taken from Yahoo's screener.
# (market label, Yahoo region, exchanges, how many per sector)
SCREENS = [
    ("US", "us", ["NMS", "NYQ"], 20),
    ("IL", "il", ["TLV"], 10),
]

# Leading companies on other world markets (Yahoo ticker format).
WORLD = """
ASML.AS SAP.DE 005930.KS 6758.T 6861.T 8035.T 2330.TW TCS.NS INFY.NS
NOVO-B.CO NOVN.SW AZN.L SAN.PA
MC.PA OR.PA RMS.PA NESN.SW ULVR.L ITX.MC 7203.T 9983.T DGE.L ABI.BR
SIE.DE AIR.PA SU.PA ABBN.SW ATCO-A.ST 6501.T RR.L BA.L RHM.DE CSU.TO
HSBA.L ALV.DE 8306.T RY.TO CBA.AX UBSG.SW ZURN.SW INVE-B.ST HDFCBANK.NS
SHEL.L TTE.PA BP.L EQNR.OL RELIANCE.NS
IBE.MC ENEL.MI NG.L RWE.DE ORSTED.CO
BHP.AX RIO.L AI.PA SIKA.SW GLEN.L
0700.HK DTE.DE 9432.T 9984.T 9988.HK 1211.HK 300750.SZ
VNA.DE GMG.AX
""".split()

# Market indices shown on the home page and used in lessons.
INDICES = {
    "^GSPC": "S&P 500 (US)", "^IXIC": "Nasdaq (US tech)", "^TA125.TA": "TA-125 (Israel)",
    "^STOXX50E": "Euro Stoxx 50 (Europe)", "^N225": "Nikkei 225 (Japan)",
}

# --- When is something an opportunity -------------------------------------------
QUALITY_MIN = 75        # business quality score needed (0-100)
VALUE_MIN_SALE = 50     # price score needed when the stock is also on sale
VALUE_MIN_FAIR = 62     # price score needed when it is not on sale
SAFETY_MIN = 50        # financial safety score needed
PULLBACK_MIN = 15       # "on sale" = at least this % below its 52-week high
COVERAGE_MIN = 0.6      # share of the numbers that must be available to trust a score
REALERT_DAYS = 30       # do not alert again on the same company within this many days
MAX_NEW_ALERTS = 6      # per scan, so you are never flooded

DEEP_DIVE_TOP = 60      # companies that get multi-year financial statements
NEWS_TOP = 14           # companies whose news is read (plus your watchlist)

AI_MODEL = "claude-opus-5-5"
