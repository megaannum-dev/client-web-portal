from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from app.schemas.eod import EodReportViewOut


class PdfRenderer(Protocol):
    def render(self, view: EodReportViewOut) -> bytes: ...
