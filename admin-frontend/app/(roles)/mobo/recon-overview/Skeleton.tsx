// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + MetricStat grid + the two-column layout (Today's
// reconciliation / Open exceptions on the left, End-of-day report on the
// right) — real chrome classes copied straight from page.tsx.
import { Skeleton } from "@/components/ui/skeleton";

const CARD = "rounded-2xl border border-outline-variant bg-surface-lowest shadow-card";

export default function ReconOverviewSkeleton() {
  return (
    <div className="w-full">
      {/* Page header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-72" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-36 rounded" />
          <Skeleton className="h-9 w-44 rounded" />
        </div>
      </div>

      {/* Four counters */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${CARD} px-[18px] py-4`}>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-[9px] h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        {/* LEFT column */}
        <div className="flex flex-col gap-6">
          {/* Today's reconciliation */}
          <section className={`${CARD} px-5 pb-5 pt-[18px]`}>
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="mt-3.5 flex flex-wrap items-center gap-[18px]">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-24" />
              ))}
            </div>
          </section>

          {/* Open exceptions — 6 columns */}
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </header>
            <div className="grid grid-cols-6 gap-4 bg-surface-low px-[18px] py-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid grid-cols-6 items-center gap-4 border-t border-outline-variant px-[18px] py-3">
                <Skeleton className="h-5 w-12 rounded" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-10 ml-auto" />
                <Skeleton className="h-4 w-4 ml-auto" />
              </div>
            ))}
          </section>
        </div>

        {/* RIGHT column */}
        <div className="flex flex-col gap-6">
          <section className={`${CARD} px-5 pb-5 pt-[18px]`}>
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-5 w-8" />
            </div>
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="flex gap-2.5">
              <Skeleton className="h-9 w-full rounded" />
              <Skeleton className="h-9 w-full rounded" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
