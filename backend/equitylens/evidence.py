from __future__ import annotations

import math
import re
from typing import Any

from equitylens.models import ProposedClaimAssessment

TOKEN_RE = re.compile(r"[a-z0-9]+")
STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "in", "is", "it", "of", "on", "or", "that", "the", "to", "was", "were", "with",
}


def _normalized(text: str) -> str:
    return " ".join(TOKEN_RE.findall(text.lower()))


def _tokens(text: str) -> set[str]:
    return {token for token in TOKEN_RE.findall(text.lower()) if token not in STOP_WORDS and len(token) > 1}


def _number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _lookup_calculation(context: dict[str, Any], reference: str) -> float | None:
    value: Any = context
    for part in reference.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return _number(value)


def verify_claims(
    assessments: list[ProposedClaimAssessment],
    evidence: list[dict[str, Any]],
    calculation_context: dict[str, Any],
) -> list[dict[str, Any]]:
    sources = {str(chunk.get("chunk_id") or ""): chunk for chunk in evidence if chunk.get("chunk_id")}
    results: list[dict[str, Any]] = []
    for assessment in assessments:
        checks: list[str] = []
        valid_citations: list[dict[str, Any]] = []
        coverage = 0.0
        exact_support = False
        for citation in assessment.citations:
            source = sources.get(citation.source_id)
            if source is None:
                checks.append(f"Rejected unknown source ID {citation.source_id}.")
                continue
            if citation.document_name != source.get("document_name"):
                checks.append(f"Rejected document mismatch for {citation.source_id}.")
                continue
            if citation.page is not None and citation.page != source.get("page"):
                checks.append(f"Rejected page mismatch for {citation.source_id}.")
                continue
            excerpt = citation.excerpt.strip()
            source_text = str(source.get("text", ""))
            if not excerpt or _normalized(excerpt) not in _normalized(source_text):
                checks.append(f"Rejected excerpt not found in {citation.source_id}.")
                continue
            valid_citations.append(citation.model_dump())
            claim_tokens = _tokens(assessment.claim)
            quote_tokens = _tokens(excerpt)
            citation_coverage = len(claim_tokens & quote_tokens) / max(len(claim_tokens), 1)
            coverage = max(coverage, citation_coverage)
            exact_support = exact_support or _normalized(assessment.claim) in _normalized(excerpt)
        status = "unsupported"
        human_review_required = False
        calculation_value = None
        if assessment.calculation_ref:
            calculation_value = _lookup_calculation(calculation_context, assessment.calculation_ref)
            claimed_value = assessment.claimed_value
            if calculation_value is None or claimed_value is None:
                human_review_required = True
                checks.append(f"Calculation reference {assessment.calculation_ref} could not be reconciled.")
            elif math.isclose(calculation_value, claimed_value, rel_tol=1e-6, abs_tol=1e-6):
                reference_tokens = _tokens(assessment.calculation_ref.replace("_", " "))
                extra_claim_tokens = {token for token in _tokens(assessment.claim) if not token.isdigit()} - reference_tokens - {"dcf", "implied", "per", "share"}
                status = "verified" if not extra_claim_tokens else "partially_supported"
                human_review_required = bool(extra_claim_tokens)
                checks.append(f"Matched deterministic calculation {assessment.calculation_ref}; unrelated claim language is not calculation-verified.")
            else:
                status = "contradicted"
                checks.append(f"Claimed value does not match deterministic calculation {assessment.calculation_ref}.")
        elif valid_citations:
            if exact_support or coverage >= 0.25:
                status = "partially_supported"
                human_review_required = True
                checks.append("Source locator and text overlap are valid, but semantic support or contradiction requires human review.")
            else:
                status = "unsupported"
                human_review_required = True
                checks.append("Source locator is valid, but deterministic text checks do not establish support.")
        else:
            human_review_required = True
            checks.append("No valid source locator or calculation reference supports this claim.")
        results.append(
            {
                "claim_id": assessment.claim_id,
                "claim": assessment.claim,
                "status": status,
                "citations": valid_citations,
                "rationale": assessment.rationale,
                "checks": checks,
                "human_review_required": human_review_required,
                "calculation_value": calculation_value,
            }
        )
    return results
