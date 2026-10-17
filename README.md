# EquityLens AI

EquityLens AI is a local-first investment research and valuation workbench built with Streamlit. It combines source-document retrieval, auditable financial data, deterministic valuation, optional local language-model analysis, manual AI workflows, and report exports without requiring a paid API or subscription.

All built-in demonstration figures are explicitly synthetic. The application is research software, not investment advice.

## Capabilities

- Persistent company workspaces backed by SQLite
- Multi-file PDF, CSV, XLSX, TXT, and Markdown uploads
- Page-preserving PDF text extraction and table detection with PyMuPDF
- Local BM25-style keyword retrieval with source document and page metadata
- Conservative financial-figure suggestions that require user review
- Editable financial statements with reported, derived, user-supplied, and AI-estimate origin labels
- Historical growth, margin, return, liquidity, leverage, and cash-flow analysis
- Five-year editable DCF, bear/base/bull scenarios, and WACC/terminal-growth sensitivity
- Manually entered comparable-company multiples with invalid denominator exclusion
- Four schema-validated research agents through local Ollama
- Full manual prompting and JSON import when Ollama is unavailable
- Source-grounded document chat with prompt-injection defenses
- Deterministic thesis fallback with claim classifications
- DOCX, PDF, and Excel exports generated from saved workspace data
- Prompt strategy lab with saved experiments and repeatable synthetic benchmarks
- Built-in synthetic example project for immediate use

## Installation

Python 3.11 or newer is recommended.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

The application creates `data/equitylens.db` and `data/files/` on first use. These paths are ignored by Git.

## Operating Modes

Select a mode on the Settings page.

### Financial Analytics Only

This is the default and requires no language model. Document handling, retrieval, financial calculations, DCF, scenarios, reports, and exports remain available. Narrative AI answers are not fabricated.

### Local AI Mode

Install [Ollama](https://ollama.com/) separately, then install a model. For example:

```bash
ollama pull llama3.1:8b
ollama serve
```

Set the exact installed model name and Ollama URL on the Settings page. EquityLens calls only Ollama's local `/api/tags` and `/api/generate` endpoints. Model outputs are accepted only after Pydantic schema validation.

### Manual AI Mode

EquityLens retrieves evidence and prepares the complete prompt. Copy that prompt to an external chat interface, paste its JSON response back into EquityLens, and validate it locally. The UI explicitly distinguishes imported output from a direct model call.

## Suggested Workflow

1. Open the synthetic project or create a company workspace.
2. Upload an annual report or financial dataset on Company Workspace.
3. Review extraction warnings and accept only verified figure suggestions.
4. Correct or add historical figures on Financial Statement Analysis.
5. Enter consistent-scale DCF assumptions and save the model.
6. Run local agents or import manual agent responses.
7. Review the deterministic thesis and committee challenge.
8. Export the research report and Excel valuation workbook.

## Architecture

| Module | Responsibility |
|---|---|
| `app.py` | Streamlit entry point |
| `equitylens/ui.py` | Ten-page analyst interface and workflows |
| `equitylens/db.py` | SQLite schema and persistence repository |
| `equitylens/models.py` | Pydantic data and agent output contracts |
| `equitylens/documents.py` | Extraction, chunking, figure suggestions, BM25 retrieval |
| `equitylens/financials.py` | Ratios, growth, data quality, nullable calculations |
| `equitylens/valuation.py` | DCF, scenarios, sensitivity, comparable multiples |
| `equitylens/ai.py` | Ollama adapter, manual imports, strict JSON validation |
| `equitylens/prompts.py` | Agent prompts, strategy templates, evaluations |
| `equitylens/thesis.py` | Transparent deterministic thesis assembly |
| `equitylens/reports.py` | DOCX, PDF, and Excel exports |
| `equitylens/sample.py` | Explicitly synthetic demonstration project |

The numerical engine never delegates arithmetic to a language model. Missing values remain `None`; they are not silently converted to zero. DCF calculations use year-end discounting, with terminal value measured at the end of the final forecast year.

## Agent Pipeline

The pipeline executes Financial Analyst, Valuation Analyst, Risk Analyst, and Investment Committee Critic in sequence. Each agent receives:

- A role-specific system instruction
- Verified financial figures
- Deterministic valuation output
- Retrieved source passages with page citations
- Prior validated agent output when relevant
- A strict JSON schema
- Explicit instructions to treat uploaded document text as untrusted data

Agent failures are saved as errors and do not disable deterministic functionality. Individual agents can be rerun.

## Tests

Tests require no internet connection, API key, Ollama installation, or paid service.

```bash
.venv/bin/python -m pytest
```

Coverage includes ratios, growth, currency and period checks, DCF, terminal and equity values, share value, scenarios, sensitivity, comparables, document parsing and retrieval, prompt generation, schema validation, manual imports, persistence, and report reconciliation.

## Data and Security

- Workspace metadata and outputs remain in local SQLite storage.
- Uploaded source files remain under the local `data/files/` directory.
- Document instructions are explicitly marked as untrusted in model prompts.
- The application has no authentication because it is intended for one analyst on a local machine.
- If exposed on a network, add operating-system access controls or a reverse proxy with authentication.

## Limitations

- Scanned PDFs are detected by low extracted-text density, but OCR is not bundled. Convert scans to searchable PDFs before upload.
- PDF table structure varies widely. Extracted values are suggestions, not authoritative records, and require user verification.
- Currency conversion is intentionally not automatic. Mixed currencies are flagged so the analyst can normalize them with an explicit source and date.
- No market-data service is used. Share prices, shares, and comparable-company inputs are manual.
- BM25-style retrieval is lexical and local; it may miss semantically related passages that use different terminology.
- Local model quality depends on the selected Ollama model. Schema validity does not prove factual correctness, so evidence and citations still require analyst review.
- The prompt lab's automated scores test known numbers, output structure, and required language. Interpretive quality and citation entailment are explicitly human-assessed.
- Reports are deliberately conservative: missing sections are labeled as insufficient evidence rather than populated with invented prose.
