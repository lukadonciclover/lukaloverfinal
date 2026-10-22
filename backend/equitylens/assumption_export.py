"""Validate export provenance against active model inputs, without changing calculations."""
from typing import Any
from pydantic import BaseModel, ConfigDict, Field
from equitylens.workbench import Workbench, effective_dcf, evaluate


class SourceEvidence(BaseModel):
    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)
    metric: str
    value: float | None = None
    minimum: float | None = None
    maximum: float | None = None
    unit: str
    currency: str = ""
    unit_scale: float = Field(default=1, gt=0)
    period: str
    basis: str
    scope: str
    classification: str
    document_id: str
    document_name: str
    page: int | None = None
    excerpt: str = Field(default="", max_length=20000)
    original: dict[str, Any] | None = None


class AcceptedSource(BaseModel):
    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)
    source: SourceEvidence
    target: str
    value: float
    period: str
    rationale: str
    classification: str
    accepted_at: str


class WorkbenchExport(Workbench):
    assumption_sources: list[AcceptedSource] = Field(default_factory=list, max_length=10000)


def source_rows(p: Workbench, sources: list[AcceptedSource]) -> list[list[Any]]:
    rows = []
    result = evaluate(p)
    # Latest acceptance for each target is authoritative; older identical values remain history.
    latest = {a.target: i for i, a in enumerate(sources)}
    for i, a in enumerate(sources):
        parts = a.target.split(".")
        group, key = (parts + [""])[:2]
        obj = getattr(p, group, None) if group in {"forecast", "dcf", "wacc", "ddm", "assets"} else None
        if group == "settings" and key == "exit_multiple":
            obj = p.dcf
        if group == "dcf" and obj is not None:
            try:
                obj = effective_dcf(p, result["history"], result["forecast"])
            except (ValueError, TypeError):
                obj = None
        current = getattr(obj, key, None) if key and not key.startswith("_") else None
        if isinstance(current, list):
            current = current[int(parts[2])] if len(parts) == 3 and parts[2].isdigit() and int(parts[2]) < len(current) else None
        if not isinstance(current, (float, int)):
            current = None
        if obj is None:
            status = "Model disabled / unavailable"
        elif latest[a.target] != i or current != a.value:
            status = "Superseded; not current model input"
        elif group == "settings" and p.dcf.terminal_method != "exit_multiple":
            status = "Inactive terminal method"
        elif a.target == "dcf.terminal_growth" and p.dcf.terminal_method != "growth":
            status = "Inactive terminal method"
        elif a.target == "forecast.ebitda_margin" and p.forecast.opex_ratio is not None:
            status = "Inactive; operating expense ratio controls EBITDA"
        else:
            status = "Current model input"
        s = a.source
        original = s.original or s.model_dump()
        rows.append([s.metric,a.target,a.value,current,status,a.period,a.classification,original.get("value"),original.get("minimum"),original.get("maximum"),
            original.get("unit"),original.get("currency"),original.get("unit_scale"),s.period,s.basis,s.scope,s.classification,s.document_id,s.document_name,s.page,
            s.excerpt or "Source text unavailable",a.rationale,a.accepted_at,"Accepted"])
    return rows
