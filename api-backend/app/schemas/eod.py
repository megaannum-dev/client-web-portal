from __future__ import annotations

import enum

from pydantic import BaseModel, ConfigDict

from app.schemas.reconciliation import RcAllocOut, RcBreakCountsOut, RcOrderOut, RcPortOut


class EodStatus(str, enum.Enum):
    OPEN = "OPEN"
    SIGNED = "SIGNED"


class EodOutcome(str, enum.Enum):
    CLEAR = "CLEAR"
    EXCEPTIONS = "EXCEPTIONS"


class EodReportViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    settleDay: str
    tradeDate: str
    orders: list[RcOrderOut]
    allocs: list[RcAllocOut]
    ports: list[RcPortOut]
    algoTotal: str
    ibTotal: str
    crmTotal: str
    counts: RcBreakCountsOut
    status: EodStatus
    signedOffBy: str | None = None
    signedOffAt: str | None = None
    generated: str | None = None
    orderCount: int
    executionCount: int
    notionalTraded: str
    breakTotal: int
    outcome: EodOutcome
    canSignOff: bool
    exportReady: bool


class EodSignOffReq(BaseModel):
    tradeDate: str
