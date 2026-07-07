"use client";

import { Chip } from "@/components/ui/Chip";
import { StatusChip, Ticks, VerBadge } from "@/components/pc/Shared";
import { fmtMoney } from "@/lib/pc/format";
import type { Model } from "@/lib/pc/types";

type Tab = "overview" | "materials" | "changes";

/* ============================================================
   CARD GRID (default layout)
   ============================================================ */
function ModelCard({
  m, onOpen, onOpenSymbols,
}: {
  m: Model;
  onOpen: (id: string, tab: Tab) => void;
  onOpenSymbols: (id: string, symbol: string) => void;
}) {
  return (
    <div
      onClick={() => onOpen(m.id, "overview")}
      className="flex cursor-pointer flex-col gap-3.5 rounded-lg border border-outline-variant bg-surface-lowest p-[18px] shadow-card transition-shadow duration-150 hover:shadow-hover"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div>
          <div className="text-[18px] font-bold tracking-[-0.01em] text-on-surface">{m.name}</div>
        </div>
        <StatusChip status={m.status} />
      </div>
      <div className="text-[24px] font-bold tracking-[-0.02em] tabular-nums text-on-surface">
        {fmtMoney(m.size)}
      </div>
      <div className="flex flex-wrap gap-2">
        {m.category.length > 0
          ? m.category.map((c) => <Chip key={c} tone="active" dot={false}>{c}</Chip>)
          : <Chip tone="active" dot={false}>—</Chip>}
        <Chip tone="warm" dot={false}>Mgmt {m.mgmt}%</Chip>
        <Chip tone="neutral" dot={false}>Incentive {m.incentive}%</Chip>
      </div>
      <Ticks symbols={m.symbols} onSymbol={(s) => onOpenSymbols(m.id, s)} />
      <div className="flex items-center justify-end gap-2.5 border-t border-outline-variant pt-[13px]">
        <VerBadge version={m.version} none={m.status === "draft"} />
      </div>
    </div>
  );
}

export function CardGrid({
  models, onOpen, onOpenSymbols,
}: {
  models: Model[];
  onOpen: (id: string, tab: Tab) => void;
  onOpenSymbols: (id: string, symbol: string) => void;
}) {
  return (
    <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(20vw, 1fr))" }}>
      {models.map((m) => <ModelCard key={m.id} m={m} onOpen={onOpen} onOpenSymbols={onOpenSymbols} />)}
    </div>
  );
}
