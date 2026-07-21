class WeasyPrintRenderer:
    """Escape hatch if ChromiumRenderer proves unworkable in production
    (e.g. no Chromium binary available in the deployment image). Flip
    PDF_RENDERER=weasyprint to select this — but it must be implemented
    first; this stub intentionally fails loudly rather than silently
    producing an empty/broken PDF."""

    def render(self, trade_date_iso: str) -> bytes:
        raise NotImplementedError("WeasyPrintRenderer is not yet configured")
