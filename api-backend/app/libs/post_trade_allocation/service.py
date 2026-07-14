"""Post-trade allocation service — BE-1 scaffold.

PostTradeAllocationService owns all business logic: the 5-step run() (BE-3),
GET-path view assembly (BE-6). Method bodies land in those later units.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.libs.post_trade_allocation.repository import PostTradeAllocationRepository
from app.models.post_trade_allocation import PostTradeAllocationRun, RunTrigger
from app.schemas.post_trade_allocation import PostTradeAllocationView, PtaRunListOut


class PostTradeAllocationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = PostTradeAllocationRepository(db)

    def run(self, *, trigger: RunTrigger, actor: str | None) -> PostTradeAllocationRun:
        """The 5-step run (aggregate, split, persist, mark orders, portfolios) — see BE-3."""
        raise NotImplementedError

    def get_view(self, trade_date: str | None = None) -> PostTradeAllocationView | None:
        """GET /post-trade-allocation view assembly — see BE-6."""
        raise NotImplementedError

    def list_runs(self, include_empty: bool = False) -> PtaRunListOut:
        """GET /post-trade-allocation/runs view assembly — see BE-6."""
        raise NotImplementedError
