# api-backend/app/libs/clients/service.py
from __future__ import annotations

from sqlalchemy.orm import Session

from app.libs.clients.repository import ClientRepository, ClientRow
from app.libs.clients.schemas import ClientListItemOut, ClientListOut
from app.models.users import AdminRole


class ClientService:
    def __init__(self, db: Session) -> None:
        self.repo = ClientRepository(db)

    def list_visible(self, role: AdminRole, rm_firebase_uid: str) -> ClientListOut:
        rows = self.repo.list_visible(role, rm_firebase_uid)
        return ClientListOut(items=[self._to_dto(r) for r in rows])

    @staticmethod
    def _to_dto(r: ClientRow) -> ClientListItemOut:
        return ClientListItemOut(**r.__dict__)
