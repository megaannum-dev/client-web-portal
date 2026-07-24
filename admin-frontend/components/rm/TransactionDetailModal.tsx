"use client";

/* ============================================================
   MegaCRM — RM · Transaction Detail Modal ("Filling in Transaction
   Details"). Ported faithfully from the design handoff prototype
   (rm-app/Screens.jsx TransactionDetailModal, ~L1044-1106).

   Records the settlement details for one confirmed allotment / approved
   redemption row in the Model Subscription transaction history.

   ponytail: no settlement-details persistence endpoint exists yet, so
   the caller (SubscriptionAccordion) keeps "filled" state client-side
   only — it resets on reload. Upgrade path: a PATCH endpoint keyed by
   the transaction id (already threaded through TxnRow's 11th element).
   ============================================================ */

import { useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, Info } from "@/lib/icons";
import { Modal } from "@/components/rm/Shared";
import { Button } from "@/components/ui/Button";

export interface SettlementDetails {
  bankAccount: string;
  amount: string;
  date: string;
  time: string;
  ccy: string;
  ref: string;
}

const CURRENCIES = ["USD", "CHF", "AUD", "GBP", "EUR", "CAD", "HKD"];
const fieldClass =
  "w-full rounded border border-outline bg-white px-3.5 py-2.5 text-[14px] font-medium leading-5 text-on-surface outline-none focus:border-primary";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">
        {label}
        {required && <span className="text-primary"> *</span>}
      </div>
      {children}
    </div>
  );
}

export function TransactionDetailModal({
  type, clientName, modelName, rawAmount, onClose, onSave,
}: {
  type: "Allotment" | "Redemption";
  clientName: string;
  modelName: string;
  rawAmount: string;
  onClose: () => void;
  onSave: (details: SettlementDetails) => void;
}) {
  const isRedemption = type === "Redemption";
  const [bankAccount, setBankAccount] = useState("");
  const [amount, setAmount] = useState(rawAmount);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [ref, setRef] = useState("");
  const canSave = !!bankAccount && !!amount && !!date && !!time;

  return (
    <Modal
      title={
        <span className="flex items-center gap-2.5">
          <span
            className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-md ${
              isRedemption ? "bg-[#fff3e8] text-[#994700]" : "bg-[#e3f1e7] text-[#2f7a47]"
            }`}
          >
            {isRedemption ? <ArrowUpFromLine size={15} strokeWidth={2} /> : <ArrowDownToLine size={15} strokeWidth={2} />}
          </span>
          Filling in Transaction Details
        </span>
      }
      subtitle={`${type} · ${clientName} · ${modelName}`}
      onClose={onClose}
      width={480}
      centered
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Check} disabled={!canSave} onClick={() => onSave({ bankAccount, amount, date, time, ccy, ref })}>Save</Button>
        </>
      }
    >
      <div className="mb-3.5 flex items-center gap-2 rounded-md border border-[#f0dcc6] bg-[#fff8f0] px-3 py-2">
        <Info size={14} strokeWidth={1.75} className="flex-none text-[#b9741f]" />
        <span className="text-[12px] font-semibold text-[#8a6118]">
          Record the settlement details for this {type.toLowerCase()} to complete the follow-up.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bank Account No." required>
          <input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="e.g. HSBC-4471-001" className={fieldClass} />
        </Field>
        <Field label="Settlement Amount" required>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 180,000" className={fieldClass} />
        </Field>
        <Field label="Transaction Date" required>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Transaction Time" required>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Currency" required>
          <select value={ccy} onChange={(e) => setCcy(e.target.value)} className={`${fieldClass} cursor-pointer`}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Reference No.">
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. TXN-20260301-001" className={fieldClass} />
        </Field>
      </div>
    </Modal>
  );
}
