"use client";

/* Compliance's ad-hoc "require new documents" request on an ACTIVE client —
   ported from the design prototype's ReprovisionModal (ComplianceReview.jsx).
   Pick the doc_types to re-request, optionally attach a note, POST .../reprovision. */

import { useState } from "react";
import { X, Check, FileText, RefreshCw } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/compliance/Shared";
import type { AdminOnboardingRow } from "@/lib/onboarding/types";

/* Note templates, nothing more — clicking one just fills the textarea. */
const REPRO_REASONS = [
  "Insufficient information at onboarding",
  "Document expired or superseded",
  "Periodic renewal",
  "Ad-hoc compliance check",
];

export function ReprovisionModal({
  o, onCancel, onConfirm,
}: {
  o: AdminOnboardingRow;
  onCancel: () => void;
  onConfirm: (id: string, docTypes: string[], note: string) => void;
}) {
  // Nothing pre-selected: on an already-active client this is a fresh choice, not a
  // reflection of verdicts already given.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const count = picked.size;

  const toggle = (docType: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(docType)) next.delete(docType);
      else next.add(docType);
      return next;
    });

  return (
    <div
      className="absolute inset-0 z-[20] flex items-center justify-center p-6"
      style={{ background: "rgba(30,28,24,0.42)", backdropFilter: "blur(3px)" }}
    >
      <div className="flex max-h-full w-[560px] max-w-full flex-col overflow-hidden rounded-[20px] bg-surface-lowest shadow-overlay">
        <div className="flex justify-between gap-3 border-b border-outline-variant px-6 pb-4 pt-5">
          <div>
            <div className="text-[19px] font-bold tracking-[-0.01em]">Require new documents</div>
            <div className="mt-1 text-[13px] text-secondary">
              Select which previously-approved documents {o.rm} must resubmit. Sends this
              onboarding back to pending review — same impact as a periodic renewal, but ad-hoc.
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="flex h-fit cursor-pointer p-[3px] text-secondary">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-[18px]">
          <SectionLabel>Documents to re-request</SectionLabel>
          <div className="mb-5 flex flex-col gap-1.5">
            {o.documents.map((d) => {
              const on = picked.has(d.doc_type);
              return (
                <button
                  key={d.doc_type}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(d.doc_type)}
                  className="flex cursor-pointer items-center gap-[11px] rounded-[9px] px-[11px] py-[9px] text-left"
                  style={{
                    border: `1px solid ${on ? "var(--primary)" : "var(--outline-variant)"}`,
                    background: on ? "var(--primary-fixed)" : "#fff",
                  }}
                >
                  <span
                    className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] text-white"
                    style={{
                      border: `1px solid ${on ? "var(--primary)" : "var(--outline)"}`,
                      background: on ? "var(--primary)" : "#fff",
                    }}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: on ? "var(--primary)" : "var(--on-surface)" }}>
                    {d.label}
                  </span>
                </button>
              );
            })}
          </div>
          <SectionLabel>Reason</SectionLabel>
          <div className="mb-[18px] flex flex-wrap gap-1.5">
            {REPRO_REASONS.map((r) => {
              // Derived, not stored: the highlight simply stops matching once the
              // officer edits the text — the honest signal that it's no longer that
              // canned reason. Nothing beyond the note is sent.
              const on = note === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setNote(r)}
                  className="cursor-pointer"
                  style={{
                    padding: "6px 12px", borderRadius: 9999, fontSize: 12.5, fontWeight: 600,
                    border: `1px solid ${on ? "var(--primary)" : "var(--outline-variant)"}`,
                    background: on ? "var(--primary-fixed)" : "#fff",
                    color: on ? "var(--primary)" : "var(--secondary)",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <SectionLabel>Note to RM (optional)</SectionLabel>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Fee Schedule needs to reflect the updated 2026 rate table…"
            className="box-border w-full resize-y rounded-[9px] border border-outline-variant px-3 py-2.5 text-[14px] text-on-surface outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-outline-variant px-6 py-3.5">
          <span
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
            style={{ color: count ? "var(--primary)" : "var(--secondary)" }}
          >
            <FileText size={13} strokeWidth={2} />
            {count} document{count === 1 ? "" : "s"} selected
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            {/* The backend requires doc_types to be non-empty (min_length=1). */}
            <Button
              icon={RefreshCw}
              disabled={count === 0}
              onClick={() => onConfirm(o.id, Array.from(picked), note)}
            >
              Send request
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
