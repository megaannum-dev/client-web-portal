from __future__ import annotations

import socket
from urllib.parse import urlparse

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
        # ponytail: Chromium doesn't use Docker's embedded DNS — resolve the
        # hostname via Python (which does) and inject a resolver rule.
        parsed = urlparse(settings.pdf_render_base_url)
        host = parsed.hostname or "localhost"
        try:
            ip = socket.gethostbyname(host)
        except socket.gaierror:
            ip = None
        resolver_rules = f"MAP {host} {ip}" if ip and ip != host else ""

        launch_args = ["--no-sandbox"]
        if resolver_rules:
            launch_args.append(f"--host-resolver-rules={resolver_rules}")

        with sync_playwright() as p:
            browser = p.chromium.launch(args=launch_args)
            page = browser.new_page(
                extra_http_headers={"X-Eod-Render-Token": settings.pdf_render_token}
            )
            page.goto(url, wait_until="networkidle")
            pdf_bytes = page.pdf(format="A4", print_background=True)
            browser.close()
            return pdf_bytes
