from __future__ import annotations

import hashlib
import math
import re
from collections import Counter
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

import pymupdf
import pandas as pd


TOKEN_RE = re.compile(r"[a-zA-Z0-9]+")
PERIOD_RE = re.compile(r"\b(?:19|20)\d{2}\b")
NUMBER_RE = re.compile(r"(?<!\w)(?:\$|€|£)?\(?-?\d[\d,]*(?:\.\d+)?\)?")

METRIC_ALIASES = {
    "revenue": ("revenue", "net sales", "total sales"),
    "cost_of_goods_sold": ("cost of goods sold", "cost of sales", "cost of revenue"),
    "gross_profit": ("gross profit",),
    "operating_expenses": ("operating expenses", "operating costs"),
    "ebitda": ("ebitda",),
    "ebit": ("operating income", "operating profit", "ebit"),
    "interest_expense": ("interest expense",),
    "tax_expense": ("income tax expense", "tax expense"),
    "net_income": ("net income", "net profit", "profit for the year"),
    "cash": ("cash and cash equivalents",),
    "short_term_investments": ("short-term investments", "marketable securities"),
    "total_assets": ("total assets",),
    "current_assets": ("total current assets",),
    "total_liabilities": ("total liabilities",),
    "short_term_debt": ("short-term debt", "current borrowings"),
    "long_term_debt": ("long-term debt", "non-current borrowings"),
    "total_equity": ("total equity", "shareholders' equity"),
    "operating_cash_flow": ("net cash provided by operating", "operating cash flow"),
    "capital_expenditure": ("capital expenditures", "capital expenditure", "purchases of property"),
    "investing_cash_flow": ("net cash used in investing", "investing cash flow"),
    "financing_cash_flow": ("net cash used in financing", "financing cash flow"),
}


@dataclass
class ExtractedDocument:
    pages: list[dict[str, Any]]
    tables: list[dict[str, Any]]
    warning: str = ""


def document_identifier(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:20]


def classify_document(name: str, text: str = "") -> str:
    haystack = f"{name} {text[:3000]}".lower()
    if "annual report" in haystack or "form 10-k" in haystack:
        return "Annual report"
    if "quarter" in haystack or "10-q" in haystack:
        return "Quarterly financial statement"
    if "investor presentation" in haystack or "investor day" in haystack:
        return "Investor presentation"
    suffix = Path(name).suffix.lower()
    return {".csv": "Financial dataset", ".xlsx": "Excel spreadsheet", ".txt": "Research note", ".md": "Research note"}.get(suffix, "Other")


def detect_reporting_period(text: str) -> str:
    years = PERIOD_RE.findall(text[:12000])
    return max(years) if years else ""


def detect_unit_scale(text: str) -> tuple[float, str]:
    sample = text[:5000].lower()
    patterns = (
        (r"(?:figures|amounts|values)?\s*(?:are\s+)?in billions", 1_000_000_000.0, "billions"),
        (r"(?:figures|amounts|values)?\s*(?:are\s+)?in millions", 1_000_000.0, "millions"),
        (r"(?:figures|amounts|values)?\s*(?:are\s+)?in thousands", 1_000.0, "thousands"),
    )
    for pattern, scale, label in patterns:
        if re.search(pattern, sample):
            return scale, label
    return 1.0, "actual units"


def parse_financial_number(value: str) -> float | None:
    cleaned = value.strip().replace(",", "").replace("$", "").replace("€", "").replace("£", "")
    if cleaned in {"", "-", "—", "N/A", "n/a"}:
        return None
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    cleaned = cleaned.strip("()")
    try:
        result = float(cleaned)
    except ValueError:
        return None
    return -result if negative else result


def extract_pdf(content: bytes) -> ExtractedDocument:
    pages: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    warnings: list[str] = []
    try:
        with pymupdf.open(stream=content, filetype="pdf") as pdf:
            for index, page in enumerate(pdf):
                text = page.get_text("text", sort=True).strip()
                pages.append({"page": index + 1, "text": text})
                try:
                    finder = page.find_tables()
                    for table_index, table in enumerate(finder.tables):
                        rows = table.extract()
                        if rows:
                            tables.append({"page": index + 1, "table": table_index + 1, "rows": rows})
                            widths = {len(row) for row in rows}
                            blank_ratio = sum(cell in {None, ""} for row in rows for cell in row) / max(sum(map(len, rows)), 1)
                            if len(widths) > 1 or blank_ratio > 0.6:
                                warnings.append(f"Possible table extraction error on page {index + 1}, table {table_index + 1}.")
                except (AttributeError, ValueError):
                    pass
    except Exception as exc:
        raise ValueError(f"The PDF could not be opened: {exc}") from exc
    characters = sum(len(page["text"]) for page in pages)
    if pages and characters / len(pages) < 80:
        warnings.append("Very little text was extracted. This may be a scanned PDF; OCR is not included.")
    return ExtractedDocument(pages=pages, tables=tables, warning=" ".join(dict.fromkeys(warnings)))


def extract_tabular(content: bytes, suffix: str) -> ExtractedDocument:
    try:
        if suffix == ".csv":
            frame = pd.read_csv(BytesIO(content))
            text = frame.to_csv(index=False)
        else:
            sheets = pd.read_excel(BytesIO(content), sheet_name=None)
            text = "\n\n".join(f"Sheet: {name}\n{frame.to_csv(index=False)}" for name, frame in sheets.items())
    except Exception as exc:
        raise ValueError(f"The spreadsheet could not be read: {exc}") from exc
    return ExtractedDocument(pages=[{"page": 1, "text": text}], tables=[])


def extract_document(content: bytes, name: str) -> ExtractedDocument:
    suffix = Path(name).suffix.lower()
    if suffix == ".pdf":
        return extract_pdf(content)
    if suffix in {".csv", ".xlsx"}:
        return extract_tabular(content, suffix)
    if suffix in {".txt", ".md"}:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1", errors="replace")
        return ExtractedDocument(pages=[{"page": 1, "text": text}], tables=[])
    raise ValueError("Supported uploads are PDF, CSV, XLSX, TXT, and Markdown files.")


def chunk_pages(pages: list[dict[str, Any]], chunk_size: int = 1400, overlap: int = 180) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for page in pages:
        text = re.sub(r"[ \t]+", " ", page["text"])
        if not text.strip():
            continue
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            if end < len(text):
                boundary = text.rfind(" ", start, end)
                if boundary > start + chunk_size // 2:
                    end = boundary
            section = text[start:end].strip()
            if section:
                scale, unit = detect_unit_scale(section)
                chunks.append(
                    {
                        "page": page["page"],
                        "text": section,
                        "metadata": {
                            "reporting_period": detect_reporting_period(section),
                            "unit_scale": scale,
                            "unit_label": unit,
                            "forward_looking": bool(re.search(r"\b(expect|forecast|guidance|outlook|anticipate)\b", section, re.I)),
                        },
                    }
                )
            if end >= len(text):
                break
            start = max(end - overlap, start + 1)
    return chunks


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text) if len(token) > 1]


def search_chunks(query: str, chunks: list[dict[str, Any]], limit: int = 6) -> list[dict[str, Any]]:
    """Small local BM25 implementation; no external index or network is required."""
    if not chunks or not query.strip():
        return []
    docs = [tokenize(chunk["text"]) for chunk in chunks]
    query_terms = tokenize(query)
    avg_length = sum(map(len, docs)) / len(docs) if docs else 1
    document_frequency = Counter(term for term in set(query_terms) for doc in docs if term in doc)
    scores: list[tuple[float, int]] = []
    k1, b = 1.5, 0.75
    for index, terms in enumerate(docs):
        frequencies = Counter(terms)
        score = 0.0
        for term in query_terms:
            frequency = frequencies[term]
            if not frequency:
                continue
            df = document_frequency[term]
            inverse_frequency = math.log(1 + (len(docs) - df + 0.5) / (df + 0.5))
            denominator = frequency + k1 * (1 - b + b * len(terms) / max(avg_length, 1))
            score += inverse_frequency * frequency * (k1 + 1) / denominator
        if score > 0:
            scores.append((score, index))
    return [{**chunks[index], "score": score} for score, index in sorted(scores, reverse=True)[:limit]]


def suggest_financial_figures(pages: list[dict[str, Any]], currency: str = "USD") -> list[dict[str, Any]]:
    """Conservative extraction suggestions for user review; never auto-committed."""
    suggestions: list[dict[str, Any]] = []
    for page in pages:
        scale, _ = detect_unit_scale(page["text"])
        lines = page["text"].splitlines()
        for line in lines:
            normalized = line.lower()
            metric = next(
                (key for key, aliases in METRIC_ALIASES.items() if any(alias in normalized for alias in aliases)),
                None,
            )
            if not metric:
                continue
            values = NUMBER_RE.findall(line)
            periods = PERIOD_RE.findall(line)
            if not values:
                continue
            value = parse_financial_number(values[-1])
            if value is None:
                continue
            suggestions.append(
                {
                    "metric": metric,
                    "period": periods[-1] if periods else "",
                    "value": value,
                    "currency": currency,
                    "unit_scale": scale,
                    "page": page["page"],
                    "quote": line[:500],
                    "confidence": 0.55 if periods else 0.35,
                }
            )
    return suggestions
