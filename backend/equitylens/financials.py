from __future__ import annotations

import math
import re
from collections.abc import Sequence
from typing import Any

import pandas as pd

FORMULAS = {
    "Revenue growth": "(Current revenue / Prior revenue) - 1",
    "Revenue CAGR": "(Ending revenue / Beginning revenue)^(1 / years) - 1",
    "Gross margin": "Gross profit / Revenue",
    "EBITDA margin": "EBITDA / Revenue",
    "Operating margin": "EBIT / Revenue",
    "Net profit margin": "Net income / Revenue",
    "Return on assets": "Net income / Average total assets",
    "Return on equity": "Net income / Average total equity",
    "Current ratio": "Total current assets / Total current liabilities",
    "Debt-to-equity": "Total debt / Total equity",
    "Net debt": "Short-term debt + Long-term debt - Cash",
    "Free cash flow": "Operating cash flow - Capital expenditure",
    "Free cash flow margin": "Free cash flow / Revenue",
    "Cash conversion": "Operating cash flow / Net income",
}


def safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    result = numerator / denominator
    return result if math.isfinite(result) else None


def growth(current: float | None, prior: float | None) -> float | None:
    if current is None or prior is None or prior <= 0:
        return None
    return current / prior - 1


def cagr(beginning: float | None, ending: float | None, years: int) -> float | None:
    if beginning is None or ending is None or beginning <= 0 or ending < 0 or years <= 0:
        return None
    return (ending / beginning) ** (1 / years) - 1


def average(current: float | None, prior: float | None) -> float | None:
    if current is None or prior is None:
        return None
    return (current + prior) / 2


def calculate_period_metrics(current: dict[str, float | None], prior: dict[str, float | None] | None = None) -> dict[str, float | None]:
    current = dict(current)
    if current.get("gross_profit") is None:
        current["gross_profit"] = subtract_if_complete(current.get("revenue"), current.get("cost_of_goods_sold"))
    if current.get("ebitda") is None:
        current["ebitda"] = add_if_complete(current.get("ebit"), current.get("depreciation_amortization"))
    prior = prior or {}
    revenue = current.get("revenue")
    debt = add_if_complete(current.get("short_term_debt"), current.get("long_term_debt"))
    liquidity = current.get("cash")
    net_debt = subtract_if_complete(debt, liquidity)
    capex = current.get("capital_expenditure")
    fcf = subtract_if_complete(current.get("operating_cash_flow"), abs(capex) if capex is not None else None)
    return {
        "revenue_growth": growth(revenue, prior.get("revenue")),
        "ebitda_growth": growth(current.get("ebitda"), prior.get("ebitda")),
        "ebit_growth": growth(current.get("ebit"), prior.get("ebit")),
        "net_income_growth": growth(current.get("net_income"), prior.get("net_income")),
        "interest_coverage": safe_divide(current.get("ebit"), current.get("interest_expense")) if (current.get("interest_expense") or 0) > 0 else None,
        "operating_cash_flow_margin": safe_divide(current.get("operating_cash_flow"), revenue),
        "capex_intensity": safe_divide(abs(capex) if capex is not None else None, revenue),
        "working_capital": subtract_if_complete(current.get("current_assets"), current.get("current_liabilities")),
        "cash_flow_conversion": safe_divide(current.get("operating_cash_flow"), current.get("ebitda")) if (current.get("ebitda") or 0) > 0 else None,
        "gross_margin": safe_divide(current.get("gross_profit"), revenue),
        "ebitda_margin": safe_divide(current.get("ebitda"), revenue),
        "operating_margin": safe_divide(current.get("ebit"), revenue),
        "net_profit_margin": safe_divide(current.get("net_income"), revenue),
        "return_on_assets": safe_divide(current.get("net_income"), average(current.get("total_assets"), prior.get("total_assets"))),
        "return_on_equity": safe_divide(current.get("net_income"), average(current.get("total_equity"), prior.get("total_equity"))),
        "current_ratio": safe_divide(current.get("current_assets"), current.get("current_liabilities")),
        "debt_to_equity": safe_divide(debt, current.get("total_equity")),
        "net_debt": net_debt,
        "free_cash_flow": fcf,
        "free_cash_flow_margin": safe_divide(fcf, revenue),
        "cash_conversion": safe_divide(current.get("operating_cash_flow"), current.get("net_income")),
    }


def add_if_complete(*values: float | None) -> float | None:
    return sum(values) if values and all(value is not None for value in values) else None


def subtract_if_complete(left: float | None, right: float | None) -> float | None:
    return left - right if left is not None and right is not None else None


def figures_to_frame(figures: Sequence[Any]) -> pd.DataFrame:
    rows = []
    for figure in figures:
        item = figure.model_dump() if hasattr(figure, "model_dump") else dict(figure)
        rows.append(item)
    if not rows:
        return pd.DataFrame(columns=["metric", "period", "value", "currency", "unit_scale", "origin", "notes"])
    return pd.DataFrame(rows)


def periods_to_metrics(figures: Sequence[Any]) -> dict[str, dict[str, float | None]]:
    result: dict[str, dict[str, float | None]] = {}
    scales = [float(figure.unit_scale if hasattr(figure, "unit_scale") else figure.get("unit_scale", 1)) for figure in figures]
    target_scale = max(scales, default=1.0)
    for figure in figures:
        period = figure.period if hasattr(figure, "period") else figure["period"]
        metric = figure.metric if hasattr(figure, "metric") else figure["metric"]
        value = figure.value if hasattr(figure, "value") else figure.get("value")
        scale = float(figure.unit_scale if hasattr(figure, "unit_scale") else figure.get("unit_scale", 1))
        normalized = value * scale / target_scale if value is not None else None
        result.setdefault(str(period), {})[str(metric)] = normalized
    return result


def analysis_table(figures: Sequence[Any]) -> pd.DataFrame:
    periods = periods_to_metrics(figures)
    rows = []
    from equitylens.periods import classify, quarter_index
    previous_by_frequency = {}
    for period in sorted(periods):
        frequency=classify(period)
        previous_period=previous_by_frequency.get(frequency)
        consecutive=previous_period and (int(period)-int(previous_period)==1 if frequency=='annual' else quarter_index(period)-quarter_index(previous_period)==1 if frequency=='quarterly' else False)
        def calendar(label):
            return {getattr(f,'fiscal_calendar','') if hasattr(f,'period') else f.get('fiscal_calendar','') for f in figures if (f.period if hasattr(f,'period') else f['period'])==label} - {''}
        if previous_period and calendar(period) and calendar(previous_period) and calendar(period)!=calendar(previous_period): consecutive=False
        calculated = calculate_period_metrics(periods[period], periods[previous_period] if consecutive else None)
        first = min(p for p in periods if classify(p)==frequency)
        calculated["revenue_cagr"] = cagr(periods[first].get("revenue"), periods[period].get("revenue"), int(period[:4])-int(first[:4])) if frequency=="annual" and not (calendar(first) and calendar(period) and calendar(first)!=calendar(period)) else None
        current = periods[period]
        invested = subtract_if_complete(add_if_complete(current.get("short_term_debt"), current.get("long_term_debt"), current.get("total_equity")), current.get("cash"))
        pretax = subtract_if_complete(current.get("ebit"), current.get("interest_expense"))
        rate = safe_divide(current.get("tax_expense"), pretax) if pretax is not None and pretax > 0 else None
        calculated["return_on_invested_capital"] = safe_divide(current["ebit"]*(1-rate), invested) if rate is not None and 0 <= rate <= 1 and invested is not None and invested > 0 and current.get("ebit") is not None else None
        rows.append({"period": period, **calculated})
        previous_by_frequency[frequency] = period
    return pd.DataFrame(rows).set_index("period") if rows else pd.DataFrame()


def data_quality_issues(figures: Sequence[Any]) -> list[str]:
    issues: list[str] = []
    currencies = {str(figure.currency if hasattr(figure, "currency") else figure.get("currency")) for figure in figures}
    if len(currencies) > 1:
        issues.append("Currency mismatch: " + ", ".join(sorted(currencies)))
    scales = {float(figure.unit_scale if hasattr(figure, "unit_scale") else figure.get("unit_scale", 1)) for figure in figures}
    if len(scales) > 1:
        issues.append("Mixed unit scales were normalized before calculation: " + ", ".join(f"{scale:g}" for scale in sorted(scales)))
    periods = {str(figure.period if hasattr(figure, "period") else figure.get("period")) for figure in figures}
    invalid = sorted(period for period in periods if not re.fullmatch(r"(?:19|20)\d{2}(?:-Q[1-4])?", period))
    if invalid:
        issues.append("Unrecognized financial periods: " + ", ".join(invalid))
    has_annual = any(re.fullmatch(r"(?:19|20)\d{2}", period) for period in periods)
    has_quarterly = any(re.fullmatch(r"(?:19|20)\d{2}-Q[1-4]", period) for period in periods)
    if has_annual and has_quarterly:
        issues.append("Annual and quarterly periods cannot be compared in one growth series.")
    keys: set[tuple[str, str]] = set()
    for figure in figures:
        metric = str(figure.metric if hasattr(figure, "metric") else figure.get("metric"))
        period = str(figure.period if hasattr(figure, "period") else figure.get("period"))
        if (metric, period) in keys:
            issues.append(f"Duplicate figure for {metric} in {period}.")
        keys.add((metric, period))
        value = figure.value if hasattr(figure, "value") else figure.get("value")
        if metric == "capital_expenditure" and value is not None and value < 0:
            issues.append(f"Capital expenditure in {period} was normalized to a positive cash outflow.")
        if metric in {"revenue", "ebitda", "ebit", "net_income", "total_equity", "interest_expense"} and value is not None and value <= 0:
            issues.append(f"Non-positive {metric} in {period}: growth and valuation multiples using it as a denominator may be unavailable.")
    return issues
