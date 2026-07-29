"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { X } from "@/lib/icons";
import type { EomReport } from "@/lib/mock/eom-reports";

export function CommentModal({
  report, value, onSave, onClose, readOnly,
}: {
  report: EomReport;
  value: string | undefined;
  onSave: (text: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? "");

  const [root, setRoot] = useState<Element | null>(null);
  useEffect(() => setRoot(document.getElementById("content-overlay-root")), []);
  if (!root) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        className="pointer-events-auto absolute inset-0 z-[12]"
        style={{ background: "rgba(20,18,16,.35)", backdropFilter: "blur(2px)" }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute left-1/2 top-1/2 z-[13] w-[520px] max-w-full rounded-lg border border-outline-variant bg-surface-lowest p-[26px] shadow-overlay"
        style={{ transform: "translate(-50%, -50%)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-[20px] font-semibold text-on-surface">
            {readOnly ? "Comment" : value ? "Edit comment" : "Add comment"}
          </div>
          {readOnly && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex cursor-pointer p-[3px] text-secondary"
            >
              <X size={18} strokeWidth={2} />
            </button>
          )}
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
          readOnly={readOnly}
          rows={5}
          autoFocus
          placeholder="Note anything the desk should know about this report…"
          className={clsx(
            "box-border w-full resize-y rounded border border-outline-variant px-3 py-2.5 text-[14px] leading-[1.55] text-on-surface outline-none",
            readOnly && "bg-surface-container"
          )}
        />
        {/* View/Edit Gate Function */}
        {!readOnly && (
          <div className="mt-5 flex justify-end gap-2.5">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(draft.trim())}>Save</Button>
          </div>
        )}
      </div>
    </>,
    root,
  );
}
