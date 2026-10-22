import json
import math
from io import BytesIO

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def dcf_payload():
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


def test_health_and_dcf_endpoints():
    assert client.get("/health").json()["calculation_engine"] == "deterministic"
    demo = client.get("/v1/demo")
    assert demo.status_code == 404
    response = client.post("/v1/valuation/dcf", json=dcf_payload())
    assert response.status_code == 200
    assert math.isclose(response.json()["equity_value"], 90)
    assert math.isclose(response.json()["implied_share_value"], 9)
    assert set(response.json()["scenarios"]) == {"bear", "base", "bull"}


def test_dcf_request_validation_and_missing_data():
    invalid = dcf_payload() | {"wacc": 0.02, "terminal_growth": 0.03}
    response = client.post("/v1/valuation/dcf", json=invalid)
    assert response.status_code == 422
    financials = client.post(
        "/v1/financials/analyze",
        json={"figures": [{"company_id": 1, "metric": "revenue", "period": "2024", "value": None}]},
    )
    assert financials.status_code == 200
    assert financials.json()["analysis"][0]["gross_margin"] is None


def test_csv_document_upload_is_processed_without_retention():
    content = b"metric,2024\nRevenue,1250\n"
    response = client.post(
        "/v1/documents/process",
        files={"file": ("financials.csv", content, "text/csv")},
        data={"currency": "USD"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["document"]["retained_by_server"] is False
    assert body["document"]["document_type"] == "Financial dataset"
    assert body["chunks"]






def test_upload_rejects_unsupported_files():
    response = client.post(
        "/v1/documents/process",
        files={"file": ("notes.txt", BytesIO(b"text"), "text/plain")},
    )
    assert response.status_code == 415
