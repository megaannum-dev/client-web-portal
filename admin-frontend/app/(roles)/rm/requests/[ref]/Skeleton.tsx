// Server component: no "use client", no hooks, no props. Mirrors
// RequestTicketDetail's real structure (components/rm/RequestTickets.tsx):
// back link, header (icon/ref/chip), and the two-column trade-request layout
// (Card "Client Request" facts grid + the act-on-trade side panel).
import { Skeleton } from "@/components/ui/skeleton";

export default function RequestTicketDetailSkeleton() {
  return (
    <div className="mx-auto">
      <Skeleton className="mb-[18px] h-4 w-48" />

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Skeleton className="h-12 w-12 shrink-0 rounded-md" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 rounded" />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
        <section className="h-full overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
          <header className="flex items-center border-b border-outline-variant px-5 py-4">
            <Skeleton className="h-5 w-32" />
          </header>
          <div className="px-5 py-[18px]">
            <div className="grid grid-cols-2 gap-x-7 gap-y-[18px]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-[7px]">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-outline-variant pt-[18px]">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-5 w-40" />
              <Skeleton className="mt-4 h-3 w-20" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-1.5 h-4 w-2/3" />
            </div>
          </div>
        </section>

        <section className="h-full overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
          <div className="flex flex-col gap-3 px-5 py-[18px]">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded" />
          </div>
        </section>
      </div>
    </div>
  );
}
