from __future__ import annotations

from app.core.config import get_settings
from app.libs.eod.pdf.base import PdfRenderer
from app.libs.eod.pdf.simple import SimplePdfRenderer


def get_renderer() -> PdfRenderer:
    backend = get_settings().pdf_renderer.lower()
    if backend == "chromium":
        from app.libs.eod.pdf.chromium import ChromiumRenderer

        return ChromiumRenderer()
    # ponytail: default to simple (fpdf2) — chromium kept as opt-in
    return SimplePdfRenderer()
