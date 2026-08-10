# api-backend/app/libs/client_portal/repository.py
"""SQLAlchemy queries owned by the client_portal package.

Skeleton only (BE-1) -- later units (BE-3 onward) add one query method per
data shape (positions, portfolio row, history rows, recommended models,
material lookup, ticket CRUD, RM contact lookup).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import Row, and_, exists, func
from sqlalchemy.orm import Session

from app.models.onboarding import ClientTicket
from app.models.onboarding import TicketStatus as DbTicketStatus
from app.models.pc import ClientIbAccount, ClientSubscription, Model, ModelMaterial, ModelStatus
from app.models.post_trade_allocation import (
    ClientPortfolio,
    ClientPortfolioRunDelta,
    PostTradeAllocation,
    PostTradeAllocationRun,
)
from app.models.users import AdminProfile, User


class ClientPortalRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ---------- Profile (BE-2) ----------
    def rm_contact_row(self, rm_uid: str) -> Row | None:
        return (
            self.db.query(User.email, AdminProfile.name, AdminProfile.phone_number)
            .join(AdminProfile, AdminProfile.user_id == User.id)
            .filter(User.firebase_uid == rm_uid)
            .one_or_none()
        )

    # ---------- Portfolio (BE-3) ----------
    def get_portfolio(self, user_id: uuid.UUID) -> ClientPortfolio | None:
        return self.db.get(ClientPortfolio, user_id)  # DB B-3: may be None

    def has_subscription(self, user_id: uuid.UUID, model_id: uuid.UUID) -> bool:
        """True iff this client holds a client_subscriptions row for this model.
        Cheaper single-row existence check for the hot path (BE-15) -- does not
        reuse positions_for_client's join."""
        return (
            self.db.query(ClientSubscription.user_id)
            .filter(
                ClientSubscription.user_id == user_id,
                ClientSubscription.model_id == model_id,
            )
            .first()
            is not None
        )

    def positions_for_client(
        self, user_id: uuid.UUID
    ) -> list[tuple[ClientSubscription, Model, str | None]]:
        rows = (
            self.db.query(ClientSubscription, Model, ClientIbAccount.ib_account)
            .join(Model, Model.id == ClientSubscription.model_id)
            .outerjoin(
                ClientIbAccount,
                and_(ClientIbAccount.model_id == Model.id, ClientIbAccount.user_id == user_id),
            )
            .filter(ClientSubscription.user_id == user_id)
            .order_by(Model.name)  # § 4.1: "name-sorted"
            .all()
        )
        return rows  # type: ignore[return-value]

    # ---------- Portfolio history (BE-4) ----------
    def history_delta_rows(self, user_id: uuid.UUID) -> list[tuple[str, Decimal]]:
        """(month "YYYYMM", delta) for every client_portfolio_run_deltas row of
        this client, oldest first. No date parsing: substr() on the existing
        YYYYMMDD token."""
        month = func.substr(PostTradeAllocationRun.trade_date, 1, 6)
        rows = (
            self.db.query(month.label("month"), ClientPortfolioRunDelta.delta)
            .join(
                PostTradeAllocationRun, PostTradeAllocationRun.id == ClientPortfolioRunDelta.run_id
            )
            .filter(ClientPortfolioRunDelta.user_id == user_id)
            .order_by(PostTradeAllocationRun.trade_date.asc())
            .all()
        )
        return [(r.month, r.delta) for r in rows]

    def history_per_model_rows(self, user_id: uuid.UUID) -> list[tuple[str, str, Decimal]]:
        """(month, model_name, allocated) for every post_trade_allocations row
        of this client, oldest first."""
        month = func.substr(PostTradeAllocationRun.trade_date, 1, 6)
        rows = (
            self.db.query(
                month.label("month"), PostTradeAllocation.model_name, PostTradeAllocation.allocated
            )
            .join(PostTradeAllocationRun, PostTradeAllocationRun.id == PostTradeAllocation.run_id)
            .filter(PostTradeAllocation.user_id == user_id)
            .order_by(PostTradeAllocationRun.trade_date.asc())
            .all()
        )
        return [(r.month, r.model_name, r.allocated) for r in rows]

    # ---------- Models (BE-5) ----------
    def recommended_models(self, exclude_ids: set[uuid.UUID]) -> list[Model]:
        q = self.db.query(Model).filter(Model.status == ModelStatus.LIVE)
        if exclude_ids:
            q = q.filter(~Model.id.in_(exclude_ids))
        return q.order_by(Model.name).all()

    def has_material(self, model_id: uuid.UUID) -> bool:
        return self.db.query(exists().where(ModelMaterial.model_id == model_id)).scalar()

    def latest_material(self, model_id: uuid.UUID) -> ModelMaterial | None:
        return (
            self.db.query(ModelMaterial)
            .filter(ModelMaterial.model_id == model_id)
            .order_by(ModelMaterial.version_no.desc())
            .first()
        )

    # ---------- Tickets (BE-12) ----------
    def create_ticket(
        self,
        *,
        user_id: uuid.UUID,
        assigned_rm_uid: str | None,
        kind: str,
        model_id: uuid.UUID | None,
        subject: str | None,
        category: str | None,
        amount: Decimal | None,
        multiplier: Decimal | None,
        currency: str,
        message: str,
    ) -> ClientTicket:
        ticket = ClientTicket(
            id=uuid.uuid4(),
            user_id=user_id,
            assigned_rm_uid=assigned_rm_uid,
            reference=f"REQ-{uuid.uuid4().hex[:6].upper()}",
            kind=kind,
            status=DbTicketStatus.NEW.value,
            model_id=model_id,
            subject=subject,
            category=category,
            amount=amount,
            multiplier=multiplier,
            currency=currency,
            message=message,
        )
        self.db.add(ticket)
        self.db.flush()
        return ticket

    def list_for_rm(self, *, rm_uid: str, full_visibility: bool) -> list[ClientTicket]:
        q = self.db.query(ClientTicket)
        if not full_visibility:
            q = q.filter(ClientTicket.assigned_rm_uid == rm_uid)
        return q.order_by(ClientTicket.created_at.desc()).all()

    def get_ticket_by_ref(self, ref: str) -> ClientTicket | None:
        return self.db.query(ClientTicket).filter(ClientTicket.reference == ref).one_or_none()

    # ---------- Requests & tickets (BE-13) ----------
    def list_for_client(self, user_id: uuid.UUID) -> list[ClientTicket]:
        return (
            self.db.query(ClientTicket)
            .filter(ClientTicket.user_id == user_id)
            .order_by(ClientTicket.created_at.desc())
            .all()
        )
