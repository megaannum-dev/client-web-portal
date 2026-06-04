"use client";

import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Chip } from "@/components/ui/Chip";
import type { SummaryItem } from "@/lib/mock/rm-data";

interface SummaryCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  subTone?: "down" | "neutral";
  items: SummaryItem[];
  onItem?: (item: SummaryItem) => void;
  footerLabel?: string;
  onFooter?: () => void;
}

export function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  subTone = "neutral",
  items,
  onItem,
  footerLabel,
  onFooter,
}: SummaryCardProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
      <div className="px-5 pb-3.5 pt-[18px]">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-secondary">{label}</span>
          <span
            className="flex h-8 w-8 items-center justify-center rounded text-primary"
            style={{ background: "rgba(242,116,5,0.10)" }}
          >
            <Icon size={18} strokeWidth={1.75} />
          </span>
        </div>
        <div className="mt-2.5 flex items-baseline gap-2.5">
          <span className="text-[34px] font-bold tracking-[-0.02em] tabular-nums text-on-surface">{value}</span>
          <span className={clsx("text-[13px] font-semibold", subTone === "down" ? "text-error" : "text-secondary")}>
            {sub}
          </span>
        </div>
      </div>
      <div className="h-px bg-outline-variant" />
      <div className="flex flex-col">
        {items.map((x, i) => (
          <button
            key={x.id + i}
            type="button"
            onClick={() => onItem?.(x)}
            className={clsx(
              "flex items-center justify-between gap-2.5 px-5 py-[11px] text-left transition-colors duration-150",
              i > 0 && "border-t border-outline-variant",
              onItem ? "cursor-pointer hover:bg-surface-container" : "cursor-default",
            )}
          >
            <span className="text-[14px] font-semibold text-on-surface">{x.c}</span>
            <Chip tone={x.t} dot={x.t === "neutral"}>{x.d || x.s}</Chip>
          </button>
        ))}
      </div>
      {footerLabel && (
        <button
          type="button"
          onClick={onFooter}
          className="block w-full border-t border-outline-variant px-5 py-3 text-left text-[13px] font-bold text-primary"
        >
          {footerLabel} →
        </button>
      )}
    </section>
  );
}
