from __future__ import annotations

from datetime import date
from typing import Any


SECTIONS = [
    "Investment overview", "Company description", "Industry position", "Historical financial performance",
    "Revenue growth opportunities", "Margin expansion opportunities", "Valuation", "Catalysts", "Downside risks",
    "Bear, base and bull scenarios", "Investment recommendation",
]


def generate_deterministic_thesis(
    company: Any,
    metrics: dict[str, Any],
    valuation: dict[str, Any] | None,
    agent_outputs: dict[str, Any],
) -> dict[str, list[dict[str, str]]]:
    """Builds a transparent fallback thesis without pretending it came from an LLM."""
    result: dict[str, list[dict[str, str]]] = {section: [] for section in SECTIONS}
    result["Investment overview"].append(
        {"classification": "Fact supported by source", "text": f"{company.name} is analyzed as of {date.today().isoformat()} in {company.currency}."}
    )
    if company.industry:
        result["Company description"].append(
            {"classification": "Fact supported by source", "text": f"Workspace classification: {company.industry}, {company.country or 'country not supplied'}."}
        )
    if metrics:
        latest_period = sorted(metrics)[-1]
        latest = metrics[latest_period]
        for label, key in (("Revenue", "revenue"), ("Net income", "net_income"), ("Operating cash flow", "operating_cash_flow")):
            value = latest.get(key)
            if value is not None:
                result["Historical financial performance"].append(
                    {"classification": "Fact supported by source", "text": f"{label} for {latest_period}: {value:,.2f} {company.currency}."}
                )
    if valuation:
        equity = valuation.get("equity_value")
        share = valuation.get("implied_share_value")
        if equity is not None:
            result["Valuation"].append({"classification": "Quantitative calculation", "text": f"DCF equity value: {equity:,.2f} {company.currency}."})
        if share is not None:
            result["Valuation"].append({"classification": "Quantitative calculation", "text": f"Implied value per diluted share: {share:,.2f} {company.currency}."})
    critic = agent_outputs.get("Investment Committee Critic", {})
    recommendation = critic.get("recommendation", "Insufficient Evidence")
    rationale = critic.get("rationale", "A validated investment committee assessment is not available.")
    result["Investment recommendation"].append(
        {"classification": "Reasoned interpretation", "text": f"{recommendation}: {rationale}"}
    )
    result["Investment recommendation"].append(
        {"classification": "Analyst assumption", "text": "The recommendation should change if material financial data, model assumptions, or risk evidence changes."}
    )
    for risk in agent_outputs.get("Risk Analyst", {}).get("risks", []):
        result["Downside risks"].append(
            {"classification": "Reasoned interpretation" if risk.get("evidence_backed") else "Analyst assumption", "text": risk.get("risk", "")}
        )
    return result
