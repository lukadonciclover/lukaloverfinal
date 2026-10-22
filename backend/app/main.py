from __future__ import annotations

import hashlib
import json
import math
import os
from io import BytesIO
from pathlib import Path
from typing import Any, Literal

import pandas as pd
import pymupdf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.schemas import ComparablesRequest, FinancialAnalysisRequest, RetrievalRequest
from equitylens.historical_references import historical_references, unavailable_reasons
from equitylens.assumption_export import WorkbenchExport
from equitylens.assumptions import extract_assumptions, derive_assumptions, derive_revenue_guidance
from equitylens.documents import (
    chunk_pages,
    classify_document,
    detect_reporting_period,
    document_identifier,
    extract_document,
    search_chunks,
    suggest_financial_figures,
)
from equitylens.financials import FORMULAS, analysis_table, data_quality_issues, figures_to_frame, periods_to_metrics
from equitylens.models import DCFInputs
from equitylens.workbench import Workbench, Peer, evaluate
from equitylens.workbook import export_workbench
from equitylens.valuation import (
    calculate_dcf,
    calculate_multiples,
    peer_statistics,
    scenario_analysis,
    sensitivity_analysis,
)

# Leave headroom below Vercel's 4.5 MB total function payload limit for multipart framing.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
MAX_PDF_PAGES = 100
MAX_RETURNED_CHUNKS = 250
ALLOWED_SUFFIXES = {".pdf", ".csv", ".xlsx"}

app = FastAPI(
    title="EquityLens Valuation API",
    version="1.0.0",
    description="Stateless deterministic financial analytics and document-processing API.",
)

origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "EquityLens Valuation API", "status": "ready", "persistence": "stateless"}


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "equitylens-api",
        "calculation_engine": "deterministic",
    }


@app.post("/v1/financials/analyze")
def analyze_financials(payload: FinancialAnalysisRequest) -> dict[str, Any]:
    issues = data_quality_issues(payload.figures)
    if payload.currency and any(f.currency != payload.currency for f in payload.figures):
        raise HTTPException(422, "Approved figure currency differs from project currency.")
    blocking = [issue for issue in issues if issue.startswith(("Currency mismatch", "Duplicate figure", "Annual and quarterly", "Unrecognized"))]
    if blocking:
        raise HTTPException(status_code=422, detail=" ".join(blocking))
    table = analysis_table(payload.figures)
    rows = dataframe_records(table.reset_index())
    return {
        "periods": periods_to_metrics(payload.figures),
        "analysis": rows,
        "unavailable_reasons": unavailable_reasons(payload.figures, rows),
        "historical_references": historical_references(payload.figures, payload.currency or (payload.figures[0].currency if payload.figures else "USD"), payload.history_window),
        "quality_issues": issues,
        "formulas": FORMULAS,
    }


@app.post("/v1/valuation/dcf")
def dcf_valuation(payload: DCFInputs) -> dict[str, Any]:
    try:
        inputs = DCFInputs.model_validate(payload)
        result = calculate_dcf(inputs)
        scenarios = scenario_analysis(inputs)
        sensitivity = sensitivity_analysis(inputs)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        **dcf_result_json(result),
        "scenarios": {name.lower(): dcf_result_json(value) for name, value in scenarios.items()},
        "sensitivity": {
            "rows": list(sensitivity.index),
            "columns": list(sensitivity.columns),
            "values": [[finite_or_none(value) for value in row] for row in sensitivity.to_numpy().tolist()],
        },
    }


@app.post("/v1/valuation/comparables")
def comparable_valuation(payload: ComparablesRequest) -> dict[str, Any]:
    rows = [row.model_dump() for row in payload.rows]
    calculated = [calculate_multiples(row) for row in rows]
    statistics = peer_statistics(rows)
    return {"multiples": calculated, "statistics": dataframe_index_records(statistics)}


@app.post("/v1/documents/process")
async def process_document(file: UploadFile = File(...), currency: str = Form(default="USD")) -> dict[str, Any]:  # noqa: B008
    name = Path(file.filename or "upload").name
    suffix = Path(name).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail="Supported document types are PDF, CSV, and XLSX.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The upload exceeds the 4 MB synchronous processing limit.")
    if suffix == ".pdf":
        try:
            with pymupdf.open(stream=content, filetype="pdf") as pdf:
                if pdf.page_count > MAX_PDF_PAGES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"PDFs are limited to {MAX_PDF_PAGES} pages for synchronous processing. Split the document and retry.",
                    )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"The PDF could not be opened: {exc}") from exc
    try:
        extracted = extract_document(content, name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    combined = "\n".join(page["text"] for page in extracted.pages)
    chunks = chunk_pages(extracted.pages)[:MAX_RETURNED_CHUNKS]
    identifier = document_identifier(content)
    document_type = classify_document(name, combined)
    for chunk in chunks:
        chunk["document_name"] = name
        chunk["document_identifier"] = identifier
        chunk["chunk_id"] = hashlib.sha256(f"{identifier}:{chunk['page']}:{chunk['text']}".encode()).hexdigest()
        chunk["metadata"]["document_type"] = document_type
    return {
        "document": {
            "identifier": identifier,
            "name": name,
            "document_type": document_type,
            "reporting_period": detect_reporting_period(combined),
            "pages": len(extracted.pages),
            "warning": extracted.warning,
            "extraction_status": "warning" if extracted.warning else "complete",
            "retained_by_server": False,
        },
        "chunks": chunks,
        "assumptions": extract_assumptions(extracted.pages, identifier, name),
        "suggestions": suggest_financial_figures(extracted.pages, currency.upper())[:500],
        "tables": extracted.tables[:20],
        "limits": {"max_upload_bytes": MAX_UPLOAD_BYTES, "max_pdf_pages": MAX_PDF_PAGES},
    }


@app.post("/v1/retrieval/search")
def retrieve_evidence(payload: RetrievalRequest) -> dict[str, Any]:
    return {"results": search_chunks(payload.query, [chunk.model_dump() for chunk in payload.chunks], payload.limit)}


def dcf_result_json(result: Any) -> dict[str, Any]:
    return {
        "forecast": dataframe_records(result.forecast.reset_index()),
        "enterprise_value": result.enterprise_value,
        "equity_value": result.equity_value,
        "implied_share_value": result.implied_share_value,
        "terminal_value": result.terminal_value,
        "pv_terminal_value": result.pv_terminal_value,
        "upside_downside": result.upside_downside,
        "timing_convention": result.timing_convention,
    }


def dataframe_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return json.loads(frame.to_json(orient="records"))


def dataframe_index_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []
    named = frame.reset_index().rename(columns={"index": "statistic"})
    return dataframe_records(named)


def finite_or_none(value: Any) -> float | None:
    number = float(value)
    return number if math.isfinite(number) else None


def safe_filename(name: str) -> str:
    return "-".join("".join(character.lower() if character.isalnum() else " " for character in name).split()) or "equitylens"


def download(content: bytes, filename: str, media_type: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


@app.post("/v1/workbench/calculate")
def calculate_workbench(payload: Workbench):
    try:
        return evaluate(payload)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

@app.post("/v1/workbench/export")
def export_model(payload: WorkbenchExport):
    try:
        content = export_workbench(payload, payload.assumption_sources)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return download(content, "equitylens-valuation.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.post("/v1/workbench/import-peers")
async def import_peers(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".csv", ".xlsx"}:
        raise HTTPException(415, "Use CSV or XLSX peer data.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds 4 MB.")
    try:
        frame = pd.read_csv(BytesIO(content)) if suffix == ".csv" else pd.read_excel(BytesIO(content))
        frame.columns = [str(c).strip().lower().replace(" ", "_") for c in frame.columns]
        if not {"company", "currency", "unit_scale"}.issubset(frame.columns):
            raise ValueError("Required columns: company, currency, unit_scale. Monetary scales cannot be inferred.")
        if len(frame) > 500:
            raise ValueError("Maximum 500 rows per import.")
        rows = json.loads(frame.to_json(orient="records", date_format="iso"))
        return {"rows": [Peer.model_validate({**r, "selected": False, "acquisition_date": str(r.get("acquisition_date") or "")[:10]}).model_dump() for r in rows]}
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc


class AssumptionHistoryRequest(FinancialAnalysisRequest):
    currency: str
    assumptions: list[dict[str, Any]] = []


@app.post("/v1/assumptions/derive")
def assumption_history(payload: AssumptionHistoryRequest):
    return derive_assumptions(payload.figures, payload.currency) + derive_revenue_guidance(payload.assumptions, payload.figures, payload.currency)


class HistoricalReferenceRequest(AssumptionHistoryRequest):
    window: Literal[2, 3, 5] = 3


@app.post("/v1/assumptions/historical-averages")
def historical_averages(payload: HistoricalReferenceRequest):
    return historical_references(payload.figures, payload.currency, payload.window)
