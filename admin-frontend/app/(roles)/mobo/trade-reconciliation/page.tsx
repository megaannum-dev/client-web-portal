"use client";

/* ============================================================
   MOBO Trade Reconciliation — FLAT SPREADSHEET + TABS
   Replaces the old 3-row flow-card view. Ported from the design
   handoff (mobo/mobo-app/MoboRecon.jsx).

   Tab 1 "Three-System Reconciliation" — exception stats -> a
   segmented progress bar -> a flat table of every row from the
   three systems (CRM / IB / Portfolio Commander) for each broken
   trade. Click a group -> a slide-in triage panel with both legs.

   Tab 2 "Master ↔ Client Settlement" — a simple settlement table.

   DATA SEAM: this page reads `loadReconciliation()` (lib/mobo/
   reconciliation.ts) and `loadSettlement()` (lib/mobo/commissions.ts)
   — the SAME providers recon-overview/commission-tracking use. No
   backend calls, no mock imports here.

   THREE-SYSTEM MAPPING (prototype's CRM/IB/PC rows -> this
   codebase's ti/ic leg model — see lib/mobo/types.ts's DATA
   REALITY note):
     - CRM row = the `ti` leg's trader ("iv") side, keyed by
       `trade.trader` — always null today (no trader feed), so
       this row is always "Missing". Expected, not a bug.
     - IB row  = the `ti` leg's stored-IB ("cv") side, keyed by
       `trade.ib` (populated). Also reads break flags off the `ic`
       leg's fields — a field can break on either leg and still
       show red on the IB row.
     - PC row  = the `ic` leg's stored-copy ("cv") side, keyed by
       `trade.crm` (null only when the ic leg is `missingDb`).
     - PC execution rows = `trade.ti.execs` (populated stored-IB
       side; the trader side is empty = "awaiting source").
   Order-level `fields` on `ti`/`ic` mostly carry the 4 added
   attribute columns (Settlement date/Currency/Asset class/Trade
   date), not Side/Quantity/Price/Net amount — so the flat table's
   Price/QTY cells legitimately render "—" for most rows today.
   That's the single-source data reality, not a bug.
   ============================================================ */

import { useState, type ReactNode } from "react";
import {
  Calendar, ChevronDown, Download, ShieldAlert, Unlink, X, Clock, Check,
  Database, Users, UserRound, MessageSquare, ArrowUpRight,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { MetricStat, SegBar, CompareGrid, Eyebrow, OrderExecBreakdown, SysBadge } from "@/components/mobo/Shared";
import { TabBar } from "@/components/mobo/TabBar";
import { loadReconciliation } from "@/lib/mobo/reconciliation";
import { loadSettlement, type SettlementRow } from "@/lib/mobo/commissions";
import type { BreakType, CompareField, ReconTrade } from "@/lib/mobo/types";

/* ============================================================
   FLAT ROW MODEL — ported from MoboRecon.jsx's fv/fb/buildRow/
   buildFlatRows/BCAT/countCat/buildGroups. `side`/`amount`/`settle`
   were computed by the prototype but never rendered by its own
   table (System/Ref#/Trade Date/Mkt/Stock/Price/QTY/Txn Type/Time/
   Status) — dropped here rather than ported dead.
   ============================================================ */

function fv(fields: CompareField[], key: string, side: "iv" | "cv"): string | null {
  const f = fields.find((x) => x.k === key);
  return f ? f[side] : null;
}
function fb(fields: CompareField[] | undefined, key: string): boolean {
  const f = (fields ?? []).find((x) => x.k === key);
  return f ? f.d : false;
}

interface FlatSysRow {
  sys: "CRM" | "IB" | "PC";
  ref: string;
  missing: boolean;
  qty?: string | null;
  price?: string | null;
  qtyBrk?: boolean;
  priceBrk?: boolean;
}

function buildRow(
  sys: "CRM" | "IB" | "PC",
  ref: string | null,
  fields: CompareField[],
  side: "iv" | "cv",
  extraFields?: CompareField[],
): FlatSysRow {
  if (!ref) return { sys, ref: "—", missing: true };
  return {
    sys, ref, missing: false,
    qty: fv(fields, "Quantity", side) || fv(fields, "Notional", side),
    price: fv(fields, "Price", side) || fv(fields, "FX rate", side),
    qtyBrk: fb(fields, "Quantity") || fb(fields, "Notional") || !!(extraFields && (fb(extraFields, "Quantity") || fb(extraFields, "Notional"))),
    priceBrk: fb(fields, "Price") || fb(fields, "FX rate") || !!(extraFields && (fb(extraFields, "Price") || fb(extraFields, "FX rate"))),
  };
}

type BreakCat = "qty" | "price" | "miss" | "settle" | "other";
/* NOTE: no "FX rate break" entry — this codebase's BreakType union
   deliberately excludes FX breaks (see lib/mobo/types.ts header). */
const BCAT: Partial<Record<BreakType, BreakCat>> = {
  "Quantity break": "qty",
  "Price break": "price",
  "Net-amount break": "price",
  "Commission break": "price",
  "Settlement mismatch": "settle",
  "Missing — one side only": "miss",
};

function buildGroups(trades: ReconTrade[]): { id: string; cat: BreakCat }[] {
  return trades
    .filter((t) => t.ti.state !== "ok" || t.ic.state !== "ok")
    .map((t) => {
      const bt = t.ti.state !== "ok" ? t.ti.breakType : t.ic.breakType;
      return { id: t.id, cat: (bt && BCAT[bt]) || "other" };
    });
}
function countCat(groups: { cat: BreakCat }[], cat: BreakCat): number {
  return groups.filter((g) => g.cat === cat).length;
}

interface FlatRow extends FlatSysRow {
  tradeId: string;
  stock: string;
  mkt: string;
  tradeDate: string;
  isFirst: boolean;
  time: string;
  txnType: string;
  chipLabel: string;
  chipTone: ChipTone;
}

/** Every row from CRM / IB / Portfolio Commander for each broken trade,
 * flattened (no grouping) — ported from MoboRecon.jsx's `buildFlatRows`. */
function buildFlatRows(trades: ReconTrade[], settleDay: string): FlatRow[] {
  const broken = trades.filter((t) => t.ti.state !== "ok" || t.ic.state !== "ok");
  const rows: FlatRow[] = [];
  broken.forEach((t) => {
    const ip = t.inst.split(" ");
    const stock = ip[0];
    const mkt = ip[1] || "FX";
    // trader is always null today (no trader feed) -> always "—".
    const firstTime = t.ti.execs?.[0]?.trader?.time ?? "—";
    const base = { tradeId: t.id, stock, mkt, tradeDate: settleDay, isFirst: false, time: firstTime };

    const crmRow = buildRow("CRM", t.trader, t.ti.fields, "iv");
    rows.push({
      ...base, ...crmRow, isFirst: true,
      txnType: crmRow.missing ? "—" : "Trade",
      chipLabel: crmRow.missing ? "Missing" : "Confirmed",
      chipTone: crmRow.missing ? "failed" : "active",
    });

    const ibRow = buildRow("IB", t.ib, t.ti.fields, "cv", t.ic.fields);
    rows.push({
      ...base, ...ibRow,
      txnType: ibRow.missing ? "—" : "Trade",
      chipLabel: ibRow.missing ? "Missing" : "Confirmed",
      chipTone: ibRow.missing ? "failed" : "active",
    });

    const pcRow = buildRow("PC", t.crm, t.ic.fields, "cv");
    rows.push({
      ...base, ...pcRow,
      txnType: pcRow.missing ? "—" : "Order",
      chipLabel: pcRow.missing ? "Missing" : "Executed",
      chipTone: pcRow.missing ? "failed" : "active",
    });

    (t.ti.execs ?? []).forEach((ex, i) => {
      const tr = ex.trader;
      const ib = ex.ib;
      const isMiss = ex.state === "miss";
      rows.push({
        ...base,
        sys: "PC",
        ref: ib?.tradeID ?? tr?.tradeID ?? `${t.id}-x${i + 1}`,
        missing: isMiss && !tr,
        qty: tr ? tr.qty : ib ? ib.qty : "—",
        price: tr ? tr.px : ib ? ib.px : "—",
        qtyBrk: isMiss || ex.state === "brk",
        priceBrk: ex.state === "brk",
        time: tr ? tr.time : ib ? ib.time : "—",
        txnType: "Execution",
        chipLabel: isMiss ? "Missing" : "Filled",
        chipTone: isMiss ? "failed" : "active",
      });
    });
  });
  return rows;
}

function BrkVal({ v, brk }: { v?: string | null; brk?: boolean }) {
  if (!v) return <span className="text-secondary">—</span>;
  if (brk) return <span className="font-bold" style={{ color: "#93000a" }}>{v}</span>;
  return <span>{v}</span>;
}

function FlatRowTr({ r, ri, active, onClick }: { r: FlatRow; ri: number; active: boolean; onClick: () => void }) {
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
      {td(<Chip tone={r.chipTone} dot={false}>{r.chipLabel}</Chip>)}
    </tr>
  );
}

/* ---- matched-legs banner (shared by both legs of TradeDetail) --- */
function MatchBanner() {
  return (
    <div
      className="mb-[18px] flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 text-[13px] text-secondary"
      style={{ background: "rgba(47,122,71,0.06)", borderColor: "rgba(47,122,71,0.12)" }}
    >
      <Check size={15} strokeWidth={2} color="#16a34a" /> All fields match.
    </div>
  );
}

/* ---- three-system triage detail panel — ported from MoboRecon.jsx's
   `TradeDetail`. Both legs in ONE panel: "CRM ↔ IB" then "IB ↔ PC",
   one shared header, one shared actions footer. Deviation from the
   prototype's literal JSX: the IB ↔ PC section uses OrderExecBreakdown
   (not just CompareGrid) when the `ic` leg has executions, matching
   how Shared.tsx's own IntegrityDetail renders this exact leg — the
   prototype's simpler mock data never needed to surface an execution-
   level VWAP drift via the order-level fields grid alone, ours does. */
function TradeDetail({ trade, onClose }: { trade: ReconTrade; onClose: () => void }) {
  const bt = (trade.ti.state !== "ok" ? trade.ti.breakType : trade.ic.breakType) ?? "Break";
  const tone: ChipTone = trade.ti.state === "miss" || trade.ic.state === "miss" ? "failed" : "warm";
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest px-5 py-[18px] shadow-card"
      style={{ maxHeight: "calc(100vh - 96px)" }}
    >
      <div className="mb-3.5 flex flex-none items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-[16px] font-bold leading-[1.3] text-on-surface">{trade.inst}</div>
          <div className="mt-[3px] text-[12.5px] text-secondary">
            {trade.book} · CRM {trade.trader || "—"} ↔ IB {trade.ib || "—"} ↔ PC {trade.crm || "—"}
          </div>
        </div>
        <div className="flex flex-none items-center gap-[7px]">
          <Chip tone={tone} dot={false}>{bt}</Chip>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex rounded-md p-[3px] text-secondary transition-colors hover:bg-surface-container"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Eyebrow>CRM ↔ IB</Eyebrow>
        {trade.ti.state === "ok" ? (
          <MatchBanner />
        ) : trade.ti.execs && trade.ti.execs.length > 0 ? (
          <OrderExecBreakdown execs={trade.ti.execs} leftLabel="CRM" rightLabel="IB" />
        ) : (
          <CompareGrid fields={trade.ti.fields} leftLabel="CRM" rightLabel="IB" />
        )}

        <Eyebrow className="mt-1">IB ↔ PC</Eyebrow>
        {trade.ic.state === "ok" ? (
          <MatchBanner />
        ) : trade.ic.execs && trade.ic.execs.length > 0 ? (
          <OrderExecBreakdown execs={trade.ic.execs} leftLabel="IB" rightLabel="PC" attrFields={trade.ic.fields} />
        ) : (
          <CompareGrid fields={trade.ic.fields} leftLabel="IB" rightLabel="PC" />
        )}
      </div>

      <div className="mt-3.5 flex flex-none flex-wrap gap-[9px] border-t border-outline-variant pt-3.5">
        {/* View/Edit Gate Function */}
        <Button variant="secondary" icon={UserRound} className="min-w-0 flex-1 px-2.5 py-[9px]">Assign</Button>
        {/* View/Edit Gate Function */}
        <Button variant="secondary" icon={MessageSquare} className="min-w-0 flex-1 px-2.5 py-[9px]">Comment</Button>
        {/* View/Edit Gate Function */}
        <Button variant="secondary" icon={ArrowUpRight} className="min-w-0 flex-1 px-2.5 py-[9px]">Escalate</Button>
        {/* View/Edit Gate Function */}
        <Button icon={ShieldAlert} className="min-w-0 flex-1 px-2.5 py-[9px]">Raise</Button>
      </div>
    </div>
  );
}

/* ---- settlement tab — ported from MoboRecon.jsx's SettlementPanel.
   `loadSettlement()` already returns pre-formatted amounts, so there's
   nothing left to compute here, just render. */
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

export default function TradeReconciliationPage() {
  const { settleDay, trades } = loadReconciliation();
  const settlementRows = loadSettlement();

  const [tab, setTab] = useState<"recon" | "settle">("recon");
  const [sel, setSel] = useState<string | null>(null);
  const toggle = (id: string) => setSel((s) => (s === id ? null : id));
  const isSel = !!sel;
  const selTrade = sel ? trades.find((t) => t.id === sel) ?? null : null;

  const groups = buildGroups(trades);
  const totalBrk = groups.length;
  const qtyCat = countCat(groups, "qty");
  const priceCat = countCat(groups, "price");
  const missCat = countCat(groups, "miss");
  const settleCat = countCat(groups, "settle");
  const settlePending = settlementRows.filter((r) => r.status === "Pending").length;

  const matchedN = trades.length - totalBrk;
  const matchPct = trades.length ? Math.round((matchedN / trades.length) * 100) : 100;
  const brkPct = trades.length ? Math.round(((qtyCat + priceCat) / trades.length) * 100) : 0;
  const missPct = Math.max(0, 100 - matchPct - brkPct);
  const isClean = totalBrk === 0;

  const flatRows = buildFlatRows(trades, settleDay);

  return (
    <div className="w-full">
      <div className="mb-5">
        <PageHeader
          title="Trade Reconciliation"
          subtitle={`Three-system match · CRM ↔ IB ↔ Portfolio Commander · ${settleDay}`}
          actions={
            <>
              <Button variant="secondary" icon={Calendar} iconRight={ChevronDown}>{settleDay}</Button>
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

          <SegBar ok={matchPct} warn={brkPct} bad={missPct} />

          {isClean ? (
            <div
              className="mt-[22px] flex flex-col items-center gap-3.5 rounded-2xl border-[1.5px] px-6 py-14 text-center"
              style={{ background: "rgba(47,122,71,0.04)", borderColor: "rgba(47,122,71,0.15)" }}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "#e3f1e7", color: "#2f7a47" }}>
                <Check size={24} strokeWidth={2} />
              </span>
              <div>
                <div className="mb-1 text-[18px] font-bold text-on-surface">All {trades.length} trades reconciled</div>
                <div className="text-[14px] text-secondary">No breaks across CRM, IB, and Portfolio Commander for {settleDay}.</div>
              </div>
            </div>
          ) : (
            <div className={`mt-[22px] grid items-start gap-[18px] ${isSel ? "grid-cols-[minmax(0,1fr)_400px]" : "grid-cols-1"}`}>
              <div className="min-w-0 overflow-hidden">
                <div className="mb-[11px] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[15px] font-bold text-on-surface">Unreconciled records</span>
                  <span className="text-[12.5px] text-secondary">every row from CRM, IB, and Portfolio Commander for each broken trade</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-lowest shadow-card">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
                      <thead>
                        <tr>
                          {TABLE_HEAD.map((h, i) => (
                            <th
                              key={h}
                              className={`whitespace-nowrap bg-surface-low px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary ${i === 5 || i === 6 ? "text-right" : "text-left"}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {flatRows.map((r, ri) => (
                          <FlatRowTr key={ri} r={r} ri={ri} active={sel === r.tradeId} onClick={() => toggle(r.tradeId)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {isSel && selTrade && (
                <div className="sticky top-4 min-w-0">
                  <TradeDetail trade={selTrade} onClose={() => setSel(null)} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
