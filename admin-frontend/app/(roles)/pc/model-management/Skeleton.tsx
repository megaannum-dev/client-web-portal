// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + header toolbar + the default grid layout's ModelCard shape
// (components/pc/model-management/CardGrid.tsx).
import { Skeleton } from "@/components/ui/skeleton";

export default function ModelManagementSkeleton() {
  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mb-[26px] flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-[72px] rounded" />
            <Skeleton className="h-9 w-9 rounded" />
            <Skeleton className="h-9 w-32 rounded" />
          </div>
        </div>

        {/* Model card grid */}
        <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(20vw, 1fr))" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3.5 rounded-lg border border-outline-variant bg-surface-lowest p-[18px] shadow-card">
              <div className="flex items-start justify-between gap-2.5">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-7 w-24" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-6 w-6 rounded-full" />
                ))}
              </div>
              <div className="flex items-center justify-end border-t border-outline-variant pt-[13px]">
                <Skeleton className="h-4 w-14" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
