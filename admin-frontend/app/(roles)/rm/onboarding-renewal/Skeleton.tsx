// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + the OnboardingBoard kanban (components/rm/OnboardingBoard.tsx):
// 4 columns (grid-cols-2 xl:grid-cols-4), each a stack of KanbanCards.
import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingRenewalSkeleton() {
  return (
    <div className="mx-auto">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-9 w-40 rounded" />
      </div>

      <Skeleton className="mb-[18px] h-4 w-48" />

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="flex flex-col gap-2.5 rounded-[14px] bg-surface-low p-3.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-4" />
            </div>
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2.5 rounded-md border-[1.5px] border-outline-variant bg-white p-4">
                  <div className="flex items-start justify-between gap-2.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3.5 w-32" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
