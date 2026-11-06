"use client";

// Aggregate-multiplier impact bars (before/after) shown in the allotment detail.
// Both bars share one axis: max = Math.max(after, 20)× (prototype semantics).

function Row({ label, val, max, tone }: { label: string; val: number; max: number; tone: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-2.5">
      <span className="w-11 flex-none text-[12px] text-secondary">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-low">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round((val / max) * 100)}%`, background: tone }}
        />
      </div>
      <span className="w-[34px] flex-none text-right text-[13px] font-bold tabular-nums">{val}×</span>
    </div>
  );
}

export function AggBar({ before, after }: { before: number; after: number }) {
  const max = Math.max(after, 20);
  return (
    <div>
      <Row label="Before" val={before} max={max} tone="var(--outline)" />
      <Row label="After" val={after} max={max} tone="var(--primary)" />
    </div>
  );
}
