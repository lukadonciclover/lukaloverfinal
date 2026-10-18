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


def test_evidence_verification_rejects_bad_locators_and_reconciles_calculations():
    citation = {
        "source_id": "report-2024-p4-c1",
        "document_name": "Report",
        "page": 4,
        "excerpt": "Revenue increased to 120 in 2024",
    }
    response = client.post(
        "/v1/evidence/verify",
        json={
            "evidence": [evidence_chunk()],
            "calculation_context": {"valuation": {"equity_value": 90}},
            "assessments": [
                assessment("supported", "Revenue increased to 120 in 2024", citations=[citation]),
                assessment("semantic-conflict", "Revenue decreased to 120 in 2024", citations=[citation]),
                assessment("unknown", "Revenue increased", citations=[citation | {"source_id": "unknown"}]),
                assessment("wrong-document", "Revenue increased", citations=[citation | {"document_name": "Different report"}]),
                assessment("calculation", "Equity value is 999", calculation_ref="valuation.equity_value", claimed_value=999),
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["status"] for item in body["assessments"]] == ["partially_supported", "partially_supported", "unsupported", "unsupported", "contradicted"]
    assert body["counts"] == {"verified": 0, "partially_supported": 2, "unsupported": 2, "contradicted": 1}
    assert body["assessments"][1]["human_review_required"] is True
    assert body["assessments"][2]["citations"] == []
    assert body["assessments"][2]["human_review_required"] is True
    assert body["assessments"][3]["citations"] == []
    assert body["assessments"][4]["calculation_value"] == 90


def test_chat_citations_must_match_an_exact_retrieved_document_and_page():
    valid_output = '{"answer":"Revenue increased.","citations":["Report, page 4"],"unsupported":false,"missing_information":[]}'
    valid = client.post("/v1/chat/validate", json={"raw_output": valid_output, "evidence": [evidence_chunk()]})
    assert valid.status_code == 200
    assert valid.json()["valid"] is True

    wrong_page = valid_output.replace("page 4", "page 14")
    invalid = client.post("/v1/chat/validate", json={"raw_output": wrong_page, "evidence": [evidence_chunk()]})
    assert invalid.status_code == 200
    assert invalid.json()["valid"] is False
    assert "outside the retrieved source set" in invalid.json()["errors"][0]


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


def test_prompt_benchmark_separates_objective_metrics_from_human_review():
    response = client.post(
        "/v1/prompts/evaluate",
        json={
            "task_name": "Calculate revenue growth",
            "output": "Revenue growth was 20 percent. Source ID: benchmark-revenue.",
            "model_id": "manual-test-model",
            "prompt_version": "test-v1",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["objective_metrics"]["numerical_accuracy"] == 1
    assert body["objective_metrics"]["evidence_accuracy"] == 1
    assert body["objective_metrics"]["hallucinated_numbers"] == []
    assert body["human_judgments"]["rating"] is None
    assert body["model_id"] == "manual-test-model"


def test_dcf_rejects_non_finite_values_even_when_model_validation_is_bypassed():
    inputs = DCFInputs.model_construct(**(dcf_payload() | {"wacc": float("nan")}))
    with pytest.raises(ValueError, match="WACC must be finite"):
        calculate_dcf(inputs)


def test_excel_report_recalculates_dcf_instead_of_trusting_supplied_valuation():
    company = client.get("/v1/demo").json()["company"]
    response = client.post(
        "/v1/reports/xlsx",
        json={
            "company": company,
            "figures": [],
            "valuation": {"equity_value": 999, "implied_share_value": 99.9},
            "agent_outputs": {},
            "dcf_inputs": dcf_payload(),
            "claim_assessments": [{
                "claim_id": "c1", "claim": "=HYPERLINK(\"https://invalid.example\")", "status": "unsupported",
                "citations": [], "rationale": "No exact source excerpt was supplied.",
                "checks": ["No valid source locator."], "human_review_required": True,
            }],
        },
    )

    assert response.status_code == 200
    summary = pd.read_excel(BytesIO(response.content), sheet_name="Valuation Summary")
    assert summary.loc[0, "equity_value"] == pytest.approx(90)
    assert summary.loc[0, "implied_share_value"] == pytest.approx(9)
    evidence = pd.read_excel(BytesIO(response.content), sheet_name="Evidence Review")
    assert evidence.loc[0, "status"] == "unsupported"
    assert evidence.loc[0, "human_review_required"]
    assert evidence.loc[0, "claim"].startswith("'=")


def test_reports_reject_financial_ledgers_that_analysis_would_block():
    company = client.get("/v1/demo").json()["company"]
    figures = [
        {"company_id": 1, "metric": "revenue", "period": "2024", "value": 10, "currency": "USD"},
        {"company_id": 1, "metric": "net_income", "period": "2024", "value": 1, "currency": "EUR"},
    ]
    response = client.post("/v1/reports/pdf", json={"company": company, "figures": figures, "valuation": {}, "agent_outputs": {}})
    assert response.status_code == 422
    assert "Currency mismatch" in response.json()["detail"]
