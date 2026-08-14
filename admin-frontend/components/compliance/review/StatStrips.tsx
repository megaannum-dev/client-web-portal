"use client";

import { Clock, Check, X, TriangleAlert, RefreshCw, Shield, Banknote } from "@/lib/icons";
import { StatCard } from "@/components/compliance/Shared";
import { coMoneyShort } from "@/lib/compliance/mock";
import type { AdminOnboardingRow, RedemptionView } from "@/lib/onboarding/types";

/* ---- Onboarding stat strip --------------------------------- */
export function ObStatStrip({ rows }: { rows: AdminOnboardingRow[] }) {
  const pending = rows.filter((o) => o.status === "pending").length;
  const approved = rows.filter((o) => o.status === "approved").length;
  const awaiting = rows.filter((o) => o.status === "awaiting_docs").length;
  const flagged = rows.filter((o) => o.status === "pending" && o.documents.some((d) => d.status === "pending")).length;
  return (
    <div className="mb-[22px] grid grid-cols-4 gap-3.5">
      <StatCard icon={Clock} k="Pending review" v={pending} />
      <StatCard icon={Check} k="Approved" v={approved} />
      <StatCard icon={RefreshCw} k="Awaiting reprovision" v={awaiting} vColor={awaiting ? "#994700" : undefined} />
      <StatCard icon={TriangleAlert} k="Doc issues" v={flagged} vColor={flagged ? "#c2410c" : undefined} />
    </div>
  );
}

/* ---- Redemption stat strip --------------------------------- */
export function CrStatStrip({ rows }: { rows: RedemptionView[] }) {
  const pend = rows.filter((r) => r.status === "awaiting_co");
  const totalVal = pend.reduce((s, r) => s + r.amount, 0);
  const approved = rows.filter((r) => r.status === "approved").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  return (
    <div className="mb-[22px] grid grid-cols-4 gap-3.5">
      <StatCard icon={Shield} k="Pending compliance" v={pend.length} />
      <StatCard icon={Banknote} k="Pending value" v={coMoneyShort(totalVal)} />
      <StatCard icon={Check} k="Approved" v={approved} />
      <StatCard icon={X} k="Rejected" v={rejected} />
    </div>
  );
}
