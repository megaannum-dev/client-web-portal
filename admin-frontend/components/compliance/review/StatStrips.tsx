"use client";

import { Clock, Check, X, TriangleAlert } from "@/lib/icons";
import { StatCard } from "@/components/compliance/Shared";
import type { Onboarding } from "@/lib/compliance/mock";

/* ---- Onboarding stat strip --------------------------------- */
export function ObStatStrip({ rows }: { rows: Onboarding[] }) {
  const pending = rows.filter((o) => o.status === "pending").length;
  const approved = rows.filter((o) => o.status === "approved").length;
  const rejected = rows.filter((o) => o.status === "rejected").length;
  const flagged = rows.filter((o) => o.status === "pending" && o.docs.some((d) => !d)).length;
  return (
    <div className="mb-[22px] grid grid-cols-4 gap-3.5">
      <StatCard icon={Clock} k="Pending review" v={pending} />
      <StatCard icon={Check} k="Approved" v={approved} />
      <StatCard icon={X} k="Rejected" v={rejected} />
      <StatCard icon={TriangleAlert} k="Doc issues" v={flagged} vColor={flagged ? "#c2410c" : undefined} />
    </div>
  );
}
