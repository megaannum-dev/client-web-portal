"""Post-trade allocation response schemas.

The frozen wire contract for `/api/mobo/post-trade-allocation` and friends —
see docs/implementations/011-2026-07-13-post-trade-allocation-be.md § 7 / § BE-5.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PtaClientShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    clientId: str
    name: str
    units: float
    allocated: float
    pct: int


class PtaModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    acct: str
    traded: float  # Σ proceeds, SIGNED — negative on a losing day (D-3)
    unitsTotal: float
    clientShares: list[PtaClientShareOut]


class PostTradeAllocationView(BaseModel):
    """The frozen wire contract — see § 7. Money crosses as JSON numbers in
    MAJOR units, not Decimal strings (contrast the reconciliation DTOs)."""

    tradeDate: str  # YYYY-MM-DD, ET token (D-6)
    settleDay: str  # display label; == tradeDate formatted today (Q-3)
    grandTotal: float
    models: list[PtaModelOut]


class PtaRunListEntryOut(BaseModel):
    date: str
    label: str
    grandTotal: float


class PtaRunListOut(BaseModel):
    runs: list[PtaRunListEntryOut]


class PtaRunResultOut(BaseModel):
    newRuns: list[PtaRunListEntryOut]
    latest: PostTradeAllocationView
