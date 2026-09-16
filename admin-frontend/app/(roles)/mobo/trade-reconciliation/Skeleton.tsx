// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + the default "recon" tab: the 4-card exception bento, the
// SegBar, the grid toolbar, and the 16-column recon spreadsheet (one column
// per RECON_COLUMNS entry in lib/mobo/executions.ts).
import { Skeleton } from "@/components/ui/skeleton";

const COLS = 16;
const GRID = "grid-cols-[repeat(16,minmax(0,1fr))]";

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

      {/* Exception bento — one verdict card + one per system */}
      <div className="mb-[18px] mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(198px,1fr))] items-stretch gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex min-w-0 flex-col justify-between gap-3 rounded-[14px] border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-[5px] w-full rounded-full" />
          </div>
        ))}
      </div>

      <Skeleton className="h-3 w-full rounded-full" />

      {/* Grid toolbar — search, filters, count, columns, expansion level */}
      <div className="mt-[22px] flex flex-wrap items-center gap-[9px]">
        <Skeleton className="h-8 w-[250px] rounded-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded" />
        ))}
        <Skeleton className="ml-auto h-4 w-44" />
        <Skeleton className="h-8 w-28 rounded" />
        <Skeleton className="h-8 w-52 rounded-md" />
      </div>

      {/* Records spreadsheet — 16 columns, scrolls instead of squashing */}
      <div className="mt-3 overflow-hidden rounded-md border border-outline-variant bg-surface-lowest shadow-card">
        <div className="overflow-x-auto">
          <div className="min-w-[1500px]">
            <div className={`grid ${GRID} gap-3.5 bg-surface-low px-3 py-2.5`}>
              {Array.from({ length: COLS }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`grid ${GRID} items-center gap-3.5 border-t border-outline-variant px-3 py-2.5`}>
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
