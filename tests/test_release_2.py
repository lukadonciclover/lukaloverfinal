"""Release 2 modes and numerical equivalence against full Release 1 DCF evaluation."""
from unittest.mock import patch
import pymupdf
import pytest
from fastapi.testclient import TestClient
from app.main import app
from equitylens.workbench import evaluate, dcf_json
from test_workbench import project
client = TestClient(app)

@pytest.mark.parametrize("horizon", [3,5,10])
@pytest.mark.parametrize("terminal", ["growth", "exit_multiple"])
def test_modes_preserve_primary_outputs_and_sensitivity_formulas(horizon, terminal):
    p = project(horizon)
    p.dcf.terminal_method = terminal
    optimized = evaluate(p)
    # The reference evaluates every candidate through the original full DCF schedule.
    with patch("equitylens.workbench.sensitivity_equity", side_effect=lambda d, schedule: dcf_json(d)["equity_value"]):
        baseline = evaluate(p)
    core = evaluate(p, mode="core")
    for key in ["models", "forecast", "history", "wacc", "errors"]:
        assert core[key] == optimized[key] == baseline[key]
    assert core["scenarios"] == core["sensitivities"] == {}
    assert optimized["scenarios"] == baseline["scenarios"]
    for kind, grid in baseline["sensitivities"].items():
        assert grid["columns"] == optimized["sensitivities"][kind]["columns"]
        for actual, expected in zip(optimized["sensitivities"][kind]["values"], grid["values"]):
            for a, b in zip(actual,expected):
                if b is None: assert a is None
                else: assert a == pytest.approx(b, rel=1e-13, abs=1e-8)

def test_default_endpoint_keeps_full_analysis_and_rejects_invalid_mode():
    body = project().model_dump(mode="json")
    default = client.post("/v1/workbench/calculate",json=body)
    core = client.post("/v1/workbench/calculate?mode=core",json=body)
    assert default.status_code == core.status_code == 200
    assert default.json()["sensitivities"]
    assert not core.json()["sensitivities"]
    assert default.json()["models"] == core.json()["models"]
    assert client.post("/v1/workbench/calculate?mode=invalid",json=body).status_code == 422

def test_core_mode_preserves_removed_source_blocking():
    p=project(); p.blocked_assumptions=["forecast.growth"]
    with pytest.raises(ValueError,match="Source document removed"):
        evaluate(p,mode="core")

def test_protected_blank_and_invalid_pdf_errors():
    with pymupdf.open() as pdf:
        pdf.new_page().insert_text((72,72),"Revenue 2025 100")
        data=pdf.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256,owner_pw="owner",user_pw="secret")
    response=client.post("/v1/documents/process",files={"file":("locked.pdf",data,"application/pdf")})
    assert response.status_code==400
    assert "password protected" in response.json()["detail"]
    with pymupdf.open() as pdf:
        pdf.new_page(); data=pdf.tobytes()
    response=client.post("/v1/documents/process",files={"file":("blank.pdf",data,"application/pdf")})
    assert response.status_code==200
    assert response.json()["suggestions"]==[]
    assert "No readable" in response.json()["document"]["warning"]
    response=client.post("/v1/documents/process",files={"file":("broken.pdf",b"broken","application/pdf")})
    assert response.status_code==400
    assert "encrypted or damaged" in response.json()["detail"]
