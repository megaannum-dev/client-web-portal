# `admin_audit_events.at` is a whole-second DATETIME on MariaDB, so paging on `at`
# alone would skip rows sharing a second with a page's last row.

from __future__ import annotations

from datetime import datetime, timezone

from tests.libs.access.conftest import make_audit


def test_paging_with_before_id_visits_same_second_rows_exactly_once(world, api_client, session):
    at = datetime(2020, 1, 1, tzinfo=timezone.utc)  # older than anything the fixtures write
    for i in range(5):
        make_audit(session, event=f"tie{i}", detail=f"row {i}", at=at)

    http, _ = api_client
    seen: list[str] = []
    params: dict[str, object] = {"limit": 2}
    while True:
        page = http.get("/api/admin/audit", params=params).json()
        if not page:
            break
        seen += [row["event"] for row in page]
        params = {"limit": 2, "before": page[-1]["at"], "before_id": page[-1]["id"]}

    assert sorted(e for e in seen if e.startswith("tie")) == [f"tie{i}" for i in range(5)]
