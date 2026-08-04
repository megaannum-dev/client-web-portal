// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + MetricStat (components/mobo/Shared.tsx) + SegBar + the
// FeeSheet table (6 columns: Client/Model/Management fee/Incentive fee/
// Total fee/Status).
import { Skeleton } from "@/components/ui/skeleton";

export default function CommissionTrackingSkeleton() {
  return (
    <div className="w-full">
      {/* Page header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-[420px]" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-28 rounded" />
          <Skeleton className="h-9 w-36 rounded" />
        </div>
      </div>

      {/* MetricStat x4 */}
      <div className="mb-[18px] grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="min-w-0 rounded-[14px] border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-[9px] h-7 w-20" />
          </div>
        ))}
      </div>

      {/* SegBar + legend */}
      <Skeleton className="h-3 w-full rounded-full" />
      <div className="mb-[22px] mt-[9px] flex flex-wrap gap-[18px]">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-32" />
        ))}
      </div>

      {/* Fee sheet — 6 columns */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest shadow-card">
        <div className="grid grid-cols-6 gap-3.5 bg-surface-low px-3.5 py-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-full" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-6 items-center gap-3.5 border-t border-outline-variant px-3.5 py-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20 ml-auto" />
            <Skeleton className="h-4 w-20 ml-auto" />
            <Skeleton className="h-4 w-20 ml-auto" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
