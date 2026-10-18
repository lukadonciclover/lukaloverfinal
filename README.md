# EquityLens AI

EquityLens AI is a Vercel-compatible investment research platform with a Next.js frontend and a stateless FastAPI backend. It preserves the original deterministic Python financial engine while replacing the Streamlit runtime, local SQLite cloud assumptions, and local-only UI.

All built-in company data is explicitly synthetic. EquityLens is research software, not investment advice.

## Architecture

```text
Browser
  -> Next.js 16 / React 19 / TypeScript / Tailwind / Recharts
  -> same-origin /api/backend/* proxy
  -> FastAPI on Vercel Python runtime
  -> existing deterministic EquityLens Python modules
```

The repository is configured as **one Vercel Services project** with two independently built service roots:

- Public `frontend/` service: Next.js
- Private `backend/` service: FastAPI and the deterministic Python engine

The browser calls only the Next.js origin. `frontend/app/api/backend/[...path]/route.ts` forwards allowlisted requests over a private service binding. Vercel generates the server-only `BACKEND_URL` for every local, preview, and production deployment.

## Features

- Ten working research modules: dashboard, workspace, financial analysis, valuation, agents, thesis, chat, reports, prompt lab, and settings
- Responsive terminal-style dark interface with collapsible navigation
- Versioned browser-local workspace with IndexedDB storage, privacy-aware JSON export, validated import, and localStorage fallback
- PDF, CSV, and XLSX processing with source pages and review suggestions
- Editable historical financial statements and data-origin labels
- Python-calculated ratios that preserve missing values
- Five-year DCF with bear/base/bull scenarios and sensitivity matrix
- Comparable-company multiples with invalid denominator exclusion
- Four research agents plus an Evidence Verification Agent, with schema validation, source IDs, provenance, and stale-input fingerprints
- Grounded research-chat prompt preparation and manual response validation
- Deterministic investment thesis fallback
- DOCX, PDF, and XLSX report generation
- Prompt strategy comparison with objective and human-review metrics separated
- Deterministic claim checks for exact excerpts, source locators, and calculation reconciliation
- Optional external OpenAI-compatible inference only when the backend operator configures it
- No paid API, AI subscription, database, or object-storage service required

## Reused Python Engine

The migration keeps these framework-independent modules as the calculation source of truth:

| Module | Status |
|---|---|
| `backend/equitylens/financials.py` | Extended with scale normalization, capex-sign handling, and blocking consistency checks |
| `backend/equitylens/valuation.py` | Extended with finite-input validation and resilient scenario handling |
| `backend/equitylens/documents.py` | Extended extraction, chunk provenance, SHA-256 identifiers, suggestions, and BM25 retrieval |
| `backend/equitylens/prompts.py` | Extended with the fifth agent, source IDs, versioning, and repeatable benchmark metrics |
| `backend/equitylens/evidence.py` | Deterministic source-locator, exact-excerpt, and calculation reconciliation checks |
| `backend/equitylens/reports.py` | Extended DOCX, PDF, and Excel generation with current DCF and evidence-review exports |
| `backend/equitylens/thesis.py` | Transparent deterministic thesis generation with explicit statement classifications |
| `backend/equitylens/models.py` | Tightened Pydantic domain, evidence, and agent schemas |
| `backend/equitylens/db.py` | Retained only for legacy local tests; never instantiated by the Vercel API |
| `backend/equitylens/ai.py` | JSON validation reused; local Ollama execution is not used in production |

See `MIGRATION.md` for the detailed decision record.

## Local Development

Install Node.js 24, Python 3.12-3.14, and `uv`, then install each service's locked dependencies:

```bash
npm ci --prefix frontend
cd backend
uv sync --locked
cd ..
```

Run both services and their generated binding from the repository root:

```bash
npx vercel dev -L
```

Open the URL printed by Vercel CLI. The `-L` flag uses only local configuration and does not require Vercel authentication. For independent service development, run `uv run uvicorn app.main:app --reload --port 8000` from `backend/`, set `BACKEND_URL=http://localhost:8000` in `frontend/.env.local`, and run `npm run dev` from `frontend/`.

## API Surface

| Endpoint | Purpose |
|---|---|
| `GET /health` | Runtime and optional inference status |
| `GET /v1/demo` | Synthetic stateless demo data |
| `POST /v1/financials/analyze` | Historical ratios and quality checks |
| `POST /v1/valuation/dcf` | DCF, scenarios, and sensitivity |
| `POST /v1/valuation/comparables` | Peer multiples and statistics |
| `POST /v1/documents/process` | In-memory PDF/CSV/XLSX extraction |
| `POST /v1/retrieval/search` | Local BM25 evidence retrieval |
| `POST /v1/prompts/agent` | Specialized agent prompt generation |
| `POST /v1/ai/validate` | Manual agent JSON validation |
| `POST /v1/chat/prompt` | Grounded research-chat prompt generation |
| `POST /v1/chat/validate` | Manual chat response validation |
| `GET /v1/prompts/benchmarks` | Repeatable prompt benchmark definitions |
| `POST /v1/prompts/strategy` | Prompt-strategy generation |
| `POST /v1/prompts/evaluate` | Objective benchmark checks |
| `POST /v1/evidence/verify` | Deterministic claim locator, excerpt, and calculation checks |
| `POST /v1/thesis` | Deterministic classified thesis |
| `POST /v1/reports/{docx,pdf,xlsx}` | Downloadable report generation |
| `POST /v1/inference/generate` | Disabled unless external inference is configured |

All arithmetic runs in Python. An LLM never calculates DCF outputs, ratios, scenarios, or sensitivity values.

## Storage and Privacy

The basic deployment is stateless:

- Workspace state is stored primarily in browser IndexedDB, with a capacity-limited `localStorage` fallback.
- Workspace JSON can be exported and reimported.
- Uploaded bytes are processed in memory and discarded after each response.
- Extracted document text remains in browser memory only by default.
- Persisting extracted text, excerpts, source-bearing agent packets, or research chat requires explicit consent in Settings.
- When retention is off, persistent copies and exports redact document chunks, excerpts, source-bearing agent output, claim checks, and chat.
- SQLite is not used by the FastAPI application.
- `backend/app/storage.py` defines the durable database/object-storage protocol for an optional future provider.

Do not enable browser document-text persistence on shared machines or where policy prohibits browser storage. IndexedDB remains local browser storage, not a durable or regulated system of record.

## Document Limits

Synchronous serverless processing is intentionally bounded:

- Maximum upload: 4 MB, leaving multipart overhead below Vercel's 4.5 MB function payload limit
- Maximum PDF length: 100 pages
- Supported production uploads: PDF, CSV, XLSX
- Maximum returned searchable chunks: 250
- Maximum returned figure suggestions: 500
- Maximum returned table previews: 20

Files exceeding these limits must be split before upload. A production system requiring large filings should use consent-aware object storage plus a queued worker; serverless requests should not pretend to provide reliable long-running document jobs.

Scanned PDFs are detected by low text density, but OCR is not bundled. Convert scans to searchable PDFs first.

## AI Modes

### Manual AI Mode

Default and credential-free:

1. Select an agent or ask a research question.
2. EquityLens retrieves available evidence and constructs the prompt.
3. Copy the prompt to an external chat interface.
4. Paste the returned JSON into EquityLens.
5. FastAPI validates the exact agent schema.
6. Valid output is labeled as a manual external import.

### Financial Analytics Only

Disables narrative inference while retaining all deterministic calculations, document processing, retrieval, and exports.

### Configured External Inference

Optional and disabled by default. Configure an OpenAI-compatible endpoint only when required:

```text
INFERENCE_URL=https://your-inference-host.example/v1/chat/completions
INFERENCE_MODEL=your-model
INFERENCE_TOKEN=optional-token
```

This mode does not require or assume a paid provider. `localhost` Ollama is not a production dependency.

## Tests and Build

```bash
# Python domain and API integration tests
cd backend
uv run pytest
cd ..

# Frontend type checks and component tests
npm run check --prefix frontend

# Production Next.js build
npm run build --prefix frontend

# Dependency audit
npm audit --prefix frontend --audit-level=moderate
```

The suite does not require internet access, AI credentials, Ollama, a cloud database, or uploaded fixtures. See `AUDIT.md` for the page-by-page audit, verification matrix, and residual limitations.

## Vercel Deployment

The root `vercel.json` builds and deploys both services together. Keep the Vercel project Root Directory at the repository root and select the **Services** framework preset. Do not set build or output-directory overrides.

For the existing `lukaloverfinal` project:

1. Open **Settings > Build and Deployment**.
2. Set **Framework Preset** to **Services**.
3. Keep **Root Directory** empty so it resolves to the repository root.
4. Remove any manually configured `BACKEND_URL`; the `frontend` service binding generates it per deployment.
5. Keep `lukaloverfinal.vercel.app` assigned to this same project.
6. Redeploy the latest commit.

The equivalent authenticated CLI flow is:

```bash
vercel link
vercel project update --framework services
vercel deploy
vercel curl /api/backend/health --deployment YOUR_PREVIEW_URL
vercel deploy --prod
vercel curl /api/backend/health
```

Expected production checks:

```text
https://lukaloverfinal.vercel.app/                    -> EquityLens HTML dashboard
https://lukaloverfinal.vercel.app/dashboard           -> EquityLens HTML dashboard
https://lukaloverfinal.vercel.app/research            -> AI research agents
https://lukaloverfinal.vercel.app/prompts             -> Prompt engineering lab
https://lukaloverfinal.vercel.app/api/backend/health -> FastAPI health JSON through Next.js
```

The backend has no top-level public rewrite and is reachable only through the frontend binding. CORS does not affect normal dashboard requests because the browser calls the same-origin Next.js proxy.

## Why the Original Error Is Resolved

The root Streamlit `app.py` has been removed. Vercel Services now builds the public Next.js service from `frontend/` and imports `app.main:app` only inside the private `backend/` service. The project root can no longer be misdetected as a standalone FastAPI deployment.

## Limitations

- No authentication is included because the basic deployment stores workspace data in one browser rather than on a shared server.
- Browser IndexedDB/localStorage is not a substitute for regulated document management.
- Currency conversion and market data remain manual to avoid hidden external dependencies.
- Lexical BM25 retrieval can miss passages using unrelated terminology.
- PDF table extraction varies by filing format and always requires analyst review.
- Deterministic excerpt checks establish locator and text overlap, not full semantic entailment; consequential claims still require analyst review.
- Schema-valid AI output can still be factually wrong; the Evidence Verification Agent and human source review remain mandatory.
- Automated prompt scores do not grade interpretive quality or citation entailment.
