import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-8 pb-8">

      {/* Page header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-5 w-80" />
      </div>

      {/* Personal Information card */}
      <div className="border border-outline-variant rounded-lg p-6 bg-surface-lowest">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <Skeleton className="w-16 h-16 rounded-full shrink-0" />
          {/* Fields grid */}
          <div className="grid grid-cols-3 gap-x-8 gap-y-5 flex-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Account Balance card */}
      <div className="border border-outline-variant rounded-lg p-6 bg-surface-lowest">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-6 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-8">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-9 w-48" />
            </div>
          ))}
        </div>
      </div>

      {/* Document Verification card */}
      <div className="border border-outline-variant rounded-lg p-6 bg-surface-lowest">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="border border-outline-variant rounded-lg p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-9 w-32 rounded-lg mt-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
