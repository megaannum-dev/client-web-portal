"use client";

import { Clock, Check, X, TriangleAlert, Shield, Banknote } from "@/lib/icons";
import { StatCard } from "@/components/compliance/Shared";
import { coMoneyShort, crAmt, type Onboarding, type Redemption } from "@/lib/compliance/mock";

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

/* ---- Redemption stat strip --------------------------------- */
export function CrStatStrip({ rows }: { rows: Redemption[] }) {
  const pend = rows.filter((r) => r.status === "pending_co");
  const totalVal = pend.reduce((s, r) => s + crAmt(r), 0);
  const approved = rows.filter((r) => r.status === "approved_co").length;
  const rejected = rows.filter((r) => r.status === "rejected_co").length;
  return (
    <div className="mb-[22px] grid grid-cols-4 gap-3.5">
      <StatCard icon={Shield} k="Pending compliance" v={pend.length} />
      <StatCard icon={Banknote} k="Pending value" v={coMoneyShort(totalVal)} />
      <StatCard icon={Check} k="Approved" v={approved} />
      <StatCard icon={X} k="Rejected" v={rejected} />
    </div>
  );
}
