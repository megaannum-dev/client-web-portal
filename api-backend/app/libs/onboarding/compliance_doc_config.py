# api-backend/app/libs/onboarding/compliance_doc_config.py
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DocSpec:
    key: str  # stable config KEY -> onboarding_documents.doc_type; never renamed once shipped
    label: str  # display label (server-authoritative -- FE renders this, never a local label)
    required: bool
    periodic_review: bool
    review_interval_days: int | None = None  # only meaningful when periodic_review=True


# The 7 seed docs -- single canonical list; every surface (RM's "Start
# Onboarding" wizard, the KYC panel, Compliance's review queue) renders these
# labels from the server, never a local copy.
REQUIRED_DOCS: tuple[DocSpec, ...] = (
    DocSpec(
        key="pms_service_agreement",
        label="Discretionary PMS Service Agreement",
        required=True,
        periodic_review=False,
    ),
    DocSpec(
        key="investment_policy_statement",
        label="Investment Policy Statement",
        required=True,
        periodic_review=False,
    ),
    DocSpec(
        key="fact_finder_questionnaire",
        label="Financial & Investment Fact Finder Questionnaire",
        required=True,
        periodic_review=False,
    ),
    DocSpec(key="derivatives_knowledge_form", label="Financial Health Check - Derivatives Knowledge Form", required=True, periodic_review=False),
    DocSpec(
        key="fee_schedule",
        label="Fee Schedule",
        required=True,
        periodic_review=False,
    ),
    DocSpec(
        key="risk_disclosure", label="Risk Disclosure Statement", required=True, periodic_review=False
    ),
    DocSpec(
        key="identity_proof",
        label="Other - ID / Passport / Proof of Address",
        required=True,
        periodic_review=False,
    ),
)

REQUIRED_COUNT: int = sum(1 for d in REQUIRED_DOCS if d.required)


def get_doc_spec(doc_type: str) -> DocSpec:
    for spec in REQUIRED_DOCS:
        if spec.key == doc_type:
            return spec
    raise KeyError(f"unknown doc_type: {doc_type!r}")
