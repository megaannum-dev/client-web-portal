from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.eod import (
    EodBreakRecord,
    EodLeg,  # noqa: F401 -- kept per §6 contract import list; re-exported for callers
    EodOutcome,
    EodRecord,
    EodStatus,
)
from app.models.recon import ReconSession
from app.models.reconciliation import Order


class EodRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- day-level session resolution (§B) ---------------------------------
    def sessions_for_trade_date(self, trade_date: date) -> list[ReconSession]:
        return self.db.query(ReconSession).filter(ReconSession.trade_date == trade_date).all()

    # --- completeness gate (§C-2) --------------------------------------------
    def has_unallocated_orders(self, trade_date_yyyymmdd: str) -> bool:
        return (
            self.db.query(Order)
            .filter(Order.allocated_run_id.is_(None), Order.tradeDate == trade_date_yyyymmdd)
            .limit(1)
            .count()
            > 0
        )

    # --- header CRUD ----------------------------------------------------------
    def get_by_trade_date(self, trade_date: date) -> EodRecord | None:
        return self.db.query(EodRecord).filter(EodRecord.trade_date == trade_date).one_or_none()

    def resolve_default_day(self) -> EodRecord | None:
        """Q-3, settled: latest OPEN row, falling back to latest SIGNED."""
        open_row = (
            self.db.query(EodRecord)
            .filter(EodRecord.status == EodStatus.OPEN)
            .order_by(EodRecord.trade_date.desc())
            .first()
        )
        if open_row is not None:
            return open_row
        return (
            self.db.query(EodRecord)
            .filter(EodRecord.status == EodStatus.SIGNED)
            .order_by(EodRecord.trade_date.desc())
            .first()
        )

    def ensure_open(self, trade_date: date) -> EodRecord:
        """Idempotent upsert (§C-1): first session of a day creates an OPEN
        header; every later call for the same date is a no-op. Relies on
        eod_records' UNIQUE(trade_date) — callers run inside the same
        transaction as the caller's own commit boundary (PTA's run())."""
        existing = self.get_by_trade_date(trade_date)
        if existing is not None:
            return existing
        record = EodRecord(id=uuid.uuid4(), trade_date=trade_date, status=EodStatus.OPEN)
        self.db.add(record)
        self.db.flush()
        return record

    # --- sign-off write (§C-3) -------------------------------------------------
    def write_snapshot_and_sign(
        self,
        record: EodRecord,
        *,
        signed_off_by: str,
        signed_off_at: datetime,
        order_count: int,
        execution_count: int,
        notional_total: str,
        break_rows: list[dict],
        file_storage_key: str,
    ) -> EodRecord:
        break_total = len(break_rows)
        record.status = EodStatus.SIGNED
        record.signed_off_by = signed_off_by
        record.signed_off_at = signed_off_at
        record.order_count = order_count
        record.execution_count = execution_count
        record.notional_total = notional_total  # type: ignore[assignment]  # Decimal-compatible str/Decimal accepted by the column
        record.break_total = break_total
        record.outcome = EodOutcome.CLEAR if break_total == 0 else EodOutcome.EXCEPTIONS
        record.file_storage_key = file_storage_key
        self.db.add_all(
            [EodBreakRecord(id=uuid.uuid4(), eod_record_id=record.id, **row) for row in break_rows]
        )
        self.db.flush()
        return record

    def break_rows_for(self, record: EodRecord) -> list[EodBreakRecord]:
        return self.db.query(EodBreakRecord).filter(EodBreakRecord.eod_record_id == record.id).all()
