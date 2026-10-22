"""Historical starting references, separate from forecast and valuation mathematics."""
import hashlib
import math
import re
from collections import Counter
from statistics import mean
from equitylens.assumptions import derive_assumptions
from equitylens.models import FinancialFigure

RATIOS = {
    "revenue_growth": "Revenue in consecutive annual periods, with positive prior revenue",
    "gross_margin": "Gross profit (or revenue minus cost of goods sold) and positive revenue",
    "ebitda_margin": "EBITDA (or EBIT plus D&A) and positive revenue",
    "ebit_margin": "EBIT and positive revenue",
    "opex_ratio": "Operating expenses excluding D&A, and positive revenue; confirm compatibility with the forecast gross-profit-to-EBITDA definition",
    "depreciation_ratio": "Depreciation & amortization and positive revenue",
    "capex_ratio": "Capital expenditure and positive revenue",
    "nwc_ratio": "Explicit net operating working capital and positive revenue; generic current assets minus current liabilities is not substituted",
    "dividend_growth": "Consecutive annual per-share dividends, with positive prior per-share dividend",
    "tax_rate": "Tax expense and positive pretax income (or EBIT minus interest expense); reported effective tax is not forecast cash tax",
}


def historical_references(figures, currency: str, window: int = 3):
    if window not in (2, 3, 5):
        raise ValueError("Choose a 2, 3 or 5 year historical window.")
    annual = [f for f in figures if re.fullmatch(r"(?:19|20)\d{2}", f.period)]
    counts = Counter((f.period, f.metric) for f in annual)
    usable = [f for f in annual if counts[f.period, f.metric] == 1 and f.currency == currency and f.value is not None and math.isfinite(f.value * f.unit_scale)]
    years = sorted({f.period for f in usable})
    selected = years[-window:]
    indexed = {(f.period, f.metric): f for f in usable}
    expansions = {}
    # These definitions match the existing financial analysis; no generic NWC substitution.
    for year in years:
        for target, left, right, sign in [("gross_profit", "revenue", "cost_of_goods_sold", -1), ("ebitda", "ebit", "depreciation_amortization", 1), ("pretax_income", "ebit", "interest_expense", -1)]:
            a, b = indexed.get((year, left)), indexed.get((year, right))
            if counts[year, target] == 0 and a is not None and b is not None:
                amount = a.value*a.unit_scale + sign*b.value*b.unit_scale
                if math.isfinite(amount):
                    derived = FinancialFigure(company_id=a.company_id, metric=target, period=year, value=amount, currency=currency, unit_scale=1, origin="derived")
                    usable.append(derived)
                    indexed[year, target] = derived
                    expansions[year, target] = [a, b]
    observations = derive_assumptions(usable, currency)
    def source_input(f):
        return dict(metric=f.metric,period=f.period,value=f.value,currency=f.currency,unit_scale=f.unit_scale,document_id=f.source.document_identifier if f.source else "")
    for row in observations:
        row["inputs"] = [item for i in row["inputs"] for item in ([source_input(f) for f in expansions[i["period"],i["metric"]]] if (i["period"],i["metric"]) in expansions else [i])]
    averages = []
    for metric, required in RATIOS.items():
        valid = [r for r in observations if r["metric"] == metric and r["period"] in selected]
        value = mean(r["value"] for r in valid) if valid else None
        inputs = list({(i["metric"],i["period"]):i for r in valid for i in r["inputs"]}.values())
        periods = [r["period"] for r in valid]
        signature = hashlib.sha256(str((metric,window,inputs)).encode()).hexdigest()
        evidence = dict(id=f"average:{signature}",metric=metric,value=value,minimum=None,maximum=None,unit="percentage",currency=currency,unit_scale=1,period=", ".join(periods) or "Unavailable",basis="historical average",scope="consolidated",classification="historical derived",explicit=False,document_id="approved-ledger",document_name="Approved historical ledger",page=None,excerpt="",confidence=1,status="pending",rationale=f"Arithmetic mean of {len(valid)} valid annual ratios in the latest {window}-year window. {required}. Historical starting reference, not a forecast.",inputs=inputs)
        compatible = metric != "opex_ratio" or all(re.search(r"exclud.*(?:depreciation|D&A)", indexed[period,"operating_expenses"].notes, re.I) or (indexed.get((period,"depreciation_amortization")) is not None and indexed[period,"depreciation_amortization"].value == 0) for period in periods)
        averages.append(dict(prefill_eligible=compatible,metric=metric,value=value,count=len(valid),periods=periods,observations=valid,source=evidence,unavailable="" if valid else required))
    latest = []
    # Balance sheet references all use the latest annual position, never mixed-year totals.
    if years:
        year=years[-1]
        for metric, ledger_metric in [("base_revenue","revenue"),("opening_nwc","net_working_capital"),("cash","cash"),("debt","total_debt"),("book_assets","total_assets"),("book_liabilities","total_liabilities"),("dividend","dividend_per_share")]:
            f=indexed.get((year,ledger_metric))
            items=[f] if f else []
            if metric=="debt" and not f and counts[year,"total_debt"]==0:
                short,long=indexed.get((year,"short_term_debt")),indexed.get((year,"long_term_debt"))
                if short is not None and long is not None:items=[short,long]
            if not items:continue
            value=sum(f.value*f.unit_scale for f in items)
            if not math.isfinite(value) or (metric=="base_revenue" and value<=0) or (metric not in {"opening_nwc"} and value<0):continue
            evidence=dict(id=f"latest:{metric}:{hashlib.sha256(str([source_input(f) for f in items]).encode()).hexdigest()}",metric=metric,value=value,minimum=None,maximum=None,unit="currency",currency=currency,unit_scale=1,period=year,basis="annual",scope="consolidated",classification="historical derived",explicit=False,document_id="approved-ledger",document_name="Approved historical ledger",page=None,excerpt="",confidence=1,status="pending",rationale=f"Latest annual {ledger_metric}, actual {currency} units. Not an average. Confirm it remains appropriate at the valuation date.",inputs=[source_input(f) for f in items])
            latest.append(evidence)
    return dict(window=window,periods=selected,available_years=years,averages=averages,latest=latest,currency=currency,
        issues=[f"Excluded duplicate {metric} in {period}." for (period,metric),count in counts.items() if count>1] + (["Excluded figures in other currencies."] if any(f.currency!=currency for f in annual) else []) + (["Quarterly data is excluded from annual references."] if any("-Q" in f.period for f in figures) else []))


def unavailable_reasons(figures, rows):
    from equitylens.financials import periods_to_metrics
    periods=periods_to_metrics(figures)
    requirements={"revenue_growth":["revenue"],"gross_margin":["revenue","gross_profit"],"ebitda_margin":["revenue","ebitda"],"net_profit_margin":["revenue","net_income"],"return_on_equity":["net_income","total_equity"],"current_ratio":["current_assets","current_liabilities"],"net_debt":["short_term_debt","long_term_debt","cash"],"return_on_invested_capital":["ebit","interest_expense","tax_expense","short_term_debt","long_term_debt","total_equity","cash"]}
    reasons={}
    for row in rows:
        p=periods.get(str(row["period"]),{})
        reasons[str(row["period"])]=details={}
        for metric,value in row.items():
            if value is not None or metric=="period":continue
            missing=[key.replace("_"," ") for key in requirements.get(metric,[]) if p.get(key) is None]
            if missing:details[metric]="Missing approved inputs: "+", ".join(missing)+"."
            elif metric=="return_on_invested_capital":
                issues=[]
                pretax=p["ebit"]-p["interest_expense"]
                invested=p["short_term_debt"]+p["long_term_debt"]+p["total_equity"]-p["cash"]
                if pretax<=0:issues.append("Pretax income (EBIT minus interest) is not positive")
                elif not 0<=p["tax_expense"]/pretax<=1:issues.append("The reported effective tax rate is outside 0% to 100%")
                if invested<=0:issues.append("Invested capital (short-term debt + long-term debt + equity - cash) is not positive")
                details[metric]="ROIC unavailable: "+"; ".join(issues)+". Review the approved balances."
            else:details[metric]="A positive denominator and comparable prior-period observations are required; review the approved annual inputs."
    return reasons
