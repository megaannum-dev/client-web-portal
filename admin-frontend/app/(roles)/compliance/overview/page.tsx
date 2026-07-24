"use client";

// Compliance Overview — the CO's landing page. Aggregates all four work
// streams into one dashboard: onboarding + renewals share the tall primary
// column (daily workload); redemptions + guidelines sit in a narrower right
// rail (lower volume). Every panel/tile jumps into the relevant Compliance
// Review tab via a query-param deep link (see review/page.tsx's resolveDeepLink).
// Ported from the design prototype (CoOverview.jsx).

import { useRouter } from "next/navigation";
import { Filter, Download, ClipboardCheck, RefreshCw, Shield, FileText } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAuth } from "@/components/auth/AuthProvider";
import { OvTile, OvPanel, OvRow, UrgTag } from "@/components/compliance/overview/OverviewWidgets";
import { useComplianceQueue } from "@/hooks/api/useComplianceQueue";
import { useCoRedemptions } from "@/hooks/api/useCoRedemptions";
import { CO_RENEWALS, GR_GUIDELINES, coMoney, redemptionAmountRisk } from "@/lib/compliance/mock";

const COMPLIANCE_THRESHOLD = 300000;

export default function ComplianceOverviewPage() {
  const router = useRouter();
  const name = useAuth().portalUser?.name;

  const { data: onboardingData } = useComplianceQueue();
  const onboarding = onboardingData ?? [];
  const { data: redemptionsData } = useCoRedemptions();
  const redemptions = (redemptionsData ?? []).filter((r) => r.amount > COMPLIANCE_THRESHOLD);

  const goReview = (params: string) => router.push(`/compliance/review?${params}`);

  const obPending = onboarding.filter((o) => o.status === "pending");
  const obFlagged = obPending.filter((o) => o.documents.some((d) => d.status === "rejected")).length;
  const crPending = redemptions.filter((r) => r.status === "awaiting_co");
  const crHigh = crPending.filter((r) => redemptionAmountRisk(r.amount).tone === "failed").length;
  const renOver = CO_RENEWALS.filter((r) => r.days < 0).length;
  const renSoon = CO_RENEWALS.filter((r) => r.days >= 0 && r.days <= 7).length;
  const renShown = CO_RENEWALS.filter((r) => r.days <= 15);
  const nextUp = CO_RENEWALS.find((r) => r.days >= 0);

  return (
    <div className="mx-auto">
      <div className="mb-6">
        <PageHeader
          title="Compliance Overview"
          subtitle={name ? `Hello, ${name} — here's today's compliance workload.` : "Here's today's compliance workload."}
          actions={
            <>
              <Button variant="secondary" icon={Filter}>Filters</Button>
              <Button variant="secondary" icon={Download}>Export log</Button>
            </>
          }
        />
      </div>

      <div className="mb-[22px] grid grid-cols-4 gap-3.5">
        <OvTile
          icon={ClipboardCheck} value={obPending.length} label="Onboarding to review"
          alert={obFlagged > 0} subTone={obFlagged ? "warn" : undefined}
          sub={obFlagged ? `${obFlagged} with flagged docs` : "all documents clean"}
        />
        <OvTile
          icon={RefreshCw} value={renOver + renSoon} label="Renewals due soon"
          alert={renOver > 0} subTone={renOver ? "bad" : "warn"}
          sub={renOver ? `${renOver} overdue` : `next in ${nextUp ? nextUp.days : "—"}d`}
        />
        <OvTile
          icon={Shield} value={crPending.length} label="Redemptions to sign off"
          alert={crHigh > 0} subTone={crHigh ? "bad" : undefined}
          sub={crHigh ? `${crHigh} high risk` : `all > ${coMoney(COMPLIANCE_THRESHOLD)}`}
        />
        <OvTile
          icon={FileText} value={GR_GUIDELINES.length} label="Investment Guidelines"
          sub={`${GR_GUIDELINES.length} guidelines on file`}
        />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <OvPanel
            icon={ClipboardCheck} title="Onboarding & Renewals" count={obPending.length + renShown.length}
            viewLabel="View all" onViewAll={() => goReview("tab=onboarding")}
          >
            {obPending.map((o) => (
              <OvRow
                key={o.id} kind="onboarding" title={o.client} sub={`${o.rm} · ${o.type}`}
                onClick={() => goReview(`tab=onboarding&openObId=${o.id}`)}
              />
            ))}
            {renShown.map((r) => (
              <OvRow
                key={r.client} kind="renewal" title={`${r.client} — renewal`} sub={`${r.rm} · ${r.mandate}`}
                right={<UrgTag days={r.days} />}
                onClick={() => goReview("tab=onboarding")}
              />
            ))}
          </OvPanel>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <OvPanel
            icon={Shield} title="Redemptions" count={crPending.length} alertCount={crHigh}
            viewLabel="Open tab" onViewAll={() => goReview("tab=redeem")}
          >
            {crPending.map((r) => {
              const risk = redemptionAmountRisk(r.amount);
              return (
                <OvRow
                  key={r.id} kind="redemption" title={r.ref} sub={`${r.modelName} · ${coMoney(r.amount)}`}
                  onClick={() => goReview(`tab=redeem&openCrId=${r.id}`)}
                  right={<Chip tone={risk.tone} dot={false}>{risk.label}</Chip>}
                />
              );
            })}
          </OvPanel>
          <OvPanel
            icon={FileText} title="Investment Guidelines" count={GR_GUIDELINES.length}
            viewLabel="View tab" onViewAll={() => goReview("tab=guideline")}
          >
            {GR_GUIDELINES.map((g) => (
              <OvRow
                key={g.id} kind="guideline" title={g.name} sub={`${g.client} · ${g.mandate}`}
                onClick={() => goReview(`tab=guideline&openGrId=${g.id}`)}
                right={<span className="rounded-md bg-surface-container px-2 py-0.5 text-[11.5px] font-bold text-secondary">v{g.version}</span>}
              />
            ))}
          </OvPanel>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-[22px] gap-y-2 text-[12.5px] text-secondary">
        <span className="flex items-center gap-1.5"><ClipboardCheck size={13} strokeWidth={2} />Onboarding + renewals merged — the CO&apos;s primary workload in one tall column</span>
        <span className="flex items-center gap-1.5"><Shield size={13} strokeWidth={2} />Redemptions + guidelines on the right — lower volume, narrower</span>
      </div>
    </div>
  );
}
