import uuid

from app.schemas.financial import (
    AllotmentRequest,
    AllotmentResponse,
    AllotmentStatus,
    RedemptionRequest,
    RedemptionResponse,
    RedemptionStatus,
)


def process_allotment(payload: AllotmentRequest) -> AllotmentResponse:
    _ = payload
    return AllotmentResponse(
        request_id=str(uuid.uuid4()),
        status=AllotmentStatus.RECEIVED,
        message="Queued for downstream settlement orchestration (placeholder).",
    )


def process_redemption(payload: RedemptionRequest) -> RedemptionResponse:
    _ = payload
    return RedemptionResponse(
        request_id=str(uuid.uuid4()),
        status=RedemptionStatus.RECEIVED,
        message="Queued for compliance review and settlement scheduling (placeholder).",
    )
