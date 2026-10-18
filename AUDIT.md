# EquityLens Product and Engineering Audit

Audit date: 2026-10-18

## Scope

This audit covered the ten research pages, shared workspace state, browser persistence, Next.js proxy, FastAPI contracts, document extraction, financial calculations, DCF, manual AI workflows, evidence checks, exports, and automated tests. It also compared the public product patterns documented by Koyfin and TIKR. No paid product account, private market-data feed, or live external inference provider was used.

## Outcome

The application now provides a coherent source-to-report workflow without moving arithmetic into an LLM or requiring a paid service. Important claims remain deliberately conservative: valid JSON is labeled schema-valid, exact source checks are labeled deterministic checks, and semantic interpretation still requires human review.

The most material resolved risks were:

- Source excerpts, source-bearing agent output, claim checks, and chat could remain in persistent browser storage with retention disabled.
- Saved workspace parsing was shallow, had no explicit migration path, and could overwrite malformed saved data with demo state.
- Async valuation, financial, thesis, chat, and agent requests could publish results after their inputs changed.
- Unit scales, currencies, annual periods, and quarterly periods could be combined into misleading calculations.
- Agent JSON validity could be mistaken for factual verification.
- Reports could trust a supplied stale valuation rather than recalculating current DCF inputs.
- Prompt experiments lacked stable benchmark, prompt, and model identity.
- Most page routes and critical privacy/provenance behavior had no regression coverage.

## Page Review

| Page | Confirmed issue or risk | Implemented change | Remaining limitation |
|---|---|---|---|
| Dashboard | Counts did not communicate research readiness or stale dependencies. | Added a guided workflow for company, sources, financials, valuation, agents, claim checks, and report readiness. | Readiness is deterministic workflow state, not an investment-quality score. |
| Company Workspace | Upload and deletion consequences were unclear; source removal could leave dependent artifacts. | Added explicit upload status and confirmed cascading removal of source-linked figures, agents, claims, and chat. | PDF extraction still varies by filing layout; OCR is not included. |
| Financial Analysis | Mixed currencies/frequencies and scale differences could produce invalid comparisons; requests could race. | Added blocking consistency checks, scale normalization, capex-sign normalization, source ledger labels, and abort/stale protection. | Currency conversion and fiscal-calendar normalization remain manual. |
| Valuation Lab | Results were not tied to exact inputs and stale responses could replace current state. | Added DCF input fingerprints, request cancellation, stale labels, scenarios, interactive sensitivity, valuation bridge, peer tables, and share-price comparison. | Peer currency, scale, period, and accounting-policy normalization remain analyst work. |
| AI Research Agents | Four agents lacked a claim-verification stage; schema validity could appear authoritative. | Added the Evidence Verification Agent, dependency order, immutable source IDs, model/prompt/input provenance, parent-run staleness, and a claim ledger. | Text-overlap checks do not prove semantic entailment; human review remains required. |
| Investment Thesis | Async refresh could apply obsolete inputs and classifications were too easy to overread. | Added cancellation, input fingerprints, and explicit metadata/ledger/calculation/assumption/interpretation labels. | Narrative quality depends on available current agent output. |
| Research Chat | Multiple packets and permissive citation checks could accept stale or ambiguous responses. | Enforced one pending packet, stale cancellation, exact retrieved document/page allowlisting, and unsupported-answer handling. | Chat remains manual unless optional inference is configured. |
| Investment Report | Stale client valuation and agent output could enter exports; claim checks were not exported. | Backend now recalculates DCF, excludes stale agent output client-side, regenerates deterministic thesis content, and includes evidence review in DOCX/PDF/XLSX. | Export presentation is intentionally concise rather than a full institutional template. |
| Prompt Engineering Lab | One-off scores mixed objective checks with subjective quality and lacked reproducibility metadata. | Added benchmark, prompt, and model versions; known-number, evidence, JSON, instruction, completeness, and hallucinated-number checks; separate human ratings. | Automated metrics do not grade prose quality or citation entailment. |
| Settings | Persistence failures and quota pressure were mostly invisible; imports could silently retain sensitive text. | Added IndexedDB, localStorage fallback, persistence diagnostics, quota estimate, bounded migration-aware import, explicit retention consent, redacted export, and recovery messaging. | Browser storage can still be denied, evicted, or accessed through the browser profile. |

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

- `cd backend && ../.venv/bin/uv run python -m pytest`: 30 passed.
- `cd frontend && npm run check`: TypeScript passed; 22 Vitest tests passed.
- `cd frontend && npm run build`: Next.js production build passed and generated all 13 routes.
- Targeted Ruff checks for changed Python application and audit-test files passed.
- `git diff --check`: passed.

The automated frontend suite renders all ten pages under the real workspace provider and exercises navigation, manual-AI disclosure, privacy redaction, v1-to-v2 migration, malformed import rejection, persistence-failure preservation, DCF/agent staleness, and proxy behavior. Backend regression tests cover evidence statuses, citation mismatches, calculation reconciliation, financial normalization, prompt metrics, finite DCF values, and report-side DCF recalculation.

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
