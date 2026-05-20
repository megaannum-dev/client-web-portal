import { Skeleton } from "@/components/ui/skeleton";

export default function EventsLoading() {
  return (
    <div className="flex flex-col gap-8 pb-8">

      {/* Page header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-5 w-[400px]" />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {[80, 100, 140, 96].map((w, i) => (
          <Skeleton key={i} className={`h-9 w-${w === 80 ? "20" : w === 100 ? "24" : w === 140 ? "36" : "24"} rounded-full`} />
        ))}
      </div>

      {/* Event cards */}
      <div className="flex flex-col gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-surface-lowest border border-outline-variant rounded-xl p-5 flex gap-5 items-start">
            <Skeleton className="size-12 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4 mb-2">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-3.5 w-16 shrink-0" />
              </div>
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-4/5 mb-4" />
              <div className="flex gap-3">
                <Skeleton className="h-8 w-28 rounded" />
                <Skeleton className="h-8 w-20 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
