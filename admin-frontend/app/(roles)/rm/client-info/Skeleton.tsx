// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + the Client Book section (header, search bar, 6-column table)
// and the right-rail SummaryCard accordion (3 cards).
import { Skeleton } from "@/components/ui/skeleton";

export default function RmClientInfoSkeleton() {
  return (
    <div className="relative -mx-16 -my-8 flex min-h-[calc(100vh_-_64px)] flex-col px-16 py-8">
      <div className="mx-auto flex w-full flex-1 flex-col">
        <div className="mb-4 flex flex-col gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-80" />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)]">
          {/* Client book */}
          <section className="flex flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
            <header className="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
              <div className="flex items-baseline gap-2.5">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-3.5 w-16" />
              </div>
              <Skeleton className="h-9 w-32 rounded" />
            </header>

            <div className="px-5 py-4">
              <Skeleton className="h-[52px] w-full rounded-md" />
            </div>

            {/* Table — 6 columns: Client Name/Phone/Status/RM/Renewal/blank */}
            <div className="grid grid-cols-6 gap-4 bg-surface-low px-[18px] py-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-6 items-center gap-4 border-t border-outline-variant px-[18px] py-[13px]">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-4 ml-auto" />
              </div>
            ))}
          </section>

          {/* Right rail — SummaryCard accordion x3 */}
          <div className="flex min-h-0 flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest shadow-card">
                <div className="flex items-center justify-between px-5 pb-3 pt-3.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-4 w-4" />
                </div>
                <div className="px-5 pb-4">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="mt-2 h-3.5 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
