# app/libs/access/pages.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.libs.auth.actions import Action
from app.models.users import AdminRole


def fs(*actions: Action) -> frozenset[Action]:
    return frozenset(actions)


@dataclass(frozen=True)
class PageMeta:
    """Display metadata served to the FE in MatrixOut.pages. Hand-maintained
    mirror of admin-frontend/lib/pages-config.ts PAGES (D-8) — kept honest by a
    test, not by a foreign key or a code generator."""

    page_id: str
    group: str
    label: str
    path: str


# Insertion order IS the wire order of MatrixOut.pages — the FE does not re-sort
# or re-label (§ 7.2). Groups mirror pages-config.ts `subgroup`; the two pages
# with `hideFromNav: true` and no subgroup are grouped "Other", matching the FE's
# `p.subgroup ?? "Other"` fallback (proposal § Layer 3 A-1).
PAGE_META: Final[dict[str, PageMeta]] = {
    "rm.client-info": PageMeta(
        "rm.client-info", "Client Management", "Client Information", "/rm/client-info"
    ),
    "rm.onboarding-renewal": PageMeta(
        "rm.onboarding-renewal",
        "Client Management",
        "Onboarding & Renewal",
        "/rm/onboarding-renewal",
    ),
    "rm.model-subscription": PageMeta(
        "rm.model-subscription", "Client Management", "Model Subscription", "/rm/model-subscription"
    ),
    "rm.request-tickets": PageMeta(
        "rm.request-tickets", "Client Management", "Request Tickets", "/rm/requests"
    ),
    "compliance.review": PageMeta(
        "compliance.review", "Compliance", "Compliance Review", "/compliance/review"
    ),
    "pc.allotment-redemption": PageMeta(
        "pc.allotment-redemption",
        "Client Management",
        "Allotment & Redemption",
        "/pc/allotment-redemption",
    ),
    "pc.allocation-matrix": PageMeta(
        "pc.allocation-matrix", "Trade Management", "Allocation Matrix", "/pc/allocation-matrix"
    ),
    "mobo.post-trade-allocation": PageMeta(
        "mobo.post-trade-allocation",
        "Trade Management",
        "Post-Trade Allocation",
        "/mobo/post-trade-allocation",
    ),
    "mobo.trade-reconciliation": PageMeta(
        "mobo.trade-reconciliation",
        "Trade Management",
        "Trade Reconciliation",
        "/mobo/trade-reconciliation",
    ),
    "mobo.commission-tracking": PageMeta(
        "mobo.commission-tracking",
        "Trade Management",
        "Commission Tracking",
        "/mobo/commission-tracking",
    ),
    "shared.monthly-reports": PageMeta(
        "shared.monthly-reports", "Trade Management", "Monthly Reports (Models)", "/monthly-reports"
    ),
    "pc.model-management": PageMeta(
        "pc.model-management", "System", "Model Management", "/pc/model-management"
    ),
    "admin.enroll-user": PageMeta(
        "admin.enroll-user", "System", "Enroll User", "/admin/enroll-user"
    ),
    "admin.system-config": PageMeta(
        "admin.system-config", "System", "System Config", "/admin/system-config"
    ),
    "mobo.recon-overview": PageMeta(
        "mobo.recon-overview", "Other", "Reconciliation Overview", "/mobo/recon-overview"
    ),
    "compliance.overview": PageMeta(
        "compliance.overview", "Other", "Compliance Overview", "/compliance/overview"
    ),
}

PAGE_IDS: Final[frozenset[str]] = frozenset(PAGE_META)  # 16 members


# (granted at VIEW, ADDED at EDIT). EDIT is a superset: a user at EDIT holds
# VIEW's bucket ∪ EDIT's bucket. An EMPTY EDIT bucket is a deliberate record that
# the page's backend surface has no read/write split — NOT a placeholder to fill
# in. Every action below was verified against the actual `require_action(...)`
# guard on the route(s) that page calls.
PAGE_ACTIONS: Final[dict[str, tuple[frozenset[Action], frozenset[Action]]]] = {
    # ---- RM ----
    # CLIENT_VIEW is safe in a VIEW bucket ONLY after BE-22 moves the ticket-status
    # write (POST /rm/tickets/{ref}/status) onto CLIENT_WRITE — before that fix
    # CLIENT_VIEW guarded that mutation too, and D-11's seed grants `view` here to
    # roles that never held it. See BE-22.
    "rm.client-info": (fs(Action.CLIENT_VIEW), fs(Action.CLIENT_WRITE)),
    # /rm/onboardings — GET (board list) now accepts ONBOARDING_VIEW so a VIEW
    # grant can load the board read-only; every mutating route (start/upload/
    # submit) and the wizard-support/detail/download GETs stay on ONBOARDING_WRITE.
    # MODEL_VIEW is also carried at VIEW: the onboarding/renewal wizard's "Initial
    # Model to Subscribe" dropdown calls GET /pc/models, which is otherwise gated
    # by the separate pc.model-management page -- this page's own bucket must
    # grant it directly so RM can populate that dropdown independent of whatever
    # (possibly revoked) access RM holds on pc.model-management itself.
    "rm.onboarding-renewal": (
        fs(Action.ONBOARDING_VIEW, Action.MODEL_VIEW), fs(Action.ONBOARDING_WRITE)
    ),
    # /rm/subscriptions*, /rm/allotment, /rm/redemption, /rm/…/transaction-detail
    # are ALL guarded by CLIENT_VIEW — reads and writes alike. No write sibling exists.
    "rm.model-subscription": (fs(Action.CLIENT_VIEW), fs()),
    # /rm/tickets, /rm/tickets/{ref}, POST /rm/tickets/{ref}/status — all CLIENT_VIEW.
    "rm.request-tickets": (fs(Action.CLIENT_VIEW), fs()),
    # ---- MOBO ----
    "mobo.recon-overview": (fs(Action.RECON_VIEW), fs()),
    "mobo.trade-reconciliation": (fs(Action.RECON_VIEW), fs()),
    "mobo.commission-tracking": (fs(Action.RECON_VIEW), fs()),
    "mobo.post-trade-allocation": (
        fs(Action.POST_TRADE_ALLOCATION_VIEW),
        fs(Action.POST_TRADE_ALLOCATION_RUN),
    ),
    # ---- PC ----
    "pc.model-management": (fs(Action.MODEL_VIEW), fs(Action.MODEL_WRITE)),
    "pc.allocation-matrix": (fs(Action.ALLOCATION_VIEW), fs(Action.ALLOCATION_WRITE)),
    # BE-22 (C-12/D-16): `view` now reads the page (GET /pc/allotments) and nothing
    # else; `edit` adds acknowledge/decide -- exactly what PC (the only role that
    # held this page before D-11) has today. Was: (fs(ALLOTMENT_ACKNOWLEDGE), fs()) --
    # D-11's seed grants `view` here to RM/MOBO/COMPLIANCE too, and the old bucket's
    # ALLOTMENT_ACKNOWLEDGE guarded the mutating routes as well as the read, which
    # would have been a real read/write conflation once those roles could reach it.
    "pc.allotment-redemption": (fs(Action.ALLOTMENT_VIEW), fs(Action.ALLOTMENT_ACKNOWLEDGE)),
    # ---- COMPLIANCE ----
    # Every /compliance/* route (board read, download, verdict, approve, reject) is
    # guarded by ONBOARDING_REVIEW, so the review page's EDIT bucket carries it and
    # the overview — a read-only dashboard over the same board — carries no action of
    # its own. Empty/empty also means a `view` cell on compliance.review (which the
    # seed gives PC) grants NOTHING -- no role gains verdict/approve rights from a
    # read grant. COMPLIANCE's board reads arrive via its own `edit` on that page.
    "compliance.review": (fs(), fs(Action.ONBOARDING_REVIEW)),
    "compliance.overview": (fs(), fs()),
    # ---- SHARED ----
    # GET /reports/eom-comments is open to any authenticated admin (no view action
    # needed); PUT /reports/eom-comments/{name} is gated by EOM_COMMENT_WRITE, added
    # after this page's own backend (app/libs/reports/) landed.
    "shared.monthly-reports": (fs(), fs(Action.EOM_COMMENT_WRITE)),
    # ---- ADMIN ----
    "admin.enroll-user": (fs(Action.USER_VIEW), fs(Action.USER_WRITE)),
    "admin.system-config": (fs(Action.USER_VIEW), fs(Action.USER_WRITE)),
}


# Action.EOD_SIGNOFF is the one declared action with NO page in the registry — the
# EoD exception-report route was never added to PAGES. It is granted by role, not by
# page, so the resolver cannot silently drop it (proposal § Layer 2 B). ADMIN is
# listed because today's ROLE_ACTIONS[ADMIN] == set(Action); MOBO because it is the
# role that signs off. This constant is the ONLY role→action hardcoding that
# survives C-2, and it exists because a pageless action cannot be expressed by the
# page matrix at all.
PAGELESS_ACTIONS: Final[dict[AdminRole, frozenset[Action]]] = {
    AdminRole.MOBO: fs(Action.EOD_SIGNOFF),
    AdminRole.ADMIN: fs(Action.EOD_SIGNOFF),
}
