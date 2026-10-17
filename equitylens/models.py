from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AIMode(str, Enum):
    LOCAL = "Local AI Mode"
    MANUAL = "Manual AI Mode"
    ANALYTICS = "Financial Analytics Only"


class ValueOrigin(str, Enum):
    REPORTED = "reported"
    DERIVED = "derived"
    USER = "user-supplied"
    AI_ESTIMATE = "ai-estimate"


class Company(BaseModel):
    id: int | None = None
    name: str
    ticker: str | None = None
    country: str = ""
    industry: str = ""
    currency: str = "USD"
    reporting_standard: str = ""
    latest_financial_year: int | None = None
    share_price: float | None = None
    shares_outstanding: float | None = None
    statement_dates: str = ""
    investment_horizon: str = "3-5 years"
    required_return: float | None = None
    analyst_notes: str = ""
    is_synthetic: bool = False
    created_at: datetime | None = None


class DocumentRecord(BaseModel):
    id: int | None = None
    company_id: int
    identifier: str
    name: str
    document_type: str
    reporting_period: str = ""
    path: str
    upload_date: datetime | None = None
    extraction_status: str = "pending"
    pages: int = 0
    warning: str = ""


class SourceRef(BaseModel):
    document_id: int | None = None
    document_name: str
    page: int | None = None
    quote: str = ""
    reporting_period: str = ""
    currency: str = ""
    unit_scale: float = 1.0
    confidence: float = Field(default=0.5, ge=0, le=1)


class FinancialFigure(BaseModel):
    id: int | None = None
    company_id: int
    metric: str
    period: str
    value: float | None = None
    currency: str = "USD"
    unit_scale: float = 1.0
    origin: ValueOrigin = ValueOrigin.USER
    source: SourceRef | None = None
    notes: str = ""


class Finding(BaseModel):
    finding: str
    supporting_figures: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    interpretation: str
    confidence: Literal["low", "medium", "high"]
    unanswered_questions: list[str] = Field(default_factory=list)


class FinancialAnalystResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str
    findings: list[Finding]
    data_gaps: list[str] = Field(default_factory=list)


class ValuationAnalystResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assessment: str
    assumption_issues: list[str] = Field(default_factory=list)
    scenario_commentary: dict[str, str] = Field(default_factory=dict)
    confidence: Literal["low", "medium", "high"]


class RiskItem(BaseModel):
    risk: str
    evidence: str
    likelihood: Literal["low", "medium", "high"]
    impact: Literal["low", "medium", "high"]
    financial_effect: str
    evidence_backed: bool
    sources: list[str] = Field(default_factory=list)


class RiskAnalystResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    risks: list[RiskItem]
    data_gaps: list[str] = Field(default_factory=list)


class CriticResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contradictions: list[str] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    valuation_challenges: list[str] = Field(default_factory=list)
    recommendation: Literal["Buy", "Hold", "Sell", "Insufficient Evidence"]
    rationale: str
    confidence: Literal["low", "medium", "high"]


class ChatAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer: str
    citations: list[str] = Field(default_factory=list)
    unsupported: bool = False
    missing_information: list[str] = Field(default_factory=list)


class DCFInputs(BaseModel):
    base_revenue: float
    revenue_growth: list[float]
    ebit_margin: list[float]
    tax_rate: list[float]
    depreciation_pct_revenue: list[float]
    capex_pct_revenue: list[float]
    nwc_pct_revenue: list[float]
    wacc: float
    terminal_growth: float
    cash: float = 0.0
    debt: float = 0.0
    minority_interest: float = 0.0
    non_operating_assets: float = 0.0
    diluted_shares: float | None = None
    reference_price: float | None = None

    @field_validator(
        "revenue_growth",
        "ebit_margin",
        "tax_rate",
        "depreciation_pct_revenue",
        "capex_pct_revenue",
        "nwc_pct_revenue",
    )
    @classmethod
    def non_empty_forecast(cls, value: list[float]) -> list[float]:
        if not value:
            raise ValueError("forecast assumptions cannot be empty")
        return value


class AgentRun(BaseModel):
    company_id: int
    agent_name: str
    status: Literal["valid", "invalid", "error", "pending"]
    prompt: str
    raw_output: str = ""
    parsed_output: dict[str, Any] | None = None
    errors: list[str] = Field(default_factory=list)
    model_name: str = ""
    response_time: float | None = None
