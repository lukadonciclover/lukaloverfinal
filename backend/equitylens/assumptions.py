"""Conservative, local evidence extraction. Suggestions never mutate financial models."""
from __future__ import annotations

import csv
import hashlib
from io import StringIO
import math
import re
from typing import Any

FORWARD = re.compile(r"\b(expect\w*|forecast\w*|guidance|outlook|anticipat\w*|projected|target\w*|budget\w*|illustrative|scenario|assumption\w*)\b", re.I)
METRICS = {
    "revenue_growth": r"(?:revenue|sales) (?:growth|(?:expected )?(?:to )?(?:increase|grow)(?: by)?|CAGR)",
    "gross_margin": r"gross (?:profit )?margin",
    "ebitda_margin": r"(?:adjusted )?ebitda margin",
    "ebit_margin": r"ebit margin|operating margin",
    "opex_ratio": r"opex (?:ratio|to revenue)|operating expenses? (?:as a percentage of|to) (?:sales|revenue)",
    "depreciation_ratio": r"depreciation (?:ratio|to revenue)|d&a (?:ratio|to revenue)|depreciation and amortization (?:ratio|to revenue)",
    "capex_ratio": r"capex (?:ratio|to revenue)|capital expenditure (?:as a percentage of|to) revenue|(?:capital expenditure|capex) to represent",
    "nwc_ratio": r"(?:net )?working capital (?:ratio|to revenue)",
    "tax_rate": r"(?:effective |cash )?tax rate",
    "interest_rate": r"interest rate",
    "net_borrowing": r"net borrowing",
    "dividends": r"total dividends|dividends paid",
    "dividend": r"dividend per share",
    "dividend_growth": r"dividend growth",
    "dividend_terminal_growth": r"terminal dividend growth",
    "cost_of_equity": r"cost of equity|required equity return",
    "wacc": r"wacc|weighted average cost of capital",
    "terminal_growth": r"terminal growth|perpetual growth",
    "exit_multiple": r"exit (?:ebitda )?multiple",
    "risk_free": r"risk.free rate",
    "beta": r"(?:levered |equity )?beta",
    "equity_risk_premium": r"equity risk premium",
    "cost_of_debt": r"(?:pre.tax )?cost of debt",
    "market_equity": r"market (?:value of equity|equity)",
    "market_debt": r"market (?:value of debt|debt)",
    "equity_weight": r"equity weight",
    "debt_weight": r"debt weight",
    "asset_adjustment": r"(?:fair.value )?asset adjustment",
    "liability_adjustment": r"(?:fair.value )?liability adjustment",
    "revenue": r"revenue|sales",
    "capex": r"capital expenditure|capex",
    "ebitda": r"ebitda",
    "free_cash_flow": r"free cash flow",
    "operating_cash_flow": r"operating cash flow",
    "minimum_cash": r"minimum cash",
    "debt_repayment": r"debt repayment",
    "restructuring_costs": r"restructuring costs?",
    "cost_savings": r"cost savings",
    "capital_allocation": r"capital allocation",
    "forecast_risk": r"forecast risk|outlook risk|guidance risk",
    "financial_outlook": r"strong growth|financial outlook|financial targets?|profitability outlook|capital allocation priorities",
}
AMOUNTS = {"revenue", "capex", "ebitda", "free_cash_flow", "operating_cash_flow", "minimum_cash", "debt_repayment", "restructuring_costs", "cost_savings", "net_borrowing", "dividends", "dividend", "market_equity", "market_debt", "asset_adjustment", "liability_adjustment"}
NUMBER = r"[+-]?\d+(?:,\d{3})*(?:\.\d+)?"


def period_info(text: str) -> tuple[str, str]:
    years = re.findall(r"\b(?:19|20)\d{2}\b", text)
    quarter = re.search(r"\bQ[1-4]\b", text, re.I)
    if quarter:
        return " ".join([quarter[0].upper(), *dict.fromkeys(years)]), "quarter"
    if len(set(years)) > 1 or re.search(r"\bCAGR|multi.year|\d+.year\b", text, re.I):
        return " / ".join(dict.fromkeys(years)) or "Multi-year", "multi-year"
    if re.search(r"long.term|terminal|perpetual", text, re.I):
        return "Long term", "long-term"
    if years:
        return ("FY " if re.search(r"\bFY|fiscal", text, re.I) else "") + years[0], "annual"
    if re.search(r"next (?:fiscal |calendar )?year", text, re.I):
        return re.search(r"next (?:fiscal |calendar )?year", text, re.I)[0], "relative annual"
    return "Undated", "undated"


def extract_assumptions(pages: list[dict[str, Any]], document_id: str, name: str) -> list[dict[str, Any]]:
    output = []
    for page in pages:
        header = None
        wide = []
        context = ""
        lines = page["text"].splitlines()
        # Split prose into clauses so several explicitly labelled metrics stay separate.
        lines = [clause for line in lines for clause in (re.split(r";|(?<=[.!?])\s+(?=[A-Z])", line) if "," not in line else [line])]
        for line in lines:
            if not line.strip():
                continue
            cells = next(csv.reader([line]))
            lower = [c.strip().lower() for c in cells]
            if line.lower().startswith("sheet:"):
                context = line if FORWARD.search(line) else ""
                header, wide = None, []
                continue
            if "metric" in lower and ("value" in lower or "minimum" in lower):
                header = lower
                continue
            if cells and cells[0].lower() in {"metric", "assumption", "financial metric"} and any(re.search(r"(?:19|20)\d{2}", c) for c in cells[1:]):
                wide = [(i, c) for i, c in enumerate(cells[1:], 1) if FORWARD.search(c) or re.search(r"\d{4}E\b", c, re.I) or FORWARD.search(context)]
                continue
            if wide and len(cells) > 1:
                for index, heading in wide:
                    if index >= len(cells):
                        continue
                    buffer = StringIO()
                    writer = csv.writer(buffer)
                    writer.writerow(["metric", "period", "value", "unit", "classification"])
                    writer.writerow([cells[0], re.sub(r"(?<=\d)E\b", "", heading, flags=re.I), cells[index], "percent" if "%" in cells[index] else "", "management guidance"])
                    parsed = extract_assumptions([{"page": page["page"], "text": buffer.getvalue()}], document_id, name)
                    for a in parsed:
                        a["excerpt"] = f"{context}\n{heading}\n{line}".strip()[:1200]
                    output.extend(parsed)
                continue
            structured = dict(zip(header, cells)) if header and len(cells) == len(header) else {}
            # Section headings can establish guidance and time horizon, but never values.
            if re.search(r"^(?:FY\s*\d{4}\s+)?(?:guidance|outlook|forecast|projections|budget)\b", line, re.I) and not re.search(r"%|\$|\d+\.\d+", line) and len(line) < 100:
                context = line
            if re.search(r"^(historical|actual|reported results)\b", line, re.I):
                context = ""
            evidence = line if structured else f"{context} {line}".strip()
            forward = bool(FORWARD.search(evidence)) or structured.get("classification", "").lower() in {"management guidance", "analyst assumption", "illustrative scenario"}
            raw_metric = structured.get("metric", "").strip().lower()
            matches = [(len(m[0]), key, m) for key, pattern in METRICS.items() if (m := re.search(pattern, raw_metric.replace("_", " ") if structured else line, re.I))]
            if raw_metric in METRICS:
                metric, match = raw_metric, None
            elif matches:
                _, metric, match = max(matches, key=lambda item: item[0])
            else:
                continue
            if metric == "capex" and re.search(r"%\s+of\s+(?:revenue|sales)", line, re.I):
                metric = "capex_ratio"
            if not forward and metric in {"revenue", "capex", "dividends", "ebitda", "free_cash_flow", "operating_cash_flow"}:
                continue
            classification = "management guidance" if forward else "historical reported"
            if re.search(r"illustrative|scenario|hypothetical", evidence, re.I):
                classification = "illustrative scenario"
            elif re.search(r"analyst|assumption", evidence, re.I):
                classification = "analyst assumption"
            if structured.get("classification", "").lower() in {"historical reported", "management guidance", "analyst assumption", "illustrative scenario"}:
                classification = structured["classification"].lower()
            period, basis = period_info(structured.get("period", evidence))
            scope = structured.get("scope") or ("segment / unspecified" if re.search(r"segment|division|business unit", evidence, re.I) else "unspecified")
            if re.search(r"consolidated|group.wide|company.wide", evidence, re.I):
                scope = "consolidated"
            currency = structured.get("currency", "").upper()
            detected = re.search(r"\b(USD|EUR|GBP|SGD|JPY|CAD|AUD|CNY|HKD)\b", evidence)
            if detected:
                currency = detected[0]
            scale = 1.0
            for word, factor in [("billion", 1e9), ("million", 1e6), ("thousand", 1e3)]:
                if word in evidence.lower():
                    scale = factor
            try:
                scale = float(structured.get("unit_scale", scale))
            except ValueError:
                scale = 1.0
            if not math.isfinite(scale) or scale <= 0:
                scale = 1.0
            unit = "currency" if metric in AMOUNTS else "multiple" if metric == "exit_multiple" else "number" if metric == "beta" else "percentage"
            value = minimum = maximum = None
            if structured:
                def numeric(key):
                    raw = structured.get(key, "").strip().replace(",", "").rstrip("%x")
                    try:
                        result = float(raw)
                        return result if math.isfinite(result) else None
                    except ValueError:
                        return None
                value, minimum, maximum = numeric("value"), numeric("minimum"), numeric("maximum")
                range_value = re.fullmatch(rf"\s*({NUMBER})\s*%?\s*(?:-|\u2013|to)\s*({NUMBER})\s*%?\s*", structured.get("value", ""))
                if range_value:
                    value = None
                    minimum, maximum = sorted((float(range_value[1].replace(",", "")), float(range_value[2].replace(",", ""))))
                explicit_unit = structured.get("unit", "").lower()
                if unit == "percentage" and explicit_unit not in {"%", "percent", "percentage", "decimal"} and "%" not in line:
                    value = minimum = maximum = None
                divisor = 100 if unit == "percentage" and explicit_unit != "decimal" else 1
                value, minimum, maximum = [v / divisor if v is not None else None for v in (value, minimum, maximum)]
            elif match:
                tail = line[match.end():]
                # Only nearby numbers associated with this metric; fiscal years cannot become values.
                tail = re.sub(r"\b(?:FY\s*)?(?:19|20)\d{2}\b", "", tail, flags=re.I)
                pattern = rf"(?:\s|:|=|of|is|at|between|approximately|around|expected|guidance|budget|target|forecast|assumption|to|be|USD|EUR|GBP|SGD|\$)*({NUMBER})\s*(%|x|million|billion|thousand)?(?:\s*(?:-|\u2013|to|and)\s*({NUMBER})\s*(%|x|million|billion|thousand)?)?"
                found = re.match(pattern, tail, re.I)
                if found and (unit != "percentage" or "%" in found[0]) and not (unit == "currency" and "%" in found[0]):
                    first = float(found[1].replace(",", ""))
                    divisor = 100 if unit == "percentage" else 1
                    if found[3]:
                        minimum, maximum = sorted((first / divisor, float(found[3].replace(",", "")) / divisor))
                    else:
                        value = first / divisor
            if metric in {"asset_adjustment", "liability_adjustment"} and not re.search(r"fair[ -]value", evidence, re.I):
                value = minimum = maximum = None
            if metric in {"financial_outlook", "forecast_risk", "capital_allocation"}:
                value = minimum = maximum = None
            identifier = hashlib.sha256(f"{document_id}:{page['page']}:{metric}:{line}".encode()).hexdigest()
            output.append(dict(id=identifier, metric=metric, value=value, minimum=minimum, maximum=maximum,
                unit=unit, currency=currency, unit_scale=scale, period=period, basis=basis, scope=scope,
                classification=classification, explicit=True, document_id=document_id, document_name=name,
                page=page["page"], excerpt=evidence[:1200], confidence=.8 if structured else .6,
                status="pending" if value is not None or minimum is not None else "requires review", rationale=""))
    return list({row["id"]: row for row in output}.values())[:500]


def derive_assumptions(figures: list, currency: str) -> list[dict[str, Any]]:
    """Annual approved ledger only. Duplicate observations and foreign currencies are excluded."""
    grouped: dict[tuple[str, str], list] = {}
    for f in figures:
        if f.currency == currency and re.fullmatch(r"(?:19|20)\d{2}", f.period) and f.value is not None:
            grouped.setdefault((f.period, f.metric), []).append(f)
    values = {key: rows[0].value * rows[0].unit_scale for key, rows in grouped.items() if len(rows) == 1}
    output = []
    ratios = {"gross_margin": "gross_profit", "ebitda_margin": "ebitda", "ebit_margin": "ebit", "capex_ratio": "capital_expenditure", "depreciation_ratio": "depreciation_amortization", "nwc_ratio": "net_working_capital", "tax_rate": "tax_expense"}
    for period in sorted({p for p, _ in values}):
        for metric in ["revenue_growth", "dividend_growth", *ratios]:
            growth_metric = "revenue" if metric == "revenue_growth" else "dividend_per_share" if metric == "dividend_growth" else None
            numerator_key = (period, growth_metric or ratios[metric])
            denominator_key = (str(int(period) - 1), growth_metric) if growth_metric else (period, "pretax_income" if metric == "tax_rate" else "revenue")
            n, d = values.get(numerator_key), values.get(denominator_key)
            if n is None or d is None or d <= 0:
                continue
            result = (abs(n) if metric == "capex_ratio" else n) / d - (1 if growth_metric else 0)
            if not math.isfinite(result):
                continue
            inputs = [grouped[k][0].model_dump(mode="json") for k in (numerator_key, denominator_key)]
            evidence_id = hashlib.sha256(str(inputs).encode()).hexdigest()
            output.append(dict(id=f"derived:{metric}:{period}:{evidence_id}", metric=metric,value=result,minimum=None,maximum=None,
                unit="percentage",currency=currency,unit_scale=1,period=period,basis="annual",scope="consolidated",
                classification="historical derived",explicit=False,document_id="approved-ledger",document_name="Approved historical ledger",
                page=None,excerpt="",confidence=1,status="pending",rationale=f"{numerator_key} / {denominator_key}" + (" - 1" if growth_metric else "") + (". Reported effective tax; not a cash or forecast tax rate." if metric == "tax_rate" else "") + ". Historical observation, not guidance.",
                inputs=[dict(metric=f["metric"],period=f["period"],value=f["value"],unit_scale=f["unit_scale"],currency=f["currency"],document_id=(f.get("source") or {}).get("document_identifier", "")) for f in inputs]))
    return output


def derive_revenue_guidance(candidates: list[dict], figures: list, currency: str) -> list[dict]:
    output = []
    for a in candidates:
        if a.get("metric") != "revenue" or a.get("basis") != "annual" or a.get("scope") != "consolidated" or a.get("currency") != currency or a.get("classification") != "management guidance":
            continue
        year = re.fullmatch(r"(?:FY )?((?:19|20)\d{2})", a.get("period", ""))
        if not year:
            continue
        base = [f for f in figures if f.metric == "revenue" and f.period == str(int(year[1])-1) and f.currency == currency]
        if len(base) != 1 or base[0].value is None or base[0].value <= 0:
            continue
        f = base[0]
        scale = a.get("unit_scale", 1)
        def rate(key):
            value = a.get(key)
            result = value * scale / (f.value * f.unit_scale) - 1 if isinstance(value, (int, float)) and math.isfinite(value) and isinstance(scale, (int, float)) and math.isfinite(scale) and scale > 0 else None
            return result if result is not None and math.isfinite(result) else None
        value, minimum, maximum = [rate(key) for key in ("value", "minimum", "maximum")]
        if value is None and (minimum is None or maximum is None):
            continue
        output.append({**a, "id": f"growth:{a['id']}:{f.value}:{f.unit_scale}", "metric": "revenue_growth", "value": value, "minimum": minimum, "maximum": maximum,
            "unit": "percentage", "unit_scale": 1, "explicit": False, "status": "pending",
            "original": {key: a.get(key) for key in ("metric", "value", "minimum", "maximum", "unit", "unit_scale", "currency")},
            "rationale": f"Source revenue / approved {f.period} revenue ({f.value} × {f.unit_scale} {currency}) - 1. Confirm the fiscal/calendar boundaries and accounting scope match.",
            "inputs": [dict(metric=f.metric, period=f.period, value=f.value, unit_scale=f.unit_scale, currency=f.currency, document_id=f.source.document_identifier if f.source else "")]})
    return output
