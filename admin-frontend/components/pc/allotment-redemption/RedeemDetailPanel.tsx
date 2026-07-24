"use client";

// Redemption detail — the ONLY place approve/reject live. Approving a request
// above US$300K routes to compliance FIRST (backend handles routing; D-2:
// awaiting_co -> awaiting_pc -> approved); below that threshold, PC approval
// alone is sufficient.

import { Check, X, User, TriangleAlert, Shield } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { fmtMoney, fmtTimestamp } from "@/lib/pc/format";
import type { RedemptionView } from "@/lib/onboarding/types";
import { ArDetailShell, ArFact, ArNotice, arLabelCls } from "./parts";
import { RedeemStatusChip } from "./RedeemTable";

type StepState = "done" | "current" | "upcoming" | "rejected";

function WorkflowStep({ label, sub, state }: { label: string; sub: string; state: StepState }) {
  const dot = {
    done: "var(--primary)",
    current: "var(--primary)",
    upcoming: "var(--outline)",
    rejected: "rgb(var(--color-error))",
  }[state];
  return (
    <div className="flex items-center gap-2">
      <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: dot }} />
      <div>
        <div className="text-[13px] font-bold text-on-surface">{label}</div>
        <div className="text-[11.5px] text-secondary">{sub}</div>
      </div>
    </div>
  );
}

export function RedeemDetailPanel({
  r, onClose, onDecision,
}: {
  r: RedemptionView;
  onClose: () => void;
  onDecision: (id: string, verdict: "approve" | "reject") => void;
}) {
  const amt = r.amount;
  const comp = amt > 300000;
  const pending = r.status === "awaiting_pc";

  return (
    <ArDetailShell
      eyebrow="Redemption"
      title={r.modelName}
      meta={`${r.ref} · ${fmtTimestamp(r.date)}`}
      onClose={onClose}
      statusSlot={<RedeemStatusChip status={r.status} />}
    >
      {r.emergent && (
        <div style={{ marginBottom: comp ? 10 : 0 }}>
          <ArNotice tone="bad" icon={TriangleAlert}>
            <b>Emergent Big Redemption</b> — full redemption of all units, client requires instant liquidity. Expected cash-out is <b>T+1</b> (one business day). Prioritize this review.
          </ArNotice>
        </div>
      )}
      {comp && (
        <ArNotice tone="warn" icon={Shield}>
          <b>Compliance approval required</b> — exceeds the US$300,000 threshold ({fmtMoney(amt)}). Compliance decides first, then PC gives the final sign-off.
        </ArNotice>
      )}
      <div
        className="flex items-center gap-[7px] text-[12.5px] text-secondary"
        style={{ marginTop: comp || r.emergent ? 14 : 0 }}
      >
        <User size={13} strokeWidth={2} />Client anonymized · {r.ref}
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-[11px]">
        <ArFact label="Model" value={r.modelName} />
        <ArFact label="Multiplier" value={`${r.mult}×`} />
        <ArFact label="Redemption amount" value={fmtMoney(amt)} span />
        <ArFact label="Initiated by" value={r.rm} />
        <ArFact label="Date submitted" value={fmtTimestamp(r.date)} />
      </div>
      <div className="mt-[18px]">
        <div className={`${arLabelCls} mb-2`}>Approval workflow</div>
        {!comp ? (
          <div className="flex items-center gap-2.5">
            <WorkflowStep
              label="PC approval"
              sub={r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Awaiting your decision"}
              state={r.status === "rejected" ? "rejected" : r.status === "approved" ? "done" : "current"}
            />
          </div>
        ) : r.status === "rejected" ? (
          <p className="text-[12.5px] leading-[1.55] text-secondary">This redemption was rejected during the approval workflow.</p>
        ) : (
          <div className="flex items-center gap-2.5">
            <WorkflowStep
              label="Compliance review"
              sub={r.status === "awaiting_co" ? "Awaiting review" : "Approved"}
              state={r.status === "awaiting_co" ? "current" : "done"}
            />
            <div className="h-px w-6 bg-outline-variant" />
            <WorkflowStep
              label="PC approval (final)"
              sub={r.status === "approved" ? "Approved" : r.status === "awaiting_pc" ? "Awaiting your decision" : "Pending"}
              state={r.status === "approved" ? "done" : r.status === "awaiting_pc" ? "current" : "upcoming"}
            />
          </div>
        )}
        {!comp && (
          <p className="mt-2.5 text-[12.5px] leading-[1.55] text-secondary">
            Below US$300K — no compliance sign-off needed. PC approval is sufficient.
          </p>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        {pending ? (
          <>
            <Button variant="secondary" icon={X} onClick={() => onDecision(r.id, "reject")}>Reject</Button>
            <Button icon={Check} onClick={() => onDecision(r.id, "approve")}>Approve</Button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-secondary">
            {r.status === "rejected" && <><X size={15} strokeWidth={2} />Rejected</>}
            {r.status === "awaiting_co" && "With Compliance — awaiting their review"}
            {r.status === "approved" && <><Check size={15} strokeWidth={2} />Approved</>}
            {r.status !== "rejected" && r.status !== "awaiting_co" && r.status !== "approved" && `Unexpected status: ${r.status}`}
          </span>
        )}
      </div>
    </ArDetailShell>
  );
}
