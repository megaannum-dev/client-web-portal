from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.post_trade_allocation import PostTradeAllocation
from app.models.reconciliation import Order
from app.models.users import ClientProfile


class IBAdapter:
    def __init__(self, db: Session) -> None:
        self.db = db

    def total_allocated(self, run_id: uuid.UUID) -> Decimal:
        total = (
            self.db.query(func.sum(PostTradeAllocation.allocated))
            .filter(PostTradeAllocation.run_id == run_id)
            .scalar()
        )
        return total or Decimal("0")

    def allocated_for_client_model(
        self, run_id: uuid.UUID, client_id: int, model_id: uuid.UUID
    ) -> Decimal:
        total = (
            self.db.query(func.sum(PostTradeAllocation.allocated))
            .join(ClientProfile, ClientProfile.user_id == PostTradeAllocation.user_id)
            .filter(
                PostTradeAllocation.run_id == run_id,
                PostTradeAllocation.model_id == model_id,
                ClientProfile.id == client_id,
            )
            .scalar()
        )
        return total or Decimal("0")

    def allocated_for_client_model_total(self, run_id: uuid.UUID, client_id: int) -> Decimal:
        """Sum of allocated across all models for one (run, client) pair."""
        total = (
            self.db.query(func.sum(PostTradeAllocation.allocated))
            .join(ClientProfile, ClientProfile.user_id == PostTradeAllocation.user_id)
            .filter(
                PostTradeAllocation.run_id == run_id,
                ClientProfile.id == client_id,
            )
            .scalar()
        )
        return total or Decimal("0")

    def matching_order(
        self, *, symbol: str, buy_sell: str, trade_date_yyyymmdd: str, model_name: str
    ) -> Order | None:
        """Join key: (symbol, side, trade_date, model) — implicit attribute join
        (proposal Q-3, resolved: keep this for now; revisit once a real
        AlgoTrade API sample exists)."""
        return (
            self.db.query(Order)
            .filter(
                Order.symbol == symbol,
                Order.buySell == buy_sell,
                Order.tradeDate == trade_date_yyyymmdd,
                Order.model == model_name,
            )
            .one_or_none()
        )
