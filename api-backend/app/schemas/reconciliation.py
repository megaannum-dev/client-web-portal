from __future__ import annotations

from pydantic import BaseModel, ConfigDict

# ---- Flat trade-record spreadsheet (GET /mobo/trade-records) ----------------
# Display-only projection of orders + trades; every value arrives pre-formatted
# so the frontend stays a pure view. See app/libs/reconciliation/records.py.


class TradeRecordRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sys: str
    ref: str
    tradeId: str
    tradeDate: str
    mkt: str
    stock: str
    price: str
    qty: str
    txnType: str
    time: str
    status: str
    isFirst: bool


class TradeRecordsViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    day: str
    dates: list[str]
    rows: list[TradeRecordRowOut]
