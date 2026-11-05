# Static checks on revision 0049 (no DB): inspects the migration source only.
import glob
import inspect
from pathlib import Path

API_BACKEND_DIR = Path(__file__).resolve().parents[2]
BACKUP = "pc_role_merge_backup_0049"


def _load():
    (path,) = glob.glob(str(API_BACKEND_DIR / "alembic" / "versions" / "*_0049_merge_pc_role_into_pm.py"))
    ns: dict = {"__file__": path}
    exec(compile(Path(path).read_text(encoding="utf-8"), path, "exec"), ns)
    return ns


def _src(fn) -> str:
    return inspect.getsource(fn)


def test_revision_chain():
    ns = _load()
    assert ns["revision"] == "c4e8a1d6f035"
    assert ns["down_revision"] == "b7d2e9f4a1c3"


def test_backup_and_snapshots_precede_first_mutation():
    up = _src(_load()["upgrade"])
    first_mutation = min(up.index('"UPDATE '), up.index('"DELETE '))
    assert up.index(f"CREATE TABLE {BACKUP}") < first_mutation
    assert up.rindex(f"INSERT INTO {BACKUP}") < first_mutation


def test_collision_delete_precedes_role_update():
    up = _src(_load()["upgrade"])
    assert up.index('"DELETE pc FROM page_access') < up.index("UPDATE page_access SET role = 'PM'")


def test_upgrade_covers_every_table():
    up = _src(_load()["upgrade"])
    for t in (
        "page_access",
        "admin_profiles",
        "ic_notes",
        "sop_versions",
        "client_allotment_redemptions",
        "page_access_overrides",
    ):
        assert t in up, t


def test_downgrade_restores_then_drops_backup_last():
    down = _src(_load()["downgrade"])
    assert BACKUP in down
    assert down.rindex(BACKUP) == down.index(f"DROP TABLE {BACKUP}") + len("DROP TABLE ")


def test_downgrade_backup_key_joins_are_binary():
    # The backup table gets the server default collation (uca1400), the app tables are
    # utf8mb4_unicode_ci; a plain `=` across them raises MariaDB error 1267.
    import re

    down = _src(_load()["downgrade"])
    joins = re.findall(r"[\w. ()]*b\.pk[\w. ()]*=[\w. ()]*|=\s*BINARY b\.pk", down)
    assert joins, "expected backup-key joins in downgrade"
    assert all("BINARY" in j for j in joins), joins
