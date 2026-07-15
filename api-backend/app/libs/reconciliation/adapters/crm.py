from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.post_trade_allocation import ClientPortfolio


class CRMAdapter:
    def __init__(self, db: Session) -> None:
        self.db = db

    def total_amount_in_trade(self) -> Decimal:
        total = self.db.query(func.sum(ClientPortfolio.amount_in_trade)).scalar()
        return total or Decimal("0")

    def portfolio_delta(self, user_id: uuid.UUID) -> Decimal:
        row = self.db.get(ClientPortfolio, user_id)
        if row is None:
            return Decimal("0")
        return row.amount_in_trade - row.previous_amount_in_trade
