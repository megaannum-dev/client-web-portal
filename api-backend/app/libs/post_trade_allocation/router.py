"""Post-trade allocation router — BE-1 scaffold.

Thin HTTP boundary, mirroring app/libs/allocation_matrix/router.py. Routes
(GET /post-trade-allocation, GET .../runs, POST .../run) land in BE-7.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/mobo", tags=["mobo"])
