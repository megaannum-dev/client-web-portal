"""BE-4 + BE-5 — ModelService and AllocationService.

All business logic lives here; repositories do DB-only access.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from typing import IO, Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.libs.pc.repository import (
    AllocationRepository,
    ModelRepository,
    SubscriptionRepository,
)
from app.libs.pc.storage import FileStorage
from app.models.pc import (
    AllocationPeriod,
    Model,
    ModelChange,
    ModelChangeKind,
    ModelMaterial,
    ModelStatus,
    PeriodStatus,
)

logger = logging.getLogger(__name__)

# Fields that are diffed in the changelog when a model is edited.
_TRACKED_FIELDS = ("name", "manager", "model_size", "intro", "symbols")


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
        actor: str | None = None,
    ) -> Model:
        model = self.repo.create(
            name=name,
            manager=manager,
            model_size=model_size,
            intro=intro,
            symbols=symbols,
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
            before = getattr(model, field)
            after = updates[field]
            # Normalise Decimal → float for comparison stability.
            norm_before = float(before) if isinstance(before, Decimal) else before
            norm_after = float(after) if isinstance(after, Decimal) else after
            if norm_before != norm_after:
                changed_fields.append(
                    {
                        "name": field,
                        "before": norm_before,
                        "after": norm_after,
                    }
                )

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
        existing = self.repo.list_materials(model_id)
        next_n = len(existing) + 1
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
            raise HTTPException(status.HTTP_404_NOT_FOUND, "File not stored")
        return self.storage.open(mat.storage_key)

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


# ---------------------------------------------------------------------------
# AllocationService  (BE-5)
# ---------------------------------------------------------------------------


class AllocationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.sub_repo = SubscriptionRepository(db)
        self.alloc_repo = AllocationRepository(db)
        self.model_repo = ModelRepository(db)

    # --- Period management ---

    def list_periods(self) -> list[AllocationPeriod]:
        return self.alloc_repo.list_periods()

    def get_period(self, period_id: uuid.UUID) -> AllocationPeriod:
        period = self.alloc_repo.get_period(period_id)
        if period is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Period not found")
        return period

    def create_period(self, label: str) -> AllocationPeriod:
        """Admin override: create a new open period. Enforces single-open invariant."""
        existing = self.alloc_repo.get_open_period()
        if existing is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"An open period already exists: '{existing.label}'",
            )
        period = self.alloc_repo.create_period(label)
        self.db.commit()
        self.db.refresh(period)
        return period

    def confirm_period(
        self, period_id: uuid.UUID, actor: str
    ) -> AllocationPeriod:
        """Snapshot current matrix, flip period → confirmed. Irreversible."""
        period = self.get_period(period_id)
        if period.status != PeriodStatus.OPEN:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Period is already confirmed"
            )

        # Derive current matrix and write one snapshot row per cell.
        cells = self.sub_repo.list_active_subscriptions()
        snapshot_rows = [
            {
                "user_id": cell.user_id,
                "model_id": cell.model_id,
                "multiplier": cell.multiplier,
                "model_size": cell.model_size,
                "ib_account": cell.ib_account,
            }
            for cell in cells
        ]
        self.alloc_repo.write_snapshots(period_id, snapshot_rows)

        confirmed_at = datetime.now(tz=timezone.utc)
        updated = self.alloc_repo.confirm_period(period_id, actor, confirmed_at)
        self.db.commit()
        if updated:
            self.db.refresh(updated)
        return updated  # type: ignore[return-value]

    # --- Matrix derivation ---

    def derive_open_matrix(self) -> dict:
        """Build the fully-derived AllocationViewOut dict from live subscriptions."""
        cells = self.sub_repo.list_active_subscriptions()
        live_models = self.model_repo.list_models()
        live_models = [m for m in live_models if m.status == ModelStatus.LIVE]

        return _build_matrix(cells, live_models, is_open=True)

    def derive_confirmed_matrix(self, period_id: uuid.UUID) -> dict:
        """Rebuild AllocationViewOut from frozen snapshots."""
        period = self.get_period(period_id)
        snapshots = self.alloc_repo.read_snapshots(period_id)

        # Reconstruct model stubs from snapshots (frozen model_size).
        # We need unique model_ids; build minimal stubs.
        model_ids_seen: dict[str, dict] = {}
        for snap in snapshots:
            mid = str(snap.model_id)
            if mid not in model_ids_seen:
                # Fetch model name for display, but use frozen model_size.
                m = self.model_repo.get_model(snap.model_id)
                model_ids_seen[mid] = {
                    "id": snap.model_id,
                    "name": m.name if m else mid,
                    "model_size": Decimal(str(snap.model_size)) if snap.model_size else None,
                    "status": ModelStatus.LIVE,
                }

        # Build cell list from snapshots.
        from app.libs.pc.repository import _SubscriptionCell

        snapshot_cells = [
            _SubscriptionCell(
                user_id=snap.user_id,
                model_id=snap.model_id,
                multiplier=Decimal(str(snap.multiplier)),
                model_size=Decimal(str(snap.model_size)) if snap.model_size else None,
                ib_account=snap.ib_account,
            )
            for snap in snapshots
        ]

        # Build model list from stubs.
        class _ModelStub:
            def __init__(self, d: dict) -> None:
                self.id = d["id"]
                self.name = d["name"]
                self.model_size = d["model_size"]
                self.status = d["status"]

        stub_models = [_ModelStub(v) for v in model_ids_seen.values()]
        result = _build_matrix(snapshot_cells, stub_models, is_open=False)
        result["period_id"] = str(period_id)
        return result

    # --- ETag watermarks ---

    def compute_etag_components(self) -> tuple:
        """Return the three watermark results used for ETag computation."""
        subs = self.sub_repo.subscriptions_watermark()
        models = self.sub_repo.models_watermark()
        clients = self.sub_repo.clients_watermark()
        return subs, models, clients


def _build_matrix(cells: list, models: list, *, is_open: bool) -> dict:
    """Shared derivation logic for open and confirmed matrices."""
    from decimal import Decimal

    ZERO = Decimal("0")

    # Index models by id.
    model_map: dict[str, Any] = {}
    for m in models:
        model_map[str(m.id)] = m

    # Per-client roster (user_id → IB account + name from cells).
    client_info: dict[str, dict] = {}
    for cell in cells:
        uid = str(cell.user_id)
        if uid not in client_info:
            client_info[uid] = {
                "user_id": cell.user_id,
                "ib_account": cell.ib_account,
            }

    # Build cell grid: client_id → model_id → {multiplier, model_size, cell_fund}.
    # col aggregates: model_id → {col_units, col_fund}
    col_units: dict[str, Decimal] = {mid: ZERO for mid in model_map}
    col_fund: dict[str, Decimal] = {mid: ZERO for mid in model_map}
    # row totals per client
    row_total: dict[str, Decimal] = {}
    # cells grid for output
    cell_grid: dict[str, dict[str, dict]] = {}

    for cell in cells:
        uid = str(cell.user_id)
        mid = str(cell.model_id)
        if mid not in model_map:
            continue  # skip if model not live / not in set
        m = model_map[mid]
        ms = cell.model_size if cell.model_size is not None else (
            Decimal(str(m.model_size)) if m.model_size is not None else ZERO
        )
        multiplier = cell.multiplier
        cell_fund = multiplier * ms

        col_units[mid] = col_units.get(mid, ZERO) + multiplier
        col_fund[mid] = col_fund.get(mid, ZERO) + cell_fund
        row_total[uid] = row_total.get(uid, ZERO) + cell_fund

        if uid not in cell_grid:
            cell_grid[uid] = {}
        cell_grid[uid][mid] = {
            "multiplier": float(multiplier),
            "model_size": float(ms),
            "cell_fund": float(cell_fund),
        }

    # % share per cell within its column.
    for uid, cols in cell_grid.items():
        for mid, cell_data in cols.items():
            cf = col_fund.get(mid, ZERO)
            pct = (
                float(Decimal(str(cell_data["cell_fund"])) / cf * 100)
                if cf
                else 0.0
            )
            cell_data["pct_share"] = round(pct, 4)

    total_fund = sum(col_fund.values(), ZERO)
    count = sum(len(c) for c in cell_grid.values())

    # Build output structure.
    models_out = []
    for mid, m in model_map.items():
        ms_val = (
            float(m.model_size)
            if m.model_size is not None
            else None
        )
        models_out.append(
            {
                "id": str(m.id),
                "name": m.name,
                "model_size": ms_val,
                "col_units": float(col_units.get(mid, ZERO)),
                "col_fund": float(col_fund.get(mid, ZERO)),
            }
        )

    clients_out = []
    for uid, info in client_info.items():
        # Include a client if they appear in any cell.
        client_cells = cell_grid.get(uid, {})
        clients_out.append(
            {
                "user_id": str(info["user_id"]),
                "ib_account": info["ib_account"],
                "row_total": float(row_total.get(uid, ZERO)),
                "cells": {
                    mid: cell_data
                    for mid, cell_data in client_cells.items()
                },
            }
        )

    return {
        "models": models_out,
        "clients": clients_out,
        "total_fund": float(total_fund),
        "count": count,
        "is_open": is_open,
    }
