import math

from equitylens.financials import cagr, calculate_period_metrics, data_quality_issues, growth, safe_divide


def test_growth_and_cagr_preserve_missing_values():
    assert math.isclose(growth(120, 100), 0.2)
    assert growth(None, 100) is None
    assert growth(100, 0) is None
    assert math.isclose(cagr(100, 121, 2), 0.1)
    assert cagr(-100, 121, 2) is None


def test_ratio_calculation_never_substitutes_missing_with_zero():
    metrics = calculate_period_metrics(
        {
            "revenue": 200, "gross_profit": 80, "ebit": 30, "net_income": 20,
            "total_assets": 300, "total_equity": 120, "operating_cash_flow": 35,
            "capital_expenditure": 15, "short_term_debt": 10, "long_term_debt": None,
            "cash": 25, "short_term_investments": 5,
        },
        {"revenue": 160, "total_assets": 280, "total_equity": 100},
    )
    assert metrics["revenue_growth"] == 0.25
    assert metrics["gross_margin"] == 0.4
    assert metrics["free_cash_flow"] == 20
    assert metrics["net_debt"] is None
    assert safe_divide(1, 0) is None


def test_currency_and_period_consistency_checks():
    figures = [
        {"metric": "revenue", "period": "2024", "currency": "USD"},
        {"metric": "revenue", "period": "FY25", "currency": "EUR"},
    ]
    issues = data_quality_issues(figures)
    assert any("Currency mismatch" in issue for issue in issues)
    assert any("FY25" in issue for issue in issues)
