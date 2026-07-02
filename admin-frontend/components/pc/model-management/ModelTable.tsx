"use client";

import { useState } from "react";
import { Eye, Upload, Download } from "@/lib/icons";
import { StatusChip, Ticks } from "@/components/pc/Shared";
import { fmtMoney } from "@/lib/pc/format";
import type { Model } from "@/lib/pc/types";

type Tab = "overview" | "materials" | "changes";

/* ============================================================
   TABLE LAYOUT
   ============================================================ */
export const TH_BASE =
  "bg-surface-low px-3.5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary whitespace-nowrap";

function ModelTr({ m, onOpen, onDownloadLatest }: { m: Model; onOpen: (id: string, tab: Tab) => void; onDownloadLatest: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  const td = `border-t border-outline-variant px-3.5 py-3.5 text-[14px] align-middle ${hover ? "bg-surface-low" : ""}`;
  return (
    <tr
      onClick={() => onOpen(m.id, "overview")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="cursor-pointer"
    >
      <td className={td}>
        <div className="font-bold">{m.name}</div>
        <div className="mt-1"><StatusChip status={m.status} /></div>
      </td>
      <td className={`${td} text-right font-bold tabular-nums`}>{fmtMoney(m.size)}</td>
      <td className={`${td} text-secondary`}>{m.manager}</td>
      <td className={td}><Ticks symbols={m.symbols} /></td>
      <td className={`${td} text-right font-bold tabular-nums`}>{m.mgmt}%</td>
      <td className={`${td} text-right font-bold tabular-nums`}>{m.incentive}%</td>
      <td className={td}>
        <span
          onClick={(e) => { e.stopPropagation(); onOpen(m.id, "materials"); }}
          className="inline-flex cursor-pointer items-center gap-[5px] font-bold text-primary"
        >
          <Eye size={14} strokeWidth={2} />View
        </span>
      </td>
      <td className={`${td} whitespace-nowrap text-right`}>
        {m.status === "draft" ? (
          <span className="inline-flex items-center gap-[5px] font-bold text-primary">
            <Upload size={13} strokeWidth={2} />Upload v1
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDownloadLatest(m.id); }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border-none bg-primary px-[11px] py-1.5 text-[12.5px] font-semibold text-white"
          >
            <Download size={13} strokeWidth={2} />Download {m.version}
          </button>
        )}
      </td>
    </tr>
  );
}

export function ModelTable({
  models, onOpen, onDownloadLatest,
}: {
  models: Model[];
  onOpen: (id: string, tab: Tab) => void;
  onDownloadLatest: (id: string) => void;
}) {
  const headers = ["Model", "Model size", "Manager", "Symbols", "Mgmt %", "Incentive %", "Materials", "Latest"];
  const rightAligned = new Set([1, 4, 5, 7]);
  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={`${TH_BASE} ${rightAligned.has(i) ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => <ModelTr key={m.id} m={m} onOpen={onOpen} onDownloadLatest={onDownloadLatest} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
