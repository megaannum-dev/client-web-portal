// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + the 5-column End-of-Month Reports table + pagination row.
import { Skeleton } from "@/components/ui/skeleton";

export default function MonthlyReportsSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-8 pb-8">

      {/* Page header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-6 w-52" />
        </div>

        <div className="overflow-hidden rounded-lg border border-outline-variant">
          <div className="grid grid-cols-5 gap-4 border-b border-outline-variant bg-surface-container px-5 py-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 w-full" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-5 items-center gap-4 border-b border-outline-variant px-5 py-4 last:border-b-0 bg-surface-lowest">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-4 w-4 shrink-0" />
                <Skeleton className="h-4 flex-1" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-4 mx-auto" />
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between px-1">
          <Skeleton className="h-4 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded" />
            <Skeleton className="h-7 w-7 rounded" />
            <Skeleton className="h-7 w-7 rounded" />
            <Skeleton className="h-7 w-7 rounded" />
          </div>
        </div>
      </section>
    </div>
  );
}
