from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.recon import AlgoTradeExecution, AlgoTradeOrder


class AlgoTradeAdapter:
    def __init__(self, db: Session) -> None:
        self.db = db

    def orders_for_session(self, session_id: uuid.UUID) -> list[AlgoTradeOrder]:
        return self.db.query(AlgoTradeOrder).filter(AlgoTradeOrder.session_id == session_id).all()

    def executions_for_order(self, order_id: uuid.UUID) -> list[AlgoTradeExecution]:
        return (
            self.db.query(AlgoTradeExecution)
            .filter(AlgoTradeExecution.order_id == order_id)
            .order_by(AlgoTradeExecution.executed_at)
            .all()
        )

    def total_notional(self, session_id: uuid.UUID) -> Decimal:
        return sum((o.notional for o in self.orders_for_session(session_id)), Decimal("0"))
