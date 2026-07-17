"use client";

import { Check, X, Shield, User, TriangleAlert } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { DetailShell, Fact, Notice, SectionLabel, CrStatusChip } from "@/components/compliance/Shared";
import { COMPLIANCE_THRESHOLD, coMoney, crAmt, crModel, type CrStatus, type Redemption } from "@/lib/compliance/mock";

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
  r: Redemption;
  onClose: () => void;
  onDecision: (id: string, status: CrStatus) => void;
}) {
  const m = crModel(r.mid);
  const amt = crAmt(r);
  const pending = r.status === "pending_co";
  return (
    <DetailShell
      eyebrow="Redemption · compliance gate"
      title={m.name}
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
        <b>Compliance gate</b> — exceeds US${COMPLIANCE_THRESHOLD.toLocaleString()} and is already PC-approved. Your sign-off is the final step before release.
      </Notice>
      <div className="mt-3.5 flex items-center gap-[7px] text-[12.5px] text-secondary">
        <User size={13} strokeWidth={2} />Client anonymized · {r.ref}
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-[11px]">
        <Fact k="Model" v={m.name} />
        <Fact k="Multiplier" v={`${r.mult}×`} />
        <Fact k="Redemption amount" v={coMoney(amt)} span2 vSize={18} />
        <Fact k="Initiated by" v={r.rm} vSize={13} />
        <Fact k="Date submitted" v={r.date} vSize={13} />
      </div>
      <div className="mt-[18px]">
        <SectionLabel>Approval workflow</SectionLabel>
        <div className="flex flex-col">
          <WorkflowStep label="PC approval" sub={`Approved · ${r.pcApproved}`} state="done" />
          <div className="ml-1 h-4 w-px bg-outline-variant" />
          <WorkflowStep
            label="Compliance review"
            sub={pending ? "Awaiting your decision" : r.status === "approved_co" ? "Approved" : "Rejected"}
            state={pending ? "current" : r.status === "rejected_co" ? "rejected" : "done"}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        {pending ? (
          <>
            <Button variant="secondary" icon={X} onClick={() => onDecision(r.id, "rejected_co")}>Reject</Button>
            <Button icon={Check} onClick={() => onDecision(r.id, "approved_co")}>Approve &amp; release</Button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-secondary">
            {r.status === "approved_co" ? <Check size={15} strokeWidth={2} /> : <X size={15} strokeWidth={2} />}
            {r.status === "approved_co" ? "Approved — released" : "Rejected — blocked"}
          </span>
        )}
      </div>
    </DetailShell>
  );
}
