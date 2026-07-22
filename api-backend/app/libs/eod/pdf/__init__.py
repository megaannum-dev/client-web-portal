from __future__ import annotations

from app.core.config import get_settings
from app.libs.eod.pdf.base import PdfRenderer
from app.libs.eod.pdf.chromium import ChromiumRenderer
from app.libs.eod.pdf.weasyprint import WeasyPrintRenderer


def get_renderer() -> PdfRenderer:
    backend = get_settings().pdf_renderer.lower()
    if backend == "weasyprint":
        return WeasyPrintRenderer()
    return ChromiumRenderer()
