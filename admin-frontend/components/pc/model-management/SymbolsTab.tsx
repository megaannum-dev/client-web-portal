"use client";

import { useState } from "react";
import { Plus, X } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { fmtTimestampParts } from "@/lib/pc/format";
import { addSymbol, setSymbolActive, removeSymbol } from "@/server/pc";
import type { Model, SymbolAuditEntry, SymbolBookEntry } from "@/lib/pc/types";

/* ============================================================
   SLIDE-IN DETAIL — Symbols tab
   Book (all symbols, active + inactive) + per-symbol audit trail.
   No weight anywhere (D-4) — symbols are tracked in/out only.
   ============================================================ */

const TH = "bg-surface-low px-3 py-[9px] text-[10px] font-bold uppercase tracking-[0.5px] text-secondary text-left";

/** One book row + its trail, sorted active-first then latest trail date desc. */
interface BookRow {
  entry: SymbolBookEntry;
  trail: SymbolAuditEntry[];
}

function buildSymbolBook(m: Model): BookRow[] {
  const rows: BookRow[] = m.symbolBook.map((entry) => ({
    entry,
    trail: m.symbolAudit.filter((a) => a.symbol === entry.symbol), // already newest-first
  }));
  return rows.sort((a, b) => {
    if (a.entry.active !== b.entry.active) return a.entry.active ? -1 : 1;
    const aDate = a.trail[0]?.date ?? "";
    const bDate = b.trail[0]?.date ?? "";
    return aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
  });
}

function SymbolBookRow({
  row, onSetActive, onRemove,
}: {
  row: BookRow;
  onSetActive: (active: boolean) => void;
  onRemove: () => void;
}) {
  const { entry, trail } = row;
  const latest = trail[0];
  const activated = trail.find((a) => a.op === "added" || a.op === "activated");
  const { date: updatedDate } = latest ? fmtTimestampParts(latest.date) : { date: "—" };
  const { date: effectiveDate } = activated ? fmtTimestampParts(activated.date) : { date: "—" };
  const td = "border-t border-outline-variant px-3 py-2.5 text-[12.5px] align-middle";
  return (
    <tr className="group">
      <td className={`${td} font-bold tabular-nums text-on-surface`}>{entry.symbol}</td>
      <td className={`${td} text-secondary`}>{updatedDate}</td>
      <td className={`${td} text-secondary`}>{effectiveDate}</td>
      <td className={td}>
        <button
          type="button"
          onClick={() => onSetActive(!entry.active)}
          title={entry.active ? "Deactivate" : "Activate"}
          className="cursor-pointer border-none bg-transparent p-0"
        >
          <Chip tone={entry.active ? "active" : "neutral"}>{entry.active ? "Active" : "Inactive"}</Chip>
        </button>
      </td>
      <td className={`${td} pr-3 text-secondary`}>
        <div className="flex items-center justify-between gap-2">
          <span>{latest?.user ?? "—"}</span>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${entry.symbol}`}
            title="Remove"
            className="shrink-0 cursor-pointer text-secondary opacity-55 transition-opacity hover:text-error hover:opacity-100"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function SymbolsTab({
  m, onMutate,
}: {
  m: Model;
  onMutate: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = buildSymbolBook(m);
  const activeCount = m.symbolBook.filter((s) => s.active).length;
  const inactiveCount = m.symbolBook.length - activeCount;

  const commitAdd = async () => {
    const s = draft.trim().toUpperCase();
    setDraft("");
    if (!s || busy) return;
    setBusy(true);
    await addSymbol(m.id, s);
    setBusy(false);
    onMutate();
  };

  const handleSetActive = async (symbol: string, active: boolean) => {
    if (busy) return;
    setBusy(true);
    await setSymbolActive(m.id, symbol, active);
    setBusy(false);
    onMutate();
  };

  const handleRemove = async (symbol: string) => {
    if (busy) return;
    setBusy(true);
    await removeSymbol(m.id, symbol);
    setBusy(false);
    onMutate();
  };

  return (
    <>
      <div className="mb-3 text-[12.5px] text-secondary">
        <span className="font-bold text-on-surface">{activeCount}</span> active ·{" "}
        <span className="font-bold text-on-surface">{inactiveCount}</span> inactive
      </div>

      <div className="mb-3.5 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commitAdd(); } }}
          disabled={busy}
          placeholder="Add symbol — e.g. AAPL"
          className="flex-1 rounded border border-outline-variant bg-white px-3 py-[9px] text-[13.5px] text-on-surface outline-none focus:border-primary"
        />
        <Button icon={Plus} disabled={!draft.trim() || busy} onClick={() => void commitAdd()}>
          Add
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="py-[30px] text-center text-[13.5px] text-secondary">No assets recorded yet.</div>
      ) : (
        <div className="overflow-hidden rounded-md border border-outline-variant">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Sym</th>
                <th className={TH}>Last Updated</th>
                <th className={TH}>Effective From</th>
                <th className={TH}>Status</th>
                <th className={`${TH} pr-3`}>Updated by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SymbolBookRow
                  key={row.entry.symbol}
                  row={row}
                  onSetActive={(active) => void handleSetActive(row.entry.symbol, active)}
                  onRemove={() => void handleRemove(row.entry.symbol)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2.5 text-[11.5px] leading-[17px] text-secondary">
        Click the status chip to activate or deactivate. Inactive symbols stay on the record but are excluded from live allocations.
      </p>
    </>
  );
}
