from __future__ import annotations

from typing import TYPE_CHECKING

from fpdf import FPDF

if TYPE_CHECKING:
    from app.schemas.eod import EodReportViewOut


class SimplePdfRenderer:
    """Pure-Python PDF via fpdf2 — no browser, no routing, no system deps."""

    def render(self, view: EodReportViewOut) -> bytes:
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.add_page()

        # Title
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, f"Daily Exception Report  {view.settleDay}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        # Summary block
        pdf.set_font("Helvetica", "", 11)
        lines = [
            f"Trade date:    {view.tradeDate}",
            f"Status:        {view.status.value}",
            f"Outcome:       {view.outcome.value}",
            f"Orders:        {view.orderCount}",
            f"Executions:    {view.executionCount}",
            f"Notional:      {view.notionalTraded}",
            f"Break total:   {view.breakTotal}",
        ]
        if view.signedOffBy:
            lines.append(f"Signed off by: {view.signedOffBy}")
        if view.generated:
            lines.append(f"Generated:     {view.generated}")

        for line in lines:
            pdf.cell(0, 7, line, new_x="LMARGIN", new_y="NEXT")

        pdf.ln(4)

        # Totals
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Totals", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 7, f"Algo:  {view.algoTotal}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 7, f"IB:    {view.ibTotal}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 7, f"CRM:   {view.crmTotal}", new_x="LMARGIN", new_y="NEXT")

        pdf.ln(4)

        # Break counts
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Break Counts", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        c = view.counts
        pdf.cell(0, 7, f"Algo-IB:     {c.algIbBrk}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 7, f"IB-CRM:      {c.ibCrmBrk}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 7, f"Algo-CRM:    {c.algCrmBrk}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 7, f"Total:       {c.totalBrk}", new_x="LMARGIN", new_y="NEXT")

        return pdf.output()
