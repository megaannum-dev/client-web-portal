"use client";

/* ============================================================
   MegaCRM — PC · Allocation Matrix (hi-fi page)
   Framing A — the matrix is the resting surface; clicking a cell
   floats in the per-allocation detail (units, derived fund, the
   client's one linked IB account). An irreversible period lock, and
   the empty new-period state.

   Ported faithfully from the design prototype (AllocationMatrix.jsx).
   Adaptations (ship the baked product, not the tweakable demo):
     - The IB account is per CLIENT, not per model: every allocation a
       client holds trades through that client's single IB account
       (AllocationClient.acct). The cell detail sources it from the row.
     - flow-canvas `initial*` props dropped — internal useState with
       the prototype's resting defaults. The matrix renders `locked`
       (cells show "—" / stay clickable → DetailPanel) and the panel
       is read-only, matching the prototype's resting render.

   Data flows ONLY through the loadAllocation() seam + AllocationView
   methods; no fund/units math is recomputed inline.
   ============================================================ */

import { useState } from "react";
import { Check, Eye, History } from "@/lib/icons";
import { fmtMoney, fmtMoneyShort } from "@/lib/pc/format";
import { useAllocation } from "@/hooks/api/useAllocation";
import { confirmPeriod as confirmPeriodAction } from "@/app/(roles)/pc/allocation-matrix/actions";
import { Button } from "@/components/ui/Button";
import { StatStrip } from "@/components/pc/allocation-matrix/StatStrip";
import { PeriodPicker } from "@/components/pc/allocation-matrix/PeriodPicker";
import { ViewToggle, type Toggle } from "@/components/pc/allocation-matrix/ViewToggle";
import { HowToRead } from "@/components/pc/allocation-matrix/HowToRead";
import { Matrix } from "@/components/pc/allocation-matrix/Matrix";
import { DetailPanel } from "@/components/pc/allocation-matrix/DetailPanel";
import { ConfirmModal } from "@/components/pc/allocation-matrix/ConfirmModal";
import { EmptyPeriod } from "@/components/pc/allocation-matrix/EmptyPeriod";

interface Coord { cid: string; mid: string }

/* ============================================================
   PAGE
   ============================================================ */
export default function AllocationMatrixPage() {
  const [periodLabel, setPeriodLabel] = useState<string | undefined>(undefined);
  const { data, loading, refetch } = useAllocation(periodLabel);

  // The latest period is periods[0] (backend orders by created_at DESC).
  // Default selection follows the latest matrix, not the open one — when the
  // newest period has already been confirmed, openPeriod points to an older
  // still-open period, which is the wrong default.
  const LATEST = data?.periods[0]?.label ?? "";
  const OPEN = data?.openPeriod ?? "";
  const period = periodLabel ?? LATEST;

  const [view, setView] = useState<Toggle>("units");
  const [open, setOpen] = useState<Coord | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);

  const selectedStatus = data?.periods.find((p) => p.label === period)?.status;
  const confirmed = selectedStatus === "confirmed" || justConfirmed;
  const historical = !!OPEN && period !== OPEN;
  const onOpen = (cid: string, mid: string) => setOpen({ cid, mid });

  const handleConfirm = () => {
    const openPeriodId = data?.periods.find((p) => p.status === "open")?.id;
    if (!openPeriodId) return;
    void (async () => {
      try {
        const result = await confirmPeriodAction(openPeriodId);
        if (result.success) { setConfirmModal(false); setJustConfirmed(true); refetch(); }
      } catch { setConfirmModal(false); }
    })();
  };

  if (loading && !data) {
    return (
      <div className="px-16 py-8">
        <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Allocation Matrix</h1>
        <div className="mt-8 text-center text-[15px] text-secondary">Loading allocation…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-16 py-8">
        <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Allocation Matrix</h1>
        <div className="mt-8"><EmptyPeriod onRetry={refetch} /></div>
      </div>
    );
  }

  return (
    // Full-bleed work surface: negative margins cancel <main>’s p-8 px-16 so
    // the relative root (and every absolute inset-0 backdrop + the floating
    // detail panel) covers the entire content area, padding included. The
    // inner wrapper re-applies that padding so content stays put. min-h fills
    // the shell content area (viewport − 64px header).
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Allocation Matrix</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <PeriodPicker view={data} period={period} onPick={setPeriodLabel} />
              <p className="text-[15px] text-secondary">
                {historical || confirmed ? "Historical · read-only" : "Pre-trade allocation · review & confirm"} · {data.clients.length} clients · {data.liveModels.length} live models
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ViewToggle view={view} onView={setView} />
            {historical ? (
              <Button variant="secondary" icon={Eye} disabled>Read-only preview</Button>
            ) : confirmed ? (
              <Button variant="secondary" icon={Check} disabled>Confirmed · read-only</Button>
            ) : (
              <Button icon={Check} onClick={() => setConfirmModal(true)}>Confirm allocation</Button>
            )}
          </div>
        </div>

        <StatStrip view={data} period={period} />
        {historical && (
          <div className="mb-[18px] flex items-start gap-3 rounded-md border border-outline-variant bg-surface-low px-4 py-[13px]">
            <span className="mt-px flex flex-none text-secondary">
              <History size={18} strokeWidth={2} />
            </span>
            <div className="flex-1">
              <div className="text-[13.5px] font-bold text-on-surface">Previewing {period} · historical</div>
              <div className="mt-0.5 text-[12.5px] text-secondary">
                This is a locked past period, shown read-only. Switch back to {OPEN} to edit the open allocation.
              </div>
            </div>
          </div>
        )}
        {confirmed && !historical && (
          <div
            className="mb-[18px] flex items-start gap-3 rounded-md border px-4 py-[13px]"
            style={{ background: "#fff6e6", borderColor: "#ffe2b0" }}
          >
            <span className="mt-px flex flex-none" style={{ color: "#9a5b00" }}>
              <Check size={18} strokeWidth={2} />
            </span>
            <div className="flex-1">
              <div className="text-[13.5px] font-bold text-on-surface">{period} allocation is confirmed</div>
              <div className="mt-0.5 text-[12.5px]" style={{ color: "#9a5b00" }}>
                The matrix is frozen so trading can open. This can’t be undone — the allocation is fixed until the next period opens.
              </div>
            </div>
          </div>
        )}
        <HowToRead view={view} />
        <Matrix data={data} view={view} onOpen={onOpen} />
      </div>

      {open && (
        <DetailPanel
          data={data}
          period={period}
          cid={open.cid}
          mid={open.mid}
          onClose={() => setOpen(null)}
        />
      )}
      {confirmModal && (
        <ConfirmModal
          data={data}
          period={OPEN}
          onClose={() => setConfirmModal(false)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
