"use client";

// PC — Allotment & Redemption: tabbed queue (Allotments | Redemptions) with
// slide-in detail panels. Wired to live data via useAllotments hook (FE-5/FE-7).

import { useState } from "react";
import { Filter, Download, Inbox, Lock, User } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArTabs } from "@/components/pc/allotment-redemption/Tabs";
import { ArStatStrip } from "@/components/pc/allotment-redemption/StatStrip";
import { AllotTable } from "@/components/pc/allotment-redemption/AllotTable";
import { AllotDetailPanel } from "@/components/pc/allotment-redemption/AllotDetailPanel";
import { RedeemTable } from "@/components/pc/allotment-redemption/RedeemTable";
import { RedeemDetailPanel } from "@/components/pc/allotment-redemption/RedeemDetailPanel";
import { useAllotments } from "@/hooks/api/useAllotments";

export default function AllotmentRedemptionPage() {
  const [tab, setTab] = useState<"allot" | "redeem">("allot");
  const { data: allotmentsData, redemptions: redemptionsData, acknowledge, decideRedemption } = useAllotments();
  const [openAllotId, setOpenAllotId] = useState<string | null>(null);
  const [openRedeemId, setOpenRedeemId] = useState<string | null>(null);

  const allotments = allotmentsData ?? [];
  const redemptions = redemptionsData ?? [];
  const pendAllot = allotments.filter((a) => a.status === "pending").length;
  const pendRedeem = redemptions.filter((r) => r.status === "awaiting_pc").length;

  const openAllot = allotments.find((a) => a.id === openAllotId);
  const openRedeem = redemptions.find((r) => r.id === openRedeemId);

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

          {tab === "allot" ? (
            <AllotTable rows={allotments} onRowClick={setOpenAllotId} onAcknowledge={acknowledge} />
          ) : (
            <RedeemTable rows={redemptions} onRowClick={setOpenRedeemId} />
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
      {openRedeem && (
        <RedeemDetailPanel
          r={openRedeem}
          onClose={() => setOpenRedeemId(null)}
          onDecision={(id, verdict) => decideRedemption(id, { verdict })}
        />
      )}
    </div>
  );
}
