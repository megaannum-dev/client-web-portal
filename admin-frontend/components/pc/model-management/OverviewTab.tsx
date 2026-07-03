"use client";

import { Pencil, Copy } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Fact, Ticks } from "@/components/pc/Shared";
import { fmtMoney } from "@/lib/pc/format";
import type { Model } from "@/lib/pc/types";

/* ============================================================
   SLIDE-IN DETAIL — Overview tab
   ============================================================ */
export function OverviewTab({ m, onEdit, onDuplicate }: { m: Model; onEdit: (id: string) => void; onDuplicate: (id: string) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-[11px]">
        <Fact label="Model size" value={fmtMoney(m.size)} />
        <Fact label="Category" value={m.category ?? "—"} />
        <Fact label="Mgmt Fee" value={m.mgmt_fee ? `${m.mgmt_fee.toFixed(2)}%` : "2.00%"} />
        <Fact label="Incentive Fee" value={m.incentive_fee ? `${m.incentive_fee.toFixed(2)}%` : "20.00%"} />
        <div className="rounded-[10px] bg-surface-low px-[13px] py-[11px]" style={{ gridColumn: "1 / -1" }}>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">Symbols</div>
          <div className="mt-2"><Ticks symbols={m.symbols} /></div>
        </div>
        {m.description && <Fact label="Description" value={m.description} span />}
        {m.underlyings && <Fact label="Traded Underlyings" value={m.underlyings} span />}
        {m.risk && <Fact label="Leverage and Risk" value={m.risk} span />}
        {m.liquidity && <Fact label="Liquidity" value={m.liquidity} />}
        {m.reporting && <Fact label="Reporting" value={m.reporting} />}
        {m.nav_perf && <Fact label="NAV and Performance" value={m.nav_perf} />}
        {m.subscription_redemption && <Fact label="Allotment & Redemption Process" value={m.subscription_redemption} />}
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" icon={Pencil} onClick={() => onEdit(m.id)}>Edit model</Button>
        <Button variant="secondary" icon={Copy} onClick={() => onDuplicate(m.id)}>Duplicate</Button>
      </div>
    </>
  );
}
