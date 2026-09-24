// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// wrapper + PageHeader + toolbar + card grid. Reused by loading.tsx (route
// transition) and inline by page.tsx while useIcNotes() is loading.
import { Skeleton } from "@/components/ui/skeleton";

export default function IcNotesSkeleton() {
  return (
    <div className="mx-auto max-w-[1180px] p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-9 w-36 rounded" />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-[260px] rounded-full" />
        <Skeleton className="h-9 w-32 rounded" />
        <Skeleton className="h-9 w-32 rounded" />
      </div>
      <div className="mt-5 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
