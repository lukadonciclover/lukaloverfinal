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

    company = client.get("/v1/demo").json()["company"] | {
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
    financial_body = financials.json()
    latest = next(row for row in financial_body["analysis"] if row["period"] == "2024")
    assert latest["revenue_growth"] == 0.2
    assert financial_body["quality_issues"] == []

    dcf_inputs = {
        "base_revenue": 120,
        "revenue_growth": [0.08, 0.07, 0.06, 0.05, 0.04],
        "ebit_margin": [0.16, 0.17, 0.18, 0.19, 0.2],
        "tax_rate": [0.25] * 5,
        "depreciation_pct_revenue": [0.04] * 5,
        "capex_pct_revenue": [0.05] * 5,
        "nwc_pct_revenue": [0.1] * 5,
        "wacc": 0.1,
        "terminal_growth": 0.025,
        "cash": 8,
        "debt": 12,
        "minority_interest": 0,
        "non_operating_assets": 0,
        "diluted_shares": 10,
        "reference_price": 8,
    }
    valuation = client.post("/v1/valuation/dcf", json=dcf_inputs)
    assert valuation.status_code == 200
    dcf = valuation.json()
    assert set(dcf["scenarios"]) == {"bear", "base", "bull"}

    retrieval = client.post(
        "/v1/retrieval/search",
        json={"query": "revenue gross profit operating income cash flow", "chunks": source["chunks"], "limit": 20},
    )
    assert retrieval.status_code == 200
    evidence = retrieval.json()["results"]
    assert evidence

    raw_outputs = {
        "Financial Analyst": {"summary": "Synthetic revenue increased.", "findings": [], "data_gaps": []},
        "Valuation Analyst": {"assessment": "The deterministic DCF is sensitive to WACC and growth.", "assumption_issues": [], "scenario_commentary": {}, "confidence": "medium"},
        "Risk Analyst": {"risks": [], "data_gaps": ["No narrative risk disclosures were supplied."]},
        "Investment Committee Critic": {"contradictions": [], "unsupported_claims": [], "missing_evidence": [], "valuation_challenges": [], "recommendation": "Insufficient Evidence", "rationale": "The synthetic fixture has limited narrative evidence.", "confidence": "high"},
    }
    parsed_outputs = {}
    for agent_name in ("Financial Analyst", "Valuation Analyst", "Risk Analyst", "Investment Committee Critic"):
        prompt = client.post(
            "/v1/prompts/agent",
            json={
                "agent_name": agent_name,
                "evidence": evidence,
                "verified_financials": {"figures": figures, "analysis": financial_body},
                "valuation_results": dcf,
                "prior_outputs": parsed_outputs,
                "assumptions": {"dcf_inputs": dcf_inputs, "synthetic_test": True},
                "client_input_hash": "synthetic-e2e-v1",
            },
        )
        assert prompt.status_code == 200
        packet = prompt.json()
        assert packet["prompt_hash"] and packet["source_ids"]
        validation = client.post(
            "/v1/ai/validate",
            json={
                "agent_name": agent_name,
                "raw_output": json.dumps(raw_outputs[agent_name]),
                "prompt_hash": packet["prompt_hash"],
                "input_hash": packet["input_hash"],
                "prompt_version": packet["prompt_version"],
                "model_id": "Synthetic integration fixture",
            },
        )
        assert validation.status_code == 200 and validation.json()["valid"] is True
        parsed_outputs[agent_name] = validation.json()["parsed_output"]

    source_id = evidence[0]["chunk_id"]
    excerpt = next(line for line in evidence[0]["text"].splitlines() if "Revenue,2024,120" in line)
    proposed = {
        "assessments": [
            {
                "claim_id": "csv-revenue",
                "claim": "Revenue,2024,120",
                "status": "verified",
                "citations": [{"source_id": source_id, "document_name": evidence[0]["document_name"], "page": evidence[0]["page"], "excerpt": excerpt}],
                "calculation_ref": None,
                "claimed_value": None,
                "rationale": "The exact synthetic CSV row is present.",
            },
            {
                "claim_id": "dcf-equity",
                "claim": f"Equity value {dcf['equity_value']}",
                "status": "verified",
                "citations": [],
                "calculation_ref": "equity_value",
                "claimed_value": dcf["equity_value"],
                "rationale": "Compared with the deterministic DCF result.",
            },
        ],
        "unresolved_questions": [],
    }
    verifier_packet = client.post(
        "/v1/prompts/agent",
        json={"agent_name": "Evidence Verification Agent", "evidence": evidence, "verified_financials": {"figures": figures}, "valuation_results": dcf, "prior_outputs": parsed_outputs, "assumptions": {"dcf_inputs": dcf_inputs}, "client_input_hash": "synthetic-e2e-v1"},
    ).json()
    verifier_validation = client.post(
        "/v1/ai/validate",
        json={"agent_name": "Evidence Verification Agent", "raw_output": json.dumps(proposed), "prompt_hash": verifier_packet["prompt_hash"], "input_hash": verifier_packet["input_hash"], "prompt_version": verifier_packet["prompt_version"], "model_id": "Synthetic integration fixture"},
    )
    assert verifier_validation.status_code == 200 and verifier_validation.json()["valid"] is True
    verified = client.post(
        "/v1/evidence/verify",
        json={"assessments": verifier_validation.json()["parsed_output"]["assessments"], "evidence": evidence, "calculation_context": dcf},
    )
    assert verified.status_code == 200
    claims = verified.json()["assessments"]
    assert {claim["status"] for claim in claims} == {"partially_supported", "verified"}

    thesis = client.post("/v1/thesis", json={"company": company, "figures": figures, "valuation": dcf, "agent_outputs": parsed_outputs})
    assert thesis.status_code == 200
    assert thesis.json()["sections"]["Investment recommendation"]

    report_payload = {"company": company, "figures": figures, "valuation": dcf, "agent_outputs": parsed_outputs, "dcf_inputs": dcf_inputs, "claim_assessments": claims}
    signatures = {"pdf": b"%PDF", "docx": b"PK", "xlsx": b"PK"}
    for report_format, signature in signatures.items():
        report = client.post(f"/v1/reports/{report_format}", json=report_payload)
        assert report.status_code == 200
        assert report.content.startswith(signature)
        assert "attachment" in report.headers["content-disposition"]
