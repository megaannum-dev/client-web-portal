// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + the default "recon" tab: 5 MetricStat tiles, the SegBar, and
// the RecordsTable spreadsheet (10 columns per TABLE_HEAD in page.tsx).
import { Skeleton } from "@/components/ui/skeleton";

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

      {/* Records spreadsheet — 10 columns */}
      <div className="mt-[22px] overflow-hidden rounded-xl border border-outline-variant bg-surface-lowest shadow-card">
        <div className="grid grid-cols-10 gap-3.5 bg-surface-low px-3.5 py-2.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-full" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid grid-cols-10 items-center gap-3.5 border-t border-outline-variant px-3.5 py-2.5">
            <Skeleton className="h-5 w-12 rounded" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12 ml-auto" />
            <Skeleton className="h-4 w-10 ml-auto" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
