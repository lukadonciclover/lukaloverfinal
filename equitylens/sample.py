from __future__ import annotations

from typing import TYPE_CHECKING

from equitylens.models import Company, FinancialFigure, SourceRef, ValueOrigin

if TYPE_CHECKING:
    from equitylens.db import Repository


SYNTHETIC_DATA = {
    "2021": {"revenue": 820, "gross_profit": 328, "ebitda": 139, "ebit": 112, "net_income": 70, "cash": 95, "short_term_investments": 15, "total_assets": 900, "current_assets": 290, "current_liabilities": 165, "short_term_debt": 25, "long_term_debt": 220, "total_equity": 390, "operating_cash_flow": 125, "capital_expenditure": 55},
    "2022": {"revenue": 910, "gross_profit": 373, "ebitda": 164, "ebit": 133, "net_income": 84, "cash": 108, "short_term_investments": 18, "total_assets": 980, "current_assets": 310, "current_liabilities": 170, "short_term_debt": 22, "long_term_debt": 210, "total_equity": 430, "operating_cash_flow": 145, "capital_expenditure": 62},
    "2023": {"revenue": 1020, "gross_profit": 428, "ebitda": 194, "ebit": 158, "net_income": 103, "cash": 130, "short_term_investments": 20, "total_assets": 1080, "current_assets": 345, "current_liabilities": 180, "short_term_debt": 20, "long_term_debt": 195, "total_equity": 495, "operating_cash_flow": 174, "capital_expenditure": 70},
    "2024": {"revenue": 1140, "gross_profit": 490, "ebitda": 228, "ebit": 188, "net_income": 124, "cash": 152, "short_term_investments": 25, "total_assets": 1190, "current_assets": 390, "current_liabilities": 192, "short_term_debt": 18, "long_term_debt": 180, "total_equity": 570, "operating_cash_flow": 202, "capital_expenditure": 78},
    "2025": {"revenue": 1265, "gross_profit": 557, "ebitda": 266, "ebit": 221, "net_income": 146, "cash": 180, "short_term_investments": 30, "total_assets": 1320, "current_assets": 440, "current_liabilities": 205, "short_term_debt": 15, "long_term_debt": 165, "total_equity": 660, "operating_cash_flow": 235, "capital_expenditure": 85},
}


def synthetic_company() -> Company:
    return Company(
        id=1, name="Northstar Components (Synthetic)", ticker="SYNTH", country="United States",
        industry="Industrial technology", currency="USD", reporting_standard="Synthetic demonstration",
        latest_financial_year=2025, share_price=31.50, shares_outstanding=50.0,
        statement_dates="Fiscal year ending December 31", investment_horizon="3-5 years",
        required_return=0.10, analyst_notes="All figures are synthetic and expressed in USD millions.",
        is_synthetic=True,
    )


def synthetic_figures(company_id: int = 1) -> list[FinancialFigure]:
    source = SourceRef(
        document_name="Built-in synthetic dataset", quote="Generated solely for product demonstration and testing.",
        reporting_period="2021-2025", currency="USD", unit_scale=1_000_000, confidence=1.0,
    )
    return [
        FinancialFigure(
            company_id=company_id, metric=metric, period=period, value=float(value), currency="USD",
            unit_scale=1_000_000, origin=ValueOrigin.REPORTED, source=source,
            notes="Synthetic demonstration figure; amount shown in USD millions.",
        )
        for period, values in SYNTHETIC_DATA.items()
        for metric, value in values.items()
    ]


def ensure_synthetic_project(repository: "Repository") -> int:
    existing = next((company for company in repository.list_companies() if company.is_synthetic), None)
    if existing and existing.id:
        return existing.id
    company_id = repository.save_company(
        synthetic_company().model_copy(update={"id": None})
    )
    for figure in synthetic_figures(company_id):
        repository.upsert_figure(figure)
    return company_id
