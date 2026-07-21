from typing import Protocol


class PdfRenderer(Protocol):
    def render(self, trade_date_iso: str) -> bytes:
        """Return PDF bytes for the signed-off day identified by trade_date_iso
        ('YYYY-MM-DD'). Implementations may assume the day's EoD record is
        already the frozen SIGNED state by the time this is called (BE-5 calls
        this AFTER write_snapshot_and_sign)."""
        ...
