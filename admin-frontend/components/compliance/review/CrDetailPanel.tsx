"use client";

import { Check, X, Shield, User, TriangleAlert } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { DetailShell, Fact, Notice, SectionLabel, CrStatusChip } from "@/components/compliance/Shared";
import { coMoney } from "@/lib/compliance/mock";
import type { RedemptionView } from "@/lib/onboarding/types";

const COMPLIANCE_THRESHOLD = 300000;

/* ---- one node in the approval-workflow timeline ------------ */
function WorkflowStep({ label, sub, state }: { label: string; sub: string; state: "done" | "current" | "rejected" | "pending" }) {
  const dot = state === "rejected" ? "#ba1a1a" : state === "done" || state === "current" ? "var(--primary)" : "var(--outline)";
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="mt-[3px] h-2.5 w-2.5 flex-none rounded-full"
        style={{ background: dot, boxShadow: state === "current" ? "0 0 0 4px rgba(242,116,5,0.18)" : "none" }}
      />
      <div>
        <div className="text-[13px] font-bold text-on-surface">{label}</div>
        <div className="mt-px text-[11.5px] text-secondary">{sub}</div>
      </div>
    </div>
  );
}

export function CrDetailPanel({
  r, onClose, onDecision,
}: {
  r: RedemptionView;
  onClose: () => void;
  onDecision: (id: string, verdict: "approve" | "reject") => void;
}) {
  // D-2: for >$300k redemptions, Compliance is the FIRST gate (awaiting_co),
  // PC is the second/final gate (awaiting_pc -> approved) -- CO never sees a
  // row that's already "PC-approved".
  const pending = r.status === "awaiting_co";
  const awaitingPc = r.status === "awaiting_pc";
  return (
    <DetailShell
      eyebrow="Redemption · compliance gate"
      title={r.modelName}
      meta={`${r.ref} · ${r.date}`}
      statusSlot={<CrStatusChip status={r.status} />}
      onClose={onClose}
    >
      {r.emergent && (
        <div className="mb-2.5">
          <Notice tone="bad" icon={TriangleAlert}>
            <b>Emergent Big Redemption</b> — full redemption of all units, client requires instant liquidity. Expected cash-out is <b>T+1</b> (one business day). Prioritize this review.
          </Notice>
        </div>
      )}
      <Notice tone="warn" icon={Shield}>
        <b>Compliance gate</b> — exceeds US${COMPLIANCE_THRESHOLD.toLocaleString()} ({coMoney(r.amount)}). Compliance decides first; PC gives the final sign-off before release.
      </Notice>
      <div className="mt-3.5 flex items-center gap-[7px] text-[12.5px] text-secondary">
        <User size={13} strokeWidth={2} />Client anonymized · {r.ref}
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-[11px]">
        <Fact k="Model" v={r.modelName} />
        <Fact k="Multiplier" v={`${r.mult}×`} />
        <Fact k="Redemption amount" v={coMoney(r.amount)} span2 vSize={18} />
        <Fact k="Initiated by" v={r.rm} vSize={13} />
        <Fact k="Date submitted" v={r.date} vSize={13} />
      </div>
      <div className="mt-[18px]">
        <SectionLabel>Approval workflow</SectionLabel>
        {r.status === "rejected" ? (
          <p className="text-[12.5px] leading-[1.55] text-secondary">This redemption was rejected during the approval workflow.</p>
        ) : (
          <div className="flex flex-col">
            <WorkflowStep
              label="Compliance review"
              sub={pending ? "Awaiting your decision" : "Approved"}
              state={pending ? "current" : "done"}
            />
            <div className="ml-1 h-4 w-px bg-outline-variant" />
            <WorkflowStep
              label="PC approval (final)"
              sub={awaitingPc ? "Awaiting PC sign-off" : r.status === "approved" ? "Approved" : "Pending"}
              state={r.status === "approved" ? "done" : awaitingPc ? "current" : "pending"}
            />
          </div>
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
            {r.status === "rejected" && <><X size={15} strokeWidth={2} />Rejected — blocked</>}
            {r.status === "awaiting_pc" && "Approved by you — awaiting PC sign-off"}
            {r.status === "approved" && <><Check size={15} strokeWidth={2} />Approved — released</>}
            {r.status !== "rejected" && r.status !== "awaiting_pc" && r.status !== "approved" && `Unexpected status: ${r.status}`}
          </span>
        )}
      </div>
    </DetailShell>
  );
}
