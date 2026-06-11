import enum

from app.models.users import AdminRole


class Action(str, enum.Enum):
    USER_VIEW = "admin:user_view"
    USER_MANAGE = "admin:user_manage"
    CLIENT_VIEW = "clients:view"  # pre-kept for 004 (RM client onboarding)
    CLIENT_MANAGE = "clients:manage"  # pre-kept for 004 (RM client onboarding)


# Only RM and ADMIN carry actions at this point. MOBO/PM/PC/COMPLIANCE are
# intentionally empty — their real capabilities are defined when their features
# (financial, compliance, analytics) are built, not now. CLIENT_VIEW/CLIENT_MANAGE
# are declared but not consumed by any endpoint until 004 mounts the RM client
# onboarding route — a deliberate forward-declaration, not dead code.
ROLE_ACTIONS: dict[AdminRole, set[Action]] = {
    AdminRole.RM: {Action.CLIENT_VIEW, Action.CLIENT_MANAGE},
    AdminRole.MOBO: set(),
    AdminRole.PM: set(),
    AdminRole.PC: set(),
    AdminRole.COMPLIANCE: set(),
    AdminRole.ADMIN: set(Action),
}


def get_actions_for_role(role: AdminRole) -> set[Action]:
    """Today: reads from hardcoded dict. Tomorrow: replace body with a DB query."""
    return ROLE_ACTIONS.get(role, set())
