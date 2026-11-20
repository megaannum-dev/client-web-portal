"""Allocation matrix service — split from app/libs/pc/service.py (007-A).

AllocationService: all business logic for allocation periods and the matrix derivation.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Protocol

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.libs import client_ib_accounts
from app.libs.allocation_matrix.repository import AllocationRepository, MatrixReadRepository
from app.libs.trade_models.repository import ModelRepository, SubscriptionRepository
from app.models.pm import (
    AllocationPeriod,
    PeriodStatus,
)

logger = logging.getLogger(__name__)

_BOOKS = ("dt", "pt", "inb")


def _required_books(value: Any) -> list[str]:
    """Canonical book list: dt, then pt, then inb. Unknown codes are dropped.

    Raw SQL returns models.required_books as a JSON string on some drivers
    and as a list on others. None (model row gone) falls back to dt, the
    column default.
    """
    if value is None:
        return ["dt"]
    if isinstance(value, (bytes, bytearray)):
        value = value.decode()
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return ["dt"]
        try:
            value = json.loads(text)
        except json.JSONDecodeError:
            return ["dt"]
    if not isinstance(value, (list, tuple)):
        return ["dt"]
    present = {str(item).strip().lower() for item in value}
    return [code for code in _BOOKS if code in present]


class ModelLookup(Protocol):
    def bulk_get(self, model_ids: list[uuid.UUID]) -> dict[uuid.UUID, object]:
        ...


# ---------------------------------------------------------------------------
# AllocationService  (BE-5)
# ---------------------------------------------------------------------------


class AllocationService:
    def __init__(
        self,
        db: Session,
        model_lookup: ModelLookup | None = None,
    ) -> None:
        self.db = db
        self.sub_repo = SubscriptionRepository(db)
        self.alloc_repo = AllocationRepository(db)
        self.model_repo: ModelLookup = (
            model_lookup if model_lookup is not None else ModelRepository(db)
        )
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
        """Admin override: create a new open period.

        Enforces label uniqueness (any status) and the single-open invariant.
        Both raise 409; the label check is mirrored by DB constraint
        uq_allocation_periods_label, which covers the concurrent-insert race.
        """
        if self.alloc_repo.find_by_label(label) is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"Period '{label}' already exists"
            )
        existing = self.alloc_repo.get_open_period()
        if existing is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"An open period already exists: '{existing.label}'",
            )
        try:
            period = self.alloc_repo.create_period(label)
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"Period '{label}' already exists"
            ) from exc
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
                "ib_account": cell.ib_account,
            }
            for cell in cells
        ]

        # Freeze model name/size for every model referenced this period (DB B-4) —
        # allocation_model_snapshots no longer carries model_size directly.
        unique_model_ids = list({cell.model_id for cell in cells})
        model_map = self.model_repo.bulk_get(unique_model_ids)
        period_model_rows = [
            {
                "model_id": mid,
                "model_name": model_map[mid].name,
                "model_size": model_map[mid].model_size or Decimal("0"),
            }
            for mid in unique_model_ids
            if mid in model_map
        ]

        with self.db.begin_nested():
            self.alloc_repo.write_snapshots(period_id, snapshot_rows)
            self.alloc_repo.write_period_models(period_id, period_model_rows)
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
        """Rebuild AllocationViewOut from frozen snapshots.

        Units, fund, name, and size stay on the snapshot. The column's
        master account and required books, and the cell's per-book accounts,
        are read from the live model row and client_ib_accounts. A later
        reassign therefore changes what a past matrix shows. The snapshot's
        stored ib_account is left untouched and is not copied onto the cell.
        """
        self.get_period(period_id)  # raises 404 if the period does not exist
        snapshots = self.alloc_repo.read_snapshots(period_id)

        # Model name/size frozen at confirm time (DB B-4) — read from
        # allocation_period_models, never the live `models` table, so a later
        # rename/resize can't retroactively change an already-confirmed view.
        period_models = self.alloc_repo.read_period_models(period_id)
        model_by_id = {pm.model_id: pm for pm in period_models}

        # Build per-model aggregates from snapshot data (frozen values).
        ZERO = Decimal("0")
        model_col_units: dict[str, Decimal] = {}
        model_col_fund: dict[str, Decimal] = {}
        model_ids_seen: dict[str, dict] = {}

        for snap in snapshots:
            mid = str(snap.model_id)
            pm = model_by_id.get(snap.model_id)
            multiplier = snap.multiplier if snap.multiplier is not None else ZERO
            model_size = pm.model_size if pm is not None else ZERO
            model_col_units[mid] = model_col_units.get(mid, ZERO) + multiplier
            model_col_fund[mid] = model_col_fund.get(mid, ZERO) + multiplier * model_size
            if mid not in model_ids_seen:
                model_ids_seen[mid] = {
                    "id": snap.model_id,
                    "name": pm.model_name if pm is not None else mid,
                    "model_size": model_size,
                }

        # Construct synthetic row objects compatible with _build_matrix.
        class _Row:
            __slots__ = ("row_kind", "user_id", "model_id", "multiplier",
                         "model_size", "book", "client_ib", "name", "email")

            def __init__(self, **kwargs: Any) -> None:
                for k, v in kwargs.items():
                    setattr(self, k, v)

        class _ModelAggRow:
            __slots__ = (
                "id", "name", "model_size", "master_ib", "required_books",
                "col_units", "col_fund",
            )

            def __init__(self, **kwargs: Any) -> None:
                for k, v in kwargs.items():
                    setattr(self, k, v)

        live_by_id = self.model_repo.bulk_get(
            [info["id"] for info in model_ids_seen.values()]
        )
        stored_accounts = client_ib_accounts.assigned_by_pair(self.db)

        # One row per stored book account. Units are the snapshot multiplier
        # on every row; _build_matrix counts that multiplier once.
        cell_rows: list[_Row] = []
        for snap in snapshots:
            model_size = (
                model_by_id[snap.model_id].model_size
                if snap.model_id in model_by_id
                else ZERO
            )
            items = stored_accounts.get((snap.user_id, snap.model_id), [])
            common = dict(
                row_kind="cell",
                user_id=snap.user_id,
                model_id=snap.model_id,
                multiplier=snap.multiplier,
                model_size=model_size,
                name=None,
                email=None,
            )
            if not items:
                cell_rows.append(_Row(**common, book=None, client_ib=None))
            else:
                for item in items:
                    cell_rows.append(
                        _Row(
                            **common,
                            book=item["book"],
                            client_ib=item["account"],
                        )
                    )

        # Roster rows from live DB.
        roster = self.sub_repo.roster()
        roster_rows = [
            _Row(
                row_kind="client",
                user_id=r.user_id,
                model_id=None,
                multiplier=None,
                model_size=None,
                book=None,
                client_ib=None,
                name=r.name,
                email=r.email,
            )
            for r in roster
        ]

        # Model aggregate rows: frozen name/size, live master account and books.
        model_agg_rows = []
        for mid, info in model_ids_seen.items():
            live = live_by_id.get(info["id"])
            model_agg_rows.append(
                _ModelAggRow(
                    id=info["id"],
                    name=info["name"],
                    model_size=info["model_size"],
                    master_ib=live.master_ib_account if live is not None else None,
                    required_books=_required_books(
                        live.required_books if live is not None else None
                    ),
                    col_units=float(model_col_units.get(mid, ZERO)),
                    col_fund=float(model_col_fund.get(mid, ZERO)),
                )
            )

        result = _build_matrix(
            cell_rows + roster_rows, model_agg_rows, is_open=False
        )
        result["period_id"] = str(period_id)
        return result

    # --- ETag watermarks ---

    def compute_etag_components(self) -> tuple:
        """Return the watermark results used for ETag computation.

        Order: subscriptions, live models, clients, client IB accounts.
        """
        wm = self.matrix_repo.combined_watermarks()
        return wm["subs"], wm["models"], wm["clients"], wm["accounts"]


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

    A cell may arrive as several rows (one per book). Units are the
    subscription multiplier, taken once — not summed across books.

    Emits the AllocationDTO-shaped payload the frontend consumes:
      - `clients` is the full client-portal roster (not just clients with subs)
      - `cells` is a flat `"{clientId}-{modelId}"` map of {units, fund, accounts}
      - column-level aggregates and required_books ride on each `models[]` entry
    """
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

    # Several book rows share one (client, model). Keep the multiplier once.
    grouped: dict[str, dict] = {}
    for cell in cell_rows:
        uid = str(cell.user_id)
        mid = str(cell.model_id)
        if mid not in model_map:
            continue
        key = f"{uid}-{mid}"
        slot = grouped.get(key)
        if slot is None:
            multiplier = cell.multiplier or ZERO
            model_size = cell.model_size or ZERO
            slot = {
                "model_id": mid,
                "units": float(multiplier),
                "fund": float(Decimal(multiplier) * Decimal(model_size)),
                "by_book": {},
            }
            grouped[key] = slot
        book = getattr(cell, "book", None)
        if book:
            slot["by_book"][str(book).strip().lower()] = cell.client_ib

    flat_cells: dict[str, dict] = {}
    for key, slot in grouped.items():
        required = _required_books(
            getattr(model_map[slot["model_id"]], "required_books", None)
        )
        flat_cells[key] = {
            "units": slot["units"],
            "fund": slot["fund"],
            "accounts": [
                {"book": book, "account": slot["by_book"].get(book)}
                for book in required
            ],
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
                "master_ib": mr.master_ib,
                "required_books": _required_books(getattr(mr, "required_books", None)),
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
