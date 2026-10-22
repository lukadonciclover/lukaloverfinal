from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    model_config = ConfigDict(extra="forbid")
    document_id: int | None = None
    document_identifier: str = ""
    document_name: str
    page: int | None = None
    quote: str = ""
    reporting_period: str = ""
    currency: str = ""
    unit_scale: float = Field(default=1.0, gt=0)
    confidence: float = Field(default=0.5, ge=0, le=1)


class FinancialFigure(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: int | None = None
    company_id: int
    metric: str
    period: str
    value: float | None = None
    currency: str = "USD"
    unit_scale: float = Field(default=1.0, gt=0)
    origin: ValueOrigin = ValueOrigin.USER
    source: SourceRef | None = None
    notes: str = ""


class DCFInputs(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    base_revenue: float
    revenue_growth: list[float] = Field(min_length=1, max_length=20)
    ebit_margin: list[float] = Field(min_length=1, max_length=20)
    tax_rate: list[float] = Field(min_length=1, max_length=20)
    depreciation_pct_revenue: list[float] = Field(min_length=1, max_length=20)
    capex_pct_revenue: list[float] = Field(min_length=1, max_length=20)
    nwc_pct_revenue: list[float] = Field(min_length=1, max_length=20)
    wacc: float
    terminal_growth: float
    terminal_method: Literal["growth", "exit_multiple"] = "growth"
    exit_multiple: float = Field(default=10, gt=0)
    opening_nwc: float | None = None
    tax_loss_benefit: bool = False
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
