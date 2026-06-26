"""BE-3 — Repositories: pure DB access, no business logic."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.pc import (
    AllocationModelSnapshot,
    AllocationPeriod,
    ClientSubscription,
    Model,
    ModelChange,
    ModelChangeKind,
    ModelMaterial,
    ModelStatus,
    PeriodStatus,
)
from app.models.users import ClientProfile, Portal, User


# ---------------------------------------------------------------------------
# ModelRepository
# ---------------------------------------------------------------------------


class ModelRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_models(self) -> list[Model]:
        return self.db.query(Model).order_by(Model.created_at).all()

    def get_model(self, model_id: uuid.UUID) -> Model | None:
        return self.db.query(Model).filter(Model.id == model_id).one_or_none()

    def create(
        self,
        *,
        name: str,
        manager: str | None = None,
        model_size: Decimal | None = None,
        intro: str | None = None,
        symbols: Any = None,
    ) -> Model:
        model = Model(
            id=uuid.uuid4(),
            name=name,
            manager=manager,
            model_size=model_size,
            intro=intro,
            symbols=symbols,
            status=ModelStatus.DRAFT,
        )
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

    def add_material(
        self,
        *,
        model_id: uuid.UUID,
        filename: str,
        version: str,
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


# ---------------------------------------------------------------------------
# SubscriptionRepository
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


# ---------------------------------------------------------------------------
# AllocationRepository
# ---------------------------------------------------------------------------


class AllocationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_periods(self) -> list[AllocationPeriod]:
        return (
            self.db.query(AllocationPeriod)
            .order_by(AllocationPeriod.created_at.desc())
            .all()
        )

    def get_period(self, period_id: uuid.UUID) -> AllocationPeriod | None:
        return (
            self.db.query(AllocationPeriod)
            .filter(AllocationPeriod.id == period_id)
            .one_or_none()
        )

    def get_open_period(self) -> AllocationPeriod | None:
        return (
            self.db.query(AllocationPeriod)
            .filter(AllocationPeriod.status == PeriodStatus.OPEN)
            .one_or_none()
        )

    def create_period(self, label: str) -> AllocationPeriod:
        period = AllocationPeriod(
            id=uuid.uuid4(),
            label=label,
            status=PeriodStatus.OPEN,
        )
        self.db.add(period)
        self.db.flush()
        return period

    def confirm_period(
        self, period_id: uuid.UUID, actor: str, confirmed_at: datetime
    ) -> AllocationPeriod | None:
        period = self.get_period(period_id)
        if period is None:
            return None
        period.status = PeriodStatus.CONFIRMED
        period.confirmed_by = actor
        period.confirmed_at = confirmed_at
        self.db.flush()
        return period

    def write_snapshots(
        self, period_id: uuid.UUID, rows: list[dict]
    ) -> None:
        """Insert one AllocationModelSnapshot row per cell dict."""
        for row in rows:
            snap = AllocationModelSnapshot(
                period_id=period_id,
                user_id=row["user_id"],
                model_id=row["model_id"],
                multiplier=row["multiplier"],
                model_size=row.get("model_size"),
                ib_account=row.get("ib_account"),
            )
            self.db.add(snap)
        self.db.flush()

    def read_snapshots(self, period_id: uuid.UUID) -> list[AllocationModelSnapshot]:
        return (
            self.db.query(AllocationModelSnapshot)
            .filter(AllocationModelSnapshot.period_id == period_id)
            .all()
        )
