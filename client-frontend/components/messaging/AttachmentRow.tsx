// 021 UI-1 — attachment row: the doc button used inside a bubble and in the docs aside
"use client";

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
  fullWidth = false,
  onClick,
}: {
  attachment: ChatAttachment;
  /** pre-formatted meta line, e.g. "1.4 MB · 11:40" or "1.4 MB · shared by Sarah Mitchell" */
  meta: string;
  /** true when the row sits on a primary (own-message) bubble */
  onDark?: boolean;
  /** true in the docs aside, where the row fills its container instead of capping at 260px */
  fullWidth?: boolean;
  /** Download this attachment. Optional so the row stays renderable in a
   *  test with no auth and no network. */
  onClick?: () => void;
}) {
  const Icon = KIND_ICON[attachment.kind] ?? FileText;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-[9px] box-border rounded py-2 px-2.5 text-left transition-colors",
        fullWidth ? "w-full" : "w-[260px] max-w-full",
        onDark
          ? "bg-white/[0.16] border border-white/[0.32] hover:bg-white/[0.26]"
          : "bg-surface-low border border-outline-variant hover:bg-surface-container hover:border-primary/30",
      ].join(" ")}
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        className={onDark ? "text-primary-foreground shrink-0" : "text-primary shrink-0"}
      />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className={[
            "text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap",
            onDark ? "text-primary-foreground" : "text-on-surface",
          ].join(" ")}
        >
          {attachment.name}
        </span>
        <span className={["text-[10.5px]", onDark ? "text-primary-foreground/80" : "text-secondary"].join(" ")}>
          {meta}
        </span>
      </span>
      <Download size={14} strokeWidth={1.75} className={onDark ? "text-primary-foreground shrink-0" : "text-secondary shrink-0"} />
    </button>
  );
}
