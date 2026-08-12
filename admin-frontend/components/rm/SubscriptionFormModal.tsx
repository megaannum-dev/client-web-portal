"use client";

/* ============================================================
   Subscription entry-form modal — new subscription / add allotment /
   add redemption. Ported faithfully from the design handoff prototype
   (Screens.jsx SubscriptionFormModal, ~L1376-1561).
   ============================================================ */

import { useState, type ChangeEvent, type ReactNode } from "react";
import clsx from "clsx";
import {
  ArrowUpFromLine,
  ArrowDownToLine,
  Send,
  Route,
  TriangleAlert,
  Info,
  Shield,
  Check,
  Link2,
} from "@/lib/icons";
import { Modal } from "@/components/rm/Shared";
import { Button } from "@/components/ui/Button";
import { parseFeePercent } from "@/lib/fee";
import { IB_ACCOUNT_HINT, isValidIbAccount, normalizeIbAccount } from "@/lib/rm/ib-account";
import { submitAllotment, submitRedemption } from "@/app/(roles)/rm/model-subscription/actions";

export type SubscriptionModalMode = "new-subscription" | "add-allotment" | "redemption";

/** Threaded from the "Add allotment"/"Add redemption" buttons (ModelAccordionItem)
 *  and the page-level "Subscribe Client" button. clientId/modelId are the ids
 *  used to build the submit request in add-allotment/redemption modes. */
export interface SubscriptionModalContext {
  clientName?: string;
  clientId?: string;
  modelName?: string;
  modelId?: string;
  modelSize?: number;
  modelAccount?: string;
  mgmtFee?: string;
  incentiveFee?: string;
  sourceTicketRef?: string;
}

const fmtUsd = (n: number) => n.toLocaleString("en-US");

const fieldClass =
  "w-full rounded border border-outline bg-white px-3.5 py-2.5 text-[14px] font-medium leading-5 text-on-surface outline-none focus:border-primary";
const fieldDisabledClass =
  "w-full cursor-not-allowed rounded border border-outline bg-surface-low px-3.5 py-2.5 text-[14px] font-medium leading-5 text-on-surface opacity-[0.55]";

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

export function SubscriptionFormModal({
  mode = "new-subscription",
  context = {},
  initialEmergent = false,
  onClose,
  onSuccess,
  availableClients = [],
  availableModels = [],
  subscribedModelIdsByClient = {},
}: {
  mode?: SubscriptionModalMode;
  context?: SubscriptionModalContext;
  initialEmergent?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  availableClients?: { id: string; name: string }[];
  availableModels?: { id: string; name: string; mgmtFee: string; incentiveFee: string; size: number }[];
  /** Model ids the client already holds (any multiplier > 0), keyed by
   *  client id — used in new-subscription mode to hide models the selected
   *  client can't be "newly" subscribed to (that's Add Allotment's job). */
  subscribedModelIdsByClient?: Record<string, Set<string>>;
}) {
  const isNew = mode === "new-subscription";
  const isAddAllot = mode === "add-allotment";
  const isRedemption = mode === "redemption";
  const isAllotment = !isRedemption;
  const locked = isAddAllot || isRedemption;

  const client = context.clientName ?? ""; // locked-mode display only — new-subscription mode uses clientId
  const [model, setModel] = useState(context.modelName ?? "");
  const [clientId, setClientId] = useState(context.clientId ?? "");
  const [modelId, setModelId] = useState(context.modelId ?? "");
  const [multiplier, setMultiplier] = useState(isRedemption ? "1" : "2");
  const [mgmtFee, setMgmtFee] = useState(context.mgmtFee ?? "");
  const [incentiveFee, setIncentiveFee] = useState(context.incentiveFee ?? "");
  const [dateVal, setDateVal] = useState("");
  const [ibAccountId, setIbAccountId] = useState("");
  // Display name for the "Bound to {client}…" helper line under IBHK Account ID.
  const clientLabel = client || availableClients.find((c) => c.id === clientId)?.name || "";
  const [emergent, setEmergent] = useState(initialEmergent);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Locked modes (add-allotment/redemption) are against a real, already-live
  // subscription — use its actual size, not a name-keyed lookup into the
  // new-subscription mock catalog (whose names don't cover live model names).
  const modelSize = locked
    ? (context.modelSize ?? 0)
    : (availableModels.find((m) => m.id === modelId)?.size ?? 0);
  const multNum = emergent ? 0 : parseFloat(multiplier) || 0;
  const notional = emergent ? modelSize : modelSize * multNum;
  // "Expected Cash In/Out" is marked required (Field's asterisk) but, unlike a
  // real <form>, this modal has no submit event for the browser's native
  // `required` to hook into — nothing stopped an empty date from reaching the
  // backend as null. Emergent redemption is exempt: its date is fixed to T+1.
  const canSubmit = (emergent || dateVal !== "") && (!isNew || isValidIbAccount(ibAccountId));
  const accentText = isRedemption ? "text-[#994700]" : "text-[#2f7a47]";
  const accentBg = isRedemption ? "bg-[#fff3e8]" : "bg-[#e3f1e7]";
  const HeaderIcon = isRedemption ? ArrowUpFromLine : ArrowDownToLine;
  const title = isNew ? "New Subscription" : isAddAllot ? "Add Allotment" : "Add Redemption";
  const subtitle = isNew
    ? "Subscribe a client to a model and set initial allotment."
    : isAddAllot
      ? "Allot additional units to an existing model subscription."
      : "Redeem units from an existing model subscription.";

  // isNew-only: a client can't be "newly" subscribed to a model they already
  // hold units of — that's Add Allotment's job (see also client_ib_accounts'
  // one-account-per-model invariant, which this filter avoids ever tripping).
  const modelsForSelectedClient = isNew
    ? availableModels.filter((m) => !subscribedModelIdsByClient[clientId]?.has(m.id))
    : availableModels;

  const onClientChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setClientId(e.target.value);
    // The previously-picked model may no longer be valid for the new client.
    if (isNew) { setModelId(""); setModel(""); }
  };

  const onModelChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setModelId(id);
    const entry = availableModels.find((m) => m.id === id);
    setModel(entry?.name ?? "");
    if (entry) { setMgmtFee(entry.mgmtFee); setIncentiveFee(entry.incentiveFee); }
  };

  const toggleEmergent = () => {
    setEmergent((prev) => {
      if (!prev) setMultiplier("");
      return !prev;
    });
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    const result = isRedemption
      ? await submitRedemption({
          client_id: clientId,
          model_id: modelId,
          multiplier: emergent ? 0 : parseFloat(multiplier) || 0,
          expected_cash_out: emergent ? null : (dateVal || null),
          emergent,
          source_ticket_ref: context.sourceTicketRef,
        })
      : await submitAllotment({
          client_id: clientId,
          model_id: modelId,
          multiplier: parseFloat(multiplier) || 0,
          expected_cash_in: dateVal || null,
          mgmt_fee: isNew ? (mgmtFee.trim() === "" ? null : parseFeePercent(mgmtFee)) : null,
          incentive_fee: isNew ? (incentiveFee.trim() === "" ? null : parseFeePercent(incentiveFee)) : null,
          source_ticket_ref: context.sourceTicketRef,
          ...(isNew ? { client_ib: normalizeIbAccount(ibAccountId) } : {}),
        });
    setSubmitting(false);
    if (!result.success) {
      setSubmitError(result.error);
      return;
    }
    onSuccess?.();
    onClose();
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-3">
          <span className={clsx("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]", accentBg, accentText)}>
            <HeaderIcon size={17} strokeWidth={2} />
          </span>
          <div>
            <div className="text-[19px] font-bold tracking-[-0.01em] text-on-surface">{title}</div>
            <div className="mt-1 text-[13px] leading-[1.4] text-secondary">{subtitle}</div>
          </div>
        </div>
      }
      onClose={onClose}
      width={600}
      centered
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="ml-auto" disabled={submitting}>Cancel</Button>
          {emergent ? (
            <Button icon={TriangleAlert} style={{ background: "#b71c1c" }} onClick={handleSubmit} disabled={submitting || !canSubmit}>
              {submitting ? "Submitting…" : "Submit emergent redemption"}
            </Button>
          ) : (
            <Button icon={Send} onClick={handleSubmit} disabled={submitting || !canSubmit}>
              {submitting ? "Submitting…" : `Submit ${isRedemption ? "redemption" : "allotment"}`}
            </Button>
          )}
        </>
      }
    >
      {/* Client + Model + bound IBHK account — grouped so the binding relationship reads as one unit */}
      <div className="mb-4 rounded-[12px] border border-outline-variant bg-surface-low p-4">
        <div className="grid grid-cols-2 gap-x-5 gap-y-4">
          <Field label="Client" required={isNew}>
            {locked ? (
              <div className={fieldDisabledClass}>{client}</div>
            ) : (
              <select value={clientId} onChange={onClientChange} className={clsx(fieldClass, "font-semibold")}>
                <option value="" disabled>Select a client…</option>
                {availableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Model" required={isNew}>
            {locked ? (
              <div className={fieldDisabledClass}>{model}</div>
            ) : (
              <select value={modelId} onChange={onModelChange} className={clsx(fieldClass, "font-semibold")}>
                <option value="" disabled>Select a model…</option>
                {modelsForSelectedClient.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </Field>
        </div>
        {/* New model selected on a new subscription — its IBHK account binds to Client × Model above */}
        {isNew && !!modelId && (
          <div className="mt-3.5 border-t border-dashed border-outline pt-3.5">
            <Field label="IBHK Account ID" required>
              <input
                value={ibAccountId}
                onChange={(e) => setIbAccountId(e.target.value.toUpperCase())}
                placeholder="e.g. U1234567"
                className={fieldClass}
              />
              {ibAccountId.trim() !== "" && !isValidIbAccount(ibAccountId) && (
                <div className="mt-1.5 text-[11.5px] font-semibold text-primary">{IB_ACCOUNT_HINT}</div>
              )}
            </Field>
            <div className="mt-2.5 flex items-start gap-2">
              <Link2 size={13} strokeWidth={2} className="mt-px shrink-0 text-[#3f6196]" />
              <span className="text-[12.5px] font-semibold leading-relaxed text-[#3f6196]">
                Bound to {clientLabel || "this client"} for the {model} model only.
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        <Field label="Multiplier" required>
          {emergent ? (
            <div className={fieldDisabledClass}>Full (all units)</div>
          ) : (
            <input
              type="number" min={1} step={1} value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              placeholder="e.g. 2"
              className={fieldClass}
            />
          )}
        </Field>
        <Field label={isRedemption ? "Expected Cash Out" : "Expected Cash In"} required>
          {emergent ? (
            <div className={fieldDisabledClass}>T+1 (tomorrow)</div>
          ) : (
            <input type="date" value={dateVal} onChange={(e) => setDateVal(e.target.value)} className={fieldClass} />
          )}
        </Field>
        {isAllotment && (
          <>
            <Field label="Management Fee" required={isNew}>
              {locked ? (
                <div className={fieldDisabledClass}>{mgmtFee}</div>
              ) : (
                <input value={mgmtFee} onChange={(e) => setMgmtFee(e.target.value)} placeholder="e.g. 1.0%" className={fieldClass} />
              )}
            </Field>
            <Field label="Incentive Fee" required={isNew}>
              {locked ? (
                <div className={fieldDisabledClass}>{incentiveFee}</div>
              ) : (
                <input value={incentiveFee} onChange={(e) => setIncentiveFee(e.target.value)} placeholder="e.g. 10%" className={fieldClass} />
              )}
            </Field>
          </>
        )}
      </div>

      {isAddAllot && (
        <div className="mt-3.5 flex items-start gap-2.5 rounded-md border border-[rgba(63,97,150,0.18)] bg-[rgba(63,97,150,0.08)] px-3.5 py-[11px]">
          <Shield size={15} strokeWidth={1.75} className="mt-px shrink-0 text-[#3f6196]" />
          <span className="text-[12.5px] font-semibold leading-[1.5] text-[#3f6196]">
            Client, model and fee schedule are inherited from the existing subscription.
          </span>
        </div>
      )}
      {isNew && (
        <div className="mt-3.5 flex items-start gap-2.5 rounded-md border border-outline-variant bg-surface-low px-3.5 py-[11px]">
          <Info size={15} strokeWidth={1.75} className="mt-px shrink-0 text-secondary" />
          <span className="text-[12.5px] leading-[1.5] text-secondary">
            Fees default to the selected model&rsquo;s schedule and can be overwritten.
          </span>
        </div>
      )}

      {isRedemption && (
        <div
          className={clsx(
            "mt-4 rounded-md border-2 p-4 transition-all",
            emergent ? "border-solid border-[#b71c1c] bg-[#fef2f0]" : "border-dashed border-outline bg-transparent",
          )}
        >
          <label className="flex cursor-pointer items-start gap-3" onClick={toggleEmergent}>
            <span
              className={clsx(
                "mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border-2 transition-all",
                emergent ? "border-[#b71c1c] bg-[#b71c1c]" : "border-outline bg-white",
              )}
            >
              {emergent && <Check size={13} strokeWidth={3} className="text-white" />}
            </span>
            <div>
              <div className={clsx("text-[14px] font-bold", emergent ? "text-[#b71c1c]" : "text-on-surface")}>
                Emergent Big Redemption
              </div>
              <div className="mt-[3px] text-[12.5px] text-secondary">
                Full redemption of all units with T+1 cash out
              </div>
            </div>
          </label>
          {emergent && (
            <div className="mt-3 flex items-start gap-2.5 rounded-md bg-[#fce4e0] p-3">
              <TriangleAlert size={16} strokeWidth={2} className="mt-px shrink-0 text-[#b71c1c]" />
              <div className="text-[12.5px] leading-[1.55] text-[#7f1313]">
                <strong>Warning:</strong> An Emergent Big Redemption redeems <strong>all</strong> units from this
                model immediately. The expected cash out is set to <strong>T+1</strong> (one business day). This
                action cannot be undone once submitted and will require immediate PM and MOBO attention.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded-md border border-outline-variant bg-surface-low p-4">
        <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">Model size</div>
        <div className="mb-3 text-[13.5px] font-semibold text-on-surface">
          {model ? `USD ${fmtUsd(modelSize)}` : "—"}
          <span className="font-normal text-secondary"> × {emergent ? "full (net units)" : `${multiplier || "0"} multiplier`}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">
              Notional ({emergent ? "full redemption" : "model size × multiplier"})
            </div>
            <div className={clsx("text-[26px] font-bold leading-none tracking-[-0.01em] tabular-nums", accentText)}>
              {isRedemption ? "(" : ""}USD {emergent ? `${fmtUsd(modelSize)} — full` : fmtUsd(notional)}{isRedemption ? ")" : ""}
            </div>
          </div>
          <div className="flex max-w-[240px] items-center gap-[7px] text-[12px] text-secondary">
            <Route size={14} strokeWidth={1.75} />
            <span>Routes to PM for approval, then MOBO for processing.</span>
          </div>
        </div>
      </div>

      {submitError && (
        <div className="mt-3.5 flex items-start gap-2.5 rounded-md bg-[#fce4e0] p-3">
          <TriangleAlert size={16} strokeWidth={2} className="mt-px shrink-0 text-[#b71c1c]" />
          <div className="text-[12.5px] leading-[1.55] text-[#7f1313]">{submitError}</div>
        </div>
      )}
    </Modal>
  );
}
