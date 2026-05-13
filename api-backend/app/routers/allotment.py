from fastapi import APIRouter, Depends

from app.deps.auth import get_current_user
from app.models import User
from app.schemas.financial import AllotmentRequest, AllotmentResponse
from app.services.financial import process_allotment

router = APIRouter(prefix="/financial/allotments", tags=["financial"])


@router.post("", response_model=AllotmentResponse)
def create_allotment(
    body: AllotmentRequest,
    user: User = Depends(get_current_user),
) -> AllotmentResponse:
    """Accept an allotment instruction; extend with PM/compliance-specific rules."""
    _ = user
    return process_allotment(body)
