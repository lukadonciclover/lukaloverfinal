# Release 1: Financial accuracy and data integrity

Implemented in the existing application. No deployment or production data changes.

## Issues identified and safeguards

- Mixed annual and quarterly ledgers previously allowed the latest quarter to become a relative-valuation target or forecast opening period. Annual forecasts and linked DCF now use annual opening statements. Growth series, charts, tables and latest ratio cards respect reporting frequency; annual CAGR excludes quarterly rows and known calendar changes.
- TTM flow metrics now require exactly four consecutive, nonoverlapping standalone quarters, compatible currency, explicit start/end dates and a consistent fiscal calendar. Units are normalized, source observations retained, and missing/duplicate/YTD/overlapping inputs rejected. Stocks are not summed. P/B requires a dated balance-sheet observation.
- Comparables and transactions carry reporting basis, denominator period, end date, measurement date and explicit analyst review. Annual, TTM and reviewed forward target selection is visible. Forward years must match. Selected unverified or incompatible observations cannot produce a valuation.
- Repeated imports previously could add duplicate weighting. Import preview now distinguishes new records, duplicates and conflicts, including conflicting dates or financial values. New records are unselected and unreviewed; replacement requires explicit confirmation. Duplicate selected observations are also rejected by the backend. Transaction IDs or company/acquirer/acquisition-date identity preserve distinct legitimate deals.
- Source deletion previously could leave adopted values apparently verified. The confirmation lists affected figures, suggestions, historical references and active adoptions. Deletion invalidates analysis/results, removes source evidence, retains adopted numerical values and flags them for review. Analysts can explicitly retain a value as an analyst assumption, adopt a new source, or clear the affected field. Unresolved active dependencies block calculations/export. Audit history distinguishes removed, superseded, reviewed and cleared values without preserving removed excerpts.
- Pending uploads, peer previews, export responses and reset confirmations now carry project/revision guards or cancellation. Switching peer datasets also discards previews. Reset is explicitly named **Reset to Page-Opening Snapshot** and restores only that project's captured model inputs, with current-versus-opening values visible. Existing project-bound provider updates and AppShell remount isolation are preserved.

## Excel and financial behavior

Excel target sheets identify basis, period, balance date and source observations. TTM targets link to the four original historical quarters through formulas. Invalid peer selections do not populate valuation statistics. Removed-source audit records cannot be represented as verified evidence.

Previously accepted quarterly-as-annual targets, incomplete TTM, unreviewed peer bases, duplicate selected observations and unresolved removed-source assumptions are now withheld. Existing saved records are retained for review. The underlying DCF discounting, forecast financial arithmetic, DDM, asset valuation and valid peer-multiple formulas were preserved; period selection and validation determine which inputs may reach them.

## Validation

- Frontend typecheck and all **107 tests** passed (19 files).
- Backend **100 tests** passed, including Excel formula recalculation and existing model regressions.
- Requested uv execution passed: `uv run --locked pytest -o addopts='' -p no:cacheprovider --basetemp=.release-test-temp`. The ordinary uv invocation encountered Windows permissions on the shared pytest temporary directory; the dedicated workspace directory avoided it.
- Production frontend build passed.
- Isolated Chrome + real local API: clean empty dashboard, project creation, financial CSV upload, five-record bulk approval, annual/quarterly views, verified four-quarter TTM, reviewed peer import, USD 400,000 TTM revenue at 10x yielding USD 4,000,000, duplicate re-import without a second row, Excel download and source deletion dependency/review states.
- Downloaded Excel target formula inspected: four SUMIFS terms reference Q1 through Q4 in Historical statements.
- Regression tests cover missing quarters, duplicate quarters, dates/calendars/currencies, YTD rejection, short fiscal years, annual forecast isolation, forward basis, duplicate peers/distinct deals, source invalidation/retention/privacy/review/export, stale reset revisions, late project-A uploads after switching to B, dataset-switch previews and frequency-specific ratio cards.
- Added GitHub Actions frontend check/build and backend uv tests. Remote CI has not been run in this session.

## Remaining limitations

- TTM supports four standalone quarters, not a latest annual plus current YTD minus prior YTD reconstruction. Undated legacy quarters need explicit metadata before TTM becomes available.
- Existing annual labels remain usable as annual observations when dates are absent; supplied dates are validated. Fiscal metadata cannot be inferred reliably from year labels.
- Imported peer denominator completeness is explicitly reviewed by the analyst; an aggregate peer record cannot independently prove its underlying statements. No currency conversion or market-data lookup is performed.
- Legacy peer records remain saved but require reporting basis/date review before inclusion. Ambiguous legacy document-name associations block deletion rather than guessing ownership.
- Source invalidation is deliberately conservative for active models. Clearing a dependency may expose other missing required inputs; it does not fabricate replacement values.
- Browser verification used disposable synthetic projects. Existing project preservation and cross-project pending actions were exercised with automated tests, without opening production user data.
- One existing Starlette/httpx deprecation warning remains; it does not fail tests.

## Files modified or created

- `.github/workflows/financial-integrity.yml`
- `backend/app/main.py`
- `backend/app/schemas.py`
- `backend/equitylens/assumption_export.py`
- `backend/equitylens/documents.py`
- `backend/equitylens/financials.py`
- `backend/equitylens/models.py`
- `backend/equitylens/peer_integrity.py`
- `backend/equitylens/periods.py`
- `backend/equitylens/workbench.py`
- `backend/equitylens/workbook.py`
- `frontend/components/assumption-shortcuts.tsx`
- `frontend/components/document-upload.tsx`
- `frontend/components/financial-ledger.tsx`
- `frontend/components/historical-reference-controls.tsx`
- `frontend/components/pages/financials.tsx`
- `frontend/components/pages/workbench.tsx`
- `frontend/components/pages/workspace.tsx`
- `frontend/components/source-review.tsx`
- `frontend/lib/assumption-status.ts`
- `frontend/lib/assumptions.ts`
- `frontend/lib/bulk-approval.ts`
- `frontend/lib/fingerprint.ts`
- `frontend/lib/historical-references.ts`
- `frontend/lib/peer-import.ts`
- `frontend/lib/source-dependencies.ts`
- `frontend/lib/types.ts`
- `frontend/lib/workbench.ts`
- `frontend/lib/workspace.tsx`
- `frontend/test/bulk-workflows.test.tsx`
- `frontend/test/financial-presentation.test.tsx`
- `frontend/test/release-fixture.ts`
- `frontend/test/release-integrity.test.ts`
- `frontend/test/release-isolation.test.tsx`
- `tests/test_release_integrity.py`
- `tests/test_workbench.py`
- `docs/release-1.md` (this report)
