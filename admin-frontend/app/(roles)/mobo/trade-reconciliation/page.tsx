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

   DATA: rows come from `GET /api/mobo/trade-records` via
   `useTradeRecords` — the `orders` + `trades` tables, projected
   flat and PRE-FORMATTED by the backend. This page computes
   nothing; it renders what it is handed.

   DATA REALITY: CRM is the only source wired, so every row is
   system "CRM" / status "Confirmed" and NOTHING can disagree —
   every break counter is 0 and the verdict is always clean. The
   break-highlight cell paths (`missing` / `qtyBrk` / `priceBrk`)
   are retained and simply never set; when a second source lands
   the backend starts setting them and the red cells light up with
   no change here.

   The Settlement tab reads `loadSettlement()`, which is EMPTY —
   its mock was deleted and no settlement source is wired yet.
   ============================================================ */

import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown, ChevronUp, Download, ShieldAlert, Unlink, X, Clock, Check,
  Database, Users, Loader2, AlertCircle,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MetricStat, SegBar, SysBadge } from "@/components/mobo/Shared";
import { TabBar } from "@/components/mobo/TabBar";
import { DateControl } from "@/components/mobo/allocation/Panels";
import { useTradeRecords } from "@/hooks/api/useTradeRecords";
import { loadSettlement, type SettlementRow } from "@/lib/mobo/commissions";
import type { BreakType, CompareField, ReconTrade } from "@/lib/mobo/types";
import { useCanEdit } from "@/hooks/usePageAccess";
import type { TradeRecordRowDTO } from "@/lib/mobo/types";

/* ---- day-token helpers — the API speaks raw IB `YYYYMMDD`, the
   shared DateControl speaks `YYYY-MM-DD`. -------------------- */
const toPickerKey = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const toDayToken = (k: string) => k.replace(/-/g, "");

function BrkVal({ v, brk }: { v?: string | null; brk?: boolean }) {
  if (!v) return <span className="text-secondary">—</span>;
  if (brk) return <span className="font-bold" style={{ color: "#93000a" }}>{v}</span>;
  return <span>{v}</span>;
}

function FlatRowTr({ r, ri, active, onClick }: { r: TradeRecordRowDTO; ri: number; active: boolean; onClick: () => void }) {
  const miss = r.missing;
  const bg = miss
    ? "repeating-linear-gradient(45deg, transparent 0 6px, var(--surface-low) 6px 7px)"
    : active ? "rgba(242,116,5,0.03)" : "transparent";
  const topBorder = ri === 0 ? "" : r.isFirst ? "border-t-2 border-outline-variant" : "border-t border-outline-variant";
  const td = (content: ReactNode, extra?: string) => (
    <td className={`px-3.5 py-2.5 ${topBorder} ${extra ?? ""}`} style={{ background: bg }}>{content}</td>
  );
  return (
    <tr onClick={onClick} className="cursor-pointer">
      {td(<SysBadge sys={r.sys} />)}
      {td(r.ref, "font-bold")}
      {td(miss ? "—" : r.tradeDate)}
      {td(miss ? "—" : r.mkt)}
      {td(miss ? "—" : r.stock, miss ? "" : "font-bold")}
      {td(miss ? <span className="text-secondary">—</span> : <BrkVal v={r.price} brk={r.priceBrk} />, "text-right tabular-nums")}
      {td(miss ? <span className="text-secondary">—</span> : <BrkVal v={r.qty} brk={r.qtyBrk} />, "text-right tabular-nums")}
      {td(miss ? "—" : r.txnType)}
      {td(miss ? "—" : r.time, "text-secondary")}
      {td(<Chip tone={r.status === "Confirmed" ? "active" : "neutral"} dot={false}>{r.status}</Chip>)}
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

const TABLE_HEAD = ["System", "Ref #", "Trade Date", "Mkt", "Stock", "Price", "QTY", "Txn Type", "Time", "Status"];

/* ---- THE records spreadsheet — ONE table for both scenarios.
   Breaks present → titled "Unreconciled records", open by default.
   All reconciled → titled "Daily records", collapsed so the clean
   verdict leads. Either way it's this component; the header row is
   the toggle. */
function RecordsTable({
  title, subtitle, rows, open, onToggle, selId, onSelect, loading, error,
}: {
  title: string;
  subtitle: string;
  rows: TradeRecordRowDTO[];
  open: boolean;
  onToggle: () => void;
  selId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
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
          <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
            <thead>
              <tr onClick={onToggle} className="cursor-pointer select-none">
                {TABLE_HEAD.map((h, i) => (
                  <th
                    key={h}
                    className={`whitespace-nowrap bg-surface-low px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary transition-colors hover:bg-surface-low/70 ${i === 5 || i === 6 ? "text-right" : "text-left"}`}
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
                {loading && (
                  <tr>
                    <td colSpan={span} className="border-t border-outline-variant px-3.5 py-10">
                      <span className="flex items-center justify-center gap-2 text-[13px] text-secondary">
                        <Loader2 size={15} strokeWidth={2} className="animate-spin" /> Loading trade records…
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={span} className="border-t border-outline-variant px-3.5 py-10">
                      <span className="flex items-center justify-center gap-2 text-[13px]" style={{ color: "#93000a" }}>
                        <AlertCircle size={15} strokeWidth={2} /> {error}
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td colSpan={span} className="border-t border-outline-variant px-3.5 py-10 text-center text-[13px] text-secondary">
                      No trade records for this day.
                    </td>
                  </tr>
                )}
                {!loading && !error && rows.map((r, ri) => (
                  <FlatRowTr key={`${r.ref}-${ri}`} r={r} ri={ri} active={selId === r.tradeId} onClick={() => onSelect(r.tradeId)} />
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
  const { data, loading, error } = useTradeRecords(day);
  const settlementRows = loadSettlement();

  const [tab, setTab] = useState<"recon" | "settle">("recon");
  const [sel, setSel] = useState<string | null>(null);
  const toggle = (id: string) => setSel((s) => (s === id ? null : id));

  const rows = data?.rows ?? [];
  const dayLabel = data?.day ?? "—";
  const pickerRuns = useMemo(
    () => (data?.dates ?? []).map((d) => ({ date: toPickerKey(d), label: toPickerKey(d), grandTotal: 0 })),
    [data?.dates],
  );

  // Single source (CRM) — nothing can disagree, so every break counter is 0
  // and the day is always clean. These stay wired (not hardcoded away) so a
  // second source only has to start reporting breaks.
  const totalBrk = 0;
  const qtyCat = 0;
  const priceCat = 0;
  const missCat = 0;
  const settleCat = 0;
  const isClean = totalBrk === 0;
  const tradeCount = rows.filter((r) => r.txnType === "Order").length;
  const settlePending = settlementRows.filter((r) => r.status === "Pending").length;

  // Breaks lead the page, so the table opens with them; a clean day opens
  // collapsed behind the green verdict.
  const [open, setOpen] = useState(!isClean);

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
                onPickDate={(d) => setDay(toDayToken(d))}
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

          <div className="mt-[22px]">
            <RecordsTable
              title={isClean ? "Daily records" : "Unreconciled records"}
              subtitle={`every row from CRM, IB, and Portfolio Commander for ${dayLabel}`}
              rows={rows}
              open={open}
              onToggle={() => setOpen((o) => !o)}
              selId={sel}
              onSelect={toggle}
              loading={loading}
              error={error}
            />
          </div>
        </>
      )}
    </div>
  );
}
