"use client";

import { Inbox, Lock, Shield, Banknote } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { fmtMoneyShort } from "@/lib/pc/format";
import {
  arNeedsCompliance,
  arRedeemAmt,
  type Redemption,
} from "@/lib/pc/allotment-redemption-mock";
import type { AllotmentView } from "@/lib/onboarding/types";
import { arLabelCls } from "./parts";

export function ArStatStrip({
  allotments, redemptions,
}: {
  allotments: AllotmentView[];
  redemptions: Redemption[];
}) {
  const pendAllot = allotments.filter((a) => a.status === "pending").length;
  const pending = redemptions.filter((r) => r.status === "pending_pc");
  const compCount = pending.filter(arNeedsCompliance).length;
  const totalRedeem = pending.reduce((s, r) => s + arRedeemAmt(r), 0);

  const stats: { k: string; v: string | number; icon: LucideIcon }[] = [
    { k: "Pending allotments", v: pendAllot, icon: Inbox },
    { k: "Pending redemptions", v: pending.length, icon: Lock },
    { k: "Need compliance", v: compCount, icon: Shield },
    { k: "Pending redemption value", v: fmtMoneyShort(totalRedeem), icon: Banknote },
  ];

  return (
    <div className="mb-[22px] grid grid-cols-4 gap-3.5">
      {stats.map(({ k, v, icon: Icon }) => (
        <div
          key={k}
          className="rounded-[14px] border border-outline-variant bg-surface-lowest px-4 py-3.5 shadow-card"
        >
          <div className={`flex items-center gap-1.5 ${arLabelCls}`}>
            <Icon size={13} strokeWidth={2} />
            {k}
          </div>
          <div className="mt-2 text-[24px] font-bold tabular-nums tracking-[-0.02em] text-on-surface">
            {v}
          </div>
        </div>
      ))}
    </div>
  );
}
