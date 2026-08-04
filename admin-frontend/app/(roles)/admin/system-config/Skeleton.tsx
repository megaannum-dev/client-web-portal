// Server component: no "use client", no hooks, no props. Rendered from BOTH
// loading.tsx and page.tsx. Mirrors page.tsx's own header + toolbar chrome
// exactly (both rendered directly by the page, not a child), then the
// default "role" view's two-pane layout (RoleView.tsx): a role rail on the
// left, the access editor card on the right.
import { Skeleton } from "@/components/ui/skeleton";

export default function SystemConfigSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-6">

      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-5 w-[420px]" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-28 rounded" />
          <Skeleton className="h-9 w-40 rounded" />
        </div>
      </div>

      {/* Toolbar: view switch + counts + publish status */}
      <div className="flex flex-wrap items-center gap-4 rounded-md border border-outline-variant bg-surface-lowest px-3.5 py-2.5">
        <Skeleton className="h-8 w-40 rounded" />
        <span className="h-[26px] w-px bg-outline-variant" />
        <Skeleton className="h-4 w-56" />
        <span className="ml-auto flex items-center gap-2.5">
          <Skeleton className="h-6 w-20 rounded-full" />
        </span>
      </div>

      {/* Role view: role rail + access editor */}
      <div className="flex items-stretch gap-5" style={{ height: 660 }}>
        <div className="flex w-[250px] flex-none flex-col gap-1 overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-1 py-[11px]">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3.5 w-6" />
            </div>
          ))}
        </div>
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
          <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-[18px]">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-4 w-64" />
            </div>
            <span className="flex gap-2.5">
              <Skeleton className="h-9 w-36 rounded" />
              <Skeleton className="h-9 w-32 rounded" />
            </span>
          </div>
          <div className="flex-1 px-5 pb-[18px]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between border-t border-outline-variant py-3 first:border-t-0">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-7 w-24 rounded" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
