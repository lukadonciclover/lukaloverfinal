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

The repository is configured for **two Vercel projects from one Git repository**:

- Backend project root: repository root (`.`)
- Frontend project root: `frontend/`

Vercel's current documentation recommends Vercel Services for a combined new Next.js and Python project. Services access could not be verified in this development environment because no authenticated Vercel CLI was available. Separate projects are the documented supported alternative and do not require Services access.

The browser calls only the Next.js origin. `frontend/app/api/backend/[...path]/route.ts` forwards allowlisted requests to the FastAPI deployment configured in server-only `BACKEND_URL`.

## Features

- Ten working research modules: dashboard, workspace, financial analysis, valuation, agents, thesis, chat, reports, prompt lab, and settings
- Responsive terminal-style dark interface with collapsible navigation
- Browser-local demo workspace with JSON export and reimport
- PDF, CSV, and XLSX processing with source pages and review suggestions
- Editable historical financial statements and data-origin labels
- Python-calculated ratios that preserve missing values
- Five-year DCF with bear/base/bull scenarios and sensitivity matrix
- Comparable-company multiples with invalid denominator exclusion
- Four distinct, schema-validated manual AI agents with prompt chaining
- Grounded research-chat prompt preparation and manual response validation
- Deterministic investment thesis fallback
- DOCX, PDF, and XLSX report generation
- Prompt strategy comparison with objective and human-review metrics separated
- Optional external OpenAI-compatible inference only when the backend operator configures it
- No paid API, AI subscription, database, or object-storage service required

## Reused Python Engine

The migration keeps these framework-independent modules as the calculation source of truth:

| Module | Status |
|---|---|
| `equitylens/financials.py` | Reused unchanged for growth, ratios, and quality checks |
| `equitylens/valuation.py` | Reused unchanged for DCF, scenarios, sensitivity, and comparables |
| `equitylens/documents.py` | Reused for extraction, chunking, suggestions, and BM25 retrieval |
| `equitylens/prompts.py` | Reused for agent roles, schemas, prompt strategies, and evaluation |
| `equitylens/reports.py` | Reused for DOCX, PDF, and Excel generation |
| `equitylens/thesis.py` | Reused for transparent deterministic thesis generation |
| `equitylens/models.py` | Reused for Pydantic domain and agent schemas |
| `equitylens/db.py` | Retained only for legacy local tests; never instantiated by the Vercel API |
| `equitylens/ai.py` | JSON validation reused; local Ollama execution is not used in production |

See `MIGRATION.md` for the detailed decision record.

## Local Development

### Backend

Python 3.12 is configured for Vercel.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.api:app --reload --port 8000
```

FastAPI documentation is available at `http://localhost:8000/docs`.

### Frontend

In another terminal:

```bash
cp frontend/.env.example frontend/.env.local
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

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
| `POST /v1/thesis` | Deterministic classified thesis |
| `POST /v1/reports/{docx,pdf,xlsx}` | Downloadable report generation |
| `POST /v1/inference/generate` | Disabled unless external inference is configured |

All arithmetic runs in Python. An LLM never calculates DCF outputs, ratios, scenarios, or sensitivity values.

## Storage and Privacy

The basic deployment is stateless:

- Workspace state is stored in browser `localStorage`.
- Workspace JSON can be exported and reimported.
- Uploaded bytes are processed in memory and discarded after each response.
- Extracted document text remains in browser memory only by default.
- Persisting extracted text in `localStorage` requires explicit consent in Settings.
- SQLite is not used by the FastAPI application.
- `backend/storage.py` defines the durable database/object-storage protocol for an optional future provider.

Do not enable browser document-text persistence on shared machines or where policy prohibits local storage.

## Document Limits

Synchronous serverless processing is intentionally bounded:

- Maximum upload: 8 MB
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

Optional and disabled by default. Configure an OpenAI-compatible endpoint only at the backend project level:

```text
INFERENCE_URL=https://your-inference-host.example/v1/chat/completions
INFERENCE_MODEL=your-model
INFERENCE_TOKEN=optional-token
```

This mode does not require or assume a paid provider. `localhost` Ollama is not a production dependency.

## Tests and Build

```bash
# Python domain and API integration tests
.venv/bin/python -m pytest

# Frontend type checks and component tests
cd frontend
npm run check

# Production Next.js build
npm run build

# Dependency audit
npm audit --audit-level=moderate
```

The suite does not require internet access, AI credentials, Ollama, a cloud database, or uploaded fixtures.

## Vercel Deployment

### 1. Deploy FastAPI Backend

Create a Vercel project from this repository with:

- Root Directory: `.`
- Framework detection: FastAPI/Python
- Python version: read from `.python-version` (`3.12`)
- Entry point: read from `pyproject.toml` (`backend.api:app`)
- Environment variable: `ALLOWED_ORIGINS=https://YOUR-FRONTEND.vercel.app`

`vercel.json` sets the function duration and excludes frontend/tests/data from the Python bundle. No build command is required.

Deploy and verify:

```bash
vercel deploy
curl https://YOUR-BACKEND.vercel.app/health
```

### 2. Deploy Next.js Frontend

Create a second Vercel project from the same repository with:

- Root Directory: `frontend`
- Framework Preset: Next.js
- Environment variable: `BACKEND_URL=https://YOUR-BACKEND.vercel.app`

Deploy and verify:

```bash
cd frontend
vercel deploy
```

Open the frontend deployment and verify Dashboard reports the Python engine online, then run a DCF calculation and a PDF export.

### 3. Production

After preview verification:

```bash
vercel deploy --prod
```

Set `BACKEND_URL` and `ALLOWED_ORIGINS` separately for Preview and Production when those environments use different domains.

## Why the Original Error Is Resolved

The root Streamlit `app.py` has been removed. Vercel no longer attempts to load a Streamlit script as an ASGI handler. The backend entry point is explicitly configured as `backend.api:app`, where `app` is a top-level FastAPI instance, and the frontend is a normal Next.js project.

## Limitations

- No authentication is included because the basic deployment stores workspace data in one browser rather than on a shared server.
- Browser localStorage is not a substitute for regulated document management.
- Currency conversion and market data remain manual to avoid hidden external dependencies.
- Lexical BM25 retrieval can miss passages using unrelated terminology.
- PDF table extraction varies by filing format and always requires analyst review.
- Schema-valid AI output can still be factually wrong; source verification remains mandatory.
- Automated prompt scores do not grade interpretive quality or citation entailment.
