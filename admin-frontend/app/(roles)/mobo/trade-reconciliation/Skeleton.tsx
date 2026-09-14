// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + the default "recon" tab: 5 MetricStat tiles, the SegBar, and
// the RecordsTable spreadsheet (23 columns per TABLE_HEAD in page.tsx).
import { Skeleton } from "@/components/ui/skeleton";

const COLS = 23;

export default function TradeReconciliationSkeleton() {
  return (
    <div className="w-full">
      {/* Page header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-32 rounded" />
          <Skeleton className="h-9 w-24 rounded" />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-2 border-b border-outline-variant">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-56" />
      </div>

      {/* Five metric tiles */}
      <div className="mb-[18px] mt-[18px] grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="min-w-0 rounded-[14px] border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-[9px] h-7 w-10" />
          </div>
        ))}
      </div>

      <Skeleton className="h-3 w-full rounded-full" />

      {/* Records spreadsheet — 23 columns, scrolls instead of squashing */}
      <div className="mt-[22px] overflow-hidden rounded-xl border border-outline-variant bg-surface-lowest shadow-card">
        <div className="overflow-x-auto">
          <div className="min-w-[2300px]">
            <div className="grid grid-cols-[repeat(23,minmax(0,1fr))] gap-3.5 bg-surface-low px-3.5 py-2.5">
              {Array.from({ length: COLS }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[repeat(23,minmax(0,1fr))] items-center gap-3.5 border-t border-outline-variant px-3.5 py-2.5">
                {Array.from({ length: COLS }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
