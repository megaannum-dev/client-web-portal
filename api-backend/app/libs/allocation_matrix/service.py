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

from app.libs.allocation_matrix.repository import AllocationRepository, MatrixReadRepository
from app.libs.trade_models.repository import ModelRepository, SubscriptionRepository
from app.models.pc import (
    AllocationPeriod,
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
        self.matrix_repo = MatrixReadRepository(db)

    # --- Period management ---

    def find_period_by_label(self, label: str) -> AllocationPeriod | None:
        return self.alloc_repo.find_by_label(label)

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
        rows = self.matrix_repo.cell_and_roster_stream()
        model_rows = self.matrix_repo.live_models_with_aggregates()
        return _build_matrix(rows, model_rows, is_open=True)

    def derive_confirmed_matrix(self, period_id: uuid.UUID) -> dict:
        """Rebuild AllocationViewOut from frozen snapshots."""
        period = self.get_period(period_id)
        snapshots = self.alloc_repo.read_snapshots(period_id)

        # Bulk-fetch model names in one query (avoids N+1).
        unique_model_ids = list({snap.model_id for snap in snapshots})
        model_map_fetched = self.model_repo.bulk_get(unique_model_ids)

        # Build per-model aggregates from snapshot data (frozen values).
        ZERO = Decimal("0")
        model_col_units: dict[str, Decimal] = {}
        model_col_fund: dict[str, Decimal] = {}
        model_ids_seen: dict[str, dict] = {}

        for snap in snapshots:
            mid = str(snap.model_id)
            multiplier = Decimal(str(snap.multiplier)) if snap.multiplier is not None else ZERO
            model_size = Decimal(str(snap.model_size)) if snap.model_size is not None else ZERO
            model_col_units[mid] = model_col_units.get(mid, ZERO) + multiplier
            model_col_fund[mid] = model_col_fund.get(mid, ZERO) + multiplier * model_size
            if mid not in model_ids_seen:
                m = model_map_fetched.get(snap.model_id)
                model_ids_seen[mid] = {
                    "id": snap.model_id,
                    "name": m.name if m else mid,
                    "model_size": snap.model_size,
                }

        # Construct synthetic row objects compatible with _build_matrix.
        class _Row:
            __slots__ = ("row_kind", "user_id", "model_id", "multiplier",
                         "model_size", "ib_account", "name", "email", "firebase_uid")

            def __init__(self, **kwargs: Any) -> None:
                for k, v in kwargs.items():
                    setattr(self, k, v)

        class _ModelAggRow:
            __slots__ = ("id", "name", "model_size", "col_units", "col_fund")

            def __init__(self, **kwargs: Any) -> None:
                for k, v in kwargs.items():
                    setattr(self, k, v)

        # Cell rows from snapshots.
        cell_rows = [
            _Row(
                row_kind="cell",
                user_id=snap.user_id,
                model_id=snap.model_id,
                multiplier=snap.multiplier,
                model_size=snap.model_size,
                ib_account=snap.ib_account,
                name=None,
                email=None,
                firebase_uid=None,
            )
            for snap in snapshots
        ]

        # Roster rows from live DB.
        roster = self.sub_repo.roster()
        roster_rows = [
            _Row(
                row_kind="client",
                user_id=r.user_id,
                model_id=None,
                multiplier=None,
                model_size=None,
                ib_account=r.ib_account,
                name=r.name,
                email=r.email,
                firebase_uid=r.firebase_uid,
            )
            for r in roster
        ]

        # Model aggregate rows from frozen snapshot calculations.
        model_agg_rows = [
            _ModelAggRow(
                id=info["id"],
                name=info["name"],
                model_size=info["model_size"],
                col_units=float(model_col_units.get(mid, ZERO)),
                col_fund=float(model_col_fund.get(mid, ZERO)),
            )
            for mid, info in model_ids_seen.items()
        ]

        result = _build_matrix(
            cell_rows + roster_rows, model_agg_rows, is_open=False
        )
        result["period_id"] = str(period_id)
        return result

    # --- ETag watermarks ---

    def compute_etag_components(self) -> tuple:
        """Return the three watermark results used for ETag computation."""
        wm = self.matrix_repo.combined_watermarks()
        return wm["subs"], wm["models"], wm["clients"]


def _build_matrix(
    rows: list,
    model_rows: list,
    *,
    is_open: bool,
) -> dict:
    """Shared derivation logic for open and confirmed matrices.

    Accepts raw Row objects from MatrixReadRepository:
      - rows: UNION ALL result from cell_and_roster_stream() (row_kind='cell'|'client')
      - model_rows: pre-aggregated result from live_models_with_aggregates()

    Emits the AllocationDTO-shaped payload the frontend consumes:
      - `clients` is the full client-portal roster (not just clients with subs)
      - `cells` is a flat `"{clientId}-{modelId}"` map of {units, fund}
      - column-level aggregates ride on each `models[]` entry
    """
    from decimal import Decimal

    ZERO = Decimal("0")

    # Split UNION ALL rows by row_kind.
    cell_rows = [r for r in rows if r.row_kind == "cell"]
    roster_rows = [r for r in rows if r.row_kind == "client"]

    # Build model map from pre-aggregated model_rows.
    # col_units and col_fund come directly from DB aggregates — no Python accumulation.
    model_map: dict[str, Any] = {}
    col_units: dict[str, Decimal] = {}
    col_fund: dict[str, Decimal] = {}
    for mr in model_rows:
        mid = str(mr.id)
        model_map[mid] = mr
        col_units[mid] = Decimal(mr.col_units or 0)
        col_fund[mid] = Decimal(mr.col_fund or 0)

    # Build flat cell map from cell rows.
    flat_cells: dict[str, dict] = {}
    for cell in cell_rows:
        uid = str(cell.user_id)
        mid = str(cell.model_id)
        if mid not in model_map:
            continue
        multiplier = cell.multiplier or ZERO
        model_size = cell.model_size or ZERO
        fund = Decimal(multiplier) * Decimal(model_size)
        flat_cells[f"{uid}-{mid}"] = {
            "units": float(multiplier),
            "fund": float(fund),
        }

    total_fund = sum(col_fund.values(), ZERO)
    count = len(flat_cells)

    # Models column output — col_units/col_fund sourced from DB aggregates.
    models_out = []
    for mid, mr in model_map.items():
        ms_val = float(mr.model_size) if mr.model_size is not None else None
        models_out.append(
            {
                "id": str(mr.id),
                "name": mr.name,
                "model_size": ms_val,
                "live": True,  # only LIVE models reach this list
                "col_units": float(col_units.get(mid, ZERO)),
                "col_fund": float(col_fund.get(mid, ZERO)),
            }
        )

    # Clients: full roster — every client-portal user gets a row, with or
    # without subscriptions, so the matrix is visible after dummy data lands.
    clients_out = []
    for r in roster_rows:
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
