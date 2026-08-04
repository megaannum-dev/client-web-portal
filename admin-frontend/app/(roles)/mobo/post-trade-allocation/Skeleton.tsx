// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + the "all models" AllModelsCard (chart card) — the default
// view on first paint, before usePostTradeAllocation() has data.
import { Skeleton } from "@/components/ui/skeleton";

export default function PostTradeAllocationSkeleton() {
  return (
    <div className="flex min-h-[calc(100vh-9rem)] w-full flex-col">
      {/* Page header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-32 rounded" />
          <Skeleton className="h-9 w-20 rounded" />
        </div>
      </div>

      {/* Scope toggle row */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-40 rounded-full" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* All-models card: header (title + total) + chart area + caption */}
      <div className="flex flex-1 flex-col rounded-2xl border border-outline-variant bg-surface-lowest px-5 pb-5 pt-[18px] shadow-card">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
        <div className="flex min-h-0 w-full flex-1 items-end gap-4 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-full" style={{ height: `${40 + (i % 3) * 20}%` }} />
          ))}
        </div>
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-1.5 h-4 w-2/3" />
      </div>
    </div>
  );
}
