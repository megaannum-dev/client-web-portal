"use client";

// PC — Allotment & Redemption: tabbed queue (Allotments | Redemptions) with
// slide-in detail panels. FRONTEND ONLY — backed by local mock seeds
// (@/lib/pc/allotment-redemption-mock); no API/hooks/server layer.

import { useState } from "react";
import { Filter, Download, Inbox, Lock, User } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArTabs } from "@/components/pc/allotment-redemption/Tabs";
import { ArStatStrip } from "@/components/pc/allotment-redemption/StatStrip";
import { AllotTable } from "@/components/pc/allotment-redemption/AllotTable";
import { AllotDetailPanel } from "@/components/pc/allotment-redemption/AllotDetailPanel";
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
  const [openAllotId, setOpenAllotId] = useState<string | null>(null);

  const pendAllot = allotments.filter((a) => a.status === "pending").length;
  const pendRedeem = redemptions.filter((r) => r.status === "pending_pc").length;

  const acknowledge = (id: string) =>
    setAllotments((rows) => rows.map((a) => (a.id === id ? { ...a, status: "acknowledged" } : a)));
  const decide = (id: string, status: RedeemStatus) =>
    setRedemptions((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));

  // Redemption mutation wired in the following commit; referenced so state is exercised.
  void decide;

  const openAllot = allotments.find((a) => a.id === openAllotId);

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
          <ArStatStrip allotments={allotments} redemptions={redemptions} />
          <ArTabs tab={tab} onTab={setTab} pendAllot={pendAllot} pendRedeem={pendRedeem} />

          {tab === "allot" && (
            <AllotTable rows={allotments} onRowClick={setOpenAllotId} onAcknowledge={acknowledge} />
          )}

          <div className="mt-4 flex flex-wrap gap-x-[22px] gap-y-2 text-[12.5px] text-secondary">
            <span className="flex items-center gap-1.5"><Inbox size={13} strokeWidth={2} />Allotments are informational — PC acknowledges but does not block</span>
            <span className="flex items-center gap-1.5"><Lock size={13} strokeWidth={2} />Redemptions require PC approval; &gt; US$300K also needs compliance</span>
            <span className="flex items-center gap-1.5"><User size={13} strokeWidth={2} />Client identity is anonymized throughout</span>
          </div>
        </div>
      </div>

      {openAllot && (
        <AllotDetailPanel a={openAllot} onClose={() => setOpenAllotId(null)} onAcknowledge={acknowledge} />
      )}
    </div>
  );
}
