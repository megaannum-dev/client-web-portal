import { type ReactNode } from "react";
import { CalendarDays } from "@/lib/icons";
import { type AllocationView } from "@/lib/pc/allocation";
import { fmtMoneyShort } from "@/lib/pc/format";
import { LABEL } from "./HowToRead";

/* ============================================================
   STAT STRIP
   ============================================================ */
export function StatStrip({ view, period }: { view: AllocationView; period: string }) {
  const stats: { k: string; v: ReactNode; icon?: boolean }[] = [
    { k: "Allocation period", v: period, icon: true },
    { k: "Clients allocated", v: view.clients.length },
    { k: "Live models", v: view.liveModels.length },
    { k: "Total account fund", v: fmtMoneyShort(view.totalFund()) },
  ];
  return (
    <div className="mb-[22px] grid grid-cols-4 gap-3.5">
      {stats.map((s) => (
        <div
          key={s.k}
          className="rounded-[14px] border border-outline-variant bg-surface-lowest px-4 py-3.5 shadow-card"
        >
          <div className={`flex items-center gap-1.5 ${LABEL}`}>
            {s.icon && <CalendarDays size={13} strokeWidth={2} />}
            {s.k}
          </div>
          <div className="mt-2 text-[24px] font-bold tracking-[-0.02em] tabular-nums text-on-surface">
            {s.v}
          </div>
        </div>
      ))}
    </div>
  );
}
