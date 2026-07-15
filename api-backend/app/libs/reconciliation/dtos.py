from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass(frozen=True)
class OrderBreak:
    order_id: uuid.UUID
    field: str  # 'qty' | 'price' | 'notional'
    expected: Decimal
    actual: Decimal
    delta: Decimal


@dataclass(frozen=True)
class ClientModelBreak:
    client_id: int
    model_id: uuid.UUID
    expected: Decimal
    actual: Decimal
    delta: Decimal


@dataclass(frozen=True)
class CrmBreak:
    client_id: int
    expected: Decimal
    actual: Decimal
    delta: Decimal


@dataclass(frozen=True)
class CrmAlgoBreak:
    client_id: int
    model_id: uuid.UUID
    reason: str  # 'ib_crm' | 'ib_algo' | 'both' -- which upstream check(s) failed


@dataclass
class ReconciliationResult:
    coarse_ok: bool
    algo_total: Decimal
    ib_total: Decimal
    crm_total: Decimal
    order_breaks: list[OrderBreak] = field(default_factory=list)
    client_model_breaks: list[ClientModelBreak] = field(default_factory=list)
    crm_breaks: list[CrmBreak] = field(default_factory=list)
    crm_algo_breaks: list[CrmAlgoBreak] = field(default_factory=list)
