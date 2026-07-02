"use client";

// MegaCRM — PC · Allocation Matrix. Data flows only through useAllocation().
import { useState } from "react";
import { Check, Eye, History } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { useAllocation } from "@/hooks/api/useAllocation";
import { StatStrip } from "@/components/pc/allocation-matrix/StatStrip";
import { PeriodPicker } from "@/components/pc/allocation-matrix/PeriodPicker";
import { ViewToggle, type Toggle } from "@/components/pc/allocation-matrix/ViewToggle";
import { HowToRead } from "@/components/pc/allocation-matrix/HowToRead";
import { Matrix } from "@/components/pc/allocation-matrix/Matrix";
import { DetailPanel } from "@/components/pc/allocation-matrix/DetailPanel";
import { ConfirmModal } from "@/components/pc/allocation-matrix/ConfirmModal";
import { EmptyPeriod } from "@/components/pc/allocation-matrix/EmptyPeriod";

interface Coord { cid: string; mid: string }

export default function AllocationMatrixPage() {
  const [periodLabel, setPeriodLabel] = useState<string | undefined>(undefined);
  const { data, loading, refetch, confirmPeriod } = useAllocation(periodLabel);
  // Default follows the latest period, not the open one (see periods[0]).
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

  const handleConfirm = () => {
    const openPeriodId = data?.periods.find((p) => p.status === "open")?.id;
    if (!openPeriodId) return;
    void confirmPeriod(openPeriodId).then((r) => {
      if (r.success) { setConfirmModal(false); setJustConfirmed(true); }
      else { setConfirmModal(false); }
    });
  };

  if (loading && !data) return (
    <div className="px-16 py-8">
      <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Allocation Matrix</h1>
      <div className="mt-8 text-center text-[15px] text-secondary">Loading allocation…</div>
    </div>
  );
  if (!data) return (
    <div className="px-16 py-8">
      <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Allocation Matrix</h1>
      <div className="mt-8"><EmptyPeriod onRetry={refetch} /></div>
    </div>
  );

  return (
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
            <span className="mt-px flex flex-none text-secondary"><History size={18} strokeWidth={2} /></span>
            <div className="flex-1"><div className="text-[13.5px] font-bold text-on-surface">Previewing {period} · historical</div><div className="mt-0.5 text-[12.5px] text-secondary">Switch back to {OPEN} to edit the open allocation.</div></div>
          </div>
        )}
        {confirmed && !historical && (
          <div className="mb-[18px] flex items-start gap-3 rounded-md border px-4 py-[13px]" style={{ background: "#fff6e6", borderColor: "#ffe2b0" }}>
            <span className="mt-px flex flex-none" style={{ color: "#9a5b00" }}><Check size={18} strokeWidth={2} /></span>
            <div className="flex-1"><div className="text-[13.5px] font-bold text-on-surface">{period} allocation is confirmed</div><div className="mt-0.5 text-[12.5px]" style={{ color: "#9a5b00" }}>The matrix is frozen so trading can open.</div></div>
          </div>
        )}
        <HowToRead view={view} />
        <Matrix data={data} view={view} onOpen={(cid, mid) => setOpen({ cid, mid })} />
      </div>
      {open && <DetailPanel data={data} period={period} cid={open.cid} mid={open.mid} onClose={() => setOpen(null)} />}
      {confirmModal && <ConfirmModal data={data} period={OPEN} onClose={() => setConfirmModal(false)} onConfirm={handleConfirm} />}
    </div>
  );
}
