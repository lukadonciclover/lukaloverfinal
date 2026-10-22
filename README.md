# Equity Lens

A dedicated financial modeling and equity valuation workbench. Built on the existing Next.js, React, Tailwind, Recharts and FastAPI application. Calculations are deterministic Python; no LLM, market-data service or investment recommendation engine is used.

## Run locally

Requirements: Node.js 24 and Python 3.12?3.14.

```sh
cd backend
uv sync --group dev
uv run uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```sh
cd frontend
npm ci
```

Set `BACKEND_URL=http://127.0.0.1:8000` in `frontend/.env.local`, then run `npm run dev`. The frontend proxies requests to the stateless backend. Existing deployment configuration has not been changed; nothing is automatically deployed.

## Workflow

1. **Dashboard**: create a company valuation project or reopen an existing project using the compact selector.
2. **Financial Data**: enter company metadata, upload PDF/CSV/XLSX statements, and maintain the financial ledger. Review and correct extraction suggestions, then explicitly approve the period, currency and scale. Suggestions never enter calculations before approval.
3. **Financial Analysis**: examine historical tables, growth/CAGR, margins, returns, leverage, cash conversion, working capital and cash-flow charts. Missing observations remain unavailable.
4. **Forecasting**: enable a 3-, 5- or 10-year integrated forecast. Supply opening balances and edit operating, reinvestment, debt, interest, dividend and cash assumptions. Actual and forecast tables remain separate.
5. **Valuation Models**: independently enable DCF, trading comparables, precedent transactions, DDM or adjusted net assets. Use explicit equity-bridge inputs and actual diluted share counts. WACC can be entered manually or calculated from CAPM and market capital weights.
6. **Results & Export**: compare model values, football-field ranges, scenarios and sensitivity grids. Download a formula-linked XLSX or a portable JSON project backup.

All model assumptions are editable. Preset rates are labeled assumptions, not extracted company facts. No model is enabled by default in a new project. Changes immediately hide old results and trigger a debounced recalculation; late responses cannot overwrite current results.

## Data conventions

Historical ledger values retain their original currency, fiscal period, unit scale, source document/page and source excerpt. Analysis normalizes mixed scales; workbench calculations and charts use actual currency units. A value of 100 with scale 1,000 means 100,000. Share counts are actual shares, not thousands or millions. Cross-currency inputs are rejected: convert values consistently yourself and retain the conversion basis in notes.

Recommended long-form CSV / Excel columns:

```csv
metric,period,value,currency,unit_scale
revenue,2024,100,USD,1000000
revenue,2025,120,USD,1000000
ebitda,2025,24,USD,1000000
```

Wide tables with fiscal-year headers are also supported. PDFs use deterministic text/table extraction; scanned PDFs require external OCR. Extraction is conservative and may need manual correction. Undetected units start as an **unconfirmed suggestion** of 1: the approval dialog requires confirmation against the source. Upload limits remain 4 MB and 100 PDF pages.

Supported ledger metrics cover revenue, COGS, gross profit, operating expenses, EBITDA, depreciation/amortization, EBIT, interest, taxes, net income, cash, receivables, inventory, current assets/liabilities, PP&E, total assets/liabilities, payables, short/long-term debt, equity, NWC, operating/investing/financing cash flow, capex, FCF and changes in working capital.

Peer/transaction CSV and Excel imports require `company,currency,unit_scale`; optional columns are `market_cap,enterprise_value,debt,cash,revenue,ebitda,ebit,net_income,book_equity,acquisition_date`. Imported rows are unselected until reviewed. Transactions require an acquisition date. Multiples with missing or non-positive denominators are excluded. Trading and transaction pools are never combined.

## Modeling conventions

- Forecast revenue grows from the latest approved annual revenue. Gross margin sets gross profit; either EBITDA margin or an explicit opex/revenue override sets operating expenses. D&A, capex and NWC use revenue ratios.
- Opening forecast requirements: revenue, cash, total assets/liabilities/equity, short- and long-term debt, net working capital and PP&E. Opening assets must equal liabilities plus equity.
- NWC represents net operating assets. Other assets and non-debt liabilities remain constant. Debt changes by the explicit net-borrowing assumption and disclosed year-end revolver draws. Interest uses opening debt. Dividends reduce cash and equity. With financing disabled, a cash shortfall blocks the forecast. The balance check should remain zero.
- FCFF = EBIT minus cash taxes on operating profit + D&A ? capex ? change in NWC. By default, operating losses do not create immediate tax benefits. Integrated DCF assumptions link to the forecast; standalone DCF allows annual overrides. Blank standalone opening NWC explicitly uses base revenue ? first-year NWC ratio.
- DCF uses year-end discounting. Terminal value is either final FCFF ? (1+g)/(WACC?g), or final EBITDA ? exit multiple, discounted from the last forecast year. Growth must be below positive WACC. EV converts to equity through cash ? debt ? minority interest + non-operating assets. Negative FCFF/equity values are preserved; missing shares leave per-share results unavailable.
- WACC uses CAPM cost of equity and after-tax debt cost with market equity/debt weights. DDM uses cost of equity, with Gordon or a high-growth dividend stage followed by perpetual growth. Asset valuation distinguishes book equity from adjusted NAV.
- Peer median/average/min/max statistics support six trading multiples and three EV transaction multiples. EV-based ranges require cash/debt bridge inputs. Ratios are invariant to scale only when each row uses a consistent scale across all monetary fields.
- ROA/ROE use average assets/equity. ROIC uses ending invested capital (debt + equity ? cash) and a usable historical tax rate inferred from tax expense / pretax income. Growth with a non-positive prior value is unavailable. Net debt is interest-bearing debt less cash. Capex cash outflows normalize to positive amounts.
- Bear/base/bull adjustments and all three sensitivity grids call the same DCF engine. Invalid cells remain unavailable. Scenarios express assumption differences, not probabilities. Multiples ranges reflect selected observations, not confidence intervals. Valuation methods have distinct economic bases and should not be treated as interchangeable.

The FCFF/WACC and dividend-discount conventions follow [Damodaran's valuation notes](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/val.html). Loss-tax treatment and financing policies are explicit simplifying assumptions of this application.

## Excel model

The workbook includes historical statements/sources, forecast assumptions, projected statements, WACC, DCF, peers, transactions, DDM, adjusted assets, scenarios, sensitivity tables and a valuation summary. Inapplicable models are marked not completed. Shared equity-bridge inputs feed every relevant valuation. Formulas are live: changing operating rates, WACC, model assumptions or peer inputs recalculates dependent values in compatible Excel applications. Source strings are escaped to prevent formula injection.

Blue = hardcoded numeric assumptions; black = formulas within a sheet; green = cross-sheet formulas. Hidden sensitivity schedules are auditable by unhiding their tabs. All formulas are acyclic. The exported forecast horizon is fixed to the selected number of years; re-export to change its length. DDM horizons can change within the exported ten-year schedule. Structural changes such as adding new historical metrics or peer rows should be made in the application and re-exported. Excel is configured to recalculate on opening; viewers without calculation support may show blank formula caches.

Tests evaluate the generated formulas independently with the `formulas` package and reconcile DCF, WACC, DDM, assets, peer/transaction valuations, all scenarios/sensitivities and balance checks. They also modify an exported growth assumption and verify recalculation against the application.

## Architecture and storage

- `frontend/components/pages/workbench.tsx`: forecast, model, dashboard and result screens.
- `frontend/components/pages/financials.tsx` and `workspace.tsx`: reused ledger, review, upload, project and historical analysis UI.
- `frontend/lib/workbench.ts`: typed assumptions and API payload construction.
- `frontend/lib/workspace.tsx`, `storage.ts`: existing version-2 project persistence, migration and JSON backup.
- `backend/equitylens/financials.py`, `valuation.py`: retained and extended financial calculations.
- `backend/equitylens/workbench.py`: validated model inputs, forecast statements, normalization, models, scenarios and sensitivities.
- `backend/equitylens/workbook.py`: live Excel model generation.
- `backend/equitylens/documents.py`: deterministic extraction and source locators.
- `backend/app/main.py`: stateless document, analysis, valuation and export endpoints.

New API endpoints: `POST /v1/workbench/calculate`, `/v1/workbench/export`, and `/v1/workbench/import-peers`. Document processing and historical analysis APIs remain available. Removed research, chat, prompt, evidence-scoring, thesis, inference and research-report endpoints return 404.

Projects remain browser-local. Source-text retention is opt-in in Financial Data. Portable project JSON backups retain old workspace fields for compatibility, but those fields do not drive new calculations. The legacy SQLite repository/schema is preserved; no production database structures or data are deleted. See [MIGRATION.md](MIGRATION.md).

## Validation

```sh
cd backend
uv run pytest
cd ../frontend
npm run check
npm run build
```

The full suite covers missing inputs, non-positive denominators, currency/scale mismatches, losses, negative equity, missing shares, forecast horizons, optional models, source review, API integration, formula reconciliation, persistence and stale UI results. Tests for retired workflows were replaced with valuation workflow tests.

Visual browser verification requires a connected browser; this implementation session had none. Component tests and live HTTP checks through the Next.js proxy were executed. No production deployment was performed.
