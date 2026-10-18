# EquityLens Product and Engineering Audit

Audit date: 2026-10-18

## Scope

This audit covered the ten research pages, shared workspace state, browser persistence, Next.js proxy, FastAPI contracts, document extraction, financial calculations, DCF, manual AI workflows, evidence checks, exports, and automated tests. It also compared the public product patterns documented by Koyfin and TIKR. No paid product account, private market-data feed, or live external inference provider was used.

## Outcome

The application now provides an optional ten-step source-to-report workflow across isolated company projects without moving arithmetic into an LLM or requiring a paid service. Important claims remain deliberately conservative: valid JSON is labeled schema-valid, exact source checks are labeled deterministic checks, and semantic interpretation still requires human review.

The most material resolved risks were:

- Source excerpts, source-bearing agent output, claim checks, and chat could remain in persistent browser storage with retention disabled.
- Saved workspace parsing was shallow, had no explicit migration path, and could overwrite malformed saved data with demo state.
- Async valuation, financial, thesis, chat, and agent requests could publish results after their inputs changed.
- Unit scales, currencies, annual periods, and quarterly periods could be combined into misleading calculations.
- Agent JSON validity could be mistaken for factual verification.
- Reports could trust a supplied stale valuation rather than recalculating current DCF inputs.
- Prompt experiments lacked stable benchmark, prompt, and model identity.
- Most page routes and critical privacy/provenance behavior had no regression coverage.
- A singleton workspace allowed late async responses and imported artifacts to contaminate another company after project switching was introduced.
- CSV rows such as `Revenue,2024,120` were parsed as the comma-formatted number `2,024,120`; the end-to-end test confirmed and fixed this extraction defect.

## Page Review

| Page | Confirmed issue or risk | Implemented change | Remaining limitation |
|---|---|---|---|
| Dashboard | Counts did not communicate research readiness or stale dependencies. | Added an optional ten-step workflow whose progress is derived from current artifacts, not page visits, plus stale-report notification. | Readiness is deterministic workflow state, not an investment-quality score. |
| Company Workspace | A singleton workspace could mix issuers; upload and deletion consequences were unclear. | Added isolated create/rename/duplicate/switch/archive/restore projects, project-scoped async updates, explicit upload status, and cascading source removal. | PDF extraction still varies by filing layout; OCR is not included. |
| Financial Analysis | Results disappeared on navigation and mixed currencies/frequencies or scale differences could produce invalid comparisons. | Persisted figure-hashed analysis, automatic recomputation, blocking consistency checks, scale/capex normalization, provenance downgrade after edits, and stale protection. | Currency conversion and fiscal-calendar normalization remain manual. |
| Valuation Lab | DCF freshness ignored financial-ledger changes and stale responses could replace current state. | Tied DCF fingerprints to project/company/figures/assumptions, added request cancellation, latest-ledger revenue reconciliation, scenarios, sensitivity, bridge, and peer tables. | Peer currency, scale, period, and accounting-policy normalization remain analyst work. |
| AI Research Agents | Four agents lacked a claim-verification stage; schema validity could appear authoritative. | Added the Evidence Verification Agent, dependency order, immutable source IDs, model/prompt/input provenance, parent-run staleness, and a claim ledger. | Text-overlap checks do not prove semantic entailment; human review remains required. |
| Investment Thesis | Results were page-local and async refresh could apply obsolete inputs. | Persisted project-scoped thesis snapshots, require explicit generation, hide stale text, and label metadata/ledger/calculation/assumption/interpretation. | Narrative quality depends on available current agent output. |
| Research Chat | Multiple packets and permissive citation checks could accept stale or ambiguous responses. | Enforced one pending packet, project-bound async updates, exact retrieved document/page allowlisting, source/input hashes, stale-message labels, and unsupported-answer handling. | Chat remains manual unless optional inference is configured. |
| Investment Report | No export manifest existed and stale client valuation or agents could enter exports. | Backend recalculates DCF, excludes stale outputs, exports evidence review, records a project report fingerprint, and warns when regeneration is required. | Export presentation is intentionally concise rather than a full institutional template. |
| Prompt Engineering Lab | One-off scores mixed objective checks with subjective quality and lacked reproducibility metadata. | Added benchmark, prompt, and model versions; known-number, evidence, JSON, instruction, completeness, and hallucinated-number checks; separate human ratings. | Automated metrics do not grade prose quality or citation entailment. |
| Settings | Persistence failures and quota pressure were invisible; import could replace another company or retain sensitive text. | Added portfolio persistence diagnostics, bounded project import-to-new, active-project export, global retention purge/redaction, migration, quota estimate, and recovery messaging. | Browser storage can still be denied, evicted, or accessed through the browser profile. |

## Functional Inventory

| Module | User-facing functions | Backend integration | Persistence and stale behavior |
|---|---|---|---|
| Dashboard | Start a new analysis, resume/open any workflow step, inspect health, operating chart, valuation and readiness. | `GET /health`. | Reads only the active project. Report and all ten step states derive from current hashes; visiting a page changes no completion flag. |
| Company Workspace | Create, rename, duplicate, switch, archive/restore projects; edit company; upload multiple files; remove sources. | `POST /v1/documents/process` per file. | Upload callbacks are bound to the originating project. Source deletion removes linked rows and invalidates dependent hashes. Synthetic issuer relabeling clears demo artifacts. |
| Financial Analysis | Accept suggestions, add/edit/delete rows, calculate ratios, inspect charts/formulas/issues. | `POST /v1/financials/analyze`. | Analysis persists with the financial fingerprint and automatically recomputes after edits. Editing a sourced row removes its source and downgrades it to user-supplied. |
| Valuation Lab | Edit DCF assumptions, synchronize latest ledger revenue, inspect scenarios/sensitivity/forecast/bridge, manage peers. | `POST /v1/valuation/dcf`; `POST /v1/valuation/comparables`. | DCF hash includes project company, ledger and assumptions. Stale valuation visuals are hidden and downstream consumers receive no stale DCF. |
| AI Research Agents | Select five agents, retrieve evidence, prepare/copy prompts, optionally call configured inference, identify model, import/validate JSON, inspect provenance and claims. | `POST /v1/retrieval/search`, `/v1/prompts/agent`, `/v1/ai/validate`, `/v1/evidence/verify`, `/v1/inference/generate`. | Dependency order is enforced. Run IDs, prompt/source/input hashes and assumption snapshots mark all descendants stale when inputs change. |
| Investment Thesis | Explicitly generate or refresh classified recommendation sections. | `POST /v1/thesis`. | Snapshot persists by thesis fingerprint. Stale content is hidden, never silently displayed under another company. |
| Research Chat | Ask, prepare/copy prompt, paste/validate answer, cancel packet, clear conversation. | `POST /v1/retrieval/search`, `/v1/chat/prompt`, `/v1/chat/validate`. | One packet at a time; project/input/source hashes prevent cross-project writes and visibly mark prior messages stale. |
| Investment Report | Generate/download DOCX, PDF or XLSX; inspect reconciliation and last export. | `POST /v1/reports/{docx,pdf,xlsx}`. | Export captures a report fingerprint. Any company, figure, DCF, agent, claim or thesis change marks the manifest stale and triggers regeneration notices. |
| Prompt Engineering Lab | Load tasks, select strategy/model, generate/copy prompt, paste output, score, rate, annotate and clear experiments. | `GET /v1/prompts/benchmarks`; `POST /v1/prompts/strategy`, `/v1/prompts/evaluate`. | Experiments are project-scoped; objective metrics remain separate from human judgments. |
| Settings | Change execution mode, test backend, set retention, inspect quota/persistence, export/import project, reset active project. | `GET /health`. | IndexedDB stores a migrated portfolio. Imports add a project. Retention-off purges and redacts source-derived text across every project. |

All buttons and forms above were traced to their handlers and API calls. Automated tests cover route rendering, project operations, persistence, proxy behavior and the complete backend workflow. Responsive CSS was reviewed for the shell, tables and workflow bar; this is not equivalent to physical-device testing.

## Defects And Enhancements

Confirmed defects fixed in code include singleton cross-company state, stale DCF after financial changes, page-local analysis/thesis, missing report regeneration state, synthetic-data relabel contamination, CSV value misparsing, permissive citation identity, persistence opt-out races, malformed import paths, async stale responses and export formula injection.

Implemented product enhancements include the optional guided workflow, multi-project lifecycle controls, project switching in the shell, latest-revenue DCF reconciliation, interactive valuation views, prompt experiment history and richer readiness UX. These are labeled enhancements because the prior behavior was limited rather than demonstrably incorrect.

## Evidence Model

The fifth agent proposes atomic claims and citations. Python then independently checks:

- Whether the source ID exists in the supplied evidence set.
- Whether document name and page match that source ID.
- Whether the exact normalized excerpt exists in the source chunk.
- Whether claim words are directly covered or only partially overlap.
- Whether a named deterministic calculation exists and matches the claimed value.

Unknown locators and excerpt mismatches are rejected. Missing evidence is `unsupported`, not `contradicted`. Semantic contradiction labels using text still require human review. This design reduces false confidence but does not replace reading the source document.

## Product Comparison

Public TIKR materials emphasize a predictable company-research progression across financials, valuation, filings, and ownership. Public Koyfin materials emphasize configurable dashboards, dense comparable tables, and interactive visual analysis. EquityLens adopts the useful product patterns without claiming feature parity:

- TIKR-inspired guided progression appears on the dashboard and through stale-dependency gates.
- Koyfin-inspired dense tables and linked scenario/chart views appear in financial and valuation workflows.
- EquityLens differentiates through local-first privacy controls, manual-AI transparency, deterministic arithmetic, and claim-level evidence checks.

No conclusion here is based on testing paid Koyfin or TIKR functionality.

## Verification

Automated verification completed after the changes:

- `cd backend && ../.venv/bin/uv run python -m pytest`: 32 passed.
- `cd frontend && npm run check`: TypeScript passed; 27 Vitest tests passed.
- `cd frontend && npm run build`: Next.js production build passed and generated all 13 routes.
- Targeted Ruff checks for changed Python application and audit-test files passed.
- `git diff --check`: passed.

The frontend suite renders all ten pages under the real provider and exercises navigation, project creation/switching/duplication/archive/import/export, project-bound late updates, artifact-based workflow gates, privacy redaction, migration, malformed import rejection, persistence-failure preservation, DCF/agent staleness, and proxy behavior. The backend end-to-end test carries synthetic CSV bytes through extraction, accepted figures, financial analysis, DCF, retrieval, five prompt/response validations, deterministic claim verification, thesis, and PDF/DOCX/XLSX generation.

## Residual Risk

- No real issuer filing corpus was used for broad extraction accuracy benchmarking.
- No scanned-document OCR workflow is bundled.
- No live configured external inference provider was exercised.
- No live market-data, FX, or corporate-actions feed is included.
- Browser automation was not run across Safari, Firefox, mobile devices, or assistive technologies; component tests and responsive code do not replace manual cross-browser and accessibility review.
- Local browser storage is not multi-user, encrypted application storage, a backup system, or a regulated document repository.
- BM25 retrieval can miss semantically related passages that use different terminology.
- Deterministic lexical support checks can reject valid paraphrases or accept text overlap that does not fully entail a claim.
- Investment conclusions, source interpretation, comparability adjustments, and final committee judgment remain human responsibilities.
