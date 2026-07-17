"use client";

// PC — Allotment & Redemption: tabbed queue (Allotments | Redemptions) with
// slide-in detail panels. FRONTEND ONLY — backed by local mock seeds
// (@/lib/pc/allotment-redemption-mock); no API/hooks/server layer.

import { useState } from "react";
import { Filter, Download } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArTabs } from "@/components/pc/allotment-redemption/Tabs";
import {
  AR_ALLOTMENTS_SEED,
  AR_REDEMPTIONS_SEED,
  type Allotment,
  type Redemption,
  type RedeemStatus,
} from "@/lib/pc/allotment-redemption-mock";

export default function AllotmentRedemptionPage() {
  const [tab, setTab] = useState<"allot" | "redeem">("allot");
  const [allotments, setAllotments] = useState<Allotment[]>(AR_ALLOTMENTS_SEED);
  const [redemptions, setRedemptions] = useState<Redemption[]>(AR_REDEMPTIONS_SEED);

  const pendAllot = allotments.filter((a) => a.status === "pending").length;
  const pendRedeem = redemptions.filter((r) => r.status === "pending_pc").length;

  const acknowledge = (id: string) =>
    setAllotments((rows) => rows.map((a) => (a.id === id ? { ...a, status: "acknowledged" } : a)));
  const decide = (id: string, status: RedeemStatus) =>
    setRedemptions((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));

  // Wired fully in the following commits; referenced now so state is exercised.
  void acknowledge;
  void decide;

  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <PageHeader
          title="Allotment & Redemption"
          subtitle="Review allotment notifications · approve or reject redemption requests"
          actions={
            <>
              <Button variant="secondary" icon={Filter}>Filters</Button>
              <Button variant="secondary" icon={Download}>Export log</Button>
            </>
          }
        />
        <div className="mt-6">
          <ArTabs tab={tab} onTab={setTab} pendAllot={pendAllot} pendRedeem={pendRedeem} />
        </div>
      </div>
    </div>
  );
}
