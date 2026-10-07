"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, History, Search, UserRound, X } from "@/lib/icons";
import type { ChatDocumentSender } from "@/lib/api/chat";
import { DateControl } from "@/components/ui/DateControl";
import { INITIAL_UI, fmtShared, type CorrespondentsUi } from "./toQuery";

// Visual order = prototype's [Recent, Received, Sent] under row-reverse.
const VIEWS: { id: CorrespondentsUi["view"]; label: string; icon: LucideIcon }[] = [
  { id: "out", label: "Sent", icon: ArrowUpRight },
  { id: "in", label: "Received", icon: ArrowDownLeft },
  { id: "all", label: "Recent", icon: History },
];

const NO_MARKS = new Set<string>(); // no per-day data source
const ROW = "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] hover:bg-surface-container";

function Pill({ icon: Icon, label, value, active, width, onClear, children }: {
  icon: LucideIcon; label: string; value: string | null; active: boolean; width: string; onClear: () => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "inline-flex items-center gap-2 rounded-full border py-[7px] pl-3.5 pr-3 text-[13px] font-semibold transition-all duration-150",
          active || open ? "border-primary" : "border-outline-variant",
          active ? "bg-primary-fixed text-primary" : "bg-white text-secondary hover:bg-surface-low",
        )}
      >
        <Icon size={15} strokeWidth={2} />
        <span>{label}{value && <b>: {value}</b>}</span>
        {active ? (
          <span
            role="button"
            aria-label={`Clear ${label}`}
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="inline-flex"
          >
            <X size={14} strokeWidth={2} />
          </span>
        ) : (
          <ChevronDown size={14} strokeWidth={2} />
        )}
      </button>
      {open && (
        <div className={clsx("absolute left-0 top-full z-40 pt-1.5", width)}>
          <div className="rounded-md border border-outline-variant bg-white p-1.5 shadow-overlay">{children}</div>
        </div>
      )}
    </div>
  );
}

export function CorrespondentsToolbar({
  ui, setUi, senders, meUid,
}: {
  ui: CorrespondentsUi;
  setUi: (patch: Partial<CorrespondentsUi>) => void;
  senders: ChatDocumentSender[];
  meUid: string | null;
}) {
  const [senderQ, setSenderQ] = useState("");
  const needle = senderQ.toLowerCase();
  const sorted = [...senders].sort((a, b) =>
    Number(b.uid === meUid) - Number(a.uid === meUid) || (a.name ?? "").localeCompare(b.name ?? ""));
  const shown = sorted.filter((s) => [s.name, s.client_name].filter(Boolean).join(" ").toLowerCase().includes(needle));

  const dateActive = !!(ui.from || ui.to);
  const dirty = ui.view !== "all" || dateActive || ui.senders.length > 0 || !!ui.q;
  const f = (d: string) => fmtShared(`${d}T12:00:00`);
  const dateLabel = !dateActive ? "Any time" : ui.from === ui.to ? f(ui.from) : `${f(ui.from)} – ${f(ui.to)}`;
  const picked = senders.find((s) => s.uid === ui.senders[0]);
  const senderValue = ui.senders.length === 0 ? null
    : ui.senders.length === 1 && picked ? (picked.uid === meUid ? "You" : picked.name ?? picked.uid) : `${ui.senders.length} selected`;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-5 py-3.5">
      <div className="flex gap-3">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setUi({ view: v.id })}
            className={clsx(
              "inline-flex items-center gap-[7px] rounded-full border px-3.5 py-[7px] text-[13px] font-semibold transition-colors",
              ui.view === v.id ? "border-primary bg-primary text-white" : "border-outline-variant bg-white text-secondary",
            )}
          >
            <v.icon size={15} strokeWidth={2} />
            {v.label}
          </button>
        ))}
      </div>
      <span className="mx-1.5 h-[22px] w-px bg-outline-variant" />

      <DateControl
        dateLabel={dateLabel}
        markedDates={NO_MARKS}
        disableWeekends={false}
        onPickDate={(d) => setUi({ from: d, to: d })}
        onPickRange={(from, to) => setUi({ from, to })}
        onClear={() => setUi({ from: "", to: "" })}
        triggerClassName={clsx(
          "inline-flex items-center gap-2 rounded-full border py-[7px] pl-3.5 pr-3.5 text-[13px] font-semibold transition-all duration-150",
          dateActive ? "border-primary bg-primary-fixed text-primary" : "border-outline-variant bg-white text-secondary hover:bg-surface-low",
        )}
      />

      <Pill icon={UserRound} label="Sender" value={senderValue} active={ui.senders.length > 0} width="w-[280px]"
        onClear={() => setUi({ senders: [] })}>
        <label className="mx-0.5 mb-1.5 mt-0.5 flex items-center gap-2 rounded border border-outline-variant px-2.5 py-1.5">
          <Search size={14} strokeWidth={2} className="text-secondary" />
          <input
            autoFocus
            value={senderQ}
            onChange={(e) => setSenderQ(e.target.value)}
            placeholder="Find a sender…"
            aria-label="Find a sender"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
        <div className="max-h-[260px] overflow-y-auto">
          {shown.map((s) => {
            const on = ui.senders.includes(s.uid);
            return (
              <button key={s.uid} type="button"
                onClick={() => setUi({ senders: on ? ui.senders.filter((u) => u !== s.uid) : [...ui.senders, s.uid] })}
                className={clsx(ROW, on ? "font-semibold text-on-surface" : "font-medium text-secondary")}>
                <span className={clsx("flex h-4 w-4 flex-none items-center justify-center rounded-[4px] text-white", on ? "bg-primary" : "border-[1.5px] border-outline bg-white")}>
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.uid === meUid ? `You (${s.name ?? s.uid})` : s.name ?? s.uid}</span>
                {s.uid !== meUid && s.client_name && <span className="text-[11px] font-normal text-secondary">{s.client_name}</span>}
              </button>
            );
          })}
          {shown.length === 0 && <div className="py-2 text-center text-[13px] text-secondary">No senders</div>}
        </div>
      </Pill>

      {dirty && (
        <button
          type="button"
          onClick={() => { setSenderQ(""); setUi({ ...INITIAL_UI, sort: ui.sort }); }}
          className="px-1 py-1.5 text-[13px] font-semibold text-primary"
        >
          Clear all
        </button>
      )}

      <label className="ml-auto flex w-[240px] items-center gap-2 rounded border border-outline-variant bg-white px-3 py-[7px] focus-within:border-primary focus-within:shadow-[var(--focus-ring)]">
        <Search size={14} strokeWidth={2} className="text-secondary" />
        <input
          value={ui.q}
          onChange={(e) => setUi({ q: e.target.value })}
          placeholder="Filter by keyword"
          aria-label="Filter by keyword"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
      </label>
    </div>
  );
}
