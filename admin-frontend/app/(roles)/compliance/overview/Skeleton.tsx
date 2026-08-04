// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + the OverviewWidgets.tsx shapes it composes (OvTile / OvPanel /
// OvRow) — real chrome classes copied from components/compliance/overview/OverviewWidgets.tsx.
import { Skeleton } from "@/components/ui/skeleton";

export default function ComplianceOverviewSkeleton() {
  return (
    <div className="mx-auto">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Stat tiles (OvTile x4) */}
      <div className="mb-[22px] grid grid-cols-4 gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[14px] border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="mt-[9px] h-7 w-12" />
            <Skeleton className="mt-[3px] h-3.5 w-28" />
            <Skeleton className="mt-1.5 h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Onboarding & Renewals + Redemptions panels (OvPanel x2) */}
      <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="flex h-full flex-col rounded-[14px] border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card">
            <div className="mb-0.5 flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <div className="flex-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-t border-outline-variant px-0.5 py-[11px]">
                  <Skeleton className="h-[30px] w-[30px] rounded-[9px] shrink-0" />
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex h-full flex-col rounded-[14px] border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card">
            <div className="mb-0.5 flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <div className="flex-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-t border-outline-variant px-0.5 py-[11px]">
                  <Skeleton className="h-[30px] w-[30px] rounded-[9px] shrink-0" />
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
