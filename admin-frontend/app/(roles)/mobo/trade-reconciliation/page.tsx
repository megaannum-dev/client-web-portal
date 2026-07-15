"use client";

/* ============================================================
   MOBO Trade Reconciliation — FLOW VIEW
   Three-row flow: AlgoTrade Orders -> IB Client Allocations -> CRM Portfolio.
   Click any card -> a side detail panel slides in; cross-layer
   highlighting shows the flow relationship for a selected order's model.

   Ported from the design handoff (mobo/mobo-app/MoboRecon.jsx), replacing
   the old two-panel triage screen. The triage data model/seam (`lib/mobo/
   types.ts` + `lib/mobo/reconciliation.ts`) is untouched — recon-overview
   and daily-exception-report still depend on it. This page uses the new,
   separate flow model (`lib/mobo/flow-types.ts` + `lib/mobo/
   reconciliation-flow.ts` + `lib/mock/mobo-flow-data.ts`).

   PANEL-HEIGHT FIX (vs. the prototype): the prototype capped the side
   detail panel to two different, unrelated `calc(100vh - Npx)` constants
   (one on the sticky wrapper, a different one inside FlowDetail) with no
   connection to the actual rendered height of the three flow rows — so
   the panel visibly stopped short of the row column's real bottom edge
   once a row grew taller (e.g. a client with more model allocations).
   Here the flow column's height is measured (ResizeObserver) and the
   detail wrapper is sized to `min(measured flow height, viewport budget)`
   via a single CSS `min()` — the two always agree, and FlowDetail (which
   now renders at `h-full`) just fills whatever height it's given.
   ============================================================ */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BarChart3, Users, Database, Link2 } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { MetricStat } from "@/components/mobo/Shared";
import { OrderCard, AllocCard, PortfolioCard, FlowRow, FlowConnector } from "@/components/mobo/recon-flow/Cards";
import { FlowDetail } from "@/components/mobo/recon-flow/Detail";
import { useReconciliationFlow } from "@/hooks/api/useReconciliationFlow";

type Sel = { type: "order" | "alloc" | "port"; id: string } | null;

const DW = 380; // detail panel width
const GAP = 18;
const DETAIL_TOP = 16; // sticky offset
const DETAIL_BOTTOM_GAP = 24; // breathing room below the viewport-capped panel

export default function TradeReconciliationPage() {
  const { data: view, loading, error, refetch } = useReconciliationFlow();

  // Hooks below must stay unconditional (rules-of-hooks) — the loading/error/
  // !view early returns are placed after every hook call, before anything
  // that reads `view`. No hook logic changes vs. before the FE-5 cutover.
  const [sel, setSel] = useState<Sel>(null);
  const toggle = (type: NonNullable<Sel>["type"], id: string) =>
    setSel((prev) => (prev && prev.type === type && prev.id === id ? null : { type, id }));

  /* grid width (for the flow-column <-> detail-panel column animation) */
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridW, setGridW] = useState(0);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const measure = () => { if (gridRef.current) setGridW(gridRef.current.clientWidth); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => {
    if (gridW > 0 && !ready) {
      const id = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [gridW, ready]);

  /* actual rendered height of the 3-row flow column — the detail panel
     tracks this (capped by viewport budget) so the two always align */
  const flowColRef = useRef<HTMLDivElement>(null);
  const [flowH, setFlowH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = flowColRef.current;
    if (!el) return;
    const measure = () => setFlowH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (loading && !view) {
    return <PageHeader title="Trade Reconciliation" />;
  }
  if (error) {
    return (
      <div role="alert">
        <Button onClick={refetch}>Retry</Button>
      </div>
    );
  }
  if (!view) return null;

  const { orders, allocs, ports, counts } = view;

  const selOrder = sel?.type === "order" ? orders.find((o) => o.id === sel.id) ?? null : null;
  const selAlloc = sel?.type === "alloc" ? allocs.find((a) => a.cid === sel.id) ?? null : null;
  const selPort = sel?.type === "port" ? ports.find((p) => p.cid === sel.id) ?? null : null;
  const isSel = !!(selOrder || selAlloc || selPort);
  const isCompact = isSel;

  /* cross-layer highlighting — selecting an order highlights every
     client card downstream that shares its model */
  const hlModel = selOrder?.m ?? null;

  const flowW = isSel ? Math.max(0, gridW - GAP - DW) : gridW;
  const cols = isSel ? `${flowW}px ${DW}px` : `${gridW}px`;

  return (
    <div className="w-full">
      <div className="mb-5">
        <PageHeader
          title="Trade Reconciliation"
          subtitle={`Three-way flow · AlgoTrade → IB Allocations → CRM Portfolio · ${view.settleDay}`}
          actions={<Button icon={Link2}>Auto-match</Button>}
        />
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3.5">
        <MetricStat
          label="Algo ↔ IB"
          value={counts.algIbBrk}
          sub={counts.algIbBrk ? `${counts.algIbBrk} break${counts.algIbBrk !== 1 ? "s" : ""}` : "all matched"}
          tone={counts.algIbBrk ? "warn" : "ok"}
        />
        <MetricStat
          label="IB ↔ CRM"
          value={counts.ibCrmBrk}
          sub={counts.ibCrmBrk ? `${counts.ibCrmBrk} break${counts.ibCrmBrk !== 1 ? "s" : ""}` : "all matched"}
          tone={counts.ibCrmBrk ? "warn" : "ok"}
        />
        <MetricStat
          label="Algo ↔ CRM"
          value={counts.algCrmBrk}
          sub={counts.algCrmBrk ? `${counts.algCrmBrk} break${counts.algCrmBrk !== 1 ? "s" : ""}` : "all matched"}
          tone={counts.algCrmBrk ? "warn" : "ok"}
        />
        <MetricStat label="Total Breaks" value={counts.totalBrk} tone={counts.totalBrk ? "bad" : "ok"} />
      </div>

      <div
        ref={gridRef}
        className="grid items-stretch"
        style={{
          gridTemplateColumns: cols,
          columnGap: GAP,
          transition: ready ? "grid-template-columns 340ms cubic-bezier(.4,0,.2,1)" : "none",
        }}
      >
        {/* flow area */}
        <div ref={flowColRef} className="flex min-w-0 flex-col gap-0">
          <FlowRow label="AlgoTrade" icon={BarChart3} sub={`Orders + executions · ${view.algoTotal}`} labelMode="inline" hasBreaks={counts.algIbBrk > 0}>
            {orders.map((o) => (
              <OrderCard
                key={o.id}
                o={o}
                compact={isCompact}
                sel={sel?.type === "order" && sel.id === o.id}
                hl={false}
                onClick={() => toggle("order", o.id)}
              />
            ))}
          </FlowRow>

          <FlowConnector count={4} />

          <FlowRow label="IB Clients" icon={Users} sub={`Allocation per client · ${view.ibTotal}`} labelMode="inline" hasBreaks={counts.ibCrmBrk > 0}>
            {allocs.map((a) => (
              <AllocCard
                key={a.cid}
                a={a}
                compact={isCompact}
                sel={sel?.type === "alloc" && sel.id === a.cid}
                hl={(!!hlModel && a.models.some((ma) => ma.m === hlModel)) || (sel?.type === "port" && sel.id === a.cid)}
                onClick={() => toggle("alloc", a.cid)}
              />
            ))}
          </FlowRow>

          <FlowConnector count={4} />

          <FlowRow label="CRM" icon={Database} sub={`Post-trade portfolio · ${view.crmTotal}`} labelMode="inline" hasBreaks={counts.algCrmBrk > 0}>
            {ports.map((p) => {
              const ownAlloc = allocs.find((a) => a.cid === p.cid);
              return (
                <PortfolioCard
                  key={p.cid}
                  p={p}
                  compact={isCompact}
                  sel={sel?.type === "port" && sel.id === p.cid}
                  hl={(!!hlModel && !!ownAlloc?.models.some((ma) => ma.m === hlModel)) || (sel?.type === "alloc" && sel.id === p.cid)}
                  onClick={() => toggle("port", p.cid)}
                />
              );
            })}
          </FlowRow>
        </div>

        {/* detail panel — height tracks the flow column (capped to viewport) */}
        {isSel && (
          <div
            className="min-w-0"
            style={{
              position: "sticky",
              top: DETAIL_TOP,
              height: flowH != null ? `min(${flowH}px, calc(100vh - ${DETAIL_TOP + DETAIL_BOTTOM_GAP}px))` : undefined,
            }}
          >
            {selOrder && <FlowDetail type="order" item={selOrder} onClose={() => setSel(null)} />}
            {selAlloc && <FlowDetail type="alloc" item={selAlloc} onClose={() => setSel(null)} />}
            {selPort && <FlowDetail type="port" item={selPort} onClose={() => setSel(null)} />}
          </div>
        )}
      </div>
    </div>
  );
}
