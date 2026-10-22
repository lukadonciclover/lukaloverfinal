from io import BytesIO

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from equitylens.financials import calculate_period_metrics, data_quality_issues, periods_to_metrics
from equitylens.models import DCFInputs
from equitylens.valuation import calculate_dcf

client = TestClient(app)


def dcf_payload() -> dict:
    return {
        "base_revenue": 100,
        "revenue_growth": [0, 0, 0, 0, 0],
        "ebit_margin": [0.1] * 5,
        "tax_rate": [0] * 5,
        "depreciation_pct_revenue": [0] * 5,
        "capex_pct_revenue": [0] * 5,
        "nwc_pct_revenue": [0] * 5,
        "wacc": 0.1,
        "terminal_growth": 0,
        "cash": 20,
        "debt": 30,
        "diluted_shares": 10,
        "reference_price": 8,
    }


def evidence_chunk() -> dict:
    return {
        "chunk_id": "report-2024-p4-c1",
        "page": 4,
        "text": "Revenue increased to 120 in 2024 while gross margin reached 40 percent.",
        "document_name": "Report",
        "document_identifier": "report-2024",
        "metadata": {},
    }


def assessment(claim_id: str, claim: str, **updates: object) -> dict:
    value = {
        "claim_id": claim_id,
        "claim": claim,
        "status": "verified",
        "citations": [],
        "rationale": "Manual model proposal pending deterministic verification.",
    }
    value.update(updates)
    return value






def test_financials_normalize_mixed_scales_and_capex_signs():
    figures = [
        {"metric": "revenue", "period": "2024", "value": 2, "currency": "USD", "unit_scale": 1_000_000},
        {"metric": "operating_cash_flow", "period": "2024", "value": 500_000, "currency": "USD", "unit_scale": 1},
        {"metric": "capital_expenditure", "period": "2024", "value": -100_000, "currency": "USD", "unit_scale": 1},
    ]

    normalized = periods_to_metrics(figures)["2024"]
    assert normalized == {"revenue": 2, "operating_cash_flow": 0.5, "capital_expenditure": -0.1}
    assert calculate_period_metrics(normalized)["free_cash_flow"] == 0.4
    issues = data_quality_issues(figures)
    assert any("Mixed unit scales" in issue for issue in issues)
    assert any("positive cash outflow" in issue for issue in issues)




def test_dcf_rejects_non_finite_values_even_when_model_validation_is_bypassed():
    inputs = DCFInputs.model_construct(**(dcf_payload() | {"wacc": float("nan")}))
    with pytest.raises(ValueError, match="WACC must be finite"):
        calculate_dcf(inputs)
