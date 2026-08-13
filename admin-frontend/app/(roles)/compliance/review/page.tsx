"use client";

// Compliance Review — two work types split by tabs:
//   · Onboarding — review client packages + required docs, approve/reject.
//   · Redemptions — Compliance's gate on large ( > US$300K ) redemptions;
//     Compliance decides FIRST (awaiting_co), PC gives the final sign-off
//     second (awaiting_pc -> approved) -- see proposal 016 D-2.
// Thin orchestrator holding UI state; queue tables + slide-in detail panels.
// Both tabs wired to live data (FE-8: useCoRedemptions mirrors PC's FE-7).

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { ReprovisionModal } from "@/components/compliance/review/ReprovisionModal";
import { EmptyState } from "@/components/compliance/review/EmptyState";
import { useComplianceQueue } from "@/hooks/api/useComplianceQueue";
import { useCoRedemptions } from "@/hooks/api/useCoRedemptions";
import { docStatusToVerdict } from "@/lib/onboarding/mappers";
import { saveBase64File } from "@/lib/download";
import type { AdminOnboardingRow, DocVerdict, VerdictItem } from "@/lib/onboarding/types";

const COMPLIANCE_THRESHOLD = 300000;

// Deep-link contract from Compliance Overview's tile/row jump-offs:
// ?tab=onboarding|redeem&openObId=<id>|openCrId=<id>.
// Unknown/missing params fall back to the default onboarding tab, nothing open
// (mirrors app/(roles)/rm/model-subscription/page.tsx's resolveDeepLink).
function resolveDeepLink(params: URLSearchParams): { tab: CoTab; openObId: string | null; openCrId: string | null } {
  const tabParam = params.get("tab");
  const tab: CoTab = tabParam === "redeem" ? tabParam : "onboarding";
  return {
    tab,
    openObId: params.get("openObId"),
    openCrId: params.get("openCrId"),
  };
}

function ComplianceReviewContent() {
  const searchParams = useSearchParams();
  const [deepLink] = useState(() => resolveDeepLink(searchParams));
  const [tab, setTab] = useState<CoTab>(deepLink.tab);
  const { data: onboardingData, submitVerdicts, approve, reject, requestReprovision, download } =
    useComplianceQueue();
  const onboarding = onboardingData ?? [];
  const { data: redemptionsData, decide: decideRedemption } = useCoRedemptions();
  // Compliance only ever acts on redemptions above the threshold -- rows at
  // or below it never leave PC's workflow, so filter them out here rather
  // than showing PC-only history as noise on this page.
  const redemptions = (redemptionsData ?? []).filter((r) => r.amount > COMPLIANCE_THRESHOLD);
  const [openObId, setOpenObId] = useState<string | null>(deepLink.openObId);
  const [openCrId, setOpenCrId] = useState<string | null>(deepLink.openCrId);
  const [rejecting, setRejecting] = useState(false);
  const [reprovisioning, setReprovisioning] = useState(false);
  // Draft document verdicts, keyed by onboarding id then doc_type. Lives HERE, not
  // in ObDetailPanel, because opening the Reject modal unmounts that panel -- panel-
  // local state would be destroyed exactly when confirmReject needs to read it.
  // Toggling writes only to this map; nothing is sent until Approve/Reject.
  const [drafts, setDrafts] = useState<Record<string, Record<string, DocVerdict>>>({});

  const pendOb = onboarding.filter((o) => o.status === "pending").length;
  const pendCr = redemptions.filter((r) => r.status === "awaiting_co").length;

  const openOb = onboarding.find((o) => o.id === openObId);
  const openCr = redemptions.find((r) => r.id === openCrId);

  /** Seeded from the server's document statuses on first use, so a cycle that was
   *  partially reviewed in an earlier session still opens with those verdicts shown. */
  const verdictsFor = (o: AdminOnboardingRow): Record<string, DocVerdict> =>
    drafts[o.id] ?? Object.fromEntries(o.documents.map((d) => [d.doc_type, docStatusToVerdict(d.status)]));

  const doVerdict = (docType: string, v: "valid" | "issue") => {
    if (!openOb) return;
    const current = verdictsFor(openOb);
    setDrafts((prev) => ({
      ...prev,
      // Clicking the already-active button clears it back to "not reviewed" --
      // possible only now that the verdict isn't a server round-trip.
      [openOb.id]: { ...current, [docType]: current[docType] === v ? null : v },
    }));
  };
  // Dropped after a decision lands so the next open re-seeds from the server's
  // now-authoritative document statuses.
  const clearDraft = (id: string) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  /** POSTs every drafted verdict in one request. Returns success so the caller can
   *  abort its own decision if the batch failed. */
  const flushVerdicts = async (o: AdminOnboardingRow) => {
    const items: VerdictItem[] = Object.entries(verdictsFor(o))
      .filter(([, v]) => v !== null)
      .map(([doc_type, verdict]) => ({ doc_type, verdict: verdict as "valid" | "issue" }));
    // The backend requires items to be non-empty (min_length=1), so an untouched
    // package skips the call rather than 422-ing.
    if (items.length === 0) return true;
    const r = await submitVerdicts(o.id, items);
    if (!r.success) alert(`Could not save document verdicts: ${r.error}`);
    return r.success;
  };

  const doDownload = (docType: string) => {
    if (!openOb) return;
    void download(openOb.id, docType).then((r) =>
      r.success ? saveBase64File(r.filename!, r.contentType!, r.base64!) : alert(`Download failed: ${r.error}`),
    );
  };
  const approveOb = async (id: string) => {
    const o = onboarding.find((x) => x.id === id);
    if (!o || !(await flushVerdicts(o))) return;
    const r = await approve(id);
    if (!r.success) return alert(`Could not approve: ${r.error}`);
    clearDraft(id);
    setOpenObId(null);
  };
  const confirmReject = async (id: string, reason: string) => {
    const o = onboarding.find((x) => x.id === id);
    // Verdicts go first on purpose: reject() resets every non-verified document for
    // reupload, so posting first is what lets the docs marked Valid survive it.
    if (!o || !(await flushVerdicts(o))) return;
    const r = await reject(id, reason);
    if (!r.success) return alert(`Could not reject: ${r.error}`);
    clearDraft(id);
    setRejecting(false);
    setOpenObId(null);
  };
  const confirmReprovision = async (id: string, docTypes: string[], note: string) => {
    const r = await requestReprovision(id, docTypes, note || undefined);
    if (!r.success) return alert(`Could not request new documents: ${r.error}`);
    clearDraft(id);           // the reopened cycle re-seeds from its new server state
    setReprovisioning(false); // panel stays open, now showing "Awaiting re-provision"
  };
  const decideCr = (id: string, verdict: "approve" | "reject") =>
    void decideRedemption(id, { verdict }).then((r) => {
      if (!r.success) alert(`Could not submit decision: ${r.error}`);
    });

  const isEmpty = tab === "onboarding" ? onboarding.length === 0 : redemptions.length === 0;

  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mx-auto">
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
                  <b>Compliance gate</b> — these redemptions exceed US${COMPLIANCE_THRESHOLD.toLocaleString()}. Compliance decides first; PC gives the final sign-off before the redemption proceeds.
                </Notice>
              </div>
              <RedeemTable rows={redemptions} onRowClick={setOpenCrId} openId={openCrId} />
              <div className="mt-4 flex flex-wrap gap-x-[22px] gap-y-2 text-[12.5px] text-secondary">
                <span className="flex items-center gap-1.5"><ShieldCheck size={13} strokeWidth={2} />Compliance is the first gate on amounts above the threshold</span>
                <span className="flex items-center gap-1.5"><User size={13} strokeWidth={2} />Client identity is anonymized throughout</span>
              </div>
            </>
          )}
        </div>
      </div>

      {openOb && !rejecting && !reprovisioning && (
        <ObDetailPanel
          o={openOb}
          draftVerdicts={verdictsFor(openOb)}
          onClose={() => setOpenObId(null)}
          onApprove={approveOb}
          onReject={() => setRejecting(true)}
          onRequireDocs={() => setReprovisioning(true)}
          onVerdict={doVerdict}
          onDownload={doDownload}
        />
      )}
      {openOb && rejecting && (
        <RejectModal
          o={openOb}
          draftVerdicts={verdictsFor(openOb)}
          onCancel={() => setRejecting(false)}
          onConfirm={confirmReject}
        />
      )}
      {openOb && reprovisioning && (
        <ReprovisionModal
          o={openOb}
          onCancel={() => setReprovisioning(false)}
          onConfirm={confirmReprovision}
        />
      )}
      {openCr && <CrDetailPanel r={openCr} onClose={() => setOpenCrId(null)} onDecision={decideCr} />}
    </div>
  );
}

export default function ComplianceReviewPage() {
  return (
    <Suspense fallback={null}>
      <ComplianceReviewContent />
    </Suspense>
  );
}
