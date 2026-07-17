"use client";

// Compliance Review — two work types split by tabs:
//   · Onboarding — review client packages + 7 required docs, approve/reject.
//   · Redemptions — second gate on large ( > US$300K ) PC-approved redemptions.
// Thin orchestrator holding UI state; queue tables + slide-in detail panels.
// FRONTEND ONLY — backed by local mock data (@/lib/compliance/mock).

import { useState } from "react";
import { Filter, Download } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoTabs, type CoTab } from "@/components/compliance/review/Tabs";
import { CO_ONBOARDING, CR_REDEMPTIONS } from "@/lib/compliance/mock";

export default function ComplianceReviewPage() {
  const [tab, setTab] = useState<CoTab>("onboarding");

  const pendOb = CO_ONBOARDING.filter((o) => o.status === "pending").length;
  const pendCr = CR_REDEMPTIONS.filter((r) => r.status === "pending_co").length;

  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mx-auto max-w-[1180px]">
          <PageHeader
            title="Compliance Review"
            subtitle="Review onboarding packages · sign off on large redemption requests"
            actions={
              <>
                <Button variant="secondary" icon={Filter}>Filters</Button>
                <Button variant="secondary" icon={Download}>Export log</Button>
              </>
            }
          />

          <div className="mt-6">
            <CoTabs tab={tab} onTab={setTab} pendOb={pendOb} pendCr={pendCr} />
          </div>
        </div>
      </div>
    </div>
  );
}
