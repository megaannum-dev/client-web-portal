"use client";

// Redemption detail — the ONLY place approve/reject live. Approving a request
// above US$300K routes to `pending_compliance` (Compliance review step +
// shield markers) rather than straight to `approved`.

import { Check, X, User, TriangleAlert, Shield } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { fmtMoney } from "@/lib/pc/format";
import {
  arModelById,
  arNeedsCompliance,
  arRedeemAmt,
  type RedeemStatus,
  type Redemption,
} from "@/lib/pc/allotment-redemption-mock";
import { ArDetailShell, ArFact, ArNotice, arLabelCls } from "./parts";
import { RedeemStatusChip } from "./RedeemTable";

type StepState = "done" | "current" | "upcoming" | "rejected";

function WorkflowStep({ label, sub, state }: { label: string; sub: string; state: StepState }) {
  const dot = {
    done: "var(--primary)",
    current: "var(--primary)",
    upcoming: "var(--outline)",
    rejected: "#ba1a1a", // --color-error (no CSS alias)
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
  r: Redemption;
  onClose: () => void;
  onDecision: (id: string, status: RedeemStatus) => void;
}) {
  const m = arModelById(r.mid);
  const amt = arRedeemAmt(r);
  const comp = arNeedsCompliance(r);
  const pending = r.status === "pending_pc";
  const approvedOrRouted = r.status === "approved" || r.status === "pending_compliance";

  return (
    <ArDetailShell
      eyebrow="Redemption"
      title={m.name}
      meta={`${r.ref} · ${r.date}`}
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
          <b>Compliance approval required</b> — exceeds the US$300,000 threshold ({fmtMoney(amt)}). Needs PC approval, then Compliance sign-off to proceed.
        </ArNotice>
      )}
      <div
        className="flex items-center gap-[7px] text-[12.5px] text-secondary"
        style={{ marginTop: comp || r.emergent ? 14 : 0 }}
      >
        <User size={13} strokeWidth={2} />Client anonymized · {r.ref}
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-[11px]">
        <ArFact label="Model" value={m.name} />
        <ArFact label="Multiplier" value={`${r.mult}×`} />
        <ArFact label="Redemption amount" value={fmtMoney(amt)} span />
        <ArFact label="Initiated by" value={r.rm} />
        <ArFact label="Date submitted" value={r.date} />
      </div>
      <div className="mt-[18px]">
        <div className={`${arLabelCls} mb-2`}>Approval workflow</div>
        <div className="flex items-center gap-2.5">
          <WorkflowStep
            label="PC approval"
            sub={approvedOrRouted ? "Approved" : r.status === "rejected" ? "Rejected" : "Awaiting your decision"}
            state={r.status === "rejected" ? "rejected" : approvedOrRouted ? "done" : "current"}
          />
          {comp && (
            <>
              <div className="h-px w-6 bg-outline-variant" />
              <WorkflowStep
                label="Compliance review"
                sub={r.status === "pending_compliance" ? "Awaiting review" : "Pending · > US$300K threshold"}
                state={r.status === "pending_compliance" ? "current" : "upcoming"}
              />
            </>
          )}
        </div>
        {!comp && (
          <p className="mt-2.5 text-[12.5px] leading-[1.55] text-secondary">
            Below US$300K — no compliance sign-off needed. PC approval is sufficient.
          </p>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        {pending ? (
          <>
            <Button variant="secondary" icon={X} onClick={() => onDecision(r.id, "rejected")}>Reject</Button>
            <Button icon={Check} onClick={() => onDecision(r.id, comp ? "pending_compliance" : "approved")}>Approve</Button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-secondary">
            {r.status === "rejected" ? <X size={15} strokeWidth={2} /> : <Check size={15} strokeWidth={2} />}
            {r.status === "rejected" ? "Rejected" : r.status === "pending_compliance" ? "Routed to compliance" : "Approved"}
          </span>
        )}
      </div>
    </ArDetailShell>
  );
}
