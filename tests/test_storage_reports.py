from equitylens.db import Repository
from equitylens.models import Company, FinancialFigure, ValueOrigin


def test_repository_round_trip_and_nullable_value(tmp_path):
    repo = Repository(tmp_path / "test.db")
    company_id = repo.save_company(Company(name="Synthetic Test", currency="USD", is_synthetic=True))
    repo.upsert_figure(FinancialFigure(company_id=company_id, metric="revenue", period="2024", value=None, origin=ValueOrigin.USER))
    figures = repo.get_figures(company_id)
    assert figures[0].value is None
    repo.save_state(company_id, "assumptions", {"wacc": 0.1})
    assert repo.get_state(company_id, "assumptions")["wacc"] == 0.1
