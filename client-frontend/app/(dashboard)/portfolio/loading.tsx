import { Skeleton } from "@/components/ui/skeleton";

export default function PortfolioLoading() {
  return (
    <div className="flex flex-col gap-8 pb-8">

      {/* Page header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Portfolio Summary stat cards */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-6 w-6 rounded-full" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-outline-variant rounded-lg p-5 flex flex-col gap-3 bg-surface-lowest">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>

      {/* Portfolio Insights */}
      <section>
        <Skeleton className="h-7 w-44 mb-4" />
        <div className="grid grid-cols-[1fr_320px] gap-4">

          {/* Left: two stacked chart cards */}
          <div className="flex flex-col gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-surface-lowest border border-outline-variant rounded-lg p-6">
                <Skeleton className="h-3.5 w-48 mb-4" />
                <Skeleton className="h-[220px] w-full rounded" />
              </div>
            ))}
          </div>

          {/* Right: donut chart card */}
          <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6">
            <Skeleton className="h-3.5 w-36 mb-6" />
            <Skeleton className="h-[200px] w-[200px] rounded-full mx-auto mb-6" />
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-2.5 h-2.5 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Allotted Models table */}
      <section>
        <Skeleton className="h-7 w-40 mb-4" />
        <div className="border border-outline-variant rounded-lg overflow-hidden">
          <div className="bg-surface-container px-6 py-4 grid grid-cols-8 gap-3 border-b border-outline-variant">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 w-full" />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-6 py-4 grid grid-cols-8 gap-3 border-b border-outline-variant last:border-b-0 bg-surface-lowest">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-7 w-20 rounded mx-auto" />
            </div>
          ))}
        </div>
      </section>

      {/* Available Models table */}
      <section>
        <Skeleton className="h-7 w-44 mb-4" />
        <div className="border border-outline-variant rounded-lg overflow-hidden">
          <div className="bg-surface-container px-6 py-4 grid grid-cols-9 gap-3 border-b border-outline-variant">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 w-full" />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-6 py-4 grid grid-cols-9 gap-3 border-b border-outline-variant last:border-b-0 bg-surface-lowest">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-7 w-20 rounded mx-auto" />
            </div>
          ))}
        </div>
      </section>

      {/* Historical Requests table */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="border border-outline-variant rounded-lg overflow-hidden">
          <div className="bg-surface-container px-6 py-3 grid grid-cols-6 gap-4 border-b border-outline-variant">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 w-full" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-6 py-4 grid grid-cols-6 gap-4 border-b border-outline-variant last:border-b-0 bg-surface-lowest">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-24 rounded" />
            </div>
          ))}
          {/* Pagination footer */}
          <div className="px-6 py-4 bg-surface-container border-t border-outline-variant flex items-center justify-between">
            <Skeleton className="h-4 w-36" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded" />
              <div className="flex gap-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-7 rounded" />
                ))}
              </div>
              <Skeleton className="h-7 w-7 rounded" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
