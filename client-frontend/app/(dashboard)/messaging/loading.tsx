import { Skeleton } from "@/components/ui/skeleton";

export default function MessagingLoading() {
  return (
    <div className="-m-8 h-[calc(100vh-4rem)] flex flex-col bg-surface-lowest">
      {/* Room header */}
      <div className="flex items-center gap-3 py-3.5 px-6 border-b border-outline-variant shrink-0">
        <Skeleton className="size-[34px] rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-8 w-16 rounded-full" />
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 min-h-0 py-[18px] px-6 bg-surface-low flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-2.5 items-start">
            <Skeleton className="size-[30px] rounded-full shrink-0" />
            <Skeleton className={`h-14 rounded-lg ${i % 2 === 0 ? "w-2/5" : "w-1/3"}`} />
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="flex items-start gap-2.5 pt-3 px-5 pb-3.5 shrink-0 border-t border-outline-variant">
        <Skeleton className="size-[34px] rounded-full shrink-0" />
        <Skeleton className="flex-1 h-[52px] rounded-lg" />
        <Skeleton className="size-[34px] rounded-full shrink-0" />
      </div>
    </div>
  );
}
