from __future__ import annotations

import json
import math
import os
from io import BytesIO
from pathlib import Path
from typing import Any, Literal

import pandas as pd
import pymupdf
import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from backend.schemas import (
    AgentPromptRequest,
    AgentValidationRequest,
    ChatPromptRequest,
    ChatValidationRequest,
    ComparablesRequest,
    FinancialAnalysisRequest,
    InferenceRequest,
    ReportRequest,
    RetrievalRequest,
    StrategyEvaluationRequest,
    StrategyPromptRequest,
    ThesisRequest,
)
from equitylens.ai import build_chat_prompt, parse_json_output
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
from equitylens.models import ChatAnswer, DCFInputs
from equitylens.prompts import AGENT_SCHEMAS, STRATEGIES, build_agent_prompt, build_strategy_prompt, evaluate_output, known_answer_tasks
from equitylens.reports import generate_docx, generate_excel, generate_pdf
from equitylens.sample import synthetic_company, synthetic_figures
from equitylens.thesis import generate_deterministic_thesis
from equitylens.valuation import calculate_dcf, calculate_multiples, peer_statistics, scenario_analysis, sensitivity_analysis


# Leave headroom below Vercel's 4.5 MB total function payload limit for multipart framing.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
MAX_PDF_PAGES = 100
MAX_RETURNED_CHUNKS = 250
ALLOWED_SUFFIXES = {".pdf", ".csv", ".xlsx"}

app = FastAPI(
    title="EquityLens AI API",
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
    return {"service": "EquityLens AI API", "status": "ready", "persistence": "stateless"}


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "equitylens-api",
        "manual_ai_default": True,
        "inference_configured": bool(os.getenv("INFERENCE_URL")),
    }


@app.get("/v1/demo")
def demo_workspace() -> dict[str, Any]:
    company = synthetic_company()
    figures = synthetic_figures(company.id or 1)
    return {
        "company": company.model_dump(mode="json"),
        "figures": [figure.model_dump(mode="json") for figure in figures],
        "disclaimer": "All figures are synthetic and are not actual company information.",
    }


@app.post("/v1/financials/analyze")
def analyze_financials(payload: FinancialAnalysisRequest) -> dict[str, Any]:
    table = analysis_table(payload.figures)
    return {
        "periods": periods_to_metrics(payload.figures),
        "analysis": dataframe_records(table.reset_index()),
        "quality_issues": data_quality_issues(payload.figures),
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
async def process_document(file: UploadFile = File(...), currency: str = Form(default="USD")) -> dict[str, Any]:
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
        "suggestions": suggest_financial_figures(extracted.pages, currency.upper())[:500],
        "tables": extracted.tables[:20],
        "limits": {"max_upload_bytes": MAX_UPLOAD_BYTES, "max_pdf_pages": MAX_PDF_PAGES},
    }


@app.post("/v1/retrieval/search")
def retrieve_evidence(payload: RetrievalRequest) -> dict[str, Any]:
    return {"results": search_chunks(payload.query, payload.chunks, payload.limit)}


@app.post("/v1/prompts/agent")
def prepare_agent_prompt(payload: AgentPromptRequest) -> dict[str, Any]:
    prompt = build_agent_prompt(
        payload.agent_name,
        payload.evidence,
        payload.verified_financials,
        payload.valuation_results,
        payload.prior_outputs,
    )
    return {"agent_name": payload.agent_name, "prompt": prompt, "schema": AGENT_SCHEMAS[payload.agent_name].model_json_schema()}


@app.post("/v1/ai/validate")
def validate_agent_response(payload: AgentValidationRequest) -> dict[str, Any]:
    parsed, errors = parse_json_output(payload.raw_output, AGENT_SCHEMAS[payload.agent_name])
    return {
        "valid": parsed is not None,
        "parsed_output": parsed,
        "errors": errors,
        "provenance": "External model response manually imported by the user",
    }


@app.post("/v1/chat/prompt")
def prepare_chat_prompt(payload: ChatPromptRequest) -> dict[str, str]:
    return {"prompt": build_chat_prompt(payload.question, payload.evidence, json.dumps(payload.calculation_context, indent=2))}


@app.post("/v1/chat/validate")
def validate_chat_response(payload: ChatValidationRequest) -> dict[str, Any]:
    parsed, errors = parse_json_output(payload.raw_output, ChatAnswer)
    return {"valid": parsed is not None, "parsed_output": parsed, "errors": errors, "provenance": "Manual import"}


@app.get("/v1/prompts/benchmarks")
def prompt_benchmarks() -> dict[str, Any]:
    return {"strategies": STRATEGIES, "tasks": known_answer_tasks()}


@app.post("/v1/prompts/strategy")
def prepare_strategy_prompt(payload: StrategyPromptRequest) -> dict[str, str]:
    try:
        prompt = build_strategy_prompt(payload.strategy, payload.task, payload.context)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"prompt": prompt}


@app.post("/v1/prompts/evaluate")
def evaluate_strategy(payload: StrategyEvaluationRequest) -> dict[str, Any]:
    tasks = known_answer_tasks()
    if payload.task_name not in tasks:
        raise HTTPException(status_code=422, detail="Unknown benchmark task.")
    metrics = evaluate_output(payload.output, tasks[payload.task_name], payload.require_json)
    metrics["source_citation_presence"] = any(marker in payload.output.lower() for marker in ("source", "page", "citation"))
    metrics["completeness"] = min(len(payload.output.strip()) / 300, 1.0)
    metrics["subjective_review"] = "Interpretive quality and citation entailment require human assessment."
    return metrics


@app.post("/v1/thesis")
def build_thesis(payload: ThesisRequest) -> dict[str, Any]:
    return {
        "sections": generate_deterministic_thesis(
            payload.company,
            periods_to_metrics(payload.figures),
            payload.valuation,
            payload.agent_outputs,
        )
    }


@app.post("/v1/reports/{report_format}")
def generate_report(report_format: Literal["docx", "pdf", "xlsx"], payload: ReportRequest) -> StreamingResponse:
    thesis = payload.thesis or generate_deterministic_thesis(
        payload.company,
        periods_to_metrics(payload.figures),
        payload.valuation,
        payload.agent_outputs,
    )
    frame = figures_to_frame(payload.figures)
    filename = safe_filename(payload.company.name)
    if report_format == "docx":
        content = generate_docx(payload.company, thesis, frame, payload.valuation)
        return download(content, f"{filename}-research.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    if report_format == "pdf":
        content = generate_pdf(payload.company, thesis, payload.valuation)
        return download(content, f"{filename}-research.pdf", "application/pdf")
    assumptions = pd.DataFrame()
    forecast = pd.DataFrame()
    if payload.dcf_inputs is not None:
        inputs = payload.dcf_inputs
        assumptions = pd.DataFrame(
            {
                "year": range(1, len(inputs.revenue_growth) + 1),
                "revenue_growth": inputs.revenue_growth,
                "ebit_margin": inputs.ebit_margin,
                "tax_rate": inputs.tax_rate,
                "depreciation_pct_revenue": inputs.depreciation_pct_revenue,
                "capex_pct_revenue": inputs.capex_pct_revenue,
                "nwc_pct_revenue": inputs.nwc_pct_revenue,
            }
        )
        try:
            forecast = calculate_dcf(inputs).forecast
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    content = generate_excel(payload.company, frame, assumptions, forecast, payload.valuation)
    return download(content, f"{filename}-valuation.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.post("/v1/inference/generate")
def configured_inference(payload: InferenceRequest) -> dict[str, Any]:
    """Optional OpenAI-compatible inference. It is disabled unless server operators configure it."""
    url = os.getenv("INFERENCE_URL")
    model = os.getenv("INFERENCE_MODEL")
    if not url or not model:
        raise HTTPException(status_code=503, detail="External inference is not configured. Use Manual AI Mode.")
    headers = {"Content-Type": "application/json"}
    token = os.getenv("INFERENCE_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = requests.post(
            url,
            headers=headers,
            json={
                "model": model,
                "messages": [{"role": "user", "content": payload.prompt}],
                "response_format": {"type": "json_object"} if payload.json_mode else None,
            },
            timeout=45,
        )
        response.raise_for_status()
        body = response.json()
        output = body["choices"][0]["message"]["content"]
    except (requests.RequestException, KeyError, IndexError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="The configured inference service failed to return a valid response.") from exc
    return {"output": output, "model": model, "provenance": "Configured external inference service"}


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
