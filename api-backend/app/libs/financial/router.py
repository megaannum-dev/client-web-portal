from typing import Annotated

from fastapi import APIRouter, Depends

from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.financial.service import process_allotment, process_redemption
from app.models.users import User
from app.schemas.financial import (
    AllotmentRequest,
    AllotmentResponse,
    RedemptionRequest,
    RedemptionResponse,
)

router = APIRouter(prefix="/financial", tags=["financial"])


@router.post("/allotments", response_model=AllotmentResponse)
def create_allotment(
    body: AllotmentRequest,
    user: Annotated[User, Depends(require_action(Action.FINANCIAL_SUBMIT))],
) -> AllotmentResponse:
    return process_allotment(body)


@router.post("/redemptions", response_model=RedemptionResponse)
def create_redemption(
    body: RedemptionRequest,
    user: Annotated[User, Depends(require_action(Action.FINANCIAL_SUBMIT))],
) -> RedemptionResponse:
    return process_redemption(body)
