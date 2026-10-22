from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from equitylens.models import FinancialFigure

class EvidenceChunkInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chunk_id: str = Field(min_length=1, max_length=100)
    page: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=20_000)
    document_name: str = Field(min_length=1, max_length=500)
    document_identifier: str = Field(min_length=1, max_length=100)
    metadata: dict[str, Any] = Field(default_factory=dict)
    score: float | None = None


class FinancialAnalysisRequest(BaseModel):
    currency: str | None = None
    history_window: Literal[2, 3, 5] = 3
    figures: list[FinancialFigure]


class ComparableRow(BaseModel):
    company: str
    market_cap: float | None = None
    debt: float | None = None
    cash: float | None = None
    enterprise_value: float | None = None
    revenue: float | None = None
    ebitda: float | None = None
    ebit: float | None = None
    net_income: float | None = None


class ComparablesRequest(BaseModel):
    rows: list[ComparableRow]


class RetrievalRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    chunks: list[EvidenceChunkInput] = Field(max_length=500)
    limit: int = Field(default=6, ge=1, le=20)
