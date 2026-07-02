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
        <Fact label="Manager" value={m.manager} />
        <Fact label="Mgmt fee" value={`${m.mgmt}%`} />
        <Fact label="Incentive fee" value={`${m.incentive}%`} />
        <div className="rounded-[10px] bg-surface-low px-[13px] py-[11px]" style={{ gridColumn: "1 / -1" }}>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">Symbols</div>
          <div className="mt-2"><Ticks symbols={m.symbols} /></div>
        </div>
        <Fact label="Introduced" value={m.intro} span />
        {m.description && <Fact label="Description" value={m.description} span />}
        {m.underlyings && <Fact label="Traded Underlyings" value={m.underlyings} span />}
        {m.risk && <Fact label="Leverage and Risk" value={m.risk} span />}
        {m.liquidity && <Fact label="Liquidity" value={m.liquidity} />}
        {m.reporting && <Fact label="Reporting" value={m.reporting} />}
        {m.nav_perf && <Fact label="NAV and Performance" value={m.nav_perf} />}
        {/* mgmt_fee / incentive_fee are stored on the SAME whole-number
            percentage scale as m.mgmt / m.incentive (e.g. 2 => "2%"), not
            as a decimal fraction — see lib/pc/models.ts (`mgmt: dto.mgmt_fee
            ?? DEFAULT_MGMT_PCT`) and lib/pc/format.ts (`m.mgmt / 100`). */}
        {m.mgmt_fee != null && <Fact label="Mgmt Fee (stored)" value={`${m.mgmt_fee.toFixed(2)}%`} />}
        {m.incentive_fee != null && <Fact label="Incentive Fee (stored)" value={`${m.incentive_fee.toFixed(2)}%`} />}
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" icon={Pencil} onClick={() => onEdit(m.id)}>Edit model</Button>
        <Button variant="secondary" icon={Copy} onClick={() => onDuplicate(m.id)}>Duplicate</Button>
      </div>
    </>
  );
}
