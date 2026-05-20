import { Skeleton } from "@/components/ui/skeleton";

export default function OverviewLoading() {
  return (
    <div className="flex flex-col gap-8 pb-20">

      {/* Page header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Account Summary + stat cards */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-6 w-6 rounded-full" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-outline-variant rounded-lg p-5 flex flex-col gap-3 bg-surface-lowest">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>

      {/* Main: left tables + right panel */}
      <div className="grid grid-cols-[3fr_minmax(300px,1fr)] gap-6 items-start">

        {/* Left */}
        <div className="flex flex-col gap-8">

          {/* Recent Request Status table */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              <div className="bg-surface-container px-5 py-3 grid grid-cols-5 gap-4 border-b border-outline-variant">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-3.5 w-full" />
                ))}
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-[18px] grid grid-cols-5 gap-4 border-b border-outline-variant last:border-b-0 bg-surface-lowest">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>

          {/* Monthly EOM Reports table */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              <div className="bg-surface-container px-5 py-3 grid grid-cols-4 gap-4 border-b border-outline-variant">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-3.5 w-full" />
                ))}
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-5 py-[18px] grid grid-cols-4 gap-4 border-b border-outline-variant last:border-b-0 bg-surface-lowest">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-6 mx-auto" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex flex-col gap-6">

          {/* Latest Events */}
          <div>
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border border-outline-variant rounded-lg p-4 flex items-start gap-3">
                  <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3.5 w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="h-px bg-outline-variant" />

          {/* Manage Requests CTA card */}
          <div className="bg-surface-container rounded-lg p-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-3 w-28 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
