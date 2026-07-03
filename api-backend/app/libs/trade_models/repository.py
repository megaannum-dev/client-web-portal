"""Trade model repositories — split from app/libs/pc/repository.py (007-A).

ModelRepository, MaterialRepository (methods on ModelRepository), SubscriptionRepository.
Pure DB access, no business logic.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.pc import (
    ClientSubscription,
    Model,
    ModelChange,
    ModelChangeKind,
    ModelMaterial,
    ModelStatus,
    ModelSymbol,
)
from app.models.users import AdminProfile, ClientProfile, Portal, User


# ---------------------------------------------------------------------------
# ModelRepository
# ---------------------------------------------------------------------------


class ModelRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_models(self) -> list[Model]:
        return self.db.query(Model).filter(Model.status != ModelStatus.DELETED).order_by(Model.created_at)

    def get_model(self, model_id: uuid.UUID) -> Model | None:
        return self.db.query(Model).filter(Model.id == model_id).one_or_none()

    def bulk_get(self, model_ids: list[uuid.UUID]) -> dict[uuid.UUID, Model]:
        rows = self.db.query(Model).filter(Model.id.in_(model_ids)).all()
        return {m.id: m for m in rows}

    def create(
        self,
        *,
        name: str,
        category: str | None = None,
        subscription_redemption: str | None = None,
        symbols: list | None = None,
        model_size: Decimal | None = None,
        description: str | None = None,
        underlyings: str | None = None,
        risk: str | None = None,
        liquidity: str | None = None,
        reporting: str | None = None,
        nav_perf: str | None = None,
        mgmt_fee: Decimal | None = None,
        incentive_fee: Decimal | None = None,
    ) -> Model:
        model = Model(
            id=uuid.uuid4(),
            name=name,
            category=category,
            subscription_redemption=subscription_redemption,
            model_size=model_size,
            description=description,
            underlyings=underlyings,
            risk=risk,
            liquidity=liquidity,
            reporting=reporting,
            nav_perf=nav_perf,
            mgmt_fee=mgmt_fee,
            incentive_fee=incentive_fee,
            status=ModelStatus.DRAFT,
        )
        if symbols:
            model.symbols = [
                ModelSymbol(symbol=s.symbol, weight=s.weight) for s in symbols
            ]
        self.db.add(model)
        self.db.flush()
        return model

    def update(self, model_id: uuid.UUID, **fields: Any) -> Model | None:
        model = self.get_model(model_id)
        if model is None:
            return None
        for key, val in fields.items():
            setattr(model, key, val)
        self.db.flush()
        return model

    # --- Materials ---

    def list_materials(self, model_id: uuid.UUID) -> list[ModelMaterial]:
        return (
            self.db.query(ModelMaterial)
            .filter(ModelMaterial.model_id == model_id)
            .order_by(ModelMaterial.created_at)
            .all()
        )

    def next_version_no(self, model_id: uuid.UUID) -> int:
        """
        Lock-safe next version number.
        Uses SELECT ... FOR UPDATE to prevent concurrent uploads racing past
        the same Python count.
        """
        from sqlalchemy import text
        row = self.db.execute(
            text(
                "SELECT COALESCE(MAX(version_no), 0) + 1 AS next_n "
                "FROM model_materials WHERE model_id = :mid FOR UPDATE"
            ),
            # Uuid(native_uuid=False) persists as a 32-char hex CHAR column
            # (no dashes) — str(model_id) produces the 36-char dashed form,
            # which never matches, so this must bind the same .hex form.
            {"mid": model_id.hex},
        ).one()
        return row.next_n

    def add_material(
        self,
        *,
        model_id: uuid.UUID,
        filename: str,
        version: str,
        version_no: int,
        size_bytes: int | None = None,
        storage_key: str | None = None,
        content_type: str | None = None,
        uploaded_by: str | None = None,
    ) -> ModelMaterial:
        mat = ModelMaterial(
            id=uuid.uuid4(),
            model_id=model_id,
            filename=filename,
            version=version,
            version_no=version_no,
            size_bytes=size_bytes,
            storage_key=storage_key,
            content_type=content_type,
            uploaded_by=uploaded_by,
        )
        self.db.add(mat)
        self.db.flush()
        return mat

    def get_material(self, mid: uuid.UUID) -> ModelMaterial | None:
        return (
            self.db.query(ModelMaterial)
            .filter(ModelMaterial.id == mid)
            .one_or_none()
        )

    # --- Changes ---

    def list_changes(self, model_id: uuid.UUID) -> list[ModelChange]:
        return (
            self.db.query(ModelChange)
            .filter(ModelChange.model_id == model_id)
            .order_by(ModelChange.created_at)
            .all()
        )

    def add_change(
        self,
        model_id: uuid.UUID,
        kind: ModelChangeKind,
        detail: dict | None,
        actor: str | None,
        version: str | None,
    ) -> ModelChange:
        change = ModelChange(
            id=uuid.uuid4(),
            model_id=model_id,
            kind=kind,
            detail=detail,
            actor=actor,
            version=version,
        )
        self.db.add(change)
        self.db.flush()
        return change

    def set_version(self, model_id: uuid.UUID, ver: str) -> None:
        model = self.get_model(model_id)
        if model is not None:
            model.version = ver
            self.db.flush()

    def set_status(self, model_id: uuid.UUID, status: ModelStatus) -> None:
        model = self.get_model(model_id)
        if model is not None:
            model.status = status
            self.db.flush()

    def resolve_actor_names(self, firebase_uids: set[str]) -> dict[str, str]:
        """Map a change-log actor's firebase_uid to a display name (AdminProfile.name,
        falling back to email, then the uid itself if the user can't be found)."""
        if not firebase_uids:
            return {}
        rows = (
            self.db.query(User.firebase_uid, User.email, AdminProfile.name)
            .outerjoin(AdminProfile, AdminProfile.user_id == User.id)
            .filter(User.firebase_uid.in_(firebase_uids))
            .all()
        )
        return {uid: (name or email or uid) for uid, email, name in rows}


# ---------------------------------------------------------------------------
# SubscriptionRepository — private helper types
# ---------------------------------------------------------------------------


class _SubscriptionCell:
    """Lightweight result row from list_active_subscriptions."""

    __slots__ = ("user_id", "model_id", "multiplier", "model_size", "ib_account")

    def __init__(
        self,
        user_id: uuid.UUID,
        model_id: uuid.UUID,
        multiplier: Decimal,
        model_size: Decimal | None,
        ib_account: str | None,
    ) -> None:
        self.user_id = user_id
        self.model_id = model_id
        self.multiplier = multiplier
        self.model_size = model_size
        self.ib_account = ib_account


class _RosterRow:
    """Lightweight result row from roster()."""

    __slots__ = ("user_id", "firebase_uid", "email", "name", "ib_account")

    def __init__(
        self,
        user_id: uuid.UUID,
        firebase_uid: str,
        email: str | None,
        name: str | None,
        ib_account: str | None,
    ) -> None:
        self.user_id = user_id
        self.firebase_uid = firebase_uid
        self.email = email
        self.name = name
        self.ib_account = ib_account


class _WatermarkResult:
    """(max_updated_at, row_count) pair."""

    __slots__ = ("max_updated_at", "count")

    def __init__(self, max_updated_at: datetime | None, count: int) -> None:
        self.max_updated_at = max_updated_at
        self.count = count


class SubscriptionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_active_subscriptions(self) -> list[_SubscriptionCell]:
        """Return all subscriptions joined to LIVE models + client profile ib_account."""
        rows = (
            self.db.query(
                ClientSubscription.user_id,
                ClientSubscription.model_id,
                ClientSubscription.multiplier,
                Model.model_size,
                ClientProfile.ib_account,
            )
            .join(Model, Model.id == ClientSubscription.model_id)
            .join(ClientProfile, ClientProfile.user_id == ClientSubscription.user_id)
            .filter(Model.status == ModelStatus.LIVE)
            .all()
        )
        return [
            _SubscriptionCell(
                user_id=r.user_id,
                model_id=r.model_id,
                multiplier=Decimal(str(r.multiplier)),
                model_size=Decimal(str(r.model_size)) if r.model_size is not None else None,
                ib_account=r.ib_account,
            )
            for r in rows
        ]

    def roster(self) -> list[_RosterRow]:
        """All client-portal users with their ib_account."""
        rows = (
            self.db.query(
                User.id,
                User.firebase_uid,
                User.email,
                ClientProfile.name,
                ClientProfile.ib_account,
            )
            .join(ClientProfile, ClientProfile.user_id == User.id)
            .filter(User.portal == Portal.CLIENT)
            .all()
        )
        return [
            _RosterRow(
                user_id=r[0],
                firebase_uid=r[1],
                email=r[2],
                name=r[3],
                ib_account=r[4],
            )
            for r in rows
        ]

    def subscriptions_watermark(self) -> _WatermarkResult:
        """(max updated_at, row count) for client_subscriptions — index-backed (DB-6)."""
        row = self.db.query(
            func.max(ClientSubscription.updated_at),
            func.count(ClientSubscription.user_id),
        ).one()
        return _WatermarkResult(max_updated_at=row[0], count=row[1] or 0)

    def models_watermark(self) -> _WatermarkResult:
        """(max updated_at of LIVE models, count of LIVE models) — index-backed (DB-6)."""
        row = (
            self.db.query(
                func.max(Model.updated_at),
                func.count(Model.id),
            )
            .filter(Model.status == ModelStatus.LIVE)
            .one()
        )
        return _WatermarkResult(max_updated_at=row[0], count=row[1] or 0)

    def clients_watermark(self) -> _WatermarkResult:
        """(max updated_at, count) for client_profiles."""
        from app.models.users import ClientProfile as CP

        row = self.db.query(
            func.max(CP.updated_at),
            func.count(CP.id),
        ).one()
        return _WatermarkResult(max_updated_at=row[0], count=row[1] or 0)
