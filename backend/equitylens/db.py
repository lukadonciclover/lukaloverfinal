from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from equitylens.models import AgentRun, Company, DocumentRecord, FinancialFigure


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, ticker TEXT, country TEXT,
    industry TEXT, currency TEXT NOT NULL, reporting_standard TEXT,
    latest_financial_year INTEGER, share_price REAL, shares_outstanding REAL,
    statement_dates TEXT, investment_horizon TEXT, required_return REAL,
    analyst_notes TEXT, is_synthetic INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    identifier TEXT NOT NULL UNIQUE, name TEXT NOT NULL, document_type TEXT NOT NULL,
    reporting_period TEXT, path TEXT NOT NULL, upload_date TEXT NOT NULL,
    extraction_status TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 0, warning TEXT
);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    page INTEGER, position INTEGER NOT NULL, text TEXT NOT NULL, metadata TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS financial_figures (
    id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    metric TEXT NOT NULL, period TEXT NOT NULL, value REAL, currency TEXT NOT NULL,
    unit_scale REAL NOT NULL, origin TEXT NOT NULL, source_json TEXT, notes TEXT,
    UNIQUE(company_id, metric, period)
);
CREATE TABLE IF NOT EXISTS agent_runs (
    id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL, status TEXT NOT NULL, prompt TEXT NOT NULL,
    raw_output TEXT, parsed_output TEXT, errors TEXT, model_name TEXT,
    response_time REAL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role TEXT NOT NULL, content TEXT NOT NULL, citations TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS experiments (
    id INTEGER PRIMARY KEY, company_id INTEGER, strategy TEXT NOT NULL, task TEXT NOT NULL,
    prompt TEXT NOT NULL, output TEXT NOT NULL, metrics TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_state (
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(company_id, key)
);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class Repository:
    def __init__(self, path: str | Path = "data/equitylens.db") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.executescript(SCHEMA)

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def save_company(self, company: Company) -> int:
        values = company.model_dump(exclude={"id", "created_at"})
        values["is_synthetic"] = int(values["is_synthetic"])
        with self.connect() as conn:
            if company.id:
                assignments = ", ".join(f"{key} = ?" for key in values)
                conn.execute(
                    f"UPDATE companies SET {assignments} WHERE id = ?",  # noqa: S608
                    [*values.values(), company.id],
                )
                return company.id
            columns = ", ".join(values)
            placeholders = ", ".join("?" for _ in values)
            cursor = conn.execute(
                f"INSERT INTO companies ({columns}, created_at) VALUES ({placeholders}, ?)",  # noqa: S608
                [*values.values(), utcnow()],
            )
            return int(cursor.lastrowid)

    def list_companies(self) -> list[Company]:
        with self.connect() as conn:
            rows = conn.execute("SELECT * FROM companies ORDER BY name").fetchall()
        return [Company.model_validate(dict(row)) for row in rows]

    def get_company(self, company_id: int) -> Company | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
        return Company.model_validate(dict(row)) if row else None

    def add_document(self, document: DocumentRecord) -> int:
        data = document.model_dump(exclude={"id", "upload_date"})
        with self.connect() as conn:
            cursor = conn.execute(
                """INSERT INTO documents
                (company_id, identifier, name, document_type, reporting_period, path,
                 upload_date, extraction_status, pages, warning)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    data["company_id"], data["identifier"], data["name"], data["document_type"],
                    data["reporting_period"], data["path"], utcnow(), data["extraction_status"],
                    data["pages"], data["warning"],
                ),
            )
            return int(cursor.lastrowid)

    def update_document(self, document_id: int, **fields: Any) -> None:
        allowed = {"extraction_status", "pages", "warning", "reporting_period", "document_type"}
        clean = {key: value for key, value in fields.items() if key in allowed}
        if not clean:
            return
        assignments = ", ".join(f"{key} = ?" for key in clean)
        with self.connect() as conn:
            conn.execute(
                f"UPDATE documents SET {assignments} WHERE id = ?",  # noqa: S608
                [*clean.values(), document_id],
            )

    def list_documents(self, company_id: int) -> list[DocumentRecord]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM documents WHERE company_id = ? ORDER BY upload_date DESC", (company_id,)
            ).fetchall()
        return [DocumentRecord.model_validate(dict(row)) for row in rows]

    def remove_document(self, document_id: int) -> str | None:
        with self.connect() as conn:
            row = conn.execute("SELECT path FROM documents WHERE id = ?", (document_id,)).fetchone()
            conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        return str(row["path"]) if row else None

    def replace_chunks(self, document_id: int, company_id: int, chunks: list[dict[str, Any]]) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
            conn.executemany(
                "INSERT INTO chunks (document_id, company_id, page, position, text, metadata) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (
                        document_id,
                        company_id,
                        chunk.get("page"),
                        index,
                        chunk["text"],
                        json.dumps(chunk.get("metadata", {})),
                    )
                    for index, chunk in enumerate(chunks)
                ],
            )

    def get_chunks(self, company_id: int) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """SELECT chunks.*, documents.name AS document_name
                FROM chunks JOIN documents ON chunks.document_id = documents.id
                WHERE chunks.company_id = ?""",
                (company_id,),
            ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["metadata"] = json.loads(item["metadata"])
            result.append(item)
        return result

    def upsert_figure(self, figure: FinancialFigure) -> None:
        source_json = figure.source.model_dump_json() if figure.source else None
        with self.connect() as conn:
            conn.execute(
                """INSERT INTO financial_figures
                (company_id, metric, period, value, currency, unit_scale, origin, source_json, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(company_id, metric, period) DO UPDATE SET
                value=excluded.value, currency=excluded.currency, unit_scale=excluded.unit_scale,
                origin=excluded.origin, source_json=excluded.source_json, notes=excluded.notes""",
                (
                    figure.company_id,
                    figure.metric,
                    figure.period,
                    figure.value,
                    figure.currency,
                    figure.unit_scale,
                    figure.origin.value,
                    source_json,
                    figure.notes,
                ),
            )

    def get_figures(self, company_id: int) -> list[FinancialFigure]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM financial_figures WHERE company_id = ? ORDER BY period, metric", (company_id,)
            ).fetchall()
        figures = []
        for row in rows:
            item = dict(row)
            source = json.loads(item.pop("source_json")) if item.get("source_json") else None
            item["source"] = source
            figures.append(FinancialFigure.model_validate(item))
        return figures

    def save_agent_run(self, run: AgentRun) -> int:
        with self.connect() as conn:
            cursor = conn.execute(
                """INSERT INTO agent_runs
                (company_id, agent_name, status, prompt, raw_output, parsed_output, errors,
                 model_name, response_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    run.company_id,
                    run.agent_name,
                    run.status,
                    run.prompt,
                    run.raw_output,
                    json.dumps(run.parsed_output) if run.parsed_output is not None else None,
                    json.dumps(run.errors),
                    run.model_name,
                    run.response_time,
                    utcnow(),
                ),
            )
            return int(cursor.lastrowid)

    def latest_agent_runs(self, company_id: int) -> dict[str, dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM agent_runs WHERE company_id = ? ORDER BY id DESC", (company_id,)
            ).fetchall()
        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            item = dict(row)
            if item["agent_name"] not in latest:
                item["parsed_output"] = json.loads(item["parsed_output"]) if item["parsed_output"] else None
                item["errors"] = json.loads(item["errors"] or "[]")
                latest[item["agent_name"]] = item
        return latest

    def add_chat(self, company_id: int, role: str, content: str, citations: list[str] | None = None) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO chats (company_id, role, content, citations, created_at) VALUES (?, ?, ?, ?, ?)",
                (company_id, role, content, json.dumps(citations or []), utcnow()),
            )

    def get_chat(self, company_id: int) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute("SELECT * FROM chats WHERE company_id = ? ORDER BY id", (company_id,)).fetchall()
        return [{**dict(row), "citations": json.loads(row["citations"] or "[]")} for row in rows]

    def save_experiment(
        self, company_id: int | None, strategy: str, task: str, prompt: str, output: str, metrics: dict[str, Any]
    ) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO experiments (company_id, strategy, task, prompt, output, metrics, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (company_id, strategy, task, prompt, output, json.dumps(metrics), utcnow()),
            )

    def get_experiments(self, company_id: int | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM experiments"
        params: tuple[Any, ...] = ()
        if company_id is not None:
            query += " WHERE company_id = ?"
            params = (company_id,)
        query += " ORDER BY id DESC"
        with self.connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [{**dict(row), "metrics": json.loads(row["metrics"])} for row in rows]

    def save_state(self, company_id: int, key: str, value: Any) -> None:
        with self.connect() as conn:
            conn.execute(
                """INSERT INTO workspace_state (company_id, key, value, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(company_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
                (company_id, key, json.dumps(value), utcnow()),
            )

    def get_state(self, company_id: int, key: str, default: Any = None) -> Any:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT value FROM workspace_state WHERE company_id = ? AND key = ?", (company_id, key)
            ).fetchone()
        return json.loads(row["value"]) if row else default
