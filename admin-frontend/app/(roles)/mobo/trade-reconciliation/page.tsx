"use client";

/* ============================================================
   MOBO Trade Reconciliation — NESTED TRADE TREE + TABS
   Ported from the design handoff (mobo/mobo-app/MoboRecon.jsx).

   Tab 1 "Three-System Reconciliation" — an exception bento -> a
   segmented progress bar -> ONE spreadsheet of the day's trades,
   nested Trade -> Order -> Execution and expandable to any of the
   three levels.

   Tab 2 "Master ↔ Client Settlement" — a simple settlement table.

   DATA: `GET /api/mobo/executions` via `useExecutions`. It returns a
   TREE (`trades`), not a row list: a Trade spans CRM + IB + Portfolio
   Commander (its key is account + descrpt + trade date + side) and the
   Orders beneath it stay system-scoped. `lib/mobo/executions.ts::
   mapExecutions` folds that into pre-formatted `ReconNode`s, so this
   page does no number or date formatting of its own.

   The reconciler annotates the tree in place: `breaks` names the fields
   a node disagrees on, and a record a system does NOT have is
   materialized as a `missing` placeholder with null economics so the
   gap renders where it belongs instead of being a number in a summary.

   A degraded source (e.g. IB unconfigured) still returns HTTP 200 with
   that source's rows simply absent, so `data.warnings` is surfaced as a
   notice above the table — otherwise a partial day would look identical
   to a complete one.

   The Settlement tab reads `loadSettlement()`, which is EMPTY — its
   mock was deleted and no settlement source is wired yet.
   ============================================================ */

import { useCallback, useMemo, useRef, useState } from "react";
import { Download, Clock, Check, Database, Users, AlertCircle } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MetricStat, SegBar } from "@/components/mobo/Shared";
import { TabBar } from "@/components/mobo/TabBar";
import { DateControl } from "@/components/ui/DateControl";
import { ExceptionBento } from "@/components/mobo/recon/ExceptionBento";
import { ReconGrid } from "@/components/mobo/recon/ReconGrid";
import { useExecutions } from "@/hooks/api/useExecutions";
import { loadSettlement, type SettlementRow } from "@/lib/mobo/commissions";
import { fmtDayLabel, mapExecutions } from "@/lib/mobo/executions";
import TradeReconciliationSkeleton from "./Skeleton";

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

export default function TradeReconciliationPage() {
  const [day, setDay] = useState<string | undefined>(undefined);
  const { data, loading, error } = useExecutions(day);
  const settlementRows = loadSettlement();

  const [tab, setTab] = useState<"recon" | "settle">("recon");

  const trades = useMemo(() => mapExecutions(data), [data]);
  const dayLabel = fmtDayLabel(data?.day ?? null);
  // `data.days` is already "YYYY-MM-DD" — exactly what DateControl speaks — so
  // it maps straight through with no token bridging.
  const markedDates = useMemo(() => new Set(data?.days ?? []), [data?.days]);

  // The grid owns search/filter/sort/expansion, so only it knows what is on
  // screen. It hands the export closure up here; the header button fires it.
  const exportRef = useRef<(() => void) | null>(null);
  const [canExport, setCanExport] = useState(false);
  const onExportChange = useCallback((run: (() => void) | null) => {
    exportRef.current = run;
    setCanExport(run != null);
  }, []);

  // Break counts are per TRADE, and the rolled-up flags mean a trade still
  // reads as broken when only a nested fill disagrees.
  const brokenN = trades.filter((t) => t.hasBreak || t.hasMissing).length;
  const missingN = trades.filter((t) => t.hasMissing).length;
  const breakN = brokenN - missingN;
  const total = trades.length || 1;
  const bad = Math.round((missingN / total) * 100);
  const warn = Math.round((breakN / total) * 100);
  const ok = 100 - bad - warn; // absorbs the rounding so the bar always fills

  const settlePending = settlementRows.filter((r) => r.status === "Pending").length;

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
                markedDates={markedDates}
                onPickDate={setDay}
                onPickRange={() => { /* range mode unused here — one day at a time */ }}
              />
              <Button
                variant="secondary"
                icon={Download}
                disabled={tab !== "recon" || !canExport}
                onClick={() => exportRef.current?.()}
              >
                Export
              </Button>
            </>
          }
        />
      </div>

      <TabBar
        tabs={[
          { key: "recon", label: "Three-System Reconciliation", badge: brokenN || undefined, tone: brokenN ? "warm" : "active" },
          { key: "settle", label: "Master ↔ Client Settlement", badge: settlePending || undefined, tone: settlePending ? "warm" : "active" },
        ]}
        active={tab}
        onChange={(k) => setTab(k as "recon" | "settle")}
      />

      {tab === "settle" ? (
        <SettlementPanel rows={settlementRows} />
      ) : (
        <>
          <ExceptionBento trades={trades} dayLabel={dayLabel} />

          <SegBar ok={ok} warn={warn} bad={bad} />

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
            <div className="mb-[11px] flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-bold text-on-surface">
                {brokenN ? "Unreconciled records" : "Daily records"}
              </span>
              <span className="text-[12.5px] text-secondary">
                every trade from CRM, IB, and Portfolio Commander for {dayLabel} · expand to orders and fills
              </span>
            </div>
            <ReconGrid
              trades={trades}
              day={data?.day ?? null}
              error={error}
              loading={loading}
              onExportChange={onExportChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
