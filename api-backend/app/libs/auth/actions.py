import enum

from app.models.users import AdminRole


class Action(str, enum.Enum):
    USER_VIEW = "admin:user_view"
    USER_WRITE = "admin:user_write"
    CLIENT_VIEW = "clients:view"  # pre-kept for 004 (RM client onboarding)
    CLIENT_WRITE = "clients:write"  # pre-kept for 004 (RM client onboarding)
    # PC workspace — feature 006 (BE-2)
    MODEL_VIEW = "pc:model_view"
    MODEL_WRITE = "pc:model_write"
    ALLOCATION_VIEW = "pc:allocation_view"
    ALLOCATION_WRITE = "pc:allocation_write"
    # Post-Trade Allocation — feature 011 (BE-4)
    POST_TRADE_ALLOCATION_VIEW = "mobo:pta_view"
    POST_TRADE_ALLOCATION_RUN = "mobo:pta_run"
    # Trade Reconciliation — feature 012 (BE-1)
    RECON_VIEW = "mobo:recon_view"
    # EoD Exception Report — feature 015 (BE-6)
    EOD_SIGNOFF = "mobo:eod_signoff"
    # Client Onboarding — feature 013 (BE-4)
    ONBOARDING_WRITE = "onboarding:write"  # RM: start / upload / submit
    ONBOARDING_REVIEW = "onboarding:review"  # COMPLIANCE: verdict / approve / reject / download
    ALLOTMENT_ACKNOWLEDGE = "allotment:acknowledge"  # PC: acknowledge/decide allotments (write)
    ALLOTMENT_VIEW = "pc:allotment_view"  # BE-22 (C-12) — read-only sibling, see above


# Only RM and ADMIN carry actions at this point. MOBO/PM/PC/COMPLIANCE are
# intentionally empty — their real capabilities are defined when their features
# (financial, compliance, analytics) are built, not now. CLIENT_VIEW/CLIENT_WRITE
# are declared but not consumed by any endpoint until 004 mounts the RM client
# onboarding route — a deliberate forward-declaration, not dead code.
ROLE_ACTIONS: dict[AdminRole, set[Action]] = {
    AdminRole.RM: {Action.CLIENT_VIEW, Action.CLIENT_WRITE, Action.ONBOARDING_WRITE},
    AdminRole.MOBO: {
        Action.POST_TRADE_ALLOCATION_VIEW,
        Action.POST_TRADE_ALLOCATION_RUN,
        Action.RECON_VIEW,
        Action.EOD_SIGNOFF,
    },
    AdminRole.PM: set(),
    AdminRole.PC: {
        Action.MODEL_VIEW,
        Action.MODEL_WRITE,
        Action.ALLOCATION_VIEW,
        Action.ALLOCATION_WRITE,
        Action.ALLOTMENT_ACKNOWLEDGE,
    },
    AdminRole.COMPLIANCE: {Action.ONBOARDING_REVIEW},
    AdminRole.ADMIN: set(Action),
}


def get_actions_for_role(role: AdminRole) -> set[Action]:
    """Today: reads from hardcoded dict. Tomorrow: replace body with a DB query."""
    return ROLE_ACTIONS.get(role, set())
