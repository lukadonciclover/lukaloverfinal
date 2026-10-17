from io import BytesIO

import pandas as pd
from docx import Document

from equitylens.db import Repository
from equitylens.models import Company, FinancialFigure, ValueOrigin
from equitylens.reports import generate_docx, generate_excel, generate_pdf
from equitylens.thesis import generate_deterministic_thesis


def test_repository_round_trip_and_nullable_value(tmp_path):
    repo = Repository(tmp_path / "test.db")
    company_id = repo.save_company(Company(name="Synthetic Test", currency="USD", is_synthetic=True))
    repo.upsert_figure(FinancialFigure(company_id=company_id, metric="revenue", period="2024", value=None, origin=ValueOrigin.USER))
    figures = repo.get_figures(company_id)
    assert figures[0].value is None
    repo.save_state(company_id, "assumptions", {"wacc": 0.1})
    assert repo.get_state(company_id, "assumptions")["wacc"] == 0.1


def test_report_exports_reconcile_with_supplied_valuation():
    company = Company(name="Synthetic Test", currency="USD", is_synthetic=True)
    valuation = {"enterprise_value": 123.45, "equity_value": 110.0, "implied_share_value": 11.0, "terminal_value": 80.0}
    thesis = generate_deterministic_thesis(company, {}, valuation, {})
    frame = pd.DataFrame([{"metric": "revenue", "period": "2024", "value": 100, "currency": "USD", "origin": "reported"}])
    docx_data = generate_docx(company, thesis, frame, valuation)
    document = Document(BytesIO(docx_data))
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    assert "123.45" in text
    pdf_data = generate_pdf(company, thesis, valuation)
    assert pdf_data.startswith(b"%PDF")
    workbook = generate_excel(company, frame, pd.DataFrame(), pd.DataFrame(), valuation)
    sheets = pd.ExcelFile(BytesIO(workbook)).sheet_names
    assert "Valuation Summary" in sheets
