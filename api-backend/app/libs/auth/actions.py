import enum

from app.models.users import UserRole


class Action(str, enum.Enum):
    FINANCIAL_SUBMIT = "financial:submit"
    FINANCIAL_MANAGE = "financial:manage"
    FINANCIAL_VIEW_ALL = "financial:view_all"

    COMPLIANCE_VIEW = "compliance:view"
    COMPLIANCE_REVIEW = "compliance:review"

    ANALYTICS_VIEW = "analytics:view"
    ANALYTICS_CROSS_PORTFOLIO = "analytics:cross_portfolio"
    ANALYTICS_EXPORT = "analytics:export"

    CLIENT_VIEW = "clients:view"
    CLIENT_MANAGE = "clients:manage"
    CLIENT_SUBMIT_ON_BEHALF = "clients:submit_on_behalf"

    DOCUMENT_VIEW_OWN = "documents:view_own"
    DOCUMENT_SUBMIT_OWN = "documents:submit_own"
    DOCUMENT_VIEW_ALL = "documents:view_all"

    USER_VIEW = "admin:user_view"
    USER_MANAGE = "admin:user_manage"


ROLE_ACTIONS: dict[UserRole, set[Action]] = {
    UserRole.CLIENT: {
        Action.DOCUMENT_VIEW_OWN,
        Action.DOCUMENT_SUBMIT_OWN,
    },
    UserRole.RM: {
        Action.FINANCIAL_SUBMIT,
        Action.CLIENT_VIEW,
        Action.CLIENT_MANAGE,
        Action.CLIENT_SUBMIT_ON_BEHALF,
    },
    UserRole.PM: {
        Action.FINANCIAL_MANAGE,
        Action.FINANCIAL_VIEW_ALL,
        Action.ANALYTICS_VIEW,
        Action.ANALYTICS_EXPORT,
        Action.DOCUMENT_VIEW_ALL,
        Action.USER_VIEW,
    },
    UserRole.PC: {
        Action.FINANCIAL_MANAGE,
        Action.FINANCIAL_VIEW_ALL,
        Action.COMPLIANCE_VIEW,
        Action.ANALYTICS_VIEW,
        Action.ANALYTICS_CROSS_PORTFOLIO,
        Action.ANALYTICS_EXPORT,
        Action.CLIENT_VIEW,
        Action.DOCUMENT_VIEW_ALL,
        Action.USER_VIEW,
    },
    UserRole.COMPLIANCE: {
        Action.FINANCIAL_VIEW_ALL,
        Action.COMPLIANCE_VIEW,
        Action.COMPLIANCE_REVIEW,
        Action.ANALYTICS_VIEW,
        Action.ANALYTICS_EXPORT,
        Action.DOCUMENT_VIEW_ALL,
        Action.USER_VIEW,
    },
    UserRole.ADMIN: set(Action),
}


def get_actions_for_role(role: UserRole) -> set[Action]:
    """Today: reads from hardcoded dict. Tomorrow: replace body with a DB query."""
    return ROLE_ACTIONS.get(role, set())
