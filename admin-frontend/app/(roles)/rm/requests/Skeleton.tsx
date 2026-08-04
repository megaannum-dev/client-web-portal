// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + RequestTicketsInbox (components/rm/RequestTickets.tsx):
// 3 stat cards, filter pills, and the 7-column ticket table.
import { Skeleton } from "@/components/ui/skeleton";

export default function RequestTicketsSkeleton() {
  return (
    <div className="mx-auto">
      <div className="mb-7 flex flex-col gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Status strip */}
      <div className="mb-5 flex flex-wrap gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex min-w-[200px] flex-1 items-center gap-3.5 rounded-lg border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card">
            <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-md" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-6 w-14" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-5 py-3.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>

        {/* Table — 7 columns */}
        <div className="grid grid-cols-7 gap-4 bg-surface-low px-[18px] py-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-full" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid grid-cols-7 items-center gap-4 border-t border-outline-variant px-[18px] py-[13px]">
            <Skeleton className="h-4 w-12" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16 ml-auto" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </section>
    </div>
  );
}
