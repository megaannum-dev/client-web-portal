/* ============================================================
   Reconciliation grid -> CSV export — data layer only.

   Takes the grid's already-derived display list (post filter/search/
   sort) and its visible columns, and renders exactly that —
   no re-filtering, re-sorting, or re-formatting here.
   ============================================================ */

import type { ReconNode, ReconColumn } from "./executions";
import { RECON_TXN_COLS } from "./executions";

export interface ReconCsvMeta {
  day: string | null;
  filtered: boolean;
}

/** Quote a field per RFC 4180 only when it needs it (comma, quote, CR, LF). */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

/** The CSV text for exactly what the grid is showing. */
export function toReconCsv(rows: ReconNode[], columns: ReconColumn[]): string {
  const header = ["Level", ...columns.map((c) => c.head), "State", "Breaks"];
  const lines = [header.map(csvField).join(",")];

  for (const node of rows) {
    const cells = columns.map((col) => {
      // A trade row spans systems, so `system` has no single value.
      if (col.key === "system") return node.system ?? "";
      // A placeholder has no transaction-level value — showing 0 or a stale
      // figure here would be a lie in a file someone reconciles against.
      if (node.missing && RECON_TXN_COLS.includes(col.key)) return "—";
      return String(node[col.key]);
    });
    // Colour on screen becomes an explicit state column in text.
    const state = node.missing ? "Missing" : node.breaks.length > 0 ? "Break" : "Matched";
    // A spreadsheet can't indent to show grain, so it travels as its own column.
    const row = [node.kind, ...cells, state, node.breaks.join(";")];
    lines.push(row.map(csvField).join(","));
  }

  // BOM so Excel reads the file as UTF-8 (em dash, ·, ↔ render correctly).
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** `recon-{day}.csv`, `-filtered` suffix when the export reflects active filters. */
export function reconCsvFilename(meta: ReconCsvMeta): string {
  const day = meta.day ?? "latest";
  return `recon-${day}${meta.filtered ? "-filtered" : ""}.csv`;
}

/** Build the CSV and hand the browser a download. */
export function downloadReconCsv(rows: ReconNode[], columns: ReconColumn[], meta: ReconCsvMeta): void {
  if (typeof document === "undefined") return;
  const csv = toReconCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reconCsvFilename(meta);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
