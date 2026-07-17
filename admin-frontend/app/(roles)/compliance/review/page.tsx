"use client";

// Compliance Review — two work types split by tabs:
//   · Onboarding — review client packages + 7 required docs, approve/reject.
//   · Redemptions — second gate on large ( > US$300K ) PC-approved redemptions.
// Thin orchestrator holding UI state; queue tables + slide-in detail panels.
// FRONTEND ONLY — backed by local mock data (@/lib/compliance/mock).

import { useState } from "react";
import { Filter, Download, Eye, Check } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoTabs, type CoTab } from "@/components/compliance/review/Tabs";
import { ObStatStrip } from "@/components/compliance/review/StatStrips";
import { OnboardingTable } from "@/components/compliance/review/OnboardingTable";
import { ObDetailPanel } from "@/components/compliance/review/ObDetailPanel";
import { RejectModal } from "@/components/compliance/review/RejectModal";
import {
  CO_ONBOARDING, CR_REDEMPTIONS, DOC_NAMES,
  type DocVerdict, type Onboarding,
} from "@/lib/compliance/mock";

// Seed per-onboarding doc verdicts so approved/rejected rows show realistic
// state: approved → all valid; rejected → per docs array; pending → unreviewed.
function seedVerdicts(rows: Onboarding[]): Record<string, DocVerdict[]> {
  const m: Record<string, DocVerdict[]> = {};
  rows.forEach((o) => {
    if (o.status === "approved") m[o.id] = o.docs.map(() => "valid");
    else if (o.status === "rejected") m[o.id] = o.docs.map((d) => (d ? "valid" : "issue"));
    else m[o.id] = o.docs.map(() => null);
  });
  return m;
}

export default function ComplianceReviewPage() {
  const [tab, setTab] = useState<CoTab>("onboarding");
  const [onboarding, setOnboarding] = useState<Onboarding[]>(CO_ONBOARDING);
  const [openObId, setOpenObId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [docVerdicts, setDocVerdicts] = useState<Record<string, DocVerdict[]>>(() => seedVerdicts(CO_ONBOARDING));

  const setVerdict = (obId: string, idx: number, v: DocVerdict) =>
    setDocVerdicts((prev) => {
      const arr = [...(prev[obId] || DOC_NAMES.map(() => null))];
      arr[idx] = v;
      return { ...prev, [obId]: arr };
    });
  const getVerdicts = (obId: string): DocVerdict[] => docVerdicts[obId] || DOC_NAMES.map(() => null);

  const pendOb = onboarding.filter((o) => o.status === "pending").length;
  const pendCr = CR_REDEMPTIONS.filter((r) => r.status === "pending_co").length;

  const openOb = onboarding.find((o) => o.id === openObId);

  const approveOb = (id: string) =>
    setOnboarding((rows) => rows.map((o) => (o.id === id ? { ...o, status: "approved" } : o)));
  const confirmReject = (id: string, reason: string) => {
    setOnboarding((rows) =>
      rows.map((o) => (o.id === id ? { ...o, status: "rejected", rejectReason: reason || "Documents flagged as invalid." } : o)),
    );
    setRejecting(false);
  };

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

          {tab === "onboarding" && (
            <>
              <ObStatStrip rows={onboarding} />
              <OnboardingTable rows={onboarding} onRowClick={setOpenObId} openId={openObId} />
              <div className="mt-4 flex flex-wrap gap-x-[22px] gap-y-2 text-[12.5px] text-secondary">
                <span className="flex items-center gap-1.5"><Eye size={13} strokeWidth={2} />Click any row → client detail + document checklist</span>
                <span className="flex items-center gap-1.5"><Check size={13} strokeWidth={2} />Approve clean packages · reject and flag invalid documents</span>
              </div>
            </>
          )}
        </div>
      </div>

      {openOb && !rejecting && (
        <ObDetailPanel
          o={openOb}
          onClose={() => setOpenObId(null)}
          onApprove={approveOb}
          onReject={() => setRejecting(true)}
          verdicts={getVerdicts(openOb.id)}
          onVerdict={(idx, v) => setVerdict(openOb.id, idx, v)}
        />
      )}
      {openOb && rejecting && (
        <RejectModal o={openOb} onCancel={() => setRejecting(false)} onConfirm={confirmReject} verdicts={getVerdicts(openOb.id)} />
      )}
    </div>
  );
}
