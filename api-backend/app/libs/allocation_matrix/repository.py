"""Allocation matrix repositories — split from app/libs/pc/repository.py (007-A).

AllocationRepository and MatrixReadRepository. Pure DB access, no business logic.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.pc import (
    AllocationModelSnapshot,
    AllocationPeriod,
    PeriodStatus,
)
from app.libs.trade_models.repository import _SubscriptionCell, _WatermarkResult

# Exported alias — allocation_matrix code uses AllocationCellRow throughout.
AllocationCellRow = _SubscriptionCell


# ---------------------------------------------------------------------------
# AllocationRepository
# ---------------------------------------------------------------------------


class AllocationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_periods(self) -> list[AllocationPeriod]:
        return (
            self.db.query(AllocationPeriod)
            .order_by(AllocationPeriod.created_at.desc())
            .all()
        )

    def get_period(self, period_id: uuid.UUID) -> AllocationPeriod | None:
        return (
            self.db.query(AllocationPeriod)
            .filter(AllocationPeriod.id == period_id)
            .one_or_none()
        )

    def get_open_period(self) -> AllocationPeriod | None:
        return (
            self.db.query(AllocationPeriod)
            .filter(AllocationPeriod.status == PeriodStatus.OPEN)
            .one_or_none()
        )

    def create_period(self, label: str) -> AllocationPeriod:
        period = AllocationPeriod(
            id=uuid.uuid4(),
            label=label,
            status=PeriodStatus.OPEN,
        )
        self.db.add(period)
        self.db.flush()
        return period

    def confirm_period(
        self, period_id: uuid.UUID, actor: str, confirmed_at: datetime
    ) -> AllocationPeriod | None:
        period = self.get_period(period_id)
        if period is None:
            return None
        period.status = PeriodStatus.CONFIRMED
        period.confirmed_by = actor
        period.confirmed_at = confirmed_at
        self.db.flush()
        return period

    def write_snapshots(
        self, period_id: uuid.UUID, rows: list[dict]
    ) -> None:
        """Insert one AllocationModelSnapshot row per cell dict."""
        for row in rows:
            snap = AllocationModelSnapshot(
                period_id=period_id,
                user_id=row["user_id"],
                model_id=row["model_id"],
                multiplier=row["multiplier"],
                model_size=row.get("model_size"),
                ib_account=row.get("ib_account"),
            )
            self.db.add(snap)
        self.db.flush()

    def find_by_label(self, label: str) -> AllocationPeriod | None:
        return (
            self.db.query(AllocationPeriod)
            .filter(AllocationPeriod.label == label)
            .one_or_none()
        )

    def read_snapshots(self, period_id: uuid.UUID) -> list[AllocationModelSnapshot]:
        return (
            self.db.query(AllocationModelSnapshot)
            .filter(AllocationModelSnapshot.period_id == period_id)
            .all()
        )


# ---------------------------------------------------------------------------
# MatrixReadRepository (stub — future read-path optimisations)
# ---------------------------------------------------------------------------


class MatrixReadRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def cell_and_roster_stream(self) -> list:
        """
        UNION ALL: subscription cells (LIVE models only) + client roster.
        Returns raw Row objects with fields:
          row_kind, user_id, model_id, multiplier, model_size, ib_account,
          name, email, firebase_uid
        """
        sql = text("""
            SELECT 'cell'   AS row_kind,
                   cs.user_id, cs.model_id, cs.multiplier, m.model_size,
                   cp.ib_account, NULL AS name, NULL AS email, NULL AS firebase_uid
              FROM client_subscriptions cs
              JOIN models          m  ON m.id = cs.model_id AND m.status = 'live'
              JOIN client_profiles cp ON cp.user_id = cs.user_id
            UNION ALL
            SELECT 'client' AS row_kind,
                   u.id     AS user_id, NULL AS model_id, NULL AS multiplier,
                   NULL     AS model_size, cp.ib_account, cp.name, u.email,
                   u.firebase_uid
              FROM users u
              JOIN client_profiles cp ON cp.user_id = u.id
             WHERE u.portal = 'client'
        """)
        return self.db.execute(sql).fetchall()

    def live_models_with_aggregates(self) -> list:
        """
        LIVE models with pre-aggregated col_units / col_fund.
        Returns raw Row objects with fields:
          id, name, model_size, col_units, col_fund
        """
        sql = text("""
            SELECT m.id, m.name, m.model_size,
                   COALESCE(SUM(cs.multiplier), 0)                AS col_units,
                   COALESCE(SUM(cs.multiplier * m.model_size), 0) AS col_fund
              FROM models m
              LEFT JOIN client_subscriptions cs ON cs.model_id = m.id
             WHERE m.status = 'live'
             GROUP BY m.id, m.name, m.model_size
        """)
        return self.db.execute(sql).fetchall()

    def combined_watermarks(self) -> dict:
        """
        Three (max_updated_at, count) probes in one round-trip.
        Returns dict with keys: subs, models, clients — each a _WatermarkResult.
        """
        sql = text("""
            SELECT
              (SELECT MAX(updated_at) FROM client_subscriptions) AS subs_max,
              (SELECT COUNT(*)        FROM client_subscriptions) AS subs_cnt,
              (SELECT MAX(updated_at) FROM models WHERE status = 'live') AS models_max,
              (SELECT COUNT(*)        FROM models WHERE status = 'live') AS models_cnt,
              (SELECT MAX(updated_at) FROM client_profiles)      AS clients_max,
              (SELECT COUNT(*)        FROM client_profiles)      AS clients_cnt
        """)
        row = self.db.execute(sql).one()
        return {
            "subs":    _WatermarkResult(row.subs_max,    row.subs_cnt    or 0),
            "models":  _WatermarkResult(row.models_max,  row.models_cnt  or 0),
            "clients": _WatermarkResult(row.clients_max, row.clients_cnt or 0),
        }
