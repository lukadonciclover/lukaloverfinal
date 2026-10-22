import pytest
from fastapi.testclient import TestClient
from app.main import app
from equitylens.models import FinancialFigure
from equitylens.historical_references import historical_references

client=TestClient(app)
def figure(metric,value,year=2025,scale=1,currency="USD",notes=""):
    return FinancialFigure(company_id=1,metric=metric,value=value,period=str(year),unit_scale=scale,currency=currency,notes=notes)
def ratios(result):return {a["metric"]:a for a in result["averages"]}
def fixture():
    return [figure(metric,value,year) for year,revenue,margin in [(2022,80,.1),(2023,100,.1),(2024,200,.2),(2025,400,.4)] for metric,value in [("revenue",revenue),("ebitda",revenue*margin)]]

def test_mean_of_annual_ratios_and_growth_not_ratio_of_averages():
    result=historical_references(fixture(),"USD")
    a=ratios(result)
    assert result["periods"]==["2023","2024","2025"]
    assert a["ebitda_margin"]["value"]==pytest.approx((.1+.2+.4)/3)
    assert a["ebitda_margin"]["count"]==3
    assert a["revenue_growth"]["value"]==pytest.approx((.25+1+1)/3)
    assert a["revenue_growth"]["count"]==3
    assert a["ebitda_margin"]["source"]["classification"]=="historical derived"

@pytest.mark.parametrize("window",[2,3,5])
def test_window_selection(window):
    figures=[figure("revenue",100*1.1**i,2020+i) for i in range(6)]
    result=historical_references(figures,"USD",window)
    assert len(result["periods"])==window
    assert ratios(result)["revenue_growth"]["count"]==window
    assert ratios(result)["revenue_growth"]["value"]==pytest.approx(.1)

def test_normalization_zero_negative_and_missing_definitions():
    fs=[figure("revenue",100,scale=1e6),figure("ebitda",-10e6),figure("depreciation_amortization",0),figure("capital_expenditure",-4000,scale=1000),figure("current_assets",30e6),figure("current_liabilities",20e6)]
    a=ratios(historical_references(fs,"USD"))
    assert a["ebitda_margin"]["value"]==-.1
    assert a["depreciation_ratio"]["value"]==0
    assert a["capex_ratio"]["value"]==.04
    assert a["nwc_ratio"]["value"] is None
    assert "operating" in a["nwc_ratio"]["unavailable"]

def test_duplicate_foreign_currency_quarter_and_zero_denominators():
    fs=[figure("revenue",100),figure("revenue",110),figure("ebitda",20),figure("revenue",100,2024,currency="EUR"),figure("ebitda",20,2024),figure("revenue",100,"2025-Q1"),figure("revenue",0,2023),figure("ebitda",10,2023)]
    result=historical_references(fs,"USD")
    assert ratios(result)["ebitda_margin"]["value"] is None
    assert len(result["issues"])==3
    assert not any(a["metric"]=="base_revenue" for a in result["latest"])

def test_latest_balances_never_average_or_fill_missing_debt():
    fs=[figure("revenue",100),figure("cash",5,2024),figure("cash",12,scale=1000),figure("short_term_debt",3,scale=1000),figure("long_term_debt",7,scale=1000),figure("total_assets",1000),figure("total_liabilities",200),figure("net_working_capital",-5)]
    latest={a["metric"]:a for a in historical_references(fs,"USD")["latest"]}
    assert latest["cash"]["value"]==12000 and latest["debt"]["value"]==10000
    assert latest["book_assets"]["value"]==1000
    assert latest["opening_nwc"]["value"]==-5
    assert not any(a["metric"]=="debt" for a in historical_references([f for f in fs if f.metric!="long_term_debt"],"USD")["latest"])

def test_fallback_definitions_use_actual_source_inputs_and_opex_compatibility():
    fs=[figure("revenue",100),figure("cost_of_goods_sold",60),figure("ebit",20),figure("depreciation_amortization",5),figure("interest_expense",4),figure("tax_expense",4),figure("nonoperating_income",0),figure("nonoperating_expenses",0),figure("operating_expenses",15)]
    a=ratios(historical_references(fs,"USD"))
    assert a["gross_margin"]["value"]==.4 and a["ebitda_margin"]["value"]==.25
    assert a["tax_rate"]["value"]==.25
    assert {i["metric"] for i in a["tax_rate"]["source"]["inputs"]}=={"ebit","interest_expense","tax_expense","nonoperating_income","nonoperating_expenses"}
    assert not a["opex_ratio"]["prefill_eligible"]
    fs[-1].notes="Excludes depreciation and amortization"
    assert ratios(historical_references(fs,"USD"))["opex_ratio"]["prefill_eligible"]

def test_analysis_api_returns_missing_roic_inputs_and_historical_references():
    payload={"figures":[f.model_dump(mode="json") for f in fixture()],"currency":"USD"}
    response=client.post("/v1/financials/analyze",json=payload)
    assert response.status_code==200
    body=response.json()
    assert "tax expense" in body["unavailable_reasons"]["2025"]["return_on_invested_capital"]
    assert body["historical_references"]["window"]==3
    payload["currency"]="EUR"
    assert client.post("/v1/financials/analyze",json=payload).status_code==422
    assert client.post("/v1/assumptions/historical-averages",json={"figures":[],"currency":"USD","window":4}).status_code==422


def test_linked_dcf_resolves_blank_ui_fields_before_strict_validation():
    from test_workbench import project
    from equitylens.workbench import evaluate
    p=project()
    expected=evaluate(p)["models"]["DCF"]["equity_value"]
    payload=p.model_dump(mode="json")
    for field in ["revenue_growth","ebit_margin","tax_rate","depreciation_pct_revenue","capex_pct_revenue","nwc_pct_revenue"]:
        payload["dcf"][field]=[None]*5
    for field in ["base_revenue","wacc","cash","debt"]:payload["dcf"][field]=None
    response=client.post("/v1/workbench/calculate",json=payload)
    assert response.status_code==200
    assert response.json()["models"]["DCF"]["equity_value"]==pytest.approx(expected)
    assert client.post("/v1/workbench/export",json=payload).status_code==200
    payload["forecast"]=None
    missing=client.post("/v1/workbench/calculate",json=payload).json()
    assert "DCF" not in missing["models"] and "dcf" in missing["errors"]
    assert client.post("/v1/valuation/dcf",json=payload["dcf"]).status_code==422
