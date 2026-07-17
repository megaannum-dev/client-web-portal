"use client";

// Allotment detail — acknowledge only (informational). Opened optionally from
// a row; shows the aggregate-multiplier impact bars.

import { Check, User } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { fmtMoney } from "@/lib/pc/format";
import { arAllotAmt, arModelById, type Allotment } from "@/lib/pc/allotment-redemption-mock";
import { ArDetailShell, ArFact, arLabelCls } from "./parts";
import { AggBar } from "./AggBar";

export function AllotDetailPanel({
  a, onClose, onAcknowledge,
}: {
  a: Allotment;
  onClose: () => void;
  onAcknowledge: (id: string) => void;
}) {
  const m = arModelById(a.mid);
  const pending = a.status === "pending";
  return (
    <ArDetailShell
      eyebrow="Allotment"
      title={m.name}
      meta={`${a.ref} · ${a.date}`}
      onClose={onClose}
      statusSlot={
        pending ? (
          <span className="rounded-full px-2.5 py-[3px] text-[12.5px] font-bold" style={{ color: "#994700", background: "#fff3e8" }}>Pending</span>
        ) : (
          <span className="rounded-full px-2.5 py-[3px] text-[12.5px] font-bold" style={{ color: "#15803d", background: "#f0fdf4" }}>Acknowledged</span>
        )
      }
    >
      <div className="flex items-center gap-[7px] text-[12.5px] text-secondary">
        <User size={13} strokeWidth={2} />Client anonymized · {a.ref}
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-[11px]">
        <ArFact label="Model" value={m.name} />
        <ArFact label="Multiplier" value={`${a.mult}×`} />
        <ArFact label="Allotment amount" value={fmtMoney(arAllotAmt(a))} />
        <ArFact label="Expected cash-in" value={a.cashIn} />
        <ArFact label="Initiated by" value={a.rm} />
        <ArFact label="Date submitted" value={a.date} />
      </div>
      <div className="mt-5">
        <div className={`${arLabelCls} mb-2`}>Aggregated multiplier impact</div>
        <AggBar before={a.aggBefore} after={a.aggAfter} />
        <p className="mt-2 text-[12.5px] leading-[1.55] text-secondary">
          Total units allocated to {m.name} across all clients:{" "}
          <b className="text-on-surface">{a.aggBefore}×</b> currently →{" "}
          <b className="text-on-surface">{a.aggAfter}×</b> after this allotment (+{a.mult}).
        </p>
      </div>
      <div className="mt-5 flex justify-end">
        {pending ? (
          <Button icon={Check} onClick={() => onAcknowledge(a.id)}>Acknowledge</Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-secondary">
            <Check size={15} strokeWidth={2} />Acknowledged
          </span>
        )}
      </div>
    </ArDetailShell>
  );
}
