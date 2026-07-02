"use client";

import { useState } from "react";
import { type AllocationView } from "@/lib/pc/allocation";
import { fmtMoneyShort } from "@/lib/pc/format";
import { type Toggle } from "./ViewToggle";

/* ============================================================
   THE MATRIX  (client rows × active-model columns)
   ============================================================ */
export const TH =
  "border-b-0 bg-surface-low px-4 py-[13px] text-left align-top text-[11px] font-bold uppercase tracking-[0.05em] text-secondary whitespace-nowrap";

export function Matrix({
  data, view, onOpen,
}: {
  data: AllocationView;
  view: Toggle;
  onOpen: (cid: string, mid: string) => void;
}) {
  const cols = data.liveModels;

  const cellPrimary = (units: number, mid: string): string => {
    if (view === "pct") {
      const t = data.colUnits(mid);
      return t ? Math.round((units / t) * 100) + "%" : "0%";
    }
    return units + "×";
  };

  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr>
              <th className={`${TH} sticky left-0 z-[1]`}>Client \ Model</th>
              {cols.map((m) => (
                <th key={m.id} className={`${TH} min-w-[150px]`}>
                  <div className="text-[13.5px] font-bold normal-case tracking-[-0.01em] text-on-surface">
                    {m.name}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold normal-case tracking-[0.02em] text-secondary">
                    {fmtMoneyShort(m.size)} / unit
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.clients.map((c) => (
              <tr key={c.id}>
                <td className="sticky left-0 z-[1] whitespace-nowrap border-t border-outline-variant bg-surface-lowest px-4 py-[13px]">
                  <div className="text-[14px] font-bold text-on-surface">{c.name}</div>
                  <div className="mt-0.5 text-[12px] tabular-nums text-secondary">{c.code}</div>
                </td>
                {cols.map((m) => (
                  <MatrixCell
                    key={m.id}
                    data={data}
                    cid={c.id}
                    mid={m.id}
                    primary={cellPrimary}
                    onOpen={onOpen}
                  />
                ))}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-[1] whitespace-nowrap border-t-2 border-outline bg-surface-low px-4 py-[13px] text-[12.5px] font-bold text-on-surface">
                Total per model
              </td>
              {cols.map((m) => {
                const u = data.colUnits(m.id);
                const f = data.colFund(m.id);
                return (
                  <td key={m.id} className="border-t-2 border-outline bg-surface-low px-4 py-[13px]">
                    <div className="text-[15px] font-bold tabular-nums text-on-surface">
                      {view === "pct" ? "100%" : u + "×"}
                    </div>
                    <div className="mt-[3px] text-[12px] font-semibold tabular-nums text-secondary">
                      {fmtMoneyShort(f)}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MatrixCell({
  data, cid, mid, primary, onOpen,
}: {
  data: AllocationView;
  cid: string;
  mid: string;
  primary: (units: number, mid: string) => string;
  onOpen: (cid: string, mid: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const cell = data.cell(cid, mid);

  if (!cell || !cell.units) {
    return (
      <td className="min-w-[150px] border-t border-outline-variant px-4 py-3 align-top">
        <span className="text-outline">—</span>
      </td>
    );
  }
  return (
    <td
      className="min-w-[150px] cursor-pointer border-t border-outline-variant px-4 py-3 align-top transition-colors"
      style={{ background: hover ? "rgb(var(--color-surface-low))" : "transparent" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(cid, mid)}
    >
      <div className="text-[17px] font-bold tabular-nums tracking-[-0.01em] text-on-surface">
        {primary(cell.units, mid)}
      </div>
      <div className="mt-[3px] text-[12.5px] font-semibold tabular-nums text-secondary">
        {fmtMoneyShort(data.cellFund(cid, mid))}
      </div>
    </td>
  );
}
