# Valuation refactor audit and plan

The existing application uses Next.js/React/Tailwind/Recharts, a stateless FastAPI API,
Pydantic financial records, pandas calculations, PyMuPDF extraction and openpyxl exports.
Browser IndexedDB stores version-2 workspaces and project portfolios. The SQLite repository
is a legacy utility, not an active API dependency. No production migration is required.

Preserve document extraction and source locators, the editable financial ledger, financial
analysis helpers, DCF validation, UI primitives, project storage and the backend proxy.
Research routes, prompt benchmarks, chat, thesis, recommendation and inference endpoints
are obsolete. Saved research fields and legacy storage utilities remain readable for
non-destructive compatibility; they must not drive valuation results.

Implementation stages:
1. Extend deterministic models, normalization, forecasting and validation.
2. Add optional valuation models, scenarios and sensitivities through one workbench API.
3. Replace active navigation and connect financial input, forecasts, models and results.
4. Add formula-linked Excel export and calculation/API/UI regression coverage.
5. Run available checks and document methodology, limitations and migration behavior.

Deployment configuration and production data are outside this refactor.
