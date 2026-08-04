// Server component: no "use client", no hooks, no props. Rendered from BOTH
// loading.tsx and page.tsx so the two ends of the mount boundary can never
// drift apart. Mirrors Directory.tsx (the page's sole child) — header,
// filter-chip row + search field, and the 6-column user table.
import { Skeleton } from "@/components/ui/skeleton";

export default function EnrollUserSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-6">

      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-28 rounded" />
          <Skeleton className="h-9 w-36 rounded" />
        </div>
      </div>

      {/* Filter chips + search */}
      <div className="flex flex-wrap items-center gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
        <span className="ml-auto w-[260px]">
          <Skeleton className="h-9 w-full rounded" />
        </span>
      </div>

      {/* User table — 6 columns: User, Role, Status, Overrides, Last seen, Actions */}
      <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
        <div className="bg-surface-low grid grid-cols-6 gap-4 px-4 py-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-full" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid grid-cols-6 items-center gap-4 border-t border-outline-variant px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-4 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
