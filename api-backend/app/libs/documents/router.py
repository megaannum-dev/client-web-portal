from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_client_user, require_action
from app.models.users import User
from app.schemas.documents import DocumentUploadRequest

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/me")
def list_own_documents(
    _: Annotated[User, Depends(get_current_client_user)],
) -> Response:
    return Response(status_code=status.HTTP_501_NOT_IMPLEMENTED)


@router.post("/me", status_code=status.HTTP_201_CREATED)
def upload_own_document(
    body: DocumentUploadRequest,
    _: Annotated[User, Depends(get_current_client_user)],
) -> Response:
    return Response(status_code=status.HTTP_501_NOT_IMPLEMENTED)


@router.get("")
def list_all_documents(
    _: Annotated[User, Depends(require_action(Action.DOCUMENT_VIEW_ALL))],
) -> Response:
    return Response(status_code=status.HTTP_501_NOT_IMPLEMENTED)
