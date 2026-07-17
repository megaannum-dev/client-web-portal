"use client";

import { ShieldCheck } from "@/lib/icons";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant bg-surface-lowest px-6 py-[72px] text-center">
      <span className="mb-[18px] flex h-16 w-16 items-center justify-center rounded-full bg-surface-container text-secondary">
        <ShieldCheck size={28} strokeWidth={1.75} />
      </span>
      <div className="text-[19px] font-bold text-on-surface">All caught up</div>
      <div className="mt-2 max-w-[400px] text-[14px] leading-[1.6] text-secondary">
        No pending compliance reviews. New onboarding submissions and large redemption requests will appear here automatically.
      </div>
    </div>
  );
}
