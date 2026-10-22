from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from equitylens.models import DCFInputs


@dataclass
class DCFResult:
    forecast: pd.DataFrame
    enterprise_value: float
    equity_value: float
    implied_share_value: float | None
    terminal_value: float
    pv_terminal_value: float
    upside_downside: float | None
    timing_convention: str = "Year-end discounting; terminal value is measured at the end of the final forecast year."


def validate_dcf(inputs: DCFInputs) -> list[str]:
    errors: list[str] = []
    if inputs.base_revenue <= 0:
        errors.append("Base revenue must be positive; enter reviewed data or an explicit revenue assumption.")
    if any(value < 0 for value in [*inputs.depreciation_pct_revenue, *inputs.capex_pct_revenue]):
        errors.append("D&A and capex ratios must be non-negative; working capital can be signed.")
    lengths = {
        len(inputs.revenue_growth), len(inputs.ebit_margin), len(inputs.tax_rate),
        len(inputs.depreciation_pct_revenue), len(inputs.capex_pct_revenue), len(inputs.nwc_pct_revenue),
    }
    if len(lengths) != 1:
        errors.append("All annual forecast assumption lists must have the same length.")
    if inputs.terminal_method == "growth" and inputs.wacc <= inputs.terminal_growth:
        errors.append("WACC must exceed terminal growth for the Gordon growth model.")
    if inputs.wacc <= 0:
        errors.append("WACC must be positive.")
    if inputs.terminal_growth <= -1:
        errors.append("Terminal growth must be greater than -100%.")
    if inputs.diluted_shares is not None and inputs.diluted_shares <= 0:
        errors.append("Diluted shares must be positive when supplied.")
    scalar_values = {
        "Base revenue": inputs.base_revenue,
        "WACC": inputs.wacc,
        "Terminal growth": inputs.terminal_growth,
        "Cash": inputs.cash,
        "Debt": inputs.debt,
        "Minority interest": inputs.minority_interest,
        "Non-operating assets": inputs.non_operating_assets,
    }
    if inputs.diluted_shares is not None:
        scalar_values["Diluted shares"] = inputs.diluted_shares
    if inputs.reference_price is not None:
        scalar_values["Reference price"] = inputs.reference_price
    if inputs.opening_nwc is not None:
        scalar_values["Opening working capital"] = inputs.opening_nwc
    for label, value in scalar_values.items():
        if not math.isfinite(value):
            errors.append(f"{label} must be finite.")
    assumptions = [
        *inputs.revenue_growth, *inputs.ebit_margin, *inputs.tax_rate,
        *inputs.depreciation_pct_revenue, *inputs.capex_pct_revenue, *inputs.nwc_pct_revenue,
    ]
    if any(not math.isfinite(value) for value in assumptions):
        errors.append("All annual assumptions must be finite.")
    if any(abs(value) > 10 for value in assumptions) or abs(inputs.wacc) > 10 or abs(inputs.terminal_growth) > 10:
        errors.append("Rate assumptions must be between -1000% and 1000%.")
    if any(abs(value) > 1e100 for value in (inputs.base_revenue, inputs.cash, inputs.debt, inputs.minority_interest, inputs.non_operating_assets)):
        errors.append("Monetary assumptions are too large to calculate safely.")
    if any(value <= -1 for value in inputs.revenue_growth):
        errors.append("Revenue growth must be greater than -100%.")
    if any(value < 0 or value > 1 for value in inputs.tax_rate):
        errors.append("Tax rates must be between 0% and 100%.")
    if inputs.reference_price is not None and inputs.reference_price <= 0:
        errors.append("Reference price must be positive when supplied.")
    return errors


def calculate_dcf(inputs: DCFInputs) -> DCFResult:
    errors = validate_dcf(inputs)
    if errors:
        raise ValueError(" ".join(errors))
    rows: list[dict[str, float | int]] = []
    revenue = inputs.base_revenue
    prior_nwc = inputs.opening_nwc if inputs.opening_nwc is not None else revenue * inputs.nwc_pct_revenue[0]
    for index in range(len(inputs.revenue_growth)):
        year = index + 1
        revenue *= 1 + inputs.revenue_growth[index]
        ebit = revenue * inputs.ebit_margin[index]
        cash_taxes = (ebit if inputs.tax_loss_benefit else max(ebit, 0)) * inputs.tax_rate[index]
        nopat = ebit - cash_taxes
        depreciation = revenue * inputs.depreciation_pct_revenue[index]
        capex = revenue * inputs.capex_pct_revenue[index]
        nwc = revenue * inputs.nwc_pct_revenue[index]
        change_nwc = nwc - prior_nwc
        fcff = nopat + depreciation - capex - change_nwc
        discount_factor = (1 + inputs.wacc) ** year
        pv_fcff = fcff / discount_factor
        rows.append(
            {
                "year": year, "revenue": revenue, "growth": inputs.revenue_growth[index],
                "ebit_margin": inputs.ebit_margin[index], "ebit": ebit, "tax_rate": inputs.tax_rate[index],
                "cash_taxes": cash_taxes, "nopat": nopat, "depreciation": depreciation, "capex": capex, "nwc": nwc,
                "change_nwc": change_nwc, "fcff": fcff, "discount_factor": discount_factor, "pv_fcff": pv_fcff,
            }
        )
        prior_nwc = nwc
    forecast = pd.DataFrame(rows).set_index("year")
    final_fcff = float(forecast.iloc[-1]["fcff"])
    terminal_value = (final_fcff * (1 + inputs.terminal_growth) / (inputs.wacc - inputs.terminal_growth)
                      if inputs.terminal_method == "growth" else
                      float(forecast.iloc[-1]["ebit"] + forecast.iloc[-1]["depreciation"]) * inputs.exit_multiple)
    if inputs.terminal_method == "exit_multiple" and terminal_value <= 0:
        raise ValueError("Exit multiple requires positive terminal EBITDA.")
    pv_terminal_value = terminal_value / (1 + inputs.wacc) ** len(forecast)
    enterprise_value = float(forecast["pv_fcff"].sum() + pv_terminal_value)
    equity_value = enterprise_value - inputs.debt + inputs.cash - inputs.minority_interest + inputs.non_operating_assets
    implied = equity_value / inputs.diluted_shares if inputs.diluted_shares is not None else None
    upside = implied / inputs.reference_price - 1 if implied is not None and inputs.reference_price not in {None, 0} else None
    numeric_outputs = [terminal_value, pv_terminal_value, enterprise_value, equity_value]
    if implied is not None:
        numeric_outputs.append(implied)
    if upside is not None:
        numeric_outputs.append(upside)
    if not np.isfinite(forecast.select_dtypes(include="number").to_numpy()).all() or not all(math.isfinite(value) for value in numeric_outputs):
        raise ValueError("DCF assumptions produced non-finite results.")
    return DCFResult(forecast, enterprise_value, equity_value, implied, terminal_value, pv_terminal_value, upside)


def scenario_analysis(base: DCFInputs, changes: dict[str, dict[str, float]] | None = None) -> dict[str, DCFResult]:
    changes = changes or {
        "Bear": {"growth_delta": -0.03, "margin_delta": -0.02, "wacc_delta": 0.01, "terminal_delta": -0.005},
        "Base": {"growth_delta": 0.0, "margin_delta": 0.0, "wacc_delta": 0.0, "terminal_delta": 0.0},
        "Bull": {"growth_delta": 0.03, "margin_delta": 0.02, "wacc_delta": -0.01, "terminal_delta": 0.005},
    }
    results = {}
    for name, delta in changes.items():
        assumptions = base.model_copy(
            update={
                "revenue_growth": [value + delta.get("growth_delta", 0) for value in base.revenue_growth],
                "ebit_margin": [value + delta.get("margin_delta", 0) for value in base.ebit_margin],
                "wacc": base.wacc + delta.get("wacc_delta", 0),
                "terminal_growth": base.terminal_growth + delta.get("terminal_delta", 0),
            }
        )
        try:
            results[name] = calculate_dcf(assumptions)
        except ValueError as exc:
            raise ValueError(f"{name} scenario is invalid: {exc}") from exc
    return results


def sensitivity_analysis(inputs: DCFInputs, wacc_values: list[float] | None = None, growth_values: list[float] | None = None) -> pd.DataFrame:
    wacc_values = wacc_values or [inputs.wacc + offset for offset in (-0.02, -0.01, 0, 0.01, 0.02)]
    growth_values = growth_values or [inputs.terminal_growth + offset for offset in (-0.01, -0.005, 0, 0.005, 0.01)]
    matrix: dict[str, list[float]] = {}
    for growth_rate in growth_values:
        values = []
        for wacc in wacc_values:
            if wacc <= growth_rate:
                values.append(np.nan)
                continue
            result = calculate_dcf(inputs.model_copy(update={"wacc": wacc, "terminal_growth": growth_rate}))
            values.append(result.implied_share_value if result.implied_share_value is not None else result.equity_value)
        matrix[f"g={growth_rate:.1%}"] = values
    return pd.DataFrame(matrix, index=[f"WACC={value:.1%}" for value in wacc_values]).T


def calculate_multiples(row: dict[str, float | str | None]) -> dict[str, float | None]:
    market_cap = _number(row.get("market_cap"))
    debt = _number(row.get("debt"))
    cash = _number(row.get("cash"))
    enterprise_value = _number(row.get("enterprise_value"))
    if enterprise_value is None and None not in (market_cap, debt, cash):
        enterprise_value = market_cap + debt - cash  # type: ignore[operator]
    return {
        "company": str(row.get("company", "")),
        "enterprise_value": enterprise_value,
        "ev_revenue": _multiple(enterprise_value, _number(row.get("revenue"))),
        "ev_ebitda": _multiple(enterprise_value, _number(row.get("ebitda"))),
        "ev_ebit": _multiple(enterprise_value, _number(row.get("ebit"))),
        "pe": _multiple(market_cap, _number(row.get("net_income"))),
        "pb": _multiple(market_cap, _number(row.get("book_equity"))),
        "ps": _multiple(market_cap, _number(row.get("revenue"))),
    }


def peer_statistics(rows: list[dict[str, Any]]) -> pd.DataFrame:
    calculated = pd.DataFrame([calculate_multiples(row) for row in rows])
    if calculated.empty:
        return calculated
    numeric = calculated.select_dtypes(include="number")
    return pd.DataFrame({"Median": numeric.median(), "Average": numeric.mean(), "Minimum": numeric.min(), "Maximum": numeric.max()}).T


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _multiple(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return numerator / denominator
