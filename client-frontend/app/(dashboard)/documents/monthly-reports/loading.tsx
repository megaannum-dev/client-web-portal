import { Skeleton } from "@/components/ui/skeleton";

export default function MonthlyReportsLoading() {
  return (
    <div className="flex flex-col gap-8 pb-8">

      {/* Page header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-[380px]" />
      </div>

      {/* EOM Reports table */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-52" />
        </div>
        <div className="border border-outline-variant rounded-lg overflow-hidden">
          <div className="bg-surface-container px-6 py-3 grid grid-cols-4 gap-6 border-b border-outline-variant">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 w-full" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-6 py-[18px] grid grid-cols-4 gap-6 border-b border-outline-variant last:border-b-0 bg-surface-lowest">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-4 w-4 shrink-0" />
                <Skeleton className="h-4 flex-1" />
              </div>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 mx-auto" />
            </div>
          ))}
        </div>
        {/* Pagination skeleton */}
        <div className="flex items-center justify-between mt-4 px-1">
          <Skeleton className="h-4 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded" />
            <Skeleton className="h-7 w-7 rounded" />
            <Skeleton className="h-7 w-7 rounded" />
          </div>
        </div>
      </section>
    </div>
  );
}
