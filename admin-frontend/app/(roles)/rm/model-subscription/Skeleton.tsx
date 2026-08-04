// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + the collapsed-state ClientAccordionItem header row
// (components/rm/SubscriptionAccordion.tsx) repeated for a plausible client list.
import { Skeleton } from "@/components/ui/skeleton";

export default function ModelSubscriptionSkeleton() {
  return (
    <div className="mx-auto">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-[480px]" />
        </div>
        <Skeleton className="h-9 w-40 rounded" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <section key={i} className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
            <div className="flex items-center gap-3.5 px-5 py-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-56" />
              </div>
              <Skeleton className="h-[18px] w-[18px]" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
