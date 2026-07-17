"use client";

// Compliance Review — two work types split by tabs:
//   · Onboarding — review client packages + 7 required docs, approve/reject.
//   · Redemptions — second gate on large ( > US$300K ) PC-approved redemptions.
// Thin orchestrator holding UI state; queue tables + slide-in detail panels.
// FRONTEND ONLY — backed by local mock data (@/lib/compliance/mock).

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
import {
  CO_ONBOARDING, CR_REDEMPTIONS, COMPLIANCE_THRESHOLD, DOC_NAMES,
  type CrStatus, type DocVerdict, type Onboarding, type Redemption,
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
  const [redemptions, setRedemptions] = useState<Redemption[]>(CR_REDEMPTIONS);
  const [openObId, setOpenObId] = useState<string | null>(null);
  const [openCrId, setOpenCrId] = useState<string | null>(null);
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
  const pendCr = redemptions.filter((r) => r.status === "pending_co").length;

  const openOb = onboarding.find((o) => o.id === openObId);
  const openCr = redemptions.find((r) => r.id === openCrId);

  const approveOb = (id: string) =>
    setOnboarding((rows) => rows.map((o) => (o.id === id ? { ...o, status: "approved" } : o)));
  const confirmReject = (id: string, reason: string) => {
    setOnboarding((rows) =>
      rows.map((o) => (o.id === id ? { ...o, status: "rejected", rejectReason: reason || "Documents flagged as invalid." } : o)),
    );
    setRejecting(false);
  };
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
          verdicts={getVerdicts(openOb.id)}
          onVerdict={(idx, v) => setVerdict(openOb.id, idx, v)}
        />
      )}
      {openOb && rejecting && (
        <RejectModal o={openOb} onCancel={() => setRejecting(false)} onConfirm={confirmReject} verdicts={getVerdicts(openOb.id)} />
      )}
      {openCr && <CrDetailPanel r={openCr} onClose={() => setOpenCrId(null)} onDecision={decideCr} />}
    </div>
  );
}
