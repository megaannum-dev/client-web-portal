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


# The 7 seed docs. `identity_proof` unifies the RM's "Other -- ID / Passport /
# Proof of Address" and Compliance's "ID / Passport / Proof of Address" labels
# (proposal § Layer 3 A-1 / Additional findings) -- both pages now render this
# one canonical label from the server.
REQUIRED_DOCS: tuple[DocSpec, ...] = (
    DocSpec(
        key="identity_proof",
        label="ID / Passport / Proof of Address",
        required=True,
        periodic_review=False,
    ),
    DocSpec(
        key="account_opening_form",
        label="Account Opening Form",
        required=True,
        periodic_review=False,
    ),
    DocSpec(
        key="risk_disclosure",
        label="Risk Disclosure Statement",
        required=True,
        periodic_review=False,
    ),
    DocSpec(key="fatca_crs", label="FATCA / CRS Declaration", required=True, periodic_review=False),
    DocSpec(
        key="source_of_wealth",
        label="Source of Wealth Declaration",
        required=True,
        periodic_review=False,
    ),
    DocSpec(
        key="bank_reference", label="Bank Reference Letter", required=True, periodic_review=False
    ),
    DocSpec(
        key="signed_agreement",
        label="Signed Client Agreement",
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
