"use client";

import { Chip } from "@/components/ui/Chip";
import { StatusChip, Ticks, VerBadge } from "@/components/pc/Shared";
import { fmtMoney } from "@/lib/pc/format";
import type { Model } from "@/lib/pc/types";

type Tab = "overview" | "materials" | "changes";

/* ============================================================
   CARD GRID (default layout)
   ============================================================ */
function ModelCard({ m, onOpen }: { m: Model; onOpen: (id: string, tab: Tab) => void }) {
  return (
    <div
      onClick={() => onOpen(m.id, "overview")}
      className="flex cursor-pointer flex-col gap-3.5 rounded-lg border border-outline-variant bg-surface-lowest p-[18px] shadow-card transition-shadow duration-150 hover:shadow-hover"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div>
          <div className="text-[18px] font-bold tracking-[-0.01em] text-on-surface">{m.name}</div>
          <div className="mt-[3px] text-[13px] text-secondary">{m.manager}</div>
        </div>
        <StatusChip status={m.status} />
      </div>
      <div className="text-[24px] font-bold tracking-[-0.02em] tabular-nums text-on-surface">
        {fmtMoney(m.size)}
      </div>
      <div className="flex gap-2">
        <Chip tone="warm" dot={false}>Mgmt {m.mgmt}%</Chip>
        <Chip tone="neutral" dot={false}>Incentive {m.incentive}%</Chip>
      </div>
      <Ticks symbols={m.symbols} />
      <div className="flex items-center justify-end gap-2.5 border-t border-outline-variant pt-[13px]">
        <VerBadge version={m.version} none={m.status === "draft"} />
      </div>
    </div>
  );
}

export function CardGrid({ models, onOpen }: { models: Model[]; onOpen: (id: string, tab: Tab) => void }) {
  return (
    <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      {models.map((m) => <ModelCard key={m.id} m={m} onOpen={onOpen} />)}
    </div>
  );
}
