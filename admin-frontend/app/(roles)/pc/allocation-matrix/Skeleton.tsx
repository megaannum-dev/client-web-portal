// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + header + StatStrip (4 tiles) + the Matrix table.
import { Skeleton } from "@/components/ui/skeleton";

export default function AllocationMatrixSkeleton() {
  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-56" />
            <div className="mt-2 flex items-center gap-3">
              <Skeleton className="h-8 w-32 rounded" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded" />
            <Skeleton className="h-9 w-32 rounded" />
            <Skeleton className="h-9 w-40 rounded" />
          </div>
        </div>

        {/* Stat strip */}
        <div className="mb-[22px] grid grid-cols-4 gap-3.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[14px] border border-outline-variant bg-surface-lowest px-4 py-3.5 shadow-card">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="mt-2 h-6 w-14" />
            </div>
          ))}
        </div>

        {/* Matrix table */}
        <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
          <div className="grid grid-cols-6 gap-4 bg-surface-low px-4 py-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 w-full" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-6 items-center gap-4 border-t border-outline-variant px-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
