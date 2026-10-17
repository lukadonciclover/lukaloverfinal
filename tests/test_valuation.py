import math

import numpy as np

from equitylens.models import DCFInputs
from equitylens.valuation import calculate_dcf, calculate_multiples, scenario_analysis, sensitivity_analysis, validate_dcf


def base_inputs(**updates):
    values = DCFInputs(
        base_revenue=100, revenue_growth=[0, 0, 0, 0, 0], ebit_margin=[0.1] * 5,
        tax_rate=[0] * 5, depreciation_pct_revenue=[0] * 5, capex_pct_revenue=[0] * 5,
        nwc_pct_revenue=[0] * 5, wacc=0.1, terminal_growth=0, cash=20, debt=30,
        diluted_shares=10, reference_price=8,
    )
    return values.model_copy(update=updates)


def test_dcf_terminal_equity_and_share_value():
    result = calculate_dcf(base_inputs())
    assert math.isclose(result.terminal_value, 100)
    assert math.isclose(result.enterprise_value, 100, rel_tol=1e-9)
    assert math.isclose(result.equity_value, 90, rel_tol=1e-9)
    assert math.isclose(result.implied_share_value, 9, rel_tol=1e-9)
    assert math.isclose(result.upside_downside, 0.125, rel_tol=1e-9)


def test_dcf_requires_wacc_above_terminal_growth_and_shares():
    assert validate_dcf(base_inputs(wacc=0.02, terminal_growth=0.03))
    no_shares = calculate_dcf(base_inputs(diluted_shares=None))
    assert no_shares.implied_share_value is None


def test_scenarios_and_sensitivity_are_reproducible():
    inputs = base_inputs(revenue_growth=[0.08] * 5, terminal_growth=0.02)
    scenarios = scenario_analysis(inputs)
    assert scenarios["Bear"].equity_value < scenarios["Base"].equity_value < scenarios["Bull"].equity_value
    matrix = sensitivity_analysis(inputs)
    assert matrix.shape == (5, 5)
    assert not np.isnan(matrix.iloc[2, 2])


def test_relative_valuation_excludes_invalid_denominators():
    result = calculate_multiples({"company": "Synthetic", "market_cap": 100, "debt": 20, "cash": 10, "revenue": 50, "ebitda": -1, "ebit": 0, "net_income": 5})
    assert result["enterprise_value"] == 110
    assert result["ev_revenue"] == 2.2
    assert result["ev_ebitda"] is None
    assert result["ev_ebit"] is None
    assert result["pe"] == 20
