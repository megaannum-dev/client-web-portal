"use client";

import { useState } from "react";
import clsx from "clsx";
import { Layers, ChevronDown, ChevronUp, ChevronRight, Bell, Plus, ArrowDownToLine } from "@/lib/icons";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { statusToChip } from "@/lib/rm/subscriptions";
import type { AllotRdmpStatus } from "@/lib/onboarding/types";
import type { SubClient, SubModel, TxnRow } from "@/lib/mock/rm-data";
import type { SubscriptionModalContext } from "@/components/rm/SubscriptionFormModal";

export type OpenSubscriptionModal = (opts: {
  mode: "add-allotment" | "redemption";
  context: SubscriptionModalContext;
}) => void;

const TXN_COLS = ["Type", "Date", "IB Account", "Ccy", "Cash Amt", "Model ×", "Notional", "Expected Cash In / Out", "Status"];
const TXN_RIGHT = new Set(["Cash Amt", "Model ×", "Notional"]);
const REJECTED_AMOUNT_COLS = new Set(["Cash Amt", "Model ×", "Notional"]);

function FeePill({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-sm border px-2 py-[3px] text-[11px] font-bold",
        accent ? "text-primary" : "border-outline-variant bg-surface-container text-secondary",
      )}
      style={accent ? { background: "rgba(242,116,5,0.12)", borderColor: "rgba(242,116,5,0.28)" } : undefined}
    >
      {label}
    </span>
  );
}

function TxnTable({ rows }: { rows: TxnRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {TXN_COLS.map((h) => (
              <th
                key={h}
                className={clsx(
                  "whitespace-nowrap bg-surface-low px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary",
                  TXN_RIGHT.has(h) ? "text-right" : "text-left",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const isNet = r[0] === "Net";
            // r[7]/r[8] are the original "Expected Cash In" / "Expected Redemption"
            // fields — only one is ever populated per row (the other is "—"),
            // so the merged column just shows whichever one has a value.
            const expected = r[7] === "—" ? r[8] : r[7];
            const cells = [r[0], r[1], r[2], r[3], r[4], r[5], r[6], expected];
            return (
              <tr key={ri} className={isNet ? "bg-surface-low" : undefined}>
                {cells.map((v, ci) => (
                  <td
                    key={ci}
                    className={clsx(
                      "whitespace-nowrap border-t border-outline-variant px-3.5 py-2.5 tabular-nums text-on-surface",
                      TXN_RIGHT.has(TXN_COLS[ci]) ? "text-right" : "text-left",
                      isNet ? "font-bold" : ci === 0 ? "font-semibold" : "font-normal",
                      r[9] === "rejected" && REJECTED_AMOUNT_COLS.has(TXN_COLS[ci]) && "text-secondary opacity-60 [text-decoration:overline]",
                    )}
                  >
                    {v}
                  </td>
                ))}
                <td className="whitespace-nowrap border-t border-outline-variant px-3.5 py-2.5 text-left">
                  {!isNet && (() => {
                    const { tone, label } = statusToChip(r[9] as AllotRdmpStatus);
                    return <Chip tone={tone} dot={false}>{label}</Chip>;
                  })()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModelAccordionItem({
  client,
  model,
  open,
  onToggle,
  onOpenModal,
}: {
  client: SubClient;
  model: SubModel;
  open: boolean;
  onToggle: () => void;
  onOpenModal: OpenSubscriptionModal;
}) {
  const context: SubscriptionModalContext = {
    clientName: client.name,
    clientId: client.id,
    modelName: model.name,
    modelId: model.modelId,
    modelSize: model.modelSize,
    modelAccount: model.account,
    mgmtFee: model.mgmtFee,
    incentiveFee: model.incentiveFee,
  };
  return (
    <div className={clsx("overflow-hidden rounded-md border border-outline-variant", open ? "bg-surface-lowest" : "bg-white")}>
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          "flex w-full items-center gap-3 px-4 py-[13px] transition-colors duration-100",
          open ? "bg-surface-container" : "hover:bg-surface-low",
        )}
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md text-primary" style={{ background: "rgba(242,116,5,0.10)" }}>
          <Layers size={15} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[14px] font-semibold text-on-surface">{model.name}</div>
          <div className="mt-0.5 text-[12px] text-secondary">{model.account} · {model.status}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <FeePill label={`Mgmt ${model.mgmtFee}`} />
          <FeePill label={`Incentive ${model.incentiveFee}`} accent />
          {open
            ? <ChevronDown size={15} strokeWidth={2} className="text-secondary" />
            : <ChevronRight size={15} strokeWidth={2} className="text-secondary" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-outline-variant">
          <div className="flex items-center justify-between px-4 pb-2 pt-2.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Transaction history</span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
              <Bell size={11} strokeWidth={1.75} />
              PM notified on net size change
            </span>
          </div>
          <TxnTable rows={model.rows} />
          <div className="flex gap-2.5 border-t border-outline-variant px-4 py-3">
            <Button icon={Plus} onClick={() => onOpenModal({ mode: "add-allotment", context })}>Add allotment</Button>
            <Button variant="secondary" icon={ArrowDownToLine} onClick={() => onOpenModal({ mode: "redemption", context })}>Add redemption</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientAccordionItem({
  client,
  open,
  onToggle,
  onOpenModal,
  initialOpenModelKey,
}: {
  client: SubClient;
  open: boolean;
  onToggle: () => void;
  onOpenModal: OpenSubscriptionModal;
  initialOpenModelKey?: string;
}) {
  const [openModels, setOpenModels] = useState<Record<string, boolean>>(() =>
    initialOpenModelKey ? { [initialOpenModelKey]: true } : {},
  );
  const toggleModel = (key: string) => setOpenModels((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          "flex w-full items-center gap-3.5 px-5 py-4 transition-colors duration-150",
          open ? "bg-surface-low" : "bg-white hover:bg-surface-container",
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-bold tracking-[0.02em] text-white">
          {client.initials}
        </span>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[15px] font-semibold text-on-surface">{client.name}</div>
          <div className="mt-0.5 text-[13px] text-secondary">
            {client.mandate} · {client.aum} · {client.models.length} model{client.models.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {open
            ? <ChevronUp size={18} strokeWidth={2} className="text-secondary" />
            : <ChevronDown size={18} strokeWidth={2} className="text-secondary" />}
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-outline-variant px-5 pb-4 pt-3.5">
          {client.models.map((model, mi) => {
            const key = `${client.id}-${mi}`;
            return (
              <ModelAccordionItem
                key={key}
                client={client}
                model={model}
                open={!!openModels[key]}
                onToggle={() => toggleModel(key)}
                onOpenModal={onOpenModal}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function SubscriptionAccordion({
  clients,
  onOpenModal,
  onClientOpen,
  initialOpenClient,
  initialOpenModelKey,
}: {
  clients: SubClient[];                          // NEW — live data, was a direct mock import
  onOpenModal: OpenSubscriptionModal;
  onClientOpen?: (clientId: string) => void;      // NEW
  initialOpenClient?: string;
  initialOpenModelKey?: string;
}) {
  const [openClient, setOpenClient] = useState<string | null>(initialOpenClient ?? null);
  const toggle = (id: string) => {
    const next = openClient === id ? null : id;
    setOpenClient(next);
    if (next) onClientOpen?.(next);   // fire on open, not on close
  };
  return (
    <div className="flex flex-col gap-3">
      {clients.map((client) => (
        <ClientAccordionItem
          key={client.id}
          client={client}
          open={openClient === client.id}
          onToggle={() => toggle(client.id)}
          onOpenModal={onOpenModal}
          initialOpenModelKey={client.id === openClient ? initialOpenModelKey : undefined}
        />
      ))}
    </div>
  );
}
