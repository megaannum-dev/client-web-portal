// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + ArStatStrip (4 tiles) + ArTabs + the default "allot" tab's
// AllotTable (8 columns per components/pc/allotment-redemption/AllotTable.tsx).
import { Skeleton } from "@/components/ui/skeleton";

export default function AllotmentRedemptionSkeleton() {
  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-5 w-[420px]" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-9 w-24 rounded" />
            <Skeleton className="h-9 w-28 rounded" />
          </div>
        </div>

        <div className="mt-6">
          {/* Stat strip */}
          <div className="mb-[22px] grid grid-cols-4 gap-3.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-[14px] border border-outline-variant bg-surface-lowest px-4 py-3.5 shadow-card">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="mt-2 h-6 w-14" />
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="mb-4 flex items-center gap-2 border-b border-outline-variant">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-36" />
          </div>

          {/* Allot table — 8 columns */}
          <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
            <div className="grid grid-cols-8 gap-3.5 bg-surface-low px-4 py-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-8 items-center gap-3.5 border-t border-outline-variant px-4 py-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-10 ml-auto" />
                <Skeleton className="h-4 w-16 ml-auto" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-20 rounded ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
