// Server component: mirrors page.tsx's header + toolbar + table rows.
import { Skeleton } from "@/components/ui/skeleton";

export default function ClientCorrespondentsSkeleton() {
  return (
    <div className="mx-auto">
      <div className="mb-7 flex flex-col gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>

      <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-5 py-3.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
          <Skeleton className="ml-auto h-8 w-64 rounded-md" />
        </div>
        <div className="grid grid-cols-5 gap-4 bg-surface-low px-[18px] py-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-full" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-outline-variant px-[18px] py-3.5">
            <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-md" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </section>
    </div>
  );
}
