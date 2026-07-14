"""Post-trade allocation response schemas — BE-1 scaffold.

Placeholder Pydantic models so the module imports cleanly and router/service
stubs have something concrete to type-hint against. Real fields (the frozen
wire contract in docs/implementations/011-2026-07-13-post-trade-allocation-be.md
§ 7 / § BE-5) land in BE-5.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PtaClientShareOut(BaseModel):
    """Placeholder — full fields land in BE-5."""

    model_config = ConfigDict(from_attributes=True)


class PtaModelOut(BaseModel):
    """Placeholder — full fields land in BE-5."""

    model_config = ConfigDict(from_attributes=True)


class PostTradeAllocationView(BaseModel):
    """Placeholder — the frozen wire contract (§ 7) lands in BE-5."""


class PtaRunListEntryOut(BaseModel):
    """Placeholder — full fields land in BE-5."""


class PtaRunListOut(BaseModel):
    """Placeholder — full fields land in BE-5."""


class PtaRunResultOut(BaseModel):
    """Placeholder — POST /run response shape lands in BE-5."""
