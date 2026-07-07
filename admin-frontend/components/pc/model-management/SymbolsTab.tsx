"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, X } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { fmtTimestampParts } from "@/lib/pc/format";
import { addSymbol, setSymbolActive, removeSymbol } from "@/server/pc";
import type { Model, SymbolAuditEntry, SymbolBookEntry } from "@/lib/pc/types";

/* ============================================================
   SLIDE-IN DETAIL — Symbols tab
   Book (all symbols, active + inactive) + per-symbol audit trail.
   No weight anywhere (D-4) — symbols are tracked in/out only.
   ============================================================ */

const OP_TONE: Record<SymbolAuditEntry["op"], ChipTone> = {
  added: "active",
  activated: "active",
  deactivated: "neutral",
  removed: "failed",
};

const OP_LABEL: Record<SymbolAuditEntry["op"], string> = {
  added: "Added",
  activated: "Activated",
  deactivated: "Deactivated",
  removed: "Removed",
};

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

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] bg-surface-low px-[13px] py-[11px]">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">{label}</div>
      <div className="mt-1.5 text-[16px] font-bold tabular-nums text-on-surface">{value}</div>
    </div>
  );
}

function SymAuditTrail({ trail }: { trail: SymbolAuditEntry[] }) {
  if (!trail.length) {
    return <div className="py-2.5 text-[12.5px] text-secondary">No audit entries.</div>;
  }
  return (
    <div className="flex flex-col gap-2 py-2.5">
      {trail.map((a, i) => {
        const { date, time } = fmtTimestampParts(a.date);
        return (
          <div key={`${a.symbol}-${a.date}-${i}`} className="flex items-start justify-between gap-3 text-[12.5px]">
            <div>
              <Chip tone={OP_TONE[a.op]}>{OP_LABEL[a.op]}</Chip>
              {a.note && <span className="ml-2 text-secondary">{a.note}</span>}
              <div className="mt-0.5 text-secondary">
                {a.user} · <span className="font-bold text-primary">{a.ver}</span>
              </div>
            </div>
            <div className="shrink-0 text-right text-secondary">
              <div>{date}</div>
              <div>{time}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SymbolBookRow({
  row, open, onToggle, onSetActive, onRemove,
}: {
  row: BookRow;
  open: boolean;
  onToggle: () => void;
  onSetActive: (active: boolean) => void;
  onRemove: () => void;
}) {
  const { entry, trail } = row;
  const latest = trail[0];
  const { date } = latest ? fmtTimestampParts(latest.date) : { date: "—" };
  return (
    <div className="border-t border-outline-variant first:border-t-0">
      <div className="group flex items-center gap-3 px-0.5 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left"
        >
          {open ? (
            <ChevronDown size={14} strokeWidth={2} className="shrink-0 text-secondary" />
          ) : (
            <ChevronRight size={14} strokeWidth={2} className="shrink-0 text-secondary" />
          )}
          <span className="min-w-0 flex-1">
            <div className="text-[13.5px] font-bold tabular-nums text-on-surface">{entry.symbol}</div>
            <div className="mt-0.5 text-[12px] text-secondary">
              {date} · {latest?.user ?? "—"}
            </div>
          </span>
        </button>
        <Chip tone={entry.active ? "active" : "neutral"}>{entry.active ? "Active" : "Inactive"}</Chip>
        <Button
          variant="secondary"
          className="flex-none px-3 py-[7px]"
          onClick={() => onSetActive(!entry.active)}
        >
          {entry.active ? "Disable" : "Enable"}
        </Button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${entry.symbol}`}
          className="flex-none cursor-pointer p-1 text-secondary opacity-0 transition-opacity hover:text-error group-hover:opacity-100"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>
      {open && (
        <div className="pl-[22px] pb-2.5">
          <SymAuditTrail trail={trail} />
        </div>
      )}
    </div>
  );
}

export function SymbolsTab({
  m, initialOpenSym, onMutate,
}: {
  m: Model;
  initialOpenSym?: string | null;
  onMutate: () => void;
}) {
  const [openSym, setOpenSym] = useState<string | null>(initialOpenSym ?? null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = buildSymbolBook(m);
  const activeCount = m.symbolBook.filter((s) => s.active).length;
  const inactiveCount = m.symbolBook.length - activeCount;

  const commitAdd = async () => {
    const s = draft.trim().toUpperCase();
    setDraft("");
    setAdding(false);
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
      <div className="grid grid-cols-3 gap-[11px]">
        <SummaryPill label="Assets" value={m.symbolBook.length} />
        <SummaryPill label="Active" value={activeCount} />
        <SummaryPill label="Inactive" value={inactiveCount} />
      </div>

      <div className="mt-4 flex items-center gap-2 rounded border border-outline-variant bg-white px-3 py-1.5">
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void commitAdd(); }
              if (e.key === "Escape") { setDraft(""); setAdding(false); }
            }}
            onBlur={() => void commitAdd()}
            placeholder="e.g. NVDA"
            className="h-7 w-[140px] rounded border border-outline-variant bg-white px-2 text-[12px] font-bold uppercase text-on-surface outline-none focus:border-primary"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={busy}
            className="cursor-pointer text-[13.5px] text-secondary transition-colors hover:text-primary disabled:cursor-not-allowed"
          >
            + add symbol
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="py-[30px] text-center text-[13.5px] text-secondary">No assets recorded yet.</div>
      ) : (
        <div className="mt-3">
          {rows.map((row) => (
            <SymbolBookRow
              key={row.entry.symbol}
              row={row}
              open={openSym === row.entry.symbol}
              onToggle={() => setOpenSym((cur) => (cur === row.entry.symbol ? null : row.entry.symbol))}
              onSetActive={(active) => void handleSetActive(row.entry.symbol, active)}
              onRemove={() => void handleRemove(row.entry.symbol)}
            />
          ))}
        </div>
      )}
    </>
  );
}
