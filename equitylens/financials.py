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
    "Net debt": "Short-term debt + Long-term debt - Cash - Short-term investments",
    "Free cash flow": "Operating cash flow - Capital expenditure",
    "Free cash flow margin": "Free cash flow / Revenue",
    "Cash conversion": "Operating cash flow / Net income",
}


def safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator == 0:
        return None
    result = numerator / denominator
    return result if math.isfinite(result) else None


def growth(current: float | None, prior: float | None) -> float | None:
    if current is None or prior is None or prior == 0:
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
    prior = prior or {}
    revenue = current.get("revenue")
    debt = add_if_complete(current.get("short_term_debt"), current.get("long_term_debt"))
    liquidity = add_if_complete(current.get("cash"), current.get("short_term_investments"))
    net_debt = subtract_if_complete(debt, liquidity)
    fcf = subtract_if_complete(current.get("operating_cash_flow"), current.get("capital_expenditure"))
    return {
        "revenue_growth": growth(revenue, prior.get("revenue")),
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
    for figure in figures:
        period = figure.period if hasattr(figure, "period") else figure["period"]
        metric = figure.metric if hasattr(figure, "metric") else figure["metric"]
        value = figure.value if hasattr(figure, "value") else figure.get("value")
        result.setdefault(str(period), {})[str(metric)] = value
    return result


def analysis_table(figures: Sequence[Any]) -> pd.DataFrame:
    periods = periods_to_metrics(figures)
    rows = []
    previous: dict[str, float | None] | None = None
    for period in sorted(periods):
        calculated = calculate_period_metrics(periods[period], previous)
        rows.append({"period": period, **calculated})
        previous = periods[period]
    return pd.DataFrame(rows).set_index("period") if rows else pd.DataFrame()


def data_quality_issues(figures: Sequence[Any]) -> list[str]:
    issues: list[str] = []
    currencies = {str(figure.currency if hasattr(figure, "currency") else figure.get("currency")) for figure in figures}
    if len(currencies) > 1:
        issues.append("Currency mismatch: " + ", ".join(sorted(currencies)))
    periods = {str(figure.period if hasattr(figure, "period") else figure.get("period")) for figure in figures}
    invalid = sorted(period for period in periods if not re.fullmatch(r"(?:19|20)\d{2}(?:-Q[1-4])?", period))
    if invalid:
        issues.append("Unrecognized financial periods: " + ", ".join(invalid))
    keys: set[tuple[str, str]] = set()
    for figure in figures:
        metric = str(figure.metric if hasattr(figure, "metric") else figure.get("metric"))
        period = str(figure.period if hasattr(figure, "period") else figure.get("period"))
        if (metric, period) in keys:
            issues.append(f"Duplicate figure for {metric} in {period}.")
        keys.add((metric, period))
    return issues
