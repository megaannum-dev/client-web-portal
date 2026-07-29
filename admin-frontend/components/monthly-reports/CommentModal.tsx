"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { EomReport } from "@/lib/mock/eom-reports";

export function CommentModal({
  report, value, onSave, onClose,
}: {
  report: EomReport;
  value: string | undefined;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value ?? "");

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(20,18,16,.35)", backdropFilter: "blur(2px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-full rounded-lg border border-outline-variant bg-surface-lowest p-[26px] shadow-overlay"
      >
        <div className="text-[20px] font-semibold text-on-surface">
          {value ? "Edit comment" : "Add comment"}
        </div>
        <div className="mt-1.5 text-body-sm text-secondary">
          {report.name} · {report.period}
        </div>
        <div className="mb-2 mt-[18px] text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
          PM comment
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          autoFocus
          placeholder="Note anything the desk should know about this report…"
          className="box-border w-full resize-y rounded border border-outline-variant px-3 py-2.5 text-[14px] leading-[1.55] text-on-surface outline-none"
        />
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(draft.trim())}>Save</Button>
        </div>
      </div>
    </div>
  );
}
