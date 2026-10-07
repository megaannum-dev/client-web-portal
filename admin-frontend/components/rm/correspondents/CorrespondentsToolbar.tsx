"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, Search, X } from "@/lib/icons";
import { Checkbox } from "@/components/admin/Shared";
import type { ChatDocumentSender } from "@/lib/api/chat";
import { INITIAL_UI, type CorrespondentsUi, type DatePreset } from "./toQuery";

const VIEWS: { id: CorrespondentsUi["view"]; label: string }[] = [
  { id: "all", label: "Recent" },
  { id: "in", label: "Received" },
  { id: "out", label: "Sent" },
];
const PRESETS: { id: DatePreset; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
  { id: "custom", label: "Custom range" },
];

function Popover({ label, active, children }: { label: string; active: boolean; children: ReactNode }) {
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
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
          active ? "border-primary bg-primary/10 text-primary" : "border-outline-variant bg-surface-lowest text-on-surface hover:bg-surface-container",
        )}
      >
        {label}
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-md border border-outline-variant bg-surface-lowest p-3 shadow-card">
          {children}
        </div>
      )}
    </div>
  );
}

export function CorrespondentsToolbar({
  ui, setUi, senders,
}: {
  ui: CorrespondentsUi;
  setUi: (patch: Partial<CorrespondentsUi>) => void;
  senders: ChatDocumentSender[];
}) {
  const [senderQ, setSenderQ] = useState("");
  const dateLabel = PRESETS.find((p) => p.id === ui.preset)?.label ?? "Date";
  const needle = senderQ.toLowerCase();
  const shown = senders.filter((s) => `${s.name} ${s.client_name}`.toLowerCase().includes(needle));
  const dirty = ui.view !== "all" || ui.preset !== "any" || ui.senders.length > 0 || !!ui.q;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-5 py-3.5">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => setUi({ view: v.id })}
          className={clsx(
            "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
            ui.view === v.id ? "border-primary bg-primary text-primary-foreground" : "border-outline-variant bg-surface-lowest text-secondary hover:bg-surface-container",
          )}
        >
          {v.label}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-outline-variant" />

      <Popover label={ui.preset === "any" ? "Date" : dateLabel} active={ui.preset !== "any"}>
        <div className="flex flex-col gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setUi({ preset: p.id })}
              className={clsx("rounded px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-container", ui.preset === p.id && "bg-surface-container font-semibold")}
            >
              {p.label}
            </button>
          ))}
        </div>
        {ui.preset === "custom" && (
          <div className="mt-2 flex flex-col gap-2 border-t border-outline-variant pt-2.5 text-[12px] text-secondary">
            <label className="flex items-center justify-between gap-2">From
              <input type="date" value={ui.from} max={ui.to || undefined} onChange={(e) => setUi({ from: e.target.value })}
                className="rounded border border-outline-variant px-2 py-1 text-[13px] text-on-surface" />
            </label>
            <label className="flex items-center justify-between gap-2">To
              <input type="date" value={ui.to} min={ui.from || undefined} onChange={(e) => setUi({ to: e.target.value })}
                className="rounded border border-outline-variant px-2 py-1 text-[13px] text-on-surface" />
            </label>
          </div>
        )}
      </Popover>

      <Popover label={ui.senders.length ? `Sender · ${ui.senders.length}` : "Sender"} active={ui.senders.length > 0}>
        <input
          value={senderQ}
          onChange={(e) => setSenderQ(e.target.value)}
          placeholder="Search senders"
          className="mb-2 w-full rounded border border-outline-variant px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
        />
        <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
          {shown.map((s) => (
            <Checkbox
              key={s.uid}
              on={ui.senders.includes(s.uid)}
              onChange={(on) => setUi({ senders: on ? [...ui.senders, s.uid] : ui.senders.filter((u) => u !== s.uid) })}
            >
              {s.name} <span className="text-secondary">· {s.client_name}</span>
            </Checkbox>
          ))}
          {shown.length === 0 && <div className="py-2 text-center text-[13px] text-secondary">No senders</div>}
        </div>
      </Popover>

      {dirty && (
        <button
          type="button"
          onClick={() => { setSenderQ(""); setUi({ ...INITIAL_UI, sort: ui.sort }); }}
          className="text-[13px] font-semibold text-primary hover:underline"
        >
          Clear all
        </button>
      )}

      <label className="ml-auto flex w-full items-center gap-2 rounded-md border border-outline-variant bg-white px-3 py-1.5 focus-within:border-primary sm:w-64">
        <Search size={15} strokeWidth={2} className="text-secondary" />
        <input
          value={ui.q}
          onChange={(e) => setUi({ q: e.target.value })}
          placeholder="Search documents"
          aria-label="Search documents"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
        {ui.q && <button type="button" aria-label="Clear search" onClick={() => setUi({ q: "" })}><X size={14} /></button>}
      </label>
    </div>
  );
}
