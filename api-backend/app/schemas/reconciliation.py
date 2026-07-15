from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class RcExecOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    qty: str
    px: str
    t: str
    st: str


class RcOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: str
    m: str
    inst: str
    cat: str
    side: str
    qty: str
    px: str
    not_: str = Field(alias="not")
    notVal: float
    ref: str
    ib: str
    st: str
    execs: list[RcExecOut]
    brk: str | None = None


class RcAllocModelLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    m: str
    units: float
    amt: str
    amtVal: float
    st: str
    note: str | None = None


class RcAllocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    cid: str
    client: str
    st: str
    total: str
    totalVal: float
    models: list[RcAllocModelLineOut]


class RcPortOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    cid: str
    client: str
    st: str
    pre: str
    post: str
    chg: str
    pct: str
    inTrade: float
    cash: float
    total: float


class RcBreakCountsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    algIbBrk: int
    ibCrmBrk: int
    algCrmBrk: int
    totalBrk: int


class ReconciliationFlowViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    settleDay: str
    orders: list[RcOrderOut]
    allocs: list[RcAllocOut]
    ports: list[RcPortOut]
    algoTotal: str
    ibTotal: str
    crmTotal: str
    counts: RcBreakCountsOut
