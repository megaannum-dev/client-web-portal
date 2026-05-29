import { Skeleton } from "@/components/ui/skeleton";

export default function LegalReportsLoading() {
  return (
    <div className="flex flex-col gap-8 pb-8">

      {/* Page header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-5 w-[460px]" />
      </div>

      {/* Section heading */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <Skeleton className="h-5 w-5 shrink-0 rounded" />
          <Skeleton className="h-6 w-44" />
        </div>

        <div className="flex flex-col gap-6">
          {Array.from({ length: 3 }).map((_, ci) => (
            <div key={ci}>
              <Skeleton className="h-3.5 w-32 mb-3" />
              <div className="border border-outline-variant rounded-lg overflow-hidden">
                {Array.from({ length: 3 }).map((_, ri) => (
                  <div key={ri} className="px-6 py-[18px] grid grid-cols-3 gap-6 border-b border-outline-variant last:border-b-0 bg-surface-lowest">
                    <div className="flex items-center gap-2.5">
                      <Skeleton className="h-4 w-4 shrink-0" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                    <Skeleton className="h-4 w-full hidden md:block" />
                    <Skeleton className="h-4 w-20 mx-auto" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
