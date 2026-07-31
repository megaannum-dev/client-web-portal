import enum


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
