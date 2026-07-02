"""Trade model service — split from app/libs/pc/service.py (007-A).

ModelService: all business logic for trade models, materials, and changes.
"""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import IO, Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.libs.trade_models.repository import ModelRepository
from app.libs.trade_models.storage import FileStorage
from app.models.pc import (
    Model,
    ModelChange,
    ModelChangeKind,
    ModelMaterial,
    ModelStatus,
)

logger = logging.getLogger(__name__)

# Fields that are diffed in the changelog when a model is edited.
_TRACKED_FIELDS = (
    "name", "manager", "model_size", "intro", "symbols",
    "description", "underlyings", "risk",
    "liquidity", "reporting", "nav_perf",
    "mgmt_fee", "incentive_fee",
)

_LONG_TEXT_FIELDS = frozenset({"description", "underlyings", "risk"})


def _diff_field(field: str, before: Any, after: Any) -> dict | None:
    """
    Return a diff entry dict or None if unchanged.
    - Decimal fields: compare as float (precision-normalized).
    - Long-text fields: emit sentinel {"changed": True} when different.
    - All others: emit {"before": before, "after": after}.
    """
    if isinstance(before, Decimal) or isinstance(after, Decimal):
        norm_b = float(before) if before is not None else None
        norm_a = float(after)  if after  is not None else None
        if norm_b == norm_a:
            return None
        return {"name": field, "before": norm_b, "after": norm_a}

    if field in _LONG_TEXT_FIELDS:
        if before == after:
            return None
        return {"name": field, "changed": True}

    if before == after:
        return None
    return {"name": field, "before": before, "after": after}


# ---------------------------------------------------------------------------
# ModelService  (BE-4)
# ---------------------------------------------------------------------------


class ModelService:
    def __init__(self, db: Session, storage: FileStorage) -> None:
        self.db = db
        self.repo = ModelRepository(db)
        self.storage = storage

    # --- Book management ---

    def list_models(self) -> list[Model]:
        return self.repo.list_models()

    def get_model(self, model_id: uuid.UUID) -> Model:
        model = self.repo.get_model(model_id)
        if model is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")
        return model

    def create_model(
        self,
        *,
        name: str,
        manager: str | None = None,
        model_size: Decimal | None = None,
        intro: str | None = None,
        symbols: Any = None,
        description: str | None = None,
        underlyings: str | None = None,
        risk: str | None = None,
        liquidity: str | None = None,
        reporting: str | None = None,
        nav_perf: str | None = None,
        mgmt_fee: Decimal | None = None,
        incentive_fee: Decimal | None = None,
        actor: str | None = None,
    ) -> Model:
        model = self.repo.create(
            name=name,
            manager=manager,
            model_size=model_size,
            intro=intro,
            symbols=symbols,
            description=description,
            underlyings=underlyings,
            risk=risk,
            liquidity=liquidity,
            reporting=reporting,
            nav_perf=nav_perf,
            mgmt_fee=mgmt_fee,
            incentive_fee=incentive_fee,
        )
        self.repo.add_change(
            model.id,
            kind=ModelChangeKind.CREATED,
            detail=None,
            actor=actor,
            version=None,
        )
        self.db.commit()
        self.db.refresh(model)
        return model

    def edit_model(
        self,
        model_id: uuid.UUID,
        *,
        actor: str | None = None,
        **updates: Any,
    ) -> Model:
        model = self.get_model(model_id)

        # Diff tracked fields before applying update.
        changed_fields = []
        for field in _TRACKED_FIELDS:
            if field not in updates:
                continue
            entry = _diff_field(field, getattr(model, field), updates[field])
            if entry is not None:
                changed_fields.append(entry)

        updated = self.repo.update(model_id, **updates)
        if updated is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")

        if changed_fields:
            self.repo.add_change(
                model_id,
                kind=ModelChangeKind.EDITED,
                detail={"fields": changed_fields},
                actor=actor,
                version=updated.version,
            )

        self.db.commit()
        self.db.refresh(updated)
        return updated

    # --- Materials ---

    def list_materials(self, model_id: uuid.UUID) -> list[ModelMaterial]:
        self.get_model(model_id)  # 404 guard
        return self.repo.list_materials(model_id)

    def upload_material(
        self,
        model_id: uuid.UUID,
        stream: IO[bytes],
        *,
        filename: str,
        content_type: str | None = None,
        size_bytes: int | None = None,
        actor: str | None = None,
    ) -> ModelMaterial:
        """Atomically: next version → save file → insert material → bump model.version → changelog."""
        model = self.get_model(model_id)

        # Compute next version number.
        next_n = self.repo.next_version_no(model_id)
        version_tag = f"v{next_n}"

        # Persist file.
        storage_key = self.storage.save(
            stream,
            suggested_name=filename,
            content_type=content_type,
        )

        # Insert material row.
        mat = self.repo.add_material(
            model_id=model_id,
            filename=filename,
            version=version_tag,
            version_no=next_n,
            size_bytes=size_bytes,
            storage_key=storage_key,
            content_type=content_type,
            uploaded_by=actor,
        )

        # Bump model version.
        self.repo.set_version(model_id, version_tag)

        # Record changelog.
        self.repo.add_change(
            model_id,
            kind=ModelChangeKind.MATERIAL_UPLOADED,
            detail={"filename": filename, "version": version_tag},
            actor=actor,
            version=version_tag,
        )

        self.db.commit()
        self.db.refresh(mat)
        return mat

    def get_material(self, model_id: uuid.UUID, mid: uuid.UUID) -> ModelMaterial:
        self.get_model(model_id)  # 404 guard
        mat = self.repo.get_material(mid)
        if mat is None or mat.model_id != model_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Material not found")
        return mat

    def download_material(self, model_id: uuid.UUID, mid: uuid.UUID) -> IO[bytes]:
        mat = self.get_material(model_id, mid)
        if not mat.storage_key:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "File does not exist")
        try:
            return self.storage.open(mat.storage_key)
        except FileNotFoundError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "File does not exist")

    def list_changes(self, model_id: uuid.UUID) -> list[ModelChange]:
        self.get_model(model_id)  # 404 guard
        return self.repo.list_changes(model_id)

    # --- Publish state machine ---

    def publish_model(
        self, model_id: uuid.UUID, *, actor: str | None = None
    ) -> Model:
        model = self.get_model(model_id)

        # Idempotent: re-publishing a live model is a no-op.
        if model.status == ModelStatus.LIVE:
            return model

        # Validate publishability.
        if not model.model_size:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Cannot publish: model_size must be set",
            )
        materials = self.repo.list_materials(model_id)
        if not materials:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Cannot publish: at least one material (v1) is required",
            )

        self.repo.set_status(model_id, ModelStatus.LIVE)
        self.repo.add_change(
            model_id,
            kind=ModelChangeKind.PUBLISHED,
            detail=None,
            actor=actor,
            version=model.version,
        )
        self.db.commit()
        self.db.refresh(model)
        return model

    def delete_model(
        self, model_id: uuid.UUID, *, actor: str | None = None
    ) -> Model:
        model = self.get_model(model_id)

        if model.status == ModelStatus.LIVE:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Cannot delete a live model — unpublish it first",
            )

        self.repo.set_status(model_id, ModelStatus.DELETED)
        self.repo.add_change(
            model_id,
            kind=ModelChangeKind.DELETED,
            detail=None,
            actor=actor,
            version=model.version,
        )
        self.db.commit()
        self.db.refresh(model)
        return model
