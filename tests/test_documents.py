from equitylens.documents import (
    chunk_pages,
    detect_unit_scale,
    parse_financial_number,
    search_chunks,
    suggest_financial_figures,
)


def test_number_parsing_and_unit_detection():
    assert parse_financial_number("(1,234.5)") == -1234.5
    assert parse_financial_number("—") is None
    assert detect_unit_scale("Amounts are in millions unless stated otherwise")[0] == 1_000_000


def test_chunking_preserves_page_metadata_and_retrieves_relevant_text():
    pages = [
        {"page": 1, "text": "Revenue increased in 2024 due to unit volume. Amounts are in millions."},
        {"page": 2, "text": "Cybersecurity and regulation are material business risks."},
    ]
    chunks = chunk_pages(pages, chunk_size=100)
    chunks[0]["document_name"] = "Synthetic report"
    chunks[1]["document_name"] = "Synthetic report"
    results = search_chunks("regulatory risks", chunks)
    assert results[0]["page"] == 2
    assert chunks[0]["metadata"]["reporting_period"] == "2024"


def test_financial_suggestions_are_review_only_with_provenance():
    suggestions = suggest_financial_figures([{"page": 8, "text": "Amounts are in millions\nRevenue 2024 1,250"}], "USD")
    assert suggestions[0]["metric"] == "revenue"
    assert suggestions[0]["value"] == 1250
    assert suggestions[0]["page"] == 8
    assert suggestions[0]["confidence"] < 1


def test_csv_suggestions_preserve_quarterly_periods():
    suggestions = suggest_financial_figures(
        [{"page": 1, "text": "Revenue,2024-Q1,120\nRevenue,2024-Q2,135"}], "USD"
    )
    assert [(item["period"], item["value"]) for item in suggestions] == [
        ("2024-Q1", 120),
        ("2024-Q2", 135),
    ]
def test_wide_year_headers_and_long_form_explicit_units():
    from equitylens.documents import suggest_financial_figures
    wide = suggest_financial_figures([{"page":1,"text":"metric,2024,2025\nRevenue,100,120\nEBITDA,20,24"}])
    assert [(r["period"],r["value"]) for r in wide if r["metric"]=="revenue"] == [("2024",100),("2025",120)]
    rows = suggest_financial_figures([{"page":1,"text":"metric,period,value,currency,unit_scale\nRevenue,2025,120,EUR,1000000"}])
    assert rows[0]["currency"] == "EUR"
    assert rows[0]["unit_scale"] == 1000000
