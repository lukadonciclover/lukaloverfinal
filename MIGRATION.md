# Streamlit to Vercel Migration Record

## Decision

EquityLens now uses a Next.js frontend and a stateless FastAPI backend deployed as two Vercel projects from one repository.

Vercel documentation reviewed during migration:

- FastAPI framework preset and custom `tool.vercel.entrypoint`
- Python runtime entry-point requirements
- `/api` file-function compatibility and framework-preset precedence
- Vercel Services guidance for combined Next.js/Python projects

Services availability could not be verified without an authenticated Vercel account. The migration therefore does not assume Services access. Separate projects are operationally explicit and use the supported Next.js and FastAPI presets independently.

## Removed

- Root `app.py`, which Vercel incorrectly interpreted as a Python handler
- `equitylens/ui.py`, the Streamlit-specific UI and orchestration layer
- Streamlit and Plotly Python dependencies
- Production dependence on process-local session state, local file writes, and SQLite
- Production dependence on a locally running Ollama process

## Preserved

- Financial ratio and growth formulas
- Missing-value behavior
- DCF timing convention and formulas
- Bear/base/bull scenario mechanics
- Sensitivity analysis
- Comparable-company multiple rules
- PDF/spreadsheet extraction and page metadata
- BM25 retrieval
- Agent roles, schemas, prompt-injection defenses, and validation
- Deterministic thesis generation
- DOCX, PDF, and Excel generation
- Original Python regression tests

## Adapted

| Concern | Previous | Current |
|---|---|---|
| UI | Streamlit radio navigation | Next.js App Router and responsive React shell |
| Charts | Plotly | Recharts |
| Editable state | Streamlit session and SQLite | React context and consent-aware localStorage |
| API | In-process function calls | Pydantic-validated FastAPI endpoints |
| Upload storage | Local `data/files` | In-memory request processing, no server retention |
| AI execution | Local Ollama or manual | Manual default; optional configured external endpoint |
| Reports | Streamlit download buttons | FastAPI streaming download responses |
| Cloud persistence | Ephemeral SQLite risk | Stateless demo plus explicit storage protocol |
| Frontend/backend connection | Same Python process | Same-origin Next.js proxy to configured FastAPI URL |

## Serverless Boundaries

- Upload requests are rejected above 4 MB so multipart requests remain below Vercel's 4.5 MB function payload limit.
- PDFs are rejected above 100 pages.
- Processing is synchronous only for bounded demo-sized documents.
- Files and extracted text are not written to the Vercel filesystem.
- Large-document production support requires asynchronous jobs and durable object storage.
- `backend/storage.py` is the provider boundary; no storage provider is silently selected.

## Deployment Topology

```text
Vercel Project: equitylens-frontend
  Root: frontend/
  Next.js route handler: /api/backend/[...path]
  BACKEND_URL -> backend deployment

Vercel Project: equitylens-backend
  Root: ./
  FastAPI entrypoint: backend.api:app
  Optional ALLOWED_ORIGINS / INFERENCE_* variables
```

This topology resolves the original error because Vercel imports an actual top-level FastAPI `app`, while the Streamlit `app.py` no longer exists.
