from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.post_trade_allocation import ClientPortfolioRunDelta


class CRMAdapter:
    def __init__(self, db: Session) -> None:
        self.db = db

    def total_portfolio_delta_for_run(self, run_id: uuid.UUID) -> Decimal:
        total = (
            self.db.query(func.sum(ClientPortfolioRunDelta.delta))
            .filter(ClientPortfolioRunDelta.run_id == run_id)
            .scalar()
        )
        return total or Decimal("0")

    def portfolio_delta_for_run(self, run_id: uuid.UUID, user_id: uuid.UUID) -> Decimal:
        row = self.db.get(ClientPortfolioRunDelta, {"run_id": run_id, "user_id": user_id})
        if row is None:
            return Decimal("0")
        return row.delta
