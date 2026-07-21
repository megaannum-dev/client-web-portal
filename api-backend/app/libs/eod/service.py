from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import BinaryIO

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.libs.eod.presenter import merge_day_view
from app.libs.eod.repository import EodRepository
from app.libs.reconciliation.engine import reconcile
from app.libs.reconciliation.formatting import fmt_usd
from app.libs.trade_models.storage import get_storage
from app.models.eod import EodRecord
from app.models.eod import EodStatus as DbEodStatus
from app.schemas.eod import EodOutcome, EodReportViewOut, EodStatus
from app.schemas.reconciliation import RcBreakCountsOut


class EodService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = EodRepository(db)

    def _raw_yyyymmdd(self, trade_date: date) -> str:
        return trade_date.strftime("%Y%m%d")

    def build_day_view(self, trade_date_iso: str | None = None) -> EodReportViewOut:
        record = self._resolve_record(trade_date_iso)
        sessions = self.repo.sessions_for_trade_date(record.trade_date)
        results = [reconcile(self.db, s.id) for s in sessions]
        orders, allocs, ports, algo_total, ib_total, crm_total = merge_day_view(
            self.db, sessions, results
        )

        order_breaks = sum(len(r.order_breaks) for r in results)
        client_model_breaks = sum(len(r.client_model_breaks) for r in results)
        crm_breaks = sum(len(r.crm_breaks) for r in results)
        crm_algo_breaks = sum(len(r.crm_algo_breaks) for r in results)

        can_sign_off = not self.repo.has_unallocated_orders(self._raw_yyyymmdd(record.trade_date))

        if record.status == DbEodStatus.SIGNED:
            # frozen path — serve the snapshot, never recompute (proposal D-3)
            order_count, execution_count = record.order_count, record.execution_count
            notional_total = fmt_usd(Decimal(record.notional_total))
            break_total = record.break_total
            outcome = EodOutcome(record.outcome.value) if record.outcome else EodOutcome.CLEAR
        else:
            order_count = len(orders)
            execution_count = sum(len(o.execs) for o in orders)
            notional_total = ib_total
            break_total = order_breaks + client_model_breaks + crm_breaks
            outcome = EodOutcome.CLEAR if break_total == 0 else EodOutcome.EXCEPTIONS

        return EodReportViewOut(
            settleDay=record.trade_date.strftime("%d %b %Y"),
            tradeDate=record.trade_date.isoformat(),
            orders=orders,
            allocs=allocs,
            ports=ports,
            algoTotal=algo_total,
            ibTotal=ib_total,
            crmTotal=crm_total,
            counts=RcBreakCountsOut(
                algIbBrk=order_breaks + client_model_breaks,
                ibCrmBrk=crm_breaks,
                algCrmBrk=crm_algo_breaks,
                totalBrk=order_breaks + client_model_breaks + crm_breaks + crm_algo_breaks,
            ),
            status=EodStatus(record.status.value),
            signedOffBy=record.signed_off_by,
            signedOffAt=record.signed_off_at.isoformat() if record.signed_off_at else None,
            generated=record.signed_off_at.strftime("%H:%M GMT") if record.signed_off_at else None,
            orderCount=order_count,
            executionCount=execution_count,
            notionalTraded=notional_total,
            breakTotal=break_total,
            outcome=outcome,
            canSignOff=can_sign_off,
            exportReady=(
                record.status == DbEodStatus.SIGNED and record.file_storage_key is not None
            ),
        )

    def export(self, trade_date_iso: str | None) -> tuple[BinaryIO, str]:
        record = self._resolve_record(trade_date_iso)
        if record.status != DbEodStatus.SIGNED or record.file_storage_key is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This day has not been signed off yet")
        stream = get_storage().open(record.file_storage_key)
        filename = f"EoD-{record.trade_date.isoformat()}.pdf"
        return stream, filename

    def _resolve_record(self, trade_date_iso: str | None) -> EodRecord:
        from fastapi import HTTPException, status

        if trade_date_iso is not None:
            record = self.repo.get_by_trade_date(date.fromisoformat(trade_date_iso))
        else:
            record = self.repo.resolve_default_day()
        if record is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No EoD day exists yet")
        return record
