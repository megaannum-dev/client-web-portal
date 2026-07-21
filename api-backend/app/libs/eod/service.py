from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO
from typing import BinaryIO

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.libs.eod.pdf import get_renderer
from app.libs.eod.presenter import merge_day_view
from app.libs.eod.repository import EodRepository
from app.libs.reconciliation.dtos import ReconciliationResult
from app.libs.reconciliation.engine import reconcile
from app.libs.reconciliation.formatting import fmt_usd
from app.libs.trade_models.storage import get_storage
from app.models.eod import EodLeg, EodRecord
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

    def sign_off(self, trade_date_iso: str, signed_off_by: str) -> EodReportViewOut:
        trade_date = date.fromisoformat(trade_date_iso)
        record = self.repo.get_by_trade_date(trade_date)
        if record is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No EoD day exists yet")
        if record.status == DbEodStatus.SIGNED:
            raise HTTPException(status.HTTP_409_CONFLICT, "This day is already signed off")

        raw = self._raw_yyyymmdd(trade_date)
        if self.repo.has_unallocated_orders(raw):
            raise HTTPException(
                status.HTTP_409_CONFLICT, "This day is not yet complete — unallocated orders remain"
            )

        sessions = self.repo.sessions_for_trade_date(trade_date)
        results = [reconcile(self.db, s.id) for s in sessions]
        orders, _, _, _, _, _ = merge_day_view(self.db, sessions, results)

        break_rows = self._flatten_break_rows(results)
        execution_count = sum(len(o.execs) for o in orders)
        # Sum the raw per-session Decimals directly rather than re-parsing
        # merge_day_view's already-formatted `$X,XXX`/`$X.XXM` string (fmt_usd's
        # "M" suffix above $1M isn't Decimal-parseable) -- cleaner and avoids
        # a presenter.py change, which is out of this unit's scope.
        notional_total = sum((r.ib_total for r in results), Decimal("0"))

        self.repo.write_snapshot_and_sign(
            record,
            signed_off_by=signed_off_by,
            signed_off_at=datetime.now(timezone.utc),
            order_count=len(orders),
            execution_count=execution_count,
            notional_total=str(notional_total),
            break_rows=break_rows,
            file_storage_key="",  # placeholder -- replaced below once the PDF is rendered
        )
        self.db.flush()

        pdf_bytes = get_renderer().render(trade_date_iso)
        month_subdir = trade_date.strftime("%Y-%m")
        storage_key = get_storage().save(
            BytesIO(pdf_bytes),
            suggested_name=f"EoD-{trade_date_iso}.pdf",
            content_type="application/pdf",
            subdir=month_subdir,
        )
        record.file_storage_key = storage_key
        self.db.commit()
        self.db.refresh(record)

        return self.build_day_view(trade_date_iso)

    def _flatten_break_rows(self, results: list[ReconciliationResult]) -> list[dict]:
        """One `eod_break_records` row per engine break (proposal § Layer 1 B-2),
        leg-tagged per `app.models.eod.EodLeg` -- only the columns relevant to
        that leg are populated (mirrors reconciliation.presenter's per-leg row
        shape). `crm_algo_breaks` are intentionally excluded: they're the
        derived Step-4 diagnostic, not one of the three authoritative legs
        (same exclusion build_day_view's breakTotal already makes)."""
        rows: list[dict] = []
        for result in results:
            for ob in result.order_breaks:
                rows.append(
                    {
                        "leg": EodLeg.IB_ALGO,
                        "subject_ref": str(ob.order_id),
                        "break_type": f"order_{ob.field}",
                        "field": ob.field,
                        "expected": ob.expected,
                        "actual": ob.actual,
                        "delta": ob.delta,
                        "order_id": ob.order_id,
                        "client_id": None,
                        "model_id": None,
                    }
                )
            for cmb in result.client_model_breaks:
                rows.append(
                    {
                        "leg": EodLeg.ALGO_CLIENT,
                        "subject_ref": f"client:{cmb.client_id} model:{cmb.model_id}",
                        "break_type": "allocation_notional",
                        "field": "notional",
                        "expected": cmb.expected,
                        "actual": cmb.actual,
                        "delta": cmb.delta,
                        "order_id": None,
                        "client_id": cmb.client_id,
                        "model_id": cmb.model_id,
                    }
                )
            for crb in result.crm_breaks:
                rows.append(
                    {
                        "leg": EodLeg.CLIENT_CRM,
                        "subject_ref": f"client:{crb.client_id}",
                        "break_type": "portfolio_notional",
                        "field": "notional",
                        "expected": crb.expected,
                        "actual": crb.actual,
                        "delta": crb.delta,
                        "order_id": None,
                        "client_id": crb.client_id,
                        "model_id": None,
                    }
                )
        return rows

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
