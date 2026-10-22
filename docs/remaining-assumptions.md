# Remaining forecast and valuation assumptions

Implemented October 23, 2026. This extends the historical-prefill system; the definitions below supersede the original fallback limitations in historical-prefill.md.

## Supported calculations

- Effective tax: reported pretax income takes priority. Otherwise, net income plus tax is accepted with explicit zero discontinued-operations, noncontrolling-income and other tax reconciliation records. Alternatively, the complete EBIT less borrowing interest and nonoperating expenses plus nonoperating income bridge is used. Positive pretax income and a rate between 0% and 100% are required. Annual observations are averaged; the UI identifies this as historical effective tax, not forecast cash tax.
- Operating NWC: accounts receivable + inventory + prepaid expenses + other operating current assets - accounts payable - accrued operating liabilities - other operating current liabilities. Every category must be recorded, including confirmed zeros. Cash and debt are excluded. An explicit reported operating-NWC balance takes priority. The same component-derived opening balance feeds integrated forecasting and its Excel formulas without modifying the approved ledger.
- Implied borrowing rate: borrowing interest divided by average consecutive beginning/end interest-bearing debt. Debt must be positive, interest nonnegative, and the rate no greater than 100%. A greater-than-25% change in debt excludes the observation and requests a reviewed weighted-average rate. Financial Data includes an explicit definition confirmation; net interest and total financing costs are not treated as borrowing interest.
- Reported borrowing/dividend amounts can be offered for explicit adoption as policy references; they never automatically overwrite policy zeros or populate an empty policy field.

All derived references retain their original ledger observations, currency, scales and periods. Definition-note changes invalidate historical references. Missing or invalid data produces actionable explanations rather than inferred zeros.

## Input behavior

Profitability Forecast Method explicitly selects EBITDA margin or operating expenses/revenue. Both saved inputs are retained; only the active driver is sent to the model. Legacy projects infer their existing active driver from the old opex override. Switching to an incomplete opex model blocks calculation instead of silently falling back to EBITDA. The expense definition must exclude depreciation to qualify for historical autofill; depreciation remains a separate deduction.

Rate inputs in Forecasting, DCF, WACC, DDM, scenarios and DCF shortcuts use percentages. For example, typing 5.5 stores 0.055. Existing values display at three decimal places without rounding stored values, API inputs or Excel assumptions. Focus/blur alone does not write back. Financial amounts, quantities and multiples retain their original units.

Fields identify historical sources, management guidance, analyst edits, model defaults, inactive drivers or missing support. Policy zeros explain their meaning. The operating coverage summary excludes optional financing policies and the inactive profitability driver; manual edits reduce the historical-source count without being counted as missing. Review Missing Inputs links to the first applicable blank field. Existing Assumption Analysis remains available for reviewed guidance and explicit adoption.

## Changed files

- Backend: `reference_derivations.py`, `historical_references.py`, `documents.py`, `workbench.py`, `workbook.py` under `backend/equitylens/`.
- UI: `assumption-number.tsx`, `financial-ledger.tsx`, `historical-reference-controls.tsx`, `assumption-shortcuts.tsx`, `pages/workbench.tsx` under `frontend/components/`.
- State and metadata: `assumption-status.ts`, `historical-references.ts`, `assumptions.ts`, `workbench.ts`, `workspace.tsx`, `fingerprint.ts`, `financial-formatting.ts` under `frontend/lib/`.
- Tests: new `tests/test_reference_derivations.py` and `frontend/test/assumption-inputs.test.tsx`; existing historical-reference, historical-controls, lifecycle and bulk-workflow tests updated.

## Verification

Story: approved financial records flow through historical reference APIs into editable percentage assumptions, then linked forecast/DCF calculations and Excel export.

| Boundary | Evidence |
| --- | --- |
| Browser and approval | Isolated Chrome created a test project, uploaded 108 synthetic records, approved them and confirmed expense definitions. |
| API and historical references | Financial analysis returned successfully; eight applicable operating assumptions populated, including 20% effective tax and 5% implied borrowing rate. |
| Inputs and calculation | Both profitability methods were exercised; a manual 5.5% growth input produced the expected linked forecast revenue and a valid DCF response. |
| Export | Browser downloaded equitylens-valuation.xlsx successfully. Regression checks inspect component-derived opening NWC formulas and unrounded input precision. |
| Persistence and refresh | Manual 5.5% growth survived suggestion refresh and project reload. |
| Responsive UI | Desktop and mobile screenshots inspected; no browser JavaScript errors or horizontal page overflow after responsive layout transition. |

Frontend typecheck and 97 tests pass. Backend suite: 83 tests pass, with one existing Starlette/httpx deprecation warning. Production build passes.

## Remaining evidence requirements

Nonzero tax reconciliation differences require reviewed compatible pretax income; the system does not guess their scope or tax allocation. Missing NWC categories and material intra-year debt changes require reviewed inputs. WACC components, terminal growth, exit multiples and fair-value adjustments are not inferred from ordinary financial statements. Historical borrowing rates remain indicators rather than contractual or future rates. Saved older references can be refreshed with Recalculate Historical Suggestions.

No deployment configuration was changed, no user projects were removed, and nothing was deployed. Synthetic data was restricted to regression tests and an isolated browser session.
