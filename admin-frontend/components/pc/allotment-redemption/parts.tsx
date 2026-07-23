"use client";

// Shared building blocks for the two Allotment/Redemption detail panels,
// ported faithfully from the prototype (ArDetailShell / ArFact / ArNotice /
// arLabel).

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";

/** Uppercase micro-label (prototype `arLabel`). */
export const arLabelCls =
  "text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";

/** Slide-in detail shell — floating card anchored to the page's right edge.
    Portals into DashboardShell's #content-overlay-root (same pattern as
    components/rm/Shared.tsx Modal) so the panel stays pinned to the visible
    viewport instead of drifting with this page's own (possibly tall,
    scrollable) content wrapper. */
export function ArDetailShell({
  eyebrow, title, meta, statusSlot, onClose, children,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  statusSlot: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const [root, setRoot] = useState<Element | null>(null);
  useEffect(() => setRoot(document.getElementById("content-overlay-root")), []);
  if (!root) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        className="pointer-events-auto absolute inset-0 z-[8]"
        style={{ background: "rgba(40,38,34,0.18)" }}
      />
      <div
        className="pointer-events-auto absolute bottom-[18px] right-[18px] top-[18px] z-[9] flex w-[432px] flex-col overflow-hidden rounded-[18px] border border-outline-variant bg-surface-lowest shadow-overlay"
        style={{ maxWidth: "calc(100% - 36px)" }}
      >
        <div className="flex-none border-b border-outline-variant px-[22px] pb-4 pt-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={`${arLabelCls} mb-1`}>{eyebrow}</div>
              <div className="text-[19px] font-bold tracking-[-0.01em]">{title}</div>
              <div className="mt-1 text-[13px] text-secondary">{meta}</div>
            </div>
            <div className="flex flex-none items-center gap-2.5">
              {statusSlot}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex cursor-pointer p-[3px] text-secondary"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-[22px] py-5">{children}</div>
      </div>
    </>,
    root,
  );
}

/** Labelled fact box. `span` stretches full width and enlarges the value. */
export function ArFact({
  label, value, span,
}: {
  label: ReactNode;
  value: ReactNode;
  span?: boolean;
}) {
  return (
    <div
      className="rounded-[10px] bg-surface-low px-[13px] py-[11px]"
      style={span ? { gridColumn: "1 / -1" } : undefined}
    >
      <div className={arLabelCls}>{label}</div>
      <div
        className={`mt-1.5 font-bold tabular-nums text-on-surface ${span ? "text-[18px]" : "text-[16px]"}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Inline notice banner used inside the redemption detail panel. */
export function ArNotice({
  tone, icon: Icon, children,
}: {
  tone: "info" | "bad" | "warn";
  icon: LucideIcon;
  children: ReactNode;
}) {
  const tones = {
    info: { bg: "#eef2f7", fg: "#29303c" },
    bad: { bg: "#ffeceb", fg: "#93000a" },
    warn: { bg: "#FDF4E7", fg: "#994700" }, // fg = --color-surface-tint (no CSS alias)
  }[tone];
  return (
    <div
      className="flex gap-2.5 rounded-[10px] px-3.5 py-3 text-[13px] leading-[1.55]"
      style={{ background: tones.bg, color: tones.fg }}
    >
      <Icon size={16} strokeWidth={2} className="mt-px flex-none" />
      <div>{children}</div>
    </div>
  );
}
