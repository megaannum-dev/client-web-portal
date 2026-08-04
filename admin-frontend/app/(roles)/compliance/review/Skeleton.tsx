// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// wrapper + PageHeader + CoTabs + ObStatStrip (StatCard x4) + OnboardingTable
// (7 columns: Client/RM/Submitted/Type/Docs/Status/blank) — the default
// "onboarding" tab, per components/compliance/review/{StatStrips,Tabs,OnboardingTable}.tsx.
import { Skeleton } from "@/components/ui/skeleton";

export default function ComplianceReviewSkeleton() {
  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mx-auto">

          {/* Page header */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-5 w-96" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-9 w-24 rounded" />
              <Skeleton className="h-9 w-28 rounded" />
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex items-center gap-2 border-b border-outline-variant">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-36" />
          </div>

          {/* Stat strip (StatCard x4) */}
          <div className="mb-[22px] mt-[22px] grid grid-cols-4 gap-3.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-[14px] border border-outline-variant bg-surface-lowest px-4 py-3.5 shadow-card">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="mt-2 h-6 w-10" />
              </div>
            ))}
          </div>

          {/* Onboarding table — 7 columns */}
          <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
            <div className="grid grid-cols-7 gap-4 bg-surface-low px-4 py-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-7 items-center gap-4 border-t border-outline-variant px-4 py-[13px]">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-8 mx-auto" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-4 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
