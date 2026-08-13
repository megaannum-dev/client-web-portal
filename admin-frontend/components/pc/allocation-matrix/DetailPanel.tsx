"use client";

import { X } from "@/lib/icons";
import { Fact } from "@/components/pc/Shared";
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
                pre-trade allocation · {period}
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
            <Fact label="Model IB account" value={m.masterIb ?? "—"} sub="master" />
            <Fact label="Client IB account" value={cell.clientIb ?? "—"} sub="dedicated" />
          </div>
        </div>
      </div>
    </>
  );
}
