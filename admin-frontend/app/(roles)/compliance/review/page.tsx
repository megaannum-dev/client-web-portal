"use client";

// Compliance Review — two work types split by tabs:
//   · Onboarding — review client packages + required docs, approve/reject.
//   · Redemptions — second gate on large ( > US$300K ) PC-approved redemptions.
// Thin orchestrator holding UI state; queue tables + slide-in detail panels.
// Onboarding is wired to live data via useComplianceQueue; Redemptions stays
// FRONTEND ONLY — backed by local mock data (@/lib/compliance/mock) — out of scope.

import { useState } from "react";
import { Filter, Download, Eye, Check, Shield, ShieldCheck, User } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Notice } from "@/components/compliance/Shared";
import { CoTabs, type CoTab } from "@/components/compliance/review/Tabs";
import { ObStatStrip, CrStatStrip } from "@/components/compliance/review/StatStrips";
import { OnboardingTable } from "@/components/compliance/review/OnboardingTable";
import { RedeemTable } from "@/components/compliance/review/RedeemTable";
import { ObDetailPanel } from "@/components/compliance/review/ObDetailPanel";
import { CrDetailPanel } from "@/components/compliance/review/CrDetailPanel";
import { RejectModal } from "@/components/compliance/review/RejectModal";
import { EmptyState } from "@/components/compliance/review/EmptyState";
import { CR_REDEMPTIONS, COMPLIANCE_THRESHOLD, type CrStatus, type Redemption } from "@/lib/compliance/mock";
import { useComplianceQueue } from "@/hooks/api/useComplianceQueue";

// Rehydrate a base64 download payload into a Blob and trigger a save dialog
// (mirrors app/(roles)/pc/model-management/page.tsx's saveBase64File).
function saveBase64File(filename: string, contentType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function ComplianceReviewPage() {
  const [tab, setTab] = useState<CoTab>("onboarding");
  const { data: onboardingData, submitVerdict, approve, reject, download } = useComplianceQueue();
  const onboarding = onboardingData ?? [];
  const [redemptions, setRedemptions] = useState<Redemption[]>(CR_REDEMPTIONS);
  const [openObId, setOpenObId] = useState<string | null>(null);
  const [openCrId, setOpenCrId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const pendOb = onboarding.filter((o) => o.status === "pending").length;
  const pendCr = redemptions.filter((r) => r.status === "pending_co").length;

  const openOb = onboarding.find((o) => o.id === openObId);
  const openCr = redemptions.find((r) => r.id === openCrId);

  const doVerdict = (docType: string, v: "valid" | "issue") => {
    if (!openOb) return;
    void submitVerdict(openOb.id, docType, v).then((r) => {
      if (!r.success) alert(`Could not submit verdict: ${r.error}`);
    });
  };
  const doDownload = (docType: string) => {
    if (!openOb) return;
    void download(openOb.id, docType).then((r) =>
      r.success ? saveBase64File(r.filename!, r.contentType!, r.base64!) : alert(`Download failed: ${r.error}`),
    );
  };
  const approveOb = (id: string) =>
    void approve(id).then((r) => { if (r.success) setOpenObId(null); else alert(`Could not approve: ${r.error}`); });
  const confirmReject = (id: string, reason: string) =>
    void reject(id, reason).then((r) => {
      if (r.success) { setRejecting(false); setOpenObId(null); } else alert(`Could not reject: ${r.error}`);
    });
  const decideCr = (id: string, status: CrStatus) =>
    setRedemptions((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));

  const rows = tab === "onboarding" ? onboarding : redemptions;
  const isEmpty = rows.length === 0;

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

          {isEmpty ? (
            <EmptyState />
          ) : tab === "onboarding" ? (
            <>
              <ObStatStrip rows={onboarding} />
              <OnboardingTable rows={onboarding} onRowClick={setOpenObId} openId={openObId} />
              <div className="mt-4 flex flex-wrap gap-x-[22px] gap-y-2 text-[12.5px] text-secondary">
                <span className="flex items-center gap-1.5"><Eye size={13} strokeWidth={2} />Click any row → client detail + document checklist</span>
                <span className="flex items-center gap-1.5"><Check size={13} strokeWidth={2} />Approve clean packages · reject and flag invalid documents</span>
              </div>
            </>
          ) : (
            <>
              <CrStatStrip rows={redemptions} />
              <div className="mb-4">
                <Notice tone="info" icon={Shield}>
                  <b>Compliance gate</b> — these redemptions exceed US${COMPLIANCE_THRESHOLD.toLocaleString()} and are already PC-approved. Your approval is the final step before the redemption proceeds.
                </Notice>
              </div>
              <RedeemTable rows={redemptions} onRowClick={setOpenCrId} openId={openCrId} />
              <div className="mt-4 flex flex-wrap gap-x-[22px] gap-y-2 text-[12.5px] text-secondary">
                <span className="flex items-center gap-1.5"><ShieldCheck size={13} strokeWidth={2} />PC-approved amount is verified before compliance sign-off</span>
                <span className="flex items-center gap-1.5"><User size={13} strokeWidth={2} />Client identity is anonymized throughout</span>
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
          onVerdict={doVerdict}
          onDownload={doDownload}
        />
      )}
      {openOb && rejecting && (
        <RejectModal o={openOb} onCancel={() => setRejecting(false)} onConfirm={confirmReject} />
      )}
      {openCr && <CrDetailPanel r={openCr} onClose={() => setOpenCrId(null)} onDecision={decideCr} />}
    </div>
  );
}
