# api-backend/app/libs/clients/service.py
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.libs.clients.repository import ClientRepository, ClientRow
from app.libs.clients.schemas import ClientListItemOut, ClientListOut, SubscriptionOut
from app.models.users import AdminRole


class ClientService:
    def __init__(self, db: Session) -> None:
        self.repo = ClientRepository(db)

    def list_visible(self, role: AdminRole, rm_firebase_uid: str) -> ClientListOut:
        rows = self.repo.list_visible(role, rm_firebase_uid)
        return ClientListOut(items=[self._to_dto(r) for r in rows])

    def get_visible(
        self, role: AdminRole, rm_firebase_uid: str, client_id: uuid.UUID
    ) -> ClientListItemOut:
        row = self.repo.get_visible(role, rm_firebase_uid, client_id)
        if row is None:
            # For RM: does NOT distinguish "not found" from "not yours" — see D-5.
            # For ADMIN: this genuinely means the client doesn't exist, since its
            # visible set (per D-4) is unfiltered.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Client not found"
            )
        dto = self._to_dto(row)
        subs = self.repo.list_subscriptions(client_id, row.ib_account)
        dto.subscriptions = [
            SubscriptionOut(model=s.model, status=s.status, account=s.account) for s in subs
        ]
        return dto

    @staticmethod
    def _to_dto(r: ClientRow) -> ClientListItemOut:
        return ClientListItemOut(**r.__dict__)
