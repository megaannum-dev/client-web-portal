"use client";

// 021 UI-3 — chat attachment row: the doc button used inside a message
// bubble (`onDark` on an own/primary bubble) and in the shared-documents
// aside (ChatRoomPanel, UI-4).
//
// ponytail: the design drives the hover state in JS (a `style-hover` prop).
// Tailwind's `hover:` variant reaches the same background + border tones and
// is a much smaller diff — no pointer-tracking state needed.

import clsx from "clsx";
import { FileText, FileSpreadsheet, FileCheck2, Download } from "@/lib/icons";
import type { ChatAttachment } from "./types";

const KIND_ICON = {
  "file-text": FileText,
  sheet: FileSpreadsheet,
  "file-check": FileCheck2,
} as const;

export function AttachmentRow({
  attachment,
  meta,
  onDark = false,
  className,
}: {
  attachment: ChatAttachment;
  /** Pre-formatted trailing line — `"1.4 MB · 11:40"` in a bubble, `"1.4 MB · shared by Sarah Mitchell"` in the docs aside. */
  meta: string;
  onDark?: boolean;
  className?: string;
}) {
  const Icon = KIND_ICON[attachment.kind] ?? FileText;
  return (
    <button
      type="button"
      className={clsx(
        "group flex w-full items-center gap-[9px] rounded px-2.5 py-2 text-left transition-colors duration-150",
        onDark
          ? "border border-white/40 bg-white/[0.18] hover:bg-white/[0.28]"
          : "border border-outline-variant bg-surface-low hover:border-primary/30 hover:bg-surface-container",
        className,
      )}
    >
      <Icon size={16} strokeWidth={1.9} className={clsx("flex-none", onDark ? "text-primary-foreground" : "text-primary")} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={clsx(
            "truncate text-[12px] font-semibold",
            onDark ? "text-primary-foreground" : "text-on-surface",
          )}
        >
          {attachment.name}
        </span>
        <span className={clsx("text-[10.5px]", onDark ? "text-primary-foreground/80" : "text-secondary")}>{meta}</span>
      </span>
      <Download
        size={14}
        strokeWidth={2}
        className={clsx("flex-none", onDark ? "text-primary-foreground" : "text-secondary group-hover:text-primary")}
      />
    </button>
  );
}
