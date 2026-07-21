"use client";

/* ============================================================
   MOBO — Post-Trade Allocation page
   Ported from the design handoff (MoboAllocation.jsx). Composes
   the already-built data seam (`lib/mobo/allocation.ts`) and
   components (`StackedBarChart`, `Panels`) into the page's views:
   all models / per model. `EmptyCard`/`"empty"` is kept wired but
   currently unreachable from the UI — reserved for when a real
   not-yet-settled signal exists to drive it.
   ============================================================ */

import { useState } from "react";
import { RefreshCw } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ptaMoney } from "@/lib/mobo/allocation";
import { usePostTradeAllocation, usePostTradeAllocationRuns, usePostTradeAllocationHistory } from "@/hooks/api/usePostTradeAllocation";
import { toast } from "sonner";
import type { PtaModelAllocation } from "@/lib/mobo/types";
import { StackedBarChart } from "@/components/mobo/allocation/StackedBarChart";
import { HistoricalCard } from "@/components/mobo/allocation/HistoricalChart";
import {
  ScopeToggle,
  OrientationToggle,
  ModelRow,
  PerModelDetail,
  EmptyCard,
  DateControl,
} from "@/components/mobo/allocation/Panels";

const CARD = "rounded-2xl border border-outline-variant bg-surface-lowest shadow-card";

type View = "all" | "per" | "range" | "empty";

/* ---- "All models" oversight card: header (title + orientation toggle,
   grand total + date), the stacked bar chart, and an explanatory caption. */
function AllModelsCard({
  models,
  grandTotal,
  settleDay,
  orientation,
  onOrientationChange,
  onSelectModel,
}: {
  models: PtaModelAllocation[];
  grandTotal: number;
  settleDay: string;
  orientation: "vertical" | "horizontal";
  onOrientationChange: (v: "vertical" | "horizontal") => void;
  onSelectModel: (modelId: string) => void;
}) {
  return (
    <section className={`${CARD} flex flex-1 flex-col px-5 pb-5 pt-[18px]`}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[17px] font-semibold text-on-surface">Traded per model</h3>
          <OrientationToggle value={orientation} onChange={onOrientationChange} />
        </div>
        <div className="text-right">
          <div className={`text-[20px] font-bold tabular-nums ${grandTotal < 0 ? "text-error" : "text-on-surface"}`}>
            {ptaMoney(grandTotal)}
          </div>
          <div className="text-[11px] font-semibold text-secondary">total traded · {settleDay}</div>
        </div>
      </div>
      <div className="flex min-h-0 w-full flex-1 items-center">
          <StackedBarChart models={models} orientation={orientation} onSelectModel={onSelectModel} />
      </div>
      <p className="mt-4 text-[12.5px] leading-[1.55] text-secondary">
        Each bar is one model&apos;s money traded that day (label = model total), segmented by the clients it was
        delegated to. <b className="text-on-surface">Hover a segment</b> for the client, its share and amount — or
        click a bar (or switch to <b className="text-on-surface">Per model</b>) for the full pie breakdown.
      </p>
    </section>
  );
}

export default function PostTradeAllocationPage() {
  const [pickedDate, setPickedDate] = useState<string | undefined>(undefined); // undefined = latest
  const { data, loading, sync } = usePostTradeAllocation(pickedDate);
  const { runs } = usePostTradeAllocationRuns();
  const { settleDay, models, grandTotal } = data ?? { settleDay: "", models: [], grandTotal: 0 };

  const handleSync = async () => {
    const result = await sync();
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.empty) {
      toast(`No new trades — checked at ${result.checkedAt ?? "—"} ET`);
    }
  };

  const [view, setView] = useState<View>("all");
  const [modelId, setModelId] = useState<string | undefined>(models[0]?.id);
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">("vertical");

  // range / historical view state
  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);
  const [rangeScope, setRangeScope] = useState<"all" | "per">("all");
  const [rangeModelId, setRangeModelId] = useState<string | undefined>(undefined);
  const { series: historySeries } = usePostTradeAllocationHistory(
    rangeFrom, rangeTo, view === "range" && rangeScope === "per" ? rangeModelId : undefined,
  );

  const scope: "all" | "per" = view === "per" ? "per" : view === "range" ? rangeScope : "all";
  const selectedModel = models.find((m) => m.id === modelId) ?? models[0];

  const subtitle =
    view === "range"
      ? `Historical performance · ${rangeFrom} – ${rangeTo}`
      : view === "per"
      ? "One model's traded amount, split by client"
      : view === "empty"
      ? `No post-trade allocation posted for ${settleDay} yet`
      : `Money traded per model — oversight across all models · ${pickedDate ?? "Latest"}`;

  return (
    <div className="flex min-h-[calc(100vh-9rem)] w-full flex-col">
      <div className="mb-7">
        <PageHeader
          title="Post-Trade Allocation"
          subtitle={subtitle}
          actions={
            <>
              <DateControl
                dateLabel={view === "range" ? `${rangeFrom} – ${rangeTo}` : (pickedDate ?? "Latest")}
                runs={runs}
                onPickDate={(d) => { setPickedDate(d); setView("all"); }}
                onPickRange={(from, to) => { setRangeFrom(from); setRangeTo(to); setView("range"); }}
              />
              <Button icon={RefreshCw} onClick={handleSync} disabled={loading}>
                Sync
              </Button>
              {/* <Button icon={Download} onClick={() => {}}>
                Export
              </Button> */}
            </>
          }
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ScopeToggle
          value={scope}
          onChange={(v) => { if (view === "range") setRangeScope(v); else setView(v); }}
        />
        <span className="text-[13px] text-secondary">
          {scope === "all" ? "bar chart · oversight across all models" : "pie chart · client proportions in one model"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {view === "empty" ? (
          <EmptyCard settleDay={settleDay} />
        ) : view === "range" ? (
          <HistoricalCard
            series={historySeries}
            scope={rangeScope}
            models={models.map((m) => ({ id: m.id, name: m.name, acct: m.acct }))}
            selectedModelId={rangeModelId}
            onModelChange={setRangeModelId}
          />
        ) : scope === "all" ? (
          <AllModelsCard
            models={models}
            grandTotal={grandTotal}
            settleDay={settleDay}
            orientation={orientation}
            onOrientationChange={setOrientation}
            onSelectModel={(mid) => {
              setModelId(mid);
              setView("per");
            }}
          />
        ) : selectedModel ? (
          <div className="grid flex-1 grid-cols-1 items-stretch gap-6 lg:grid-cols-[280px_1fr]">
            <div className="flex flex-col gap-2.5 rounded-[14px] bg-surface-low p-3">
              <div className="flex items-center justify-between px-1 py-0.5">
                <span className="text-[12.5px] font-bold text-on-surface">Models</span>
                <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-surface-container px-1.5 text-[12px] font-bold text-secondary">
                  {models.length}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {models.map((m) => (
                  <ModelRow
                    key={m.id}
                    model={m}
                    active={m.id === modelId}
                    onClick={() => setModelId(m.id)}
                    maxTraded={Math.max(...models.map((mm) => mm.traded))}
                  />
                ))}
              </div>
            </div>
            <PerModelDetail model={selectedModel} settleDay={settleDay} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
