from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from equitylens.models import CitationLocator, Company, DCFInputs, FinancialFigure, ProposedClaimAssessment

AgentName = Literal[
    "Financial Analyst", "Valuation Analyst", "Risk Analyst", "Investment Committee Critic", "Evidence Verification Agent"
]


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


class AgentPromptRequest(BaseModel):
    agent_name: AgentName
    evidence: list[EvidenceChunkInput] = Field(default_factory=list, max_length=20)
    verified_financials: dict[str, Any] = Field(default_factory=dict)
    valuation_results: dict[str, Any] = Field(default_factory=dict)
    prior_outputs: dict[str, Any] = Field(default_factory=dict)
    assumptions: dict[str, Any] = Field(default_factory=dict)
    client_input_hash: str = Field(default="", max_length=200)


class AgentValidationRequest(BaseModel):
    agent_name: AgentName
    raw_output: str = Field(min_length=1, max_length=200_000)
    prompt_hash: str = Field(default="", max_length=200)
    input_hash: str = Field(default="", max_length=200)
    prompt_version: str = Field(default="", max_length=100)
    model_id: str = Field(default="External model (manual import)", min_length=1, max_length=200)


class ChatPromptRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2_000)
    evidence: list[EvidenceChunkInput] = Field(default_factory=list, max_length=20)
    calculation_context: dict[str, Any] = Field(default_factory=dict)


class ChatValidationRequest(BaseModel):
    raw_output: str = Field(min_length=1, max_length=200_000)
    question: str = Field(default="", max_length=2_000)
    evidence: list[EvidenceChunkInput] = Field(default_factory=list, max_length=20)


class StrategyPromptRequest(BaseModel):
    strategy: str
    task: str = Field(min_length=1, max_length=500)
    context: str = Field(min_length=1, max_length=50_000)


class StrategyEvaluationRequest(BaseModel):
    task_name: str
    output: str = Field(min_length=1, max_length=200_000)
    require_json: bool = False
    prompt: str = Field(default="", max_length=100_000)
    prompt_version: str = Field(default="prompt-lab-v2", max_length=100)
    model_id: str = Field(default="Unspecified model", max_length=200)


class EvidenceVerificationRequest(BaseModel):
    assessments: list[ProposedClaimAssessment] = Field(max_length=200)
    evidence: list[EvidenceChunkInput] = Field(default_factory=list, max_length=500)
    calculation_context: dict[str, Any] = Field(default_factory=dict)


class ThesisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    company: Company
    figures: list[FinancialFigure]
    valuation: dict[str, Any] = Field(default_factory=dict)
    agent_outputs: dict[str, Any] = Field(default_factory=dict)


class ReportClaimAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    claim_id: str
    claim: str
    status: Literal["verified", "partially_supported", "unsupported", "contradicted"]
    citations: list[CitationLocator] = Field(default_factory=list)
    rationale: str = ""
    checks: list[str] = Field(default_factory=list)
    human_review_required: bool = False
    calculation_value: float | None = None


class ReportRequest(ThesisRequest):
    dcf_inputs: DCFInputs | None = None
    claim_assessments: list[ReportClaimAssessment] = Field(default_factory=list, max_length=2_000)


class InferenceRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=200_000)
    json_mode: bool = True
