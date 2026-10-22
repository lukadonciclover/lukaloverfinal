# Financial analysis recalculation and historical inputs

## Diagnosis and changes

Financial Analysis needed a single request lifecycle for manual calculation and debounced automatic updates. Requests now have cancellation, duplicate-request protection, and project/currency/financial-input guards. Saving a result does not schedule another calculation. The interface reports progress, completion time, current/stale results, and actionable errors; missing ratios include input-specific explanations.

The financial fingerprint covers calculation inputs rather than row order or private source text, so privacy redaction and reload do not invalidate unchanged calculations. Snapshots retain their currency and display scale.

Browser verification also found that DCF requests sent stale nested cash/debt values instead of the shared equity bridge. The request adapter now sends current bridge values. Workbench transport accepts blank linked DCF inputs, resolves enabled forecast/WACC links, then applies the existing strict DCF validation. Valuation mathematics is unchanged.

## Historical references

References use arithmetic means of annual observations in the latest 3 reporting periods by default, with 2/3/5-period controls. Each reference records its actual observation count, periods, original ledger inputs, and source evidence. Duplicate observations, currency mismatches, invalid denominators, and unsupported periods are excluded rather than fabricated. Units are normalized before calculation.

Supported references include revenue growth; gross, EBITDA and EBIT margins; compatible operating expense ratios; depreciation, capex and operating NWC ratios; effective tax rates; and available dividend growth. Latest annual balances supply base revenue, opening operating NWC, cash, debt, book assets/liabilities and reported dividends where supported.

Forecast and standalone DCF inputs receive supported values only when blank. Existing values, including zero, remain unchanged. Manually editing or clearing an automatically populated field marks it as user-modified. Recalculation updates suggestions without replacing saved assumptions. Restoring a historical value requires confirmation for that individual field. Models are not automatically enabled.

Historical sources and adoption records reuse Assumption Analysis and appear in Excel audit exports. Persistence retains the references and manual-edit markers while respecting source-text privacy settings.

## Boundaries

- WACC, beta, terminal growth and exit multiples require reviewed inputs; historical statements do not invent them.
- Operating NWC requires an explicit supported metric; current assets minus current liabilities is not substituted.
- Operating expenses are auto-filled only when their depreciation treatment is compatible with the model. EBITDA margin takes precedence when supported.
- Reported effective tax is a starting reference, not an assertion about future cash taxes.
- Interest, financing and other unsupported forecast assumptions remain user inputs. Integrated forecast linking remains an explicit choice.

## Main implementation files

- `frontend/lib/use-financial-analysis.ts`, `fingerprint.ts`: calculation lifecycle and identity.
- `frontend/components/pages/financials.tsx`: status, stale results and missing-input explanations.
- `backend/equitylens/historical_references.py`: annual averages and latest balances.
- `backend/app/main.py`, `schemas.py`: analysis and historical-reference APIs.
- `frontend/lib/historical-references.ts`, `assumptions.ts`, `workspace.tsx`, `types.ts`: prefill, audit and persistence.
- `frontend/components/historical-reference-controls.tsx`, `pages/workbench.tsx`: review, edit and restore controls.
- `frontend/lib/workbench.ts`, `backend/equitylens/workbench.py`: linked-input and bridge resolution.
- `backend/equitylens/assumption_export.py`, `workbook.py`: source audit export.

## Validation

- Frontend `npm run check`: typecheck and 92 tests passed across 16 files.
- Frontend production build passed.
- Backend pytest: 78 tests passed; one existing Starlette/httpx deprecation warning.
- Regression coverage includes request races, project switches, stale responses, retries, averages, invalid data, blank-only fills, zero/manual preservation, single-field restoration, reload, privacy, linked DCF equivalence and Excel export.
- Isolated Chrome end-to-end verification: create project, upload and approve 72 synthetic test records, calculate/recalculate analysis, populate forecast and DCF inputs, edit a forecast assumption, calculate DCF with explicit discount/terminal inputs, reload and retain the manual edit. No JavaScript errors or mobile horizontal overflow.

Synthetic data was restricted to tests and an isolated browser session. No existing user projects were removed, deployment configuration was unchanged, and nothing was deployed.
