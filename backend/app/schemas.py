from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from equitylens.models import Company, DCFInputs, FinancialFigure


class FinancialAnalysisRequest(BaseModel):
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
    chunks: list[dict[str, Any]] = Field(max_length=500)
    limit: int = Field(default=6, ge=1, le=20)


class AgentPromptRequest(BaseModel):
    agent_name: Literal[
        "Financial Analyst", "Valuation Analyst", "Risk Analyst", "Investment Committee Critic"
    ]
    evidence: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    verified_financials: dict[str, Any] = Field(default_factory=dict)
    valuation_results: dict[str, Any] = Field(default_factory=dict)
    prior_outputs: dict[str, Any] = Field(default_factory=dict)


class AgentValidationRequest(BaseModel):
    agent_name: Literal[
        "Financial Analyst", "Valuation Analyst", "Risk Analyst", "Investment Committee Critic"
    ]
    raw_output: str = Field(min_length=1, max_length=200_000)


class ChatPromptRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2_000)
    evidence: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    calculation_context: dict[str, Any] = Field(default_factory=dict)


class ChatValidationRequest(BaseModel):
    raw_output: str = Field(min_length=1, max_length=200_000)


class StrategyPromptRequest(BaseModel):
    strategy: str
    task: str = Field(min_length=1, max_length=500)
    context: str = Field(min_length=1, max_length=50_000)


class StrategyEvaluationRequest(BaseModel):
    task_name: str
    output: str = Field(min_length=1, max_length=200_000)
    require_json: bool = False


class ThesisRequest(BaseModel):
    company: Company
    figures: list[FinancialFigure]
    valuation: dict[str, Any] = Field(default_factory=dict)
    agent_outputs: dict[str, Any] = Field(default_factory=dict)


class ReportRequest(ThesisRequest):
    dcf_inputs: DCFInputs | None = None
    thesis: dict[str, list[dict[str, str]]] | None = None


class InferenceRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=200_000)
    json_mode: bool = True
