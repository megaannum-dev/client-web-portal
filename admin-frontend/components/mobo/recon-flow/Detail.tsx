"use client";

/* ============================================================
   MOBO — Trade Reconciliation FLOW VIEW side detail panel
   FlowDetail (order | alloc | port) · DHeader · BreakBanner ·
   KVTable · DetailActions · OrderDetail · AllocDetail · PortDetail
   Ported from the design handoff (mobo/mobo-app/MoboRecon.jsx).
   ============================================================ */

import type { LucideIcon } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/mobo/Shared";
import { FG, MPill, SDot, modelName } from "./shared";
import { X, Check, UserRound, ShieldAlert, ArrowUpRight, RefreshCw } from "@/lib/icons";
import {
  fmtUsd,
  pctOf,
  type RcOrder,
  type RcAlloc,
  type RcPort,
  type FlowState,
} from "@/lib/mobo/flow-types";

const RED = "#b1402f";

/* ---- detail panel ------------------------------------------- */
type FlowDetailProps =
  | { type: "order"; item: RcOrder; onClose: () => void }
  | { type: "alloc"; item: RcAlloc; onClose: () => void }
  | { type: "port"; item: RcPort; onClose: () => void }
  | { type: null; item: null; onClose: () => void };

export function FlowDetail({ item, type, onClose }: FlowDetailProps) {
  if (!item) return null;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[14px] border border-outline-variant bg-surface-lowest px-5 py-[18px] shadow-card">
      {type === "order" && <OrderDetail o={item} onClose={onClose} />}
      {type === "alloc" && <AllocDetail a={item} onClose={onClose} />}
      {type === "port" && <PortDetail p={item} onClose={onClose} />}
    </div>
  );
}

/* ---- shared header / banner / table / actions ---------------- */
function DHeader({
  title, sub, st, onClose,
}: {
  title: string;
  sub: string;
  st: FlowState;
  onClose: () => void;
}) {
  const g = FG[st];
  return (
    <div className="mb-3.5 flex flex-none items-start justify-between gap-2.5">
      <div className="min-w-0">
        <div className="text-[16px] font-bold leading-[1.3] text-on-surface">{title}</div>
        <div className="mt-[3px] text-[12.5px] text-secondary">{sub}</div>
      </div>
      <div className="flex flex-none items-center gap-[7px]">
        <Chip tone={g.tone} dot={false}>{g.label}</Chip>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex rounded-[6px] p-[3px] text-secondary transition-colors hover:bg-surface-container"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function BreakBanner({ st, text }: { st: FlowState; text: string }) {
  const g = FG[st];
  return (
    <div className="mb-3.5 flex flex-none items-center gap-2 rounded px-3 py-2" style={{ background: g.bg }}>
      <SDot st={st} size={20} />
      <span className="text-[12.5px] font-semibold" style={{ color: g.fg }}>{text}</span>
    </div>
  );
}

function KVTable({ rows }: { rows: Array<[string, string, string?]> }) {
  return (
    <div className="mb-4 overflow-hidden rounded-[10px] border border-outline-variant">
      {rows.map(([k, v, tone], i) => (
        <div
          key={k}
          className={`flex justify-between px-3 py-2 text-[13px] ${i ? "border-t border-outline-variant" : ""}`}
        >
          <span className="font-semibold text-secondary">{k}</span>
          <span
            className={`font-semibold tabular-nums ${tone ? "" : "text-on-surface"}`}
            style={tone ? { color: tone } : undefined}
          >
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

function DetailActions({
  ok, okText, actions,
}: {
  ok: boolean;
  okText: string;
  actions: Array<{ label: string; icon: LucideIcon; primary?: boolean }>;
}) {
  return (
    <div className="mt-3.5 flex-none border-t border-outline-variant pt-3.5">
      {ok ? (
        <div className="flex items-center gap-[7px] text-[12.5px] text-secondary">
          <Check size={15} strokeWidth={2} color="#16a34a" /> {okText}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((a, i) => (
            <Button key={i} variant={a.primary ? undefined : "secondary"} icon={a.icon} className="flex-1 px-2.5 py-2">
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- order detail --------------------------------------------- */
function OrderDetail({ o, onClose }: { o: RcOrder; onClose: () => void }) {
  const isBrk = o.st !== "ok";
  /* compute IB filled totals from executions */
  const filledQty = isBrk ? o.execs.reduce((s, ex) => s + parseInt(String(ex.qty).replace(/[^0-9]/g, ""), 10), 0) : 0;
  const filledQtyStr = isBrk ? filledQty.toLocaleString("en-US") : null;
  const orderedQty = isBrk ? parseInt(String(o.qty).replace(/[^0-9]/g, ""), 10) : 0;
  const missingQty = orderedQty - filledQty;

  const summaryRows: Array<[string, string, string?]> = [
    ["Model", modelName(o.m)],
    ["Category", o.cat],
    ["Symbol", o.inst],
    ["Side", o.side],
    ["Quantity", isBrk ? `${o.qty} ordered → ${filledQtyStr} filled` : o.qty, isBrk ? RED : undefined],
    ["Price", o.px],
    [
      "Notional",
      isBrk
        ? `${o.not} ordered → ${fmtUsd(o.notVal - missingQty * parseFloat(String(o.px).replace(/[^0-9.]/g, "")))} filled`
        : o.not,
      isBrk ? RED : undefined,
    ],
  ];

  return (
    <>
      <DHeader
        title={`${o.inst} · ${o.side}`}
        sub={`${o.ref} → ${o.ib || "no IB"} · ${modelName(o.m)}`}
        st={o.st}
        onClose={onClose}
      />
      {isBrk && o.brk && <BreakBanner st={o.st} text={o.brk} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Eyebrow>Order summary</Eyebrow>
        <KVTable rows={summaryRows} />
        {o.execs.length > 0 && (
          <>
            <Eyebrow>
              Executions · {o.execs.length}
              {isBrk && missingQty > 0 ? ` of ${o.execs.length + 1} expected` : ""}
            </Eyebrow>
            <div className="flex flex-col gap-1.5">
              {o.execs.map((ex, i) => (
                <div
                  key={ex.id}
                  className="flex items-center gap-2 rounded border border-outline-variant px-3 py-2"
                  /* ponytail: RcExec.st is FlowState ("ok"|"brk") only — the prototype's
                     third "miss" tint is unreachable with this data model, so it collapses
                     to a plain ok/break tint. */
                  style={{ background: ex.st === "ok" ? "transparent" : "rgba(242,116,5,0.04)" }}
                >
                  <SDot st={ex.st} size={18} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-bold tabular-nums text-on-surface">Exec {i + 1}</div>
                    <div className="mt-0.5 flex gap-3 text-[11.5px] tabular-nums text-on-surface">
                      <span><span className="font-semibold text-secondary">Qty</span> {ex.qty}</span>
                      <span><span className="font-semibold text-secondary">Px</span> {ex.px}</span>
                    </div>
                    <div className="text-[11px] tabular-nums text-secondary">{ex.t}</div>
                  </div>
                  <Chip tone={FG[ex.st].tone} dot={false}>{FG[ex.st].label}</Chip>
                </div>
              ))}
              {isBrk && missingQty > 0 && (
                <div
                  className="flex items-center gap-2 rounded px-3 py-2"
                  style={{ border: `1.5px dashed ${RED}`, background: "rgba(186,26,26,0.04)" }}
                >
                  <SDot st="brk" size={18} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-bold tabular-nums" style={{ color: RED }}>
                      Exec {o.execs.length + 1} — missing
                    </div>
                    <div className="mt-0.5 text-[11.5px] tabular-nums" style={{ color: RED }}>
                      {missingQty.toLocaleString("en-US")} shares unconfirmed by IB
                    </div>
                  </div>
                  <Chip tone="failed" dot={false}>Missing</Chip>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <DetailActions
        ok={o.st === "ok"}
        okText="All executions matched."
        actions={[
          { label: "Assign", icon: UserRound },
          { label: "Raise", icon: ShieldAlert, primary: true },
        ]}
      />
    </>
  );
}

/* ---- allocation detail ------------------------------------- */
function AllocDetail({ a, onClose }: { a: RcAlloc; onClose: () => void }) {
  return (
    <>
      <DHeader
        title={a.client}
        sub={`IB allocation · ${a.models.length} model${a.models.length > 1 ? "s" : ""}`}
        st={a.st}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Eyebrow>Model allocations</Eyebrow>
        <div className="mb-4 flex flex-col gap-2">
          {a.models.map((ma) => {
            const mg = FG[ma.st];
            return (
              <div
                key={ma.m}
                className="rounded-[10px] border border-outline-variant px-3.5 py-2.5"
                style={{ background: ma.st !== "ok" ? mg.bg : "transparent" }}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <MPill mid={ma.m} />
                  <Chip tone={mg.tone} dot={false}>{mg.label}</Chip>
                </div>
                <div className="mt-1 flex justify-between text-[13px]">
                  <span className="text-secondary">Units subscribed</span>
                  <span className="font-bold text-on-surface">{ma.units}×</span>
                </div>
                <div className="mt-0.5 flex justify-between text-[13px]">
                  <span className="text-secondary">Allocated</span>
                  <span className="font-bold tabular-nums text-on-surface">{ma.amt}</span>
                </div>
                {ma.note && (
                  <div className="mt-1.5 text-[11.5px] font-semibold" style={{ color: mg.fg }}>
                    {ma.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="rounded-[10px] border border-outline-variant px-3.5 py-2.5">
          <div className="flex justify-between text-[14px]">
            <span className="font-bold text-on-surface">Total allocated</span>
            <span className="font-bold tabular-nums text-on-surface">{a.total}</span>
          </div>
        </div>
      </div>
      <DetailActions
        ok={a.st === "ok"}
        okText="Allocation verified."
        actions={[
          { label: "Escalate", icon: ArrowUpRight },
          { label: "Raise", icon: ShieldAlert, primary: true },
        ]}
      />
    </>
  );
}

/* ---- portfolio detail ------------------------------------- */
function PortDetail({ p, onClose }: { p: RcPort; onClose: () => void }) {
  const cc = p.chg.startsWith("+") ? "#2f7a47" : p.chg.startsWith("-") ? RED : "var(--secondary)";
  return (
    <>
      <DHeader title={p.client} sub="Post-trade portfolio · CRM" st={p.st} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Eyebrow>AUM change</Eyebrow>
        <KVTable
          rows={[
            ["Pre-trade AUM", p.pre],
            ["Post-trade AUM", p.post],
            ["Change", p.chg, cc],
            ["Change %", p.pct, cc],
          ]}
        />
        <Eyebrow>Portfolio status</Eyebrow>
        <KVTable
          rows={[
            ["Amount in Trade", `${fmtUsd(p.inTrade)}  ·  ${pctOf(p.inTrade, p.total)}`],
            ["Cash Deposit", `${fmtUsd(p.cash)}  ·  ${pctOf(p.cash, p.total)}`],
            ["Total Amount", fmtUsd(p.total)],
          ]}
        />
      </div>
      <DetailActions
        ok={p.st === "ok"}
        okText="Portfolio updated correctly."
        actions={[
          { label: "Re-sync", icon: RefreshCw },
          { label: "Raise", icon: ShieldAlert, primary: true },
        ]}
      />
    </>
  );
}
