# Release 2: Workflow, performance and user experience

Implemented on Release 1 commit `62615e5` on 23 October 2026. The local checkout was initially behind GitHub main; it was fast-forwarded to the existing Release 1 before adapting these changes. Existing projects, storage formats and project identifiers were retained. No production deployment was initiated.

## Implemented workflow

### Dashboard and readiness

- Seven deterministic workflow categories: Company Information, Financial Data, Financial Analysis, Forecasting Assumptions, Financial Forecast, Valuation Models, Results & Export.
- Company/ticker/currency, latest approved annual period, approved observation and pending-suggestion counts, analysis currency/fingerprint freshness, active methods and save status.
- Explanations distinguish complete, review, missing inputs, recalculation, validation blocks and optional disabled models. No investment-quality score or arbitrary readiness percentage.
- Continue Working chooses the next applicable incomplete stage. Data and assumption actions open the corresponding internal section. Comparable/transaction/DDM/asset model errors link to their model tabs.
- Readiness uses Release 1 operating assumption status, historical references, active removed-source blocks and current backend validation outputs. It checks ledger duplicates/currencies/period labels and peer duplicate/reporting-basis review. It never calculates backend models merely to render the dashboard, and never treats a stale cached result as current.
- A successful model export records an optional receipt covering both financial inputs and source audit. Changed inputs or adoption provenance invalidate export completion.

### Financial Data and project actions

- Four internal sections: Company Information, Upload Documents, Financial Figures, Assumption Analysis.
- Approved Figures/Pending Review distinction within Financial Figures, reusing the existing ledger, extraction review, bulk approval, unit confirmation, spreadsheet paste, bulk edit/delete and source traceability.
- Existing `#assumption-analysis` links remain supported; `#company`, `#upload`, `#figures` and `#pending` provide stable entry points.
- Company edits remain in workspace state when switching sections. Upload queues remain mounted when switching internal sections.
- Compact Project Actions section retains create, duplicate, archive/restore and JSON backup. Rename uses a labeled form rather than a browser prompt.
- Existing source deletion confirmation, dependency preview, stale revision checks and removed-source review are preserved.

### Unified assumptions and forecasting

- Unified driver table shows historical averages/references, management guidance, current inputs, source/period and existing assumption status explanations.
- Select All Eligible, Deselect All, Fill All Empty Fields, selected historical adoption, selected reviewed-guidance adoption and conflict filtering.
- Uses existing `historicalCandidates`, `proposalError`, `conflictsFor` and `applyProposals`; no duplicate assumption engine or new financial derivation formulas.
- Confirmation previews existing and proposed values. Batch adoption uses one controlled update and the existing revision guard/provenance ledger. Empty-field filling preserves analyst edits, confirmed zero values and previously modified adoption records.
- Only accepted, compatible, unambiguous point guidance is eligible for one-click adoption. Ranges require explicit point selection in the existing source-review editor below the unified table. Conflicts are never resolved by choosing a midpoint or source implicitly.
- Historical data never supplies unsupported WACC/terminal-growth values.
- Forecast Configuration, Operating Assumptions and Projected Financial Statements are collapsible sections. Percentage input behavior and the selected EBITDA/operating-expense profitability driver remain unchanged.
- Optional comparison shows latest historical ratio, average, selected forecast value and difference. Deviations of at least ten percentage points are labeled for review, with no enforced forecast limit or automatic adjustment.

### Uploads

- Existing sequential queue now distinguishes Waiting, Uploading, Processing, Processed Successfully, Failed and Cancelled, with file sizes, queue completion and returned extraction warnings.
- XMLHttpRequest reports completion of the actual transfer. Processing uses an indeterminate indicator; no fictitious extraction percentage is shown.
- Failed-file retry and queue cancellation preserve Release 1 project-bound updates, abort guards, record identifiers and assumption-source metadata. Currency changes also cancel an active queue.
- Duplicate returned document identifiers retain existing figures, suggestions and review decisions. Deleted sources can be uploaded again.
- Unsupported/empty/oversized files, network interruption, timeout, invalid currency, damaged/password-protected PDFs and empty-text extraction have actionable messages.
- Scanned/blank PDFs preserve the existing successful inspection-with-warning contract: no financial figures/guidance are invented, and the warning explains that OCR is unavailable.
- The 4 MB/100-page limits remain. Large-document instructions explain splitting relevant pages or importing structured financial tables. Only the uploaded scope is extracted.

### Saving and backups

- Global Saving/Saved Locally/Save Failed/Storage Unavailable presentation. Saved is shown only when the current portfolio has actually been persisted, including IndexedDB fallback behavior.
- Older save completions cannot publish success/failure for a newer portfolio. Stale failed IndexedDB writes cannot overwrite newer fallback data.
- Browser-local/no-device-sync explanation and dismissible backup reminder. Downloads require user action; financial data is never sent to an external backup service.
- JSON import validates size/schema and previews the project name before confirmation. Confirmation creates a separate project and displays success; existing projects remain intact. Source metadata, assumption adoptions, privacy behavior and removed-source status survive supported backup imports.

## Calculation performance

The calculation API accepts explicit `?mode=core` or `?mode=extended`. The default remains extended for backward compatibility.

- Core calculates the integrated forecast, enabled primary methods and their validation; it omits scenarios and sensitivity grids.
- Forecasting and Valuation Models request core. Results & Export requests extended. Excel always uses the complete backend export/evaluation path, independently of the browser's last mode.
- A 350 ms debounce coalesces rapid financial edits. Abort signals, exact financial-payload keys and project identifiers prevent stale/cross-project responses.
- A bounded provider-owned memory cache retains at most ten project results. Extended results satisfy identical core requests. Unrelated company-note changes do not trigger calculations. Cache data is neither persisted nor stored in a shared server cache.
- Growth/exit sensitivity grids reuse the unchanged operating FCFF schedule. Operating growth/margin sensitivities continue to calculate their own schedules. Discounting, terminal methods, equity bridge, scenario definitions and nonfinite-output validation are preserved.

Representative synthetic five-year model with forecast, WACC, DCF and other enabled methods; local Python measurements, 100 evaluations per mode:

| Evaluation | Mean time |
| --- | ---: |
| Original full schedule evaluation for every sensitivity cell | 28.629 ms |
| Optimized extended evaluation | 11.511 ms |
| Core evaluation | 0.507 ms |

Extended evaluation is approximately 2.5 times faster; core is approximately 56 times faster than the previous full evaluation. These are local calculation timings, not HTTP, network or production latency guarantees. The earlier untouched Release 1 baseline averaged 28.79 ms over 30 runs.

Additional component measurements from the same benchmark (prepared, prevalidated candidates; request parsing excluded): primary DCF 0.348 ms, three scenario DCFs 1.040 ms, the two rate sensitivity grids 0.662 ms, and the operating sensitivity grid 8.665 ms. Components were measured separately and are not an additive latency budget.

`cd backend && uv run --locked python benchmark_release_2.py` reproduces the comparison. The reference forces every sensitivity candidate through the original full DCF schedule. CI logs this benchmark without absolute timing assertions.

Automated request-count test: four rapid financial edits produce one core request, an unrelated notes edit produces zero additional requests, requesting extended analysis produces one additional request, and returning to core reuses the extended result without another request.

## Verification

- `cd frontend && npm run check`: **128 tests passed in 22 files**, including typecheck.
- `cd frontend && npm run build`: production build passed.
- `cd backend && uv run --locked pytest`: **109 tests passed**, including the original Release 1 financial-integrity suite and Excel formula recalculation.
- `git diff --check`: passed.
- Existing GitHub Actions frontend check/build and backend uv regression jobs retained; added informational synthetic benchmark. Remote CI was not triggered in this session.
- New frontend tests cover empty/pending/approved ledgers, stale/current financial analysis, missing assumptions/WACC, validation errors, incompatible peers, removed-source backup round trips, full-workflow export completion, data/model deep links, rename form, confirmed adoption, guidance ranges, debounced/cached requests, save failures, upload stages/cancellation and unsupported-file recovery.
- New backend tests compare every sensitivity cell against full DCF for 3/5/10 years and both terminal methods at tight numerical tolerances. They verify core/extended primary-output equality, backward-compatible default mode, invalid-mode rejection, source blocking and PDF errors/warnings.
- Real local API + isolated Chrome: created a disposable synthetic project, uploaded financial CSV, confirmed units, approved ten observations, calculated historical analysis, adopted historical growth with confirmation, calculated DDM at USD 28.924237799672152/share, downloaded Excel, exported JSON, previewed/imported it as a second project, and opened dashboard readiness. No JavaScript page errors.
- Desktop (1440px), tablet (768px) and mobile (390px) checked. Financial table view has no page-level horizontal overflow at tablet/mobile sizes. Removed an animated content offset that temporarily pushed mobile navigation outside the viewport. Tables retain internal scrolling.

## Preserved Release 1 safeguards

The original 107 frontend and 100 backend tests remain, with navigation/status expectations updated where the UI changed. No financial integrity assertions were removed. TTM quarter/date/calendar requirements, annual forecast isolation, incompatible/duplicate peer rejection, source-deletion dependency review, project isolation, input provenance, privacy redaction and formula-linked workbook behavior remain covered and functional. DCF, WACC, trading comparables, precedent transactions, DDM, asset-based valuation, scenarios and sensitivities remain available. No financial formula defect was assumed or changed.

## Limits and operational notes

- Calculation cache is session memory. Reloading/restoring a project can require recalculation before the dashboard confirms model readiness. Dashboard display does not silently run valuations.
- Historical/TTM/peer/source financial validation remains authoritative in the existing backend. Before a current evaluation exists, readiness conservatively requests calculation rather than claiming numerical validity from populated fields.
- PDF page selection, automatic splitting, OCR and server-side segmentation are not implemented. The supported incremental large-file workflow is relevant-page splitting outside the application or structured table import; original page mapping must be recorded by the analyst.
- Guidance ranges and ambiguous/conflicting sources require the existing detailed review workflow. The unified table deliberately does not invent point values or scenario treatment.
- Backup reminders are dismissible for the current mounted project session, rather than a new persisted reminder preference. Storage remains browser-local and subject to browser quotas/eviction.
- Benchmarks exclude hosting/network latency; CI does not assert absolute times. Existing Starlette/httpx and PyMuPDF deprecation warnings remain non-failing.
- Browser verification used disposable synthetic data in an isolated browser profile. No production user projects or documents were opened or changed. No paid AI service or third-party document upload was introduced.

## Files created

- `docs/release-2.md`
- `backend/benchmark_release_2.py`
- `frontend/components/valuation-readiness.tsx`
- `frontend/components/unified-assumption-review.tsx`
- `frontend/components/forecast-comparison.tsx`
- `frontend/components/project-save-status.tsx`
- `frontend/lib/valuation-readiness.ts`
- `frontend/lib/calculation-cache.tsx`
- `frontend/lib/use-model.ts`
- `frontend/lib/export-fingerprint.ts`
- `frontend/test/release-2-readiness.test.ts`
- `frontend/test/release-2-workflows.test.tsx`
- `frontend/test/release-2-reliability.test.tsx`
- `tests/test_release_2.py`

## Files modified

- `.github/workflows/financial-integrity.yml`
- `backend/app/main.py`
- `backend/equitylens/workbench.py`
- `frontend/app/globals.css`
- `frontend/components/app-shell.tsx`
- `frontend/components/document-upload.tsx`
- `frontend/components/financial-ledger.tsx`
- `frontend/components/pages/workspace.tsx`
- `frontend/components/pages/workbench.tsx`
- `frontend/lib/api.ts`
- `frontend/lib/types.ts`
- `frontend/lib/workspace.tsx`
- `frontend/test/bulk-workflows.test.tsx`
- `frontend/test/financial-presentation.test.tsx`
- `frontend/test/release-isolation.test.tsx`
