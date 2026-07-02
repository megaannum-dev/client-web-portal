"use client";

import { Grid3x3, RefreshCw } from "@/lib/icons";
import { Button } from "@/components/ui/Button";

/* ============================================================
   EMPTY / NEW-PERIOD STATE
   ============================================================ */
export function EmptyPeriod({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-lowest p-6 shadow-card">
      <div className="flex flex-col items-center gap-3.5 px-5 py-[72px] text-center">
        <span className="flex h-[60px] w-[60px] items-center justify-center rounded-lg bg-surface-low text-secondary">
          <Grid3x3 size={26} strokeWidth={1.75} />
        </span>
        <div className="text-[18px] font-bold text-on-surface">No allocation matrix available</div>
        <Button icon={RefreshCw} onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}
