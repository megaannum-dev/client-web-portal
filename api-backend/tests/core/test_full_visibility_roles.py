# core.config.FULL_VISIBILITY_ROLES: the single firm-wide client-visibility allowlist.
#
# Run: .venv/Scripts/python.exe -m pytest -q tests/core/test_full_visibility_roles.py

from app.core.config import FULL_VISIBILITY_ROLES
from app.models.users import AdminRole


def test_every_entry_is_a_valid_admin_role():
    assert all(r in {m.value for m in AdminRole} for r in FULL_VISIBILITY_ROLES)


def test_only_admin_is_firm_wide():
    assert AdminRole.ADMIN in FULL_VISIBILITY_ROLES
    assert AdminRole.COMPLIANCE not in FULL_VISIBILITY_ROLES
    assert AdminRole.RM not in FULL_VISIBILITY_ROLES
