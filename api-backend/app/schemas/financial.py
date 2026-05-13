from datetime import date
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field, model_validator


class AllotmentStatus(str, Enum):
    RECEIVED = "RECEIVED"
    VALIDATED = "VALIDATED"
    SCHEDULED = "SCHEDULED"
    SETTLED = "SETTLED"
    REJECTED = "REJECTED"


class RedemptionStatus(str, Enum):
    RECEIVED = "RECEIVED"
    COMPLIANCE_REVIEW = "COMPLIANCE_REVIEW"
    APPROVED = "APPROVED"
    SETTLED = "SETTLED"
    REJECTED = "REJECTED"


class AllotmentRequest(BaseModel):
    """Inbound capital / subscription allotment (placeholder fields for business rules)."""

    client_reference: str = Field(..., min_length=1, max_length=64)
    fund_code: str = Field(..., min_length=1, max_length=32)
    amount: Decimal = Field(..., gt=0, max_digits=18, decimal_places=4)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    value_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class AllotmentResponse(BaseModel):
    request_id: str
    status: AllotmentStatus
    message: str | None = None


class RedemptionRequest(BaseModel):
    """Outbound redemption / withdrawal (placeholder fields for business rules)."""

    client_reference: str = Field(..., min_length=1, max_length=64)
    fund_code: str = Field(..., min_length=1, max_length=32)
    units: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=6)
    cash_amount: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=4)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    settlement_preference: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def require_units_or_cash(self) -> "RedemptionRequest":
        if self.units is None and self.cash_amount is None:
            raise ValueError("Provide either units or cash_amount for redemption.")
        return self


class RedemptionResponse(BaseModel):
    request_id: str
    status: RedemptionStatus
    message: str | None = None
