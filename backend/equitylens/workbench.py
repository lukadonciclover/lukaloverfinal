"""Deterministic valuation workbench. Monetary results use actual currency units."""

from __future__ import annotations

from statistics import mean, median
import math
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from equitylens.models import DCFInputs, FinancialFigure
from equitylens.financials import data_quality_issues
from equitylens.valuation import calculate_dcf, calculate_multiples


class Inputs(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class WACC(Inputs):
    risk_free: float = Field(ge=0, lt=1)
    beta: float
    equity_risk_premium: float = Field(ge=0, lt=1)
    cost_of_debt: float = Field(ge=0, lt=1)
    tax_rate: float = Field(ge=0, le=1)
    market_equity: float = Field(ge=0)
    market_debt: float = Field(ge=0)


def calculate_wacc(w: WACC) -> dict:
    capital = w.market_equity + w.market_debt
    if capital <= 0:
        raise ValueError("WACC requires positive total market capital.")
    ke = w.risk_free + w.beta * w.equity_risk_premium
    result = ke * w.market_equity / capital + w.cost_of_debt * (1 - w.tax_rate) * w.market_debt / capital
    if result <= 0:
        raise ValueError("Calculated WACC must be positive.")
    return {
        "cost_of_equity": ke,
        "equity_weight": w.market_equity / capital,
        "debt_weight": w.market_debt / capital,
        "wacc": result,
    }


class ForecastAssumptions(Inputs):
    horizon: Literal[3, 5, 10] = 5
    growth: float = Field(default=0.05, gt=-1, le=1)
    gross_margin: float = Field(default=0.4, ge=0, le=1)
    ebitda_margin: float = Field(default=0.2, le=1)
    opex_ratio: float | None = Field(default=None, ge=0)
    depreciation_ratio: float = Field(default=0.03, ge=0, le=1)
    tax_rate: float = Field(default=0.25, ge=0, le=1)
    capex_ratio: float = Field(default=0.04, ge=0, le=1)
    nwc_ratio: float = Field(default=0.15, ge=-1, le=1)
    interest_rate: float = Field(default=0.05, ge=0, le=1)
    net_borrowing: float = 0
    dividends: float = Field(default=0, ge=0)
    minimum_cash: float = Field(default=0, ge=0)
    financing: Literal["revolver", "none"] = "revolver"


class Peer(Inputs):
    company: str
    selected: bool = True
    currency: str
    unit_scale: float = Field(gt=0)
    acquisition_date: str = ""
    market_cap: float | None = None
    enterprise_value: float | None = None
    debt: float | None = None
    cash: float | None = None
    revenue: float | None = None
    ebitda: float | None = None
    ebit: float | None = None
    net_income: float | None = None
    book_equity: float | None = None


class DDM(Inputs):
    dividend: float = Field(ge=0)
    growth: float = Field(gt=-1, le=1)
    terminal_growth: float = Field(gt=-1, le=1)
    cost_of_equity: float = Field(gt=0, le=1)
    horizon: Literal[0, 3, 5, 10] = 5


def calculate_ddm(d: DDM) -> dict:
    g = d.terminal_growth if d.horizon else d.growth
    if d.cost_of_equity <= g:
        raise ValueError("DDM cost of equity must exceed perpetual dividend growth.")
    dividends = [d.dividend * (1 + d.growth) ** year for year in range(1, d.horizon + 1)]
    terminal = (dividends[-1] if dividends else d.dividend) * (1 + g) / (d.cost_of_equity - g)
    value = (
        sum(v / (1 + d.cost_of_equity) ** (i + 1) for i, v in enumerate(dividends))
        + terminal / (1 + d.cost_of_equity) ** d.horizon
    )
    return {"per_share": value, "dividends": dividends, "terminal_value": terminal}


class Assets(Inputs):
    book_assets: float = Field(ge=0)
    book_liabilities: float = Field(ge=0)
    asset_adjustment: float = 0
    liability_adjustment: float = 0


def calculate_assets(a: Assets, shares: float | None) -> dict:
    if a.book_assets + a.asset_adjustment < 0 or a.book_liabilities + a.liability_adjustment < 0:
        raise ValueError("Adjusted assets and liabilities cannot be negative.")
    nav = a.book_assets + a.asset_adjustment - a.book_liabilities - a.liability_adjustment
    return {
        "book_equity": a.book_assets - a.book_liabilities,
        "equity_value": nav,
        "per_share": nav / shares if shares else None,
    }


class Scenario(Inputs):
    growth_delta: float = 0
    margin_delta: float = 0
    wacc_delta: float = 0
    terminal_delta: float = 0
    exit_delta: float = 0


class WorkbenchDCF(DCFInputs):
    """Allow empty UI inputs until linked forecast/WACC/bridge inputs are resolved.

    effective_dcf still validates the resolved inputs with strict DCFInputs before
    any calculation. No substitute financial values are inserted here.
    """
    base_revenue: float | None = None
    revenue_growth: list[float | None] = Field(min_length=1, max_length=20)
    ebit_margin: list[float | None] = Field(min_length=1, max_length=20)
    tax_rate: list[float | None] = Field(min_length=1, max_length=20)
    depreciation_pct_revenue: list[float | None] = Field(min_length=1, max_length=20)
    capex_pct_revenue: list[float | None] = Field(min_length=1, max_length=20)
    nwc_pct_revenue: list[float | None] = Field(min_length=1, max_length=20)
    wacc: float | None = None
    terminal_growth: float | None = None
    exit_multiple: float | None = Field(default=None, gt=0)
    cash: float | None = None
    debt: float | None = None


class Workbench(Inputs):
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    figures: list[FinancialFigure] = Field(default_factory=list, max_length=10000)
    forecast: ForecastAssumptions | None = None
    dcf: WorkbenchDCF | None = None
    wacc: WACC | None = None
    peers: list[Peer] = Field(default_factory=list, max_length=500)
    transactions: list[Peer] = Field(default_factory=list, max_length=500)
    ddm: DDM | None = None
    assets: Assets | None = None
    shares: float | None = Field(default=None, gt=0)
    price: float | None = Field(default=None, gt=0)
    cash: float | None = None
    debt: float | None = None
    minority: float = 0
    non_operating_assets: float = 0
    scenarios: dict[str, Scenario] = Field(
        default_factory=lambda: {
            "Bear": Scenario(growth_delta=-0.02, margin_delta=-0.02, wacc_delta=0.01),
            "Base": Scenario(),
            "Bull": Scenario(growth_delta=0.02, margin_delta=0.02, wacc_delta=-0.01),
        }
    )

    @field_validator("dcf", mode="before")
    @classmethod
    def adapt_dcf(cls, value):
        return value.model_dump() if isinstance(value, DCFInputs) else value


def normalized_history(p: Workbench) -> dict[str, dict[str, float]]:
    issues = data_quality_issues(p.figures)
    blocking = [v for v in issues if not v.startswith(("Mixed unit", "Capital expenditure", "Non-positive"))]
    if any(f.currency != p.currency for f in p.figures):
        blocking.append("Financial currency must match project currency; convert explicitly before import.")
    if blocking:
        raise ValueError(" ".join(blocking))
    history: dict[str, dict[str, float]] = {}
    for f in p.figures:
        if f.value is not None:
            normalized = f.value * f.unit_scale
            if not math.isfinite(normalized) or abs(normalized) > 1e100:
                raise ValueError("Normalized financial values are too large to calculate safely.")
            history.setdefault(f.period, {})[f.metric] = normalized
    # Derive only the complete operating-NWC opening balance in a local copy.
    # The approved ledger and forecast mathematics remain unchanged.
    from equitylens.reference_derivations import NWC_ASSETS, NWC_LIABILITIES
    for period, row in history.items():
        if not any(f.period == period and f.metric == "net_working_capital" for f in p.figures) and "net_working_capital" not in row and all(k in row for k in (*NWC_ASSETS, *NWC_LIABILITIES)):
            row["net_working_capital"] = sum(row[k] for k in NWC_ASSETS) - sum(row[k] for k in NWC_LIABILITIES)
    return dict(sorted(history.items()))


def forecast_statements(history: dict, a: ForecastAssumptions) -> list[dict]:
    if not history:
        raise ValueError("Forecast requires approved historical financial data.")
    period = max(history)
    if len(period) != 4:
        raise ValueError("Forecast requires annual financial statements.")
    b = history[period]
    required = [
        "revenue",
        "cash",
        "total_assets",
        "total_liabilities",
        "total_equity",
        "short_term_debt",
        "long_term_debt",
        "net_working_capital",
        "property_plant_equipment",
    ]
    missing = [k for k in required if k not in b]
    if missing:
        raise ValueError("Forecast opening balances missing: " + ", ".join(missing))
    if b["revenue"] <= 0 or any(b[k] < 0 for k in ["cash", "short_term_debt", "long_term_debt", "property_plant_equipment", "total_assets", "total_liabilities"]):
        raise ValueError("Opening revenue must be positive and cash, debt, PP&E, assets and liabilities non-negative.")
    if abs(b["total_assets"] - b["total_liabilities"] - b["total_equity"]) > max(1, abs(b["total_assets"])) * 1e-6:
        raise ValueError("Opening balance sheet does not balance.")
    revenue, cash, equity = b["revenue"], b["cash"], b["total_equity"]
    debt, nwc, ppe = b["short_term_debt"] + b["long_term_debt"], b["net_working_capital"], b["property_plant_equipment"]
    other_liabilities = b["total_liabilities"] - debt
    other_assets = b["total_assets"] - cash - nwc - ppe
    rows = []
    for y in range(1, a.horizon + 1):
        revenue *= 1 + a.growth
        gross = revenue * a.gross_margin
        opex = revenue * (a.opex_ratio if a.opex_ratio is not None else a.gross_margin - a.ebitda_margin)
        if opex < 0:
            raise ValueError("EBITDA margin cannot exceed gross margin without an explicit operating adjustment.")
        ebitda = gross - opex
        da, capex = revenue * a.depreciation_ratio, revenue * a.capex_ratio
        ebit = ebitda - da
        interest = debt * a.interest_rate
        taxes = max(0, ebit - interest) * a.tax_rate
        income = ebit - interest - taxes
        next_nwc = revenue * a.nwc_ratio
        change = next_nwc - nwc
        ocf = income + da - change
        cash_before = cash + ocf - capex + a.net_borrowing - a.dividends
        revolver = max(0, a.minimum_cash - cash_before) if a.financing == "revolver" else 0
        cash = cash_before + revolver
        debt += a.net_borrowing + revolver
        ppe += capex - da
        if debt < 0 or ppe < 0 or cash < 0:
            raise ValueError("Forecast creates negative cash, debt or PP&E; revise financing/capex assumptions.")
        equity += income - a.dividends
        nwc = next_nwc
        assets = cash + nwc + ppe + other_assets
        liabilities = debt + other_liabilities
        rows.append(
            dict(
                year=int(period) + y,
                revenue=revenue,
                cost_of_goods_sold=revenue - gross,
                gross_profit=gross,
                operating_expenses=opex,
                ebitda=ebitda,
                depreciation=da,
                ebit=ebit,
                interest_expense=interest,
                tax_expense=taxes,
                net_income=income,
                cash=cash,
                debt=debt,
                net_working_capital=nwc,
                property_plant_equipment=ppe,
                other_assets=other_assets,
                other_liabilities=other_liabilities,
                total_assets=assets,
                total_liabilities=liabilities,
                total_equity=equity,
                balance_check=assets - liabilities - equity,
                operating_cash_flow=ocf,
                capital_expenditure=capex,
                investing_cash_flow=-capex,
                financing_cash_flow=a.net_borrowing + revolver - a.dividends,
                revolver_draw=revolver,
                change_nwc=change,
                free_cash_flow=ocf - capex,
                fcff=ebit - max(0, ebit) * a.tax_rate + da - capex - change,
            )
        )
    return rows


def relative_valuation(rows: list[Peer], target: dict, p: Workbench, transactions=False) -> dict:
    calculated = []
    keys = {
        "ev_revenue": "revenue",
        "ev_ebitda": "ebitda",
        "ev_ebit": "ebit",
        "pe": "net_income",
        "pb": "total_equity",
        "ps": "revenue",
    }
    if transactions:
        keys = {k: v for k, v in keys.items() if k.startswith("ev_")}
    for peer in rows:
        if not peer.selected:
            continue
        if peer.currency != p.currency:
            raise ValueError("Peer currency mismatch; supply consistently converted financial and market values.")
        if transactions and not peer.acquisition_date:
            raise ValueError("Selected transactions require an acquisition date.")
        if transactions:
            try:
                date.fromisoformat(peer.acquisition_date)
            except ValueError as exc:
                raise ValueError("Acquisition date must be a valid ISO date (YYYY-MM-DD).") from exc
        row = peer.model_dump()
        row = {
            k: (
                v * peer.unit_scale
                if isinstance(v, (float, int)) and not isinstance(v, bool) and k != "unit_scale"
                else v
            )
            for k, v in row.items()
        }
        multiples = calculate_multiples(row)
        calculated.append({"company": peer.company, **{k: multiples[k] for k in keys}})
    stats, ranges = {}, []
    for k, metric in keys.items():
        values = [r[k] for r in calculated if r[k] is not None]
        if not values:
            continue
        stats[k] = dict(
            median=median(values), average=mean(values), minimum=min(values), maximum=max(values), count=len(values)
        )
        if target.get(metric, 0) <= 0:
            continue
        bridge = 0
        if k.startswith("ev_"):
            if p.cash is None or p.debt is None:
                continue
            bridge = p.cash - p.debt - p.minority + p.non_operating_assets
        low, mid, high = [target[metric] * stats[k][s] + bridge for s in ("minimum", "median", "maximum")]
        ranges.append(
            dict(
                multiple=k,
                low=low,
                equity_value=mid,
                high=high,
                per_share=mid / p.shares if p.shares else None,
                enterprise_value=target[metric] * stats[k]["median"] if k.startswith("ev_") else None,
            )
        )
    return {
        "multiples": calculated,
        "statistics": stats,
        "ranges": ranges,
        "note": "Non-positive or missing denominators are excluded. EV methods require an explicit cash/debt bridge.",
    }


def dcf_json(d: DCFInputs) -> dict:
    r = calculate_dcf(d)
    return dict(
        forecast=r.forecast.reset_index().to_dict("records"),
        enterprise_value=r.enterprise_value,
        equity_value=r.equity_value,
        per_share=r.implied_share_value,
        terminal_value=r.terminal_value,
        pv_terminal_value=r.pv_terminal_value,
        upside_downside=r.upside_downside,
    )


def effective_dcf(p: Workbench, history: dict, forecasts: list) -> DCFInputs:
    d = p.dcf.model_copy(deep=True)
    if p.wacc:
        d.wacc = calculate_wacc(p.wacc)["wacc"]
    if p.forecast:
        if not forecasts:
            raise ValueError("Resolve forecast validation before calculating the linked DCF.")
        a = p.forecast
        b = history[max(history)]
        margin = a.gross_margin - a.opex_ratio if a.opex_ratio is not None else a.ebitda_margin
        d = d.model_copy(
            update=dict(
                base_revenue=b["revenue"],
                opening_nwc=b["net_working_capital"],
                revenue_growth=[a.growth] * a.horizon,
                ebit_margin=[margin - a.depreciation_ratio] * a.horizon,
                tax_rate=[a.tax_rate] * a.horizon,
                depreciation_pct_revenue=[a.depreciation_ratio] * a.horizon,
                capex_pct_revenue=[a.capex_ratio] * a.horizon,
                nwc_pct_revenue=[a.nwc_ratio] * a.horizon,
            )
        )
    d.diluted_shares = p.shares
    d.reference_price = p.price
    if p.cash is None or p.debt is None:
        raise ValueError("DCF requires explicit cash and debt, including confirmed zeros.")
    d.cash, d.debt, d.minority_interest, d.non_operating_assets = p.cash, p.debt, p.minority, p.non_operating_assets
    return DCFInputs.model_validate(d.model_dump())


def evaluate(p: Workbench) -> dict:
    history = normalized_history(p)
    output = {
        "currency": p.currency,
        "unit_scale": 1,
        "history": history,
        "models": {},
        "errors": {},
        "forecast": [],
        "scenarios": {},
        "sensitivities": {},
    }

    def attempt(name, fn):
        try:
            return fn()
        except (ValueError, OverflowError) as exc:
            output["errors"][name] = str(exc)
            return None

    if p.forecast:
        output["forecast"] = attempt("forecast", lambda: forecast_statements(history, p.forecast)) or []
    if p.wacc:
        output["wacc"] = attempt("wacc", lambda: calculate_wacc(p.wacc))
    if p.dcf:
        d = attempt("dcf", lambda: effective_dcf(p, history, output["forecast"]))
        if d:
            value = attempt("dcf", lambda: dcf_json(d))
            if value:
                output["models"]["DCF"] = value
                for name, s in p.scenarios.items():
                    scenario = d.model_copy(
                        update=dict(
                            revenue_growth=[v + s.growth_delta for v in d.revenue_growth],
                            ebit_margin=[v + s.margin_delta for v in d.ebit_margin],
                            wacc=d.wacc + s.wacc_delta,
                            terminal_growth=d.terminal_growth + s.terminal_delta,
                            exit_multiple=d.exit_multiple + s.exit_delta,
                        )
                    )
                    output["scenarios"][name] = attempt(
                        name, lambda: dcf_json(DCFInputs.model_validate(scenario.model_dump()))
                    )
                for kind in ("growth", "exit_multiple", "operating"):
                    xs = (
                        [d.wacc + v for v in (-0.02, -0.01, 0, 0.01, 0.02)]
                        if kind != "operating"
                        else [v for v in (-0.02, -0.01, 0, 0.01, 0.02)]
                    )
                    ys = (
                        [d.terminal_growth + v for v in (-0.01, -0.005, 0, 0.005, 0.01)]
                        if kind == "growth"
                        else [d.exit_multiple + v for v in (-2, -1, 0, 1, 2)]
                        if kind == "exit_multiple"
                        else [-0.02, -0.01, 0, 0.01, 0.02]
                    )
                    values = []
                    for y in ys:
                        row = []
                        for x in xs:
                            update = (
                                {
                                    "wacc": x,
                                    "terminal_method": kind,
                                    "terminal_growth" if kind == "growth" else "exit_multiple": y,
                                }
                                if kind != "operating"
                                else {
                                    "revenue_growth": [v + x for v in d.revenue_growth],
                                    "ebit_margin": [v + y for v in d.ebit_margin],
                                }
                            )
                            try:
                                row.append(
                                    dcf_json(DCFInputs.model_validate({**d.model_dump(), **update}))["equity_value"]
                                )
                            except (ValueError, OverflowError):
                                row.append(None)
                        values.append(row)
                    output["sensitivities"][kind] = dict(columns=xs, rows=ys, values=values)
    target = history[max(history)] if history else {}
    for name, enabled, fn in [
        ("Trading comparables", bool(p.peers), lambda: relative_valuation(p.peers, target, p)),
        ("Precedent transactions", bool(p.transactions), lambda: relative_valuation(p.transactions, target, p, True)),
        ("DDM", p.ddm is not None, lambda: calculate_ddm(p.ddm)),
        ("Asset based", p.assets is not None, lambda: calculate_assets(p.assets, p.shares)),
    ]:
        if enabled:
            value = attempt(name, fn)
            if value is not None:
                if name == "DDM" and p.shares:
                    value["equity_value"] = value["per_share"] * p.shares
                output["models"][name] = value
    return output
