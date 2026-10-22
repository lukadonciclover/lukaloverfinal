# Financial assumption analysis

## Workflow

1. Create/open a project and upload PDF, CSV or XLSX documents in Financial Data.
2. Historical suggestions remain in the existing financial approval queue. Guidance is kept in Assumption Analysis, separately from the ledger.
3. Review source excerpts, classification, period, scope, units and confidence. The comparison panel shows historical observations, management guidance and the current model input.
4. Select a model field (and a specific DCF year), enter a proposed value, confirm the application period and provide a rationale. Ranges have no default midpoint. Rates in this review use percentages; model rates remain decimals. Monetary proposals use actual project-currency units.
5. Preview one or several reviewed proposals, then confirm once. Invalid proposals are excluded from the batch preview; duplicate target fields block application until one source is selected. Only selected fields change. Disabled models remain disabled.
6. Existing model calculations recalculate when the corresponding enabled model page is opened. Use Results & Export for Excel output.

Accepted records preserve the original evidence, applied value, target, application period, rationale and timestamp. Later manual changes do not rewrite that history. Excel identifies current, superseded, disabled and inactive inputs.

Older projects remain compatible. Re-upload an older document to extract new assumption suggestions; the document identifier prevents duplicating its historical upload queue. No bundled data is created.

## Supported extraction

Deterministic parsing supports explicitly labelled revenue growth, revenue amounts, gross/EBITDA/EBIT margins, operating expense, depreciation, capex and working-capital ratios, tax and interest rates, borrowing, dividends, minimum cash, WACC components, terminal growth, exit multiples and fair-value adjustments. Capex budgets, EBITDA/cash-flow amounts, repayments, restructuring, savings and outlook statements can be retained as evidence even when there is no direct model mapping.

Source records distinguish historical reported data, management guidance, analyst assumptions, illustrative scenarios and approved-ledger derivations. Numeric ambiguity produces a manual-review candidate. Extraction confidence describes parsing quality, not financial reliability.

Structured long-format spreadsheets can use these columns:

`metric, period, value, minimum, maximum, unit, currency, unit_scale, classification, scope`

For percentage inputs, `unit` must be `percent`, `percentage`, `%`, or `decimal`, or the value must contain `%`. Decimal values are already fractions. Ranges can use `minimum`/`maximum` or a percent range in `value`. Use explicit ISO currency codes and positive scales for amounts. Structured forecast columns labelled with a year and `forecast`/`guidance` or `E`, and sheets labelled Guidance, are also recognized conservatively.

Fiscal years, calendar years, relative years, quarters, multi-year/CAGR periods, long-term targets and undated evidence are kept distinct. Consolidated and segment scope are preserved; unspecified scope requires review.

## Historical derivations

Only approved annual ledger observations are used. Currency must match the project, scales are normalized, duplicate observations are excluded, and denominators must be positive. Zero numerators remain valid.

- Revenue growth uses consecutive annual revenue observations.
- Gross, EBITDA and EBIT margins use their reported numerator divided by revenue.
- Capex uses the absolute expenditure amount divided by revenue, matching the existing financial engine convention.
- Depreciation and net working capital ratios use their explicitly reported ledger values.
- Effective tax uses `tax_expense / pretax_income`; it is labelled as reported effective tax, not cash or forecast tax.
- Dividend growth uses consecutive annual **per-share** dividends, never earnings or revenue growth.
- Absolute consolidated annual revenue guidance can produce a growth candidate only with one positive prior-year approved revenue observation in the same currency. Original amounts/ranges and the base calculation are retained; users must verify fiscal/calendar and accounting comparability.

Historical input changes make an old derived proposal ineligible until the recalculated observation is reviewed.

## Field mappings

| Evidence | Model targets |
|---|---|
| Revenue growth | Forecast growth; selected DCF revenue-growth year |
| Gross / EBITDA margin | Forecast gross / EBITDA margin |
| EBIT margin | Selected DCF EBIT-margin year |
| Operating expense ratio | Forecast operating expense ratio |
| Depreciation, capex, NWC ratios | Forecast ratio; selected DCF annual ratio |
| Tax rate | Forecast tax; selected DCF tax year; WACC tax |
| Interest, net borrowing, total dividends, minimum cash | Corresponding forecast input |
| WACC | Standalone DCF discount rate |
| Risk-free rate, beta, ERP, cost of debt, market equity/debt | Corresponding WACC input |
| Equity/debt weights | Paired WACC market amounts, only with an explicit verified total market capital value, matching application period and weights summing to 100% |
| Explicit terminal growth / exit multiple | DCF terminal growth / exit multiple (terminal method unchanged) |
| Per-share dividend, dividend growth, terminal dividend growth, cost of equity | Corresponding DDM input |
| Supported fair-value adjustments | Asset/liability adjustment fields |

Linked DCF inputs controlled by Forecasting or WACC cannot be overwritten through standalone DCF suggestions. Likewise, an EBITDA margin controlled by an operating expense ratio requires resolving that override first. Revenue growth never maps to terminal or dividend growth. Ordinary book values do not map to fair-value adjustments. Structured peer/transaction data continues through the existing Models import-and-review workflow.

## Privacy and export

Processing remains stateless and local to the existing backend; no paid AI, external inference or credentials were added. When source-text retention is off, persistence, portable backups and Excel requests remove excerpts while preserving permitted document references. The UI explicitly states when source text is unavailable.

The added **Assumptions & Sources** worksheet includes accepted records only, original values/ranges, applied/current values, classifications, period, document/page, review status and permitted excerpts. It compares each acceptance with active/effective model inputs rather than presenting old accepted values as current results. Existing formula sheets and recalculation behavior are preserved.

## Limitations and follow-up work

- Scanned PDFs require OCR, which is not included. Complex layouts, implicit units, cross-page context, unlabelled tables and ambiguous prose can require manual review or may yield no candidates.
- Direct annual adoption of quarterly, segment or multi-year/CAGR guidance is blocked. Independently normalized analyst inputs can still be entered in the existing model editors.
- The application does not infer fiscal/calendar equivalence, exchange rates, fair values, market prices or missing financial data.
- Model engines without a corresponding input retain an observation as evidence instead of inventing a mapping. Peers and transactions retain their separate reviewed import flow.
- Statistical forecasting, automatic source ranking, OCR and richer multi-period/segment reconciliation are potential future extensions, not implied features.

## Implementation and validation

New modules: `backend/equitylens/assumptions.py`, `backend/equitylens/assumption_export.py`, `frontend/lib/assumptions.ts`, `frontend/components/assumption-analysis.tsx`.

Integration changes: document extraction/API routes, upload component, Financial Data and model pages, workspace types/persistence, financial metric metadata, and Excel export. Core valuation/forecast calculation formulas and deployment configuration were not changed.

Modified integration files:

- `backend/app/main.py`
- `backend/equitylens/documents.py`
- `backend/equitylens/workbook.py`
- `frontend/components/document-upload.tsx`
- `frontend/components/pages/workspace.tsx`
- `frontend/components/pages/workbench.tsx`
- `frontend/lib/types.ts`
- `frontend/lib/workspace.tsx`
- `frontend/lib/bulk-approval.ts`
- `frontend/lib/financial-formatting.ts`
- `frontend/test/financial-presentation.test.tsx`

Regression tests: `tests/test_assumptions.py`, `frontend/test/assumptions.test.ts`, `frontend/test/assumption-review.test.tsx`; the Financial Data presentation test now distinguishes assumption derivation from financial-analysis requests. Coverage includes extraction, ranges, scales, classifications, periods, missing/zero inputs, conflicts, consent, atomic updates, manual-value preservation, privacy, backups, project isolation, source traceability and Excel.

Validation completed: `npm run check` passed with 74 tests across 13 files; the complete Python suite passed with 68 tests. The Python run reported one existing Starlette/httpx deprecation warning. The production build passed. An isolated Chrome session verified clean project creation, CSV upload, explicit adoption, persisted model input after save/reload, excerpt redaction, disabled-model preservation, and desktop/mobile layouts without page overflow or JavaScript errors. Local verification servers and temporary QA files were removed afterward. Nothing was deployed.
