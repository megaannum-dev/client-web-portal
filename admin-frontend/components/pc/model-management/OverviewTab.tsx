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
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" icon={Pencil} onClick={() => onEdit(m.id)}>Edit model</Button>
        <Button variant="secondary" icon={Copy} onClick={() => onDuplicate(m.id)}>Duplicate</Button>
      </div>
    </>
  );
}
