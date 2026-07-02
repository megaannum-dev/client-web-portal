"use client";

import { Briefcase, Lock, X } from "@/lib/icons";
import { Chip } from "@/components/ui/Chip";
import { Eyebrow, Fact } from "@/components/pc/Shared";
import { type AllocationView } from "@/lib/pc/allocation";
import { fmtMoney, fmtMoneyShort } from "@/lib/pc/format";

/* ============================================================
   FLOATING ALLOCATION DETAIL  (framing A — rounded card from right)
   ============================================================ */
export function DetailPanel({
  data, period, cid, mid, onClose,
}: {
  data: AllocationView;
  period: string;
  cid: string;
  mid: string;
  onClose: () => void;
}) {
  const c = data.clientById(cid);
  const m = data.modelById(mid);
  const cell = data.cell(cid, mid);
  if (!c || !m || !cell) return null;
  const fund = data.cellFund(cid, mid);

  return (
    <>
      <div
        onClick={onClose}
        className="absolute inset-0 z-[8]"
        style={{ background: "rgba(40,38,34,0.18)" }}
      />
      <div
        className="absolute bottom-[18px] right-[18px] top-[18px] z-[9] flex w-[432px] max-w-[calc(100%-36px)] flex-col overflow-hidden rounded-[18px] border border-outline-variant bg-surface-lowest shadow-overlay"
      >
        <div className="flex-none border-b border-outline-variant px-[22px] pb-4 pt-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[20px] font-bold tracking-[-0.01em]">
                {c.name} <span className="font-semibold text-secondary">×</span> {m.name}
              </div>
              <div className="mt-1 text-[13px] text-secondary">
                {c.code} · pre-trade allocation · {period}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex flex-none cursor-pointer p-[3px] text-secondary"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-[22px] py-5">
          <div className="grid grid-cols-2 gap-[11px]">
            <Fact label="Model units" value={cell.units + "×"} />
            <Fact label="Account fund" value={fmtMoney(fund)} />
            <Fact label="Model size" value={fmtMoneyShort(m.size)} sub="/ unit" />
            <Fact label="Min account fund" value={fmtMoney(m.size)} sub="= 1 unit" />
          </div>

          <Eyebrow className="mb-[9px] mt-5">Linked IB account</Eyebrow>
          <div className="flex items-center gap-3 rounded-md border border-outline-variant bg-surface-low px-[15px] py-[13px]">
            <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-primary-fixed text-primary">
              <Briefcase size={18} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold tabular-nums">{c.acct}</div>
              <div className="mt-0.5 text-[12.5px] text-secondary">
                {c.name} · all of this client’s allocations trade here
              </div>
            </div>
            <Chip tone="neutral" dot={false}>
              <Lock size={11} strokeWidth={2} className="mr-[3px]" />per client
            </Chip>
          </div>
        </div>
      </div>
    </>
  );
}
