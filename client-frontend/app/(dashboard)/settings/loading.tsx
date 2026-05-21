import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-8 pb-8">

      {/* Page header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-5 w-72" />
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-8 items-start">

        {/* Left nav tabs */}
        <div className="border border-outline-variant rounded-lg overflow-hidden bg-surface-lowest">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`px-4 py-3.5 flex items-center gap-3 ${i < 3 ? "border-b border-outline-variant" : ""}`}>
              <Skeleton className="h-4 w-4 rounded shrink-0" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>

        {/* Right panel */}
        <div className="border border-outline-variant rounded-lg p-6 bg-surface-lowest flex flex-col gap-6">

          {/* Section title */}
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-4.5 w-4.5 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>

          {/* Two settings rows */}
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-4 border-b border-outline-variant last:border-b-0">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3.5 w-56" />
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          ))}

          {/* Toggle rows */}
          <div className="flex items-center gap-2.5 mt-2">
            <Skeleton className="h-4.5 w-4.5 rounded" />
            <Skeleton className="h-5 w-32" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-outline-variant last:border-b-0">
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3.5 w-48" />
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
