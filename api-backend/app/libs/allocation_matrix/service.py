"""Allocation matrix service — split from app/libs/pc/service.py (007-A).

AllocationService: all business logic for allocation periods and the matrix derivation.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.libs.allocation_matrix.repository import AllocationCellRow, AllocationRepository
from app.libs.trade_models.repository import ModelRepository, SubscriptionRepository
from app.models.pc import (
    AllocationPeriod,
    ModelStatus,
    PeriodStatus,
)

logger = logging.getLogger(__name__)


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
        roster = self.sub_repo.roster()

        return _build_matrix(cells, live_models, roster=roster, is_open=True)

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
        snapshot_cells = [
            AllocationCellRow(
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
        roster = self.sub_repo.roster()
        result = _build_matrix(
            snapshot_cells, stub_models, roster=roster, is_open=False
        )
        result["period_id"] = str(period_id)
        return result

    # --- ETag watermarks ---

    def compute_etag_components(self) -> tuple:
        """Return the three watermark results used for ETag computation."""
        subs = self.sub_repo.subscriptions_watermark()
        models = self.sub_repo.models_watermark()
        clients = self.sub_repo.clients_watermark()
        return subs, models, clients


def _build_matrix(
    cells: list,
    models: list,
    *,
    roster: list,
    is_open: bool,
) -> dict:
    """Shared derivation logic for open and confirmed matrices.

    Emits the AllocationDTO-shaped payload the frontend consumes:
      - `clients` is the full client-portal roster (not just clients with subs)
      - `cells` is a flat `"{clientId}-{modelId}"` map of {units, fund}
      - column-level aggregates ride on each `models[]` entry
    """
    from decimal import Decimal

    ZERO = Decimal("0")

    # Index models by id.
    model_map: dict[str, Any] = {}
    for m in models:
        model_map[str(m.id)] = m

    # Per-cell aggregates.
    col_units: dict[str, Decimal] = {mid: ZERO for mid in model_map}
    col_fund: dict[str, Decimal] = {mid: ZERO for mid in model_map}
    flat_cells: dict[str, dict] = {}

    # Track ib_account per client from cells as a fallback (some confirmed
    # snapshots store a frozen account that may differ from the live roster).
    cell_ib_account: dict[str, str | None] = {}

    for cell in cells:
        uid = str(cell.user_id)
        mid = str(cell.model_id)
        cell_ib_account.setdefault(uid, cell.ib_account)
        if mid not in model_map:
            continue
        m = model_map[mid]
        ms = cell.model_size if cell.model_size is not None else (
            Decimal(str(m.model_size)) if m.model_size is not None else ZERO
        )
        multiplier = cell.multiplier
        fund = multiplier * ms

        col_units[mid] = col_units.get(mid, ZERO) + multiplier
        col_fund[mid] = col_fund.get(mid, ZERO) + fund

        flat_cells[f"{uid}-{mid}"] = {
            "units": float(multiplier),
            "fund": float(fund),
        }

    total_fund = sum(col_fund.values(), ZERO)
    count = len(flat_cells)

    # Models column output.
    models_out = []
    for mid, m in model_map.items():
        ms_val = float(m.model_size) if m.model_size is not None else None
        models_out.append(
            {
                "id": str(m.id),
                "name": m.name,
                "model_size": ms_val,
                "live": True,  # only LIVE models reach this list (open path) /
                              # snapshot stubs are flagged LIVE (confirmed path)
                "col_units": float(col_units.get(mid, ZERO)),
                "col_fund": float(col_fund.get(mid, ZERO)),
            }
        )

    # Clients: full roster — every client-portal user gets a row, with or
    # without subscriptions, so the matrix is visible after dummy data lands.
    clients_out = []
    for r in roster:
        uid = str(r.user_id)
        clients_out.append(
            {
                "id": uid,
                "name": r.name or r.email or uid,
                "code": r.ib_account or r.firebase_uid,
                "ib_account": r.ib_account,
            }
        )

    return {
        "models": models_out,
        "clients": clients_out,
        "cells": flat_cells,
        "total_fund": float(total_fund),
        "count": count,
        "is_open": is_open,
    }
