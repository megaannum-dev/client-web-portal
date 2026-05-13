from fastapi import APIRouter, Depends

from app.deps.auth import get_current_user
from app.models import User
from app.schemas.financial import RedemptionRequest, RedemptionResponse
from app.services.financial import process_redemption

router = APIRouter(prefix="/financial/redemptions", tags=["financial"])


@router.post("", response_model=RedemptionResponse)
def create_redemption(
    body: RedemptionRequest,
    user: User = Depends(get_current_user),
) -> RedemptionResponse:
    """Accept a redemption request; extend with compliance workflow and liquidity checks."""
    _ = user
    return process_redemption(body)
