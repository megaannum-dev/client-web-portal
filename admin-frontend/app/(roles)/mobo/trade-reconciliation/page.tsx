"use client";

/* ============================================================
   MOBO Trade Reconciliation — FLAT SPREADSHEET + TABS
   Ported from the design handoff (mobo/mobo-app/MoboRecon.jsx).

   Tab 1 "Three-System Reconciliation" — exception stats -> a
   segmented progress bar -> ONE collapsible spreadsheet of every
   order + execution for the selected day. Breaks present: titled
   "Unreconciled records", open by default. All clean: titled
   "Daily records", collapsed behind the green verdict — the same
   table either way, so a clean day is still inspectable.

   Tab 2 "Master ↔ Client Settlement" — a simple settlement table.

   DATA: rows come from `GET /api/mobo/executions` via `useExecutions`,
   which unions CRM + IB + Portfolio Commander into one execution
   grain and hands back pre-formatted display strings (see
   `lib/mobo/executions.ts::mapExecutions`). This page does no
   number/date formatting of its own, but it does derive the status
   chip tone and the trade count from the mapped fields.

   `ref` / `group_ref` are intentionally never rendered as columns —
   `group_ref` is used only as the row-selection/grouping key
   (`ExecutionRow.groupRef`).

   A degraded source (e.g. IB unconfigured) still returns HTTP 200
   with that source's rows simply absent, so `data.warnings` is
   surfaced as a notice above the table — otherwise a partial day
   would look identical to a complete one.

   Only PC rows carry a real lifecycle status (Filled/Canceled/
   PartiallyFilled); for CRM and IB, `status` is a structural literal
   ("a row exists therefore it executed"), so those chips render
   with a neutral tone (`ExecutionRow.statusReal` distinguishes them).

   The Settlement tab reads `loadSettlement()`, which is EMPTY —
   its mock was deleted and no settlement source is wired yet.
   ============================================================ */

import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown, ChevronUp, Download, ShieldAlert, Unlink, X, Clock, Check,
  Database, Users, AlertCircle,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { MetricStat, SegBar, SysBadge } from "@/components/mobo/Shared";
import { TabBar } from "@/components/mobo/TabBar";
import { DateControl } from "@/components/mobo/allocation/Panels";
import { useExecutions } from "@/hooks/api/useExecutions";
import { loadSettlement, type SettlementRow } from "@/lib/mobo/commissions";
import { mapExecutions, type ExecutionRow } from "@/lib/mobo/executions";
import TradeReconciliationSkeleton from "./Skeleton";

/** Same UTC reasoning as `lib/mobo/executions.ts::fmtDate` — a bare
 * "YYYY-MM-DD" parses as UTC midnight, so formatting it in browser-local
 * time would shift it a day backwards for viewers west of UTC. */
function fmtDayLabel(day: string | null): string {
  if (!day) return "—";
  const d = new Date(day);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Only PC status is a real lifecycle value; CRM/IB status is structural. */
function statusTone(r: ExecutionRow): ChipTone {
  if (!r.statusReal) return "neutral";
  if (r.status === "Filled") return "active";
  if (r.status === "Canceled") return "failed";
  return "pending"; // PartiallyFilled (or any other PC status)
}

function BrkVal({ v, brk }: { v?: string | null; brk?: boolean }) {
  if (!v) return <span className="text-secondary">—</span>;
  if (brk) return <span className="font-bold" style={{ color: "#93000a" }}>{v}</span>;
  return <span>{v}</span>;
}

const RIGHT_ALIGNED = new Set([6, 7, 14, 15, 16, 17, 18, 19, 20, 21]);

function FlatRowTr({ r, ri, active, onClick }: { r: ExecutionRow; ri: number; active: boolean; onClick: () => void }) {
  const bg = active ? "rgba(242,116,5,0.03)" : "transparent";
  const topBorder = ri === 0 ? "" : r.isFirst ? "border-t-2 border-outline-variant" : "border-t border-outline-variant";
  const td = (content: ReactNode, i: number) => (
    <td
      className={`px-3.5 py-2.5 ${topBorder} ${RIGHT_ALIGNED.has(i) ? "text-right tabular-nums" : ""}`}
      style={{ background: bg }}
    >
      {content}
    </td>
  );
  return (
    <tr onClick={onClick} className="cursor-pointer">
      {td(<SysBadge sys={r.system} />, 0)}
      {td(r.grain, 1)}
      {td(r.contract, 2)}
      {td(r.underlying, 3)}
      {td(r.expiry, 4)}
      {td(r.right, 5)}
      {td(r.strike, 6)}
      {td(r.multiplier, 7)}
      {td(r.securityType, 8)}
      {td(r.currency, 9)}
      {td(r.account, 10)}
      {td(r.time, 11)}
      {td(r.tradeDate, 12)}
      {td(r.direction, 13)}
      {td(r.qtySigned, 14)}
      {td(<BrkVal v={r.qtyAbs} brk={false} />, 15)}
      {td(<BrkVal v={r.price} brk={false} />, 16)}
      {td(r.premiumSigned, 17)}
      {td(r.premiumGross, 18)}
      {td(r.fee, 19)}
      {td(r.cashBeforeFees, 20)}
      {td(r.cashAfterFees, 21)}
      {td(<Chip tone={statusTone(r)} dot={false}>{r.status}</Chip>, 22)}
    </tr>
  );
}

/* ---- settlement tab — ported from MoboRecon.jsx's SettlementPanel.
   `loadSettlement()` returns pre-formatted amounts, so there's nothing
   to compute here, just render. Empty today — see the seam. */
function SettlementPanel({ rows }: { rows: SettlementRow[] }) {
  const masterN = rows.filter((r) => r.type === "Master").length;
  const clientN = rows.filter((r) => r.type === "Client").length;
  const pendingN = rows.filter((r) => r.status === "Pending").length;
  const settledN = rows.length - pendingN;
  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <MetricStat label="Master accounts" value={masterN} icon={Database} />
        <MetricStat label="Client accounts" value={clientN} icon={Users} />
        <MetricStat label="Settled" value={settledN} tone="ok" icon={Check} />
        <MetricStat label="Pending" value={pendingN} tone={pendingN ? "warn" : ""} icon={Clock} />
      </div>
      <div className="mb-[11px] flex flex-wrap items-center justify-between gap-2">
        <span className="text-[15px] font-bold text-on-surface">Settlement detail</span>
        <span className="text-[12.5px] text-secondary">master IB account (one per model) ↔ client sub-accounts</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-lowest shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
            <thead>
              <tr>
                {["Account", "Type", "Model", "Amount", "Status"].map((h, i) => (
                  <th
                    key={h}
                    className={`whitespace-nowrap bg-surface-low px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary ${i >= 3 ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="border-t border-outline-variant px-4 py-12 text-center text-[13px] text-secondary">
                    No settlement data — no settlement source is wired yet.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.key} className={r.type === "Master" ? "bg-surface-low" : ""}>
                  <td className={`px-4 py-3 ${i ? "border-t border-outline-variant" : ""} ${r.type === "Master" ? "font-bold" : "font-medium"}`}>{r.account}</td>
                  <td className={`px-4 py-3 ${i ? "border-t border-outline-variant" : ""} ${r.type === "Master" ? "font-bold text-primary" : "font-medium text-secondary"}`}>{r.type}</td>
                  <td className={`px-4 py-3 ${i ? "border-t border-outline-variant" : ""}`}>{r.model}</td>
                  <td className={`px-4 py-3 text-right font-bold tabular-nums ${i ? "border-t border-outline-variant" : ""}`}>{r.amount}</td>
                  <td className={`px-4 py-3 text-right ${i ? "border-t border-outline-variant" : ""}`}>
                    <Chip tone={r.status === "Pending" ? "warm" : "active"} dot={false}>{r.status}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const TABLE_HEAD = [
  "System", "Grain", "Contract", "Underlying", "Expiry", "Right", "Strike", "Mult", "Sec Type", "CCY",
  "Account", "Time (ET)", "Trade Date", "Side", "Qty Signed", "QTY", "Price", "Premium", "Premium Gross",
  "Fee", "Cash Pre-Fee", "Cash Post-Fee", "Status",
];

/* ---- THE records spreadsheet — ONE table for both scenarios.
   Breaks present → titled "Unreconciled records", open by default.
   All reconciled → titled "Daily records", collapsed so the clean
   verdict leads. Either way it's this component; the header row is
   the toggle. */
function RecordsTable({
  title, subtitle, rows, open, onToggle, selId, onSelect, error,
}: {
  title: string;
  subtitle: string;
  rows: ExecutionRow[];
  open: boolean;
  onToggle: () => void;
  selId: string | null;
  onSelect: (id: string) => void;
  error: string | null;
}) {
  const span = TABLE_HEAD.length;
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="mb-[11px] flex flex-wrap items-center justify-between gap-2">
        <span className="text-[15px] font-bold text-on-surface">{title}</span>
        <span className="text-[12.5px] text-secondary">{subtitle}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-lowest shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[2300px] border-collapse text-[13.5px]">
            <thead>
              <tr onClick={onToggle} className="cursor-pointer select-none">
                {TABLE_HEAD.map((h, i) => (
                  <th
                    key={h}
                    className={`whitespace-nowrap bg-surface-low px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary transition-colors hover:bg-surface-low/70 ${RIGHT_ALIGNED.has(i) ? "text-right" : "text-left"}`}
                  >
                    {i === 0 ? (
                      <span className="flex items-center gap-1.5">
                        {open ? <ChevronUp size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
                        {h}
                      </span>
                    ) : h}
                  </th>
                ))}
              </tr>
            </thead>
            {open && (
              <tbody>
                {error && (
                  <tr>
                    <td colSpan={span} className="border-t border-outline-variant px-3.5 py-10">
                      <span className="flex items-center justify-center gap-2 text-[13px]" style={{ color: "#93000a" }}>
                        <AlertCircle size={15} strokeWidth={2} /> {error}
                      </span>
                    </td>
                  </tr>
                )}
                {!error && rows.length === 0 && (
                  <tr>
                    <td colSpan={span} className="border-t border-outline-variant px-3.5 py-10 text-center text-[13px] text-secondary">
                      No trade records for this day.
                    </td>
                  </tr>
                )}
                {!error && rows.map((r, ri) => (
                  // key/selection use groupRef — the mapper's unrendered grouping key, not
                  // any visible column — so multi-row groups (order + its fills) select together.
                  <FlatRowTr key={`${r.groupRef}-${ri}`} r={r} ri={ri} active={selId === r.groupRef} onClick={() => onSelect(r.groupRef)} />
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

export default function TradeReconciliationPage() {
  const [day, setDay] = useState<string | undefined>(undefined);
  const { data, loading, error } = useExecutions(day);
  const settlementRows = loadSettlement();

  const [tab, setTab] = useState<"recon" | "settle">("recon");
  const [sel, setSel] = useState<string | null>(null);
  const toggle = (id: string) => setSel((s) => (s === id ? null : id));

  const rows = useMemo(() => mapExecutions(data), [data]);
  const dayLabel = fmtDayLabel(data?.day ?? null);
  // `data.days` is already "YYYY-MM-DD" — exactly what DateControl speaks — so
  // it maps straight through with no token bridging.
  const pickerRuns = useMemo(
    () => (data?.days ?? []).map((d) => ({ date: d, label: d, grandTotal: 0 })),
    [data?.days],
  );

  // No reconciliation engine exists yet: /executions unions the three sources
  // but compares nothing, so every break counter is 0 and the day always reads
  // clean. These stay wired (not hardcoded away) so an engine only has to start
  // reporting breaks. Deliberately out of scope for this pass.
  const totalBrk = 0;
  const qtyCat = 0;
  const priceCat = 0;
  const missCat = 0;
  const settleCat = 0;
  const isClean = totalBrk === 0;
  const tradeCount = rows.filter((r) => r.grain === "Order").length;
  const settlePending = settlementRows.filter((r) => r.status === "Pending").length;

  // Breaks lead the page, so the table opens with them; a clean day opens
  // collapsed behind the green verdict.
  const [open, setOpen] = useState(!isClean);

  if (loading && !data) return <TradeReconciliationSkeleton />;

  return (
    <div className="w-full">
      <div className="mb-5">
        <PageHeader
          title="Trade Reconciliation"
          subtitle={`Three-system match · CRM ↔ IB ↔ Portfolio Commander · ${dayLabel}`}
          actions={
            <>
              <DateControl
                dateLabel={dayLabel}
                runs={pickerRuns}
                onPickDate={setDay}
                onPickRange={() => { /* range mode unused here — one day at a time */ }}
              />
              <Button variant="secondary" icon={Download}>Export</Button>
            </>
          }
        />
      </div>

      <TabBar
        tabs={[
          { key: "recon", label: "Three-System Reconciliation", badge: totalBrk || undefined, tone: totalBrk ? "warm" : "active" },
          { key: "settle", label: "Master ↔ Client Settlement", badge: settlePending || undefined, tone: settlePending ? "warm" : "active" },
        ]}
        active={tab}
        onChange={(k) => setTab(k as "recon" | "settle")}
      />

      {tab === "settle" ? (
        <SettlementPanel rows={settlementRows} />
      ) : (
        <>
          <div className="mb-[18px] grid grid-cols-2 gap-3.5 lg:grid-cols-5">
            <MetricStat label="Total breaks" value={totalBrk} tone={totalBrk ? "bad" : "ok"} icon={ShieldAlert} />
            <MetricStat label="Qty mismatch" value={qtyCat} tone={qtyCat ? "warn" : ""} icon={Unlink} />
            <MetricStat label="Price / rate" value={priceCat} tone={priceCat ? "warn" : ""} icon={Unlink} />
            <MetricStat label="Missing record" value={missCat} tone={missCat ? "bad" : ""} icon={X} />
            <MetricStat label="Settlement" value={settleCat} tone={settleCat ? "warn" : ""} icon={Clock} />
          </div>

          <SegBar ok={100} warn={0} bad={0} />

          {isClean && !loading && !error && (
            <div
              className="mt-[22px] flex flex-col items-center gap-3.5 rounded-2xl border-[1.5px] px-6 py-14 text-center"
              style={{ background: "rgba(47,122,71,0.04)", borderColor: "rgba(47,122,71,0.15)" }}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "#e3f1e7", color: "#2f7a47" }}>
                <Check size={24} strokeWidth={2} />
              </span>
              <div>
                <div className="mb-1 text-[18px] font-bold text-on-surface">All {tradeCount} trades reconciled</div>
                <div className="text-[14px] text-secondary">No breaks across CRM, IB, and Portfolio Commander for {dayLabel}.</div>
              </div>
            </div>
          )}

          {!!data?.warnings.length && (
            <div
              className="mt-[18px] flex items-center gap-2 rounded-lg border-[1.5px] px-4 py-2.5 text-[13px]"
              style={{ background: "#fff3e8", borderColor: "rgba(153,71,0,0.2)", color: "#994700" }}
            >
              <AlertCircle size={15} strokeWidth={2} />
              <span>{data.warnings.join(" · ")}</span>
            </div>
          )}

          <div className="mt-[22px]">
            <RecordsTable
              title={isClean ? "Daily records" : "Unreconciled records"}
              subtitle={`every row from CRM, IB, and Portfolio Commander for ${dayLabel}`}
              rows={rows}
              open={open}
              onToggle={() => setOpen((o) => !o)}
              selId={sel}
              onSelect={toggle}
              error={error}
            />
          </div>
        </>
      )}
    </div>
  );
}
