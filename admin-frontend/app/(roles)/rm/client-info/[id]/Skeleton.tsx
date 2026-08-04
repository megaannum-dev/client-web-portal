// Server component: no "use client", no hooks, no props. Mirrors page.tsx's
// own wrapper + back link + header (avatar/name/chip) + the Card sections
// (components/ui/Card.tsx: rounded-lg border shadow-card, header + body).
import { Skeleton } from "@/components/ui/skeleton";

function CardShell({ children, title }: { children: React.ReactNode; title?: boolean }) {
  return (
    <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
      {title && (
        <header className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <Skeleton className="h-5 w-40" />
        </header>
      )}
      <div className="px-5 py-[18px]">{children}</div>
    </section>
  );
}

export default function ClientDetailSkeleton() {
  return (
    <div className="mx-auto">
      <Skeleton className="mb-[18px] h-4 w-40" />

      {/* Header */}
      <div className="mb-[22px] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-32 rounded" />
          <Skeleton className="h-9 w-36 rounded" />
        </div>
      </div>

      {/* Client information */}
      <div className="mb-5">
        <CardShell title>
          <div className="mb-[18px] rounded-md bg-surface-low px-[18px] py-4">
            <Skeleton className="mb-3.5 h-3.5 w-32" />
            <div className="grid grid-cols-2 gap-7">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-7 w-28" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-7 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-[7px]">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </CardShell>
      </div>

      {/* Subscribed models + KYC */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <CardShell title>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardShell>
        <CardShell title>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Skeleton className="h-[26px] w-[26px] rounded-md shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </CardShell>
      </div>

      {/* History + Contact log */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.7fr]">
        <CardShell title>
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </CardShell>
        <CardShell title>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        </CardShell>
      </div>
    </div>
  );
}
