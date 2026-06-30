"""Allocation matrix repositories — split from app/libs/pc/repository.py (007-A).

AllocationRepository and MatrixReadRepository. Pure DB access, no business logic.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.pc import (
    AllocationModelSnapshot,
    AllocationPeriod,
    PeriodStatus,
)
from app.libs.trade_models.repository import _SubscriptionCell

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
