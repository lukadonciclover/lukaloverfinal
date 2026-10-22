# Refactor audit

The app is now limited to financial input, historical analysis, forecasting, valuation and export. The original Next.js/FastAPI stack, project persistence, ledger editor, document parser, source records, analysis helpers, DCF engine and UI primitives were reused.

Removed active code: agent orchestration, prompt benchmarking/evaluation, general chat, thesis/recommendation generation, evidence scoring, research readiness workflow and DOCX/PDF research exports. Their dedicated pages, API handlers and tests were removed or replaced. Unused requests/python-docx/reportlab and frontend form-resolver dependencies were removed and lockfiles refreshed.

Preserved compatibility: legacy workspace data fields and SQLite repository/schema. They do not execute research workflows. No production data was accessed or changed. Deployment files remain unchanged.

Validation includes deterministic financial tests, complete statement-to-valuation-to-XLSX integration, independent workbook formula evaluation, project persistence and React component tests. See README for commands and modeling limitations. Live proxy checks returned successful valuation JSON and XLSX responses. Visual browser verification was unavailable because no browser was connected.
