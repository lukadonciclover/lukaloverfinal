import json

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_synthetic_source_to_report_workflow():
    csv = b"""metric,period,value
Revenue,2023,100
Gross profit,2023,40
Operating income,2023,15
Net income,2023,10
Net cash provided by operating,2023,14
Capital expenditures,2023,5
Revenue,2024,120
Gross profit,2024,50
Operating income,2024,19
Net income,2024,13
Net cash provided by operating,2024,18
Capital expenditures,2024,6
"""
    upload = client.post(
        "/v1/documents/process",
        files={"file": ("synthetic-financials.csv", csv, "text/csv")},
        data={"currency": "USD"},
    )
    assert upload.status_code == 200
    source = upload.json()
    assert source["document"]["retained_by_server"] is False
    assert source["chunks"] and source["suggestions"]
    assert all(chunk["chunk_id"] for chunk in source["chunks"])

    company = {
        "id": 1, "currency": "USD",
        "name": "Workflow Integration Co. (Synthetic)",
        "ticker": "WFLOW",
        "latest_financial_year": 2024,
        "share_price": 8,
        "shares_outstanding": 10,
    }
    document = source["document"]
    figures = [
        {
            "company_id": company["id"],
            "metric": suggestion["metric"],
            "period": suggestion["period"],
            "value": suggestion["value"],
            "currency": suggestion["currency"],
            "unit_scale": suggestion["unit_scale"],
            "origin": "reported",
            "source": {
                "document_identifier": document["identifier"],
                "document_name": document["name"],
                "page": suggestion["page"],
                "quote": suggestion["quote"],
                "reporting_period": suggestion["period"],
                "currency": suggestion["currency"],
                "unit_scale": suggestion["unit_scale"],
                "confidence": suggestion["confidence"],
            },
            "notes": "Accepted synthetic extraction suggestion for integration testing.",
        }
        for suggestion in source["suggestions"]
    ]
    assert {figure["period"] for figure in figures} == {"2023", "2024"}

    financials = client.post("/v1/financials/analyze", json={"figures": figures})
    assert financials.status_code == 200
    assert financials.json()["analysis"][-1]["revenue_growth"] == 0.2
    payload = {"currency":"USD", "figures":figures, "shares":10,
               "assets":{"book_assets":100,"book_liabilities":30,"asset_adjustment":5}}
    valuation = client.post("/v1/workbench/calculate",json=payload)
    assert valuation.status_code == 200
    assert valuation.json()["models"]["Asset based"]["equity_value"] == 75
    exported = client.post("/v1/workbench/export",json=payload)
    assert exported.status_code == 200
    assert exported.content.startswith(b"PK")
