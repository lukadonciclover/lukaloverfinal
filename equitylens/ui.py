from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

import pandas as pd
import plotly.express as px
import streamlit as st

from equitylens.ai import OllamaClient, build_chat_prompt, import_manual_agent_response, parse_json_output, run_agent, run_chat
from equitylens.db import Repository
from equitylens.documents import (
    chunk_pages,
    classify_document,
    detect_reporting_period,
    document_identifier,
    extract_document,
    search_chunks,
    suggest_financial_figures,
)
from equitylens.financials import FORMULAS, analysis_table, data_quality_issues, figures_to_frame, periods_to_metrics
from equitylens.models import AIMode, ChatAnswer, Company, DCFInputs, DocumentRecord, FinancialFigure, SourceRef, ValueOrigin
from equitylens.prompts import AGENT_SCHEMAS, STRATEGIES, build_agent_prompt, build_strategy_prompt, evaluate_output, known_answer_tasks
from equitylens.reports import generate_docx, generate_excel, generate_pdf
from equitylens.sample import ensure_synthetic_project
from equitylens.thesis import generate_deterministic_thesis
from equitylens.valuation import calculate_dcf, calculate_multiples, peer_statistics, scenario_analysis, sensitivity_analysis


PAGES = [
    "Dashboard", "Company Workspace", "Financial Statement Analysis", "Valuation Lab",
    "AI Research Agents", "Investment Thesis", "Research Chat", "Investment Report",
    "Prompt Engineering Lab", "Settings",
]

METRICS = [
    "revenue", "cost_of_goods_sold", "gross_profit", "operating_expenses", "ebitda", "ebit",
    "interest_expense", "tax_expense", "net_income", "cash", "short_term_investments", "total_assets",
    "current_assets", "current_liabilities", "total_liabilities", "short_term_debt", "long_term_debt",
    "total_equity", "net_working_capital", "operating_cash_flow", "capital_expenditure",
    "investing_cash_flow", "financing_cash_flow", "free_cash_flow",
]


@st.cache_resource
def repository() -> Repository:
    return Repository()


def run_app() -> None:
    st.set_page_config(page_title="EquityLens AI", page_icon="EL", layout="wide", initial_sidebar_state="expanded")
    repo = repository()
    ensure_synthetic_project(repo)
    initialize_settings()
    apply_theme(st.session_state.theme)
    page, company = sidebar(repo)
    st.markdown(f"<div class='eyebrow'>EQUITYLENS AI / {page.upper()}</div>", unsafe_allow_html=True)
    handlers = {
        "Dashboard": dashboard_page,
        "Company Workspace": workspace_page,
        "Financial Statement Analysis": financials_page,
        "Valuation Lab": valuation_page,
        "AI Research Agents": agents_page,
        "Investment Thesis": thesis_page,
        "Research Chat": chat_page,
        "Investment Report": report_page,
        "Prompt Engineering Lab": prompt_lab_page,
        "Settings": settings_page,
    }
    handlers[page](repo, company)


def initialize_settings() -> None:
    defaults = {
        "theme": "Dark", "ai_mode": AIMode.ANALYTICS.value, "ollama_url": "http://localhost:11434",
        "ollama_model": "llama3.1:8b", "ollama_timeout": 120,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def apply_theme(theme: str) -> None:
    dark = theme == "Dark"
    background = "#0B1118" if dark else "#F4F1E9"
    panel = "#111C27" if dark else "#FFFEFA"
    text = "#E8EEF2" if dark else "#17212B"
    muted = "#91A2AF" if dark else "#5C6973"
    border = "#243646" if dark else "#D8D2C6"
    st.markdown(
        f"""<style>
        .stApp {{ background: {background}; color: {text}; }}
        [data-testid="stSidebar"] {{ background: {panel}; border-right: 1px solid {border}; }}
        .block-container {{ padding-top: 2rem; padding-bottom: 4rem; max-width: 1500px; }}
        h1, h2, h3 {{ letter-spacing: -0.025em; }}
        .eyebrow {{ color: #D9A441; font-size: .72rem; letter-spacing: .16em; font-weight: 700; margin-bottom: .35rem; }}
        .hero {{ border: 1px solid {border}; background: linear-gradient(135deg, {panel}, {background}); padding: 2rem; margin: .4rem 0 1.4rem; }}
        .hero h1 {{ margin: 0 0 .45rem; font-size: 2.6rem; }}
        .hero p {{ color: {muted}; max-width: 760px; margin: 0; }}
        [data-testid="stMetric"] {{ background: {panel}; border: 1px solid {border}; padding: .85rem; }}
        [data-testid="stDataFrame"], [data-testid="stDataEditor"] {{ border: 1px solid {border}; }}
        .source-card {{ border-left: 3px solid #2E8B8B; background: {panel}; padding: .8rem 1rem; margin: .5rem 0; }}
        .synthetic {{ border: 1px solid #D9A441; color: #D9A441; padding: .55rem .8rem; font-size: .82rem; }}
        .stButton button, .stDownloadButton button {{ border-radius: 2px; }}
        </style>""",
        unsafe_allow_html=True,
    )


def sidebar(repo: Repository) -> tuple[str, Company | None]:
    with st.sidebar:
        st.markdown("## EQUITYLENS")
        st.caption("Local investment research terminal")
        page = st.radio("Navigation", PAGES, label_visibility="collapsed")
        st.divider()
        companies = repo.list_companies()
        labels = {company.id: f"{company.name}{' · SYNTHETIC' if company.is_synthetic else ''}" for company in companies}
        selected = st.selectbox("Active workspace", options=list(labels), format_func=lambda item: labels[item]) if labels else None
        company = repo.get_company(int(selected)) if selected is not None else None
        st.caption(f"Mode: {st.session_state.ai_mode}")
        if company and company.is_synthetic:
            st.markdown("<div class='synthetic'>SYNTHETIC DATA</div>", unsafe_allow_html=True)
    return page, company


def require_company(company: Company | None) -> bool:
    if company is None or company.id is None:
        st.warning("Create a company workspace first.")
        return False
    return True


def dashboard_page(repo: Repository, company: Company | None) -> None:
    st.markdown("<div class='hero'><h1>Research with an audit trail.</h1><p>Move from source documents to verified financials, reproducible valuation, challenged conclusions, and export-ready research without a paid API.</p></div>", unsafe_allow_html=True)
    companies = repo.list_companies()
    documents = repo.list_documents(company.id) if company and company.id else []
    figures = repo.get_figures(company.id) if company and company.id else []
    columns = st.columns(4)
    columns[0].metric("Workspaces", len(companies))
    columns[1].metric("Attached sources", len(documents))
    columns[2].metric("Verified figures", len(figures))
    columns[3].metric("AI mode", st.session_state.ai_mode.replace(" Mode", ""))
    st.subheader("Analyst workflow")
    steps = [
        ("01", "Create", "Define the company, reporting currency, horizon, and return requirement."),
        ("02", "Source", "Upload reports and inspect extraction quality and page-level evidence."),
        ("03", "Verify", "Correct suggested figures before they enter calculations."),
        ("04", "Value", "Set explicit DCF assumptions and pressure-test scenarios."),
        ("05", "Challenge", "Run or manually import structured agent reviews."),
        ("06", "Publish", "Export a reconciled report and financial workbook."),
    ]
    for row in [steps[:3], steps[3:]]:
        cols = st.columns(3)
        for col, (number, title, body) in zip(cols, row):
            with col:
                st.markdown(f"### {number} / {title}")
                st.write(body)
    st.info("The built-in Northstar Components project is entirely synthetic and is provided only to demonstrate the workflow.")


def workspace_page(repo: Repository, company: Company | None) -> None:
    st.title("Company Workspace")
    create_tab, profile_tab, documents_tab = st.tabs(["New project", "Company profile", "Documents"])
    with create_tab:
        company_form(repo, None, "create")
    with profile_tab:
        if require_company(company):
            company_form(repo, company, "edit")
    with documents_tab:
        if require_company(company):
            upload_documents(repo, company)


def company_form(repo: Repository, company: Company | None, key: str) -> None:
    existing = company or Company(name="")
    with st.form(f"company-{key}"):
        first, second, third = st.columns(3)
        name = first.text_input("Company name *", existing.name)
        ticker = second.text_input("Ticker symbol", existing.ticker or "")
        country = third.text_input("Country", existing.country)
        industry = first.text_input("Industry", existing.industry)
        currency = second.text_input("Reporting currency", existing.currency)
        standard = third.text_input("Reporting standard", existing.reporting_standard)
        year = first.number_input("Latest financial year", min_value=1900, max_value=2200, value=existing.latest_financial_year or 2025)
        share_price = second.number_input("Share price (optional)", min_value=0.0, value=float(existing.share_price or 0), help="Leave at zero to omit.")
        shares = third.number_input("Shares outstanding (optional)", min_value=0.0, value=float(existing.shares_outstanding or 0), help="Use the same scale as valuation inputs.")
        dates = st.text_input("Financial statement dates", existing.statement_dates)
        horizon = first.text_input("Investment horizon", existing.investment_horizon)
        required = second.number_input("Required annual return", min_value=0.0, max_value=1.0, value=float(existing.required_return or 0.1), format="%.2f")
        notes = st.text_area("Analyst notes", existing.analyst_notes)
        submitted = st.form_submit_button("Save project", type="primary")
    if submitted:
        if not name.strip():
            st.error("Company name is required.")
            return
        company_id = repo.save_company(
            Company(
                id=existing.id, name=name.strip(), ticker=ticker.strip() or None, country=country.strip(),
                industry=industry.strip(), currency=currency.strip().upper() or "USD", reporting_standard=standard.strip(),
                latest_financial_year=int(year), share_price=share_price or None, shares_outstanding=shares or None,
                statement_dates=dates.strip(), investment_horizon=horizon.strip(), required_return=required,
                analyst_notes=notes, is_synthetic=existing.is_synthetic, created_at=existing.created_at,
            )
        )
        st.success(f"Saved workspace #{company_id}.")
        st.rerun()


def upload_documents(repo: Repository, company: Company) -> None:
    uploads = st.file_uploader("Attach company sources", type=["pdf", "csv", "xlsx", "txt", "md"], accept_multiple_files=True)
    reporting_period = st.text_input("Reporting period override", help="Optional. Leave blank to detect from extracted text.")
    if st.button("Process uploaded files", type="primary", disabled=not uploads):
        existing_ids = {document.identifier for document in repo.list_documents(company.id)}
        progress = st.progress(0)
        for index, upload in enumerate(uploads or []):
            content = upload.getvalue()
            identifier = document_identifier(content)
            if identifier in existing_ids:
                st.warning(f"{upload.name} is already attached; skipped.")
                continue
            try:
                extracted = extract_document(content, upload.name)
                combined = "\n".join(page["text"] for page in extracted.pages)
                document_type = classify_document(upload.name, combined)
                period = reporting_period.strip() or detect_reporting_period(combined)
                target = Path("data/files") / str(company.id) / f"{identifier}{Path(upload.name).suffix.lower()}"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
                record = DocumentRecord(
                    company_id=company.id, identifier=identifier, name=upload.name, document_type=document_type,
                    reporting_period=period, path=str(target), extraction_status="warning" if extracted.warning else "complete",
                    pages=len(extracted.pages), warning=extracted.warning,
                )
                document_id = repo.add_document(record)
                chunks = chunk_pages(extracted.pages)
                for chunk in chunks:
                    chunk["metadata"]["document_identifier"] = identifier
                    chunk["metadata"]["document_type"] = document_type
                repo.replace_chunks(document_id, company.id, chunks)
                suggestions = suggest_financial_figures(extracted.pages, company.currency)
                repo.save_state(company.id, f"suggestions:{document_id}", suggestions)
                st.success(f"{upload.name}: {len(extracted.pages)} pages, {len(chunks)} searchable chunks, {len(suggestions)} review suggestions.")
                if extracted.warning:
                    st.warning(extracted.warning)
            except (ValueError, OSError, sqlite3.DatabaseError) as exc:
                st.error(f"{upload.name}: {exc}")
            progress.progress((index + 1) / len(uploads))
    documents = repo.list_documents(company.id)
    if not documents:
        st.caption("No documents attached.")
        return
    for document in documents:
        with st.expander(f"{document.name} · {document.document_type} · {document.extraction_status}"):
            st.write({"identifier": document.identifier, "reporting_period": document.reporting_period or "Not detected", "pages": document.pages, "uploaded": str(document.upload_date)})
            if document.warning:
                st.warning(document.warning)
            suggestions = repo.get_state(company.id, f"suggestions:{document.id}", [])
            if suggestions:
                st.caption(f"{len(suggestions)} conservative extraction suggestions are available for review on the Financial Statement Analysis page.")
            if st.button("Remove document", key=f"remove-{document.id}"):
                path = repo.remove_document(document.id)
                if path:
                    Path(path).unlink(missing_ok=True)
                st.rerun()


def financials_page(repo: Repository, company: Company | None) -> None:
    st.title("Financial Statement Analysis")
    if not require_company(company):
        return
    documents = repo.list_documents(company.id)
    pending = []
    for document in documents:
        for item in repo.get_state(company.id, f"suggestions:{document.id}", []):
            pending.append({**item, "document_id": document.id, "document_name": document.name})
    if pending:
        with st.expander(f"Review {len(pending)} document extraction suggestions", expanded=False):
            st.warning("Suggestions are not used until selected and accepted. Check period, scale, and source quote carefully.")
            suggestion_frame = pd.DataFrame(pending)
            suggestion_frame.insert(0, "accept", False)
            edited = st.data_editor(suggestion_frame, hide_index=True, num_rows="fixed", key=f"suggestions-{company.id}")
            if st.button("Accept selected suggestions"):
                accepted = edited[edited["accept"]]
                for _, row in accepted.iterrows():
                    repo.upsert_figure(
                        FinancialFigure(
                            company_id=company.id, metric=row["metric"], period=str(row["period"]), value=float(row["value"]),
                            currency=row["currency"], unit_scale=float(row["unit_scale"]), origin=ValueOrigin.REPORTED,
                            source=SourceRef(
                                document_id=int(row["document_id"]), document_name=row["document_name"], page=int(row["page"]),
                                quote=row["quote"], reporting_period=str(row["period"]), currency=row["currency"],
                                unit_scale=float(row["unit_scale"]), confidence=float(row["confidence"]),
                            ),
                        )
                    )
                st.success(f"Accepted {len(accepted)} figures.")
                st.rerun()
    figures = repo.get_figures(company.id)
    for issue in data_quality_issues(figures):
        st.warning(issue)
    editable_columns = ["metric", "period", "value", "currency", "unit_scale", "origin", "notes"]
    frame = figures_to_frame(figures)
    edit_frame = frame[editable_columns] if not frame.empty else pd.DataFrame(columns=editable_columns)
    edited = st.data_editor(
        edit_frame, num_rows="dynamic", hide_index=True, width="stretch",
        column_config={
            "metric": st.column_config.SelectboxColumn(options=METRICS, required=True),
            "origin": st.column_config.SelectboxColumn(options=[item.value for item in ValueOrigin], required=True),
            "value": st.column_config.NumberColumn(format="%.4f"),
            "unit_scale": st.column_config.NumberColumn(help="1 for actual units, 1,000 for thousands, 1,000,000 for millions."),
        },
        key=f"financial-editor-{company.id}",
    )
    if st.button("Save verified financial table", type="primary"):
        failures = []
        for index, row in edited.iterrows():
            if not str(row.get("metric", "")).strip() or not str(row.get("period", "")).strip():
                failures.append(f"Row {index + 1}: metric and period are required.")
                continue
            source = next((figure.source for figure in figures if figure.metric == row["metric"] and figure.period == str(row["period"])), None)
            value = None if pd.isna(row.get("value")) else float(row["value"])
            repo.upsert_figure(
                FinancialFigure(
                    company_id=company.id, metric=row["metric"], period=str(row["period"]), value=value,
                    currency=str(row.get("currency") or company.currency), unit_scale=float(row.get("unit_scale") or 1),
                    origin=ValueOrigin(str(row.get("origin") or ValueOrigin.USER.value)), source=source,
                    notes=str(row.get("notes") or ""),
                )
            )
        if failures:
            st.error(" ".join(failures))
        else:
            st.success("Financial table saved. Missing values were preserved as missing.")
            st.rerun()
    if not figures:
        st.info("Upload a source or add financial rows to begin analysis.")
        return
    metrics = analysis_table(figures)
    st.subheader("Calculated performance")
    st.dataframe(metrics.style.format("{:.1%}", subset=[column for column in metrics if column not in {"net_debt", "free_cash_flow"}], na_rep="—").format("{:,.2f}", subset=[column for column in metrics if column in {"net_debt", "free_cash_flow"}], na_rep="—"), width="stretch")
    with st.expander("Ratio formulas"):
        for label, formula in FORMULAS.items():
            st.markdown(f"**{label}:** `{formula}`")
    raw = periods_to_metrics(figures)
    chart_rows = [{"period": period, "metric": metric, "value": value} for period, values in raw.items() for metric, value in values.items() if value is not None and metric in {"revenue", "gross_profit", "ebitda", "net_income", "operating_cash_flow", "capital_expenditure"}]
    if chart_rows:
        st.plotly_chart(px.line(pd.DataFrame(chart_rows), x="period", y="value", color="metric", markers=True, title=f"Performance ({company.currency}, source units)"), width="stretch")
    with st.expander("Data provenance"):
        for figure in figures:
            source = figure.source
            st.markdown(f"**{figure.period} · {figure.metric}: {figure.value if figure.value is not None else 'missing'}** · `{figure.origin.value}`")
            if source:
                st.markdown(f"<div class='source-card'>{source.document_name}, page {source.page or 'n/a'} · confidence {source.confidence:.0%}<br>{source.quote}</div>", unsafe_allow_html=True)
            else:
                st.caption("No source attached; this value was entered or edited by the user.")


def default_dcf(company: Company, figures: list[FinancialFigure]) -> dict[str, Any]:
    by_period = periods_to_metrics(figures)
    latest = by_period[sorted(by_period)[-1]] if by_period else {}
    return {
        "base_revenue": float(latest.get("revenue") or 1000), "revenue_growth": [0.08] * 5,
        "ebit_margin": [0.18] * 5, "tax_rate": [0.25] * 5, "depreciation_pct_revenue": [0.04] * 5,
        "capex_pct_revenue": [0.05] * 5, "nwc_pct_revenue": [0.10] * 5,
        "wacc": float(company.required_return or 0.10), "terminal_growth": 0.025,
        "cash": float(latest.get("cash") or 0), "debt": float((latest.get("short_term_debt") or 0) + (latest.get("long_term_debt") or 0)),
        "minority_interest": 0.0, "non_operating_assets": 0.0, "diluted_shares": company.shares_outstanding,
        "reference_price": company.share_price,
    }


def valuation_page(repo: Repository, company: Company | None) -> None:
    st.title("Valuation Lab")
    if not require_company(company):
        return
    dcf_tab, peers_tab = st.tabs(["DCF model", "Relative valuation"])
    with dcf_tab:
        figures = repo.get_figures(company.id)
        saved = repo.get_state(company.id, "dcf_inputs", default_dcf(company, figures))
        years = len(saved.get("revenue_growth", [0] * 5))
        st.caption("All monetary inputs must use one consistent scale. The synthetic example uses USD millions.")
        top = st.columns(4)
        base_revenue = top[0].number_input("Base-year revenue", value=float(saved["base_revenue"]))
        wacc = top[1].number_input("WACC", value=float(saved["wacc"]), format="%.4f")
        terminal = top[2].number_input("Terminal growth", value=float(saved["terminal_growth"]), format="%.4f")
        forecast_years = int(top[3].number_input("Forecast years", min_value=1, max_value=10, value=years))
        assumptions = pd.DataFrame({
            "Year": list(range(1, forecast_years + 1)),
            "Revenue growth": resize(saved["revenue_growth"], forecast_years),
            "EBIT margin": resize(saved["ebit_margin"], forecast_years),
            "Tax rate": resize(saved["tax_rate"], forecast_years),
            "D&A / revenue": resize(saved["depreciation_pct_revenue"], forecast_years),
            "Capex / revenue": resize(saved["capex_pct_revenue"], forecast_years),
            "NWC / revenue": resize(saved["nwc_pct_revenue"], forecast_years),
        })
        assumptions = st.data_editor(assumptions, hide_index=True, num_rows="fixed", width="stretch")
        bridge = st.columns(6)
        cash = bridge[0].number_input("Cash", value=float(saved.get("cash", 0)))
        debt = bridge[1].number_input("Debt", value=float(saved.get("debt", 0)))
        minority = bridge[2].number_input("Minority interest", value=float(saved.get("minority_interest", 0)))
        assets = bridge[3].number_input("Non-operating assets", value=float(saved.get("non_operating_assets", 0)))
        shares = bridge[4].number_input("Diluted shares", min_value=0.0, value=float(saved.get("diluted_shares") or 0))
        reference = bridge[5].number_input("Reference share price", min_value=0.0, value=float(saved.get("reference_price") or 0))
        values = DCFInputs(
            base_revenue=base_revenue, revenue_growth=assumptions["Revenue growth"].tolist(),
            ebit_margin=assumptions["EBIT margin"].tolist(), tax_rate=assumptions["Tax rate"].tolist(),
            depreciation_pct_revenue=assumptions["D&A / revenue"].tolist(), capex_pct_revenue=assumptions["Capex / revenue"].tolist(),
            nwc_pct_revenue=assumptions["NWC / revenue"].tolist(), wacc=wacc, terminal_growth=terminal,
            cash=cash, debt=debt, minority_interest=minority, non_operating_assets=assets,
            diluted_shares=shares or None, reference_price=reference or None,
        )
        if st.button("Calculate and save DCF", type="primary"):
            try:
                result = calculate_dcf(values)
                repo.save_state(company.id, "dcf_inputs", values.model_dump())
                repo.save_state(company.id, "dcf_result", dcf_summary(result))
                st.success("DCF assumptions and result saved.")
            except ValueError as exc:
                st.error(str(exc))
        try:
            result = calculate_dcf(values)
        except ValueError as exc:
            st.error(str(exc))
            return
        result_columns = st.columns(4)
        result_columns[0].metric("Enterprise value", f"{result.enterprise_value:,.2f}")
        result_columns[1].metric("Equity value", f"{result.equity_value:,.2f}")
        result_columns[2].metric("Implied share value", f"{result.implied_share_value:,.2f}" if result.implied_share_value is not None else "Shares required")
        result_columns[3].metric("Upside / downside", f"{result.upside_downside:.1%}" if result.upside_downside is not None else "Reference price required")
        st.caption(result.timing_convention)
        st.dataframe(result.forecast.style.format("{:,.2f}"), width="stretch")
        scenario_results = scenario_analysis(values)
        st.subheader("Bear / base / bull")
        st.dataframe(pd.DataFrame({name: dcf_summary(item) for name, item in scenario_results.items()}).T[["enterprise_value", "equity_value", "implied_share_value"]], width="stretch")
        st.subheader("WACC / terminal growth sensitivity")
        sensitivity = sensitivity_analysis(values)
        st.dataframe(sensitivity.style.format("{:,.2f}", na_rep="Invalid"), width="stretch")
        st.plotly_chart(px.imshow(sensitivity, text_auto=".1f", aspect="auto", color_continuous_scale="RdYlGn", title="Implied share value (or equity value when shares are absent)"), width="stretch")
    with peers_tab:
        st.caption("Comparable selection is an analyst judgment. Invalid multiples with non-positive denominators are excluded.")
        rows = repo.get_state(company.id, "comparables", [{"company": "", "market_cap": None, "debt": None, "cash": None, "enterprise_value": None, "revenue": None, "ebitda": None, "ebit": None, "net_income": None}])
        peer_input = st.data_editor(pd.DataFrame(rows), num_rows="dynamic", hide_index=True, width="stretch")
        if st.button("Save comparables"):
            clean = peer_input.where(pd.notna(peer_input), None).to_dict("records")
            repo.save_state(company.id, "comparables", clean)
            st.success("Comparable set saved.")
        valid_rows = [row for row in peer_input.where(pd.notna(peer_input), None).to_dict("records") if row.get("company")]
        if valid_rows:
            calculated = pd.DataFrame([calculate_multiples(row) for row in valid_rows])
            st.dataframe(calculated, width="stretch")
            st.subheader("Peer statistics")
            statistics = peer_statistics(valid_rows)
            st.dataframe(statistics, width="stretch")
            st.caption("EV/Revenue, EV/EBITDA, EV/EBIT, and P/E require a positive denominator; excluded cells remain blank.")
            st.subheader("Peer-implied valuation")
            latest_values = periods_to_metrics(repo.get_figures(company.id))
            latest_period = sorted(latest_values)[-1] if latest_values else ""
            latest_financials = latest_values.get(latest_period, {})
            target_cols = st.columns(6)
            target_revenue = target_cols[0].number_input("Target revenue", value=float(latest_financials.get("revenue") or 0))
            target_ebitda = target_cols[1].number_input("Target EBITDA", value=float(latest_financials.get("ebitda") or 0))
            target_ebit = target_cols[2].number_input("Target EBIT", value=float(latest_financials.get("ebit") or 0))
            target_income = target_cols[3].number_input("Target net income", value=float(latest_financials.get("net_income") or 0))
            target_debt = target_cols[4].number_input("Target debt", value=float((latest_financials.get("short_term_debt") or 0) + (latest_financials.get("long_term_debt") or 0)))
            target_cash = target_cols[5].number_input("Target cash", value=float(latest_financials.get("cash") or 0))
            estimates = []
            medians = statistics.loc["Median"]
            for label, multiple_name, target, basis in (
                ("EV / Revenue", "ev_revenue", target_revenue, "enterprise"),
                ("EV / EBITDA", "ev_ebitda", target_ebitda, "enterprise"),
                ("EV / EBIT", "ev_ebit", target_ebit, "enterprise"),
                ("P / E", "pe", target_income, "equity"),
            ):
                multiple = medians.get(multiple_name)
                if pd.isna(multiple) or target <= 0:
                    continue
                enterprise = float(multiple * target) if basis == "enterprise" else None
                equity = enterprise - target_debt + target_cash if enterprise is not None else float(multiple * target)
                estimates.append({
                    "method": label, "peer_median": multiple, "target_metric": target,
                    "enterprise_value": enterprise, "equity_value": equity,
                    "implied_share_value": equity / company.shares_outstanding if company.shares_outstanding else None,
                })
            if estimates:
                st.dataframe(pd.DataFrame(estimates), width="stretch")
            else:
                st.info("No applicable positive peer multiple and target metric combination is available.")


def agents_page(repo: Repository, company: Company | None) -> None:
    st.title("AI Research Agents")
    if not require_company(company):
        return
    mode = AIMode(st.session_state.ai_mode)
    figures = periods_to_metrics(repo.get_figures(company.id))
    valuation = repo.get_state(company.id, "dcf_result", {})
    chunks = repo.get_chunks(company.id)
    evidence = search_chunks("revenue margin cash flow leverage debt risks competition guidance valuation", chunks, limit=8)
    latest = repo.latest_agent_runs(company.id)
    agent_names = list(AGENT_SCHEMAS)
    selected = st.selectbox("Agent", agent_names)
    prior = {name: item["parsed_output"] for name, item in latest.items() if item.get("status") == "valid" and item.get("parsed_output")}
    prompt = build_agent_prompt(selected, evidence, figures, valuation, prior)
    if mode == AIMode.LOCAL:
        client = ollama_client()
        if not client.available():
            st.error("Ollama is not reachable. Start Ollama, choose a valid model in Settings, or switch to Manual AI Mode.")
        run_one, run_all = st.columns(2)
        if run_one.button("Run selected agent", type="primary"):
            with st.spinner(f"Running {selected}..."):
                result = run_agent(company.id, selected, evidence, figures, valuation, prior, client)
                repo.save_agent_run(result)
            st.success("Agent output validated and saved." if result.status == "valid" else f"Agent finished with status: {result.status}")
            st.rerun()
        if run_all.button("Run full pipeline"):
            progress = st.progress(0)
            working_prior = dict(prior)
            for index, name in enumerate(agent_names):
                result = run_agent(company.id, name, evidence, figures, valuation, working_prior, client)
                repo.save_agent_run(result)
                if result.parsed_output:
                    working_prior[name] = result.parsed_output
                progress.progress((index + 1) / len(agent_names))
            st.rerun()
    elif mode == AIMode.MANUAL:
        st.info("The application has not contacted an external chat service. Copy this prompt, run it elsewhere, then paste the response for local validation.")
        st.text_area("Copyable agent prompt", prompt, height=320)
        response = st.text_area("Paste JSON response", height=220)
        if st.button("Validate and save response", type="primary", disabled=not response.strip()):
            result = import_manual_agent_response(company.id, selected, prompt, response)
            if result.status == "valid":
                repo.save_agent_run(result)
                st.success("Valid response saved to this workspace.")
                st.rerun()
            else:
                st.error("Response rejected: " + " ".join(result.errors))
    else:
        st.info("Financial Analytics Only mode does not invoke a language model. Switch modes in Settings to run an agent.")
        with st.expander("Preview the grounded prompt"):
            st.code(prompt)
    latest = repo.latest_agent_runs(company.id)
    tabs = st.tabs(agent_names)
    for tab, name in zip(tabs, agent_names):
        with tab:
            item = latest.get(name)
            if not item:
                st.caption("No saved run.")
            else:
                st.write(f"Status: **{item['status']}** · Model: `{item['model_name'] or 'unknown'}`")
                if item["errors"]:
                    st.error(" ".join(item["errors"]))
                if item["parsed_output"]:
                    st.json(item["parsed_output"])
                with st.expander("Intermediate prompt and raw output"):
                    st.text_area("Prompt", item["prompt"], height=220, key=f"prompt-view-{name}")
                    st.code(item["raw_output"] or "No raw output")


def thesis_page(repo: Repository, company: Company | None) -> None:
    st.title("Investment Thesis")
    if not require_company(company):
        return
    metrics = periods_to_metrics(repo.get_figures(company.id))
    valuation = repo.get_state(company.id, "dcf_result", {})
    latest = repo.latest_agent_runs(company.id)
    outputs = {name: item["parsed_output"] for name, item in latest.items() if item.get("parsed_output")}
    thesis = generate_deterministic_thesis(company, metrics, valuation, outputs)
    for section, items in thesis.items():
        st.subheader(section)
        if not items:
            st.caption("Insufficient verified information.")
        for item in items:
            st.markdown(f"**{item['classification']}** · {item['text']}")
    if not outputs.get("Investment Committee Critic"):
        st.warning("No validated committee critique is available, so the recommendation defaults to Insufficient Evidence.")


def chat_page(repo: Repository, company: Company | None) -> None:
    st.title("Research Chat")
    if not require_company(company):
        return
    if AIMode(st.session_state.ai_mode) == AIMode.MANUAL and st.session_state.get("manual_chat_prompt"):
        manual_chat_import(repo, company)
    for message in repo.get_chat(company.id):
        with st.chat_message(message["role"]):
            st.write(message["content"])
            if message["citations"]:
                st.caption("Sources: " + "; ".join(message["citations"]))
    question = st.chat_input("Ask about uploaded documents or saved valuation assumptions")
    if not question:
        return
    repo.add_chat(company.id, "user", question)
    evidence = search_chunks(question, repo.get_chunks(company.id), limit=6)
    valuation = repo.get_state(company.id, "dcf_result", {})
    prompt = build_chat_prompt(question, evidence, json.dumps(valuation, indent=2))
    mode = AIMode(st.session_state.ai_mode)
    if mode == AIMode.LOCAL:
        answer, _, errors = run_chat(ollama_client(), prompt)
        if answer:
            repo.add_chat(company.id, "assistant", answer.answer, answer.citations)
        else:
            repo.add_chat(company.id, "assistant", "No model answer was saved. " + " ".join(errors), [])
        st.rerun()
    if mode == AIMode.MANUAL:
        st.session_state["manual_chat_prompt"] = prompt
        st.rerun()
    citations = [f"{item.get('document_name')}, page {item.get('page')}" for item in evidence]
    response = "Financial Analytics Only mode does not generate narrative answers. "
    response += "Relevant source passages were retrieved below." if evidence else "No relevant source evidence was found."
    repo.add_chat(company.id, "assistant", response, citations)
    st.rerun()


def manual_chat_import(repo: Repository, company: Company) -> None:
    prompt = st.session_state.get("manual_chat_prompt")
    if not prompt:
        return
    st.info("Copy this grounded prompt to an external model. No external model has been contacted by EquityLens.")
    st.text_area("Manual chat prompt", prompt, height=300)
    raw = st.text_area("Paste chat JSON response", key="manual-chat-response")
    if st.button("Validate chat response", disabled=not raw.strip()):
        parsed, errors = parse_json_output(raw, ChatAnswer)
        if parsed:
            answer = ChatAnswer.model_validate(parsed)
            repo.add_chat(company.id, "assistant", answer.answer, answer.citations)
            del st.session_state["manual_chat_prompt"]
            st.rerun()
        st.error("Response rejected: " + " ".join(errors))


def report_page(repo: Repository, company: Company | None) -> None:
    st.title("Investment Report")
    if not require_company(company):
        return
    figures = repo.get_figures(company.id)
    frame = figures_to_frame(figures)
    valuation = repo.get_state(company.id, "dcf_result", {})
    input_data = repo.get_state(company.id, "dcf_inputs", None)
    latest = repo.latest_agent_runs(company.id)
    outputs = {name: item["parsed_output"] for name, item in latest.items() if item.get("parsed_output")}
    thesis = generate_deterministic_thesis(company, periods_to_metrics(figures), valuation, outputs)
    if not figures:
        st.warning("The report can be generated, but it will identify historical data as missing.")
    docx = generate_docx(company, thesis, frame, valuation)
    pdf = generate_pdf(company, thesis, valuation)
    assumptions_frame = pd.DataFrame()
    forecast = pd.DataFrame()
    if input_data:
        try:
            dcf_inputs = DCFInputs.model_validate(input_data)
            assumptions_frame = pd.DataFrame({
                "year": range(1, len(dcf_inputs.revenue_growth) + 1), "revenue_growth": dcf_inputs.revenue_growth,
                "ebit_margin": dcf_inputs.ebit_margin, "tax_rate": dcf_inputs.tax_rate,
                "depreciation_pct_revenue": dcf_inputs.depreciation_pct_revenue,
                "capex_pct_revenue": dcf_inputs.capex_pct_revenue, "nwc_pct_revenue": dcf_inputs.nwc_pct_revenue,
            })
            forecast = calculate_dcf(dcf_inputs).forecast
        except ValueError:
            st.warning("Saved DCF assumptions are invalid; the workbook omits the forecast.")
    workbook = generate_excel(company, frame, assumptions_frame, forecast, valuation)
    st.write("Exports are generated from the currently saved figures and DCF result, with as-of date, currency, sources, and assumptions identified.")
    downloads = st.columns(3)
    downloads[0].download_button("Download DOCX", docx, f"{safe_name(company.name)}-research.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", width="stretch")
    downloads[1].download_button("Download PDF", pdf, f"{safe_name(company.name)}-research.pdf", "application/pdf", width="stretch")
    downloads[2].download_button("Download Excel model", workbook, f"{safe_name(company.name)}-valuation.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", width="stretch")


def prompt_lab_page(repo: Repository, company: Company | None) -> None:
    st.title("Prompt Engineering Lab")
    st.caption("Compare strategies on the same synthetic benchmark. Automated checks cover format and known facts; interpretation still requires human review.")
    tasks = known_answer_tasks()
    task_name = st.selectbox("Benchmark task", list(tasks))
    strategy = st.selectbox("Prompt strategy", STRATEGIES)
    spec = tasks[task_name]
    prompt = build_strategy_prompt(strategy, task_name, spec["context"])
    editable_prompt = st.text_area("Editable prompt", prompt, height=220)
    output = ""
    elapsed = None
    mode = AIMode(st.session_state.ai_mode)
    if mode == AIMode.LOCAL:
        if st.button("Run experiment", type="primary"):
            try:
                output, elapsed = ollama_client().generate(editable_prompt, json_mode=strategy == "Structured JSON generation")
                st.session_state["experiment_output"] = output
                st.session_state["experiment_elapsed"] = elapsed
            except RuntimeError as exc:
                st.error(str(exc))
    else:
        st.info("Paste an actual model response below. EquityLens does not claim to have run a model in this mode.")
    output = st.text_area("Generated or imported output", st.session_state.get("experiment_output", ""), height=220)
    elapsed = st.session_state.get("experiment_elapsed")
    if st.button("Evaluate and save", disabled=not output.strip()):
        metrics = evaluate_output(output, spec, strategy == "Structured JSON generation")
        metrics.update({"response_time": elapsed, "model": st.session_state.ollama_model if mode == AIMode.LOCAL else "Manual import", "source_citation_accuracy": "Human review required", "numerical_consistency": metrics["automated_term_accuracy"]})
        repo.save_experiment(company.id if company else None, strategy, task_name, editable_prompt, output, metrics)
        st.json(metrics)
    experiments = repo.get_experiments(company.id if company else None)
    if experiments:
        rows = [{"strategy": item["strategy"], "task": item["task"], **item["metrics"]} for item in experiments]
        history = pd.DataFrame(rows)
        st.subheader("Saved experiments")
        st.dataframe(history, width="stretch")
        if "automated_term_accuracy" in history:
            summary = history.groupby("strategy", as_index=False)["automated_term_accuracy"].mean()
            st.plotly_chart(px.bar(summary, x="strategy", y="automated_term_accuracy", range_y=[0, 1], title="Mean automated benchmark accuracy"), width="stretch")
        st.warning("Do not infer that one prompt strategy is generally superior from a single task or run.")


def settings_page(repo: Repository, company: Company | None) -> None:
    st.title("Settings")
    mode = st.selectbox("Operating mode", [item.value for item in AIMode], index=[item.value for item in AIMode].index(st.session_state.ai_mode))
    theme = st.selectbox("Interface theme", ["Dark", "Light"], index=0 if st.session_state.theme == "Dark" else 1)
    url = st.text_input("Ollama URL", st.session_state.ollama_url)
    model = st.text_input("Ollama model", st.session_state.ollama_model)
    timeout = st.number_input("Model timeout (seconds)", min_value=10, max_value=600, value=int(st.session_state.ollama_timeout))
    if st.button("Save settings", type="primary"):
        st.session_state.ai_mode = mode
        st.session_state.theme = theme
        st.session_state.ollama_url = url.rstrip("/")
        st.session_state.ollama_model = model.strip()
        st.session_state.ollama_timeout = int(timeout)
        st.rerun()
    client = OllamaClient(url, model, int(timeout))
    if st.button("Test Ollama connection"):
        models = client.models()
        if models:
            st.success("Ollama is available. Installed models: " + ", ".join(models))
        else:
            st.error("Ollama did not return any installed models. The offline analytics and manual workflows remain available.")
    st.subheader("Operating guarantees")
    st.markdown("- No paid API or API key is required.\n- Calculations, uploads, retrieval, reports, and exports work without a model.\n- Manual mode only prepares prompts and validates pasted responses.\n- The application never substitutes a fabricated AI response when Ollama is unavailable.")


def resize(values: list[float], length: int) -> list[float]:
    if not values:
        return [0.0] * length
    return (values + [values[-1]] * length)[:length]


def dcf_summary(result: Any) -> dict[str, Any]:
    return {
        "enterprise_value": result.enterprise_value, "equity_value": result.equity_value,
        "implied_share_value": result.implied_share_value, "terminal_value": result.terminal_value,
        "pv_terminal_value": result.pv_terminal_value, "upside_downside": result.upside_downside,
        "timing_convention": result.timing_convention,
    }


def ollama_client() -> OllamaClient:
    return OllamaClient(st.session_state.ollama_url, st.session_state.ollama_model, st.session_state.ollama_timeout)


def safe_name(name: str) -> str:
    return "-".join("".join(character.lower() if character.isalnum() else " " for character in name).split())
