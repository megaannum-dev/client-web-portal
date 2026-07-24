"use client";

import { FileText, Eye } from "@/lib/icons";
import { StatCard, Notice } from "@/components/compliance/Shared";
import { GuidelineTable } from "./GuidelineTable";
import type { Guideline } from "@/lib/compliance/mock";

/* ---- Investment Guideline tab: read-only reference ---------
   Per-client guidelines created by PMs. No approval/sign-off workflow —
   this tab never blocks or gates anything (ported from CoGuideline.jsx). */
export function GuidelinePanel({
  rows, onRowClick, openId,
}: {
  rows: Guideline[];
  onRowClick: (id: string) => void;
  openId: string | null;
}) {
  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-3.5">
        <StatCard icon={FileText} k="Total guidelines" v={rows.length} />
      </div>
      <div className="mb-4">
        <Notice tone="info" icon={FileText}>
          <b>Read-only reference</b> — per-client guidelines created by Portfolio Managers. Look up any guideline and download the attached document; no approval or sign-off is required here.
        </Notice>
      </div>
      <GuidelineTable rows={rows} onRowClick={onRowClick} openId={openId} />
      <div className="mt-4 flex flex-wrap gap-x-[22px] gap-y-2 text-[12.5px] text-secondary">
        <span className="flex items-center gap-1.5"><Eye size={13} strokeWidth={2} />Click any row → view guideline facts + download document</span>
      </div>
    </>
  );
}
