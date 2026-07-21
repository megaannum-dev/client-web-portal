from __future__ import annotations

from app.core.config import get_settings


class ChromiumRenderer:
    """Playwright (Python API, in-process — no separate Node service). Navigates
    headless Chromium to the print-only Next.js route and rasterizes it."""

    def render(self, trade_date_iso: str) -> bytes:
        from playwright.sync_api import (
            sync_playwright,
        )  # local import: heavy, optional-at-runtime dep

        settings = get_settings()
        url = (
            f"{settings.pdf_render_base_url}/mobo/daily-exception-report/print"
            f"?trade_date={trade_date_iso}"
        )
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(
                extra_http_headers={"X-Eod-Render-Token": settings.pdf_render_token}
            )
            page.goto(url, wait_until="networkidle")
            pdf_bytes = page.pdf(format="A4", print_background=True)
            browser.close()
            return pdf_bytes
